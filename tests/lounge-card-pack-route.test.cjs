const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const bootstrap = fs.readFileSync('tenant-overlay-bootstrap.cjs', 'utf8');

test('Lounge card pack uses canonical public overlay route', () => {
  assert.match(
    bootstrap,
    /https:\/\/streamweaver-new\.fly\.dev\/overlay\/card-pack\?tenant=spacemountainlive/,
  );
  assert.doesNotMatch(
    bootstrap,
    /https:\/\/streamweaver-new\.fly\.dev\/card-pack-overlay\?tenant=spacemountainlive/,
  );
  assert.match(bootstrap, /widget\.id === 'sw-pokemon-pack'/);
});
