'use strict';

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const Database = require('better-sqlite3');

const LEGACY_AUTH_LOG_INTERVAL_MS = 60_000;
let recoveryDb = null;
let lastLegacyAuthLogAt = 0;

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function generateRecoveryCode() {
  const raw = crypto.randomBytes(9).toString('base64url').toUpperCase();
  return `SPMT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function databasePath() {
  const production = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
  return path.resolve(process.env.DATABASE_PATH || (production ? '/data/spmt.db' : path.join(process.cwd(), 'spmt.db')));
}

function getRecoveryDb() {
  if (recoveryDb && recoveryDb.open !== false) return recoveryDb;
  recoveryDb = new Database(databasePath());
  recoveryDb.pragma('busy_timeout = 5000');
  return recoveryDb;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hasServiceRecoveryAccess(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!bearer || !jwtSecret) return false;
  try {
    const payload = jwt.verify(bearer, jwtSecret, { algorithms: ['HS256'] });
    const scopes = Array.isArray(payload?.scopes) ? payload.scopes.map(String) : [];
    return payload?.client_id === 'streamweaver'
      && payload?.token_use === 'client_credentials'
      && scopes.includes('account-recovery:write');
  } catch {
    return false;
  }
}

function hasLegacyRecoveryAccess(req) {
  const expected = String(process.env.SYSTEM_API_KEY || '').trim();
  const supplied = String(req.headers['x-spmt-key'] || '').trim();
  const allowed = Boolean(expected && supplied && constantTimeEqual(expected, supplied));
  if (allowed && Date.now() - lastLegacyAuthLogAt >= LEGACY_AUTH_LOG_INTERVAL_MS) {
    lastLegacyAuthLogAt = Date.now();
    console.warn('[auth-migration] LEGACY_AUTH_USED migration=AUTH-SW-002 caller=unverified route=/api/internal/auth/admin-recovery-code transport=x-spmt-key');
  }
  return allowed;
}

function hasInternalRecoveryAccess(req) {
  return hasServiceRecoveryAccess(req) || hasLegacyRecoveryAccess(req);
}

function normalizeDiscordId(value) {
  const id = String(value || '').trim().replace(/[<@!>]/g, '');
  return /^\d{15,24}$/.test(id) ? id : '';
}

function saveRecoveryCode(db, userId, code) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO account_recovery_codes (user_id, code_hash, created_at, used_at)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at, used_at = NULL
  `).run(userId, hashSecret(code), now);
  return now;
}

function issueOwnerRecoveryCode(req, res) {
  res.set('Cache-Control', 'no-store');
  if (!hasInternalRecoveryAccess(req)) {
    return res.status(401).json({ error: 'Internal SPMT recovery authorization required' });
  }

  const requesterDiscordId = normalizeDiscordId(req.body?.requesterDiscordId);
  const targetDiscordId = normalizeDiscordId(req.body?.targetDiscordId);
  if (!requesterDiscordId || !targetDiscordId) {
    return res.status(400).json({ error: 'Valid requester and target Discord IDs are required' });
  }

  let db;
  try {
    db = getRecoveryDb();
  } catch (error) {
    console.warn('[AdminRecovery] Database unavailable', {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({ error: 'SPMT recovery database unavailable' });
  }

  const requester = db.prepare(`
    SELECT id, username, discord_id, is_admin
    FROM users
    WHERE discord_id = ? AND is_admin = 1
    ORDER BY datetime(created_at) ASC
    LIMIT 1
  `).get(requesterDiscordId);
  if (!requester) {
    console.warn('[AdminRecovery] Rejected non-admin Discord recovery request', {
      requesterDiscordId: requesterDiscordId.slice(-6),
    });
    return res.status(403).json({ error: 'SPMT owner/admin verification failed' });
  }

  const targets = db.prepare(`
    SELECT id, username, display_name, discord_id
    FROM users
    WHERE discord_id = ?
    ORDER BY datetime(created_at) ASC
  `).all(targetDiscordId);
  if (targets.length === 0) {
    return res.status(404).json({ error: 'No SPMT account is linked to that Discord ID' });
  }
  if (targets.length !== 1) {
    return res.status(409).json({ error: 'That Discord ID is linked to more than one SPMT identity; manual review is required' });
  }

  const target = targets[0];
  const recoveryCode = generateRecoveryCode();
  const issuedAt = saveRecoveryCode(db, target.id, recoveryCode);
  console.info('[AdminRecovery] Owner-issued recovery code created', {
    requester: String(requester.username || '').slice(0, 80),
    target: String(target.username || '').slice(0, 80),
  });

  return res.json({
    ok: true,
    username: String(target.username || ''),
    account: `${String(target.username || '')}@spmt.live`,
    displayName: String(target.display_name || target.username || ''),
    targetDiscordId,
    recoveryCode,
    issuedAt,
    instructions: 'Open https://spmt.live, choose Recover, enter this account and code, then choose a new password.',
  });
}

function installRoutes(app, expressFactory) {
  if (app.__spmtAdminRecoveryRuntimeInstalled) return;
  app.__spmtAdminRecoveryRuntimeInstalled = true;
  const json = expressFactory.json({ limit: '16kb' });
  app.post('/api/internal/auth/admin-recovery-code', json, issueOwnerRecoveryCode);
}

function patchExpress() {
  const expressModulePath = require.resolve('express');
  const CurrentExpress = require(expressModulePath);
  if (CurrentExpress.__spmtAdminRecoveryRuntimeFactory) return;

  function WrappedExpress(...args) {
    const app = CurrentExpress(...args);
    installRoutes(app, CurrentExpress);
    return app;
  }
  Object.setPrototypeOf(WrappedExpress, CurrentExpress);
  for (const key of Object.keys(CurrentExpress)) WrappedExpress[key] = CurrentExpress[key];
  WrappedExpress.__spmtAdminRecoveryRuntimeFactory = true;
  require.cache[expressModulePath].exports = WrappedExpress;
}

function installAdminRecoveryBootstrap() {
  patchExpress();
}

module.exports = {
  installAdminRecoveryBootstrap,
  issueOwnerRecoveryCode,
  generateRecoveryCode,
  normalizeDiscordId,
  hasInternalRecoveryAccess,
  hasServiceRecoveryAccess,
};
