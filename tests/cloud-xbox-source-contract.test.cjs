const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const backendPath = path.join(root, 'cloud-xbox-bootstrap.cjs');
const workerPath = path.join(root, 'xbox-worker.cjs');
const guardPath = path.join(root, 'xbox-worker-guard.cjs');
const frontendPath = path.join(root, 'public', 'shared', 'cloud-xbox-source.js');
const recoveryPath = path.join(root, 'public', 'shared', 'cloud-xbox-recovery.js');
const sharedIndexPath = path.join(root, 'public', 'shared', 'index.html');
const startPath = path.join(root, 'start.cjs');
const dockerPath = path.join(root, 'Dockerfile');
const flyPath = path.join(root, 'fly.toml');

const backend = fs.readFileSync(backendPath, 'utf8');
const worker = fs.readFileSync(workerPath, 'utf8');
const guard = fs.readFileSync(guardPath, 'utf8');
const frontend = fs.readFileSync(frontendPath, 'utf8');
const recovery = fs.readFileSync(recoveryPath, 'utf8');
const sharedIndex = fs.readFileSync(sharedIndexPath, 'utf8');
const start = fs.readFileSync(startPath, 'utf8');
const docker = fs.readFileSync(dockerPath, 'utf8');
const fly = fs.readFileSync(flyPath, 'utf8');

test('cloud Xbox proxy, worker, guard, and browser scripts parse', () => {
  assert.doesNotThrow(() => new vm.Script(backend, { filename: backendPath }));
  assert.doesNotThrow(() => new vm.Script(worker, { filename: workerPath }));
  assert.doesNotThrow(() => new vm.Script(guard, { filename: guardPath }));
  assert.doesNotThrow(() => new vm.Script(frontend, { filename: frontendPath }));
  assert.doesNotThrow(() => new vm.Script(recovery, { filename: recoveryPath }));
});

test('Xbox source supports Cloud Gaming and Remote Play through one worker adapter', () => {
  assert.match(worker, /cloud-gaming[^\n]+https:\/\/play\.xbox\.com\//);
  assert.match(worker, /remote-play[^\n]+https:\/\/www\.xbox\.com\/remoteplay/);
  assert.match(frontend, /Cloud Gaming/);
  assert.match(frontend, /Remote Play/);
  assert.match(frontend, /browserMode/);
});

test('SPMT web process proxies Xbox controls instead of spawning Chromium', () => {
  assert.match(backend, /CLOUD_XBOX_WORKER_URL/);
  assert.match(backend, /xbox\.process\.spmt-live\.internal:3003/);
  assert.match(backend, /x-spmt-worker-secret/);
  assert.match(backend, /x-spmt-user-id/);
  assert.doesNotMatch(backend, /child_process/);
  assert.doesNotMatch(backend, /spawn\(/);
  assert.doesNotMatch(start, /cloud-xbox-process-guard/);
});

test('dedicated worker owns Chromium, one stream session, and browser profile', () => {
  assert.match(worker, /CLOUD_XBOX_PROFILE_ROOT/);
  assert.match(worker, /CLOUD_XBOX_MAX_SESSIONS/);
  assert.match(worker, /MAX_SESSIONS/);
  assert.match(worker, /--user-data-dir=/);
  assert.match(worker, /--headless=new/);
  assert.match(worker, /--use-gl=swiftshader/);
  assert.match(worker, /--remote-allow-origins=\*/);
  assert.match(worker, /profilePersistent: true/);
  assert.match(docker, /chromium/);
  assert.match(docker, /COPY xbox-worker\.cjs/);
});

test('Xbox runtime guard logs Chromium lifecycle without printing credentials', () => {
  assert.match(guard, /Chromium spawned/);
  assert.match(guard, /Chromium exited/);
  assert.match(guard, /unhandled rejection kept alive/);
  assert.match(guard, /\[redacted\]/);
  assert.match(guard, /redacted-jwt/);
  assert.match(guard, /require\('\.\/xbox-worker\.cjs'\)/);
  assert.match(docker, /COPY xbox-worker-guard\.cjs/);
  assert.match(fly, /xbox\s*=\s*"node xbox-worker-guard\.cjs"/);
});

test('Overlay Bay can view and control the dedicated browser without a local helper', () => {
  assert.match(frontend, /\/api\/cloud-xbox\/frame/);
  assert.match(frontend, /\/api\/cloud-xbox\/input/);
  assert.match(frontend, /Start cloud browser/);
  assert.match(frontend, /data-cloud-xbox-preview/);
  assert.match(worker, /Page\.captureScreenshot/);
  assert.match(worker, /Input\.dispatchMouseEvent/);
  assert.match(worker, /Input\.dispatchKeyEvent/);
  assert.match(worker, /Input\.insertText/);
});

test('dedicated worker detects Xbox audio/video MediaStream tracks', () => {
  assert.match(worker, /querySelectorAll\('video,audio'\)/);
  assert.match(worker, /getTracks/);
  assert.match(worker, /videoTracks/);
  assert.match(worker, /audioTracks/);
  assert.match(worker, /getSettings/);
});

test('worker reports resource usage and bounded redacted crash diagnostics', () => {
  assert.match(worker, /workerRssMb/);
  assert.match(worker, /chromiumParentRssMb/);
  assert.match(worker, /systemTotalMb/);
  assert.match(worker, /stderrTail/);
  assert.match(worker, /MAX_DIAGNOSTIC_TAIL/);
  assert.match(worker, /\[redacted\]/);
  assert.match(backend, /\/v1\/diagnostics/);
  assert.match(recovery, /\/api\/cloud-xbox\/diagnostics/);
});

test('cloud Xbox public routes remain authenticated and same-origin for control writes', () => {
  assert.match(backend, /jwt\.verify/);
  assert.match(backend, /spmt_token/);
  assert.match(backend, /requireSameOrigin/);
  assert.match(backend, /Cross-origin cloud browser control is not allowed/);
});

test('Fly splits app and Xbox into separate machines with test sizing', () => {
  assert.match(fly, /\[processes\][\s\S]*app\s*=\s*"node start\.cjs"[\s\S]*xbox\s*=\s*"node xbox-worker-guard\.cjs"/);
  assert.match(fly, /CLOUD_XBOX_WORKER_URL\s*=\s*"http:\/\/xbox\.process\.spmt-live\.internal:3003"/);
  assert.match(fly, /\[http_service\][\s\S]*processes\s*=\s*\["app"\]/);
  assert.match(fly, /memory\s*=\s*"1gb"[\s\S]*processes\s*=\s*\["app"\]/);
  assert.match(fly, /cpus\s*=\s*2[\s\S]*memory\s*=\s*"2gb"[\s\S]*processes\s*=\s*\["xbox"\]/);
});

test('production boot loads the proxy and Overlay Bay frontend', () => {
  assert.match(start, /cloud-xbox-bootstrap\.cjs/);
  assert.match(start, /installCloudXboxBootstrap/);
  assert.match(sharedIndex, /cloud-xbox-source\.js/);
  assert.match(sharedIndex, /cloud-xbox-recovery\.js/);
  assert.match(docker, /COPY cloud-xbox-bootstrap\.cjs/);
  assert.match(docker, /COPY xbox-worker\.cjs/);
  assert.match(docker, /COPY xbox-worker-guard\.cjs/);
});
