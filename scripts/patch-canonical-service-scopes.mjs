import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverFile = path.join(root, 'server.ts');
let source = fs.readFileSync(serverFile, 'utf8').replace(/\r\n/g, '\n');

const marker = "const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {\n";
if (!source.includes(marker)) throw new Error('SPMT client-credentials scope allow-list marker missing');

if (!source.includes("  'streamweaver': ['entitlements:read'],")) {
  source = source.replace(
    marker,
    marker + "  'streamweaver': ['entitlements:read'],\n",
  );
}

fs.writeFileSync(serverFile, source, 'utf8');
console.log('Canonical SPMT service scopes applied.');
