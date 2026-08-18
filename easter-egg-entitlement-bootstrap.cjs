'use strict';

const Database = require('better-sqlite3');
const path = require('node:path');

const APP_ID = 'spacemountain-live';
const NAMESPACE = 'easter-eggs';
let entitlementDb = null;

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

function systemAuthorized(req) {
  const configured = String(process.env.SYSTEM_API_KEY || '').trim();
  const provided = String(req.headers['x-spmt-key'] || '').trim();
  return Boolean(configured && provided && provided === configured);
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return provider === 'discord' || provider === 'twitch' ? provider : '';
}

function readEggs(provider, providerUserId) {
  const column = provider === 'discord' ? 'discord_id' : 'twitch_id';
  const db = openDb();
  const user = db.prepare(`SELECT id FROM users WHERE ${column} = ? LIMIT 1`).get(providerUserId);
  if (!user?.id) {
    return { knownIdentity: false, eggs: { rocket: false, blackHole: false, signal: false }, title: null };
  }

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
