'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const entrypoint = path.join(repoRoot, 'start.cjs');

test('production entrypoint installs the canonical workspace shell loaders exactly once', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-theme-bootstrap-'));
  const publicIndexPath = path.join(tempRoot, 'index.html');
  const invalidDatabaseParent = path.join(tempRoot, 'not-a-directory');
  fs.writeFileSync(publicIndexPath, '<!doctype html><html><body><main>SPMT</main></body></html>');
  fs.writeFileSync(invalidDatabaseParent, 'force server startup to fail after bootstrap');

  const run = () => spawnSync(process.execPath, [entrypoint], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'startup-theme-test-secret',
      DATABASE_PATH: path.join(invalidDatabaseParent, 'spmt.db'),
      SPMT_PUBLIC_INDEX_PATH: publicIndexPath,
    },
  });

  const first = run();
  assert.equal(first.error, undefined, first.error?.message || 'startup process failed to launch');
  assert.equal(first.status, 1, 'server should fail closed on the intentionally invalid database path');
  let html = fs.readFileSync(publicIndexPath, 'utf8');
  assert.match(html, /<script src="\/shared\/shell-theme\.js" defer><\/script>/);
  assert.match(html, /<script src="\/shared\/shell-chrome\.js" defer><\/script>/);

  const second = run();
  assert.equal(second.error, undefined, second.error?.message || 'second startup process failed to launch');
  assert.equal(second.status, 1, 'second server should also fail closed on the intentionally invalid database path');
  html = fs.readFileSync(publicIndexPath, 'utf8');
  assert.equal((html.match(/\/shared\/shell-theme\.js/g) || []).length, 1, 'theme loader must not be duplicated across restarts');
  assert.equal((html.match(/\/shared\/shell-chrome\.js/g) || []).length, 1, 'shell chrome loader must not be duplicated across restarts');
});

test('canonical shell renderer uses scattered stars and derived glass surfaces', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'shared', 'shell-theme.js'), 'utf8');
  assert.match(source, /spmt-canonical-stars/, 'theme renderer should create a scattered star layer');
  assert.match(source, /--spmt-surface-glass/, 'theme renderer should derive transparent content surfaces');
  assert.match(source, /--spmt-sidebar-glass/, 'theme renderer should derive sidebar transparency separately');
  assert.doesNotMatch(source, /--spmt-star-spacing/, 'theme renderer must not use tiled star spacing that creates a visible grid');
});

test('canonical shell chrome mounts branding, welcome heroes, sidebar collapse, worktray, and overlay runtime', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'shared', 'shell-chrome.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source), 'shell chrome must remain valid browser JavaScript');
  assert.match(source, /space-logo-main\.png/, 'welcome hero should use the canonical SpaceMountain logo asset');
  assert.match(source, /model-rocket\.png/, 'shell brand should use the canonical rocket mark');
  assert.match(source, /spmt-welcome-hero/, 'login and dashboard should receive the welcome hero');
  assert.match(source, /spmt-sidebar-collapse-toggle/, 'signed-in shell should expose a sidebar collapse control');
  assert.match(source, /spmt-workspace-tray/, 'signed-in shell should mount the Worktray footer');
  assert.match(source, /\/api\/overlay-workspace/, 'signed-in shell should read the canonical overlay workspace');
  assert.match(source, /spmt-overlay-runtime/, 'saved overlays should render on the account shell');
});
