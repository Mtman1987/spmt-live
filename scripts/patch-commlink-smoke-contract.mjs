import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokePath = path.join(root, 'scripts', 'smoke.mjs');
const source = fs.readFileSync(smokePath, 'utf8');
const before = "assert.match(commlink, /Canonical SPMT messaging workspace/);";
const after = "assert.match(commlink, /SPMT-owned Commlink workspace/);";

if (source.includes(after)) {
  console.log('Commlink smoke contract already matches SPMT ownership.');
  process.exit(0);
}
if (!source.includes(before)) {
  throw new Error('Commlink smoke ownership assertion marker is missing.');
}
fs.writeFileSync(smokePath, source.replace(before, after), 'utf8');
console.log('Commlink smoke contract now matches the SPMT-owned workspace banner.');
