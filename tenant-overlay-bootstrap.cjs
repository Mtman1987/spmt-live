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
const SYSTEM_TENANT = 'spacemountainlive';
const SYSTEM_USER_ID = 'system:spacemountainlive';

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
  return value === 'personal' ? 'personal' : value === 'lounge' ? 'lounge' : value === 'public' ? 'public' : '';
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
    const row = openReadDb().prepare('SELECT id, username FROM users WHERE lower(username) = ? LIMIT 1').get(tenant) || null;
    if (row) return row;
  } catch {}
  return tenant === SYSTEM_TENANT ? { id: SYSTEM_USER_ID, username: SYSTEM_TENANT } : null;
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

function systemTransparentAlertLayout() {
  return {
    ...emptyLayout(),
    template: 'spmt-transparent-alerts-v1',
  };
}
function personalLoungeDebugLayout() {
  return {
  "schemaVersion": 3,
  "template": "community-lounge-system-v2",
  "enabled": true,
  "widgets": [
    {
      "id": "community-lounge-live-spotlight",
      "title": "DSH Live Community Spotlight",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 0,
      "url": "https://discord-stream-hub-new.fly.dev/headless/community-spotlight?parent=spmt.live&volume=0.58",
      "sourceApp": "DiscordStreamHub",
      "role": "community-program"
    },
    {
      "id": "community-lounge-hmo-media",
      "title": "Hear Me Out Media",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 68,
      "y": 3,
      "width": 300,
      "height": 169,
      "opacity": 1,
      "zIndex": 35,
      "url": "https://hearmeout-main.fly.dev/overlay/system-spacemountainlive-lounge?media=auto&clean=1&volume=0.58&muted=0",
      "sourceApp": "Hear Me Out",
      "role": "media-mini-player"
    },
    {
      "id": "community-lounge-parade",
      "title": "NebulaBay Dancing Parade",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 16,
      "y": 77,
      "width": 653,
      "height": 120,
      "opacity": 1,
      "zIndex": 55,
      "url": "https://chat-tag-new.fly.dev/overlay/game-hub/system-spacemountainlive-parade",
      "sourceApp": "NebulaBay",
      "role": "bottom-lane-effect"
    },
    {
      "id": "community-lounge-nebula-stage",
      "title": "NebulaBay Game Stage",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 9,
      "y": 5,
      "width": 787,
      "height": 378,
      "opacity": 1,
      "zIndex": 90,
      "url": "https://chat-tag-new.fly.dev/overlay/game-hub/system-spacemountainlive-main",
      "sourceApp": "NebulaBay",
      "role": "game-stage"
    },
    {
      "id": "community-lounge-emoji-rain",
      "title": "NebulaBay Emoji Rain",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 220,
      "url": "https://chat-tag-new.fly.dev/overlay/game-hub/system-spacemountainlive-rain",
      "sourceApp": "NebulaBay",
      "role": "full-canvas-effect"
    },
    {
      "id": "sw-featured-chat",
      "title": "Featured Shared Chat",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 245,
      "url": "https://streamweaver-new.fly.dev/overlay/shared-chat-featured?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-social",
      "title": "Social Overlay",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 246,
      "url": "https://streamweaver-new.fly.dev/overlay/social?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-notification",
      "title": "Notification",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 247,
      "url": "https://streamweaver-new.fly.dev/overlay/notification?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-partner-checkin",
      "title": "Partner Check-in",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 250,
      "url": "https://streamweaver-new.fly.dev/partner-checkin?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-gamble",
      "title": "Gamble",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 255,
      "url": "https://streamweaver-new.fly.dev/gamble-overlay?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-classic-gamble",
      "title": "Classic Gamble",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 256,
      "url": "https://streamweaver-new.fly.dev/classic-gamble-overlay?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-pokemon",
      "title": "Pokemon Overlay",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 260,
      "url": "https://streamweaver-new.fly.dev/pokemon-overlay?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-pokemon-collection",
      "title": "Pokemon Collection",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 261,
      "url": "https://streamweaver-new.fly.dev/pokemon-collection-overlay?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-pokemon-pack",
      "title": "Pokemon Pack",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 262,
      "url": "https://streamweaver-new.fly.dev/pokemon-pack-overlay?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-pokemon-trade",
      "title": "Pokemon Trade",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 263,
      "url": "https://streamweaver-new.fly.dev/pokemon-trade-overlay?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "sw-shoutout",
      "title": "Shoutout Player",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 270,
      "url": "https://streamweaver-new.fly.dev/shoutout-player?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "event-layer"
    },
    {
      "id": "community-lounge-chat-tag",
      "title": "Chat Tag",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 67,
      "y": 72,
      "width": 310,
      "height": 145,
      "opacity": 1,
      "zIndex": 275,
      "url": "https://chat-tag-new.fly.dev/overlay/channel/spacemountainlive?cycle=420&hudOn=45&hudOff=120",
      "sourceApp": "NebulaBay",
      "role": "persistent-chat-tag"
    },
    {
      "id": "community-lounge-stella-tts",
      "title": "Stella / TTS",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 280,
      "url": "https://streamweaver-new.fly.dev/tts-player?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "host-avatar-tts"
    },
    {
      "id": "community-lounge-leaderboard",
      "title": "DSH Community Leaderboard",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 320,
      "url": "https://discord-stream-hub-new.fly.dev/headless/leaderboard/1240832965865635881?mode=overlay&cycle=1800&show=20&serverName=Space%20Mountain&memberName=Mountaineer&memberNamePlural=Mountaineers",
      "sourceApp": "DiscordStreamHub",
      "role": "scheduled-community-leaderboard"
    },
    {
      "id": "community-lounge-brb",
      "title": "BRB Player",
      "kind": "embed",
      "visible": true,
      "locked": true,
      "interactive": false,
      "x": 0,
      "y": 0,
      "width": 960,
      "height": 540,
      "opacity": 1,
      "zIndex": 500,
      "url": "https://streamweaver-new.fly.dev/brb-player?tenant=spacemountainlive",
      "sourceApp": "StreamWeaver",
      "role": "full-screen-override"
    }
  ],
  "workflows": [],
  "scene": {
    "width": 960,
    "height": 540
  }
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
      public: user.username === SYSTEM_TENANT
        ? systemTransparentAlertLayout()
        : normalizeLayout(legacyPublic || emptyLayout()),
        personal: emptyLayout(),
        lounge: user.username === 'mtman1987' ? personalLoungeDebugLayout() : normalizeLayout(legacyPublic || emptyLayout()),
      },
      outputUpdatedAt: { public: now, personal: now, lounge: now },
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
      const savedPublic = parsed?.outputs?.public;
      // Migrate only the injected community lounge. User-created public scenes
      // are preserved, while new system scenes remain transparent by default.
      const systemPublic = tenant === SYSTEM_TENANT
        && (!savedPublic || savedPublic.template === 'community-lounge-system-v2')
        ? systemTransparentAlertLayout()
        : null;
      const record = {
        ...parsed,
        schemaVersion: 1,
        tenant,
        userId: String(user.id),
        outputs: {
          public: systemPublic || normalizeLayout(parsed?.outputs?.public || legacyLayoutForUser(user.id) || emptyLayout()),
          personal: normalizeLayout(parsed?.outputs?.personal || emptyLayout()),
          lounge: tenant === 'mtman1987' && !(parsed?.outputs?.lounge?.widgets || []).length
            ? personalLoungeDebugLayout()
            : normalizeLayout(parsed?.outputs?.lounge || parsed?.outputs?.public || legacyLayoutForUser(user.id) || emptyLayout()),
        },
        outputUpdatedAt: {
          public: systemPublic ? new Date().toISOString() : (parsed?.outputUpdatedAt?.public || parsed?.updatedAt || new Date().toISOString()),
          personal: parsed?.outputUpdatedAt?.personal || parsed?.updatedAt || new Date().toISOString(),
          lounge: parsed?.outputUpdatedAt?.lounge || parsed?.outputUpdatedAt?.public || parsed?.updatedAt || new Date().toISOString(),
        },
      };
      // The private mtman1987 Lounge was originally seeded with the shared
      // Space Mountain Hear Me Out room. Keep the saved scene intact except
      // for this tenant identity so media state cannot fall through to the
      // wrong app room or its shell fallback.
      if (tenant === 'mtman1987') {
        let corrected = false;
        record.outputs.lounge.widgets = (record.outputs.lounge.widgets || []).map((widget) => {
          if (widget.id === 'community-lounge-hmo-media') {
            let nextUrl = String(widget.url || '')
              .replace('/overlay/system-spacemountainlive-lounge', '/overlay/system-mtman1987-lounge')
              .replace(/([?&])v=[^&]*/g, '$1v=mtman-hmo-1');
            if (!/[?&]v=/.test(nextUrl)) nextUrl += `${nextUrl.includes('?') ? '&' : '?'}v=mtman-hmo-1`;
            if (nextUrl === widget.url) return widget;
            corrected = true;
            return { ...widget, url: nextUrl };
          }
          if (widget.id === 'community-lounge-leaderboard') {
            const nextUrl = 'https://discord-stream-hub-new.fly.dev/headless/leaderboard-embed/1240832965865635881?v=dsh-image-v2';
            corrected = true;
            return {
              ...widget,
              id: 'community-lounge-leaderboard-v2',
              title: 'DSH Community Leaderboard v2',
              url: nextUrl,
              x: 240,
              y: 135,
              width: 480,
              height: 270,
              opacity: 1,
            };
          }
          return widget;
        });
        if (corrected) writeTenantRecord(record);
      }
      if (systemPublic) {
        record.updatedAt = new Date().toISOString();
        writeTenantRecord(record);
      }
      return record;
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
    lounge: `${CANONICAL_ORIGIN}/tenant/${encodeURIComponent(tenant)}/lounge`,
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
    if (!output) return safeJson(res, 400, { error: 'output must be public, personal, or lounge' });
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
    if (!output) return safeJson(res, 400, { error: 'output must be public, personal, or lounge' });
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

  app.get('/api/tenant/:tenant/lounge', (req, res) => {
    const tenant = tenantSlug(req.params.tenant);
    if (!tenant) return safeJson(res, 404, { error: 'Tenant not found' });
    const user = lookupUserByTenant(tenant);
    if (!user) return safeJson(res, 404, { error: 'Tenant not found' });
    const record = readTenantRecord({ id: user.id, username: tenant }, true);
    return res.status(200).set('cache-control', 'no-store').json({
      tenant,
      output: 'lounge',
      layout: record.outputs.lounge,
      updatedAt: record.outputUpdatedAt.lounge,
      scene: { width: SCENE_WIDTH, height: SCENE_HEIGHT },
      xboxRelayToken: issuePublicRelayToken(tenant),
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

  app.get('/tenant/:tenant/lounge', (req, res) => {
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
    systemTransparentAlertLayout,
    personalLoungeDebugLayout,
    urlsForTenant,
  },
};
