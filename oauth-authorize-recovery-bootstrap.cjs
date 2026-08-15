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
    const options = args[1] && typeof args[1] === 'object' ? args[1] : {};
    const openedReadOnly = options.readonly === true || instance.readonly === true;

    // OAuth must always use the canonical writable server connection. Overlay
    // and backup helpers intentionally open the same DB read-only; never let
    // those later handles replace the writable connection captured from db.ts.
    if (openedPath === expectedPath && !openedReadOnly) {
      const currentIsUsable = canonicalDb && canonicalDb.open !== false && canonicalDb.readonly !== true;
      if (!currentIsUsable) canonicalDb = instance;
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
      expires_at TEXT NOT NULL
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
    rebuild = missingRequired
      || incompatibleExtra
      || Number(primaryKey?.pk || 0) !== 1
      || foreignKeys.length > 0;
  }

  if (rebuild) {
    const rebuildSchema = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS oauth_codes');
      db.exec(oauthCodeTableSql());
    });
    rebuildSchema();
    console.warn('[OAuthRuntime] Rebuilt transient oauth_codes table without legacy foreign-key coupling');
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

function sqliteErrorClass(error) {
  const code = String(error?.code || 'unknown').toUpperCase();
  if (code.includes('BUSY')) return 'BUSY';
  if (code.includes('LOCKED')) return 'LOCKED';
  if (code.includes('FULL')) return 'FULL';
  if (code.includes('IOERR')) return 'IOERR';
  if (code.includes('READONLY')) return 'READONLY';
  if (code.includes('CONSTRAINT')) return 'CONSTRAINT';
  return code || 'UNKNOWN';
}

function isRetryableSqliteError(error) {
  const errorClass = sqliteErrorClass(error);
  return errorClass === 'BUSY' || errorClass === 'LOCKED';
}

function sleepSync(ms) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(sleeper, 0, 0, ms);
}

function insertAuthorizationCode(db, values) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      db.prepare(`
        INSERT INTO oauth_codes (code, user_id, client_id, redirect_uri, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(values.code, values.userId, values.clientId, values.redirectUri, values.expiresAt);
      return attempt;
    } catch (error) {
      lastError = error;
      if (!isRetryableSqliteError(error) || attempt === 4) throw error;
      sleepSync(50 * attempt);
    }
  }
  throw lastError || new Error('OAuth authorization code insert failed');
}

function cleanupExpiredOauthCodes(db) {
  try {
    db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(new Date().toISOString());
  } catch (error) {
    console.warn('[OAuthRuntime] Deferred expired authorization-code cleanup failed:', {
      code: error?.code || null,
      sqliteClass: sqliteErrorClass(error),
      message: error?.message || String(error),
    });
  }
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
  let writeAttempts = 0;
  try {
    writeAttempts = insertAuthorizationCode(db, {
      code,
      userId: user.id,
      clientId,
      redirectUri,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    const errorClass = sqliteErrorClass(error);
    console.error('[OAuthRuntime] Failed to create authorization code:', {
      code: error?.code || null,
      sqliteClass: errorClass,
      message: error?.message || String(error),
      clientId,
    });
    return res.status(503).json({
      error: 'OAuth authorization temporarily unavailable',
      code: 'oauth_code_write_failed',
      sqliteClass: errorClass,
    });
  }

  if (writeAttempts > 1) {
    console.warn('[OAuthRuntime] Authorization code write recovered after retry', { clientId, writeAttempts });
  }
  cleanupExpiredOauthCodes(db);

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
    return res.status(503).json({ status: 'not_ready', code: 'oauth_database_unavailable', phase: 'database' });
  }

  let phase = 'schema';
  let code = '';
  try {
    ensureOauthCodeSchema(db);
    phase = 'principal';
    const user = db.prepare('SELECT id FROM users ORDER BY created_at ASC LIMIT 1').get();
    const client = db.prepare("SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id = 'spacemountain-live' LIMIT 1").get()
      || db.prepare('SELECT client_id, redirect_uris FROM oauth_clients ORDER BY client_id ASC LIMIT 1').get();
    if (!user || !client) {
      return res.status(503).json({ status: 'not_ready', code: 'oauth_principal_unavailable', phase });
    }

    const redirectUri = String(client.redirect_uris || '').split(',').map((value) => value.trim()).filter(Boolean)[0];
    if (!redirectUri) return res.status(503).json({ status: 'not_ready', code: 'oauth_redirect_unavailable', phase });

    code = `health-${crypto.randomUUID()}`;
    phase = 'insert';
    insertAuthorizationCode(db, {
      code,
      userId: user.id,
      clientId: client.client_id,
      redirectUri,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    phase = 'read_back';
    const stored = db.prepare('SELECT code FROM oauth_codes WHERE code = ?').get(code);
    if (!stored) throw new Error('OAuth health code could not be read back');
    phase = 'cleanup';
    db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(code);

    return res.json({
      status: 'ready',
      authorizationCodeWrite: 'ok',
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  } catch (error) {
    if (code) {
      try { db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(code); } catch {}
    }
    console.error('[OAuthRuntime] OAuth write health check failed:', {
      phase,
      code: error?.code || null,
      sqliteClass: sqliteErrorClass(error),
      message: error?.message || String(error),
    });
    return res.status(503).json({
      status: 'not_ready',
      code: 'oauth_code_write_failed',
      phase,
      sqliteCode: String(error?.code || 'unknown'),
      sqliteClass: sqliteErrorClass(error),
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
  insertAuthorizationCode,
  sqliteErrorClass,
};