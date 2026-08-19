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

ensureClientScopes('streamweaver', ['entitlements:read', 'events:write', 'account-recovery:write', 'chat-tag:blacklist:read']);
ensureClientScopes('discord-stream-hub', ['discord:control', 'athena:write', 'identity:write', 'events:write', 'xp:write']);

const tokenBefore = `    const requestedScopes = String(scope || '').split(/\\s+/).map((value) => value.trim()).filter(Boolean);
    const scopes = requestedScopes.length ? Array.from(new Set(requestedScopes)) : allowedScopes;
    if (!scopes.length || scopes.some((value) => !allowedScopes.includes(value))) {`;
const tokenAfter = `    const requestedScopes = String(scope || '').split(/\\s+/).map((value) => value.trim()).filter(Boolean);
    if (!requestedScopes.length) {
      return res.status(400).json({ error: 'client_credentials requires an explicit scope' });
    }
    const scopes = Array.from(new Set(requestedScopes));
    if (scopes.some((value) => !allowedScopes.includes(value))) {`;
if (source.includes(tokenBefore)) {
  source = source.replace(tokenBefore, tokenAfter);
} else if (!source.includes("client_credentials requires an explicit scope")) {
  throw new Error('SPMT explicit client-credentials scope contract marker missing');
}

const eventBefore = `app.get('/api/platform/events', authenticatePlatformKey('events:write'), (req: any, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const events = db.prepare(\`
    SELECT id, type, version, timestamp, source_app, actor_user_id, actor_username,
      actor_display_name, visibility, payload, links, created_by, created_at
    FROM platform_events
    WHERE created_by = ? AND (? IS NULL OR source_app = ?)
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  \`).all(req.platformKey.userId, req.platformKey.appId, req.platformKey.appId, limit) as any[];`;
const eventAfter = `app.get('/api/platform/events', authenticatePlatformKey('events:write'), (req: any, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const events = req.platformKey.service
    ? db.prepare(\`
        SELECT id, type, version, timestamp, source_app, actor_user_id, actor_username,
          actor_display_name, visibility, payload, links, created_by, created_at
        FROM platform_events
        WHERE created_by IS NULL AND source_app = ?
        ORDER BY datetime(created_at) DESC
        LIMIT ?
      \`).all(req.platformKey.appId, limit) as any[]
    : db.prepare(\`
        SELECT id, type, version, timestamp, source_app, actor_user_id, actor_username,
          actor_display_name, visibility, payload, links, created_by, created_at
        FROM platform_events
        WHERE created_by = ? AND (? IS NULL OR source_app = ?)
        ORDER BY datetime(created_at) DESC
        LIMIT ?
      \`).all(req.platformKey.userId, req.platformKey.appId, req.platformKey.appId, limit) as any[];`;
if (source.includes(eventBefore)) {
  source = source.replace(eventBefore, eventAfter);
} else if (!source.includes('WHERE created_by IS NULL AND source_app = ?')) {
  throw new Error('SPMT service event read contract marker missing');
}

fs.writeFileSync(serverFile, source, 'utf8');
console.log('Canonical SPMT service scopes and machine contracts applied.');
