'use strict';

const { randomUUID } = require('node:crypto');
const initialized = new WeakSet();
const backfilled = new WeakSet();

function ensureRoleQueue(db) {
  if (initialized.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS easter_egg_role_jobs (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, delivered_discord_id TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    claim_token TEXT, claim_until INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at TEXT NOT NULL
  )`);
  initialized.add(db);
}

const APP_ID = 'spacemountain-live';
const NAMESPACE = 'easter-eggs';
const EGG_DEFINITIONS = {
  rocket: { title: 'The Hidden Battle Arena', sourceApp: APP_ID },
  blackHole: { title: 'The Cosmo Black Hole', sourceApp: 'cosmo-commlink' },
  signal: { title: 'The Lost Signal', sourceApp: 'spmt-live' },
};
// Preserve completion earned through the original Commlink puzzles.
const LEGACY_EGGS = { 'battle-arena': 'rocket', 'cosmo-black-hole': 'blackHole', 'commlink-constellation': 'signal' };
const REWARD = {
  title: 'Voidwalker',
  chatbotPersonality: {
    id: 'count-puzzle', // Existing collection/action identifier remains compatible.
    name: 'The Count',
    basePersonality: 'A mysterious gothic puzzle-smith and useful stowaway who speaks in riddles, rhymes, and cosmic metaphors. Every riddle must remain ultimately helpful.',
    tone: 'Theatrical, cryptic, slightly paranoid',
    responseStyle: 'Riddle-forward, gothic, playful, and helpful',
  },
};

const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
function parseData(value) {
  try { return object(JSON.parse(value || '{}')); } catch { return {}; }
}

function mergeEasterEggData(current, incoming) {
  current = object(current); incoming = object(incoming);
  const eggs = { ...object(current.eggs), ...object(incoming.eggs) };
  for (const egg of Object.keys(EGG_DEFINITIONS)) {
    const before = object(current.eggs?.[egg]);
    const after = object(incoming.eggs?.[egg]);
    if (!Object.keys(before).length && !Object.keys(after).length) continue;
    eggs[egg] = { ...before, ...after };
    if (before.completed === true) {
      eggs[egg].completed = true;
      if (before.discoveredAt) eggs[egg].discoveredAt = before.discoveredAt;
    }
    if (Number.isFinite(before.wins)) eggs[egg].wins = Math.max(before.wins, Number(after.wins) || 0);
  }
  return { ...current, ...incoming, eggs };
}

function eggFlags(data) {
  return Object.fromEntries(Object.keys(EGG_DEFINITIONS).map((egg) => [egg, data.eggs?.[egg]?.completed === true]));
}

// Reconciliation, writes and the one-time notification share a SQLite write
// transaction. A retry after a lost response cannot overwrite another egg or
// issue a second reward. The authenticated caller supplies the account ID.
function reconcileEasterEggs(db, userId, completion) {
  ensureRoleQueue(db);
  return db.transaction(() => {
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) throw new Error('Easter egg account not found');
    const current = db.prepare(`SELECT schema_version, revision, data_json, created_at, updated_at
      FROM app_state_records WHERE user_id = ? AND app_id = ? AND namespace = ?`).get(userId, APP_ID, NAMESPACE);
    const before = parseData(current?.data_json);
    const data = { ...before, eggs: { ...object(before.eggs) } };
    const now = new Date().toISOString();
    const mark = (egg, metadata) => {
      if (data.eggs[egg]?.completed === true) return;
      data.eggs[egg] = { ...object(data.eggs[egg]), ...metadata, completed: true };
    };
    const legacy = db.prepare('SELECT discovery_id, discovered_at FROM user_discoveries WHERE user_id = ?').all(userId);
    for (const row of legacy) {
      const egg = LEGACY_EGGS[row.discovery_id];
      if (egg) mark(egg, { discoveredAt: row.discovered_at || now, source: 'legacy-discovery', legacyDiscoveryId: row.discovery_id });
    }
    const arena = db.prepare(`SELECT created_at FROM app_state_records
      WHERE user_id = ? AND app_id = ? AND namespace = 'arena'`).get(userId, APP_ID);
    if (arena) mark('rocket', { discoveredAt: arena.created_at || now, source: 'account-arena-state' });
    if (completion) {
      if (!Object.hasOwn(EGG_DEFINITIONS, completion.egg)) throw new Error('Unknown Easter egg');
      mark(completion.egg, { discoveredAt: now, ...object(completion.metadata) });
    }
    const changed = JSON.stringify(before) !== JSON.stringify(data) && Object.keys(data.eggs).length > 0;
    const revision = (current?.revision || 0) + (changed ? 1 : 0);
    if (changed) {
      db.prepare(`INSERT INTO app_state_records (user_id, app_id, namespace, schema_version, revision, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, app_id, namespace) DO UPDATE SET revision = excluded.revision,
        data_json = excluded.data_json, updated_at = excluded.updated_at`)
        .run(userId, APP_ID, NAMESPACE, current?.schema_version || 1, revision, JSON.stringify(data), current?.created_at || now, now);
    }
    const eggs = eggFlags(data);
    const complete = eggs.rocket && eggs.blackHole && eggs.signal;
    if (complete) {
      db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, type, title, body, source_app, link_url, created_at)
        VALUES (?, ?, 'achievement', ?, ?, 'cosmo-commlink', '/commlink/', ?)`)
        .run(`easter-eggs:voidwalker:${userId}`, userId, 'Voidwalker unlocked', 'You found all three hidden anomalies. The Count is available in your Commlink collection.', now);
      db.prepare('INSERT OR IGNORE INTO easter_egg_role_jobs (user_id, updated_at) VALUES (?, ?)').run(userId, now);
    }
    return {
      appId: APP_ID, namespace: NAMESPACE, schemaVersion: current?.schema_version || 1,
      revision, data, createdAt: current?.created_at || now, updatedAt: changed ? now : current?.updated_at || now,
      eggs, title: complete ? REWARD.title : null, complete,
    };
  }).immediate();
}

function discoveryStatus(db, userId) {
  const state = reconcileEasterEggs(db, userId);
  const discoveries = Object.entries(EGG_DEFINITIONS).map(([id, definition]) => state.eggs[id]
    ? { id, ...definition, discovered: true, discoveredAt: state.data.eggs[id].discoveredAt || state.data.eggs[id].completedAt || null }
    : { id: null, title: 'Undiscovered signal', sourceApp: null, discovered: false, discoveredAt: null });
  return {
    schemaVersion: 2, discoveredCount: discoveries.filter((item) => item.discovered).length,
    total: 3, complete: state.complete, discoveries, reward: state.complete ? REWARD : null,
  };
}

function claimDiscordRewards(db, limit = 5, now = Date.now()) {
  ensureRoleQueue(db);
  if (!backfilled.has(db)) {
    // Recover existing winners on the first worker poll after deployment, even
    // when they have not reopened Commlink or spoken to a bot yet.
    const users = db.prepare(`SELECT id FROM users WHERE id IN (
      SELECT user_id FROM user_discoveries UNION SELECT user_id FROM app_state_records
      WHERE app_id = 'spacemountain-live' AND namespace IN ('easter-eggs', 'arena'))`).all();
    for (const user of users) reconcileEasterEggs(db, user.id);
    backfilled.add(db);
  }
  return db.transaction(() => {
    const jobs = db.prepare(`SELECT j.user_id AS userId, u.discord_id AS discordUserId
      FROM easter_egg_role_jobs j JOIN users u ON u.id = j.user_id
      WHERE u.discord_id IS NOT NULL AND trim(u.discord_id) != ''
        AND (j.delivered_discord_id IS NULL OR j.delivered_discord_id != u.discord_id)
        AND j.next_attempt_at <= ? AND j.claim_until <= ? ORDER BY j.updated_at, j.user_id LIMIT ?`)
      .all(now, now, Math.max(1, Math.min(10, Math.floor(Number(limit)) || 5)));
    return jobs.map((job) => {
      const claimToken = randomUUID();
      db.prepare('UPDATE easter_egg_role_jobs SET claim_token = ?, claim_until = ? WHERE user_id = ?')
        .run(claimToken, now + 300_000, job.userId);
      return { ...job, claimToken, title: REWARD.title };
    });
  }).immediate();
}

function acknowledgeDiscordReward(db, input, now = Date.now()) {
  ensureRoleQueue(db);
  return db.transaction(() => {
    const job = db.prepare(`SELECT j.*, u.discord_id FROM easter_egg_role_jobs j
      JOIN users u ON u.id = j.user_id WHERE j.user_id = ? AND j.claim_token = ?`)
      .get(String(input.userId || ''), String(input.claimToken || ''));
    if (!job || job.discord_id !== input.discordUserId) return false;
    if (input.delivered === true) {
      db.prepare(`UPDATE easter_egg_role_jobs SET delivered_discord_id = ?, claim_token = NULL,
        claim_until = 0, next_attempt_at = 0, attempts = 0, last_error = NULL, updated_at = ? WHERE user_id = ?`)
        .run(job.discord_id, new Date(now).toISOString(), job.user_id);
    } else {
      const delay = Math.min(3_600_000, 30_000 * 2 ** Math.min(7, job.attempts));
      db.prepare(`UPDATE easter_egg_role_jobs SET claim_token = NULL, claim_until = 0,
        attempts = attempts + 1, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE user_id = ?`)
        .run(now + delay, String(input.error || 'Discord role update failed').slice(0, 300), new Date(now).toISOString(), job.user_id);
    }
    return true;
  }).immediate();
}

module.exports = { APP_ID, NAMESPACE, EGG_DEFINITIONS, LEGACY_EGGS, REWARD, mergeEasterEggData, reconcileEasterEggs, discoveryStatus, claimDiscordRewards, acknowledgeDiscordReward };
