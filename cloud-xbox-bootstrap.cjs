'use strict';

const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const WORKER_URL = String(process.env.CLOUD_XBOX_WORKER_URL || 'http://xbox.process.spmt-live.internal:3003').replace(/\/+$/, '');
const WORKER_SECRET = String(process.env.CLOUD_XBOX_WORKER_SECRET || process.env.JWT_SECRET || '').trim();
const DSH_URL = String(process.env.DSH_PUBLIC_BASE_URL || 'https://discord-stream-hub-new.fly.dev').replace(/\/+$/, '');
const STREAM_LOGIN = String(process.env.STREAM_CONTINUITY_TWITCH_LOGIN || 'spacemountainlive').trim().replace(/^@/, '').toLowerCase();
let streamWatchTimer = null;
let streamWatchBusy = false;
let streamOfflineSince = 0;
let streamLastAttemptAt = 0;
let twitchLookupToken = '';
let twitchLookupTokenUntil = 0;

function safeJson(res, status, body) {
  res.status(status).set('cache-control', 'private, no-store').json(body);
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

function authUser(req) {
  const secret = String(process.env.JWT_SECRET || '');
  if (!secret) return null;
  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  for (const token of [bearer, cookies.spmt_token]) {
    if (!token) continue;
    try {
      const payload = jwt.verify(token, secret);
      if (!payload || typeof payload !== 'object') continue;
      const id = payload.id || payload.userId || payload.sub;
      if (id) return { id: String(id), payload };
    } catch {}
  }
  return null;
}

function normalizeCloudBrowserMode(value) {
  if (value === 'remote-play') return 'remote-play';
  if (value === 'restream') return 'restream';
  return 'cloud-gaming';
}

function authenticateCloudXbox(req, res, next) {
  const user = authUser(req);
  if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
  req.cloudXboxUser = user;
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return next();
  try {
    const parsed = new URL(origin);
    if (parsed.host !== req.headers.host) {
      return safeJson(res, 403, { error: 'Cross-origin cloud browser control is not allowed' });
    }
  } catch {
    return safeJson(res, 403, { error: 'Invalid request origin' });
  }
  next();
}

async function workerRequest(userId, method, workerPath, body = null, timeoutMs = 35000) {
  if (!WORKER_SECRET) throw new Error('Xbox worker secret is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${WORKER_URL}${workerPath}`, {
      method,
      signal: controller.signal,
      headers: {
        'x-spmt-worker-secret': WORKER_SECRET,
        'x-spmt-user-id': String(userId),
        ...(body !== null ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Dedicated Xbox worker timed out'
      : `Dedicated Xbox worker unavailable: ${error?.message || error}`;
    const wrapped = new Error(message);
    wrapped.cause = error;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

async function twitchAccessToken() {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
  const staticToken = String(process.env.TWITCH_ACCESS_TOKEN || '').trim();
  if (!clientId) return null;
  if (!clientSecret) return staticToken || null;
  if (twitchLookupToken && Date.now() < twitchLookupTokenUntil) return twitchLookupToken;

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  if (!body?.access_token) return null;
  twitchLookupToken = String(body.access_token);
  twitchLookupTokenUntil = Date.now() + Math.max(60_000, (Number(body.expires_in) || 3600) * 1000 - 300_000);
  return twitchLookupToken;
}

function ownerUserId() {
  const file = String(process.env.DATABASE_PATH || '/data/spmt.db');
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare('SELECT id FROM users WHERE lower(username) = ? LIMIT 1').get('mtman1987');
    return row?.id ? String(row.id) : '';
  } finally {
    db.close();
  }
}

async function twitchLiveState() {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  if (!clientId) return { ok: false, error: 'Twitch client id unavailable' };
  try {
    const token = await twitchAccessToken();
    if (!token) return { ok: false, error: 'Twitch access token unavailable' };
    const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(STREAM_LOGIN)}`, {
      headers: {
        'client-id': clientId,
        authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.data)) {
      return { ok: false, error: `Twitch Helix HTTP ${response.status}` };
    }
    return {
      ok: true,
      isLive: body.data.length > 0,
      checkedAt: new Date().toISOString(),
      startedAt: body.data[0]?.started_at || null,
      streamId: body.data[0]?.id || null,
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Twitch Helix request failed' };
  }
}

async function runAutomaticStreamRecoveryCheck() {
  if (process.env.STREAM_AUTO_START_ENABLED === 'false' || streamWatchBusy) return;
  streamWatchBusy = true;
  try {
    const state = await twitchLiveState();
    if (!state.ok) {
      console.warn('[StreamAutoStart] Twitch status unavailable:', state.error);
      return;
    }
    if (state.isLive) {
      streamOfflineSince = 0;
      return;
    }

    const now = Date.now();
    if (!streamOfflineSince) {
      streamOfflineSince = now;
      return;
    }

    const graceMs = Math.max(15_000, Number(process.env.STREAM_AUTO_START_GRACE_MS || 45_000));
    if (now - streamOfflineSince < graceMs) return;

    const cooldownMs = Math.max(30_000, Number(process.env.STREAM_AUTO_START_COOLDOWN_MS || 60_000));
    if (now - streamLastAttemptAt < cooldownMs) return;
    streamLastAttemptAt = now;

    const userId = ownerUserId();
    if (!userId) {
      console.warn('[StreamAutoStart] Owner SPMT profile could not be resolved.');
      return;
    }

    if (require('./stream-host-state.cjs').hostLeases().active(userId)?.kind === 'local') return;

    const response = await workerRequest(userId, 'POST', '/v1/restream/start', {}, 120_000);
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok === false) {
      console.warn('[StreamAutoStart] Restream start-only recovery failed:', body?.error || `HTTP ${response.status}`);
      return;
    }

    for (let attempt = 0; attempt < 18; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const verified = await twitchLiveState();
      if (verified.ok && verified.isLive) {
        streamOfflineSince = 0;
        console.log('[StreamAutoStart] Twitch recovered after persistent Restream start-only action.');
        return;
      }
    }
    console.warn('[StreamAutoStart] Restream reported a start action but Twitch did not verify live within 90 seconds.');
  } catch (error) {
    console.warn('[StreamAutoStart] Recovery check failed:', error?.message || String(error));
  } finally {
    streamWatchBusy = false;
  }
}

function startAutomaticStreamRecoveryWatch() {
  if (streamWatchTimer || process.env.STREAM_AUTO_START_ENABLED === 'false') return;
  const intervalMs = Math.max(15_000, Number(process.env.STREAM_AUTO_START_INTERVAL_MS || 30_000));
  streamWatchTimer = setInterval(() => {
    void runAutomaticStreamRecoveryCheck();
  }, intervalMs);
  streamWatchTimer.unref?.();
  setTimeout(() => void runAutomaticStreamRecoveryCheck(), 5_000).unref?.();
  console.log(`[StreamAutoStart] Watching Twitch ${STREAM_LOGIN} every ${Math.round(intervalMs / 1000)}s.`);
}

async function relayJson(res, response) {
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    return safeJson(res, response.status, payload || { error: `Xbox worker request failed (${response.status})` });
  }
  safeJson(res, response.status, payload || { ok: true });
}

function installRoutes(app, express) {
  if (app.__spmtCloudXboxRoutesInstalled) return;
  app.__spmtCloudXboxRoutesInstalled = true;
  startAutomaticStreamRecoveryWatch();
  const jsonBody = express.json({ limit: '64kb' });

  app.use(['/api/cloud-xbox/session', '/api/cloud-xbox/navigate', '/api/cloud-xbox/reload'], authenticateCloudXbox, (req, res, next) => {
    if (req.method !== 'POST') return next();
    const leases = require('./stream-host-state.cjs').hostLeases();
    if (!leases.reserve(req.cloudXboxUser.id, 'cloud')) {
      return safeJson(res, 409, { error: 'A host is already active or switching. Stop the local Restream host before opening a cloud host.' });
    }
    res.once('finish', () => leases.release(req.cloudXboxUser.id, 'cloud'));
    next();
  });

  app.get('/api/cloud-xbox/status', authenticateCloudXbox, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'GET', '/v1/status', null, 8000));
    } catch (error) {
      safeJson(res, 503, { running: false, worker: 'dedicated', error: error.message });
    }
  });

  app.post('/api/cloud-xbox/session', authenticateCloudXbox, requireSameOrigin, jsonBody, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'POST', '/v1/session', {
        mode: normalizeCloudBrowserMode(req.body?.mode),
      }, 45000));
    } catch (error) {
      safeJson(res, 503, { error: error.message });
    }
  });

  app.post('/api/cloud-xbox/navigate', authenticateCloudXbox, requireSameOrigin, jsonBody, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'POST', '/v1/navigate', {
        mode: normalizeCloudBrowserMode(req.body?.mode),
      }));
    } catch (error) {
      safeJson(res, 503, { error: error.message });
    }
  });

  app.post('/api/cloud-xbox/reload', authenticateCloudXbox, requireSameOrigin, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'POST', '/v1/reload'));
    } catch (error) {
      safeJson(res, 503, { error: error.message });
    }
  });

  app.post('/api/cloud-xbox/input', authenticateCloudXbox, requireSameOrigin, jsonBody, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'POST', '/v1/input', req.body || {}));
    } catch (error) {
      safeJson(res, 503, { error: error.message });
    }
  });

  app.get('/api/cloud-xbox/frame', authenticateCloudXbox, async (req, res) => {
    try {
      const response = await workerRequest(req.cloudXboxUser.id, 'GET', '/v1/frame', null, 10000);
      if (!response.ok) return relayJson(res, response);
      const frame = Buffer.from(await response.arrayBuffer());
      res.status(200)
        .set('content-type', 'image/jpeg')
        .set('cache-control', 'private, no-store, max-age=0')
        .set('content-length', String(frame.length))
        .send(frame);
    } catch (error) {
      safeJson(res, 503, { error: error.message });
    }
  });

  app.get('/api/cloud-xbox/diagnostics', authenticateCloudXbox, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'GET', '/v1/diagnostics', null, 8000));
    } catch (error) {
      safeJson(res, 503, { error: error.message, worker: 'dedicated' });
    }
  });

  app.delete('/api/cloud-xbox/session', authenticateCloudXbox, requireSameOrigin, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'DELETE', '/v1/session'));
    } catch (error) {
      safeJson(res, 503, { error: error.message });
    }
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const realExpress = require(expressPath);
  if (realExpress.__spmtCloudXboxFactory) return;

  function wrappedExpress(...args) {
    const app = realExpress(...args);
    installRoutes(app, realExpress);
    return app;
  }
  for (const key of Object.keys(realExpress)) wrappedExpress[key] = realExpress[key];
  wrappedExpress.__spmtCloudXboxFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installCloudXboxBootstrap() {
  patchExpress();
}

async function shutdownCloudXboxBrowsers() {
  // Chromium is owned by the dedicated Xbox process group, not the SPMT web process.
}

module.exports = {
  authUser,
  twitchLiveState,
  installCloudXboxBootstrap,
  shutdownCloudXboxBrowsers,
};
