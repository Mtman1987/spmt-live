const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('server.ts', 'utf8');
const start = source.indexOf('function authenticatePlatformKey(requiredScope: string) {');
const nextFunction = source.indexOf('\nfunction ', start + 10);
assert.ok(start >= 0 && nextFunction > start, 'authenticatePlatformKey source block should be present');
const middlewareBlock = source.slice(start, nextFunction)
  .replace(/: string/g, '')
  .replace(/: any/g, '')
  .replace(/ as any/g, '');
const middlewareSource = `${middlewareBlock}\nglobalThis.authenticatePlatformKey = authenticatePlatformKey;`;

function loadMiddleware(payload) {
  const context = {
    jwt: { verify: () => payload },
    JWT_SECRET: 'test-secret',
    String,
    Array,
    JSON,
    Error,
    hashSecret: () => { throw new Error('developer-key fallback should not run for valid OAuth JWTs'); },
    db: { prepare: () => { throw new Error('developer-key fallback should not run for valid OAuth JWTs'); } },
  };
  vm.runInNewContext(middlewareSource, context, { filename: 'platform-auth.vm.js' });
  return context.authenticatePlatformKey;
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('user OAuth remains valid for ordinary platform scopes', () => {
  const authenticatePlatformKey = loadMiddleware({
    id: 'user-1',
    client_id: 'hearmeout',
    scopes: ['identity:read'],
  });
  const req = { headers: { authorization: 'Bearer user-token' } };
  const res = responseRecorder();
  let nextCalls = 0;
  authenticatePlatformKey('identity:read')(req, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(req.platformKey.userId, 'user-1');
  assert.equal(req.platformKey.appId, 'hearmeout');
  assert.equal(req.platformKey.service, false);
});

test('historical user OAuth xp:write scope cannot authorize XP platform writes', () => {
  const authenticatePlatformKey = loadMiddleware({
    id: 'user-1',
    client_id: 'spacemountain-live',
    scopes: ['identity:read', 'xp:write'],
  });
  const req = { headers: { authorization: 'Bearer old-user-token' } };
  const res = responseRecorder();
  let nextCalls = 0;
  authenticatePlatformKey('xp:write')(req, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 403);
  assert.match(String(res.body?.error || ''), /client credentials/i);
});

test('SpaceMountain client credentials can authorize xp:write', () => {
  const authenticatePlatformKey = loadMiddleware({
    client_id: 'spacemountain-live',
    token_use: 'client_credentials',
    scopes: ['xp:write'],
  });
  const req = { headers: { authorization: 'Bearer service-token' } };
  const res = responseRecorder();
  let nextCalls = 0;
  authenticatePlatformKey('xp:write')(req, res, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(req.platformKey.appId, 'spacemountain-live');
  assert.equal(req.platformKey.service, true);
  assert.equal(req.platformKey.userId, null);
});

test('SpaceMountain user OAuth no longer receives xp:write and refresh strips old scope', () => {
  assert.match(source, /'spacemountain-live': \['identity:read'\],/);
  assert.match(source, /OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT[\s\S]*'spacemountain-live': \['xp:write'\]/);
  assert.match(source, /String\(client_id\) === 'spacemountain-live'[\s\S]*filter\(\(value\) => value !== 'xp:write'\)/);
});
