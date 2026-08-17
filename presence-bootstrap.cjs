'use strict';

const Database = require('better-sqlite3');

const PRESENCE_TTL_MS = 90_000;
const HEARTBEAT_MIN_MS = 5_000;
const LIVE_FEED_URL = process.env.SPMT_LIVE_FEED_URL || 'https://spacemountain.live/api/community/shoutouts';
const APPS = [
  { id: 'spmt', label: 'SPMT', shortLabel: 'SPMT', url: 'https://spmt.live/' },
  { id: 'spacemountain-live', label: 'SpaceMountain.live', shortLabel: 'SPACEMOUNTAIN.LIVE', url: 'https://spacemountain.live/' },
  { id: 'discord-stream-hub', label: 'Discord Stream Hub', shortLabel: 'DSH', url: 'https://discord-stream-hub-new.fly.dev/dashboard' },
  { id: 'streamweaver', label: 'StreamWeaver', shortLabel: 'STREAMWEAVER', url: 'https://streamweaver-new.fly.dev/commands' },
  { id: 'hearmeout', label: 'HearMeOut', shortLabel: 'HEARMEOUT', url: 'https://hearmeout-main.fly.dev/' },
  { id: 'chat-tag', label: 'ChatTag', shortLabel: 'CHATTAG', url: 'https://chat-tag-new.fly.dev/' },
  { id: 'mountainview', label: 'MountainView', shortLabel: 'MOUNTAINVIEW', url: 'https://mtman-machine-rotator.fly.dev/mountainview' },
  { id: 'companion', label: 'SpaceMountain Companion', shortLabel: 'COMPANION', url: 'https://spmt.live/downloads/companion/windows' },
];
const APP_IDS = new Set(APPS.map((app) => app.id));
const APP_ALIASES = new Map([
  ['spacemountain', 'spacemountain-live'], ['discord-hub', 'discord-stream-hub'], ['dsh', 'discord-stream-hub'],
  ['chattag', 'chat-tag'], ['chat_tag', 'chat-tag'], ['athena-coder', 'mountainview'], ['athena-repair', 'mountainview'],
  ['athena-llm', 'mountainview'], ['streamweaver-ops', 'mountainview'], ['rotator', 'mountainview'],
]);

let presenceDb = null;
const recentHeartbeats = new Map();

function compactText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function canonicalAppId(value) {
  const raw = compactText(value, 80).toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return APP_IDS.has(raw) ? raw : (APP_ALIASES.get(raw) || '');
}

function openPresenceDb() {
  if (presenceDb) return presenceDb;
  const databasePath = process.env.DATABASE_PATH || ((process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME) ? '/data/spmt.db' : require('node:path').join(process.cwd(), 'spmt.db'));
  presenceDb = new Database(databasePath);
  presenceDb.pragma('journal_mode = WAL');
  presenceDb.pragma('busy_timeout = 2500');
  presenceDb.exec(`
    CREATE TABLE IF NOT EXISTS ecosystem_presence (
      app_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT 'Guest',
      workspace_active INTEGER NOT NULL DEFAULT 0,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      PRIMARY KEY (app_id, client_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ecosystem_presence_last_seen ON ecosystem_presence(last_seen);
  `);
  const columns = presenceDb.prepare('PRAGMA table_info(ecosystem_presence)').all();
  if (!columns.some((column) => column.name === 'workspace_active')) {
    presenceDb.exec('ALTER TABLE ecosystem_presence ADD COLUMN workspace_active INTEGER NOT NULL DEFAULT 0');
  }
  return presenceDb;
}

function setPublicCors(res) {
  res.set('access-control-allow-origin', '*');
  res.set('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.set('access-control-allow-headers', 'content-type');
  res.set('cache-control', 'no-store');
}

function cleanupPresence(nowMs = Date.now()) {
  const cutoff = new Date(nowMs - PRESENCE_TTL_MS).toISOString();
  openPresenceDb().prepare('DELETE FROM ecosystem_presence WHERE last_seen < ?').run(cutoff);
  return cutoff;
}

function buildSnapshot(includeUsers) {
  const now = Date.now();
  const cutoff = cleanupPresence(now);
  const rows = openPresenceDb().prepare(`
    SELECT app_id, client_id, display_name, workspace_active, first_seen, last_seen
    FROM ecosystem_presence WHERE last_seen >= ?
    ORDER BY app_id ASC, display_name COLLATE NOCASE ASC, first_seen ASC
  `).all(cutoff);
  const counts = Object.fromEntries(APPS.map((app) => [app.id, 0]));
  for (const row of rows) counts[row.app_id] = (counts[row.app_id] || 0) + 1;
  const workspaceClients = new Set(rows.filter((row) => Boolean(row.workspace_active)).map((row) => row.client_id));
  return {
    version: 'ecosystem-presence.v2', generatedAt: new Date(now).toISOString(), ttlSeconds: Math.round(PRESENCE_TTL_MS / 1000),
    totalActive: rows.length, workspaceActive: workspaceClients.size, counts,
    apps: APPS.map((app) => ({ ...app, count: counts[app.id] || 0 })),
    users: includeUsers ? rows.map((row) => ({
      appId: row.app_id, appLabel: APPS.find((app) => app.id === row.app_id)?.label || row.app_id,
      displayName: compactText(row.display_name, 60) || 'Guest', workspaceActive: Boolean(row.workspace_active),
      since: row.first_seen, lastSeen: row.last_seen,
    })) : undefined,
    shareUrl: 'https://spmt.live/live/',
  };
}

function installRoutes(app, express) {
  if (app.__spmtPresenceRoutesInstalled) return;
  app.__spmtPresenceRoutesInstalled = true;
  const jsonBody = express.json({ limit: '8kb' });

  app.options('/api/presence/heartbeat', (_req, res) => { setPublicCors(res); res.status(204).end(); });
  app.post('/api/presence/heartbeat', jsonBody, (req, res) => {
    setPublicCors(res);
    const appId = canonicalAppId(req.body?.appId);
    const clientId = compactText(req.body?.clientId, 96);
    const displayName = compactText(req.body?.displayName, 60) || 'Guest';
    const workspaceActive = req.body?.workspaceActive === true ? 1 : 0;
    if (!appId) return res.status(400).json({ error: 'Unknown appId' });
    if (!/^[A-Za-z0-9._:-]{8,96}$/.test(clientId)) return res.status(400).json({ error: 'Invalid clientId' });

    const key = `${appId}:${clientId}`;
    const nowMs = Date.now();
    const previous = recentHeartbeats.get(key) || 0;
    if (nowMs - previous >= HEARTBEAT_MIN_MS) {
      recentHeartbeats.set(key, nowMs);
      if (recentHeartbeats.size > 5000) {
        const staleBefore = nowMs - PRESENCE_TTL_MS * 2;
        for (const [entryKey, timestamp] of recentHeartbeats) if (timestamp < staleBefore) recentHeartbeats.delete(entryKey);
      }
      const now = new Date(nowMs).toISOString();
      cleanupPresence(nowMs);
      openPresenceDb().prepare(`
        INSERT INTO ecosystem_presence (app_id, client_id, display_name, workspace_active, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(app_id, client_id) DO UPDATE SET
          display_name = excluded.display_name,
          workspace_active = excluded.workspace_active,
          last_seen = excluded.last_seen
      `).run(appId, clientId, displayName, workspaceActive, now, now);
    }
    res.json({ ok: true, appId, workspaceActive: Boolean(workspaceActive), expiresInSeconds: Math.round(PRESENCE_TTL_MS / 1000), serverTime: new Date().toISOString() });
  });

  app.get('/api/presence', (req, res) => {
    setPublicCors(res);
    const includeUsers = String(req.query?.detail || '1') !== '0';
    res.json(buildSnapshot(includeUsers));
  });

  app.get('/api/live-community', async (_req, res) => {
    setPublicCors(res);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(LIVE_FEED_URL, { headers: { accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      const text = await response.text();
      res.status(response.status);
      res.set('content-type', response.headers.get('content-type') || 'application/json');
      return res.send(text);
    } catch {
      return res.status(502).json({ error: 'Community live feed unavailable', shoutouts: [], analytics: { liveCount: 0 } });
    }
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtPresenceFactory) return;
  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtPresenceFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installPresenceBootstrap() { patchExpress(); }
module.exports = { installPresenceBootstrap };
