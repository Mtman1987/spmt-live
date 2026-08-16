'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcrypt');

const RECOVERY_DELIVERY_COOLDOWN_MS = 10 * 60 * 1000;
const recoveryDeliveryAttempts = new Map();
let canonicalDb = null;

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function randomCredential(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function generateRecoveryCode() {
  const raw = crypto.randomBytes(9).toString('base64url').toUpperCase();
  return `SPMT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
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
  if (CurrentDatabase.__spmtAccountRecoveryCaptureFactory) return;

  const expectedPath = expectedDatabasePath();
  function WrappedDatabase(...args) {
    const instance = new CurrentDatabase(...args);
    const openedPath = normalizeDatabasePath(args[0]);
    const options = args[1] && typeof args[1] === 'object' ? args[1] : {};
    const openedReadOnly = options.readonly === true || instance.readonly === true;
    if (openedPath === expectedPath && !openedReadOnly) {
      const usable = canonicalDb && canonicalDb.open !== false && canonicalDb.readonly !== true;
      if (!usable) canonicalDb = instance;
      try { instance.pragma('busy_timeout = 5000'); } catch {}
    }
    return instance;
  }

  WrappedDatabase.prototype = CurrentDatabase.prototype;
  Object.setPrototypeOf(WrappedDatabase, CurrentDatabase);
  for (const key of Object.keys(CurrentDatabase)) {
    if (!(key in WrappedDatabase)) WrappedDatabase[key] = CurrentDatabase[key];
  }
  WrappedDatabase.__spmtAccountRecoveryCaptureFactory = true;
  require.cache[databaseModulePath].exports = WrappedDatabase;
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

function saveRecoveryCode(db, userId, code) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO account_recovery_codes (user_id, code_hash, created_at, used_at)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at, used_at = NULL
  `).run(userId, hashSecret(code), now);
}

function logDiscordFailure(stage, response, username) {
  console.warn('[RecoveryRuntime] Discord recovery delivery failed', {
    stage,
    status: Number(response?.status || 0) || null,
    account: String(username || '').slice(0, 80) || null,
  });
}

async function sendRecoveryCodeToDiscord(db, user, code, fetchImpl = globalThis.fetch) {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const discordId = String(user?.discord_id || '').trim();
  if (!botToken || !discordId || typeof fetchImpl !== 'function') {
    console.warn('[RecoveryRuntime] Discord recovery delivery unavailable', {
      stage: !botToken ? 'bot_token' : !discordId ? 'discord_id' : 'fetch',
      account: String(user?.username || '').slice(0, 80) || null,
    });
    return false;
  }

  const headers = { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' };
  try {
    const identityResponse = await fetchImpl(`https://discord.com/api/v10/users/${encodeURIComponent(discordId)}`, { headers });
    if (!identityResponse.ok) {
      logDiscordFailure('identity_fetch', identityResponse, user?.username);
      return false;
    }
    const discordUser = await identityResponse.json();
    if (!discordUser?.id || String(discordUser.id) !== discordId) {
      console.warn('[RecoveryRuntime] Discord recovery identity response did not match linked immutable ID', {
        stage: 'identity_mismatch',
        account: String(user?.username || '').slice(0, 80) || null,
      });
      return false;
    }

    const currentDiscordUsername = String(discordUser.username || '').trim().replace(/^@/, '');
    const storedDiscordUsername = String(user?.discord_username || '').trim().replace(/^@/, '');
    if (currentDiscordUsername && currentDiscordUsername.toLowerCase() !== storedDiscordUsername.toLowerCase()) {
      db.prepare('UPDATE users SET discord_username = ? WHERE id = ? AND discord_id = ?')
        .run(currentDiscordUsername, user.id, discordId);
      console.info('[RecoveryRuntime] Refreshed renamed Discord username from immutable linked ID', {
        account: String(user?.username || '').slice(0, 80) || null,
      });
    }

    const channelResponse = await fetchImpl('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!channelResponse.ok) {
      logDiscordFailure('dm_channel', channelResponse, user?.username);
      return false;
    }
    const channel = await channelResponse.json();
    if (!channel?.id) {
      console.warn('[RecoveryRuntime] Discord recovery DM channel response had no channel id', {
        stage: 'dm_channel_payload',
        account: String(user?.username || '').slice(0, 80) || null,
      });
      return false;
    }

    const avatarUrl = discordUser?.id && discordUser?.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${String(discordUser.avatar).startsWith('a_') ? 'gif' : 'png'}?size=128`
      : undefined;
    const messageResponse = await fetchImpl(`https://discord.com/api/v10/channels/${encodeURIComponent(channel.id)}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: '',
        embeds: [{
          author: { name: 'SPMT', url: 'https://spmt.live' },
          title: 'SPMT • Account Recovery',
          description: `Your new recovery code is **${code}**.\n\nUse it at https://spmt.live under **Recover**. Do not share this code. If you did not request it, ignore this message; your password has not changed.`,
          color: 0x7c3aed,
          footer: {
            text: `Requested by ${discordUser?.global_name || discordUser?.username || user?.username || 'SPMT user'} • Account recovery`,
            ...(avatarUrl ? { icon_url: avatarUrl } : {}),
          },
          timestamp: new Date().toISOString(),
        }],
        allowed_mentions: { parse: [] },
      }),
    });
    if (!messageResponse.ok) {
      logDiscordFailure('message_send', messageResponse, user?.username);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[RecoveryRuntime] Discord recovery delivery threw', {
      stage: 'exception',
      account: String(user?.username || '').slice(0, 80) || null,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function canonicalRecoveryOrigin(req) {
  const production = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
  if (production) return 'https://spmt.live';
  const configured = String(process.env.SPMT_PUBLIC_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

function issueProviderIdentityTicket(db, userId, purpose, sourceApp) {
  const ticket = randomCredential(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  db.prepare('DELETE FROM provider_identity_tickets WHERE used_at IS NOT NULL OR expires_at <= ?').run(now.toISOString());
  db.prepare(`
    INSERT INTO provider_identity_tickets (ticket_hash, user_id, purpose, source_app, expires_at, used_at, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?)
  `).run(hashSecret(ticket), userId, purpose, sourceApp, expiresAt.toISOString(), now.toISOString());
  return { ticket, expiresAt: expiresAt.toISOString() };
}

async function requestRecoveryCode(req, res) {
  const startedAt = Date.now();
  const username = String(req.body?.username || '').trim().toLowerCase().replace(/@spmt\.live$/, '');
  const attemptKey = hashSecret(`${req.ip || 'unknown'}:${username || 'missing'}`);
  const lastAttempt = recoveryDeliveryAttempts.get(attemptKey) || 0;
  const now = Date.now();
  const db = canonicalDb;

  if (db && now - lastAttempt >= RECOVERY_DELIVERY_COOLDOWN_MS) {
    recoveryDeliveryAttempts.set(attemptKey, now);
    if (recoveryDeliveryAttempts.size > 2_000) {
      for (const [key, attemptedAt] of recoveryDeliveryAttempts) {
        if (now - attemptedAt >= RECOVERY_DELIVERY_COOLDOWN_MS) recoveryDeliveryAttempts.delete(key);
      }
    }

    const user = username
      ? db.prepare(`
          SELECT id, username, password_hash, discord_username, discord_id, twitch_id
          FROM users
          WHERE username = ?
        `).get(username)
      : null;
    if (user) {
      const code = generateRecoveryCode();
      const delivered = await sendRecoveryCodeToDiscord(db, user, code);
      if (delivered) {
        saveRecoveryCode(db, user.id, code);
        console.info('[RecoveryRuntime] Discord recovery code delivered', {
          account: String(user.username || '').slice(0, 80),
          credentialState: user.password_hash === 'SYSTEM_NO_LOGIN' ? 'provider-owned' : 'password-set',
        });
      }
    }
  }

  const remainingDelay = Math.max(0, 250 - (Date.now() - startedAt));
  if (remainingDelay) await new Promise((resolve) => setTimeout(resolve, remainingDelay));
  res.set('Cache-Control', 'no-store');
  return res.status(202).json({
    ok: true,
    message: 'If that account has a linked Discord identity and DM delivery is available, a fresh recovery code has been sent. If no DM arrives, verify with Twitch instead.',
    fallbackUrl: '/api/auth/recover/twitch',
    fallbackLabel: 'Verify with Twitch instead',
  });
}

async function resetPassword(req, res) {
  const db = canonicalDb;
  if (!db) return res.status(503).json({ error: 'Recovery is temporarily unavailable' });
  const username = String(req.body?.username || '').trim().toLowerCase().replace(/@spmt\.live$/, '');
  const recoveryCode = String(req.body?.recoveryCode || '').trim().toUpperCase();
  const newPassword = String(req.body?.newPassword || '');
  if (!username || !recoveryCode || newPassword.length < 8) {
    return res.status(400).json({ error: 'Username, recovery code, and a new password of at least 8 characters are required' });
  }

  const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username);
  const recovery = user
    ? db.prepare('SELECT code_hash, used_at FROM account_recovery_codes WHERE user_id = ?').get(user.id)
    : null;
  if (!user || !recovery || recovery.used_at || recovery.code_hash !== hashSecret(recoveryCode)) {
    return res.status(400).json({ error: 'Invalid or already-used recovery code' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const usedAt = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
    db.prepare('UPDATE account_recovery_codes SET used_at = ? WHERE user_id = ?').run(usedAt, user.id);
    db.prepare('DELETE FROM provider_identity_tickets WHERE user_id = ?').run(user.id);
  })();
  res.set('Cache-Control', 'no-store');
  return res.json({ ok: true, claimedProviderOwnedIdentity: user.password_hash === 'SYSTEM_NO_LOGIN' });
}

function recoveryFailureRedirect(req, res, message) {
  const target = new URL('/', canonicalRecoveryOrigin(req));
  target.searchParams.set('recoverError', message);
  return res.redirect(302, target.toString());
}

function startTwitchRecovery(req, res) {
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  if (!clientId) return recoveryFailureRedirect(req, res, 'Twitch recovery is temporarily unavailable.');
  const state = randomCredential(24);
  const redirectUri = `${canonicalRecoveryOrigin(req)}/api/auth/recover/twitch/callback`;
  res.cookie('spmt_recovery_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME),
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });
  const authorizeUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', 'user:read:email');
  authorizeUrl.searchParams.set('state', state);
  return res.redirect(302, authorizeUrl.toString());
}

async function finishTwitchRecovery(req, res) {
  const code = String(req.query?.code || '').trim();
  const state = String(req.query?.state || '').trim();
  const expectedState = String(parseCookies(req.headers.cookie).spmt_recovery_oauth_state || '');
  const clientId = String(process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
  const redirectUri = `${canonicalRecoveryOrigin(req)}/api/auth/recover/twitch/callback`;
  res.clearCookie('spmt_recovery_oauth_state', { path: '/' });

  if (!code || !state || !expectedState || state !== expectedState) {
    return recoveryFailureRedirect(req, res, 'That recovery link expired. Click Recover and try again.');
  }
  if (!clientId || !clientSecret || !canonicalDb) {
    return recoveryFailureRedirect(req, res, 'Twitch recovery is temporarily unavailable.');
  }

  try {
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.warn('[RecoveryRuntime] Twitch recovery token exchange failed', { status: tokenResponse.status });
      return recoveryFailureRedirect(req, res, 'Twitch could not verify your account. Please try again.');
    }

    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Client-ID': clientId },
    });
    const userData = await userResponse.json().catch(() => ({}));
    const twitchUser = userData.data?.[0];
    if (!userResponse.ok || !twitchUser?.id) {
      return recoveryFailureRedirect(req, res, 'Twitch could not return your verified profile. Please try again.');
    }

    const matches = canonicalDb.prepare(`
      SELECT id, password_hash FROM users
      WHERE twitch_id = ?
      ORDER BY datetime(created_at) ASC
    `).all(String(twitchUser.id));
    if (matches.length !== 1) {
      const message = matches.length > 1
        ? 'That Twitch account is linked to more than one SPMT identity. Crew review is required.'
        : 'No SPMT account is linked to that Twitch account. You can create a new account instead.';
      return recoveryFailureRedirect(req, res, message);
    }

    const user = matches[0];
    const purpose = user.password_hash === 'SYSTEM_NO_LOGIN' ? 'claim' : 'recover';
    const issued = issueProviderIdentityTicket(canonicalDb, user.id, purpose, 'spmt-recovery');
    const target = new URL('/api/auth/provider-claim', canonicalRecoveryOrigin(req));
    target.searchParams.set('ticket', issued.ticket);
    return res.redirect(302, target.toString());
  } catch (error) {
    console.warn('[RecoveryRuntime] Twitch recovery failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return recoveryFailureRedirect(req, res, 'Recovery is temporarily unavailable. Please try again.');
  }
}

function installRoutes(app, expressFactory) {
  if (app.__spmtAccountRecoveryRuntimeInstalled) return;
  app.__spmtAccountRecoveryRuntimeInstalled = true;
  const json = expressFactory.json({ limit: '32kb' });
  app.post('/api/auth/request-recovery-code', json, requestRecoveryCode);
  app.post('/api/auth/reset-password', json, resetPassword);
  app.get('/api/auth/recover/twitch', startTwitchRecovery);
  app.get('/api/auth/recover/twitch/callback', finishTwitchRecovery);
}

function patchExpress() {
  const expressModulePath = require.resolve('express');
  const CurrentExpress = require(expressModulePath);
  if (CurrentExpress.__spmtAccountRecoveryRuntimeFactory) return;

  function WrappedExpress(...args) {
    const app = CurrentExpress(...args);
    installRoutes(app, CurrentExpress);
    return app;
  }
  Object.setPrototypeOf(WrappedExpress, CurrentExpress);
  for (const key of Object.keys(CurrentExpress)) WrappedExpress[key] = CurrentExpress[key];
  WrappedExpress.__spmtAccountRecoveryRuntimeFactory = true;
  require.cache[expressModulePath].exports = WrappedExpress;
}

function installAccountRecoveryBootstrap() {
  patchDatabaseCapture();
  patchExpress();
}

module.exports = {
  installAccountRecoveryBootstrap,
  generateRecoveryCode,
  sendRecoveryCodeToDiscord,
  canonicalRecoveryOrigin,
  requestRecoveryCode,
  resetPassword,
  startTwitchRecovery,
  finishTwitchRecovery,
};
