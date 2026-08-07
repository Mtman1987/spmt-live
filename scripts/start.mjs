// Production bootstrap for SPMT.
// Reuse the existing SPMT_API_KEY for the Athena Codex gateway so the
// deployment does not require a second duplicate service credential.
const spmtApiKey = String(process.env.SPMT_API_KEY || '').trim();
if (!String(process.env.SPMT_CODEX_SERVICE_SECRET || '').trim() && spmtApiKey) {
  process.env.SPMT_CODEX_SERVICE_SECRET = spmtApiKey;
}

await import('../dist/server.cjs');

// Rotator is a separate SPMT application from MountainView. Seed its OAuth
// registration after the server initializes the persistent schema. Reuse the
// existing MountainView client secret until ROTATOR_CLIENT_SECRET is set so
// this migration does not require a coordinated secret rotation to go live.
const rotatorClientSecret = String(process.env.ROTATOR_CLIENT_SECRET || process.env.MOUNTAINVIEW_CLIENT_SECRET || '').trim();
if (rotatorClientSecret) {
  const { default: Database } = await import('better-sqlite3');
  const databasePath = process.env.DATABASE_PATH || (process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME ? '/data/spmt.db' : new URL('../spmt.db', import.meta.url).pathname);
  const db = new Database(databasePath);
  try {
    db.prepare(`
      INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET
        client_secret = excluded.client_secret,
        name = excluded.name,
        redirect_uris = excluded.redirect_uris
    `).run(
      'rotator',
      rotatorClientSecret,
      'SpaceMountain Rotator / Athena Coder',
      'https://mtman-machine-rotator.fly.dev/auth/spmt/callback',
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
} else {
  console.warn('Rotator OAuth client was not seeded because ROTATOR_CLIENT_SECRET and MOUNTAINVIEW_CLIENT_SECRET are both unset.');
}
