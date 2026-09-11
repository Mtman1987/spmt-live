import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

const OVERLAP_MS = 60_000;
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// Parallel browser requests must receive the same successor. Derive it with a
// server key so only hashes are stored, including across process restarts.
export function rotateOauthRefreshToken(db: Database.Database, token: string, clientId: string, secret: string, lifetimeSeconds: number, now = Date.now()) {
  return db.transaction(() => {
    const tokenHash = hash(token);
    const stored = db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token_hash = ? AND client_id = ?').get(tokenHash, clientId) as any;
    if (!stored || Date.parse(stored.expires_at) <= now) return null;
    const successor = crypto.createHmac('sha384', secret).update(`spmt-refresh-v1:${clientId}:${token}`).digest('base64url');
    const successorHash = hash(successor);
    if (stored.revoked_at) {
      const age = now - Date.parse(stored.revoked_at);
      if (!Number.isFinite(age) || age < 0 || age > OVERLAP_MS || stored.rotated_to_hash !== successorHash) return null;
      const next = db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token_hash = ? AND client_id = ? AND revoked_at IS NULL').get(successorHash, clientId) as any;
      if (!next || Date.parse(next.expires_at) <= now) return null;
      return { stored: next, token: successor };
    }
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(stored.user_id)) return null;
    const expiresAt = new Date(now + lifetimeSeconds * 1000).toISOString();
    db.prepare(`INSERT INTO oauth_refresh_tokens (token_hash, user_id, client_id, scopes, expires_at, revoked_at, rotated_to_hash, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`).run(successorHash, stored.user_id, clientId, stored.scopes, expiresAt, new Date(now).toISOString());
    db.prepare('UPDATE oauth_refresh_tokens SET revoked_at = ?, rotated_to_hash = ? WHERE token_hash = ?').run(new Date(now).toISOString(), successorHash, tokenHash);
    return { stored: { ...stored, expires_at: expiresAt }, token: successor };
  }).immediate();
}
