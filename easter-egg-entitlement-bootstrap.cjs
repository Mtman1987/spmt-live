'use strict';

const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const path = require('node:path');

const APP_ID = 'spacemountain-live';
const NAMESPACE = 'easter-eggs';
const LEGACY_AUTH_LOG_INTERVAL_MS = 60_000;
const OWNER_TEST_USERNAMES = new Set(
  String(process.env.SPMT_EASTER_EGG_TEST_USERNAMES || 'mtman1987')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
let entitlementDb = null;
let lastLegacyAuthLogAt = 0;

function openDb() {
  if (entitlementDb) return entitlementDb;
  const databasePath = process.env.DATABASE_PATH
    || ((process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME)
      ? '/data/spmt.db'
      : path.join(process.cwd(), 'spmt.db'));
  entitlementDb = new Database(databasePath);
  entitlementDb.pragma('busy_timeout = 2500');
  return entitlementDb;
}

function serviceAuthorized(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!bearer || !jwtSecret) return false;
  try {
    const payload = jwt.verify(bearer, jwtSecret);
    const scopes = Array.isArray(payload?.scopes) ? payload.scopes.map(String) : [];
    return payload?.client_id === 'streamweaver'
      && payload?.token_use === 'client_credentials'
      && scopes.includes('entitlements:read');
  } catch {
    return false;
  }
}

function legacySystemAuthorized(req) {
  const configured = String(process.env.SYSTEM_API_KEY || '').trim();
  const provided = String(req.headers['x-spmt-key'] || '').trim();
  const authorized = Boolean(configured && provided && provided === configured);
  if (authorized && Date.now() - lastLegacyAuthLogAt >= LEGACY_AUTH_LOG_INTERVAL_MS) {
    lastLegacyAuthLogAt = Date.now();
    console.warn('[auth-migration] LEGACY_AUTH_USED migration=AUTH-SW-003 caller=unverified route=/api/internal/easter-eggs/entitlement transport=x-spmt-key');
  }
  return authorized;
}

function systemAuthorized(req) {
  return serviceAuthorized(req) || legacySystemAuthorized(req);
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return provider === 'discord' || provider === 'twitch' ? provider : '';
}

function ensureOwnerTestGrant(db, user) {
  if (!user?.id || user.is_admin !== 1) return;
  const names = [user.username, user.twitch_username, user.discord_username]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  if (!names.some((name) => OWNER_TEST_USERNAMES.has(name))) return;

  const row = db.prepare(`
    SELECT data_json, revision
    FROM app_state_records
    WHERE user_id = ? AND app_id = ? AND namespace = ?
    LIMIT 1
  `).get(user.id, APP_ID, NAMESPACE);

  let data = {};
  try {
    data = row?.data_json ? JSON.parse(row.data_json) : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  if (!data.eggs || typeof data.eggs !== 'object' || Array.isArray(data.eggs)) data.eggs = {};

  const eggNames = ['rocket', 'blackHole', 'signal'];
  if (eggNames.every((eggName) => data.eggs?.[eggName]?.completed === true)) return;

  const grantedAt = new Date().toISOString();
  for (const eggName of eggNames) {
    const existing = data.eggs[eggName] && typeof data.eggs[eggName] === 'object'
      ? data.eggs[eggName]
      : {};
    data.eggs[eggName] = {
      ...existing,
      completed: true,
      ownerTestGrant: true,
      ownerTestGrantedAt: existing.ownerTestGrantedAt || grantedAt,
    };
  }

  if (row) {
    db.prepare(`
      UPDATE app_state_records
      SET data_json = ?, revision = ?, updated_at = ?
      WHERE user_id = ? AND app_id = ? AND namespace = ?
    `).run(JSON.stringify(data), Math.max(1, Number(row.revision || 1)) + 1, grantedAt, user.id, APP_ID, NAMESPACE);
  } else {
    db.prepare(`
      INSERT INTO app_state_records
        (user_id, app_id, namespace, schema_version, revision, data_json, created_at, updated_at)
      VALUES (?, ?, ?, 1, 1, ?, ?, ?)
    `).run(user.id, APP_ID, NAMESPACE, JSON.stringify(data), grantedAt, grantedAt);
  }

  console.log('[EasterEggEntitlement] owner test grant persisted', { userId: user.id, eggs: eggNames });
}

function readEggs(provider, providerUserId) {
  const column = provider === 'discord' ? 'discord_id' : 'twitch_id';
  const db = openDb();
  const user = db.prepare(`
    SELECT id, username, twitch_username, discord_username, is_admin
    FROM users
    WHERE ${column} = ?
    LIMIT 1
  `).get(providerUserId);
  if (!user?.id) {
    return { knownIdentity: false, eggs: { rocket: false, blackHole: false, signal: false }, title: null };
  }

  ensureOwnerTestGrant(db, user);

  const row = db.prepare(`
    SELECT data_json
    FROM app_state_records
    WHERE user_id = ? AND app_id = ? AND namespace = ?
    LIMIT 1
  `).get(user.id, APP_ID, NAMESPACE);

  let data = {};
  try {
    data = row?.data_json ? JSON.parse(row.data_json) : {};
  } catch {
    data = {};
  }
  const sourceEggs = data && typeof data === 'object' && data.eggs && typeof data.eggs === 'object'
    ? data.eggs
    : {};
  const eggs = {
    rocket: sourceEggs?.rocket?.completed === true,
    blackHole: sourceEggs?.blackHole?.completed === true,
    signal: sourceEggs?.signal?.completed === true,
  };
  const allThree = eggs.rocket && eggs.blackHole && eggs.signal;
  return {
    knownIdentity: true,
    eggs,
    title: allThree ? 'Voidwalker' : null,
  };
}

function installRoutes(app, express) {
  if (app.__spmtEasterEggEntitlementInstalled) return;
  app.__spmtEasterEggEntitlementInstalled = true;
  const jsonBody = express.json({ limit: '4kb' });

  app.post('/api/internal/easter-eggs/entitlement', jsonBody, (req, res) => {
    res.set('cache-control', 'no-store');
    if (!systemAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    const provider = normalizeProvider(req.body?.provider);
    const providerUserId = String(req.body?.providerUserId || '').trim().slice(0, 128);
    if (!provider || !providerUserId) {
      return res.status(400).json({ error: 'provider and providerUserId are required' });
    }
    try {
      return res.json({ ok: true, ...readEggs(provider, providerUserId) });
    } catch (error) {
      console.warn('[EasterEggEntitlement] lookup failed', error);
      return res.status(503).json({ error: 'Entitlement lookup unavailable' });
    }
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtEasterEggEntitlementFactory) return;
  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtEasterEggEntitlementFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installEasterEggEntitlementBootstrap() {
  patchExpress();
}

module.exports = { installEasterEggEntitlementBootstrap };
