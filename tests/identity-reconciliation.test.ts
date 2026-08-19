import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { reconcileMisroutedProviderXp, reconcileVerifiedProviderSplit } from '../identity-reconciliation.js';

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
      avatar_url TEXT,
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

test('consolidates verified untouched provider imports into the Discord account', () => {
  const database = createDatabase();
  database.exec(`
    CREATE TABLE account_recovery_codes (
      user_id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE provider_identity_tickets (
      ticket_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL
    );
  `);
  database.prepare(`
    INSERT INTO users
      (id, username, password_hash, discord_username, discord_id, twitch_username, twitch_id, avatar_url, created_at)
    VALUES
      ('discord-account', 'crew-discord', 'SYSTEM_NO_LOGIN', 'crew', '303', NULL, NULL, NULL, '2026-08-01'),
      ('twitch-account', 'crew-twitch', 'SYSTEM_NO_LOGIN', NULL, NULL, 'crew', '796', 'https://avatar', '2026-08-02')
  `).run();
  database.prepare(`
    INSERT INTO xp_ledger
      (id, user_id, source_app, event_type, idempotency_key, delta, created_at)
    VALUES ('xp-split', 'twitch-account', 'discord-stream-hub', 'attendance', 'split-event', 42, '2026-08-02')
  `).run();
  database.prepare("INSERT INTO account_recovery_codes VALUES ('twitch-account', 'old-code', '2026-08-02', NULL)").run();
  database.prepare("INSERT INTO provider_identity_tickets VALUES ('old-ticket', 'twitch-account')").run();

  const discordUser = database.prepare('SELECT * FROM users WHERE id = ?').get('discord-account') as any;
  const twitchUser = database.prepare('SELECT * FROM users WHERE id = ?').get('twitch-account') as any;
  const result = database.transaction(() => reconcileVerifiedProviderSplit(database, discordUser, twitchUser))();

  assert.deepEqual(result, {
    merged: true,
    canonicalUserId: 'discord-account',
    duplicateUserId: 'twitch-account',
    xpRowsMoved: 1,
    xpDeltaMoved: 42,
  });
  assert.deepEqual(
    database.prepare('SELECT twitch_username, twitch_id, avatar_url FROM users WHERE id = ?').get('discord-account'),
    { twitch_username: 'crew', twitch_id: '796', avatar_url: 'https://avatar' },
  );
  assert.deepEqual(
    database.prepare('SELECT twitch_username, twitch_id FROM users WHERE id = ?').get('twitch-account'),
    { twitch_username: null, twitch_id: null },
  );
  assert.equal(database.prepare("SELECT user_id FROM xp_ledger WHERE id = 'xp-split'").pluck().get(), 'discord-account');
  assert.equal(database.prepare('SELECT COUNT(*) FROM account_recovery_codes').pluck().get(), 0);
  assert.equal(database.prepare('SELECT COUNT(*) FROM provider_identity_tickets').pluck().get(), 0);
  database.close();
});

test('keeps manual review for a split containing a claimed account', () => {
  const database = createDatabase();
  database.prepare(`
    INSERT INTO users
      (id, username, password_hash, discord_username, discord_id, twitch_username, twitch_id, created_at)
    VALUES
      ('discord-account', 'crew-discord', 'real-password', 'crew', '303', NULL, NULL, '2026-08-01'),
      ('twitch-account', 'crew-twitch', 'SYSTEM_NO_LOGIN', NULL, NULL, 'crew', '796', '2026-08-02')
  `).run();
  const discordUser = database.prepare('SELECT * FROM users WHERE id = ?').get('discord-account') as any;
  const twitchUser = database.prepare('SELECT * FROM users WHERE id = ?').get('twitch-account') as any;

  assert.deepEqual(reconcileVerifiedProviderSplit(database, discordUser, twitchUser), {
    merged: false,
    xpRowsMoved: 0,
    xpDeltaMoved: 0,
    reason: 'manual-review-required',
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
