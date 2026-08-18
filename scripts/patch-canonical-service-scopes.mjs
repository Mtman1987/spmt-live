import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverFile = path.join(root, 'server.ts');
let source = fs.readFileSync(serverFile, 'utf8').replace(/\r\n/g, '\n');

const marker = "const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {\n";
const blockStart = source.indexOf(marker);
if (blockStart < 0) throw new Error('SPMT client-credentials scope allow-list marker missing');
const blockEnd = source.indexOf('\n};', blockStart);
if (blockEnd < 0) throw new Error('SPMT client-credentials scope allow-list end marker missing');

const block = source.slice(blockStart, blockEnd);
const streamweaverEntry = /(^\s*(?:['"]?streamweaver['"]?)\s*:\s*\[)([^\]]*)(\]\s*,?)/m;
const existing = block.match(streamweaverEntry);

if (existing) {
  if (!/['"]entitlements:read['"]/.test(existing[2])) {
    const scopes = existing[2].trim().replace(/,\s*$/, '');
    const replacement = `${existing[1]}${scopes ? `${scopes}, ` : ''}'entitlements:read'${existing[3]}`;
    const nextBlock = block.replace(streamweaverEntry, replacement);
    source = source.slice(0, blockStart) + nextBlock + source.slice(blockEnd);
  }
} else {
  source = source.replace(marker, marker + "  'streamweaver': ['entitlements:read'],\n");
}

fs.writeFileSync(serverFile, source, 'utf8');
console.log('Canonical SPMT service scopes applied.');
