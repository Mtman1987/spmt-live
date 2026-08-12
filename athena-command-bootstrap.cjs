'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_STREAMWEAVER_ATHENA_URL = 'https://streamweaver-new.fly.dev/api/spmt/athena/commands';

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

function authenticatedSpmtUser(req) {
  const secret = String(process.env.JWT_SECRET || '').trim();
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
    return { id: String(id), token, payload };
  } catch {
    return null;
  }
}

function compactText(value, max = 5000) {
  const text = String(value || '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function safeJson(res, status, body) {
  return res.status(status).set('cache-control', 'private, no-store').json(body);
}

function streamweaverAthenaUrl() {
  const configured = String(process.env.STREAMWEAVER_ATHENA_URL || '').trim();
  return configured || DEFAULT_STREAMWEAVER_ATHENA_URL;
}

async function forwardAthenaCommand(req, res) {
  const auth = authenticatedSpmtUser(req);
  if (!auth) return safeJson(res, 401, { error: 'Not authenticated' });

  const command = compactText(req.body?.command || req.body?.message || req.body?.transcript, 5000);
  if (!command) return safeJson(res, 400, { error: 'command is required' });

  // The source comes from the authenticated OAuth client whenever possible.
  // A normal first-party SPMT session has no client_id and is labeled spmt.
  const sourceApp = compactText(auth.payload.client_id || req.body?.sourceApp || req.body?.source || 'spmt', 80)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-') || 'spmt';
  const roomId = compactText(req.body?.roomId, 160);
  const voice = compactText(req.body?.voice, 128);

  try {
    const upstream = await fetch(streamweaverAthenaUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        command,
        source: sourceApp,
        roomId: roomId || undefined,
        speak: req.body?.speak !== false,
        voice: voice || undefined,
      }),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(60_000) : undefined,
    });

    const text = await upstream.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch { result = { raw: text }; }

    if (!upstream.ok) {
      const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
      return safeJson(res, status, {
        accepted: false,
        routed: false,
        status: 'failed',
        command,
        source: sourceApp,
        error: result?.error?.message || result?.error || result?.message || `StreamWeaver returned ${upstream.status}`,
      });
    }

    const data = result?.data && typeof result.data === 'object' ? result.data : result;
    return safeJson(res, 200, {
      ...data,
      accepted: true,
      routed: true,
      status: data?.status || 'completed',
      command,
      source: sourceApp,
      roomId: roomId || data?.roomId || undefined,
    });
  } catch (error) {
    console.error('[AthenaCommand] StreamWeaver routing failed:', error?.message || error);
    return safeJson(res, 502, {
      accepted: false,
      routed: false,
      status: 'upstream_unavailable',
      command,
      source: sourceApp,
      error: 'StreamWeaver Athena is unavailable',
    });
  }
}

function installRoutes(app, express) {
  if (app.__spmtAthenaCommandRoutesInstalled) return;
  app.__spmtAthenaCommandRoutesInstalled = true;
  const jsonBody = express.json({ limit: '64kb' });
  app.post('/api/athena/commands', jsonBody, forwardAthenaCommand);
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtAthenaCommandFactory) return;

  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtAthenaCommandFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installAthenaCommandBootstrap() {
  patchExpress();
}

module.exports = {
  installAthenaCommandBootstrap,
};
