'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const startSource = fs.readFileSync('start.cjs', 'utf8');
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

function topLevelCjsRequires(source) {
  const files = new Set();
  for (const match of source.matchAll(/require\(['"]\.\/([^/'"]+\.cjs)['"]\)/g)) {
    files.add(match[1]);
  }
  return [...files].sort();
}

test('every top-level production bootstrap required by start.cjs is packaged in the runtime image', () => {
  const requiredBootstraps = topLevelCjsRequires(startSource);
  assert.ok(requiredBootstraps.length > 0, 'start.cjs should require production bootstrap modules');

  for (const file of requiredBootstraps) {
    assert.ok(fs.existsSync(file), `start.cjs requires missing source bootstrap: ${file}`);
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      dockerfile,
      new RegExp(`^COPY\\s+${escaped}\\s+\\.\\/${escaped}$`, 'm'),
      `Docker runtime image does not copy bootstrap required by start.cjs: ${file}`,
    );
  }
});
