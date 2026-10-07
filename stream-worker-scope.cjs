'use strict';
// This pilot is tied to the existing signed-in account ID, never a caller's
// username/query parameter. Each host also has a separate persistent profile.
const DASH_USER_ID = '9b5c902c-00e1-4269-8653-e78ef00f42a1';
function workerUrlForUser(userId, env = process.env) {
  return String(String(userId) === DASH_USER_ID
    ? (env.DASH_STUDIO_WORKER_URL || 'https://spmt-live.fly.dev:4447')
    : (env.CLOUD_XBOX_WORKER_URL || 'http://xbox.process.spmt-live.internal:3003')).replace(/\/+$/, '');
}
function mayStopIdleWorker({ enabled, activeSessions, pendingStarts, lastControlAt, now, idleMs }) {
  return enabled && activeSessions === 0 && pendingStarts === 0 && now - lastControlAt >= idleMs;
}
module.exports = { DASH_USER_ID, workerUrlForUser, mayStopIdleWorker };
