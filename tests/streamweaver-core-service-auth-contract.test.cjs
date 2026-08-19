const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { hasServiceRecoveryAccess } = require('../admin-recovery-bootstrap.cjs');

const server = fs.readFileSync('server.ts', 'utf8');
const scopePatch = fs.readFileSync('scripts/patch-canonical-service-scopes.mjs', 'utf8');
const recovery = fs.readFileSync('admin-recovery-bootstrap.cjs', 'utf8');

test('StreamWeaver receives only its approved core service scopes', () => {
  assert.match(scopePatch, /ensureClientScopes\('streamweaver', \['entitlements:read', 'events:write', 'account-recovery:write', 'chat-tag:blacklist:read'\]\)/);
  assert.match(server, /OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT/);
});

test('client credentials require an explicit narrow scope', () => {
  assert.match(scopePatch, /client_credentials requires an explicit scope/);
  assert.match(scopePatch, /const scopes = Array\.from\(new Set\(requestedScopes\)\)/);
});

test('admin recovery behavior accepts only the scoped StreamWeaver machine identity', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'service-auth-contract-secret';
  try {
    const good = jwt.sign({
      client_id: 'streamweaver',
      token_use: 'client_credentials',
      scopes: ['account-recovery:write'],
    }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 60 });
    const wrongScope = jwt.sign({
      client_id: 'streamweaver',
      token_use: 'client_credentials',
      scopes: ['events:write'],
    }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 60 });
    const wrongClient = jwt.sign({
      client_id: 'discord-stream-hub',
      token_use: 'client_credentials',
      scopes: ['account-recovery:write'],
    }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 60 });

    assert.equal(hasServiceRecoveryAccess({ headers: { authorization: `Bearer ${good}` } }), true);
    assert.equal(hasServiceRecoveryAccess({ headers: { authorization: `Bearer ${wrongScope}` } }), false);
    assert.equal(hasServiceRecoveryAccess({ headers: { authorization: `Bearer ${wrongClient}` } }), false);
    assert.equal(hasServiceRecoveryAccess({ headers: {} }), false);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('admin recovery pins the machine JWT algorithm and preserves human admin authorization', () => {
  assert.match(recovery, /algorithms: \['HS256'\]/);
  assert.match(recovery, /requesterDiscordId/);
  assert.match(recovery, /WHERE discord_id = \? AND is_admin = 1/);
  assert.match(recovery, /SPMT owner\/admin verification failed/);
});

test('service-published events are readable by their own machine source app', () => {
  assert.match(scopePatch, /req\.platformKey\.service/);
  assert.match(scopePatch, /WHERE created_by IS NULL AND source_app = \?/);
  assert.match(scopePatch, /\.all\(req\.platformKey\.appId, limit\)/);
});

test('legacy recovery key is compatibility-only with bounded telemetry', () => {
  assert.match(recovery, /LEGACY_AUTH_USED migration=AUTH-SW-002/);
  assert.match(recovery, /LEGACY_AUTH_LOG_INTERVAL_MS/);
  assert.match(recovery, /process\.env\.SYSTEM_API_KEY/);
});
