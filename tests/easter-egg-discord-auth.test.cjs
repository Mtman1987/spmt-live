const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const state = require('../easter-egg-state.cjs');

test('Discord reward queue accepts only the existing scoped DSH machine identity', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, discord_id TEXT);
    CREATE TABLE user_discoveries(user_id TEXT, discovery_id TEXT, discovered_at TEXT);
    CREATE TABLE app_state_records(user_id TEXT, app_id TEXT, namespace TEXT);`);
  const handlers = new Map();
  const context = {
    module: { exports: {} }, console,
    process: { env: { JWT_SECRET: 'test-only', DATABASE_PATH: ':memory:' } },
    require: (name) => name === 'better-sqlite3' ? function () { return db; }
      : name === './easter-egg-state.cjs' ? state : require(name),
  };
  const source = fs.readFileSync('easter-egg-entitlement-bootstrap.cjs', 'utf8');
  vm.runInNewContext(source + '\nmodule.exports.installRoutes = installRoutes;', context);
  context.module.exports.installRoutes({ post: (path, _parser, handler) => handlers.set(path, handler) }, { json: () => () => {} });
  const token = (payload) => jwt.sign(payload, 'test-only');
  for (const path of ['/api/internal/easter-eggs/discord-rewards/claim', '/api/internal/easter-eggs/discord-rewards/ack']) {
    for (const authorization of ['', `Bearer ${token({ id: 'owner', is_admin: true })}`,
      `Bearer ${token({ token_use: 'client_credentials', client_id: 'streamweaver', scopes: ['entitlements:read'] })}`]) {
      const res = { code: 200, set() {}, status(value) { this.code = value; return this; }, json(value) { return value; } };
      handlers.get(path)({ headers: { authorization }, body: {} }, res);
      assert.equal(res.code, 401);
    }
  }
  const res = { code: 200, payload: null, set() {}, status(value) { this.code = value; return this; }, json(value) { this.payload = value; return value; } };
  handlers.get('/api/internal/easter-eggs/discord-rewards/claim')({ headers: { authorization: `Bearer ${token({ token_use: 'client_credentials', client_id: 'discord-stream-hub', scopes: ['identity:write'] })}` }, body: {} }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload.jobs, []);
  db.close();
});
