import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import WebSocket from 'ws';

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
  assert.equal(compatibilityHealth.body.database.integrity, 'verified_by_backup_restore_drill');

  const homeResponse = await fetch(baseUrl);
  const home = await homeResponse.text();
  assert.equal(homeResponse.status, 200);
  assert.match(home, /Enter only the part before @spmt\.live/);
  assert.match(home, /profile-completion-modal/);
  assert.match(home, /view-developers/);
  assert.match(home, /Create an app-bound key/);
  assert.match(home, /request-recovery-code/);
  assert.match(home, /Generate \+ Show New Recovery Code/);

  const commlinkResponse = await fetch(`${baseUrl}/commlink/`);
  const commlink = await commlinkResponse.text();
  assert.equal(commlinkResponse.status, 200);
  assert.match(commlink, /Cosmo Commlink Preview/);
  assert.match(commlink, /Synthetic chat data/);
  assert.match(commlink, /id="settings-drawer"/);
  assert.match(commlink, /id="destination-chips"/);
  const commlinkCssResponse = await fetch(`${baseUrl}/commlink/commlink.css`);
  assert.equal(commlinkCssResponse.status, 200);
  assert.match(commlinkCssResponse.headers.get('content-type') || '', /text\/css/);
  const commlinkJsResponse = await fetch(`${baseUrl}/commlink/commlink.js`);
  assert.equal(commlinkJsResponse.status, 200);
  assert.match(commlinkJsResponse.headers.get('content-type') || '', /javascript/);

  const sdkMetadataResponse = await fetch(`${baseUrl}/api/platform/sdk`);
  const sdkMetadata = await sdkMetadataResponse.json();
  assert.equal(sdkMetadataResponse.status, 200);
  assert.equal(sdkMetadata.package, '@spmt/sdk');
  assert.equal(sdkMetadata.npmPublished, true);
  assert.match(sdkMetadata.quickInstall, /spmt install/);
  const sdkPackageResponse = await fetch(`${baseUrl}/sdk/spmt-sdk.tgz`);
  assert.equal(sdkPackageResponse.status, 200);
  assert.ok((await sdkPackageResponse.arrayBuffer()).byteLength > 1_000);
  const previousSdkPackageResponse = await fetch(`${baseUrl}/sdk/spmt-sdk-0.1.4.tgz`);
  assert.equal(previousSdkPackageResponse.status, 200, 'published versioned SDK mirrors must remain available');
  assert.ok((await previousSdkPackageResponse.arrayBuffer()).byteLength > 1_000);
  const sdk = await import('../sdk/dist/index.js');
  const sharedChatEvent = {
    schemaVersion: 1,
    eventId: 'evt_smoke_1',
    upstreamId: 'twitch:msg:abc',
    tenantId: 'tenant-smoke',
    platform: 'twitch',
    sourceId: 'stream-smoke',
    sourceName: 'Smoke Stream',
    channelId: 'channel-smoke',
    channelName: 'smokechannel',
    type: 'message',
    sender: { id: 'viewer-smoke', username: 'viewer', displayName: 'Viewer', badges: ['subscriber'], roles: ['viewer'] },
    text: 'hello from smoke',
    sanitizedHtml: 'hello from smoke',
    originalTimestamp: new Date().toISOString(),
    receivedTimestamp: new Date().toISOString(),
    dedupeKey: 'twitch:msg:abc',
    routing: { canReply: true, botReadable: true, botCanReply: false },
  };
  assert.equal(sdk.validateSharedChatEventV1(sharedChatEvent).ok, true);
  assert.equal(sdk.isSharedChatEventV1({ ...sharedChatEvent, tenantId: '' }), false);
  assert.equal(sdk.SPMT_XP_LEDGER_SCHEMA_VERSION, 1);
  const mappedXpAward = sdk.mappedXpAwardV1({
    userId: 'viewer-smoke',
    mappedEventType: 'chat-tag.tag',
    upstreamEventId: 'tag-msg-1',
    metadata: { tenantId: 'tenant-smoke', channelId: 'channel-smoke' },
  });
  assert.equal(mappedXpAward.sourceApp, 'chat-tag');
  assert.equal(mappedXpAward.eventType, 'chat-tag-tag');
  assert.equal(mappedXpAward.delta, 100);
  assert.equal(mappedXpAward.idempotencyKey, 'chat-tag:chat-tag-tag:tag-msg-1:viewer-smoke');
  assert.equal(sdk.validateXpAwardV1(mappedXpAward).ok, true);
  assert.equal(sdk.validateXpAwardV1({ ...mappedXpAward, idempotencyKey: '' }).ok, false);
  const companionEnvelope = {
    schemaVersion: 1,
    id: 'companion-command-smoke',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    userId: 'smoke-user',
    deviceId: 'smoke-device',
    source: 'discord-activity',
    capability: 'obs.control',
    action: 'obs.scene.set',
    payload: { sceneName: 'Starting Soon' },
    requiresConfirmation: false,
  };
  assert.equal(sdk.validateCompanionCommandV1(companionEnvelope).ok, true);
  assert.equal(sdk.validateCompanionCommandV1({ ...companionEnvelope, capability: 'media.read' }).ok, false);
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

  const embedLaunchResponse = await fetch(`${baseUrl}/api/embed/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({
      client_id: 'streamweaver',
      target_origin: 'https://streamweaver-new.fly.dev',
      scopes: ['identity:read', 'workspace:read', 'obs.control'],
    }),
  });
  const embedLaunch = await embedLaunchResponse.json();
  assert.equal(embedLaunchResponse.status, 200);
  assert.ok(embedLaunch.code);
  assert.deepEqual(embedLaunch.scopes, ['identity:read', 'workspace:read']);

  const embedExchangeResponse = await fetch(`${baseUrl}/api/embed/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: embedLaunch.code,
      client_id: 'streamweaver',
      client_secret: 'streamweaver_spmt_secret_2026',
      target_origin: 'https://streamweaver-new.fly.dev',
    }),
  });
  const embedExchange = await embedExchangeResponse.json();
  assert.equal(embedExchangeResponse.status, 200);
  assert.ok(embedExchange.access_token);
  assert.ok(embedExchange.refresh_token);
  assert.equal(embedExchange.user.id, registration.user.id);

  const replayExchangeResponse = await fetch(`${baseUrl}/api/embed/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: embedLaunch.code,
      client_id: 'streamweaver',
      client_secret: 'streamweaver_spmt_secret_2026',
      target_origin: 'https://streamweaver-new.fly.dev',
    }),
  });
  assert.equal(replayExchangeResponse.status, 400);

  const refreshResponse = await fetch(`${baseUrl}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: embedExchange.refresh_token,
      client_id: 'streamweaver',
      client_secret: 'streamweaver_spmt_secret_2026',
    }),
  });
  const refreshed = await refreshResponse.json();
  assert.equal(refreshResponse.status, 200);
  assert.ok(refreshed.access_token);
  assert.ok(refreshed.refresh_token);
  assert.notEqual(refreshed.refresh_token, embedExchange.refresh_token);

  const reusedRefreshResponse = await fetch(`${baseUrl}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: embedExchange.refresh_token,
      client_id: 'streamweaver',
      client_secret: 'streamweaver_spmt_secret_2026',
    }),
  });
  assert.equal(reusedRefreshResponse.status, 400);

  const pairResponse = await fetch(`${baseUrl}/api/companion/devices/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ name: 'Smoke Companion', capabilities: ['companion.status', 'obs.control', 'workflow.run'] }),
  });
  const paired = await pairResponse.json();
  assert.equal(pairResponse.status, 201);
  assert.ok(paired.device.id);
  assert.ok(paired.pairingToken);
  assert.match(paired.relayUrl, /^wss:\/\//);

  const companionSocket = new WebSocket(`ws://127.0.0.1:${port}/api/companion/relay`, {
    headers: {
      Authorization: `Bearer ${paired.pairingToken}`,
      'X-SPMT-Device': paired.device.id,
    },
  });
  await once(companionSocket, 'open');
  const companionMessage = once(companionSocket, 'message');
  const companionCommandResponse = await fetch(`${baseUrl}/api/companion/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({
      deviceId: paired.device.id,
      action: 'obs.scene.set',
      capability: 'obs.control',
      payload: { sceneName: 'Starting Soon' },
      source: 'discord-activity',
    }),
  });
  const companionCommand = await companionCommandResponse.json();
  assert.equal(companionCommandResponse.status, 202);
  assert.equal(companionCommand.command.status, 'sent');
  assert.equal(companionCommand.command.capability, 'obs.control');
  const [companionCommandRaw] = await companionMessage;
  const relayedCompanionCommand = JSON.parse(String(companionCommandRaw));
  assert.equal(relayedCompanionCommand.id, companionCommand.command.id);
  assert.equal(relayedCompanionCommand.action, 'obs.scene.set');
  companionSocket.send(JSON.stringify({
    type: 'companion.result',
    schemaVersion: 1,
    id: relayedCompanionCommand.id,
    ok: true,
    result: { sceneName: 'Starting Soon' },
  }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const companionStatusResponse = await fetch(`${baseUrl}/api/companion/commands/${companionCommand.command.id}`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const companionStatus = await companionStatusResponse.json();
  assert.equal(companionStatusResponse.status, 200);
  assert.equal(companionStatus.command.status, 'completed');
  assert.equal(companionStatus.command.result.sceneName, 'Starting Soon');

  const workflowMessage = once(companionSocket, 'message');
  const companionWorkflowResponse = await fetch(`${baseUrl}/api/companion/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({
      deviceId: paired.device.id,
      action: 'workflow.run',
      capability: 'workflow.run',
      payload: { workflowId: 'test.echo', input: { message: 'smoke test' } },
      source: 'spmt',
    }),
  });
  const companionWorkflowCommand = await companionWorkflowResponse.json();
  assert.equal(companionWorkflowResponse.status, 202);
  assert.equal(companionWorkflowCommand.command.requiresConfirmation, false);
  const [workflowRaw] = await workflowMessage;
  const relayedWorkflow = JSON.parse(String(workflowRaw));
  assert.equal(relayedWorkflow.action, 'workflow.run');
  assert.equal(relayedWorkflow.payload.workflowId, 'test.echo');
  companionSocket.send(JSON.stringify({
    type: 'companion.result',
    schemaVersion: 1,
    id: relayedWorkflow.id,
    ok: true,
    result: { echoed: 'smoke test', touchedLocalState: false },
  }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const companionWorkflowStatusResponse = await fetch(`${baseUrl}/api/companion/commands/${companionWorkflowCommand.command.id}`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const companionWorkflowStatus = await companionWorkflowStatusResponse.json();
  assert.equal(companionWorkflowStatus.command.status, 'completed');
  assert.equal(companionWorkflowStatus.command.result.touchedLocalState, false);
  companionSocket.close();

  const invalidUsernameResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user@somewhere.test', password: 'smoke-password-123' }),
  });
  const invalidUsername = await invalidUsernameResponse.json();
  assert.equal(invalidUsernameResponse.status, 400);
  assert.match(invalidUsername.error, /before @spmt\.live/);

  const workspaceResponse = await fetch(`${baseUrl}/api/workspace-profile`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const workspace = await workspaceResponse.json();
  assert.equal(workspaceResponse.status, 200);
  assert.equal(workspace.created, true);
  assert.equal(workspace.profile.schemaVersion, 1);
  assert.equal(workspace.profile.revision, 1);
  assert.equal(workspace.profile.dockSlots.length, 3);
  assert.equal(workspaceResponse.headers.get('etag'), '"workspace-1"');

  const missingWorkspaceRevisionResponse = await fetch(`${baseUrl}/api/workspace-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ profile: { appearance: { themeId: 'nebula-purple' } } }),
  });
  assert.equal(missingWorkspaceRevisionResponse.status, 428);

  const invalidWorkspaceResponse = await fetch(`${baseUrl}/api/workspace-profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${registration.token}`,
      'If-Match': '"workspace-1"',
    },
    body: JSON.stringify({
      profile: {
        dockSlots: workspace.profile.dockSlots.map((slot) => slot.id === 1
          ? { ...slot, url: 'https://example.com/overlay?token=must-not-persist' }
          : slot),
      },
    }),
  });
  const invalidWorkspace = await invalidWorkspaceResponse.json();
  assert.equal(invalidWorkspaceResponse.status, 400);
  assert.match(invalidWorkspace.fields['dockSlots.1.url'], /sensitive token/);

  const updatedDockSlots = workspace.profile.dockSlots.map((slot) => slot.id === 1
    ? { ...slot, title: 'Smoke Overlay', url: 'https://example.com/smoke-overlay', collapsed: false, volume: 0.5, muted: true }
    : slot);
  const workspaceUpdateResponse = await fetch(`${baseUrl}/api/workspace-profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${registration.token}`,
      'If-Match': '"workspace-1"',
    },
    body: JSON.stringify({
      profile: {
        appearance: { themeId: 'nebula-purple', glowIntensity: 73 },
        dockSlots: updatedDockSlots,
        activeOverlaySceneId: 'scene-main',
        ttsSubscriptions: ['streamweaver-main'],
        appThemeMappings: { streamweaver: 'follow-workspace' },
      },
    }),
  });
  const workspaceUpdate = await workspaceUpdateResponse.json();
  assert.equal(workspaceUpdateResponse.status, 200);
  assert.equal(workspaceUpdate.profile.revision, 2);
  assert.equal(workspaceUpdate.profile.appearance.themeId, 'nebula-purple');
  assert.equal(workspaceUpdate.profile.appearance.glowIntensity, 73);
  assert.equal(workspaceUpdate.profile.dockSlots[0].muted, true);
  assert.equal(workspaceUpdateResponse.headers.get('etag'), '"workspace-2"');
  assert.deepEqual(workspaceUpdate.changed.sort(), ['activeOverlaySceneId', 'appThemeMappings', 'appearance', 'dockSlots', 'ttsSubscriptions']);

  const staleWorkspaceResponse = await fetch(`${baseUrl}/api/workspace-profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${registration.token}`,
      'If-Match': '"workspace-1"',
    },
    body: JSON.stringify({ profile: { appearance: { themeId: 'oceanic-blue' } } }),
  });
  const staleWorkspace = await staleWorkspaceResponse.json();
  assert.equal(staleWorkspaceResponse.status, 409);
  assert.equal(staleWorkspace.profile.revision, 2);
  assert.equal(staleWorkspace.profile.appearance.themeId, 'nebula-purple');

  const exportedWorkspaceResponse = await fetch(`${baseUrl}/api/workspace-profile/export`, {
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const exportedWorkspace = await exportedWorkspaceResponse.json();
  assert.equal(exportedWorkspaceResponse.status, 200);
  assert.equal(exportedWorkspace.profile.revision, 2);
  assert.match(exportedWorkspaceResponse.headers.get('content-disposition'), /spmt-workspace-profile-v1\.json/);

  const secondRegistrationResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'workspace-user-two', password: 'smoke-password-123', displayName: 'Workspace User Two' }),
  });
  const secondRegistration = await secondRegistrationResponse.json();
  assert.equal(secondRegistrationResponse.status, 201);
  const secondWorkspaceResponse = await fetch(`${baseUrl}/api/workspace-profile`, {
    headers: { Authorization: `Bearer ${secondRegistration.token}` },
  });
  const secondWorkspace = await secondWorkspaceResponse.json();
  assert.equal(secondWorkspaceResponse.status, 200);
  assert.equal(secondWorkspace.profile.appearance.themeId, 'solar-flare');
  assert.notEqual(secondWorkspace.profile.dockSlots[0].title, 'Smoke Overlay');

  const appStateCreateResponse = await fetch(`${baseUrl}/api/app-state/hearmeout/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ schemaVersion: 1, data: { activeTheme: 'nebula-purple', hiddenUsers: ['noise-bot'] } }),
  });
  const appStateCreate = await appStateCreateResponse.json();
  assert.equal(appStateCreateResponse.status, 200);
  assert.equal(appStateCreate.revision, 1);
  assert.equal(appStateCreate.data.activeTheme, 'nebula-purple');

  const appStateConflictResponse = await fetch(`${baseUrl}/api/app-state/hearmeout/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ data: { activeTheme: 'solar-flare' } }),
  });
  assert.equal(appStateConflictResponse.status, 409);

  const secretStateResponse = await fetch(`${baseUrl}/api/app-state/hearmeout/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ revision: 1, data: { accessToken: 'must-not-persist' } }),
  });
  assert.equal(secretStateResponse.status, 400);

  const isolatedAppStateResponse = await fetch(`${baseUrl}/api/app-state/hearmeout/preferences`, {
    headers: { Authorization: `Bearer ${secondRegistration.token}` },
  });
  assert.equal(isolatedAppStateResponse.status, 404);

  const overlaySceneResponse = await fetch(`${baseUrl}/api/workspace/overlay-scenes/main-scene`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ name: 'Main scene', data: { layers: [{ type: 'chat', appId: 'streamweaver' }] } }),
  });
  const overlayScene = await overlaySceneResponse.json();
  assert.equal(overlaySceneResponse.status, 200);
  assert.equal(overlayScene.scene.revision, 1);

  const workflowResponse = await fetch(`${baseUrl}/api/workspace/workflows/live-start`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ name: 'Live start', data: { steps: [{ appId: 'streamweaver', action: 'announce' }] } }),
  });
  assert.equal(workflowResponse.status, 200);

  const resetWorkspaceResponse = await fetch(`${baseUrl}/api/workspace-profile/reset`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${registration.token}`,
      'If-Match': '"workspace-2"',
    },
  });
  const resetWorkspace = await resetWorkspaceResponse.json();
  assert.equal(resetWorkspaceResponse.status, 200);
  assert.equal(resetWorkspace.profile.revision, 3);
  assert.equal(resetWorkspace.profile.appearance.themeId, 'solar-flare');
  assert.equal(resetWorkspace.profile.dockSlots[0].title, 'ChatTag Overlay');

  const workspaceDb = new Database(databasePath, { readonly: true });
  const workspaceEvent = workspaceDb.prepare("SELECT payload FROM platform_events WHERE type = 'workspace.profile.updated' AND created_by = ? ORDER BY datetime(created_at) DESC LIMIT 1")
    .get(registration.user.id);
  const workspaceRows = workspaceDb.prepare('SELECT user_id, revision FROM workspace_profiles ORDER BY user_id').all();
  workspaceDb.close();
  assert.ok(workspaceEvent);
  assert.equal(JSON.stringify(JSON.parse(workspaceEvent.payload)).includes('example.com'), false);
  assert.equal(workspaceRows.length, 2);

  const linkResponse = await fetch(`${baseUrl}/api/user/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ discordUsername: 'SmokeDiscord', twitchUsername: 'SmokeTwitch' }),
  });
  const linkedAccounts = await linkResponse.json();
  assert.equal(linkResponse.status, 200);
  assert.equal(linkedAccounts.discordVerified, false);
  assert.equal(linkedAccounts.discordVerification, 'unavailable');
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
      scopes: ['identity:read', 'identity:write', 'apps:read', 'apps:write', 'events:write', 'xp:write'],
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

  const grandfatherResponse = await fetch(`${baseUrl}/api/platform/identity/grandfather`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({
      provider: 'twitch',
      providerUserId: 'twitch-smoke-1001',
      providerUsername: 'smoke-user',
      username: 'smoke-user',
      displayName: 'Grandfathered Smoke User',
      issueSession: true,
    }),
  });
  const grandfather = await grandfatherResponse.json();
  assert.equal(grandfatherResponse.status, 201);
  assert.equal(grandfather.created, true);
  assert.equal(grandfather.user.twitchId, 'twitch-smoke-1001');
  assert.notEqual(grandfather.user.id, registration.user.id);
  assert.notEqual(grandfather.user.username, registration.user.username);
  assert.ok(grandfather.accessToken);

  const grandfatheredMeResponse = await fetch(`${baseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${grandfather.accessToken}` },
  });
  const grandfatheredMe = await grandfatheredMeResponse.json();
  assert.equal(grandfatheredMeResponse.status, 200);
  assert.equal(grandfatheredMe.user.id, grandfather.user.id);

  const claimGrandfatheredResponse = await fetch(`${baseUrl}/api/auth/claim-imported`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${grandfather.accessToken}` },
    body: JSON.stringify({ password: 'grandfathered-smoke-password-123' }),
  });
  const claimedGrandfather = await claimGrandfatheredResponse.json();
  assert.equal(claimGrandfatheredResponse.status, 200);
  assert.equal(claimedGrandfather.claimed, true);
  assert.ok(claimedGrandfather.recoveryCode);
  const claimedLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: grandfather.user.username, password: 'grandfathered-smoke-password-123' }),
  });
  assert.equal(claimedLoginResponse.status, 200);

  const repeatGrandfatherResponse = await fetch(`${baseUrl}/api/platform/identity/grandfather`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({ provider: 'twitch', providerUserId: 'twitch-smoke-1001', username: 'different-name' }),
  });
  const repeatGrandfather = await repeatGrandfatherResponse.json();
  assert.equal(repeatGrandfatherResponse.status, 200);
  assert.equal(repeatGrandfather.created, false);
  assert.equal(repeatGrandfather.user.id, grandfather.user.id);

  const unboundKeyResponse = await fetch(`${baseUrl}/api/platform/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ name: 'Unbound migration key', scopes: ['identity:write'] }),
  });
  const unboundKey = await unboundKeyResponse.json();
  assert.equal(unboundKeyResponse.status, 201);
  const unboundGrandfatherResponse = await fetch(`${baseUrl}/api/platform/identity/grandfather`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${unboundKey.token}` },
    body: JSON.stringify({ provider: 'discord', providerUserId: 'discord-smoke-1001', username: 'unsafe-user' }),
  });
  assert.equal(unboundGrandfatherResponse.status, 403);

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

  const removableSubmissionResponse = await fetch(`${baseUrl}/api/platform/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ ...submissionInput, appId: 'remove-game', name: 'Remove Game' }),
  });
  const removableSubmission = await removableSubmissionResponse.json();
  assert.equal(removableSubmissionResponse.status, 201);
  const deniedRemovalResponse = await fetch(`${baseUrl}/api/platform/apps/${removableSubmission.submission.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${secondRegistration.token}` },
  });
  assert.equal(deniedRemovalResponse.status, 404);
  const removalResponse = await fetch(`${baseUrl}/api/platform/apps/${removableSubmission.submission.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${registration.token}` },
  });
  const removal = await removalResponse.json();
  assert.equal(removalResponse.status, 200);
  assert.equal(removal.ok, true);
  assert.equal(removal.submission.appId, 'remove-game');

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

  const xpAwardResponse = await fetch(`${baseUrl}/api/platform/xp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({ userId: registration.user.id, sourceApp: 'smoke-game', eventType: 'session-win', idempotencyKey: 'smoke-session-win-1', delta: 125, metadata: { sessionId: 'smoke-session' } }),
  });
  assert.equal(xpAwardResponse.status, 201);
  const duplicateXpResponse = await fetch(`${baseUrl}/api/platform/xp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({ userId: registration.user.id, sourceApp: 'smoke-game', eventType: 'session-win', idempotencyKey: 'smoke-session-win-1', delta: 125 }),
  });
  const duplicateXp = await duplicateXpResponse.json();
  assert.equal(duplicateXpResponse.status, 200);
  assert.equal(duplicateXp.duplicate, true);
  const mismatchedXpResponse = await fetch(`${baseUrl}/api/platform/xp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.token}` },
    body: JSON.stringify({ userId: registration.user.id, sourceApp: 'another-game', eventType: 'session-win', idempotencyKey: 'wrong-app', delta: 10 }),
  });
  assert.equal(mismatchedXpResponse.status, 403);
  const xpBalanceResponse = await fetch(`${baseUrl}/api/xp`, { headers: { Authorization: `Bearer ${registration.token}` } });
  const xpBalance = await xpBalanceResponse.json();
  assert.equal(xpBalanceResponse.status, 200);
  assert.equal(xpBalance.xp, 125);
  assert.equal(xpBalance.entries.length, 1);

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
  const companionApp = catalogBeforeApproval.apps.find((app) => app.id === 'companion');
  assert.equal(companionApp.distribution, 'windows-desktop');
  assert.equal(companionApp.downloadUrl, 'https://spmt.live/downloads/companion/windows');
  assert.equal(companionApp.permissions.includes('workflow.run'), true);
  assert.equal(companionApp.signed, false);

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

  const recoveryDeliveryResponse = await fetch(`${baseUrl}/api/auth/request-recovery-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user@spmt.live' }),
  });
  const recoveryDelivery = await recoveryDeliveryResponse.json();
  assert.equal(recoveryDeliveryResponse.status, 202);
  assert.equal(recoveryDelivery.ok, true);
  assert.match(recoveryDelivery.message, /If that account/);
  assert.equal('delivered' in recoveryDelivery, false);
  const repeatedRecoveryResponse = await fetch(`${baseUrl}/api/auth/request-recovery-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user' }),
  });
  assert.equal(repeatedRecoveryResponse.status, 202);

  const resetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'smoke-user',
      recoveryCode: registration.recoveryCode,
      newPassword: 'smoke-password-456',
    }),
  });
  assert.equal(resetResponse.status, 200, 'an unavailable DM must not replace the existing recovery code');
  const reusedCodeResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'smoke-user',
      recoveryCode: registration.recoveryCode,
      newPassword: 'smoke-password-789',
    }),
  });
  assert.equal(reusedCodeResponse.status, 400);
  const newPasswordLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'smoke-user@spmt.live', password: 'smoke-password-456' }),
  });
  assert.equal(newPasswordLoginResponse.status, 200);

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

  console.log(JSON.stringify({ status: 'passed', checks: 184 }));
} catch (error) {
  const detail = error instanceof Error
    ? `${error.stack || error.message}${error.cause ? `\nCause: ${error.cause}` : ''}`
    : String(error);
  throw new Error(`SPMT smoke failed: ${detail}\n${output}`);
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, 'exit');
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
