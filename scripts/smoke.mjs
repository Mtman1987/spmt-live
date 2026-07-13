import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrypoint = path.join(repoRoot, 'dist', 'server.cjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-smoke-'));

function getFreePort() {
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

async function waitForJson(url, attempts = 80) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const body = await response.json();
      return { response, body };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

const invalidParent = path.join(tempRoot, 'not-a-directory');
fs.writeFileSync(invalidParent, 'blocks database directory creation');
const failedStart = spawnSync(process.execPath, [entrypoint], {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: 10_000,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    DATABASE_PATH: path.join(invalidParent, 'spmt.db'),
    JWT_SECRET: 'smoke-only-secret',
  },
});
assert.equal(failedStart.error, undefined, `fail-closed child could not run: ${failedStart.error?.message || 'unknown error'}`);
assert.equal(failedStart.status, 1, 'production must exit with status 1 when the configured database cannot open');
assert.match(
  `${failedStart.stdout || ''}\n${failedStart.stderr || ''}`,
  /Unable to open configured production database/,
  `unexpected fail-closed output (signal: ${failedStart.signal || 'none'})`,
);

const port = await getFreePort();
const databasePath = path.join(tempRoot, 'runtime', 'spmt.db');
let output = '';
const child = spawn(process.execPath, [entrypoint], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DATABASE_PATH: databasePath,
    JWT_SECRET: 'smoke-only-secret',
    BUILD_SHA: 'smoke-build',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

try {
  const baseUrl = `http://127.0.0.1:${port}`;
  const live = await waitForJson(`${baseUrl}/api/health/live`);
  assert.equal(live.response.status, 200);
  assert.equal(live.body.status, 'alive');
  assert.equal(live.body.buildSha, 'smoke-build');

  const ready = await waitForJson(`${baseUrl}/api/health/ready`);
  assert.equal(ready.response.status, 200);
  assert.equal(ready.body.status, 'degraded');
  assert.equal(ready.body.database.status, 'ready');
  assert.equal(ready.body.database.storage, 'local');
  assert.equal(ready.body.configuration.oauthClientSecrets.configured, 0);

  const compatibilityHealth = await waitForJson(`${baseUrl}/api/health`);
  assert.equal(compatibilityHealth.response.status, 200);
  assert.equal(compatibilityHealth.body.database.integrity, 'ok');

  const homeResponse = await fetch(baseUrl);
  const home = await homeResponse.text();
  assert.equal(homeResponse.status, 200);
  assert.match(home, /Enter only the part before @spmt\.live/);
  assert.match(home, /profile-completion-modal/);
  assert.match(home, /view-developers/);
  assert.match(home, /Create an app-bound key/);

  const sdkMetadataResponse = await fetch(`${baseUrl}/api/platform/sdk`);
  const sdkMetadata = await sdkMetadataResponse.json();
  assert.equal(sdkMetadataResponse.status, 200);
  assert.equal(sdkMetadata.package, '@spmt/sdk');
  assert.equal(sdkMetadata.npmPublished, false);
  assert.match(sdkMetadata.quickInstall, /spmt install/);
  const sdkPackageResponse = await fetch(`${baseUrl}/sdk/spmt-sdk.tgz`);
  assert.equal(sdkPackageResponse.status, 200);
  assert.ok((await sdkPackageResponse.arrayBuffer()).byteLength > 1_000);
  const starterZipResponse = await fetch(`${baseUrl}/sdk/atherrea-spmt-starter.zip`);
  assert.equal(starterZipResponse.status, 200);
  assert.ok((await starterZipResponse.arrayBuffer()).byteLength > 1_000);

  const athena = await waitForJson(`${baseUrl}/api/athena/os`);
  assert.equal(athena.response.status, 200);
  assert.equal(athena.body.status, 'degraded');
  assert.equal(athena.body.capabilities.sharedMemory, 'ready');
  assert.equal(athena.body.capabilities.voiceControl, 'unavailable');

  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user@spmt.live', password: 'smoke-password-123', displayName: 'Smoke User' }),
  });
  const registration = await registrationResponse.json();
  assert.equal(registrationResponse.status, 201);
  assert.ok(registration.token);
  assert.equal(registration.user.username, 'smoke-user');
  assert.equal(registration.user.email, 'smoke-user@spmt.live');
  assert.equal(registration.user.handle, 'smoke-user@spmt.live');

  const invalidUsernameResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user@somewhere.test', password: 'smoke-password-123' }),
  });
  const invalidUsername = await invalidUsernameResponse.json();
  assert.equal(invalidUsernameResponse.status, 400);
  assert.match(invalidUsername.error, /before @spmt\.live/);

  const linkResponse = await fetch(`${baseUrl}/api/user/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ discordUsername: 'SmokeDiscord', twitchUsername: 'SmokeTwitch' }),
  });
  assert.equal(linkResponse.status, 200);
  const bridgeResponse = await fetch(`${baseUrl}/api/session/bridge`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const bridge = await bridgeResponse.json();
  assert.equal(bridgeResponse.status, 200);
  assert.equal(bridge.user.discordUsername, 'SmokeDiscord');
  assert.equal(bridge.user.twitchUsername, 'smoketwitch');

  const keyResponse = await fetch(`${baseUrl}/api/platform/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({
      appId: 'smoke-game',
      name: 'Smoke game key',
      scopes: ['identity:read', 'apps:read', 'apps:write', 'events:write'],
    }),
  });
  const key = await keyResponse.json();
  assert.equal(keyResponse.status, 201);
  assert.equal(key.appId, 'smoke-game');
  assert.match(key.token, /^spmt_/);

  const keyVerificationResponse = await fetch(`${baseUrl}/api/platform/api-keys/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key.token}` },
  });
  const keyVerification = await keyVerificationResponse.json();
  assert.equal(keyVerificationResponse.status, 200);
  assert.equal(keyVerification.valid, true);
  assert.equal(keyVerification.key.appId, 'smoke-game');

  const submissionInput = {
    appId: 'smoke-game',
    name: 'Smoke Game',
    description: 'A smoke-test game application for the SPMT partner registry.',
    category: 'Games',
    launchUrl: 'https://example.com/smoke-game',
    healthUrl: 'https://example.com/smoke-game/health',
    version: '0.1.0',
    permissions: ['identity:read', 'apps:read', 'events:write'],
  };
  const submissionResponse = await fetch(`${baseUrl}/api/platform/apps/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify(submissionInput),
  });
  const submission = await submissionResponse.json();
  assert.equal(submissionResponse.status, 201);
  assert.equal(submission.submission.appId, 'smoke-game');
  assert.equal(submission.submission.status, 'review');

  const mismatchedSubmissionResponse = await fetch(`${baseUrl}/api/platform/apps/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({ ...submissionInput, appId: 'another-game' }),
  });
  assert.equal(mismatchedSubmissionResponse.status, 403);

  const submissionsResponse = await fetch(`${baseUrl}/api/platform/apps/submissions`, {
    headers: { Authorization: `Bearer ${key.token}` },
  });
  const submissions = await submissionsResponse.json();
  assert.equal(submissionsResponse.status, 200);
  assert.equal(submissions.submissions.length, 1);
  assert.equal(submissions.submissions[0].appId, 'smoke-game');

  const eventResponse = await fetch(`${baseUrl}/api/platform/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({
      type: 'game.session.started',
      sourceApp: 'smoke-game',
      visibility: 'creator',
      payload: { sessionId: 'smoke-session', playerCount: 1, summary: 'Smoke game session started' },
    }),
  });
  const platformEvent = await eventResponse.json();
  assert.equal(eventResponse.status, 201);
  assert.equal(platformEvent.event.sourceApp, 'smoke-game');
  assert.equal(platformEvent.event.type, 'game.session.started');

  const mismatchedEventResponse = await fetch(`${baseUrl}/api/platform/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({ type: 'game.session.started', sourceApp: 'another-game', payload: {} }),
  });
  assert.equal(mismatchedEventResponse.status, 403);

  const eventListResponse = await fetch(`${baseUrl}/api/platform/events`, {
    headers: { Authorization: `Bearer ${key.token}` },
  });
  const eventList = await eventListResponse.json();
  assert.equal(eventListResponse.status, 200);
  assert.equal(eventList.events.length, 1);
  assert.equal(eventList.events[0].payload.sessionId, 'smoke-session');

  const cliProject = path.join(tempRoot, 'cli-project');
  fs.mkdirSync(cliProject, { recursive: true });
  fs.writeFileSync(path.join(cliProject, 'package.json'), JSON.stringify({ name: 'smoke-game', version: '0.1.0', private: true }, null, 2));
  const cliPath = path.join(repoRoot, 'sdk', 'cli.mjs');
  const cliInstall = spawnSync(process.execPath, [
    cliPath, 'install', '--yes', '--app-id', 'smoke-game', '--name', 'Smoke Game',
    '--description', submissionInput.description, '--launch-url', submissionInput.launchUrl,
  ], {
    cwd: cliProject,
    encoding: 'utf8',
    env: { ...process.env, SPMT_SDK_URL: `file:${path.join(repoRoot, 'public', 'sdk', 'spmt-sdk.tgz')}` },
  });
  assert.equal(cliInstall.status, 0, cliInstall.stderr);
  const cliManifest = JSON.parse(fs.readFileSync(path.join(cliProject, 'spmt.app.json'), 'utf8'));
  assert.equal(cliManifest.appId, 'smoke-game');
  assert.equal('apiKey' in cliManifest, false);
  assert.match(fs.readFileSync(path.join(cliProject, '.gitignore'), 'utf8'), /^\.env$/m);
  assert.equal(fs.existsSync(path.join(cliProject, 'node_modules', '@spmt', 'sdk', 'dist', 'index.js')), true);

  const cliEnvironment = {
    ...process.env,
    SPMT_API_KEY: key.token,
    SPMT_BASE_URL: baseUrl,
  };
  const cliDoctor = spawnSync(process.execPath, [cliPath, 'doctor'], { cwd: cliProject, env: cliEnvironment, encoding: 'utf8' });
  assert.equal(cliDoctor.status, 0, cliDoctor.stderr);
  assert.match(cliDoctor.stdout, /OK key/);
  const cliSubmit = spawnSync(process.execPath, [cliPath, 'submit'], { cwd: cliProject, env: cliEnvironment, encoding: 'utf8' });
  assert.equal(cliSubmit.status, 0, cliSubmit.stderr);
  assert.match(cliSubmit.stdout, /Status: review/);
  const cliEvent = spawnSync(process.execPath, [
    cliPath, 'event', 'game.player.progressed', '--data', '{"level":2,"summary":"Smoke player reached level 2"}',
  ], { cwd: cliProject, env: cliEnvironment, encoding: 'utf8' });
  assert.equal(cliEvent.status, 0, cliEvent.stderr);
  assert.match(cliEvent.stdout, /Published game\.player\.progressed/);

  const catalogBeforeApprovalResponse = await fetch(`${baseUrl}/api/apps`);
  const catalogBeforeApproval = await catalogBeforeApprovalResponse.json();
  assert.equal(catalogBeforeApproval.apps.some((app) => app.id === 'smoke-game'), false);

  const deniedReviewResponse = await fetch(`${baseUrl}/api/platform/apps/review`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  assert.equal(deniedReviewResponse.status, 403);

  const approvalDb = new Database(databasePath);
  approvalDb.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(registration.user.id);
  approvalDb.close();

  const reviewQueueResponse = await fetch(`${baseUrl}/api/platform/apps/review`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const reviewQueue = await reviewQueueResponse.json();
  assert.equal(reviewQueueResponse.status, 200);
  assert.equal(reviewQueue.submissions.length, 1);
  assert.equal(reviewQueue.submissions[0].appId, 'smoke-game');
  const reviewResponse = await fetch(`${baseUrl}/api/platform/apps/${submission.submission.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ status: 'approved', reviewNotes: 'Approved by smoke test.' }),
  });
  const reviewedSubmission = await reviewResponse.json();
  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewedSubmission.submission.status, 'approved');

  const catalogResponse = await fetch(`${baseUrl}/api/apps`);
  const catalog = await catalogResponse.json();
  const approvedApp = catalog.apps.find((app) => app.id === 'smoke-game');
  assert.equal(catalogResponse.status, 200);
  assert.equal(approvedApp.status, 'available');
  assert.equal(approvedApp.official, false);
  const installAppResponse = await fetch(`${baseUrl}/api/apps/smoke-game/install`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const installedApp = await installAppResponse.json();
  assert.equal(installAppResponse.status, 200);
  assert.equal(installedApp.app.id, 'smoke-game');

  const commandResponse = await fetch(`${baseUrl}/api/athena/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ command: 'open the inbox' }),
  });
  const command = await commandResponse.json();
  assert.equal(commandResponse.status, 501);
  assert.equal(command.accepted, false);
  assert.equal(command.routed, false);

  const conversationResponse = await fetch(`${baseUrl}/api/ai/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ bot: 'athena', prompt: 'test prompt storage' }),
  });
  const conversation = await conversationResponse.json();
  assert.equal(conversationResponse.status, 201);
  assert.equal(conversation.stored, true);
  assert.equal(conversation.routed, false);

  console.log(JSON.stringify({ status: 'passed', checks: 94 }));
} catch (error) {
  throw new Error(`SPMT smoke failed: ${error instanceof Error ? error.message : error}\n${output}`);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, 'exit');
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
