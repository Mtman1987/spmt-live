'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Commlink loads the restored physics puzzle after the main runtime', () => {
  const patch = read('scripts/patch-commlink-black-hole-physics.mjs');
  assert.match(patch, /\/commlink\/commlink\.js/);
  assert.match(patch, /\/commlink\/black-hole-puzzle\.js/);
  assert.match(patch, /source\.replace\(commlinkScript/);
});

test('Commlink black hole returns to the old Cosmo logo-sized physics interaction', () => {
  const source = read('public/commlink/black-hole-puzzle.js');
  assert.doesNotThrow(() => new vm.Script(source), 'Commlink black-hole puzzle must remain valid browser JavaScript');
  assert.match(source, /PUZZLE_DURATION_MS\s*=\s*120_000/);
  assert.match(source, /ARTIFACTS\s*=\s*\[/);
  assert.match(source, /id:\s*'planet'/);
  assert.match(source, /id:\s*'rocket'/);
  assert.match(source, /id:\s*'asteroid'/);
  assert.match(source, /createArtifactLayer\(\)/);
  assert.match(source, /requestAnimationFrame\(step\)/);
  assert.match(source, /segmentCrossesCircle/);
  assert.match(source, /Math\.hypot/);
  assert.match(source, /#cosmo-logo\.cosmo-black-hole-active \.brand-orbit/);
  assert.match(source, /width:\s*39px/);
  assert.match(source, /height:\s*39px/);
  assert.match(source, /#black-hole-game \{ display: none !important; \}/);
});

test('only the black hole is interactive and every click excites the drifting artifacts', () => {
  const source = read('public/commlink/black-hole-puzzle.js');
  assert.match(source, /pointer-events:\s*none/);
  assert.match(source, /runtime\.logo\.addEventListener\('click'/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /capture:\s*true/);
  assert.match(source, /if \(runtime\.active\) \{\s*exciteArtifacts\(\)/);
  assert.match(source, /startPuzzle\(\)/);
  assert.match(source, /exciteArtifacts\(\);/);
  assert.match(source, /artifact\.vx \+= \(Math\.random\(\) - \.5\) \* 12/);
  assert.doesNotMatch(source, /artifact\.addEventListener\('click'/);
  assert.doesNotMatch(source, /data-artifact=/);
});

test('artifacts are consumed by physical crossing and reappear at their retained positions after completion', () => {
  const source = read('public/commlink/black-hole-puzzle.js');
  assert.match(source, /segmentCrossesCircle\(previousX, previousY, artifact\.x, artifact\.y/);
  assert.match(source, /captureArtifact\(artifact\)/);
  assert.match(source, /artifact\.consumed = true/);
  assert.match(source, /runtime\.artifacts\.every\(\(item\) => item\.consumed\)/);
  assert.match(source, /recordDiscovery\('cosmo-black-hole'\)/);
  assert.match(source, /function restoreArtifacts\(\)/);
  assert.match(source, /artifact\.consumed = false/);
  assert.match(source, /renderArtifact\(artifact\)/);
  assert.doesNotMatch(source, /artifact\.x = Math\.random/);
  assert.doesNotMatch(source, /artifact\.y = Math\.random/);
});
