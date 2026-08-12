const fs = require('node:fs');
const path = 'server.ts';
let source = fs.readFileSync(path, 'utf8');

const scopesBefore = `const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {\n  'spacemountain-live': ['xp:write'],\n};`;
const scopesAfter = `const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {\n  'spacemountain-live': ['xp:write'],\n  'discord-stream-hub': ['discord:control', 'athena:write'],\n};`;
if (!source.includes(scopesBefore)) throw new Error('client credential scope block changed');
source = source.replace(scopesBefore, scopesAfter);

const marker = `// ─── OAuth2: User info (for apps to verify tokens) ───`;
const route = `// ─── OAuth2: Service info (for apps to verify client-credentials tokens) ───\napp.get('/api/oauth/serviceinfo', (req: any, res) => {\n  const bearer = String(req.headers.authorization || '').match(/^Bearer\\s+(.+)$/i)?.[1]?.trim() || '';\n  if (!bearer) return res.status(401).json({ error: 'Missing bearer token' });\n  try {\n    const payload = jwt.verify(bearer, JWT_SECRET) as any;\n    const clientId = String(payload?.client_id || '').trim();\n    const tokenUse = String(payload?.token_use || '').trim();\n    const scopes = Array.isArray(payload?.scopes) ? payload.scopes.map(String) : [];\n    if (!clientId || tokenUse !== 'client_credentials') {\n      return res.status(401).json({ error: 'Client-credentials token required' });\n    }\n    return res.json({ client_id: clientId, token_use: tokenUse, scopes });\n  } catch {\n    return res.status(401).json({ error: 'Invalid or expired bearer token' });\n  }\n});\n\n`;
if (!source.includes(marker)) throw new Error('userinfo marker changed');
if (!source.includes("app.get('/api/oauth/serviceinfo'")) source = source.replace(marker, route + marker);
fs.writeFileSync(path, source);

const testPath = 'tests/oauth-serviceinfo-contract.test.cjs';
fs.writeFileSync(testPath, `const fs = require('node:fs');\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\n\nconst source = fs.readFileSync('server.ts', 'utf8');\n\ntest('Discord Stream Hub has only its approved service OAuth scopes', () => {\n  assert.match(source, /'discord-stream-hub': \\['discord:control', 'athena:write'\\]/);\n});\n\ntest('serviceinfo validates signed client-credentials tokens without a user session', () => {\n  assert.match(source, /app\\.get\\('\/api\/oauth\/serviceinfo'[\\s\\S]*jwt\\.verify\\(bearer, JWT_SECRET\\)[\\s\\S]*tokenUse !== 'client_credentials'[\\s\\S]*client_id: clientId[\\s\\S]*scopes/);\n});\n`);
