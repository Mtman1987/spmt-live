'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const entrypoint = path.join(repoRoot, 'start.cjs');
const docsBundleModuleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'docs-bundle.mjs')).href;

test('production entrypoint installs the canonical workspace shell loaders exactly once', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-theme-bootstrap-'));
  const publicIndexPath = path.join(tempRoot, 'index.html');
  const sharedIndexPath = path.join(tempRoot, 'shared.html');
  const tenantOutputPath = path.join(tempRoot, 'tenant-output.html');
  const invalidDatabaseParent = path.join(tempRoot, 'not-a-directory');
  fs.writeFileSync(publicIndexPath, '<!doctype html><html><body><main>SPMT</main></body></html>');
  fs.writeFileSync(sharedIndexPath, '<!doctype html><html><body><main>Shared</main></body></html>');
  fs.writeFileSync(tenantOutputPath, '<!doctype html><html><body><main>Tenant</main></body></html>');
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
      SPMT_SHARED_INDEX_PATH: sharedIndexPath,
      SPMT_TENANT_OUTPUT_PATH: tenantOutputPath,
    },
  });

  const first = run();
  assert.equal(first.error, undefined, first.error?.message || 'startup process failed to launch');
  assert.equal(first.status, 1, 'server should fail closed on the intentionally invalid database path');
  let html = fs.readFileSync(publicIndexPath, 'utf8');
  assert.match(html, /<script src="\/shared\/session-cache\.js" defer><\/script>/);
  assert.match(html, /<script src="\/shared\/shell-theme\.js" defer><\/script>/);
  assert.match(html, /<script src="\/shared\/shell-chrome\.js" defer><\/script>/);
  assert.match(html, /<script src="\/shared\/companion-installer-ui\.js" defer><\/script>/);
  assert.match(html, /<script src="\/shared\/overlay-bay-shell-nav\.js" defer><\/script>/);

  const second = run();
  assert.equal(second.error, undefined, second.error?.message || 'second startup process failed to launch');
  assert.equal(second.status, 1, 'second server should also fail closed on the intentionally invalid database path');
  html = fs.readFileSync(publicIndexPath, 'utf8');
  assert.equal((html.match(/\/shared\/session-cache\.js/g) || []).length, 1, 'session cache loader must not be duplicated across restarts');
  assert.equal((html.match(/\/shared\/shell-theme\.js/g) || []).length, 1, 'theme loader must not be duplicated across restarts');
  assert.equal((html.match(/\/shared\/shell-chrome\.js/g) || []).length, 1, 'shell chrome loader must not be duplicated across restarts');
  assert.equal((html.match(/\/shared\/companion-installer-ui\.js/g) || []).length, 1, 'Companion installer UI loader must not be duplicated across restarts');
  assert.equal((html.match(/\/shared\/overlay-bay-shell-nav\.js/g) || []).length, 1, 'Overlay Bay shell loader must not be duplicated across restarts');
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

test('Overlay Bay is exposed as a first-class SPMT shell view', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'shared', 'overlay-bay-shell-nav.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source), 'Overlay Bay shell extension must remain valid browser JavaScript');
  assert.match(source, /dataset\.view/);
  assert.match(source, /overlay-bay/);
  assert.match(source, /\/embed\/overlays\?mode=full&app=spmt-shell/);
  assert.match(source, /Open Overlay Bay/);
});

test('Companion desktop download is described as an installer, not a ZIP', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'shared', 'companion-installer-ui.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source), 'Companion installer UI patch must remain valid browser JavaScript');
  assert.match(source, /Download installer/, 'Companion download action should say installer');
  assert.match(source, /Unsigned installer/, 'Companion status should truthfully say unsigned installer');
  assert.match(source, /\/api\/companion\/bootstrap/, 'Companion download should request a tenant-bound one-time link');
  assert.match(source, /spmt:companion-bootstrap/, 'tenant link should survive while the Windows installer runs');
  assert.match(source, /Connect installed Companion/, 'the signed-in download flow should complete through the registered app protocol');
});

test('public docs manifest only references safe existing Markdown sources', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs', 'docs-nav.json'), 'utf8'));
  const paths = manifest.sections.flatMap((section) => section.items || []).map((item) => item.path);
  assert.ok(paths.length > 0, 'docs manifest must contain public documents');
  assert.equal(new Set(paths).size, paths.length, 'docs manifest should not contain duplicate document paths');
  for (const docPath of paths) {
    assert.match(docPath, /^(docs|spec)\/[A-Za-z0-9_./-]+\.md$/, `unsafe public docs path: ${docPath}`);
    assert.equal(docPath.includes('..'), false, `path traversal is not allowed: ${docPath}`);
    assert.equal(docPath.startsWith('docs/archive/'), false, `archive files must not be public bundle inputs: ${docPath}`);
    assert.equal(fs.existsSync(path.join(repoRoot, docPath)), true, `missing public docs source: ${docPath}`);
  }
});

test('generated docs bundle contains every public manifest document exactly once and in order', async () => {
  const { buildDocsBundle } = await import(docsBundleModuleUrl);
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs', 'docs-nav.json'), 'utf8'));
  const paths = manifest.sections.flatMap((section) => section.items || []).map((item) => item.path);
  const result = await buildDocsBundle({ repoRoot });
  assert.equal(result.documentCount, paths.length);
  assert.deepEqual(result.paths, paths);
  assert.match(result.markdown, /^# SPMT Documentation\n/);
  assert.equal(result.markdown.includes('docs/archive/'), false);
  let previousIndex = -1;
  for (const docPath of paths) {
    const marker = `<!-- Source: ${docPath} -->`;
    const first = result.markdown.indexOf(marker);
    assert.ok(first > previousIndex, `${docPath} should follow manifest order`);
    assert.equal(result.markdown.indexOf(marker, first + marker.length), -1, `${docPath} should appear once`);
    previousIndex = first;
  }
});

test('production image generates the docs bundle and exposes specification Markdown', () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /RUN node scripts\/docs-bundle\.mjs/, 'image build must generate public docs bundle');
  assert.match(dockerfile, /COPY --from=build \/app\/public \.\/public/, 'runtime image must copy generated public tree');
  assert.match(dockerfile, /COPY --from=build \/app\/spec \.\/public\/spec/, 'runtime image must expose spec Markdown used by docs navigation');
});
