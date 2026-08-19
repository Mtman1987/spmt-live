const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const commlink = fs.readFileSync('public/commlink/commlink.js', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('Commlink uses the same-origin SPMT session instead of a localStorage login gate', () => {
  assert.doesNotMatch(commlink, /localStorage\.getItem\(['"]spmt_token['"]\)/);
  assert.match(commlink, /function commlinkAuthHeaders\(extra = \{\}\) \{[\s\S]*return \{ \.\.\.extra \};/);
  assert.match(commlink, /fetch\('\/api\/discoveries', \{ headers: commlinkAuthHeaders\(\), credentials: 'include' \}\)/);
  assert.match(commlink, /fetch\(`\/api\/discoveries\/\$\{encodeURIComponent\(discoveryId\)\}`,[\s\S]*credentials: 'include'/);
  assert.match(commlink, /fetch\('\/api\/commlink\/operator',[\s\S]*credentials: 'include'/);
  assert.match(commlink, /fetch\('\/api\/app-state\/cosmo-commlink\/workspace',[\s\S]*credentials: 'include'/);
});

test('Commlink Black Hole discovery bridges to the canonical Easter egg state', () => {
  assert.match(server, /function syncCanonicalCommlinkBlackHole\(userId: string\)/);
  assert.match(server, /discovery_id = 'cosmo-black-hole'/);
  assert.match(server, /app_id = 'spacemountain-live' AND namespace = 'easter-eggs'/);
  assert.match(server, /completed: true/);
  assert.match(server, /source: existing\.source \|\| 'spmt-live-commlink'/);
  assert.match(server, /if \(discoveryId === 'cosmo-black-hole'\) syncCanonicalCommlinkBlackHole\(req\.user\.id\)/);
});

test('Commlink session auth patch is part of every runtime contract pass', () => {
  assert.match(packageJson.scripts['patch:runtime-contracts'], /patch-commlink-spmt-session-auth\.mjs/);
  assert.match(packageJson.scripts['test:startup-theme'], /commlink-session-auth-contract\.test\.cjs/);
});
