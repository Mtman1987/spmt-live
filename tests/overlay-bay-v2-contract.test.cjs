const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const overlayPath = path.join(root, 'public', 'shared', 'overlay-bay-v2.js');
const bridgePath = path.join(root, 'public', 'shared', 'xbox-bridge-runtime.js');

const overlay = fs.readFileSync(overlayPath, 'utf8');
const bridge = fs.readFileSync(bridgePath, 'utf8');

test('Overlay Bay v2 browser scripts parse', () => {
  assert.doesNotThrow(() => new vm.Script(overlay, { filename: overlayPath }));
  assert.doesNotThrow(() => new vm.Script(bridge, { filename: bridgePath }));
});

test('Overlay Bay exposes the expected source kinds', () => {
  for (const kind of ['xbox', 'camera', 'screen', 'image', 'embed', 'text', 'alert']) {
    assert.match(overlay, new RegExp(`['\"]${kind}['\"]`));
  }
});

test('generic alert contract is present and replaceable', () => {
  assert.match(overlay, /spmt\.overlay\.alert/);
  for (const type of ['follow', 'sub', 'resub', 'gift', 'raid', 'cheer', 'custom']) {
    assert.match(overlay, new RegExp(`${type}:`));
  }
  assert.match(overlay, /templates:/);
  assert.match(overlay, /imageUrl:/);
  assert.match(overlay, /durationMs:/);
});

test('Xbox bridge clones the live WebRTC video track and mounts Overlay Bay', () => {
  assert.match(bridge, /getVideoTracks\(\)\[0\]\.clone\(\)/);
  assert.match(bridge, /new MediaStream\(\[clonedTrack\]\)/);
  assert.match(bridge, /embed\/overlays\?mode=overlay/);
});
