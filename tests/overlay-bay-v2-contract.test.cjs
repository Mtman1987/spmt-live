const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const overlayPath = path.join(root, 'public', 'shared', 'overlay-bay-v2.js');
const bridgePath = path.join(root, 'public', 'shared', 'xbox-bridge-runtime.js');
const directPagePath = path.join(root, 'public', 'overlay-bay.html');
const launcherPath = path.join(root, 'public', 'downloads', 'xbox-overlay-bay-test.py');
const batchPath = path.join(root, 'public', 'downloads', 'RUN_XBOX_OVERLAY_BAY_TEST.bat');

const overlay = fs.readFileSync(overlayPath, 'utf8');
const bridge = fs.readFileSync(bridgePath, 'utf8');
const directPage = fs.readFileSync(directPagePath, 'utf8');
const launcher = fs.readFileSync(launcherPath, 'utf8');
const batch = fs.readFileSync(batchPath, 'utf8');

test('Overlay Bay v2 browser scripts parse', () => {
  assert.doesNotThrow(() => new vm.Script(overlay, { filename: overlayPath }));
  assert.doesNotThrow(() => new vm.Script(bridge, { filename: bridgePath }));
});

test('Overlay Bay exposes the expected source kinds', () => {
  for (const kind of ['xbox', 'camera', 'screen', 'image', 'embed', 'text', 'alert']) {
    assert.match(overlay, new RegExp(`['\\"]${kind}['\\"]`));
  }
});

test('new Overlay Bay workspaces receive SpaceMountain defaults', () => {
  assert.match(overlay, /spaceMountainDefaultLayout/);
  assert.match(overlay, /sm-alerts-default/);
  assert.match(overlay, /sm-live-badge/);
  assert.match(overlay, /defaultsVersion:\s*1/);
});

test('generic alert contract is present and replaceable', () => {
  assert.match(overlay, /spmt\.overlay\.alert/);
  for (const type of ['follow', 'sub', 'resub', 'gift', 'raid', 'cheer', 'custom']) {
    assert.match(overlay, new RegExp(`${type}:`));
  }
  assert.match(overlay, /templates:/);
  assert.match(overlay, /imageUrl:/);
  assert.match(overlay, /durationMs:/);
  assert.match(overlay, /replaceable:\s*true/);
});

test('Xbox bridge clones live WebRTC video and renders the saved scene natively', () => {
  assert.match(bridge, /getVideoTracks\(\)\[0\]\.clone\(\)/);
  assert.match(bridge, /new MediaStream\(\[clonedTrack\]\)/);
  assert.match(bridge, /__SPMT_XBOX_BRIDGE_LAYOUT__/);
  assert.match(bridge, /renderSavedLayout/);
  assert.match(bridge, /fireAlert/);
  assert.match(bridge, /requestFullscreen/);
  assert.doesNotMatch(bridge, /OVERLAY_URL/);
});

test('Xbox bridge supports easy local visual sources without the failed cross-site scene iframe', () => {
  assert.match(bridge, /getUserMedia/);
  assert.match(bridge, /getDisplayMedia/);
  assert.match(bridge, /kind === 'image'/);
  assert.match(bridge, /kind === 'embed'/);
  assert.match(bridge, /kind === 'text'/);
  assert.match(bridge, /kind === 'alert'/);
  assert.match(bridge, /collapsedButton/);
  assert.match(bridge, /SPMT controls/);
});

test('SPMT exposes a direct Overlay Bay route and one-click Windows test', () => {
  assert.match(directPage, /\/embed\/overlays\?mode=full&app=spmt/);
  assert.match(launcher, /https:\/\/spmt\.live\/overlay-bay\.html/);
  assert.match(launcher, /https:\/\/play\.xbox\.com\//);
  assert.match(launcher, /__SPMT_XBOX_BRIDGE_LAYOUT__/);
  assert.match(batch, /xbox-overlay-bay-test\.py/);
});
