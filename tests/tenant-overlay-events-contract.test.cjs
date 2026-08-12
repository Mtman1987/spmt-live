'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const events = require(path.join(root, 'tenant-overlay-events-bootstrap.cjs'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('tenant alert contract normalizes event types and fans out by default', () => {
  const alert = events._test.normalizeAlert({ eventType: 'follow', user: 'Tester' });
  assert.equal(alert.eventType, 'follow');
  assert.equal(alert.user, 'Tester');
  assert.deepEqual(events._test.normalizeOutputs(), ['public', 'personal']);
  assert.deepEqual(events._test.normalizeOutputs(['personal']), ['personal']);
});

test('event bootstrap exposes authenticated publisher, renderer feed, and Personal launch', () => {
  const source = read('tenant-overlay-events-bootstrap.cjs');
  assert.match(source, /app\.post\('\/api\/tenant-overlay-alert'/);
  assert.match(source, /app\.get\('\/api\/tenant\/:tenant\/alerts'/);
  assert.match(source, /app\.get\('\/api\/personal-overlay-launch'/);
  assert.match(source, /x-spmt-render-key/);
  assert.match(source, /#render=/);
  assert.match(source, /MAX_EVENTS = 120/);
  assert.match(source, /tenant-overlay-live-events\.js/);
  assert.match(source, /tenant-personal-render-auth\.js/);
});

test('Personal render key stays in fragment and is sent only as a scoped read header', () => {
  const auth = read('public/shared/tenant-personal-render-auth.js');
  assert.match(auth, /location\.hash/);
  assert.match(auth, /sessionStorage/);
  assert.match(auth, /history\.replaceState/);
  assert.match(auth, /x-spmt-render-key/);
  assert.doesNotMatch(auth, /[?&]render=/);
  assert.doesNotThrow(() => new vm.Script(auth));
});

test('canonical renderer polls tenant alert events and Overlay Bay publishes tests', () => {
  const consumer = read('public/shared/tenant-overlay-live-events.js');
  const publisher = read('public/shared/tenant-overlay-alert-publisher.js');
  assert.match(consumer, /\/api\/tenant\/\$\{encodeURIComponent\(tenant\)\}\/alerts/);
  assert.match(consumer, /window\.spmtOverlayAlert/);
  assert.match(publisher, /\/api\/tenant-overlay-alert/);
  assert.match(publisher, /\['public', 'personal'\]/);
  assert.doesNotThrow(() => new vm.Script(consumer));
  assert.doesNotThrow(() => new vm.Script(publisher));
});

test('empty outputs still have a replaceable default alert surface', () => {
  const renderer = read('public/tenant-output.html');
  assert.match(renderer, /const DEFAULT_ALERT_WIDGET =/);
  assert.match(renderer, /const allWidgets = layout\.widgets \|\| \[\]/);
  assert.match(renderer, /const hasSavedAlert = allWidgets\.some\(\(widget\) => widget\.kind === 'alert'\)/);
  assert.match(renderer, /hasSavedAlert \? ''/);
  assert.match(renderer, /alertId === DEFAULT_ALERT_WIDGET\.id/);
  assert.match(renderer, /SpaceMountain Default Alert/);
  const inlineScripts = [...renderer.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.ok(inlineScripts.length >= 1);
  inlineScripts.forEach((script) => assert.doesNotThrow(() => new vm.Script(script)));
});

test('production image and startup include the event bootstrap', () => {
  assert.match(read('Dockerfile'), /COPY tenant-overlay-events-bootstrap\.cjs/);
  const start = read('start.cjs');
  assert.match(start, /installTenantOverlayEventsBootstrap/);
  assert.ok(start.indexOf('installTenantOverlayEventsBootstrap') < start.indexOf('installTenantOverlayBootstrap'));
  assert.match(start, /tenant-overlay-alert-publisher\.js/);
  assert.match(start, /personal-overlay-launch-client\.js/);
});
