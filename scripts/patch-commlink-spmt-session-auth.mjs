import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commlinkPath = path.join(root, 'public', 'commlink', 'commlink.js');
const serverPath = path.join(root, 'server.ts');

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Commlink SPMT auth patch marker missing: ${label}`);
  return source.replace(before, after);
}

let commlink = fs.readFileSync(commlinkPath, 'utf8').replace(/\r\n/g, '\n');
const originalCommlink = commlink;

commlink = replaceRequired(
  commlink,
  `function commlinkAuthHeaders(extra = {}) {\n  const token = localStorage.getItem('spmt_token');\n  return token ? { ...extra, Authorization: \`Bearer \${token}\` } : extra;\n}`,
  `function commlinkAuthHeaders(extra = {}) {\n  // Commlink is same-origin with SPMT. The HttpOnly SPMT session cookie is\n  // authoritative; localStorage is not a second authentication system.\n  return { ...extra };\n}`,
  'auth helper',
);

const replacements = [
  [
    `async function requestOperator(body) {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) throw new Error('Sign in to use tenant show controls.');\n  const response = await fetch('/api/commlink/operator', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },\n    body: JSON.stringify(body),\n  });`,
    `async function requestOperator(body) {\n  const response = await fetch('/api/commlink/operator', {\n    method: 'POST',\n    headers: commlinkAuthHeaders({ 'Content-Type': 'application/json' }),\n    credentials: 'include',\n    body: JSON.stringify(body),\n  });`,
    'operator POST',
  ],
  [
    `async function loadOperator() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) {\n    state.operatorStatus = 'signed-out';\n    renderProductionDock();\n    return;\n  }\n  state.operatorStatus = 'loading';`,
    `async function loadOperator() {\n  state.operatorStatus = 'loading';`,
    'operator GET gate',
  ],
  [
    `const response = await fetch('/api/commlink/operator', { headers: { Authorization: \`Bearer \${token}\` } });`,
    `const response = await fetch('/api/commlink/operator', { headers: commlinkAuthHeaders(), credentials: 'include' });`,
    'operator GET bearer',
  ],
  [
    `async function loadIntegrations() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) return;\n  try {\n    const response = await fetch('/api/commlink/integrations', { headers: { Authorization: \`Bearer \${token}\` } });`,
    `async function loadIntegrations() {\n  try {\n    const response = await fetch('/api/commlink/integrations', { headers: commlinkAuthHeaders(), credentials: 'include' });`,
    'integrations',
  ],
  [
    `async function loadCompanionDevices() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) return;\n  try {\n    const response = await fetch('/api/companion/devices', { headers: { Authorization: \`Bearer \${token}\` } });`,
    `async function loadCompanionDevices() {\n  try {\n    const response = await fetch('/api/companion/devices', { headers: commlinkAuthHeaders(), credentials: 'include' });`,
    'companion devices',
  ],
  [
    `  const token = localStorage.getItem('spmt_token');\n  const payload = action === 'popout.show' ? { id: 1 } : {};\n  try {\n    const response = await fetch('/api/companion/commands', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },\n      body: JSON.stringify({ deviceId: device.id, action, capability: action === 'companion.status' ? 'companion.status' : 'overlay.control', payload }),\n    });`,
    `  const payload = action === 'popout.show' ? { id: 1 } : {};\n  try {\n    const response = await fetch('/api/companion/commands', {\n      method: 'POST',\n      headers: commlinkAuthHeaders({ 'Content-Type': 'application/json' }),\n      credentials: 'include',\n      body: JSON.stringify({ deviceId: device.id, action, capability: action === 'companion.status' ? 'companion.status' : 'overlay.control', payload }),\n    });`,
    'companion command',
  ],
  [
    `async function loadDiscoveries() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) {\n    renderDiscoveryStatus(null);\n    return;\n  }\n  try {\n    const response = await fetch('/api/discoveries', { headers: { Authorization: \`Bearer \${token}\` } });\n    if (!response.ok) throw new Error('Discovery state unavailable');`,
    `async function loadDiscoveries() {\n  try {\n    const response = await fetch('/api/discoveries', { headers: commlinkAuthHeaders(), credentials: 'include' });\n    if (response.status === 401 || response.status === 403) {\n      renderDiscoveryStatus(null);\n      return;\n    }\n    if (!response.ok) throw new Error('Discovery state unavailable');`,
    'discoveries GET',
  ],
  [
    `async function recordDiscovery(discoveryId) {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) {\n    toast('Signal found locally. Sign in to preserve the discovery.');\n    return null;\n  }\n  try {\n    const response = await fetch(\`/api/discoveries/\${encodeURIComponent(discoveryId)}\`, {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${token}\` },\n      body: JSON.stringify({ surface: 'commlink', clientVersion: 'pass-2' }),\n    });\n    if (!response.ok) throw new Error('Discovery could not be recorded');`,
    `async function recordDiscovery(discoveryId) {\n  try {\n    const response = await fetch(\`/api/discoveries/\${encodeURIComponent(discoveryId)}\`, {\n      method: 'POST',\n      headers: commlinkAuthHeaders({ 'Content-Type': 'application/json' }),\n      credentials: 'include',\n      body: JSON.stringify({ surface: 'commlink', clientVersion: 'spmt-session-v1' }),\n    });\n    if (response.status === 401 || response.status === 403) {\n      toast('Signal found locally. Sign in to preserve the discovery.');\n      return null;\n    }\n    if (!response.ok) throw new Error(\`Discovery could not be recorded (\${response.status})\`);`,
    'discoveries POST',
  ],
  [
    `async function loadCommlinkWorkspace() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) {\n    setWorkspaceState('Local preview · sign in to save');\n    return;\n  }\n  setWorkspaceState('Loading saved workspace…');`,
    `async function loadCommlinkWorkspace() {\n  setWorkspaceState('Loading saved workspace…');`,
    'workspace GET gate',
  ],
  [
    `    const response = await fetch('/api/app-state/cosmo-commlink/workspace', {\n      headers: { Authorization: \`Bearer \${token}\` },\n    });`,
    `    const response = await fetch('/api/app-state/cosmo-commlink/workspace', {\n      headers: commlinkAuthHeaders(),\n      credentials: 'include',\n    });`,
    'workspace GET bearer',
  ],
  [
    `function scheduleWorkspaceSave() {\n  if (!localStorage.getItem('spmt_token')) {\n    setWorkspaceState('Local change · sign in to save');\n    return;\n  }\n  setWorkspaceState('Unsaved workspace changes');`,
    `function scheduleWorkspaceSave() {\n  setWorkspaceState('Unsaved workspace changes');`,
    'workspace save scheduler',
  ],
  [
    `async function saveCommlinkWorkspace(create = false) {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) {\n    setWorkspaceState('Local preview · sign in to save');\n    return;\n  }\n  setWorkspaceState('Saving workspace…');`,
    `async function saveCommlinkWorkspace(create = false) {\n  setWorkspaceState('Saving workspace…');`,
    'workspace PUT gate',
  ],
  [
    `    const headers = {\n      'Content-Type': 'application/json',\n      Authorization: \`Bearer \${token}\`,\n    };`,
    `    const headers = commlinkAuthHeaders({\n      'Content-Type': 'application/json',\n    });`,
    'workspace PUT bearer',
  ],
  [
    `    const response = await fetch('/api/app-state/cosmo-commlink/workspace', {\n      method: 'PUT',\n      headers,\n      body: JSON.stringify({ schemaVersion: 3, data: currentWorkspaceData() }),\n    });`,
    `    const response = await fetch('/api/app-state/cosmo-commlink/workspace', {\n      method: 'PUT',\n      headers,\n      credentials: 'include',\n      body: JSON.stringify({ schemaVersion: 3, data: currentWorkspaceData() }),\n    });`,
    'workspace PUT credentials',
  ],
  [
    `async function loadWorkspaceProfile() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) {\n    state.profile = null;\n    state.etag = null;\n    state.appearance = structuredClone(defaultAppearance);\n    setSyncState('signed-out', 'Local preview', 'Sign in at spmt.live to sync settings.');\n    applyAppearance();\n    return;\n  }\n  setSyncState('loading', 'Loading workspace', 'Reading your SPMT appearance profile…');`,
    `async function loadWorkspaceProfile() {\n  setSyncState('loading', 'Loading workspace', 'Reading your SPMT appearance profile…');`,
    'profile GET gate',
  ],
  [
    `    const response = await fetch('/api/workspace-profile', { headers: { Authorization: \`Bearer \${token}\` } });`,
    `    const response = await fetch('/api/workspace-profile', { headers: commlinkAuthHeaders(), credentials: 'include' });`,
    'profile GET bearer',
  ],
  [
    `async function saveWorkspaceProfile() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token || !state.profile || !state.etag) {`,
    `async function saveWorkspaceProfile() {\n  if (!state.profile || !state.etag) {`,
    'profile PUT gate',
  ],
  [
    `      headers: {\n        'Content-Type': 'application/json',\n        Authorization: \`Bearer \${token}\`,\n        'If-Match': state.etag,\n      },`,
    `      headers: commlinkAuthHeaders({\n        'Content-Type': 'application/json',\n        'If-Match': state.etag,\n      }),\n      credentials: 'include',`,
    'profile PUT bearer',
  ],
  [
    `async function loadAccountXp() {\n  const token = localStorage.getItem('spmt_token');\n  if (!token) {\n    $('#account-xp').textContent = 'Sign in for account XP';\n    return;\n  }\n  try {\n    const response = await fetch('/api/xp', { headers: { Authorization: \`Bearer \${token}\` } });`,
    `async function loadAccountXp() {\n  try {\n    const response = await fetch('/api/xp', { headers: commlinkAuthHeaders(), credentials: 'include' });\n    if (response.status === 401 || response.status === 403) {\n      $('#account-xp').textContent = 'Sign in for account XP';\n      return;\n    }`,
    'account XP',
  ],
  [
    `  $('#replay-button').addEventListener('click', () => {\n    if (!localStorage.getItem('spmt_token')) return toast('Sign in to replay real account history.');\n    if (state.replayActive) clearHistoryMode();`,
    `  $('#replay-button').addEventListener('click', () => {\n    if (state.replayActive) clearHistoryMode();`,
    'history replay gate',
  ],
];

for (const [before, after, label] of replacements) commlink = replaceRequired(commlink, before, after, label);

if (commlink.includes("localStorage.getItem('spmt_token')")) {
  throw new Error('Commlink still contains an authoritative localStorage SPMT auth dependency');
}
if (commlink !== originalCommlink) fs.writeFileSync(commlinkPath, commlink, 'utf8');

let server = fs.readFileSync(serverPath, 'utf8').replace(/\r\n/g, '\n');
const originalServer = server;

if (!server.includes('function syncCanonicalCommlinkBlackHole(userId: string)')) {
  const anchor = 'function syncBattleArenaDiscovery(userId: string) {';
  const index = server.indexOf(anchor);
  if (index < 0) throw new Error('SPMT discovery bridge marker missing');
  const helper = `function syncCanonicalCommlinkBlackHole(userId: string) {\n  const discovery = db.prepare(\`\n    SELECT discovered_at FROM user_discoveries\n    WHERE user_id = ? AND discovery_id = 'cosmo-black-hole'\n    LIMIT 1\n  \`).get(userId) as any;\n  if (!discovery) return { changed: false, reason: 'not-discovered' };\n\n  const current = db.prepare(\`\n    SELECT schema_version, revision, data_json, created_at FROM app_state_records\n    WHERE user_id = ? AND app_id = 'spacemountain-live' AND namespace = 'easter-eggs'\n  \`).get(userId) as any;\n  let data: Record<string, any> = {};\n  try {\n    const parsed = JSON.parse(String(current?.data_json || '{}'));\n    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;\n  } catch {}\n  const eggs = data.eggs && typeof data.eggs === 'object' && !Array.isArray(data.eggs) ? { ...data.eggs } : {};\n  const existing = eggs.blackHole && typeof eggs.blackHole === 'object' && !Array.isArray(eggs.blackHole) ? eggs.blackHole : {};\n  if (existing.completed === true) return { changed: false, reason: 'already-complete' };\n\n  const now = new Date().toISOString();\n  eggs.blackHole = {\n    ...existing,\n    completed: true,\n    discoveredAt: existing.discoveredAt || discovery.discovered_at || now,\n    source: existing.source || 'spmt-live-commlink',\n  };\n  const nextData = { ...data, eggs };\n  const revision = current ? Number(current.revision) + 1 : 1;\n  const schemaVersion = Math.max(1, Number(current?.schema_version || 1));\n  db.prepare(\`\n    INSERT INTO app_state_records (user_id, app_id, namespace, schema_version, revision, data_json, created_at, updated_at)\n    VALUES (?, 'spacemountain-live', 'easter-eggs', ?, ?, ?, ?, ?)\n    ON CONFLICT(user_id, app_id, namespace) DO UPDATE SET\n      schema_version = excluded.schema_version, revision = excluded.revision,\n      data_json = excluded.data_json, updated_at = excluded.updated_at\n  \`).run(userId, schemaVersion, revision, JSON.stringify(nextData), current?.created_at || now, now);\n  return { changed: true, reason: 'bridged', revision };\n}\n\n`;
  server = server.slice(0, index) + helper + server.slice(index);
}

server = replaceRequired(
  server,
  `app.get('/api/discoveries', authenticate, (req: any, res) => {\n  const arenaSync = syncBattleArenaDiscovery(req.user.id);\n  const status = userDiscoveryStatus(req.user.id);`,
  `app.get('/api/discoveries', authenticate, (req: any, res) => {\n  const arenaSync = syncBattleArenaDiscovery(req.user.id);\n  syncCanonicalCommlinkBlackHole(req.user.id);\n  const status = userDiscoveryStatus(req.user.id);`,
  'discovery GET canonical bridge',
);
server = replaceRequired(
  server,
  `  const recorded = recordUserDiscovery(req.user.id, discoveryId, {\n    surface: String(req.body?.surface || 'commlink').slice(0, 80),\n    clientVersion: String(req.body?.clientVersion || 'unknown').slice(0, 80),\n  });\n  const status = userDiscoveryStatus(req.user.id);`,
  `  const recorded = recordUserDiscovery(req.user.id, discoveryId, {\n    surface: String(req.body?.surface || 'commlink').slice(0, 80),\n    clientVersion: String(req.body?.clientVersion || 'unknown').slice(0, 80),\n  });\n  if (discoveryId === 'cosmo-black-hole') syncCanonicalCommlinkBlackHole(req.user.id);\n  const status = userDiscoveryStatus(req.user.id);`,
  'discovery POST canonical bridge',
);

for (const marker of [
  'function syncCanonicalCommlinkBlackHole(userId: string)',
  "discovery_id = 'cosmo-black-hole'",
  "namespace = 'easter-eggs'",
  "source: existing.source || 'spmt-live-commlink'",
]) {
  if (!server.includes(marker)) throw new Error(`Canonical Commlink Black Hole marker missing: ${marker}`);
}
if (server !== originalServer) fs.writeFileSync(serverPath, server, 'utf8');

console.log('Commlink now trusts the canonical SPMT session and bridges Black Hole discovery to the canonical Easter egg record.');
