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

test('StreamWeaver entitlement service scope is applied consistently', () => {
  assert.match(scopePatch, /entitlements:read/);
  assert.equal(packageJson.scripts['patch:canonical-service-scopes'], 'node scripts/patch-canonical-service-scopes.mjs');
  assert.match(packageJson.scripts['patch:runtime-contracts'], /patch:canonical-service-scopes/);
  assert.equal(packageJson.scripts.predev, 'npm run patch:runtime-contracts');
  assert.equal(packageJson.scripts.pretypecheck, 'npm run patch:runtime-contracts');
  assert.equal(packageJson.scripts.prebuild, 'npm run patch:runtime-contracts');
  assert.match(packageJson.scripts.prestart, /patch:runtime-contracts/);
});

test('production installs and ships the easter egg entitlement route', () => {
  assert.match(productionStart, /easter-egg-entitlement-bootstrap\.cjs'\)\.installEasterEggEntitlementBootstrap\(\)/);
  assert.match(dockerfile, /COPY easter-egg-entitlement-bootstrap\.cjs \.\/easter-egg-entitlement-bootstrap\.cjs/);
  assert.match(dockerfile, /CMD \["node", "start\.cjs"\]/);
});

test('owner test grant persists all three real egg completion flags without replacing egg payloads', () => {
  assert.match(bootstrap, /SPMT_EASTER_EGG_TEST_USERNAMES \|\| 'mtman1987'/);
  assert.match(bootstrap, /user\.is_admin !== 1/);
  assert.match(bootstrap, /\['rocket', 'blackHole', 'signal'\]/);
  assert.match(bootstrap, /\.\.\.existing,/);
  assert.match(bootstrap, /completed: true/);
  assert.match(bootstrap, /ownerTestGrant: true/);
  assert.match(bootstrap, /UPDATE app_state_records/);
  assert.match(bootstrap, /INSERT INTO app_state_records/);
  assert.match(bootstrap, /title: allThree \? 'Voidwalker' : null/);
});

test('legacy entitlement key remains compatibility-only with bounded telemetry', () => {
  assert.match(bootstrap, /LEGACY_AUTH_USED migration=AUTH-SW-003/);
  assert.match(bootstrap, /caller=unverified/);
  assert.match(bootstrap, /LEGACY_AUTH_LOG_INTERVAL_MS/);
  assert.match(bootstrap, /process\.env\.SYSTEM_API_KEY/);
});
