const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendPath = path.join(root, 'cloud-xbox-bootstrap.cjs');
const guardPath = path.join(root, 'cloud-xbox-process-guard.cjs');
const frontendPath = path.join(root, 'public', 'shared', 'cloud-xbox-source.js');
const recoveryPath = path.join(root, 'public', 'shared', 'cloud-xbox-recovery.js');
const sharedIndexPath = path.join(root, 'public', 'shared', 'index.html');
const startPath = path.join(root, 'start.cjs');
const dockerPath = path.join(root, 'Dockerfile');
const flyPath = path.join(root, 'fly.toml');

const backend = fs.readFileSync(backendPath, 'utf8');
const guard = fs.readFileSync(guardPath, 'utf8');
const frontend = fs.readFileSync(frontendPath, 'utf8');
const recovery = fs.readFileSync(recoveryPath, 'utf8');
const sharedIndex = fs.readFileSync(sharedIndexPath, 'utf8');
const start = fs.readFileSync(startPath, 'utf8');
const docker = fs.readFileSync(dockerPath, 'utf8');
const fly = fs.readFileSync(flyPath, 'utf8');

test('cloud Xbox browser scripts parse', () => {
  assert.doesNotThrow(() => new vm.Script(backend, { filename: backendPath }));
  assert.doesNotThrow(() => new vm.Script(guard, { filename: guardPath }));
  assert.doesNotThrow(() => new vm.Script(frontend, { filename: frontendPath }));
  assert.doesNotThrow(() => new vm.Script(recovery, { filename: recoveryPath }));
});

test('Xbox source supports Cloud Gaming and Remote Play through one adapter', () => {
  assert.match(backend, /cloud-gaming[^\n]+https:\/\/play\.xbox\.com\//);
  assert.match(backend, /remote-play[^\n]+https:\/\/www\.xbox\.com\/remoteplay/);
  assert.match(frontend, /Cloud Gaming/);
  assert.match(frontend, /Remote Play/);
  assert.match(frontend, /browserMode/);
});

test('cloud browser uses a persistent per-user profile and server-side Chromium', () => {
  assert.match(backend, /CLOUD_XBOX_PROFILE_ROOT/);
  assert.match(backend, /sha256/);
  assert.match(backend, /--user-data-dir=/);
  assert.match(backend, /--headless=new/);
  assert.match(docker, /chromium/);
  assert.match(docker, /CLOUD_XBOX_PROFILE_ROOT=\/data\/cloud-xbox-profiles/);
});

test('Overlay Bay can view and control the cloud browser without a local helper', () => {
  assert.match(frontend, /\/api\/cloud-xbox\/frame/);
  assert.match(frontend, /\/api\/cloud-xbox\/input/);
  assert.match(frontend, /Start cloud browser/);
  assert.match(frontend, /data-cloud-xbox-preview/);
  assert.match(backend, /Page\.captureScreenshot/);
  assert.match(backend, /Input\.dispatchMouseEvent/);
  assert.match(backend, /Input\.dispatchKeyEvent/);
  assert.match(backend, /Input\.insertText/);
});

test('cloud Xbox status detects the common Xbox audio/video MediaStream boundary', () => {
  assert.match(backend, /querySelectorAll\('video,audio'\)/);
  assert.match(backend, /getTracks/);
  assert.match(backend, /videoTracks/);
  assert.match(backend, /audioTracks/);
  assert.match(backend, /getSettings/);
});

test('cloud Xbox routes are authenticated and same-origin for control writes', () => {
  assert.match(backend, /jwt\.verify/);
  assert.match(backend, /spmt_token/);
  assert.match(backend, /requireSameOrigin/);
  assert.match(backend, /Cross-origin cloud browser control is not allowed/);
});

test('cloud Chromium startup failures are retained and shown without broken image flashing', () => {
  assert.match(guard, /cloud-xbox-last\.json/);
  assert.match(guard, /stderrTail/);
  assert.match(guard, /\/api\/cloud-xbox\/diagnostics/);
  assert.match(guard, /renderer-process-limit=2/);
  assert.match(guard, /disable-gpu/);
  assert.match(recovery, /cloud-xbox-frame-ready/);
  assert.match(recovery, /\/api\/cloud-xbox\/diagnostics/);
  assert.match(recovery, /Cloud browser stopped/);
});

test('Fly machine has explicit memory for Node plus cloud Chromium', () => {
  assert.match(fly, /\[\[vm\]\]/);
  assert.match(fly, /memory\s*=\s*"1gb"/);
  assert.match(fly, /cpus\s*=\s*1/);
});

test('production boot loads the backend, guard, and Overlay Bay frontend', () => {
  assert.match(start, /cloud-xbox-process-guard\.cjs/);
  assert.match(start, /installCloudXboxProcessGuard/);
  assert.match(start, /cloud-xbox-bootstrap\.cjs/);
  assert.match(start, /installCloudXboxBootstrap/);
  assert.match(sharedIndex, /cloud-xbox-source\.js/);
  assert.match(sharedIndex, /cloud-xbox-recovery\.js/);
  assert.match(docker, /COPY cloud-xbox-process-guard\.cjs/);
  assert.match(docker, /COPY cloud-xbox-bootstrap\.cjs/);
});
