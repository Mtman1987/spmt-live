const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'public', 'shared', 'overlay-bay-shell-nav.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('Overlay Bay shell navigation extension parses and mounts the expected surface', () => {
  assert.doesNotThrow(() => new vm.Script(source, { filename: sourcePath }));
  assert.match(source, /overlay-bay/);
  assert.match(source, /\/embed\/overlays\?mode=full&app=spmt-shell/);
  assert.match(source, /Open Overlay Bay/);
});
