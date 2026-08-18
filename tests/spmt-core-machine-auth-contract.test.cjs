const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const server = fs.readFileSync('server.ts', 'utf8');
const signal = fs.readFileSync('lost-signal-transmission-bootstrap.cjs', 'utf8');

test('SPMT core signs its own canonical client-credentials identity without another shared secret', () => {
  assert.match(server, /client_id: 'spmt-core'/);
  assert.match(server, /token_use: 'client_credentials'/);
  assert.match(server, /scopes: \[scope\]/);
  assert.match(server, /algorithm: 'HS256'/);
  assert.match(server, /JWT_SECRET/);
  assert.doesNotMatch(server, /SPMT_CORE_CLIENT_SECRET/);
});

test('Commlink handoffs use narrow spmt-core scopes', () => {
  assert.match(server, /spmtCoreOutboundAuthHeaders\('commlink:read'\)/);
  assert.match(server, /spmtCoreOutboundAuthHeaders\('commlink:control'\)/);
  assert.match(server, /spmtCoreOutboundAuthHeaders\('commlink:dispatch'\)/);
  assert.match(server, /Authorization: `Bearer \$\{getSpmtCoreServiceToken\(scope\)\}`/);
});

test('Lost Signal generation uses the same spmt-core machine identity shape', () => {
  assert.match(signal, /SERVICE_SCOPE = 'signal:generate'/);
  assert.match(signal, /client_id: 'spmt-core'/);
  assert.match(signal, /token_use: 'client_credentials'/);
  assert.match(signal, /scopes: \[SERVICE_SCOPE\]/);
  assert.match(signal, /Authorization = `Bearer \$\{serviceToken\}`/);
  assert.match(signal, /algorithm: 'HS256'/);
});

test('legacy x-spmt-key rides only as rollout compatibility', () => {
  assert.match(server, /legacyKey \? \{ 'x-spmt-key': legacyKey \} : \{\}/);
  assert.match(signal, /if \(legacyKey\) headers\['x-spmt-key'\] = legacyKey/);
});
