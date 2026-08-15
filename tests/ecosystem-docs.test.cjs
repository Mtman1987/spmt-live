'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const resolverUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'ecosystem-docs.mjs')).href;
const bundleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'docs-bundle.mjs')).href;
const fixture = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tests', 'fixtures', 'ecosystem-snapshot-v1.json'), 'utf8'));

test('ecosystem template resolver replaces scalar values and fails closed on missing values', async () => {
  const { resolveEcosystemTemplates } = await import(resolverUrl);
  const resolved = resolveEcosystemTemplates('Base {{apps.spmt.urls.public}} state {{apps.spmt.services.spmt-live.runtime.status}}', fixture);
  assert.equal(resolved, 'Base https://spmt.live state running');
  assert.throws(() => resolveEcosystemTemplates('{{apps.spmt.urls.missing}}', fixture), /Missing ecosystem template value/);
  assert.throws(() => resolveEcosystemTemplates('{{apps.spmt.urls}}', fixture), /must be a scalar/);
});

test('docs bundle resolves all ecosystem variables when a v1 snapshot is supplied', async () => {
  const { buildDocsBundle } = await import(bundleUrl);
  const result = await buildDocsBundle({ repoRoot, ecosystemSnapshot: fixture });
  assert.match(result.markdown, /Ecosystem schema: spmt\.ecosystem-state\/v1/);
  assert.match(result.markdown, /Current Fly service state: `running`/);
  assert.match(result.markdown, /curl https:\/\/spmt\.live\/api\/me/);
  assert.equal(result.markdown.includes('{{'), false, 'resolved bundle must not contain ecosystem template markers');
});

test('live docs UI points only at the public v1 snapshot endpoint and fails closed on resolver errors', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'docs.html'), 'utf8');
  assert.match(source, /https:\/\/mtman-machine-rotator\.fly\.dev\/ecosystem\/v1\/public\.json/);
  assert.match(source, /spmt\.ecosystem-state\/v1/);
  assert.match(source, /Documentation Data Error/);
});
