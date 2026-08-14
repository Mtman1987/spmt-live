'use strict';

const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const CODE_ONLY_CLIENTS = new Set([
  'mountainview',
  'spacemountain-live',
  'discord-stream-hub',
  'hearmeout',
  'streamweaver',
]);

let recoveryDb = null;
let oauthCodeSchemaReady = false;

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((piece) => {
    const index = piece.indexOf('=');
    if (index < 1) return;
    const key = piece.slice(0, index).trim();
    const value = piece.slice(index + 1).trim();
    if (!key) return;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  });
  return out;
}

function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return typeof value === 'string' ? value.trim() : '';
}

function databasePath() {
  const production = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
  return process.env.DATABASE_PATH
    || (production ? '/data/spmt.db' : path.join(__dirname, 'spmt.db'));
}

function getRecoveryDb() {
  if (recoveryDb) return recoveryDb;
  const targetPath = databasePath();
  if (!fs.existsSync(targetPath)) return null;
  recoveryDb = new Database(targetPath, { fileMustExist: true });
  recoveryDb.pragma('journal_mode = WAL');
  return recoveryDb;
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
  if (oauthCodeSchemaReady) return;

  const parentTables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN ('users', 'oauth_clients')
  `).all();
  if (parentTables.length < 2) return;

  const existing = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauth_codes'
  `).get();

  if (!existing) {
    db.exec(oauthCodeTableSql());
    oauthCodeSchemaReady = true;
    console.warn('[OAuthAuthorizeRecovery] Created missing oauth_codes table');
    return;
  }

  const columns = db.prepare('PRAGMA table_info(oauth_codes)').all();
  const exactRequiredColumns = ['code', 'user_id', 'client_id', 'redirect_uri', 'expires_at'];
  const existingNames = columns.map((column) => String(column.name || ''));
  const exactShape = existingNames.length === exactRequiredColumns.length
    && exactRequiredColumns.every((name, index) => existingNames[index] === name);

  if (!exactShape) {
    const rebuild = db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS oauth_codes');
      db.exec(oauthCodeTableSql());
    });
    rebuild();
    console.warn('[OAuthAuthorizeRecovery] Rebuilt oauth_codes table for canonical OAuth schema', {
      previousColumns: existingNames,
    });
  }

  oauthCodeSchemaReady = true;
}

function clearSpmtSession(res) {
  res.clearCookie('spmt_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

function loginReturnUrl(req) {
  const clientId = firstQueryValue(req.query?.client_id);
  const redirectUri = firstQueryValue(req.query?.redirect_uri);
  const state = firstQueryValue(req.query?.state);
  if (!clientId || !redirectUri) return '/';
  const returnUrl = `/api/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}${state ? `&state=${encodeURIComponent(state)}` : ''}`;
  return `/?return=${encodeURIComponent(returnUrl)}`;
}

function redirectToLogin(req, res, clearCookie = false) {
  if (clearCookie) clearSpmtSession(res);
  return res.redirect(loginReturnUrl(req));
}

function tokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return {
    token: cookies.spmt_token || bearer || firstQueryValue(req.query?.token),
    fromCookie: Boolean(cookies.spmt_token),
  };
}

function authorizeOauthClient(req, res) {
  const clientId = firstQueryValue(req.query?.client_id);
  const redirectUri = firstQueryValue(req.query?.redirect_uri);
  const state = firstQueryValue(req.query?.state);
  if (!clientId || !redirectUri) {
    return res.status(400).json({ error: 'client_id and redirect_uri required' });
  }

  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    console.error('[OAuthAuthorizeRecovery] JWT_SECRET is not configured');
    return res.status(503).json({ error: 'OAuth authorization temporarily unavailable', code: 'oauth_signing_unavailable' });
  }

  const { token, fromCookie } = tokenFromRequest(req);
  if (!token) return redirectToLogin(req, res);

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return redirectToLogin(req, res, fromCookie);
  }

  const userId = payload && typeof payload === 'object' ? String(payload.id || '').trim() : '';
  if (!userId) return redirectToLogin(req, res, fromCookie);

  const db = getRecoveryDb();
  if (!db) {
    console.error('[OAuthAuthorizeRecovery] SPMT database is unavailable at authorize time');
    return res.status(503).json({ error: 'OAuth authorization temporarily unavailable', code: 'oauth_database_unavailable' });
  }

  try {
    ensureOauthCodeSchema(db);
  } catch (error) {
    console.error('[OAuthAuthorizeRecovery] Failed to repair oauth_codes schema:', error?.stack || error);
    return res.status(503).json({ error: 'OAuth authorization temporarily unavailable', code: 'oauth_schema_unavailable' });
  }

  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
  if (!user) {
    console.warn('[OAuthAuthorizeRecovery] Clearing signed session for missing canonical user', { userId, clientId });
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

  const code = require('node:crypto').randomUUID();
  try {
    db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?').run(new Date().toISOString());
    db.prepare(`
      INSERT INTO oauth_codes (code, user_id, client_id, redirect_uri, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(code, user.id, clientId, redirectUri, new Date(Date.now() + 5 * 60 * 1000).toISOString());
  } catch (error) {
    console.error('[OAuthAuthorizeRecovery] Failed to create OAuth authorization code:', error?.stack || error);
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
    }, secret, { expiresIn: '7d' });
    callback.searchParams.set('token', bridgeToken);
  }

  return res.redirect(callback.toString());
}

function installRoutes(app) {
  if (app.__spmtOauthAuthorizeRecoveryInstalled) return;
  app.__spmtOauthAuthorizeRecoveryInstalled = true;
  app.get('/api/oauth/authorize', authorizeOauthClient);
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtOauthAuthorizeRecoveryFactory) return;

  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtOauthAuthorizeRecoveryFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installOauthAuthorizeRecoveryBootstrap() {
  try {
    const db = getRecoveryDb();
    if (db) ensureOauthCodeSchema(db);
  } catch (error) {
    console.error('[OAuthAuthorizeRecovery] Startup schema check failed:', error?.stack || error);
  }
  patchExpress();
}

module.exports = {
  installOauthAuthorizeRecoveryBootstrap,
  authorizeOauthClient,
  ensureOauthCodeSchema,
  parseCookies,
  firstQueryValue,
};
