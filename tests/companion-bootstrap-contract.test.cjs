'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('SPMT persists expiring, hashed, one-time Companion tenant links', () => {
  const db = fs.readFileSync(path.join(root, 'db.ts'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

  assert.match(db, /CREATE TABLE IF NOT EXISTS companion_bootstrap_codes/);
  assert.match(db, /code_hash TEXT PRIMARY KEY/);
  assert.match(db, /expires_at TEXT NOT NULL/);
  assert.match(db, /used_at TEXT/);
  assert.match(server, /app\.post\('\/api\/companion\/bootstrap', authenticate/);
  assert.match(server, /app\.post\('\/api\/companion\/bootstrap\/exchange'/);
  assert.match(server, /hashSecret\(code\)/);
  assert.match(server, /WHERE code_hash = \? AND used_at IS NULL/);
  assert.match(server, /UPDATE companion_bootstrap_codes SET used_at = \?/);
  assert.match(server, /sessionToken: signSession\(user\)/);
  assert.match(server, /createCompanionDevice\(user\.id/);
  assert.doesNotMatch(server, /console\.(log|info|warn|error).*Companion.*code/);
});

test('SPMT relays bounded sanitized rotator snapshots to the tenant Companion', () => {
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

  assert.match(server, /'diagnostics\.snapshot\.write': 'diagnostics\.write'/);
  assert.match(server, /app\.post\('\/api\/platform\/companion\/diagnostics', authenticatePlatformKey\('apps:read'\)/);
  assert.match(server, /A tenant-bound SPMT platform key is required/);
  assert.match(server, /sanitizeCompanionDiagnosticValue/);
  assert.match(server, /JSON\.stringify\(sanitized\)\.length <= 400_000/);
  assert.match(server, /source: 'fly-machine-rotator'/);
  assert.match(server, /7 \* 24 \* 60 \* 60_000/);
  assert.match(server, /status = 'expired'.*action = \?.*status = 'queued'/s);
});
