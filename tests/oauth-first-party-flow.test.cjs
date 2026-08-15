'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawn } = require('node:child_process');

const CLIENTS = [
  {
    id: 'spacemountain-live',
    secretEnv: 'SPACEMOUNTAIN_CLIENT_SECRET',
    secret: 'test-spacemountain-secret',
    redirectUri: 'https://spacemountain.live/auth/callback',
  },
  {
    id: 'discord-stream-hub',
    secretEnv: 'DSH_CLIENT_SECRET',
    secret: 'test-dsh-secret',
    redirectUri: 'https://discord-stream-hub-new.fly.dev/auth/callback',
  },
  {
    id: 'streamweaver',
    secretEnv: 'STREAMWEAVER_CLIENT_SECRET',
    secret: 'test-streamweaver-secret',
    redirectUri: 'https://streamweaver-new.fly.dev/auth/spmt/callback',
  },
  {
    id: 'chat-tag',
    secretEnv: 'CHAT_TAG_CLIENT_SECRET',
    secret: 'test-chat-tag-secret',
    redirectUri: 'https://chat-tag-new.fly.dev/auth/spmt/callback',
  },
  {
    id: 'hearmeout',
    secretEnv: 'HEARMEOUT_CLIENT_SECRET',
    secret: 'test-hearmeout-secret',
    redirectUri: 'https://hearmeout-main.fly.dev/api/auth/spmt/callback',
  },
  {
    id: 'mountainview',
    secretEnv: 'MOUNTAINVIEW_CLIENT_SECRET',
    secret: 'test-mountainview-secret',
    redirectUri: 'https://mtman-machine-rotator.fly.dev/mountainview/auth/callback',
  },
];

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`SPMT exited before becoming ready (${child.exitCode})\n${output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { redirect: 'manual' });
      if (response.status > 0) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`SPMT did not become ready in time\n${output()}`);
}

async function json(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; }
}

test('all first-party apps complete SPMT authorization code flow on the canonical database even after read-only helpers open it', { timeout: 45_000 }, async (t) => {
  const port = await freePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-oauth-flow-'));
  const databasePath = path.join(tempDir, 'spmt.db');
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_PATH: databasePath,
    SPMT_TENANT_SCENE_ROOT: path.join(tempDir, 'tenant-scenes'),
    JWT_SECRET: 'oauth-integration-test-jwt-secret-which-is-long-enough',
  };
  for (const client of CLIENTS) env[client.secretEnv] = client.secret;

  let stdout = '';
  let stderr = '';
  const child = spawn(process.execPath, [
    '-e',
    [
      "require('./oauth-authorize-recovery-bootstrap.cjs').installOauthAuthorizeRecoveryBootstrap()",
      "require('./tenant-overlay-events-bootstrap.cjs').installTenantOverlayEventsBootstrap()",
      "require('./tenant-overlay-bootstrap.cjs').installTenantOverlayBootstrap()",
      "require('./dist/server.cjs')",
    ].join(';'),
  ], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const output = () => `${stdout}\n${stderr}`;

  t.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM');
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, output);

  const username = `oauth_test_${Date.now()}`;
  const password = 'OAuth-Test-Password-2026!';
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username, password, displayName: 'OAuth Flow Test' }),
  });
  const registerPayload = await json(registerResponse);
  assert.equal(registerResponse.status, 201, `register failed: ${JSON.stringify(registerPayload)}\n${output()}`);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const loginPayload = await json(loginResponse);
  assert.equal(loginResponse.status, 200, `login failed: ${JSON.stringify(loginPayload)}\n${output()}`);
  assert.ok(loginPayload?.token, 'login must return the SPMT session token');
  const sessionCookie = `spmt_token=${encodeURIComponent(loginPayload.token)}`;

  // Force both tenant bootstraps to open their intentional read-only SQLite
  // handles after the main writable connection exists. OAuth must stay bound to
  // the writable db.ts connection instead of being replaced by these readers.
  const overlayHeaders = { cookie: sessionCookie, authorization: `Bearer ${loginPayload.token}`, accept: 'application/json' };
  const overlayResponse = await fetch(`${baseUrl}/api/overlay-workspace`, { headers: overlayHeaders });
  assert.equal(overlayResponse.status, 200, `overlay reader failed to initialize: ${await overlayResponse.text()}\n${output()}`);
  const personalLaunchResponse = await fetch(`${baseUrl}/api/personal-overlay-launch`, { headers: overlayHeaders });
  assert.equal(personalLaunchResponse.status, 200, `personal overlay reader failed to initialize: ${await personalLaunchResponse.text()}\n${output()}`);

  const writeHealthResponse = await fetch(`${baseUrl}/api/health/oauth`, { headers: { accept: 'application/json' } });
  const writeHealth = await json(writeHealthResponse);
  assert.equal(writeHealthResponse.status, 200, `OAuth DB write health failed after read-only opens: ${JSON.stringify(writeHealth)}\n${output()}`);
  assert.equal(writeHealth?.authorizationCodeWrite, 'ok');

  for (const [index, client] of CLIENTS.entries()) {
    const state = `state-${index}-${Date.now()}`;
    const authorizeUrl = new URL(`${baseUrl}/api/oauth/authorize`);
    authorizeUrl.searchParams.set('client_id', client.id);
    authorizeUrl.searchParams.set('redirect_uri', client.redirectUri);
    authorizeUrl.searchParams.set('state', state);

    const authorizeResponse = await fetch(authorizeUrl, {
      redirect: 'manual',
      headers: { cookie: sessionCookie, accept: 'text/html,application/json' },
    });
    assert.equal(authorizeResponse.status, 302, `${client.id} authorize returned ${authorizeResponse.status}: ${await authorizeResponse.text()}\n${output()}`);

    const location = authorizeResponse.headers.get('location');
    assert.ok(location, `${client.id} authorize must return callback location`);
    const callback = new URL(location);
    assert.equal(callback.origin + callback.pathname, new URL(client.redirectUri).origin + new URL(client.redirectUri).pathname);
    assert.equal(callback.searchParams.get('state'), state);
    const code = callback.searchParams.get('code');
    assert.ok(code, `${client.id} callback must contain an authorization code`);

    const exchangeResponse = await fetch(`${baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: client.redirectUri,
      }),
    });
    const tokens = await json(exchangeResponse);
    assert.equal(exchangeResponse.status, 200, `${client.id} token exchange failed: ${JSON.stringify(tokens)}\n${output()}`);
    assert.ok(tokens?.access_token, `${client.id} must receive access_token`);
    assert.ok(tokens?.refresh_token, `${client.id} must receive refresh_token`);

    const userinfoResponse = await fetch(`${baseUrl}/api/oauth/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/json' },
    });
    const userinfo = await json(userinfoResponse);
    assert.equal(userinfoResponse.status, 200, `${client.id} userinfo failed: ${JSON.stringify(userinfo)}\n${output()}`);
    assert.equal(userinfo?.username, username, `${client.id} userinfo must preserve the canonical SPMT identity`);

    const replayResponse = await fetch(`${baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: client.redirectUri,
      }),
    });
    assert.equal(replayResponse.status, 400, `${client.id} authorization code must be one-time-use`);
  }
});
