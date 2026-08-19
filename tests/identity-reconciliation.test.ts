import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { reconcileMisroutedProviderXp } from '../identity-reconciliation.js';

function createDatabase() {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      discord_username TEXT,
      discord_id TEXT,
      twitch_username TEXT,
      twitch_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE xp_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_app TEXT NOT NULL,
      event_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      delta INTEGER NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(source_app, idempotency_key)
    );
  `);
  return database;
}

test('moves XP from a cross-provider imported identity to the canonical linked account', () => {
  const database = createDatabase();
  database.prepare(`
    INSERT INTO users
      (id, username, password_hash, discord_username, discord_id, twitch_username, twitch_id, created_at)
    VALUES
      ('canonical', 'mtman1987', 'real-password', 'mtman1987', '767875979561009173', 'mtman1987', '94371378', '2026-06-24'),
      ('imported', 'mtman1987-duplicate', 'SYSTEM_NO_LOGIN', NULL, NULL, 'mtman1987', '767875979561009173', '2026-07-27')
  `).run();
  database.prepare(`
    INSERT INTO xp_ledger
      (id, user_id, source_app, event_type, idempotency_key, delta, created_at)
    VALUES ('xp-1', 'imported', 'discord-stream-hub', 'stream-attendance', 'event-1', 10, '2026-07-27')
  `).run();

  assert.deepEqual(reconcileMisroutedProviderXp(database), {
    identitiesReconciled: 1,
    xpRowsMoved: 1,
    xpDeltaMoved: 10,
  });
  assert.equal(database.prepare('SELECT user_id FROM xp_ledger WHERE id = ?').pluck().get('xp-1'), 'canonical');
  assert.deepEqual(reconcileMisroutedProviderXp(database), {
    identitiesReconciled: 0,
    xpRowsMoved: 0,
    xpDeltaMoved: 0,
  });
  database.close();
});

test('does not merge unrelated imported Twitch identities', () => {
  const database = createDatabase();
  database.prepare(`
    INSERT INTO users
      (id, username, password_hash, discord_username, discord_id, twitch_username, twitch_id, created_at)
    VALUES
      ('canonical', 'creator', 'real-password', 'creator', '111111111111111111', 'creator', '12345678', '2026-06-24'),
      ('imported', 'viewer', 'SYSTEM_NO_LOGIN', NULL, NULL, 'different-viewer', '111111111111111111', '2026-07-27')
  `).run();
  database.prepare(`
    INSERT INTO xp_ledger
      (id, user_id, source_app, event_type, idempotency_key, delta, created_at)
    VALUES ('xp-1', 'imported', 'discord-stream-hub', 'stream-attendance', 'event-1', 25, '2026-07-27')
  `).run();

  assert.deepEqual(reconcileMisroutedProviderXp(database), {
    identitiesReconciled: 0,
    xpRowsMoved: 0,
    xpDeltaMoved: 0,
  });
  assert.equal(database.prepare('SELECT user_id FROM xp_ledger WHERE id = ?').pluck().get('xp-1'), 'imported');
  database.close();
});
