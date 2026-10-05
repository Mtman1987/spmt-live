'use strict';

const LEASE_MS = 90_000;
let singleton;
class HostLeases {
  constructor(db, now = Date.now) {
    this.db = db; this.now = now;
    db.exec('CREATE TABLE IF NOT EXISTS stream_host_leases (user_id TEXT PRIMARY KEY, kind TEXT NOT NULL, device_id TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    db.exec('CREATE TABLE IF NOT EXISTS stream_host_devices (device_id TEXT PRIMARY KEY, supports_local INTEGER NOT NULL)');
  }
  active(userId) {
    const row = this.db.prepare('SELECT * FROM stream_host_leases WHERE user_id = ?').get(userId);
    return row && row.expires_at > this.now() ? row : null;
  }
  deviceSupportsLocal(deviceId) {
    return this.db.prepare('SELECT supports_local FROM stream_host_devices WHERE device_id = ?').get(deviceId)?.supports_local === 1;
  }
  reportDevice(deviceId, actions) {
    this.db.prepare('INSERT OR REPLACE INTO stream_host_devices VALUES (?, ?)').run(deviceId, Array.isArray(actions) && actions.includes('restream.host.open') ? 1 : 0);
  }
  reserve(userId, kind, deviceId = '') {
    return this.db.transaction(() => {
      if (this.active(userId)) return false;
      this.db.prepare('INSERT OR REPLACE INTO stream_host_leases VALUES (?, ?, ?, ?)').run(userId, kind, deviceId, this.now() + LEASE_MS);
      return true;
    })();
  }
  renew(userId, deviceId) {
    const row = this.active(userId);
    if (!row || row.kind !== 'local' || row.device_id !== deviceId) return false;
    return this.db.prepare('UPDATE stream_host_leases SET expires_at = ? WHERE user_id = ? AND kind = ? AND device_id = ?')
      .run(this.now() + LEASE_MS, userId, 'local', deviceId).changes > 0;
  }
  release(userId, kind, deviceId = '') {
    this.db.prepare('DELETE FROM stream_host_leases WHERE user_id = ? AND kind = ? AND device_id = ?').run(userId, kind, deviceId);
  }
}
function hostLeases() {
  if (!singleton) {
    const Database = require('better-sqlite3');
    const path = require('node:path');
    const file = process.env.STREAM_HOST_DATABASE_PATH || path.join(path.dirname(process.env.DATABASE_PATH || '/data/spmt.db'), 'stream-hosts.db');
    const db = new Database(file); db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
    singleton = new HostLeases(db);
  }
  return singleton;
}
module.exports = { HostLeases, hostLeases, LEASE_MS };
