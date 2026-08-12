'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const CANONICAL_ORIGIN = String(process.env.SPMT_CANONICAL_ORIGIN || 'https://spmt.live').replace(/\/+$/, '');
const TENANT_ROOT = path.resolve(process.env.SPMT_TENANT_SCENE_ROOT || (process.env.FLY_APP_NAME ? '/data/tenant-scenes' : path.join(process.cwd(), 'data', 'tenant-scenes')));
const DATABASE_PATH = process.env.DATABASE_PATH || (process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME ? '/data/spmt.db' : path.join(process.cwd(), 'spmt.db'));
const MAX_EVENTS = 120;
const MAX_EVENT_BYTES = 24_000;
let readDb = null;

function tenantSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(slug) ? slug : '';
}

function parseCookies(header) {
  const out = {};
  for (const piece of String(header || '').split(';')) {
    const index = piece.indexOf('=');
    if (index < 1) continue;
    const key = piece.slice(0, index).trim();
    const raw = piece.slice(index + 1).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(raw); } catch { out[key] = raw; }
  }
  return out;
}

function authPayload(req) {
  const secret = String(process.env.JWT_SECRET || '');
  if (!secret) return null;
  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const token = bearer || cookies.spmt_token || '';
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret);
    if (!payload || typeof payload !== 'object') return null;
    const id = payload.id || payload.userId || payload.sub;
    return id ? { id: String(id), payload } : null;
  } catch {
    return null;
  }
}

function openReadDb() {
  if (!readDb) readDb = new Database(DATABASE_PATH, { readonly: true, fileMustExist: true });
  return readDb;
}

function lookupUserById(userId) {
  try { return openReadDb().prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1').get(userId) || null; } catch { return null; }
}

function lookupUserByTenant(tenant) {
  try { return openReadDb().prepare('SELECT id, username FROM users WHERE lower(username) = ? LIMIT 1').get(tenant) || null; } catch { return null; }
}

function resolveAuthenticatedUser(req) {
  const auth = authPayload(req);
  if (!auth) return null;
  const row = lookupUserById(auth.id);
  const username = tenantSlug(row?.username || auth.payload?.username);
  return username ? { id: String(auth.id), username } : null;
}

function safeJson(res, status, body) {
  return res.status(status).set('cache-control', 'private, no-store').json(body);
}

function ensureRoot() {
  fs.mkdirSync(TENANT_ROOT, { recursive: true });
}

function personalKeyPath(tenant) {
  return path.join(TENANT_ROOT, `${tenant}.personal-render-key`);
}

function eventPath(tenant) {
  return path.join(TENANT_ROOT, `${tenant}.events.json`);
}

function scenePath(tenant) {
  return path.join(TENANT_ROOT, `${tenant}.json`);
}

function personalRenderKey(tenant) {
  ensureRoot();
  const target = personalKeyPath(tenant);
  try {
    const existing = fs.readFileSync(target, 'utf8').trim();
    if (/^[A-Za-z0-9_-]{32,160}$/.test(existing)) return existing;
  } catch {}
  const key = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(target, `${key}\n`, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(target, 0o600); } catch {}
  return key;
}

function renderKeyFromRequest(req) {
  return String(req.headers['x-spmt-render-key'] || '').trim();
}

function timingSafeTextEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function validPersonalRenderKey(tenant, candidate) {
  if (!candidate) return false;
  return timingSafeTextEqual(personalRenderKey(tenant), candidate);
}

function personalRenderUrl(tenant) {
  return `${CANONICAL_ORIGIN}/tenant/${encodeURIComponent(tenant)}/personal#render=${encodeURIComponent(personalRenderKey(tenant))}`;
}

function emptyLayout() {
  return { schemaVersion: 3, scene: { width: 960, height: 540 }, enabled: true, widgets: [], workflows: [] };
}

function personalLayout(tenant) {
  try {
    const record = JSON.parse(fs.readFileSync(scenePath(tenant), 'utf8'));
    return record?.outputs?.personal && typeof record.outputs.personal === 'object' ? record.outputs.personal : emptyLayout();
  } catch {
    return emptyLayout();
  }
}

function readEvents(tenant) {
  try {
    const parsed = JSON.parse(fs.readFileSync(eventPath(tenant), 'utf8'));
    return {
      seq: Math.max(0, Number(parsed?.seq) || 0),
      events: Array.isArray(parsed?.events) ? parsed.events.slice(-MAX_EVENTS) : [],
    };
  } catch {
    return { seq: 0, events: [] };
  }
}

function writeEvents(tenant, store) {
  ensureRoot();
  const target = eventPath(tenant);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ seq: store.seq, events: store.events.slice(-MAX_EVENTS) })}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, target);
  try { fs.chmodSync(target, 0o600); } catch {}
}

function cleanText(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeAlert(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const allowed = new Set(['follow', 'sub', 'resub', 'gift', 'raid', 'cheer', 'custom']);
  const rawType = cleanText(source.eventType || source.kind || source.alertType || 'custom', 32).toLowerCase();
  const payload = {
    eventType: allowed.has(rawType) ? rawType : 'custom',
    user: cleanText(source.user || source.username || source.displayName || 'Someone', 120),
    count: Math.max(0, Math.min(1_000_000, Number(source.count ?? source.viewers ?? source.gifts ?? 1) || 0)),
    amount: Math.max(0, Math.min(100_000_000, Number(source.amount ?? source.bits ?? 0) || 0)),
    months: Math.max(0, Math.min(10_000, Number(source.months ?? 0) || 0)),
    headline: cleanText(source.headline || 'SpaceMountain Alert', 180),
    message: cleanText(source.message || '', 600),
    imageUrl: cleanText(source.imageUrl || '', 1000),
  };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_EVENT_BYTES) throw new Error('Alert payload is too large');
  return payload;
}

function normalizeOutputs(input) {
  const values = Array.isArray(input) ? input : [];
  const outputs = [...new Set(values.filter((value) => value === 'public' || value === 'personal'))];
  return outputs.length ? outputs : ['public', 'personal'];
}

function appendEvent(tenant, payload, outputs, source = 'spmt') {
  const store = readEvents(tenant);
  const seq = store.seq + 1;
  const event = {
    id: seq,
    tenant,
    outputs,
    payload,
    source: cleanText(source, 80) || 'spmt',
    createdAt: new Date().toISOString(),
  };
  store.seq = seq;
  store.events.push(event);
  store.events = store.events.slice(-MAX_EVENTS);
  writeEvents(tenant, store);
  return event;
}

function canReadPersonal(req, tenant) {
  const user = resolveAuthenticatedUser(req);
  if (user?.username === tenant) return true;
  return validPersonalRenderKey(tenant, renderKeyFromRequest(req));
}

function rendererHtml() {
  const target = path.join(__dirname, 'public', 'tenant-output.html');
  let html = fs.readFileSync(target, 'utf8');
  const contractTag = '<script src="/shared/overlay-widget-contract.js"></script>';
  if (!html.includes('/shared/tenant-personal-render-auth.js')) {
    html = html.replace(contractTag, `${contractTag}\n  <script src="/shared/tenant-personal-render-auth.js"></script>`);
  }
  if (!html.includes('/shared/tenant-overlay-live-events.js')) {
    html = html.replace('</body>', '  <script src="/shared/tenant-overlay-live-events.js"></script>\n</body>');
  }
  return html;
}

function installRoutes(app, express) {
  if (app.__spmtTenantOverlayEventRoutesInstalled) return;
  app.__spmtTenantOverlayEventRoutesInstalled = true;
  const jsonBody = express.json({ limit: '32kb' });

  app.get('/api/personal-overlay-launch', (req, res) => {
    const user = resolveAuthenticatedUser(req);
    if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
    return safeJson(res, 200, {
      tenant: user.username,
      output: 'personal',
      url: personalRenderUrl(user.username),
      canonicalUrl: `${CANONICAL_ORIGIN}/tenant/${encodeURIComponent(user.username)}/personal`,
    });
  });

  // This route intentionally precedes the cookie-only tenant route. A Personal
  // renderer may use either the normal SPMT session or the narrow read-only key
  // carried in its URL fragment and sent back only as this custom header.
  app.get('/api/tenant/:tenant/personal', (req, res) => {
    const tenant = tenantSlug(req.params.tenant);
    const user = tenant ? lookupUserByTenant(tenant) : null;
    if (!tenant || !user) return safeJson(res, 404, { error: 'Tenant not found' });
    if (!canReadPersonal(req, tenant)) return safeJson(res, 401, { error: 'Not authenticated for this Personal renderer' });
    return safeJson(res, 200, {
      tenant,
      output: 'personal',
      layout: personalLayout(tenant),
      scene: { width: 960, height: 540 },
    });
  });

  app.post('/api/tenant-overlay-alert', jsonBody, (req, res) => {
    const user = resolveAuthenticatedUser(req);
    if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
    try {
      const payload = normalizeAlert(req.body?.payload || req.body || {});
      const outputs = normalizeOutputs(req.body?.outputs);
      const event = appendEvent(user.username, payload, outputs, req.body?.source || 'spmt');
      return safeJson(res, 201, { ok: true, event });
    } catch (error) {
      return safeJson(res, 400, { error: error?.message || 'Alert event could not be published' });
    }
  });

  app.get('/api/tenant/:tenant/alerts', (req, res) => {
    const tenant = tenantSlug(req.params.tenant);
    const user = tenant ? lookupUserByTenant(tenant) : null;
    if (!tenant || !user) return safeJson(res, 404, { error: 'Tenant not found' });
    const output = req.query.output === 'personal' ? 'personal' : 'public';
    if (output === 'personal' && !canReadPersonal(req, tenant)) return safeJson(res, 401, { error: 'Not authenticated for Personal alerts' });
    const store = readEvents(tenant);
    const hasAfter = req.query.after !== undefined && req.query.after !== null && String(req.query.after) !== '';
    const after = hasAfter ? Math.max(0, Number(req.query.after) || 0) : store.seq;
    const events = store.events.filter((event) => Number(event.id) > after && event.outputs?.includes(output));
    return safeJson(res, 200, { tenant, output, cursor: store.seq, events });
  });

  // Serve the canonical shell before the older sendFile routes so every tenant
  // renderer gets render-key auth and the shared live-event consumer.
  app.get(['/tenant/:tenant/public', '/tenant/:tenant/personal'], (req, res) => {
    const tenant = tenantSlug(req.params.tenant);
    if (!tenant || !lookupUserByTenant(tenant)) return res.status(404).send('Tenant not found');
    return res.status(200)
      .set('cache-control', 'no-store')
      .set('content-type', 'text/html; charset=utf-8')
      .send(rendererHtml());
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtTenantOverlayEventsFactory) return;
  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtTenantOverlayEventsFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installTenantOverlayEventsBootstrap() {
  patchExpress();
}

module.exports = {
  installTenantOverlayEventsBootstrap,
  _test: { tenantSlug, normalizeAlert, normalizeOutputs, personalRenderUrl },
};
