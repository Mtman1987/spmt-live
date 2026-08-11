'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const entrypoint = path.join(repoRoot, 'start.cjs');

test('production entrypoint installs the canonical workspace theme loader exactly once', () => {
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

  const second = run();
  assert.equal(second.error, undefined, second.error?.message || 'second startup process failed to launch');
  assert.equal(second.status, 1, 'second server should also fail closed on the intentionally invalid database path');
  html = fs.readFileSync(publicIndexPath, 'utf8');
  assert.equal((html.match(/\/shared\/shell-theme\.js/g) || []).length, 1, 'theme loader must not be duplicated across restarts');
});
