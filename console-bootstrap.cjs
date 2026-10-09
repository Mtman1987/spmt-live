'use strict';
const { authUser } = require('./cloud-xbox-bootstrap.cjs');
const { DASH_USER_ID } = require('./stream-worker-scope.cjs');
const { ipv4 } = require('./console-worker.cjs');
const ORIGIN = 'https://spmt.live';
function json(res, code, body) { return res.status(code).set('cache-control', 'private, no-store').json(body); }
function auth(req, res, next) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: 'Sign in to SPMT first.' });
  if (String(user.id) !== DASH_USER_ID) return json(res, 403, { error: 'The PS5 pilot is available to thecaptaindash.' });
  req.consoleUserId = String(user.id); next();
}
function sameOrigin(req, res, next) {
  if (req.headers.origin && req.headers.origin !== ORIGIN) return json(res, 403, { error: 'Use the SPMT setup page.' });
  next();
}
async function workerRequest(userId, route, body) {
  const endpoint = process.env.CONSOLE_WORKER_URL || 'http://console.process.spmt-live.internal:3004';
  const response = await fetch(endpoint + route, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-spmt-worker-secret': process.env.CLOUD_XBOX_WORKER_SECRET || process.env.JWT_SECRET,
      'x-spmt-user-id': userId, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'PS5 receiver unavailable.'); error.status = response.status; throw error; }
  return data;
}
function installRoutes(app, express) {
  if (app.__spmtConsole) return;
  app.__spmtConsole = true;
  app.get('/api/ps5-console/status', auth, async (req, res) => {
    try { return json(res, 200, { ...await workerRequest(req.consoleUserId, '/v1/status'),
      ...require('./tenant-overlay-bootstrap.cjs').consoleSceneInfo(req.consoleUserId),
      browserSourceUrl: ORIGIN + '/tenant/thecaptaindash/public' }); }
    catch { return json(res, 503, { error: 'The PS5 receiver is unavailable. Try again shortly.' }); }
  });
  app.post('/api/ps5-console/connect', auth, sameOrigin, express.json({ limit: '2kb' }), async (req, res) => {
    try {
      // Fly overwrites Fly-Client-IP at the edge. A pilot on an IPv6 connection
      // can explicitly enter the PS5 network's public IPv4 instead.
      const ip = ipv4(req.body?.homeIpv4 || req.headers['fly-client-ip']);
      if (!ip) return json(res, 400, { error: 'Enter the public IPv4 of the PS5 home network, or connect from that network using IPv4.' });
      const state = await workerRequest(req.consoleUserId, '/v1/register', { ip });
      const scene = require('./tenant-overlay-bootstrap.cjs').addConsoleGameplay(req.consoleUserId, state.playerUrl);
      return json(res, 200, { ...state, browserSourceUrl: scene.urls.public, layout: scene.layout,
        ...require('./tenant-overlay-bootstrap.cjs').consoleSceneInfo(req.consoleUserId) });
    } catch (error) { return json(res, error.status || 503, { error: error.message || 'Could not connect PS5 gameplay.' }); }
  });
}
function installConsoleBootstrap() {
  const resolved = require.resolve('express'), real = require(resolved);
  if (real.__spmtConsoleFactory) return;
  function wrapped(...args) { const app = real(...args); installRoutes(app, real); return app; }
  Object.assign(wrapped, real); wrapped.__spmtConsoleFactory = true;
  require.cache[resolved].exports = wrapped;
}
module.exports = { installConsoleBootstrap, installRoutes };
