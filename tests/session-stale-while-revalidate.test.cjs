'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

test('session cache stores only the last rendered private shell data', () => {
  const source = read('public', 'shared', 'session-cache.js');
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /\['bridge', 'workspace', 'overlay'\]/);
  assert.doesNotMatch(source, /spmt_token|authorization|password/i);
});

test('session bridge confirms transient failures before the shell signs out', () => {
  const source = read('public', 'shared', 'session-cache.js');
  assert.match(source, /installBridgeFetchResilience/);
  assert.match(source, /\/api\/session\/bridge/);
  assert.match(source, /\[401, 403, 502, 503, 504\]/);
  assert.match(source, /setTimeout\(resolve, 450\)/);
  assert.match(source, /cache: 'no-store'/);
});

test('primary SPMT shell restores cached identity before background revalidation', () => {
  const html = read('public', 'index.html');
  const cacheLoader = html.indexOf('<script src="/shared/session-cache.js"></script>');
  const inlineBoot = html.indexOf('const sessionCache = window.SpmtSessionCache');
  const bootSource = html.slice(html.indexOf('async function boot()'));
  assert.ok(cacheLoader >= 0 && cacheLoader < inlineBoot, 'cache loader must run before the inline application boot');
  assert.ok(bootSource.indexOf("sessionCache.read('bridge')") < bootSource.indexOf('await loadBridge();'), 'cached identity must render before the live bridge request completes');
  assert.match(html, /error\?\.status !== 401 && error\?\.status !== 403/);
  assert.match(html, /function revealSignedOut\(\)[\s\S]*sessionCache\.clearPrivate\(\)/);
  assert.match(html, /async function logout\(\)[\s\S]*sessionCache\.clearPrivate\(\)/);

  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  assert.doesNotThrow(() => new vm.Script(scripts.at(-1)), 'primary inline boot must remain valid browser JavaScript');
});

test('shared settings and shell chrome use stale-while-revalidate without focus request storms', () => {
  const sharedHtml = read('public', 'shared', 'index.html');
  assert.ok(sharedHtml.indexOf('/shared/session-cache.js') < sharedHtml.indexOf('/shared/shared.js'));

  const shared = read('public', 'shared', 'shared.js');
  const chrome = read('public', 'shared', 'shell-chrome.js');
  const theme = read('public', 'shared', 'shell-theme.js');
  for (const source of [shared, chrome, theme]) assert.doesNotThrow(() => new vm.Script(source));

  assert.match(shared, /sessionCache\.read\('workspace'\)/);
  assert.match(shared, /Showing saved workspace revision/);
  assert.match(shared, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(shared, /save-button'\)\.disabled = cached/);
  assert.match(chrome, /lastRuntimeRefreshAt/);
  assert.match(chrome, /30_000/);
  assert.match(theme, /lastRefreshAt/);
  assert.match(theme, /30_000/);
});
