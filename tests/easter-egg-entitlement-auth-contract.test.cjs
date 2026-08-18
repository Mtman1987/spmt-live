const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const bootstrap = fs.readFileSync('easter-egg-entitlement-bootstrap.cjs', 'utf8');
const scopePatch = fs.readFileSync('scripts/patch-canonical-service-scopes.mjs', 'utf8');
const productionStart = fs.readFileSync('start.cjs', 'utf8');
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('easter egg entitlement accepts scoped StreamWeaver client-credentials tokens', () => {
  assert.match(bootstrap, /client_id === 'streamweaver'/);
  assert.match(bootstrap, /token_use === 'client_credentials'/);
  assert.match(bootstrap, /scopes\.includes\('entitlements:read'\)/);
  assert.match(bootstrap, /jwt\.verify\(bearer, jwtSecret\)/);
});

test('StreamWeaver entitlement service scope is applied before build', () => {
  assert.match(scopePatch, /'streamweaver': \['entitlements:read'\]/);
  assert.equal(packageJson.scripts.prebuild, 'node scripts/patch-canonical-service-scopes.mjs');
});

test('production installs and ships the easter egg entitlement route', () => {
  assert.match(productionStart, /easter-egg-entitlement-bootstrap\.cjs'\)\.installEasterEggEntitlementBootstrap\(\)/);
  assert.match(dockerfile, /COPY easter-egg-entitlement-bootstrap\.cjs \.\/easter-egg-entitlement-bootstrap\.cjs/);
  assert.match(dockerfile, /CMD \["node", "start\.cjs"\]/);
});

test('legacy entitlement key remains compatibility-only and emits migration telemetry', () => {
  assert.match(bootstrap, /LEGACY_AUTH_USED migration=AUTH-SW-003/);
  assert.match(bootstrap, /process\.env\.SYSTEM_API_KEY/);
});
