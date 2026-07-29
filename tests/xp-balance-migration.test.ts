import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { migrateLegacyXpBalance } from '../xp-balance-migration.js';

function fixture() {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE xp_ledger (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_app TEXT NOT NULL,
      event_type TEXT NOT NULL, idempotency_key TEXT NOT NULL, delta INTEGER NOT NULL,
      metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(source_app, idempotency_key)
    );
    CREATE TABLE xp_balance_migrations (
      user_id TEXT NOT NULL, source_app TEXT NOT NULL, observed_balance INTEGER NOT NULL,
      previous_source_balance INTEGER NOT NULL, adjustment INTEGER NOT NULL,
      migration_version INTEGER NOT NULL DEFAULT 1,
      migrated_at TEXT NOT NULL, PRIMARY KEY(user_id, source_app)
    );
  `);
  database.prepare(`
    INSERT INTO xp_ledger VALUES
      ('existing', 'user-1', 'discord-stream-hub', 'dsh-twitch-message', 'existing-key', 10, '{}', '2026-07-24'),
      ('other', 'user-1', 'chat-tag', 'chat-tag-tag', 'other-key', 100, '{}', '2026-07-24')
  `).run();
  return database;
}

test('adds only the missing historical source balance', () => {
  const database = fixture();
  const input = {
    userId: 'user-1',
    sourceApp: 'discord-stream-hub',
    observedBalance: 30_000,
    migrationVersion: 1,
    entryId: 'migration',
    idempotencyKey: 'legacy-balance:user-1',
    migratedAt: '2026-07-29',
    metadata: { serverId: 'server-1' },
  };
  assert.deepEqual(migrateLegacyXpBalance(database, input), {
    migrated: true,
    sourceApp: 'discord-stream-hub',
    observedBalance: 30_000,
    previousSourceBalance: 10,
    adjustment: 29_990,
    migrationVersion: 1,
    totalXp: 30_100,
    migratedAt: '2026-07-29',
  });
  assert.equal(migrateLegacyXpBalance(database, { ...input, entryId: 'second' }).migrated, false);
  assert.equal(database.prepare('SELECT COUNT(*) FROM xp_ledger').pluck().get(), 3);
  const correction = migrateLegacyXpBalance(database, {
    ...input,
    observedBalance: 31_977,
    migrationVersion: 2,
    entryId: 'upward-correction',
    idempotencyKey: 'legacy-balance:user-1:31977',
    migratedAt: '2026-07-30',
  });
  assert.equal(correction.migrated, true);
  assert.equal(correction.adjustment, 1_977);
  assert.equal(correction.totalXp, 32_077);
  assert.equal(database.prepare('SELECT COUNT(*) FROM xp_ledger').pluck().get(), 4);
  database.close();
});

test('refuses to lower an existing source ledger', () => {
  const database = fixture();
  assert.throws(() => migrateLegacyXpBalance(database, {
    userId: 'user-1',
    sourceApp: 'discord-stream-hub',
    observedBalance: 5,
    migrationVersion: 1,
    entryId: 'migration',
    idempotencyKey: 'legacy-balance:user-1',
    migratedAt: '2026-07-29',
    metadata: {},
  }), /below the existing source ledger balance/);
  database.close();
});
