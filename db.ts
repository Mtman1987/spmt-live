import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || '/data/spmt.db';

// Ensure directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

let dbPath = DB_PATH;
try {
  const test = new Database(dbPath);
  test.close();
} catch {
  dbPath = path.join(process.cwd(), 'spmt.db');
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      discord_username TEXT,
      discord_id TEXT,
      twitch_username TEXT,
      twitch_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate: add columns if they don't exist (for existing databases)
  try { db.exec('ALTER TABLE users ADD COLUMN discord_username TEXT'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN discord_id TEXT'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN twitch_username TEXT'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN twitch_id TEXT'); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      client_secret TEXT NOT NULL,
      name TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS oauth_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(client_id) REFERENCES oauth_clients(client_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      subject TEXT DEFAULT '',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(from_id) REFERENCES users(id),
      FOREIGN KEY(to_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS forum_threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      author_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS forum_posts (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES forum_threads(id),
      FOREIGN KEY(author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      theme TEXT DEFAULT 'solar-flare',
      notifications INTEGER DEFAULT 1,
      bio TEXT DEFAULT '',
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS arena_players (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      x REAL DEFAULT 400,
      y REAL DEFAULT 300,
      angle REAL DEFAULT 0,
      hp INTEGER DEFAULT 100,
      kills INTEGER DEFAULT 0,
      deaths INTEGER DEFAULT 0,
      last_seen TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Seed OAuth client for spacemountain.live
  const existing = db.prepare('SELECT client_id FROM oauth_clients WHERE client_id = ?').get('spacemountain-live');
  if (!existing) {
    db.prepare('INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(
        'spacemountain-live',
        'spmt_secret_' + Math.random().toString(36).slice(2, 18),
        'SpaceMountain.live',
        'https://spacemountain.live/auth/callback,https://spacemountain-live.fly.dev/auth/callback,http://spacemountain-live.fly.dev/auth/callback',
        new Date().toISOString()
      );
    console.log('Seeded OAuth client for spacemountain.live');
  } else {
    // Update redirect_uris in case they changed
    db.prepare('UPDATE oauth_clients SET redirect_uris = ? WHERE client_id = ?')
      .run('https://spacemountain.live/auth/callback,https://spacemountain-live.fly.dev/auth/callback,http://spacemountain-live.fly.dev/auth/callback', 'spacemountain-live');
  }

  // Seed OAuth client for Discord Stream Hub
  const dshExists = db.prepare('SELECT client_id FROM oauth_clients WHERE client_id = ?').get('discord-stream-hub');
  if (!dshExists) {
    db.prepare('INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(
        'discord-stream-hub',
        'dsh_spmt_secret_2026',
        'Discord Stream Hub',
        'https://discord-stream-hub-new.fly.dev/auth/callback,https://spacemountain.live/discordstreamhub/auth/callback',
        new Date().toISOString()
      );
    console.log('Seeded OAuth client for Discord Stream Hub');
  } else {
    db.prepare('UPDATE oauth_clients SET redirect_uris = ? WHERE client_id = ?')
      .run('https://discord-stream-hub-new.fly.dev/auth/callback,https://spacemountain.live/discordstreamhub/auth/callback', 'discord-stream-hub');
  }

  console.log('spmt.live database initialized');
}
