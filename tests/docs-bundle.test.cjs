'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const moduleUrl = pathToFileURL(path.join(repoRoot, 'scripts', 'docs-bundle.mjs')).href;

function manifestPaths(manifest) {
  return manifest.sections.flatMap((section) => section.items || []).map((item) => item.path);
}

test('public docs manifest only references safe existing Markdown sources', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs', 'docs-nav.json'), 'utf8'));
  const paths = manifestPaths(manifest);
  assert.ok(paths.length > 0, 'docs manifest must contain public documents');
  assert.equal(new Set(paths).size, paths.length, 'docs manifest should not contain duplicate document paths');

  for (const docPath of paths) {
    assert.match(docPath, /^(docs|spec)\/[A-Za-z0-9_./-]+\.md$/, `unsafe public docs path: ${docPath}`);
    assert.equal(docPath.includes('..'), false, `path traversal is not allowed: ${docPath}`);
    assert.equal(docPath.startsWith('docs/archive/'), false, `archive files must not be public bundle inputs: ${docPath}`);
    assert.equal(fs.existsSync(path.join(repoRoot, docPath)), true, `missing public docs source: ${docPath}`);
  }
});

test('bundle contains every manifest document once and preserves manifest order', async () => {
  const { buildDocsBundle } = await import(moduleUrl);
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs', 'docs-nav.json'), 'utf8'));
  const paths = manifestPaths(manifest);
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

test('bundle writer creates a downloadable Markdown file', async (t) => {
  const { writeDocsBundle } = await import(moduleUrl);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-docs-bundle-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const outputPath = path.join(tempDir, 'SPMT-DOCS.md');
  const result = await writeDocsBundle({ repoRoot, outputPath });

  assert.equal(result.outputPath, outputPath);
  assert.equal(fs.existsSync(outputPath), true);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), result.markdown);
});
