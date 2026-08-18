'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('SPMT shell loads the resurrected black-hole Easter egg', () => {
  const start = read('scripts/start.mjs');
  assert.match(start, /\/shared\/black-hole-easter-egg\.js/);
  assert.match(start, /installEasterEggEntitlementBootstrap/);
});

test('black-hole puzzle preserves the Cosmo game loop but uses canonical SPMT state', () => {
  const source = read('public/shared/black-hole-easter-egg.js');
  assert.doesNotThrow(() => new vm.Script(source), 'black-hole Easter egg must remain valid browser JavaScript');
  assert.match(source, /dblclick/);
  assert.match(source, /GAME_DURATION_MS\s*=\s*120000/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /Math\.hypot/);
  assert.match(source, /CAPTURE_RADIUS/);
  assert.match(source, /easter-eggs/);
  assert.match(source, /blackHole/);
  assert.match(source, /completed:\s*true/);
  assert.match(source, /If-Match/);
  assert.match(source, /status\s*===\s*409/);
  assert.match(source, /\.\.\.existingEggs/);
  assert.doesNotMatch(source, /Lord Puzzler/i);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /indexedDB/i);
});

test('black-hole completion only reports stabilized after bounded canonical persistence', () => {
  const source = read('public/shared/black-hole-easter-egg.js');
  assert.match(source, /async function finishGame\(won\)/);
  assert.match(source, /writeCompletion\(\)\.then\(\(\) => true\)/);
  assert.match(source, /window\.setTimeout\(\(\) => resolve\(false\), 6000\)/);
  assert.match(source, /persisted \? 'ANOMALY STABILIZED' : 'ANOMALY NOT RETAINED'/);
  assert.doesNotMatch(source, /result\.innerHTML = `<span>\$\{won \? 'ANOMALY STABILIZED'/);
});

test('black-hole hidden trigger works with mouse, touch/pointer, and keyboard double activation', () => {
  const source = read('public/shared/black-hole-easter-egg.js');
  assert.match(source, /mark\.addEventListener\('dblclick', activate\)/);
  assert.match(source, /mark\.addEventListener\('pointerup'/);
  assert.match(source, /event\.pointerType === 'mouse'/);
  assert.match(source, /lastPointerActivationAt/);
  assert.match(source, /mark\.addEventListener\('keydown'/);
  assert.match(source, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.match(source, /lastKeyboardActivationAt/);
  assert.match(source, /mark\.tabIndex = 0/);
});

test('machine-only entitlement derives Voidwalker from the three canonical egg flags', () => {
  const source = read('easter-egg-entitlement-bootstrap.cjs');
  assert.doesNotThrow(() => new vm.Script(source), 'entitlement bootstrap must remain valid CommonJS');
  assert.match(source, /\/api\/internal\/easter-eggs\/entitlement/);
  assert.match(source, /SYSTEM_API_KEY/);
  assert.match(source, /discord_id/);
  assert.match(source, /twitch_id/);
  assert.match(source, /app_state_records/);
  assert.match(source, /spacemountain-live/);
  assert.match(source, /blackHole/);
  assert.match(source, /eggs\.rocket\s*&&\s*eggs\.blackHole\s*&&\s*eggs\.signal/);
  assert.match(source, /Voidwalker/);
});
