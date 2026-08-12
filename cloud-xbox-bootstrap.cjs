'use strict';

const jwt = require('jsonwebtoken');

const WORKER_URL = String(process.env.CLOUD_XBOX_WORKER_URL || 'http://xbox.process.spmt-live.internal:3003').replace(/\/+$/, '');
const WORKER_SECRET = String(process.env.CLOUD_XBOX_WORKER_SECRET || process.env.JWT_SECRET || '').trim();

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
  const token = cookies.spmt_token || bearer;
  if (!token) return null;
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
  const jsonBody = express.json({ limit: '64kb' });

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
        mode: req.body?.mode === 'remote-play' ? 'remote-play' : 'cloud-gaming',
      }, 45000));
    } catch (error) {
      safeJson(res, 503, { error: error.message });
    }
  });

  app.post('/api/cloud-xbox/navigate', authenticateCloudXbox, requireSameOrigin, jsonBody, async (req, res) => {
    try {
      await relayJson(res, await workerRequest(req.cloudXboxUser.id, 'POST', '/v1/navigate', {
        mode: req.body?.mode === 'remote-play' ? 'remote-play' : 'cloud-gaming',
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
  installCloudXboxBootstrap,
  shutdownCloudXboxBrowsers,
};
