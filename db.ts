import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
const PERSISTENT_DATABASE_ROOT = path.resolve('/data');
const DEFAULT_DATABASE_PATH = IS_PRODUCTION ? '/data/spmt.db' : path.join(process.cwd(), 'spmt.db');
const CONFIGURED_DATABASE_PATH = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH;

function openDatabase(targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const instance = new Database(targetPath);
  instance.pragma('journal_mode = WAL');
  return instance;
}

function isPersistentDatabasePath(targetPath: string) {
  const resolved = path.resolve(targetPath);
  return resolved === PERSISTENT_DATABASE_ROOT || resolved.startsWith(`${PERSISTENT_DATABASE_ROOT}${path.sep}`);
}

let dbPath = CONFIGURED_DATABASE_PATH;
let database: ReturnType<typeof openDatabase>;
try {
  database = openDatabase(dbPath);
} catch (error) {
  if (IS_PRODUCTION) {
    throw new Error(`Unable to open configured production database at ${dbPath}`, { cause: error });
  }

  const fallbackPath = path.join(process.cwd(), 'spmt.db');
  if (path.resolve(fallbackPath) === path.resolve(dbPath)) {
    throw error;
  }

  console.warn(`Unable to open development database at ${dbPath}; using ${fallbackPath}`);
  dbPath = fallbackPath;
  database = openDatabase(dbPath);
}

export const db = database;

export const databaseRuntime = Object.freeze({
  file: path.basename(dbPath),
  storage: isPersistentDatabasePath(dbPath) ? 'persistent-volume' : 'local',
  persistentExpected: IS_PRODUCTION,
});

export function getDatabaseReadiness() {
  const startedAt = performance.now();
  let transactionStarted = false;

  try {
    db.prepare('SELECT 1 AS ok').get();
    const integrity = String(db.pragma('quick_check', { simple: true }) || 'unknown').toLowerCase();
    const journalMode = String(db.pragma('journal_mode', { simple: true }) || 'unknown').toLowerCase();

    db.exec('BEGIN IMMEDIATE');
    transactionStarted = true;
    db.exec('ROLLBACK');
    transactionStarted = false;

    const stats = fs.statSync(dbPath);
    const persistentStorageReady = !databaseRuntime.persistentExpected || databaseRuntime.storage === 'persistent-volume';
    const ready = integrity === 'ok' && persistentStorageReady;

    return {
      status: ready ? 'ready' : 'not_ready',
      storage: databaseRuntime.storage,
      persistentExpected: databaseRuntime.persistentExpected,
      file: databaseRuntime.file,
      bytes: stats.size,
      journalMode,
      integrity,
      writable: true,
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
    };
  } catch {
    if (transactionStarted) {
      try { db.exec('ROLLBACK'); } catch {}
    }

    return {
      status: 'not_ready',
      storage: databaseRuntime.storage,
      persistentExpected: databaseRuntime.persistentExpected,
      file: databaseRuntime.file,
      writable: false,
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      error: 'database_check_failed',
    };
  }
}

function seedOauthClient(clientId: string, clientSecret: string, name: string, redirectUris: string) {
  const existing = db.prepare('SELECT client_id FROM oauth_clients WHERE client_id = ?').get(clientId);
  if (!existing) {
    db.prepare('INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(clientId, clientSecret, name, redirectUris, new Date().toISOString());
    console.log(`Seeded OAuth client for ${name}`);
  } else {
    db.prepare('UPDATE oauth_clients SET name = ?, redirect_uris = ? WHERE client_id = ?')
      .run(name, redirectUris, clientId);
  }
}

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
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

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
      read_at TEXT,
      channel TEXT DEFAULT 'direct',
      conversation_id TEXT,
      message_type TEXT DEFAULT 'direct',
      metadata TEXT,
      attachments TEXT,
      mentioned_users TEXT,
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

    CREATE TABLE IF NOT EXISTS app_installs (
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, app_id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS app_permissions (
      user_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, app_id, permission),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      type TEXT NOT NULL DEFAULT 'direct',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL,
      last_read_at TEXT,
      PRIMARY KEY(conversation_id, user_id),
      FOREIGN KEY(conversation_id) REFERENCES conversations(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'message',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      source_app TEXT,
      link_url TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS overlay_workspaces (
      user_id TEXT PRIMARY KEY,
      layout TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS workspace_profiles (
      user_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL DEFAULT 1,
      revision INTEGER NOT NULL DEFAULT 1,
      profile TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS account_recovery_codes (
      user_id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS athena_memory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'user',
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      source_app TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS developer_api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      app_id TEXT,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT,
      scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS developer_webhooks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS app_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      app_id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Games',
      launch_url TEXT NOT NULL,
      auth_url TEXT,
      health_url TEXT,
      icon_url TEXT,
      version TEXT NOT NULL DEFAULT '0.1.0',
      permissions TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'review',
      created_at TEXT NOT NULL,
      updated_at TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS plugin_installs (
      user_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, plugin_id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS platform_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      timestamp TEXT NOT NULL,
      source_app TEXT NOT NULL,
      actor_user_id TEXT,
      actor_username TEXT,
      actor_display_name TEXT,
      visibility TEXT NOT NULL DEFAULT 'creator',
      payload TEXT NOT NULL,
      links TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scopes TEXT NOT NULL,
      granted_apps TEXT NOT NULL,
      legacy_authorize_url TEXT,
      notes TEXT,
      metadata TEXT,
      authorized_at TEXT,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, provider, role),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Compatibility migrations run after canonical tables exist so a fresh database
  // and an older production database converge on the same schema.
  try { db.exec('ALTER TABLE users ADD COLUMN discord_username TEXT'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN discord_id TEXT'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN twitch_username TEXT'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN twitch_id TEXT'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN read_at TEXT'); } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN channel TEXT DEFAULT "direct"'); } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN conversation_id TEXT'); } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT "direct"'); } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN metadata TEXT'); } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT'); } catch {}
  try { db.exec('ALTER TABLE messages ADD COLUMN mentioned_users TEXT'); } catch {}

  try { db.exec('ALTER TABLE developer_api_keys ADD COLUMN key_hash TEXT'); } catch {}
  try { db.exec('ALTER TABLE developer_api_keys ADD COLUMN revoked_at TEXT'); } catch {}
  try { db.exec('ALTER TABLE developer_api_keys ADD COLUMN app_id TEXT'); } catch {}
  try { db.exec('ALTER TABLE app_submissions ADD COLUMN app_id TEXT'); } catch {}
  try { db.exec("ALTER TABLE app_submissions ADD COLUMN category TEXT NOT NULL DEFAULT 'Games'"); } catch {}
  try { db.exec('ALTER TABLE app_submissions ADD COLUMN auth_url TEXT'); } catch {}
  try { db.exec('ALTER TABLE app_submissions ADD COLUMN health_url TEXT'); } catch {}
  try { db.exec('ALTER TABLE app_submissions ADD COLUMN icon_url TEXT'); } catch {}
  try { db.exec("ALTER TABLE app_submissions ADD COLUMN version TEXT NOT NULL DEFAULT '0.1.0'"); } catch {}
  try { db.exec("ALTER TABLE app_submissions ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]'"); } catch {}
  try { db.exec('ALTER TABLE app_submissions ADD COLUMN updated_at TEXT'); } catch {}
  try { db.exec('ALTER TABLE app_submissions ADD COLUMN reviewed_at TEXT'); } catch {}
  try { db.exec('ALTER TABLE app_submissions ADD COLUMN review_notes TEXT'); } catch {}
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS app_submissions_user_app ON app_submissions(user_id, app_id) WHERE app_id IS NOT NULL');

  seedOauthClient(
    'spacemountain-live',
    process.env.SPACEMOUNTAIN_CLIENT_SECRET || 'spmt_secret_spacemountain_first_party',
    'SpaceMountain.live',
    'https://spacemountain.live/auth/callback,https://spacemountain-live.fly.dev/auth/callback,http://spacemountain-live.fly.dev/auth/callback'
  );
  seedOauthClient(
    'discord-stream-hub',
    process.env.DSH_CLIENT_SECRET || 'dsh_spmt_secret_2026',
    'Discord Stream Hub',
    'https://discord-stream-hub-new.fly.dev/auth/callback,https://spacemountain.live/discordstreamhub/auth/callback'
  );
  seedOauthClient(
    'streamweaver',
    process.env.STREAMWEAVER_CLIENT_SECRET || 'streamweaver_spmt_secret_2026',
    'StreamWeaver',
    'https://streamweaver-new.fly.dev/auth/spmt/callback,https://streamweaver-new.fly.dev/login'
  );
  seedOauthClient(
    'chat-tag',
    process.env.CHAT_TAG_CLIENT_SECRET || 'chat_tag_spmt_secret_2026',
    'ChatTag + Quackverse',
    'https://chat-tag-new.fly.dev/auth/spmt/callback,https://chat-tag-new.fly.dev/auth/callback'
  );
  seedOauthClient(
    'hearmeout',
    process.env.HEARMEOUT_CLIENT_SECRET || 'hearmeout_spmt_secret_2026',
    'HearMeOut',
    'https://hearmeout-main.fly.dev/auth/spmt/callback,https://hearmeout-main.fly.dev'
  );

  console.log('spmt.live database initialized');
}
