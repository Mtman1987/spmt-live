const { test } = require('node:test');
const assert = require('node:assert/strict');
let Database;
try { Database = require('better-sqlite3'); } catch { Database = require('node:sqlite').DatabaseSync; }
const { HostLeases, LEASE_MS } = require('../stream-host-state.cjs');
function fixture() {
  const db = new Database(':memory:');
  if (!db.transaction) db.transaction = fn => () => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  let now = 1000;
  return { leases: new HostLeases(db, () => now), advance: ms => now += ms };
}
test('a local host excludes cloud and another device while keeping other tenants independent', () => {
  const { leases } = fixture();
  assert.equal(leases.reserve('pilot', 'local', 'pc1'), true);
  assert.equal(leases.reserve('pilot', 'cloud'), false);
  assert.equal(leases.reserve('pilot', 'local', 'pc2'), false);
  assert.equal(leases.reserve('owner', 'cloud'), true);
  leases.release('pilot', 'local', 'pc2');
  assert.equal(leases.active('pilot').device_id, 'pc1');
  leases.release('pilot', 'local', 'pc1');
  assert.equal(leases.reserve('pilot', 'cloud'), true);
});
test('renewal requires the owning device and cannot revive an expired host', () => {
  const { leases, advance } = fixture();
  leases.reserve('pilot', 'local', 'pc1'); advance(LEASE_MS - 1);
  assert.equal(leases.renew('pilot', 'pc2'), false);
  assert.equal(leases.renew('pilot', 'pc1'), true); advance(LEASE_MS);
  assert.equal(leases.renew('pilot', 'pc1'), false);
  assert.equal(leases.reserve('pilot', 'cloud'), true);
});
test('a pending cloud start excludes a local claim until its reservation clears', () => {
  const { leases } = fixture();
  leases.reserve('pilot', 'cloud');
  assert.equal(leases.reserve('pilot', 'local', 'pc1'), false);
  leases.release('pilot', 'cloud');
  assert.equal(leases.reserve('pilot', 'local', 'pc1'), true);
});
