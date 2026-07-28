import Database from 'better-sqlite3';
import process from 'node:process';

const databasePath = process.argv[2] || process.env.DATABASE_PATH || '/data/spmt.db';
const db = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  const rows = db.prepare(`
    SELECT app_id, name, scopes, last_used_at, revoked_at
    FROM developer_api_keys
    ORDER BY app_id, name
  `).all();

  console.log(JSON.stringify(rows.map((row) => ({
    appId: row.app_id || null,
    name: row.name,
    scopes: JSON.parse(row.scopes || '[]'),
    lastUsedAt: row.last_used_at || null,
    revoked: Boolean(row.revoked_at),
  })), null, 2));
} finally {
  db.close();
}
