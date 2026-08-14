'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_STREAMWEAVER_BOT_URL = 'https://streamweaver-new.fly.dev/api/spmt/bot/commands';

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

function streamweaverBotUrl() {
  const configured = String(
    process.env.STREAMWEAVER_BOT_URL ||
    process.env.STREAMWEAVER_ATHENA_URL ||
    '',
  ).trim();
  return configured || DEFAULT_STREAMWEAVER_BOT_URL;
}

async function forwardBotCommand(req, res) {
  const auth = authenticatedSpmtUser(req);
  if (!auth) return safeJson(res, 401, { error: 'Not authenticated' });

  const command = compactText(req.body?.command || req.body?.message || req.body?.transcript, 5000);
  if (!command) return safeJson(res, 400, { error: 'command is required' });

  // OAuth client identity is authoritative. A first-party SPMT browser session
  // has no client_id and is therefore always labeled "spmt"; request bodies
  // cannot spoof another application's source identity.
  const sourceApp = compactText(auth.payload.client_id || 'spmt', 80)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-') || 'spmt';
  const roomId = compactText(req.body?.roomId, 160);
  const voice = compactText(req.body?.voice, 128);
  const targetTenantId = compactText(req.body?.targetTenantId, 128);

  try {
    const upstream = await fetch(streamweaverBotUrl(), {
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
        targetTenantId: targetTenantId || undefined,
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
    console.error('[BotCommand] StreamWeaver routing failed:', error?.message || error);
    return safeJson(res, 502, {
      accepted: false,
      routed: false,
      status: 'upstream_unavailable',
      command,
      source: sourceApp,
      error: 'StreamWeaver bot runtime is unavailable',
    });
  }
}

function installRoutes(app, express) {
  if (app.__spmtBotCommandRoutesInstalled) return;
  app.__spmtBotCommandRoutesInstalled = true;
  const jsonBody = express.json({ limit: '64kb' });
  app.post('/api/bot/commands', jsonBody, forwardBotCommand);
  // Compatibility alias for existing clients. There is no Athena-specific
  // command implementation behind this route anymore.
  app.post('/api/athena/commands', jsonBody, forwardBotCommand);
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtBotCommandFactory) return;

  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtBotCommandFactory = true;
  // Keep the old marker during the compatibility window so an older startup
  // wrapper cannot patch Express a second time.
  wrappedExpress.__spmtAthenaCommandFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installBotCommandBootstrap() {
  patchExpress();
}

function installAthenaCommandBootstrap() {
  installBotCommandBootstrap();
}

module.exports = {
  installBotCommandBootstrap,
  installAthenaCommandBootstrap,
};
