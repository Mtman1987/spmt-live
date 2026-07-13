import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

  const athena = await waitForJson(`${baseUrl}/api/athena/os`);
  assert.equal(athena.response.status, 200);
  assert.equal(athena.body.status, 'degraded');
  assert.equal(athena.body.capabilities.sharedMemory, 'ready');
  assert.equal(athena.body.capabilities.voiceControl, 'unavailable');

  const registrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user', password: 'smoke-password-123', displayName: 'Smoke User' }),
  });
  const registration = await registrationResponse.json();
  assert.equal(registrationResponse.status, 201);
  assert.ok(registration.token);

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

  console.log(JSON.stringify({ status: 'passed', checks: 23 }));
} catch (error) {
  throw new Error(`SPMT smoke failed: ${error instanceof Error ? error.message : error}\n${output}`);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, 'exit');
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
