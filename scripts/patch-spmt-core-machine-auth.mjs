import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverFile = path.join(root, 'server.ts');
const original = fs.readFileSync(serverFile, 'utf8').replace(/\r\n/g, '\n');
let source = original;

const helperMarker = 'const SPMT_CORE_ALLOWED_SERVICE_SCOPES = new Set([';
if (!source.includes(helperMarker)) {
  const anchor = 'async function fetchStreamWeaverCommlinkFeed(userId: string, limit = 80) {';
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error('SPMT Commlink feed function marker missing');
  const helper = `const SPMT_CORE_ALLOWED_SERVICE_SCOPES = new Set([\n  'commlink:read',\n  'commlink:control',\n  'commlink:dispatch',\n]);\nconst spmtCoreServiceTokenCache = new Map<string, { token: string; expiresAt: number }>();\n\nfunction getSpmtCoreServiceToken(scope: string) {\n  if (!SPMT_CORE_ALLOWED_SERVICE_SCOPES.has(scope)) {\n    throw new Error(\`SPMT core service scope is not approved: \${scope}\`);\n  }\n  if (!JWT_SECRET) throw new Error('JWT_SECRET is required for SPMT core service identity');\n  const now = Date.now();\n  const cached = spmtCoreServiceTokenCache.get(scope);\n  if (cached && cached.expiresAt - now > 30_000) return cached.token;\n  const token = jwt.sign({\n    client_id: 'spmt-core',\n    scopes: [scope],\n    token_use: 'client_credentials',\n  }, JWT_SECRET, { algorithm: 'HS256', expiresIn: 300 });\n  spmtCoreServiceTokenCache.set(scope, { token, expiresAt: now + 300_000 });\n  return token;\n}\n\nfunction spmtCoreOutboundAuthHeaders(scope: string) {\n  const legacyKey = String(process.env.SYSTEM_API_KEY || process.env.SPMT_SYSTEM_KEY || '').trim();\n  return {\n    Authorization: \`Bearer \${getSpmtCoreServiceToken(scope)}\`,\n    ...(legacyKey ? { 'x-spmt-key': legacyKey } : {}),\n  };\n}\n\n`;
  source = source.slice(0, index) + helper + source.slice(index);
}

function transformAsyncFunction(name, transform) {
  const start = source.indexOf(`async function ${name}`);
  if (start < 0) throw new Error(`Function ${name} not found`);
  const next = source.indexOf('\nasync function ', start + 20);
  const end = next >= 0 ? next : source.length;
  const block = source.slice(start, end);
  const updated = transform(block);
  source = source.slice(0, start) + updated + source.slice(end);
}

transformAsyncFunction('fetchStreamWeaverCommlinkFeed', (block) => {
  let next = block;
  next = next.replace(
    `  const systemKey = String(process.env.SYSTEM_API_KEY || process.env.SPMT_SYSTEM_KEY || '').trim();\n  if (!systemKey) return [];\n`,
    '',
  );
  next = next.replace(
    `        'x-spmt-key': systemKey,\n`,
    `        ...spmtCoreOutboundAuthHeaders('commlink:read'),\n`,
  );
  if (!next.includes("spmtCoreOutboundAuthHeaders('commlink:read')")) throw new Error('Commlink feed auth replacement failed');
  return next;
});

transformAsyncFunction('callStreamWeaverCommlinkOperator', (block) => {
  let next = block;
  next = next.replace(
    `  const systemKey = String(process.env.SYSTEM_API_KEY || process.env.SPMT_SYSTEM_KEY || '').trim();\n  if (!systemKey) return null;\n`,
    '',
  );
  next = next.replace(
    `      'x-spmt-key': systemKey,\n`,
    `      ...spmtCoreOutboundAuthHeaders('commlink:control'),\n`,
  );
  if (!next.includes("spmtCoreOutboundAuthHeaders('commlink:control')")) throw new Error('Commlink operator auth replacement failed');
  return next;
});

transformAsyncFunction('dispatchStreamWeaverCommlinkAction', (block) => {
  let next = block;
  next = next.replace(
    `  const systemKey = String(process.env.SYSTEM_API_KEY || process.env.SPMT_SYSTEM_KEY || '').trim();\n  if (!systemKey) return null;\n`,
    '',
  );
  next = next.replace(
    `      'x-spmt-key': systemKey,\n`,
    `      ...spmtCoreOutboundAuthHeaders('commlink:dispatch'),\n`,
  );
  if (!next.includes("spmtCoreOutboundAuthHeaders('commlink:dispatch')")) throw new Error('Commlink dispatch auth replacement failed');
  return next;
});

for (const marker of [
  "client_id: 'spmt-core'",
  "token_use: 'client_credentials'",
  "algorithm: 'HS256'",
  "spmtCoreOutboundAuthHeaders('commlink:read')",
  "spmtCoreOutboundAuthHeaders('commlink:control')",
  "spmtCoreOutboundAuthHeaders('commlink:dispatch')",
]) {
  if (!source.includes(marker)) throw new Error(`Missing SPMT core machine-auth marker: ${marker}`);
}

if (source !== original) fs.writeFileSync(serverFile, source, 'utf8');
console.log('SPMT core machine-auth patch applied.');
