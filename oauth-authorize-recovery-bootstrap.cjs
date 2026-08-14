'use strict';

const path = require('node:path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

let recoveryDb = null;

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
  recoveryDb = new Database(databasePath(), { readonly: true, fileMustExist: true });
  return recoveryDb;
}

function loginReturnUrl(req) {
  const clientId = firstQueryValue(req.query?.client_id);
  const redirectUri = firstQueryValue(req.query?.redirect_uri);
  const state = firstQueryValue(req.query?.state);
  if (!clientId || !redirectUri) return '/';
  const returnUrl = `/api/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}${state ? `&state=${encodeURIComponent(state)}` : ''}`;
  return `/?return=${encodeURIComponent(returnUrl)}`;
}

function recoverStaleOauthSession(req, res, next) {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) return next();

  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const token = cookies.spmt_token || bearer || firstQueryValue(req.query?.token);
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return next();
  }

  const userId = payload && typeof payload === 'object' ? String(payload.id || '').trim() : '';
  if (!userId) return next();

  try {
    const userExists = getRecoveryDb().prepare('SELECT 1 AS ok FROM users WHERE id = ?').get(userId);
    if (userExists) return next();
  } catch (error) {
    console.error('[OAuthAuthorizeRecovery] Failed to validate signed session user:', error?.message || error);
    return next();
  }

  console.warn('[OAuthAuthorizeRecovery] Clearing stale signed SPMT session before OAuth authorize', {
    userId,
    clientId: firstQueryValue(req.query?.client_id) || undefined,
  });

  res.clearCookie('spmt_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
  return res.redirect(loginReturnUrl(req));
}

function installRoutes(app) {
  if (app.__spmtOauthAuthorizeRecoveryInstalled) return;
  app.__spmtOauthAuthorizeRecoveryInstalled = true;
  app.get('/api/oauth/authorize', recoverStaleOauthSession);
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
  patchExpress();
}

module.exports = {
  installOauthAuthorizeRecoveryBootstrap,
  recoverStaleOauthSession,
  parseCookies,
  firstQueryValue,
};
