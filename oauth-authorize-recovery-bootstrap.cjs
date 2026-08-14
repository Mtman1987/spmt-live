'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const CODE_ONLY_CLIENTS = new Set([
  'spacemountain-live',
  'discord-stream-hub',
  'streamweaver',
  'chat-tag',
  'hearmeout',
  'mountainview',
]);

let canonicalDb = null;
const oauthSchemaReady = new WeakSet();

function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return typeof value === 'string' ? value.trim() : '';
}

function parseCookies(header) {
  const cookies = {};
  for (const piece of String(header || '').split(';')) {
    const index = piece.indexOf('=');
    if (index < 1) continue;
    const key = piece.slice(0, index).trim();
    const raw = piece.slice(index + 1).trim();
    if (!key) continue;
    try { cookies[key] = decodeURIComponent(raw); } catch { cookies[key] = raw; }
  }
  return cookies;
}

function expectedDatabasePath() {
  const production = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
  return path.resolve(process.env.DATABASE_PATH || (production ? '/data/spmt.db' : path.join(process.cwd(), 'spmt.db')));
}

function normalizeDatabasePath(value) {
  if (typeof value !== 'string' || !value.trim() || value === ':memory:') return value;
  return path.resolve(value);
}

function patchDatabaseCapture() {
  const databaseModulePath = require.resolve('better-sqlite3');
  const CurrentDatabase = require(databaseModulePath);
  if (CurrentDatabase.__spmtOauthCanonicalCaptureFactory) return;

  const expectedPath = expectedDatabasePath();
  function WrappedDatabase(...args) {
    const instance = new CurrentDatabase(...args);
    const openedPath = normalizeDatabasePath(args[0]);
    if (openedPath === expectedPath) {
      canonicalDb = instance;
      try { instance.pragma('busy_timeout = 5000'); } catch {}
    }
    return instance;
  }

  WrappedDatabase.prototype = CurrentDatabase.prototype;
  Object.setPrototypeOf(WrappedDatabase, CurrentDatabase);
  for (const key of Object.keys(CurrentDatabase)) {
    if (!(key in WrappedDatabase)) WrappedDatabase[key] = CurrentDatabase[key];
  }
  WrappedDatabase.__spmtOauthCanonicalCaptureFactory = true;
  require.cache[databaseModulePath].exports = WrappedDatabase;
}

function oauthCodeTableSql() {
  return `
    CREATE TABLE oauth_codes (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(client_id) REFERENCES oauth_clients(client_id)
    )
  `;
}

function ensureOauthCodeSchema(db) {
  if (oauthSchemaReady.has(db)) return;

  const parents = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('users', 'oauth_clients')
  `).all();
  if (parents.length < 2) throw new Error('OAuth parent tables are not initialized');

  const existing = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauth_codes'
  `).get();

  let rebuild = !existing;
  if (existing) {
    const columns = db.prepare('PRAGMA table_info(oauth_codes)').all();
    const required = new Set(['code', 'user_id', 'client_id', 'redirect_uri', 'expires_at']);
    const names = new Set(columns.map((column) => String(column.name || '')));
    const missingRequired = [...required].some((name) => !names.has(name));
    const incompatibleExtra = columns.some((column) => {
      const name = String(column.name || '');
      return !required.has(name) && Number(column.notnull) === 1 && column.dflt_value == null;
    });
    const primaryKey = columns.find((column) => String(column.name || '') === 'code');
    const foreignKeys = db.prepare('PRAGMA foreign_key_list(oauth_codes)').all();
    const hasUserForeignKey = foreignKeys.some((row) => String(row.table || '') === 'users' && String(row.from || '') === 'user_id');
    const hasClientForeignKey = foreignKeys.some((row) => String(row.table || '') === 'oauth_clients' && String(row.from || '') === 'client_id');
    rebuild = missingRequired || incompatibleExtra || Number(primaryKey?.pk || 0) !== 1 || !hasUserForeignKey || !hasClientForeignKey;
  }

  if (rebuild) {
    const rebuildSchema = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS oauth_codes');
      db.exec(oauthCodeTableSql());
    });
    rebuildSchema();
    console.warn('[OAuthRuntime] Rebuilt the short-lived oauth_codes table to the canonical schema');
  }

  oauthSchemaReady.add(db);
}

function loginReturnUrl(req) {
  const clientId = firstQueryValue(req.query?.client_id);
  const redirectUri = firstQueryValue(req.query?.redirect_uri);
  const state = firstQueryValue(req.query?.state);
  if (!clientId || !redirectUri) return '/';
  const authorizePath = `/api/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}${state ? `&state=${encodeURIComponent(state)}` : ''}`;
  return `/?return=${encodeURIComponent(authorizePath)}`;
}

function clearSessionCookie(res) {
  res.clearCookie('spmt_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

function redirectToLogin(req, res, clearCookie = false) {
  if (clearCookie) clearSessionCookie(res);
  res.set('Cache-Control', 'no-store');
  return res.redirect(302, loginReturnUrl(req));
}

function requestSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return {
    token: cookies.spmt_token || bearer || firstQueryValue(req.query?.token),
    fromCookie: Boolean(cookies.spmt_token),
  };
}

function canonicalDatabase() {
  return canonicalDb;
}

function authorizeOauthClient(req, res) {
  const clientId = firstQueryValue(req.query?.client_id);
  const redirectUri = firstQueryValue(req.query?.redirect_uri);
  const state = firstQueryValue(req.query?.state);
  res.set('Cache-Control', 'no-store');

  if (!clientId || !redirectUri) {
    return res.status(400).json({ error: 'client_id and redirect_uri required' });
  }

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    console.error('[OAuthRuntime] JWT_SECRET is not configured');
    return res.status(503).json({ error: 'OAuth authorization temporarily unavailable', code: 'oauth_signing_unavailable' });
  }

  const { token, fromCookie } = requestSessionToken(req);
  if (!token) return redirectToLogin(req, res);

  let session;
  try {
    session = jwt.verify(token, jwtSecret);
  } catch {
    return redirectToLogin(req, res, fromCookie);
  }

  const userId = session && typeof session === 'object' ? String(session.id || '').trim() : '';
  if (!userId) return redirectToLogin(req, res, fromCookie);

  const db = canonicalDatabase();
  if (!db) {
    console.error('[OAuthRuntime] Canonical SPMT database was not captured');
    return res.status(503).json({ error: 'OAuth authorization temporarily unavailable', code: 'oauth_database_unavailable' });
  }

  try {
    ensureOauthCodeSchema(db);
  } catch (error) {
    console.error('[OAuthRuntime] oauth_codes schema check failed:', error?.stack || error);
    return res.status(503).json({ error: 'OAuth authorization temporarily unavailable', code: 'oauth_schema_unavailable' });
  }

  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
  if (!user) {
    console.warn('[OAuthRuntime] Clearing signed session for a missing canonical user', { userId, clientId });
    return redirectToLogin(req, res, fromCookie);
  }

  const client = db.prepare('SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id = ?').get(clientId);
  if (!client) return res.status(404).json({ error: 'Unknown client' });

  const allowedRedirects = String(client.redirect_uris || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedRedirects.includes(redirectUri)) {
    return res.status(400).json({ error: 'Invalid redirect_uri' });
  }

  let callback;
  try {
    callback = new URL(redirectUri);
  } catch {
    return res.status(400).json({ error: 'Invalid redirect_uri' });
  }

  const code = crypto.randomUUID();
  try {
    const writeAuthorizationCode = db.transaction(() => {
      db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(new Date().toISOString());
      db.prepare(`
        INSERT INTO oauth_codes (code, user_id, client_id, redirect_uri, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(code, user.id, clientId, redirectUri, new Date(Date.now() + 5 * 60 * 1000).toISOString());
    });
    writeAuthorizationCode();
  } catch (error) {
    console.error('[OAuthRuntime] Failed to create authorization code:', {
      code: error?.code || null,
      message: error?.message || String(error),
      clientId,
    });
    return res.status(503).json({ error: 'OAuth authorization temporarily unavailable', code: 'oauth_code_write_failed' });
  }

  callback.searchParams.set('code', code);
  if (state) callback.searchParams.set('state', state);

  if (!CODE_ONLY_CLIENTS.has(clientId)) {
    const bridgeToken = jwt.sign({
      id: user.id,
      username: user.username,
      email: user.email,
      client_id: clientId,
      bridge: true,
    }, jwtSecret, { expiresIn: '7d' });
    callback.searchParams.set('token', bridgeToken);
  }

  return res.redirect(302, callback.toString());
}

function oauthWriteHealth(req, res) {
  const startedAt = performance.now();
  res.set('Cache-Control', 'no-store');
  const db = canonicalDatabase();
  if (!db) {
    return res.status(503).json({ status: 'not_ready', code: 'oauth_database_unavailable' });
  }

  try {
    ensureOauthCodeSchema(db);
    const user = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    const client = db.prepare("SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id = 'spacemountain-live' LIMIT 1").get()
      || db.prepare('SELECT client_id, redirect_uris FROM oauth_clients ORDER BY client_id ASC LIMIT 1').get();
    if (!user || !client) {
      return res.status(503).json({ status: 'not_ready', code: 'oauth_principal_unavailable' });
    }

    const redirectUri = String(client.redirect_uris || '').split(',').map((value) => value.trim()).filter(Boolean)[0];
    if (!redirectUri) return res.status(503).json({ status: 'not_ready', code: 'oauth_redirect_unavailable' });

    const code = `health-${crypto.randomUUID()}`;
    const roundTrip = db.transaction(() => {
      db.prepare(`
        INSERT INTO oauth_codes (code, user_id, client_id, redirect_uri, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(code, user.id, client.client_id, redirectUri, new Date(Date.now() + 60_000).toISOString());
      const stored = db.prepare('SELECT code FROM oauth_codes WHERE code = ?').get(code);
      db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(code);
      if (!stored) throw new Error('OAuth health code could not be read back');
    });
    roundTrip();

    return res.json({
      status: 'ready',
      authorizationCodeWrite: 'ok',
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  } catch (error) {
    console.error('[OAuthRuntime] OAuth write health check failed:', {
      code: error?.code || null,
      message: error?.message || String(error),
    });
    return res.status(503).json({
      status: 'not_ready',
      code: 'oauth_code_write_failed',
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  }
}

function installRoutes(app) {
  if (app.__spmtCanonicalOauthRuntimeInstalled) return;
  app.__spmtCanonicalOauthRuntimeInstalled = true;
  app.get('/api/oauth/authorize', authorizeOauthClient);
  app.get('/api/health/oauth', oauthWriteHealth);
}

function patchExpress() {
  const expressModulePath = require.resolve('express');
  const CurrentExpress = require(expressModulePath);
  if (CurrentExpress.__spmtCanonicalOauthRuntimeFactory) return;

  function WrappedExpress(...args) {
    const app = CurrentExpress(...args);
    installRoutes(app);
    return app;
  }
  Object.setPrototypeOf(WrappedExpress, CurrentExpress);
  for (const key of Object.keys(CurrentExpress)) WrappedExpress[key] = CurrentExpress[key];
  WrappedExpress.__spmtCanonicalOauthRuntimeFactory = true;
  require.cache[expressModulePath].exports = WrappedExpress;
}

function installOauthAuthorizeRecoveryBootstrap() {
  patchDatabaseCapture();
  patchExpress();
}

module.exports = {
  installOauthAuthorizeRecoveryBootstrap,
  authorizeOauthClient,
  ensureOauthCodeSchema,
  oauthWriteHealth,
  parseCookies,
  firstQueryValue,
};
