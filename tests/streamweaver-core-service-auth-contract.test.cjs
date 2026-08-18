const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const server = fs.readFileSync('server.ts', 'utf8');
const scopePatch = fs.readFileSync('scripts/patch-canonical-service-scopes.mjs', 'utf8');
const recovery = fs.readFileSync('admin-recovery-bootstrap.cjs', 'utf8');

test('StreamWeaver receives only its approved core service scopes', () => {
  assert.match(scopePatch, /ensureClientScopes\('streamweaver', \['entitlements:read', 'events:write', 'account-recovery:write'\]\)/);
  assert.match(server, /OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT/);
});

test('admin recovery accepts canonical StreamWeaver client credentials', () => {
  assert.match(recovery, /payload\?\.client_id === 'streamweaver'/);
  assert.match(recovery, /payload\?\.token_use === 'client_credentials'/);
  assert.match(recovery, /scopes\.includes\('account-recovery:write'\)/);
  assert.match(recovery, /jwt\.verify\(bearer, jwtSecret\)/);
});

test('admin recovery preserves Discord requester and SPMT admin verification', () => {
  assert.match(recovery, /requesterDiscordId/);
  assert.match(recovery, /WHERE discord_id = \? AND is_admin = 1/);
  assert.match(recovery, /SPMT owner\/admin verification failed/);
});

test('legacy recovery key is compatibility-only with bounded telemetry', () => {
  assert.match(recovery, /LEGACY_AUTH_USED migration=AUTH-SW-002/);
  assert.match(recovery, /LEGACY_AUTH_LOG_INTERVAL_MS/);
  assert.match(recovery, /process\.env\.SYSTEM_API_KEY/);
});
