import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEcosystemSnapshot, resolveEcosystemTemplates } from './ecosystem-docs.mjs';

const PUBLIC_DOC_RE = /^(docs|spec)\/[A-Za-z0-9_./-]+\.md$/;

function validateDocPath(value) {
  const docPath = String(value || '').trim();
  if (!docPath || !PUBLIC_DOC_RE.test(docPath) || docPath.includes('..') || docPath.includes('\\')) {
    throw new Error(`Unsafe public documentation path: ${docPath || '<empty>'}`);
  }
  if (docPath.startsWith('docs/archive/')) {
    throw new Error(`Archived documentation cannot be included in the public bundle: ${docPath}`);
  }
  return docPath;
}

export async function loadDocsManifest(repoRoot = process.cwd()) {
  const manifestPath = path.join(repoRoot, 'docs', 'docs-nav.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest?.sections)) throw new Error('docs/docs-nav.json must contain a sections array');
  return manifest;
}

export async function buildDocsBundle({ repoRoot = process.cwd(), ecosystemSnapshot = null } = {}) {
  const manifest = await loadDocsManifest(repoRoot);
  const seen = new Set();
  const chunks = [
    '# SPMT Documentation',
    '',
    'Complete public documentation bundle for spmt.live.',
    ...(ecosystemSnapshot ? [
      '',
      `Ecosystem snapshot: ${ecosystemSnapshot.generatedAt}`,
      `Ecosystem schema: ${ecosystemSnapshot.schemaVersion}`,
    ] : []),
    '',
    'This file is generated from `docs/docs-nav.json` during the application image build. Edit the source Markdown files, not this generated bundle.',
  ];

  let documentCount = 0;
  for (const section of manifest.sections) {
    const sectionTitle = String(section?.title || 'Documentation').trim() || 'Documentation';
    const items = Array.isArray(section?.items) ? section.items : [];
    const sectionDocs = [];

    for (const item of items) {
      const docPath = validateDocPath(item?.path);
      if (seen.has(docPath)) continue;
      seen.add(docPath);
      const absolutePath = path.resolve(repoRoot, docPath);
      const allowedRoot = path.resolve(repoRoot) + path.sep;
      if (!absolutePath.startsWith(allowedRoot)) throw new Error(`Documentation path escapes repository root: ${docPath}`);
      const source = (await readFile(absolutePath, 'utf8')).trim();
      const body = ecosystemSnapshot && source.includes('{{')
        ? resolveEcosystemTemplates(source, ecosystemSnapshot)
        : source;
      sectionDocs.push([
        `<!-- Source: ${docPath} -->`,
        '',
        body,
      ].join('\n'));
      documentCount += 1;
    }

    if (sectionDocs.length) {
      chunks.push('', '---', '', `## ${sectionTitle}`, '', sectionDocs.join('\n\n---\n\n'));
    }
  }

  if (!documentCount) throw new Error('Public documentation manifest did not contain any Markdown documents');
  return { markdown: `${chunks.join('\n').trim()}\n`, documentCount, paths: [...seen] };
}

export async function writeDocsBundle({ repoRoot = process.cwd(), outputPath, ecosystemSnapshot = null } = {}) {
  const target = outputPath || path.join(repoRoot, 'public', 'docs', 'all.md');
  const snapshot = ecosystemSnapshot || await fetchEcosystemSnapshot();
  const result = await buildDocsBundle({ repoRoot, ecosystemSnapshot: snapshot });
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, result.markdown, 'utf8');
  return { ...result, outputPath: target, ecosystemSnapshot: snapshot };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const result = await writeDocsBundle({ repoRoot: process.cwd() });
  console.log(`[SPMT] Generated public docs bundle with ${result.documentCount} documents using ecosystem snapshot ${result.ecosystemSnapshot.generatedAt} at ${result.outputPath}.`);
}
