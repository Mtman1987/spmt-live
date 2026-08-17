'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Database = require('better-sqlite3');
const {
  buildSnapshot,
  isAuthorized,
  redactValue,
  resolveWindow,
} = require('../commlink-diagnostic-bootstrap.cjs');

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, display_name TEXT);
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, conversation_id TEXT, subject TEXT, body TEXT, channel TEXT,
      message_type TEXT, metadata TEXT, attachments TEXT, created_at TEXT, from_id TEXT, to_id TEXT
    );
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY, type TEXT, title TEXT, body TEXT, source_app TEXT,
      link_url TEXT, read_at TEXT, created_at TEXT, user_id TEXT
    );
    CREATE TABLE platform_events (
      id TEXT PRIMARY KEY, type TEXT, timestamp TEXT, source_app TEXT, actor_user_id TEXT,
      actor_username TEXT, actor_display_name TEXT, visibility TEXT, payload TEXT, links TEXT, created_at TEXT
    );
  `);
  db.prepare('INSERT INTO users (id, username, display_name) VALUES (?, ?, ?)').run('tenant-a-user', 'alpha', 'Alpha');
  db.prepare('INSERT INTO users (id, username, display_name) VALUES (?, ?, ?)').run('tenant-b-user', 'bravo', 'Bravo');
  return db;
}

function requestWith(secret) {
  return { headers: { authorization: `Bearer ${secret}` } };
}

test('machine diagnostic feed authenticates with the existing SPMT service key', () => {
  const env = { SPMT_API_KEY: 'shared-service-secret' };
  assert.equal(isAuthorized(requestWith('shared-service-secret'), env), true);
  assert.equal(isAuthorized(requestWith('wrong-secret'), env), false);
  assert.equal(isAuthorized({ headers: {} }, env), false);
});

test('incident windows are bounded even when callers request excessive history', () => {
  const now = Date.parse('2026-08-17T21:00:00.000Z');
  const window = resolveWindow({ since: '2026-08-17T00:00:00.000Z', until: '2026-08-17T21:00:00.000Z' }, now);
  assert.equal(window.since, '2026-08-17T20:00:00.000Z');
  assert.equal(window.until, '2026-08-17T21:00:00.000Z');
  assert.equal(window.windowClamped, true);
});

test('tenantId is only a hint: snapshot includes ecosystem records from other tenants and systems', () => {
  const db = makeDb();
  try {
    const insertMessage = db.prepare(`INSERT INTO messages
      (id, conversation_id, subject, body, channel, message_type, metadata, attachments, created_at, from_id, to_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertMessage.run('m-a', 'room-a', '', 'tenant A chat', 'twitch', 'message', JSON.stringify({ provider: 'twitch', tenantId: 'tenant-a' }), '[]', '2026-08-17T20:52:00.000Z', 'tenant-a-user', 'tenant-a-user');
    insertMessage.run('m-b', 'room-b', '', 'tenant B chat', 'discord', 'message', JSON.stringify({ provider: 'discord', tenantId: 'tenant-b' }), '[]', '2026-08-17T20:53:00.000Z', 'tenant-b-user', 'tenant-b-user');
    db.prepare(`INSERT INTO platform_events
      (id, type, timestamp, source_app, actor_user_id, actor_username, actor_display_name, visibility, payload, links, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('e-system', 'automation.failed', '2026-08-17T20:54:00.000Z', 'some-ecosystem-app', null, null, null, 'system', JSON.stringify({ summary: 'global app failure' }), '[]', '2026-08-17T20:54:00.000Z');
    db.prepare(`INSERT INTO notifications
      (id, type, title, body, source_app, link_url, read_at, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('n-b', 'warning', 'Warning', 'tenant B notification', 'another-app', null, null, '2026-08-17T20:55:00.000Z', 'tenant-b-user');

    const snapshot = buildSnapshot(db, {
      since: '2026-08-17T20:50:00.000Z', until: '2026-08-17T21:00:00.000Z', tenantId: 'tenant-a', limit: '100',
    }, Date.parse('2026-08-17T21:00:00.000Z'));

    assert.equal(snapshot.scope, 'ecosystem-global');
    assert.equal(snapshot.tenantIdHint, 'tenant-a');
    assert.equal(snapshot.count, 4);
    assert.deepEqual(snapshot.items.map((item) => item.id), [
      'spmt-message:m-a', 'spmt-message:m-b', 'spmt-event:e-system', 'spmt-notification:n-b',
    ]);
    assert.match(JSON.stringify(snapshot.items), /tenant B chat/);
    assert.match(JSON.stringify(snapshot.items), /global app failure/);
  } finally {
    db.close();
  }
});

test('diagnostic payload redacts common credentials recursively', () => {
  const redacted = redactValue({
    authorization: 'Bearer should-never-survive',
    nested: { api_key: 'super-secret-key', text: 'request failed?access_token=abc123&mode=debug' },
  });
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.nested.api_key, '[REDACTED]');
  assert.match(redacted.nested.text, /access_token=\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(redacted), /super-secret-key|abc123|should-never-survive/);
});
