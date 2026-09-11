import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { rotateOauthRefreshToken } from '../oauth-refresh';
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
function fixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('existing-user');
    CREATE TABLE oauth_refresh_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT, client_id TEXT, scopes TEXT, expires_at TEXT, revoked_at TEXT, rotated_to_hash TEXT, created_at TEXT);`);
  const now = Date.now();
  db.prepare('INSERT INTO oauth_refresh_tokens VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)').run(hash('original'), 'existing-user', 'streamweaver', '["identity:read"]', new Date(now + 100000).toISOString(), new Date(now).toISOString());
  return { db, now, rotate: (token = 'original', client = 'streamweaver', at = now) => rotateOauthRefreshToken(db, token, client, 'test-server-key', 2592000, at) };
}
test('parallel refreshes reuse one durable successor and retain canonical identity', () => {
  const { db, rotate } = fixture();
  try {
    const results = Array.from({ length: 12 }, () => rotate());
    assert.ok(results.every(Boolean));
    assert.equal(new Set(results.map(r => r!.token)).size, 1);
    assert.ok(results.every(r => r!.stored.user_id === 'existing-user'));
    assert.equal((db.prepare('SELECT count(*) AS n FROM oauth_refresh_tokens').get() as any).n, 2);
    assert.equal(db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token_hash = ?').get(results[0]!.token), undefined);
  } finally { db.close(); }
});
test('overlap is bounded, client-scoped, and never revives expired/revoked credentials', () => {
  const { db, now, rotate } = fixture();
  try {
    assert.equal(rotate('original', 'chat-tag'), null);
    assert.equal(rotate('unknown'), null);
    const first = rotate()!;
    assert.equal(rotate('original', 'streamweaver', now + 60001), null);
    const second = rotate(first.token)!;
    assert.ok(second.token !== first.token);
    assert.equal(rotate(), null, 'an older ancestor cannot revive a rotated successor');
    db.prepare('UPDATE oauth_refresh_tokens SET expires_at = ? WHERE token_hash = ?').run(new Date(now - 1).toISOString(), hash(second.token));
    assert.equal(rotate(second.token), null);
  } finally { db.close(); }
});
test('manual revocation and missing users cannot issue new credentials', () => {
  const { db, now, rotate } = fixture();
  try {
    db.prepare('UPDATE oauth_refresh_tokens SET revoked_at = ?').run(new Date(now).toISOString());
    assert.equal(rotate(), null);
    db.exec('UPDATE oauth_refresh_tokens SET revoked_at = NULL; DELETE FROM users;');
    assert.equal(rotate(), null);
  } finally { db.close(); }
});
