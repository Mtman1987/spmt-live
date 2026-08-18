'use strict';

const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const path = require('node:path');

const APP_ID = 'spacemountain-live';
const NAMESPACE = 'easter-eggs';
const REQUEST_COOLDOWN_MS = 12_000;
const recentRequests = new Map();
let signalDb = null;

const FALLBACK_PACKETS = [
  {
    fragments: ['...urgent matter...', '...your vessel...', '...coverage may expire...', '...attempting final contact...', '...carrier instability increasing...'],
    message: ['Hello.', "We've been trying to reach you regarding your spacecraft's extended warranty.", 'Your vessel may qualify for—'],
  },
  {
    fragments: ['...priority delivery...', '...temperature threshold exceeded...', '...recipient must respond...', '...arrival window closing...', '...contents may be compromised...'],
    message: ['Your pizza is getting cold.', 'The driver cannot locate Airlock B.', 'Please turn on your porch light.'],
  },
  {
    fragments: ['...identity verification required...', '...account status critical...', '...authorization expiring...', '...respond immediately...', '...final notice follows...'],
    message: ['Your Galactic Rewards points expire Friday.', 'Press 1 to hear these options again.'],
  },
  {
    fragments: ['...classified transmission...', '...eyes only...', '...destroy after reading...', '...security phrase follows...', '...do not retransmit...'],
    message: ['The guest Wi-Fi password is guest1234.', 'The G is capitalized.'],
  },
];

function openDb() {
  if (signalDb) return signalDb;
  const databasePath = process.env.DATABASE_PATH
    || ((process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME)
      ? '/data/spmt.db'
      : path.join(process.cwd(), 'spmt.db'));
  signalDb = new Database(databasePath);
  signalDb.pragma('busy_timeout = 2500');
  return signalDb;
}

function parseCookie(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function sessionUserId(req) {
  const token = parseCookie(req.headers.cookie).spmt_token
    || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!token || !secret) return '';
  try {
    const payload = jwt.verify(token, secret);
    return String(payload?.id || '').trim();
  } catch {
    return '';
  }
}

function readWins(userId) {
  const row = openDb().prepare(`
    SELECT data_json
    FROM app_state_records
    WHERE user_id = ? AND app_id = ? AND namespace = ?
    LIMIT 1
  `).get(userId, APP_ID, NAMESPACE);
  if (!row?.data_json) return 0;
  try {
    const data = JSON.parse(row.data_json);
    const signal = data?.eggs?.signal;
    if (!signal || typeof signal !== 'object') return 0;
    const stored = Number(signal.wins);
    if (Number.isInteger(stored) && stored >= 0) return Math.min(99, stored);
    return signal.completed === true ? 1 : 0;
  } catch {
    return 0;
  }
}

function fallbackPacket(wins) {
  return FALLBACK_PACKETS[Math.abs(Number(wins) || 0) % FALLBACK_PACKETS.length];
}

async function generatePacket(wins, runSeed) {
  const base = String(process.env.STREAMWEAVER_INTERNAL_URL || process.env.STREAMWEAVER_URL || 'https://streamweaver-new.fly.dev').replace(/\/$/, '');
  const key = String(process.env.SPMT_SYSTEM_KEY || process.env.SYSTEM_API_KEY || process.env.SPMT_API_KEY || '').trim();
  if (!key) throw new Error('SPMT/StreamWeaver service key is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(`${base}/api/internal/lost-signal/transmission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-spmt-key': key },
      body: JSON.stringify({ wins, runSeed }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.packet) throw new Error(payload?.error || `StreamWeaver ${response.status}`);
    return payload.packet;
  } finally {
    clearTimeout(timeout);
  }
}

function installRoutes(app, express) {
  if (app.__spmtLostSignalTransmissionInstalled) return;
  app.__spmtLostSignalTransmissionInstalled = true;
  const jsonBody = express.json({ limit: '8kb' });

  app.post('/api/signal/transmission', jsonBody, async (req, res) => {
    res.set('cache-control', 'no-store');
    const userId = sessionUserId(req);
    if (!userId) return res.status(401).json({ error: 'SPMT sign-in required' });

    const now = Date.now();
    const last = recentRequests.get(userId) || 0;
    if (now - last < REQUEST_COOLDOWN_MS) return res.status(429).json({ error: 'Receiver is still retuning' });
    recentRequests.set(userId, now);

    const wins = readWins(userId);
    const runSeed = String(req.body?.runSeed || '').trim().slice(0, 120) || `${now}-${Math.random().toString(36).slice(2)}`;
    try {
      const packet = await generatePacket(wins, runSeed);
      return res.json({ ok: true, packet, wins, source: 'ai' });
    } catch (error) {
      console.warn('[LostSignalTransmission] AI generation unavailable; using fallback packet', error);
      return res.json({ ok: true, packet: fallbackPacket(wins), wins, source: 'fallback' });
    }
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtLostSignalTransmissionFactory) return;
  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtLostSignalTransmissionFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installLostSignalTransmissionBootstrap() {
  patchExpress();
}

module.exports = { installLostSignalTransmissionBootstrap };
