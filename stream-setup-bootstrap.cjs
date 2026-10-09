'use strict';

const crypto = require('node:crypto');
const { authUser } = require('./cloud-xbox-bootstrap.cjs');
const { hostLeases, LEASE_MS } = require('./stream-host-state.cjs');
const ORIGIN = 'https://spmt.live';

function readTenant(userId, deviceId) {
  const Database = require('better-sqlite3');
  const db = new Database(process.env.DATABASE_PATH || '/data/spmt.db', { readonly: true, fileMustExist: true });
  try {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
    const devices = db.prepare('SELECT id, name, status, capabilities, token_hash FROM companion_devices WHERE user_id = ? AND revoked_at IS NULL').all(userId);
    return { user, devices, device: devices.find(d => d.id === deviceId) };
  } finally { db.close(); }
}
function eligible(username) {
  const pilots = String(process.env.STREAM_LOCAL_HOST_PILOTS || 'thecaptaindash,mtman1987').toLowerCase().split(',').map(s => s.trim());
  return pilots.includes(String(username).toLowerCase());
}
function json(res, status, body) { return res.status(status).set('cache-control', 'private, no-store').json(body); }
function auth(req, res, next) {
  const user = authUser(req);
  if (!user) return json(res, 401, { error: 'Sign in to SPMT first.' });
  req.streamUserId = user.id; next();
}
function sameOrigin(req, res, next) {
  if (req.headers.origin && req.headers.origin !== ORIGIN) return json(res, 403, { error: 'Use the SPMT setup page.' });
  next();
}
function deviceProof(req, res, next) {
  const deviceId = String(req.headers['x-spmt-device'] || '');
  const token = String(req.headers['x-spmt-device-token'] || '');
  const tenant = readTenant(req.streamUserId, deviceId);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  if (!token || !tenant.device || tenant.device.token_hash !== hash || !JSON.parse(tenant.device.capabilities || '[]').includes('restream.host') || !hostLeases().deviceSupportsLocal(deviceId)) {
    return json(res, 403, { error: 'Connect the updated Companion to this SPMT account first.' });
  }
  if (!eligible(tenant.user?.username)) return json(res, 403, { error: 'Local hosting is currently available to the pilot accounts.' });
  req.streamDeviceId = deviceId; req.streamUsername = tenant.user.username; next();
}
async function cloudStatus(userId) {
  const endpoint = require('./stream-worker-scope.cjs').workerUrlForUser(userId);
  const secret = process.env.CLOUD_XBOX_WORKER_SECRET || process.env.JWT_SECRET;
  const response = await fetch(endpoint + '/v1/status', { headers: { 'x-spmt-worker-secret': secret, 'x-spmt-user-id': userId }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Cloud host status could not be verified. Try again before switching hosts.');
  const status = await response.json();
  if (typeof status.running !== 'boolean') throw new Error('Cloud host status could not be verified.');
  return status;
}
function installRoutes(app, express) {
  if (app.__spmtStreamSetup) return;
  app.__spmtStreamSetup = true;
  app.get('/api/stream-setup/status', auth, (req, res) => {
    try {
      const { user, devices } = readTenant(req.streamUserId);
      if (!user) return json(res, 404, { error: 'SPMT account not found.' });
      const lease = hostLeases().active(user.id);
      return json(res, 200, {
        username: user.username, localPilot: eligible(user.username), restreamPlan: 'free',
        browserSourceUrl: ORIGIN + '/tenant/' + encodeURIComponent(user.username) + '/public',
        activeHost: lease?.kind || null, hostExpiresAt: lease?.expires_at || null,
        companionDevices: devices.map(d => ({ id: d.id, name: d.name, online: d.status === 'online', supportsRestreamHost: hostLeases().deviceSupportsLocal(d.id) && JSON.parse(d.capabilities || '[]').includes('restream.host') })),
        ps5ConsoleOnlyReady: false, ps5SetupUrl: '/ps5-setup.html',
      });
    } catch { return json(res, 503, { error: 'Setup status unavailable. Try again.' }); }
  });
  app.post('/api/stream-host/local/claim', auth, sameOrigin, deviceProof, async (req, res) => {
    const leases = hostLeases();
    if (!leases.reserve(req.streamUserId, 'local', req.streamDeviceId)) return json(res, 409, { error: 'Another host is already active or switching. Close that host before switching.' });
    try {
      const status = await cloudStatus(req.streamUserId);
      if (status.running) throw new Error('Your cloud host is running. End its broadcast and stop that host before opening the local host.');
      return json(res, 201, { host: 'local', expiresAt: Date.now() + LEASE_MS, username: req.streamUsername });
    } catch (error) {
      leases.release(req.streamUserId, 'local', req.streamDeviceId);
      return json(res, 409, { error: error.message });
    }
  });
  app.post('/api/stream-host/local/heartbeat', auth, sameOrigin, deviceProof, (req, res) => {
    if (!hostLeases().renew(req.streamUserId, req.streamDeviceId)) return json(res, 409, { error: 'Local host reservation expired. Reopen the local host.' });
    return json(res, 200, { host: 'local', expiresAt: Date.now() + LEASE_MS });
  });
  app.post('/api/stream-host/local/release', auth, sameOrigin, deviceProof, (req, res) => {
    hostLeases().release(req.streamUserId, 'local', req.streamDeviceId);
    return json(res, 200, { released: true });
  });
}
function installStreamSetupBootstrap() {
  const resolved = require.resolve('express'), real = require(resolved);
  if (real.__spmtStreamSetupFactory) return;
  function wrapped(...args) { const app = real(...args); installRoutes(app, real); return app; }
  Object.assign(wrapped, real); wrapped.__spmtStreamSetupFactory = true;
  require.cache[resolved].exports = wrapped;
}
module.exports = { installStreamSetupBootstrap, eligible, cloudStatus };
