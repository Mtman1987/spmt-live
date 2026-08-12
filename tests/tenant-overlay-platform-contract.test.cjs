'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const bootstrap = require(path.join(root, 'tenant-overlay-bootstrap.cjs'));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('tenant server contract uses one tenant record with public and personal outputs', () => {
  const source = read('tenant-overlay-bootstrap.cjs');
  assert.match(source, /outputs:\s*\{\s*public:/s);
  assert.match(source, /personal:\s*emptyLayout\(\)/);
  assert.match(source, /app\.get\('\/api\/overlay-workspace'/);
  assert.match(source, /record\.outputs\.public/);
  assert.match(source, /app\.put\('\/api\/tenant-scene\/:output'/);
  assert.match(source, /app\.get\('\/tenant\/:tenant\/public'/);
  assert.match(source, /app\.get\('\/tenant\/:tenant\/personal'/);
  assert.match(source, /\/tenant\/\$\{encodeURIComponent\(tenant\)\}\/public/);
  assert.match(source, /\/tenant\/\$\{encodeURIComponent\(tenant\)\}\/personal/);
});

test('canonical widget contract standardizes geometry, opacity and media fit', () => {
  const context = { window: {}, structuredClone: global.structuredClone, JSON, Date };
  vm.createContext(context);
  vm.runInContext(read('public/shared/overlay-widget-contract.js'), context);
  const contract = context.window.SPMTOverlayWidgets;
  assert.deepEqual({ ...contract.scene }, { width: 960, height: 540 });
  const widget = contract.normalizeWidget({ id: 'x', kind: 'image', opacity: 8, fit: 'bad', width: -1, height: 99999 });
  assert.equal(widget.opacity, 1);
  assert.equal(widget.fit, 'contain');
  assert.equal(widget.width, 24);
  assert.equal(widget.height, 1080);
  const full = contract.fullScene(widget, 'cover');
  assert.equal(full.x, 0);
  assert.equal(full.y, 0);
  assert.equal(full.width, 960);
  assert.equal(full.height, 540);
  assert.equal(full.fit, 'cover');
});

test('tenant output is transparent and renders saved zIndex instead of inventing layer order', () => {
  const source = read('public/tenant-output.html');
  assert.match(source, /background:transparent!important/);
  assert.match(source, /z-index:\$\{z\}/);
  assert.match(source, /filter\(\(widget\) => widget\.visible !== false\)/);
  assert.match(source, /state\.xboxStatusKnown && state\.xboxRunning \? 'visible' : 'hidden'/);
  assert.match(source, /\/api\/tenant-xbox\/status/);
  assert.match(source, /\/api\/tenant-xbox\/frame/);
  assert.doesNotMatch(source, /spmt_token=.*[?&]/i);
});

test('Overlay Bay v3 exposes tenant outputs and standardized source controls', () => {
  const source = read('public/shared/overlay-platform-v3.js');
  for (const marker of [
    'data-select-output="public"',
    'data-select-output="personal"',
    'data-copy-output="${kind}"',
    "urlRow('public', platformState.urls?.public)",
    "urlRow('personal', platformState.urls?.personal)",
    'data-inspector-opacity',
    'data-inspector-fit',
    'data-inspector-action="full"',
    'data-inspector-action="fit"',
    'data-inspector-action="fill"',
    'data-inspector-action="stretch"',
    'data-inspector-action="center"',
    'data-inspector-action="front"',
    'data-inspector-action="back"',
  ]) assert.ok(source.includes(marker), `missing ${marker}`);
  assert.match(source, /\/api\/tenant-scene\?output=/);
  assert.match(source, /\/api\/tenant-scene\/\$\{platformState\.output\}/);
});

test('binding guard reloads requested output after legacy first render and removes stale save listener', () => {
  const source = read('public/shared/overlay-platform-v3-binding-fix.js');
  assert.match(source, /params\.get\('output'\) === 'personal'/);
  assert.match(source, /await load\(requestedOutput\)/);
  assert.match(source, /button\.cloneNode\(true\)/);
  assert.match(source, /button\.replaceWith\(replacement\)/);
  assert.match(source, /await save\(\)/);
  assert.match(source, /MutationObserver/);
});

test('new browser scripts parse before deployment', () => {
  assert.doesNotThrow(() => new vm.Script(read('public/shared/overlay-widget-contract.js')));
  assert.doesNotThrow(() => new vm.Script(read('public/shared/overlay-platform-v3.js')));
  assert.doesNotThrow(() => new vm.Script(read('public/shared/overlay-platform-v3-binding-fix.js')));
  const html = read('public/tenant-output.html');
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(inlineScripts.length >= 1);
  inlineScripts.forEach((script) => assert.doesNotThrow(() => new vm.Script(script)));
});

test('startup, runtime image and shared surface load tenant overlay platform without replacing Xbox worker code', () => {
  const start = read('start.cjs');
  const localStart = read('scripts/start.mjs');
  const dockerfile = read('Dockerfile');
  const shared = read('public/shared/index.html');
  assert.match(start, /tenant-overlay-bootstrap\.cjs/);
  assert.match(localStart, /tenant-overlay-bootstrap\.cjs/);
  assert.match(dockerfile, /COPY tenant-overlay-bootstrap\.cjs \.\/tenant-overlay-bootstrap\.cjs/);
  assert.match(shared, /overlay-widget-contract\.js/);
  assert.match(shared, /overlay-platform-v3\.css/);
  assert.match(shared, /overlay-platform-v3\.js/);
  assert.match(shared, /overlay-platform-v3-binding-fix\.js/);
  assert.match(start, /cloud-xbox-bootstrap\.cjs/);
});

test('tenant helper produces tenant-first canonical URLs', () => {
  const urls = bootstrap._test.urlsForTenant('mtman1987');
  assert.equal(urls.public, 'https://spmt.live/tenant/mtman1987/public');
  assert.equal(urls.personal, 'https://spmt.live/tenant/mtman1987/personal');
  assert.equal(bootstrap._test.tenantSlug('Mtman1987'), 'mtman1987');
  assert.equal(bootstrap._test.outputName('personal'), 'personal');
  assert.equal(bootstrap._test.outputName('nope'), '');
});