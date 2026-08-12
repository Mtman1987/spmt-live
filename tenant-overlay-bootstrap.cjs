'use strict';

const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const SCENE_WIDTH = 960;
const SCENE_HEIGHT = 540;
const CANONICAL_ORIGIN = String(process.env.SPMT_CANONICAL_ORIGIN || 'https://spmt.live').replace(/\/+$/, '');
const TENANT_ROOT = path.resolve(process.env.SPMT_TENANT_SCENE_ROOT || (process.env.FLY_APP_NAME ? '/data/tenant-scenes' : path.join(process.cwd(), 'data', 'tenant-scenes')));
const DATABASE_PATH = process.env.DATABASE_PATH || (process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME ? '/data/spmt.db' : path.join(process.cwd(), 'spmt.db'));
const WORKER_URL = String(process.env.CLOUD_XBOX_WORKER_URL || 'http://xbox.process.spmt-live.internal:3003').replace(/\/+$/, '');
const WORKER_SECRET = String(process.env.CLOUD_XBOX_WORKER_SECRET || process.env.JWT_SECRET || '').trim();
const PUBLIC_RELAY_SECONDS = 10 * 60;
const MAX_LAYOUT_BYTES = 160_000;

let readDb = null;

function safeJson(res, status, body) {
  return res.status(status).set('cache-control', 'private, no-store').json(body);
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((piece) => {
    const index = piece.indexOf('=');
    if (index < 1) return;
    const key = piece.slice(0, index).trim();
    const value = piece.slice(index + 1).trim();
    if (!key) return;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  });
  return out;
}

function tokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return bearer || cookies.spmt_token || '';
}

function authPayload(req) {
  const secret = String(process.env.JWT_SECRET || '');
  const token = tokenFromRequest(req);
  if (!secret || !token) return null;
  try {
    const payload = jwt.verify(token, secret);
    if (!payload || typeof payload !== 'object') return null;
    const id = payload.id || payload.userId || payload.sub;
    if (!id) return null;
    return { id: String(id), payload };
  } catch {
    return null;
  }
}

function tenantSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(slug)) return '';
  return slug;
}

function outputName(value) {
  return value === 'personal' ? 'personal' : value === 'public' ? 'public' : '';
}

function openReadDb() {
  if (!readDb) readDb = new Database(DATABASE_PATH, { readonly: true, fileMustExist: true });
  return readDb;
}

function lookupUserById(userId) {
  try {
    return openReadDb().prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1').get(userId) || null;
  } catch {
    return null;
  }
}

function lookupUserByTenant(tenant) {
  try {
    return openReadDb().prepare('SELECT id, username FROM users WHERE lower(username) = ? LIMIT 1').get(tenant) || null;
  } catch {
    return null;
  }
}

function resolveAuthenticatedUser(req) {
  const auth = authPayload(req);
  if (!auth) return null;
  const row = lookupUserById(auth.id);
  const username = tenantSlug(row?.username || auth.payload?.username);
  if (!username) return null;
  return { id: auth.id, username };
}

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function normalizeWidget(input, index = 0) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const kind = ['xbox', 'camera', 'screen', 'image', 'embed', 'text', 'alert'].includes(source.kind) ? source.kind : 'embed';
  const fallbackWidth = kind === 'xbox' ? SCENE_WIDTH : kind === 'screen' ? 640 : kind === 'alert' ? 520 : 360;
  const fallbackHeight = kind === 'xbox' ? SCENE_HEIGHT : kind === 'screen' ? 360 : 220;
  const fitDefault = kind === 'camera' ? 'cover' : 'contain';
  const fit = ['contain', 'cover', 'fill'].includes(source.fit) ? source.fit : fitDefault;
  return {
    ...source,
    id: String(source.id || `${kind}-${Date.now()}-${index}`).slice(0, 160),
    title: String(source.title || kind).slice(0, 160),
    kind,
    visible: source.visible !== false,
    locked: Boolean(source.locked),
    interactive: source.interactive !== false,
    x: clamp(source.x, 0, 100, kind === 'xbox' ? 0 : 8),
    y: clamp(source.y, 0, 100, kind === 'xbox' ? 0 : 8),
    width: clamp(source.width, 24, SCENE_WIDTH * 2, fallbackWidth),
    height: clamp(source.height, 24, SCENE_HEIGHT * 2, fallbackHeight),
    opacity: clamp(source.opacity, 0, 1, 1),
    zIndex: clamp(source.zIndex, -100000, 100000, kind === 'xbox' ? 0 : index + 1),
    ...(['xbox', 'camera', 'screen', 'image'].includes(kind) ? { fit } : {}),
  };
}

function emptyLayout() {
  return {
    schemaVersion: 3,
    scene: { width: SCENE_WIDTH, height: SCENE_HEIGHT },
    enabled: true,
    widgets: [],
    workflows: [],
  };
}

function normalizeLayout(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    ...source,
    schemaVersion: Math.max(3, Number(source.schemaVersion) || 0),
    scene: { width: SCENE_WIDTH, height: SCENE_HEIGHT },
    enabled: source.enabled !== false,
    widgets: Array.isArray(source.widgets) ? source.widgets.map(normalizeWidget) : [],
    workflows: Array.isArray(source.workflows) ? source.workflows : [],
  };
}

function scenePath(tenant) {
  return path.join(TENANT_ROOT, `${tenant}.json`);
}

function legacyLayoutForUser(userId) {
  try {
    const row = openReadDb().prepare('SELECT layout FROM overlay_workspaces WHERE user_id = ? LIMIT 1').get(userId);
    if (!row?.layout) return null;
    return JSON.parse(row.layout);
  } catch {
    return null;
  }
}

function newTenantRecord(user, legacyPublic = null) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    tenant: user.username,
    userId: String(user.id),
    outputs: {
      public: normalizeLayout(legacyPublic || emptyLayout()),
      personal: emptyLayout(),
    },
    outputUpdatedAt: { public: now, personal: now },
    createdAt: now,
    updatedAt: now,
  };
}

function writeTenantRecord(record) {
  fs.mkdirSync(TENANT_ROOT, { recursive: true });
  const target = scenePath(record.tenant);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, target);
}

function readTenantRecord(user, create = true) {
  const tenant = tenantSlug(user?.username);
  if (!tenant) return null;
  const target = scenePath(tenant);
  if (fs.existsSync(target)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      return {
        ...parsed,
        schemaVersion: 1,
        tenant,
        userId: String(user.id),
        outputs: {
          public: normalizeLayout(parsed?.outputs?.public || legacyLayoutForUser(user.id) || emptyLayout()),
          personal: normalizeLayout(parsed?.outputs?.personal || emptyLayout()),
        },
        outputUpdatedAt: {
          public: parsed?.outputUpdatedAt?.public || parsed?.updatedAt || new Date().toISOString(),
          personal: parsed?.outputUpdatedAt?.personal || parsed?.updatedAt || new Date().toISOString(),
        },
      };
    } catch {
      if (!create) return null;
    }
  }
  if (!create) return null;
  const record = newTenantRecord({ id: user.id, username: tenant }, legacyLayoutForUser(user.id));
  writeTenantRecord(record);
  return record;
}

function urlsForTenant(tenant) {
  return {
    public: `${CANONICAL_ORIGIN}/tenant/${encodeURIComponent(tenant)}/public`,
    personal: `${CANONICAL_ORIGIN}/tenant/${encodeURIComponent(tenant)}/personal`,
  };
}

function updateOutput(user, output, layout) {
  const normalized = normalizeLayout(layout);
  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_LAYOUT_BYTES) {
    const error = new Error('Overlay layout is too large');
    error.statusCode = 413;
    throw error;
  }
  const record = readTenantRecord(user, true) || newTenantRecord(user);
  const now = new Date().toISOString();
  record.outputs[output] = normalized;
  record.outputUpdatedAt[output] = now;
  record.updatedAt = now;
  writeTenantRecord(record);
  return { record, layout: normalized, updatedAt: now };
}

function requireSameOrigin(req, res, next) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return next();
  try {
    if (new URL(origin).host !== req.headers.host) return safeJson(res, 403, { error: 'Cross-origin scene writes are not allowed' });
  } catch {
    return safeJson(res, 403, { error: 'Invalid request origin' });
  }
  next();
}

function issuePublicRelayToken(tenant) {
  const secret = String(process.env.JWT_SECRET || '');
  if (!secret) return '';
  return jwt.sign({ tenant, token_use: 'public_xbox_relay' }, secret, { expiresIn: PUBLIC_RELAY_SECONDS });
}

function verifyPublicRelay(req) {
  const secret = String(process.env.JWT_SECRET || '');
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!secret || !bearer) return null;
  try {
    const payload = jwt.verify(bearer, secret);
    if (!payload || typeof payload !== 'object' || payload.token_use !== 'public_xbox_relay') return null;
    const tenant = tenantSlug(payload.tenant);
    if (!tenant) return null;
    const user = lookupUserByTenant(tenant);
    if (!user) return null;
    const record = readTenantRecord({ id: user.id, username: tenant }, true);
    if (!record || record.userId !== String(user.id)) return null;
    return { tenant, userId: String(user.id) };
  } catch {
    return null;
  }
}

async function workerRequest(userId, workerPath, timeoutMs = 10000) {
  if (!WORKER_SECRET) throw new Error('Xbox worker secret is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${WORKER_URL}${workerPath}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'x-spmt-worker-secret': WORKER_SECRET,
        'x-spmt-user-id': userId,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function installRoutes(app, express) {
  if (app.__spmtTenantOverlayRoutesInstalled) return;
  app.__spmtTenantOverlayRoutesInstalled = true;
  const jsonBody = express.json({ limit: '180kb' });

  // Compatibility contract: every existing SPMT/Xbox consumer still sees PUBLIC.
  app.get('/api/overlay-workspace', (req, res) => {
    const user = resolveAuthenticatedUser(req);
    if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
    const record = readTenantRecord(user, true);
    return safeJson(res, 200, { layout: record.outputs.public, updatedAt: record.outputUpdatedAt.public });
  });

  app.put('/api/overlay-workspace', requireSameOrigin, jsonBody, (req, res) => {
    const user = resolveAuthenticatedUser(req);
    if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
    const layout = req.body?.layout;
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return safeJson(res, 400, { error: 'A layout object is required' });
    try {
      const saved = updateOutput(user, 'public', layout);
      return safeJson(res, 200, { ok: true, layout: saved.layout, updatedAt: saved.updatedAt, tenant: user.username, output: 'public', urls: urlsForTenant(user.username) });
    } catch (error) {
      return safeJson(res, error.statusCode || 500, { error: error.message || 'Overlay workspace could not be saved' });
    }
  });

  app.get('/api/tenant-scene', (req, res) => {
    const user = resolveAuthenticatedUser(req);
    if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
    const output = outputName(req.query.output || 'public');
    if (!output) return safeJson(res, 400, { error: 'output must be public or personal' });
    const record = readTenantRecord(user, true);
    return safeJson(res, 200, {
      tenant: user.username,
      output,
      layout: record.outputs[output],
      updatedAt: record.outputUpdatedAt[output],
      urls: urlsForTenant(user.username),
      scene: { width: SCENE_WIDTH, height: SCENE_HEIGHT },
    });
  });

  app.put('/api/tenant-scene/:output', requireSameOrigin, jsonBody, (req, res) => {
    const user = resolveAuthenticatedUser(req);
    if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
    const output = outputName(req.params.output);
    if (!output) return safeJson(res, 400, { error: 'output must be public or personal' });
    const layout = req.body?.layout;
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return safeJson(res, 400, { error: 'A layout object is required' });
    try {
      const saved = updateOutput(user, output, layout);
      return safeJson(res, 200, {
        ok: true,
        tenant: user.username,
        output,
        layout: saved.layout,
        updatedAt: saved.updatedAt,
        urls: urlsForTenant(user.username),
      });
    } catch (error) {
      return safeJson(res, error.statusCode || 500, { error: error.message || 'Tenant overlay could not be saved' });
    }
  });

  app.get('/api/tenant/:tenant/public', (req, res) => {
    const tenant = tenantSlug(req.params.tenant);
    if (!tenant) return safeJson(res, 404, { error: 'Tenant not found' });
    const user = lookupUserByTenant(tenant);
    if (!user) return safeJson(res, 404, { error: 'Tenant not found' });
    const record = readTenantRecord({ id: user.id, username: tenant }, true);
    return res.status(200).set('cache-control', 'no-store').json({
      tenant,
      output: 'public',
      layout: record.outputs.public,
      updatedAt: record.outputUpdatedAt.public,
      scene: { width: SCENE_WIDTH, height: SCENE_HEIGHT },
      xboxRelayToken: issuePublicRelayToken(tenant),
    });
  });

  app.get('/api/tenant/:tenant/personal', (req, res) => {
    const user = resolveAuthenticatedUser(req);
    const tenant = tenantSlug(req.params.tenant);
    if (!user || !tenant || user.username !== tenant) return safeJson(res, 401, { error: 'Not authenticated for this tenant' });
    const record = readTenantRecord(user, true);
    return safeJson(res, 200, {
      tenant,
      output: 'personal',
      layout: record.outputs.personal,
      updatedAt: record.outputUpdatedAt.personal,
      scene: { width: SCENE_WIDTH, height: SCENE_HEIGHT },
    });
  });

  app.get('/tenant/:tenant/public', (req, res) => {
    const tenant = tenantSlug(req.params.tenant);
    if (!tenant || !lookupUserByTenant(tenant)) return res.status(404).send('Tenant not found');
    return res.sendFile(path.join(__dirname, 'public', 'tenant-output.html'));
  });

  // The page shell is harmless and transparent; Personal scene DATA stays authenticated.
  // Serving the shell even before auth prevents a host app from ever getting a white/text
  // error surface when a third-party cookie/session is temporarily unavailable.
  app.get('/tenant/:tenant/personal', (req, res) => {
    const tenant = tenantSlug(req.params.tenant);
    if (!tenant || !lookupUserByTenant(tenant)) return res.status(404).send('Tenant not found');
    return res.sendFile(path.join(__dirname, 'public', 'tenant-output.html'));
  });

  app.get('/api/tenant-xbox/status', async (req, res) => {
    const relay = verifyPublicRelay(req);
    if (!relay) return safeJson(res, 401, { error: 'Invalid public Xbox relay token' });
    try {
      const response = await workerRequest(relay.userId, '/v1/status', 8000);
      let payload = null;
      try { payload = await response.json(); } catch {}
      return safeJson(res, response.status, payload || { running: false });
    } catch (error) {
      return safeJson(res, 503, { running: false, error: error?.message || 'Xbox worker unavailable' });
    }
  });

  app.get('/api/tenant-xbox/frame', async (req, res) => {
    const relay = verifyPublicRelay(req);
    if (!relay) return safeJson(res, 401, { error: 'Invalid public Xbox relay token' });
    try {
      const response = await workerRequest(relay.userId, '/v1/frame', 10000);
      if (!response.ok) {
        let payload = null;
        try { payload = await response.json(); } catch {}
        return safeJson(res, response.status, payload || { error: `Xbox frame failed (${response.status})` });
      }
      const frame = Buffer.from(await response.arrayBuffer());
      return res.status(200)
        .set('content-type', 'image/jpeg')
        .set('cache-control', 'private, no-store, max-age=0')
        .set('content-length', String(frame.length))
        .send(frame);
    } catch (error) {
      return safeJson(res, 503, { error: error?.message || 'Xbox worker unavailable' });
    }
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtTenantOverlayFactory) return;

  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtTenantOverlayFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installTenantOverlayBootstrap() {
  patchExpress();
}

module.exports = {
  installTenantOverlayBootstrap,
  _test: {
    SCENE_WIDTH,
    SCENE_HEIGHT,
    tenantSlug,
    outputName,
    normalizeWidget,
    normalizeLayout,
    emptyLayout,
    urlsForTenant,
  },
};
