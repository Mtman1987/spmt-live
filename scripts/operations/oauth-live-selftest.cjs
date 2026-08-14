'use strict';

const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

const CLIENT_IDS = [
  'spacemountain-live',
  'discord-stream-hub',
  'streamweaver',
  'chat-tag',
  'hearmeout',
  'mountainview',
];

const databasePath = process.env.DATABASE_PATH || '/data/spmt.db';
const baseUrl = String(
  process.env.SPMT_OAUTH_SELFTEST_BASE_URL || `http://127.0.0.1:${Number(process.env.PORT || 3000)}`
).replace(/\/$/, '');
const jwtSecret = String(process.env.JWT_SECRET || '').trim();

if (!jwtSecret) {
  console.error('OAuth live self-test cannot run without JWT_SECRET');
  process.exit(2);
}

const db = new Database(databasePath);
db.pragma('busy_timeout = 5000');

function fail(message, details) {
  console.error(message, details || '');
  try { db.close(); } catch {}
  process.exit(1);
}

async function main() {
  const user = db.prepare(`
    SELECT id, username, email
    FROM users
    ORDER BY created_at ASC
    LIMIT 1
  `).get();

  if (!user) fail('OAuth live self-test found no SPMT user');

  const sessionToken = jwt.sign({
    id: user.id,
    username: user.username,
    email: user.email,
  }, jwtSecret, { expiresIn: '2m' });

  const results = [];
  for (const clientId of CLIENT_IDS) {
    const client = db.prepare(`
      SELECT client_id, redirect_uris
      FROM oauth_clients
      WHERE client_id = ?
    `).get(clientId);
    if (!client) fail(`OAuth live self-test missing client ${clientId}`);

    const redirectUri = String(client.redirect_uris || '')
      .split(',')
      .map((value) => value.trim())
      .find(Boolean);
    if (!redirectUri) fail(`OAuth live self-test missing redirect for ${clientId}`);

    const state = `live-selftest-${crypto.randomUUID()}`;
    const authorizeUrl = new URL('/api/oauth/authorize', baseUrl);
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('state', state);

    const startedAt = performance.now();
    const response = await fetch(authorizeUrl, {
      redirect: 'manual',
      headers: {
        accept: 'text/html,application/json',
        cookie: `spmt_token=${encodeURIComponent(sessionToken)}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    const body = await response.text();
    if (response.status !== 302) {
      fail(`OAuth live self-test authorize failed for ${clientId}`, {
        baseUrl,
        status: response.status,
        body: body.slice(0, 1000),
      });
    }

    const location = response.headers.get('location');
    if (!location) fail(`OAuth live self-test missing callback location for ${clientId}`);

    let callback;
    try {
      callback = new URL(location);
    } catch {
      fail(`OAuth live self-test returned invalid callback for ${clientId}`, location);
    }

    const code = String(callback.searchParams.get('code') || '').trim();
    if (!code) fail(`OAuth live self-test returned no authorization code for ${clientId}`, location);
    if (callback.searchParams.get('state') !== state) {
      fail(`OAuth live self-test state mismatch for ${clientId}`);
    }

    const stored = db.prepare(`
      SELECT code, user_id, client_id, redirect_uri, expires_at
      FROM oauth_codes
      WHERE code = ?
    `).get(code);
    if (!stored) fail(`OAuth live self-test code was not persisted for ${clientId}`);
    if (stored.user_id !== user.id || stored.client_id !== clientId || stored.redirect_uri !== redirectUri) {
      fail(`OAuth live self-test persisted the wrong authorization code data for ${clientId}`, stored);
    }

    db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(code);

    results.push({
      clientId,
      status: 'ok',
      latencyMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  }

  db.close();
  console.log(JSON.stringify({
    status: 'passed',
    baseUrl,
    route: '/api/oauth/authorize',
    authenticated: true,
    clients: results,
  }));
}

main().catch((error) => {
  fail('OAuth live self-test crashed', {
    code: error?.code || null,
    message: error?.message || String(error),
  });
});
