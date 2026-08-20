'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bootstrap = fs.readFileSync(path.join(root, 'commlink-identity-routing-bootstrap.cjs'), 'utf8');
const start = fs.readFileSync(path.join(root, 'start.cjs'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

test('Commlink identity bootstrap makes SPMT ownership and signed-in identity explicit', () => {
  assert.match(bootstrap, /SPMT-owned Commlink workspace/);
  assert.match(bootstrap, /Signed into SPMT as/);
  assert.match(bootstrap, /Twitch channel:/);
  assert.match(bootstrap, /bot send identity is separate/);
  assert.match(bootstrap, /\/api\/me/);
  assert.match(bootstrap, /credentials: 'include'/);
  assert.match(bootstrap, /account-avatar-image/);
});

test('Commlink identity bootstrap preserves selected destinations across live source refreshes', () => {
  assert.match(bootstrap, /selectedBeforeRefresh/);
  assert.match(bootstrap, /previousSources\.get\(id\)/);
  assert.match(bootstrap, /sourceByProviderChannel\.get\(key\)/);
  assert.match(bootstrap, /rememberSpaceDestinations\(\)/);
});

test('Commlink identity bootstrap keeps Discord channel labels specific', () => {
  assert.match(bootstrap, /function humanChannelLabel/);
  assert.doesNotMatch(bootstrap, /return 'Discord channel'/);
  assert.match(bootstrap, /channel\.channelName/);
});

test('production startup installs and packages the Commlink identity routing bootstrap', () => {
  assert.match(start, /commlink-identity-routing-bootstrap\.cjs/);
  assert.match(start, /installCommlinkIdentityRoutingBootstrap/);
  assert.match(dockerfile, /COPY commlink-identity-routing-bootstrap\.cjs/);
});
