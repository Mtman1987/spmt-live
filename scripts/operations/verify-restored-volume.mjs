import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const profiles = {
  spmt: {
    requiredAny: ['spmt.db'],
    sqlite: ['spmt.db'],
    json: [],
    expectedTables: ['users', 'messages', 'notifications'],
  },
  spacemountain: {
    requiredAny: ['app.db', 'spmt.db', 'runtime-config.json'],
    sqlite: ['app.db', 'spmt.db'],
    json: ['runtime-config.json'],
  },
  streamweaver: {
    requiredAny: ['runtime', 'tokens', 'data', 'config'],
    sqlite: [],
    jsonRoots: ['runtime', 'tokens', 'data', 'config'],
  },
  dsh: {
    requiredAny: ['app.db', 'runtime-config.json', 'clips', 'music'],
    sqlite: ['app.db'],
    json: ['runtime-config.json'],
    mediaRoots: ['clips', 'music'],
  },
  hearmeout: {
    requiredAny: ['app.db', 'watch-state.json', 'watch-cache', 'watch-hls', 'music'],
    sqlite: ['app.db'],
    json: ['watch-state.json', 'watch-state.backup.json'],
    mediaRoots: ['watch-cache', 'watch-hls', 'music'],
  },
  'hmo-dj-worker': {
    requiredAny: ['music', 'watch-hls', 'watch-cache', 'youtube-cookies.txt'],
    sqlite: [],
    jsonRoots: ['music', 'watch-hls', 'watch-cache'],
    mediaRoots: ['music', 'watch-hls', 'watch-cache'],
  },
  chattag: {
    requiredAny: ['app-state.json', 'runtime-config.json'],
    sqlite: [],
    json: ['app-state.json', 'runtime-config.json'],
  },
  rotator: {
    requiredAny: ['error-history.json', 'error-baseline.json', 'fix-proposals.json', 'mountainview.db'],
    sqlite: ['mountainview.db'],
    json: ['error-history.json', 'error-baseline.json', 'fix-proposals.json'],
    jsonRoots: ['error-archives'],
  },
};

function usage() {
  const names = Object.keys(profiles).join('|');
  console.error(`Usage: node scripts/operations/verify-restored-volume.mjs --profile ${names} --root <restored-volume-root>`);
  process.exit(2);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const profileName = argValue('--profile');
const rootArg = argValue('--root');
if (!profileName || !rootArg || !profiles[profileName]) usage();

const root = path.resolve(rootArg);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  throw new Error(`Restored volume root does not exist or is not a directory: ${root}`);
}

const profile = profiles[profileName];

function relativeExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const foundRequired = profile.requiredAny.filter(relativeExists);
if (!foundRequired.length) {
  throw new Error(`No expected restored-volume markers found for ${profileName}. Expected one of: ${profile.requiredAny.join(', ')}`);
}

function walkFiles(dir, accept, limit = 5000) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < limit) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (accept(full)) out.push(full);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function validateSqlite(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrity = String(db.pragma('quick_check', { simple: true }) || 'unknown').toLowerCase();
    const tableCount = Number(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count || 0);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
    const missingTables = (profile.expectedTables || []).filter((table) => !tables.includes(table));
    return { path: relativePath, bytes: fs.statSync(file).size, integrity, tableCount, missingTables };
  } finally {
    db.close();
  }
}

function parseJsonFile(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const kind = Array.isArray(parsed) ? 'array' : parsed && typeof parsed === 'object' ? 'object' : typeof parsed;
  const keys = kind === 'object' ? Object.keys(parsed).length : undefined;
  const items = kind === 'array' ? parsed.length : undefined;
  return { path: relativePath, bytes: fs.statSync(file).size, kind, keys, items };
}

const sqlite = (profile.sqlite || []).map(validateSqlite).filter(Boolean);
const json = (profile.json || []).map(parseJsonFile).filter(Boolean);
for (const rootName of profile.jsonRoots || []) {
  const dir = path.join(root, rootName);
  const files = walkFiles(dir, (file) => file.toLowerCase().endsWith('.json'), 200);
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    try {
      json.push(parseJsonFile(relative));
    } catch (error) {
      json.push({ path: relative, error: error.message });
    }
  }
}

const media = {};
for (const rootName of profile.mediaRoots || []) {
  const dir = path.join(root, rootName);
  if (!fs.existsSync(dir)) continue;
  const files = walkFiles(dir, () => true, 5000);
  media[rootName] = { files: files.length };
}

const failedSqlite = sqlite.filter((entry) => entry.integrity !== 'ok' || entry.missingTables?.length);
const failedJson = json.filter((entry) => entry?.error);
const passed = foundRequired.length > 0 && failedSqlite.length === 0 && failedJson.length === 0;

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  profile: profileName,
  root,
  passed,
  markers: foundRequired,
  sqlite,
  json: json.filter(Boolean),
  media,
}, null, 2));

if (!passed) process.exitCode = 1;
