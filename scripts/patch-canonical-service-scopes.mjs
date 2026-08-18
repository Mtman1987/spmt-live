import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverFile = path.join(root, 'server.ts');
let source = fs.readFileSync(serverFile, 'utf8').replace(/\r\n/g, '\n');

const marker = "const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {\n";

function ensureClientScopes(clientId, requiredScopes) {
  const blockStart = source.indexOf(marker);
  if (blockStart < 0) throw new Error('SPMT client-credentials scope allow-list marker missing');
  const blockEnd = source.indexOf('\n};', blockStart);
  if (blockEnd < 0) throw new Error('SPMT client-credentials scope allow-list end marker missing');

  const block = source.slice(blockStart, blockEnd);
  const escaped = clientId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const entry = new RegExp(`(^\\s*(?:['\"]?${escaped}['\"]?)\\s*:\\s*\\[)([^\\]]*)(\\]\\s*,?)`, 'm');
  const existing = block.match(entry);

  if (!existing) {
    source = source.replace(marker, marker + `  '${clientId}': [${requiredScopes.map((scope) => `'${scope}'`).join(', ')}],\n`);
    return;
  }

  const present = new Set(Array.from(existing[2].matchAll(/['\"]([^'\"]+)['\"]/g), (match) => match[1]));
  const missing = requiredScopes.filter((scope) => !present.has(scope));
  if (!missing.length) return;

  const scopes = existing[2].trim().replace(/,\s*$/, '');
  const addition = missing.map((scope) => `'${scope}'`).join(', ');
  const replacement = `${existing[1]}${scopes ? `${scopes}, ` : ''}${addition}${existing[3]}`;
  const nextBlock = block.replace(entry, replacement);
  source = source.slice(0, blockStart) + nextBlock + source.slice(blockEnd);
}

ensureClientScopes('streamweaver', ['entitlements:read', 'events:write', 'account-recovery:write']);
ensureClientScopes('discord-stream-hub', ['discord:control', 'athena:write', 'identity:write', 'events:write', 'xp:write']);

fs.writeFileSync(serverFile, source, 'utf8');
console.log('Canonical SPMT service scopes applied.');
