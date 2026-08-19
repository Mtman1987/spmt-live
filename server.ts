Warning: truncated output (original token count: 67073)
Total output lines: 5909

import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket, WebSocketServer } from 'ws';
import { db, getDatabaseReadiness, initDb } from './db.js';
import {
  createDefaultWorkspaceProfile,
  mergeWorkspaceProfile,
  validateWorkspaceProfile,
  type WorkspaceProfileV1,
} from './workspace-profile.js';
import { migrateLegacyXpBalance } from './xp-balance-migration.js';
import { settleGambleWallet } from './xp-gamble-settlement.js';
import { SHARED_SURFACES, SHARED_SURFACE_MODES, sharedSurface } from './shared-surfaces.js';
import { reconcileVerifiedProviderSplit } from './identity-reconciliation.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : crypto.randomBytes(32).toString('hex'));
const APP_VERSION = '1.0.0';
const BUILD_SHA = process.env.BUILD_SHA || 'development';
const RECOVERY_DELIVERY_COOLDOWN_MS = 10 * 60 * 1000;
const OAUTH_ACCESS_TOKEN_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
const EMBED_LAUNCH_CODE_SECONDS = 90;
const recoveryDeliveryAttempts = new Map<string, number>();
const OAUTH_CLIENT_SECRET_NAMES = [
  'SPACEMOUNTAIN_CLIENT_SECRET',
  'DSH_CLIENT_SECRET',
  'STREAMWEAVER_CLIENT_SECRET',
  'CHAT_TAG_CLIENT_SECRET',
  'HEARMEOUT_CLIENT_SECRET',
  'MOUNTAINVIEW_CLIENT_SECRET',
] as const;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || [
  'https://spacemountain.live',
  'https://spacemountain-live.fly.dev',
  'https://discord-stream-hub-new.fly.dev',
  'https://streamweaver-new.fly.dev',
  'https://chat-tag-new.fly.dev',
  'https://hearmeout-main.fly.dev',
  'https://mtman-machine-rotator.fly.dev',
].join(',')).split(',');

const EMBED_SCOPES_BY_CLIENT: Record<string, string[]> = {
  streamweaver: [
    'identity:read',
    'workspace:read',
    'workspace:write',
    'tts:control',
    'overlay:control',
  ],
  'discord-stream-hub': ['identity:read', 'workspace:read', 'discord:control'],
  hearmeout: ['identity:read', 'workspace:read', 'media:control', 'rooms:control'],
  'chat-tag': ['identity:read', 'game:control'],
  'spacemountain-live': ['identity:read'],
};

const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {
  'spacemountain-live': ['xp:write'],
  'discord-stream-hub': ['discord:control', 'athena:write'],
};

const COMPANION_ACTION_CAPABILITIES: Record<string, string> = {
  'companion.status': 'companion.status',
  'overlay.show': 'overlay.control',
  'overlay.hide': 'overlay.control',
  'popout.show': 'overlay.control',
  'popout.hide': 'overlay.control',
  'obs.scene.set': 'obs.control',
  'audio.mute': 'audio.control',
  'audio.volume': 'audio.control',
  'media.transcode': 'media.write',
  'obs.media.play': 'obs.control',
  'workflow.run': 'workflow.run',
  'diagnostics.snapshot.write': 'diagnostics.write',
};
const COMPANION_CAPABILITIES = [...new Set(Object.values(COMPANION_ACTION_CAPABILITIES))];
const companionSockets = new Map<string, WebSocket>();
const COMPANION_WORKFLOWS = new Set(['test.echo', 'audio.jingle.play', 'song.render.request']);
const COMPANION_BOOTSTRAP_SECONDS = 60 * 60;
const SPMT_SESSION_SECONDS = 30 * 24 * 60 * 60;

function companionText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function redactCompanionDiagnosticText(value: unknown) {
  return String(value ?? '')
    .replace(/([?&](?:access_token|refresh_token|id_token|token|api_key|apikey|key|signature|jwt)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]')
    .replace(/(\b(?:authorization|x-api-key|api-key)\s*[:=]\s*)([^\s,;}\]]{8,})/gi, '$1[REDACTED]')
    .replace(/(["']?(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|password|authorization)["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]');
}

function sanitizeCompanionDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[TRUNCATED]';
  if (typeof value === 'string') return redactCompanionDiagnosticText(value).slice(0, 8_000);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.slice(-500).map((item) => sanitizeCompanionDiagnosticValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 500).map(([key, item]) => [
      key.slice(0, 120),
      /(?:authorization|password|secret|token|api[_-]?key|cookie)/i.test(key)
        ? '[REDACTED]'
        : sanitizeCompanionDiagnosticValue(item, depth + 1),
    ]));
  }
  return redactCompanionDiagnosticText(value);
}

function validateCompanionPayload(action: string, value: unknown): Record<string, unknown> | null {
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (['companion.status', 'overlay.show', 'overlay.hide'].includes(action)) return {};
  if (['popout.show', 'popout.hide'].includes(action)) {
    const id = Number(payload.id);
    return Number.isInteger(id) && id >= 1 && id <= 3 ? { id } : null;
  }
  if (action === 'obs.scene.set') {
    const sceneName = companionText(payload.sceneName, 120);
    return sceneName ? { sceneName } : null;
  }
  if (action === 'audio.mute') return typeof payload.muted === 'boolean' ? { muted: payload.muted } : null;
  if (action === 'audio.volume') {
    const volume = Number(payload.volume);
    return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? { volume } : null;
  }
  if (action === 'media.transcode') {
    const inputName = companionText(payload.inputName, 240);
    const preset = companionText(payload.preset, 40);
    return inputName && ['mp4-web', 'audio-mp3', 'gif'].includes(preset) ? { inputName, preset } : null;
  }
  if (action === 'obs.media.play') {
    const mediaName = companionText(payload.mediaName, 240);
    const obsInputName = companionText(payload.obsInputName, 120);
    return mediaName && obsInputName ? { mediaName, obsInputName, title: companionText(payload.title, 120) } : null;
  }
  if (action === 'workflow.run') {
    const workflowId = companionText(payload.workflowId, 80);
    const input = payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
      ? payload.input as Record<string, unknown>
      : {};
    if (!COMPANION_WORKFLOWS.has(workflowId) || JSON.stringify(input).length > 20_000) return null;
    return { workflowId, input };
  }
  if (action === 'diagnostics.snapshot.write') {
    const snapshotId = companionText(payload.snapshotId, 120);
    const capturedAt = companionText(payload.capturedAt, 40);
    const mode = payload.mode === 'debug' ? 'debug' : 'verbose';
    const capturedTime = Date.parse(capturedAt);
    if (!snapshotId || !Number.isFinite(capturedTime)) return null;
    const states = payload.states && typeof payload.states === 'object' && !Array.isArray(payload.states)
      ? sanitizeCompanionDiagnosticValue(payload.states) as Record<string, unknown>
      : {};
    const logs = Array.isArray(payload.logs)
      ? payload.logs.slice(-500).map((entry) => sanitizeCompanionDiagnosticValue(entry))
      : [];
    const sanitized = { snapshotId, capturedAt: new Date(capturedTime).toISOString(), mode, states, logs };
    return JSON.stringify(sanitized).length <= 400_000 ? sanitized : null;
  }
  return null;
}

function companionRequiresConfirmation(action: string, payload: Record<string, unknown>) {
  if (action === 'obs.media.play') return true;
  if (action !== 'workflow.run') return false;
  return payload.workflowId !== 'test.echo';
}

type EcosystemAppRecord = {
  id: string;
  name: string;
  url: string;
  authUrl?: string;
  healthUrl?: string;
  iconUrl?: string;
  description: string;
  category?: string;
  status: string;
  version: string;
  latestVersion: string;
  updatedAt: string;
  releaseNotes: string[];
  official?: boolean;
  permissions?: string[];
  distribution?: 'web' | 'windows-desktop';
  downloadUrl?: string;
  signed?: boolean;
};

const COMPANION_DOWNLOAD_URL = 'https://spmt.live/downloads/companion/windows';
const COMPANION_RELEASE_DOWNLOAD_URL = 'https://github.com/Mtman1987/streamweaver/releases/latest/download/SpaceMountain-Companion-Setup.exe';

const SUITE_APPS: EcosystemAppRecord[] = [
  {
    id: 'spacemountain-live',
    name: 'SpaceMountain',
    url: 'https://spacemountain.live',
    authUrl: 'https://spmt.live/api/oauth/authorize?client_id=spacemountain-live&redirect_uri=https%3A%2F%2Fspacemountain.live%2Fauth%2Fcallback',
    description: 'Main app suite shell, embeds, crew dashboard, and persistent app slots.',
    status: 'connected',
    version: '0.3.0',
    latestVersion: '0.3.0',
    updatedAt: '2026-07-02',
    releaseNotes: ['Shipyard install state, Commlink inbox routing, and SPMT identity restore.'],
  },
  {
    id: 'discord-stream-hub',
    name: 'Discord Stream Hub',
    url: 'https://discord-stream-hub-new.fly.dev/dashboard',
    authUrl: 'https://spmt.live/api/oauth/authorize?client_id=discord-stream-hub&redirect_uri=https%3A%2F%2Fdiscord-stream-hub-new.fly.dev%2Fauth%2Fcallback',
    description: 'Discord community dashboard, shoutouts, leaderboard, calendar, and bridges.',
    status: 'bridge-ready',
    version: '0.2.4',
    latestVersion: '0.2.4',
    updatedAt: '2026-07-01',
    releaseNotes: ['Dashboard-first launch flow and SPMT session bridge support.'],
  },
  {
    id: 'streamweaver',
    name: 'StreamWeaver',
    url: 'https://streamweaver-new.fly.dev/login?next=%2Fcommands',
    authUrl: 'https://streamweaver-new.fly.dev/login?next=%2Fcommands',
    description: 'Automation, commands, image generation, overlays, TTS, and AI workflows.',
    status: 'adapter-needed',
    version: '0.2.1',
    latestVersion: '0.2.1',
    updatedAt: '2026-07-01',
    releaseNotes: ['Registered with SPMT while full adapter work remains queued.'],
  },
  {
    id: 'companion',
    name: 'SpaceMountain Companion',
    url: COMPANION_DOWNLOAD_URL,
    authUrl: COMPANION_DOWNLOAD_URL,
    downloadUrl: COMPANION_DOWNLOAD_URL,
    distribution: 'windows-desktop',
    signed: false,
    description: 'Windows companion setup installer for local overlays, OBS, approved media, and reviewed workflows.',
    category: 'desktop',
    status: 'available',
    version: '0.3.1',
    latestVersion: '0.3.1',
    updatedAt: '2026-08-03',
    releaseNotes: ['The download now targets the Setup executable directly; SignPath Foundation signing is pending approval.'],
    official: true,
    permissions: ['companion.status', 'overlay.control', 'obs.control', 'audio.control', 'workflow.run'],
  },
  {
    id: 'chat-tag',
    name: 'ChatTag + Quackverse',
    url: 'https://chat-tag-new.fly.dev',
    authUrl: 'https://chat-tag-new.fly.dev',
    description: 'ChatTag game, Quackverse, card packs, collectibles, overlays, and Twitch/Discord play.',
    status: 'adapter-needed',
    version: '0.1.8',
    latestVersion: '0.1.8',
    updatedAt: '2026-07-01',
    releaseNotes: ['Registered launcher and health visibility for Shipyard.'],
  },
  {
    id: 'hearmeout',
    name: 'HearMeOut',
    url: 'https://hearmeout-main.fly.dev',
    authUrl: 'https://hearmeout-main.fly.dev',
    description: 'Rooms, watch parties, music, voice surfaces, and media overlays.',
    status: 'adapter-needed',
    version: '0.1.7',
    latestVersion: '0.1.7',
    updatedAt: '2026-07-01',
    releaseNotes: ['Registered launcher and SPMT app catalog metadata.'],
  },
  {
    id: 'mountainview',
    name: 'MountainView AI',
    url: 'https://mtman-machine-rotator.fly.dev/mountainview',
    authUrl: 'https://mtman-machine-rotator.fly.dev/mountainview/auth/login',
    description: 'SPMT-authenticated command bridge for MountainView mobile, glasses, and operator surfaces.',
    status: 'connected',
    version: '0.2.0',
    latestVersion: '0.2.0',
    updatedAt: '2026-07-17',
    releaseNotes: ['Replaced the standalone owner password with SPMT OAuth and server-backed sessions.'],
  },
];

const ATHENA_SKILLS = [
  { id: 'command-routing', name: 'Command Routing', description: 'Will route creator commands to apps through durable jobs and adapters.', phase: 'core', status: 'unavailable' },
  { id: 'shared-memory', name: 'Shared Memory', description: 'Stores authenticated user and app context for reuse across the ecosystem.', phase: 'core', status: 'ready' },
  { id: 'creator-copilot', name: 'Creator Copilot', description: 'Planned assistant for launch, message, forum, and automation actions.', phase: 'assistant', status: 'planned' },
  { id: 'voice-control', name: 'Voice Control', description: 'Planned voice transcript adapter for permissioned Command Bridge jobs.', phase: 'assistant', status: 'unavailable' },
];

const ATHENA_CREW = [
  { id: 'athena', name: 'Athena Core', role: 'orchestrator', status: 'configured' },
  { id: 'atlas', name: 'Atlas', role: 'app awareness', status: 'configured' },
  { id: 'echo', name: 'Echo', role: 'voice and conversation', status: 'unavailable' },
  { id: 'forge', name: 'Forge', role: 'automation and plugins', status: 'unavailable' },
];

const ATHENA_CAPABILITIES = {
  sharedMemory: 'ready',
  appAwareness: 'configured',
  voiceControl: 'unavailable',
  automation: 'unavailable',
  multiAgentCrew: 'unavailable',
  crossAppContext: 'configured',
  creatorAssistant: 'unavailable',
  aiSkills: 'configured',
  aiMarketplace: 'unavailable',
} as const;

const AUTOMATION_RECIPES = [
  { id: 'live-creator-brief', name: 'Live Creator Brief', trigger: 'stream-start', action: 'summarize apps, forums, notifications, and shoutouts', status: 'planned' },
  { id: 'dock-workspace', name: 'Dock Workspace', trigger: 'voice-command', action: 'open the requested app into the active dock slot', status: 'planned' },
  { id: 'community-followup', name: 'Community Follow-up', trigger: 'forum-or-message', action: 'route reply drafts through Commlink', status: 'planned' },
];

const PLATFORM_FEATURES = [
  'Public SDK',
  'Public API',
  'Developer Portal',
  'Plugin Marketplace',
  'App Submission',
  'OAuth Apps',
  'Webhooks',
  'Documentation',
];

const PLATFORM_SCOPES = ['identity:read', 'identity:write', 'apps:read', 'apps:write', 'messages:read', 'messages:write', 'athena:write', 'events:write', 'webhooks:write', 'xp:write'];

const PROVIDER_GRANT_DEFINITIONS = [
  {
    id: 'twitch-broadcaster',
    provider: 'twitch',
    role: 'broadcaster',
    displayName: 'Twitch Broadcaster',
    description: 'Lets StreamWeaver, ChatTag, MountainView, and Athena act with the creator channel context.',
    scopes: ['user:read:email', 'user:write:chat', 'channel:read:subscriptions', 'moderator:read:followers'],
    grantedApps: ['streamweaver', 'chat-tag', 'mountainview', 'spmt'],
    legacyAuthorizeUrl: 'https://streamweaver-new.fly.dev/api/auth/twitch?role=broadcaster',
    statusHelp: 'Uses the StreamWeaver broadcaster OAuth path until SPMT owns the token exchange.',
  },
  {
    id: 'twitch-bot',
    provider: 'twitch',
    role: 'bot',
    displayName: 'Twitch Bot',
    description: 'Lets bot chat, TTS, shoutouts, and command listeners run without reauthorizing per app.',
    scopes: ['chat:read', 'chat:edit', 'user:bot', 'user:read:chat'],
    grantedApps: ['streamweaver', 'discord-stream-hub', 'hearmeout', 'mountainview'],
    legacyAuthorizeUrl: 'https://streamweaver-new.fly.dev/api/auth/twitch?role=bot',
    statusHelp: 'Uses the StreamWeaver bot OAuth path until the shared SPMT token vault is active.',
  },
  {
    id: 'discord-user',
    provider: 'discord',
    role: 'user',
    displayName: 'Discord User',
    description: 'Connects the creator Discord identity for dashboard, rooms, rank, calendar, and Commlink matching.',
    scopes: ['identify', 'email', 'guilds'],
    grantedApps: ['discord-stream-hub', 'hearmeout', 'chat-tag', 'spmt'],
    legacyAuthorizeUrl: 'https://discord-stream-hub-new.fly.dev/login',
    statusHelp: 'Uses DiscordStreamHub login while SPMT-owned Discord OAuth is finished.',
  },
  {
    id: 'discord-bot',
    provider: 'discord',
    role: 'bot',
    displayName: 'Discord Bot / Server',
    description: 'Connects the server bot permissions for posts, buttons, calendar, shoutouts, forums, and notifications.',
    scopes: ['bot', 'applications.commands'],
    grantedApps: ['discord-stream-hub', 'hearmeout', 'chat-tag', 'spmt'],
    legacyAuthorizeUrl: 'https://discord-stream-hub-new.fly.dev/settings',
    statusHelp: 'Server bot install remains in DiscordStreamHub until SPMT has the full bot install flow.',
  },
  {
    id: 'youtube-broadcaster',
    provider: 'youtube',
    role: 'broadcaster',
    displayName: 'YouTube Broadcaster',
    description: 'Prepares shared YouTube context for StreamWeaver, HearMeOut, and Athena commands.',
    scopes: ['youtube.readonly'],
    grantedApps: ['streamweaver', 'hearmeout', 'mountainview', 'spmt'],
    legacyAuthorizeUrl: 'https://streamweaver-new.fly.dev/integrations',
    statusHelp: 'Starts in StreamWeaver integrations until SPMT owns YouTube token exchange.',
  },
  {
    id: 'kick-broadcaster',
    provider: 'kick',
    role: 'broadcaster',
    displayName: 'Kick Broadcaster',
    description: 'Prepares shared Kick chat and creator identity for future app routing.',
    scopes: ['user:read', 'channel:read', 'chat:write'],
    grantedApps: ['streamweaver', 'mountainview', 'spmt'],
    legacyAuthorizeUrl: 'https://streamweaver-new.fly.dev/integrations',
    statusHelp: 'Starts in StreamWeaver integrations until SPMT owns Kick token exchange.',
  },
];

const PLUGIN_MARKETPLACE = [
  { id: 'athena-briefs', name: 'Athena Briefs', category: 'AI', description: 'Generates creator briefs from app status, Commlink, forums, and shoutouts.', scopes: ['athena:write', 'messages:read'] },
  { id: 'stream-snapshot', name: 'Stream Snapshot', category: 'Creator Ops', description: 'Packages live app, points, and community status into a shareable summary.', scopes: ['apps:read', 'messages:read'] },
  { id: 'webhook-relay', name: 'Webhook Relay', category: 'Developer', description: 'Forwards selected platform events to configured webhook endpoints.', scopes: ['webhooks:write'] },
  { id: 'crew-router', name: 'Crew Router', category: 'Community', description: 'Routes forum, notification, and Commlink events to creator workspace lanes.', scopes: ['messages:write'] },
];

const USER_COLUMNS = 'id, username, email, display_name, password_hash, discord_username, discord_id, twitch_username, twitch_id, avatar_url, is_admin, created_at';

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomCredential(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function issueOauthAccessToken(user: any, clientId: string, scopes: string[]) {
  return jwt.sign({
    id: user.id,
    username: user.username,
    email: user.email,
    client_id: clientId,
    scopes,
    is_admin: Boolean(user.is_admin),
  }, JWT_SECRET, { expiresIn: OAUTH_ACCESS_TOKEN_SECONDS });
}

function issueOauthClientAccessToken(clientId: string, scopes: string[]) {
  return jwt.sign({
    client_id: clientId,
    scopes,
    token_use: 'client_credentials',
  }, JWT_SECRET, { expiresIn: OAUTH_ACCESS_TOKEN_SECONDS });
}

function issueOauthRefreshToken(userId: string, clientId: string, scopes: string[]) {
  const token = randomCredential(48);
  const now = new Date();
  db.prepare(`
    INSERT INTO oauth_refresh_tokens (
      token_hash, user_id, client_id, scopes, expires_at, revoked_at, rotated_to_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
  `).run(
    hashSecret(token),
    userId,
    clientId,
    JSON.stringify(scopes),
    new Date(now.getTime() + OAUTH_REFRESH_TOKEN_SECONDS * 1000).toISOString(),
    now.toISOString(),
  );
  return token;
}

function allowedEmbedOrigin(client: any, targetOrigin: string) {
  let normalized: string;
  try {
    normalized = new URL(targetOrigin).origin;
  } catch {
    return false;
  }
  return String(client?.redirect_uris || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .some((value) => {
      try {
        return new URL(value).origin === normalized;
      } catch {
        return false;
      }
    });
}

function generateRecoveryCode() {
  const raw = crypto.randomBytes(9).toString('base64url').toUpperCase();
  return `SPMT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function saveRecoveryCode(userId: string, code: string) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO account_recovery_codes (user_id, code_hash, created_at, used_at)
    VALUES (?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at, used_at = NULL
  `).run(userId, hashSecret(code), now);
}

function createRecoveryCode(userId: string) {
  const code = generateRecoveryCode();
  saveRecoveryCode(userId, code);
  return code;
}

async function sendRecoveryCodeToDiscord(user: any, code: string) {
  const botToken = String(process.env.DISCORD_BOT_TOKEN || '');
  const discordId = String(user?.discord_id || '').trim();
  const linkedUsername = String(user?.discord_username || '').trim().replace(/^@/, '').toLowerCase();
  if (!botToken || !discordId || !linkedUsername) return false;

  const headers = { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' };
  try {
    const identityResponse = await fetch(`https://discord.com/api/v10/users/${encodeURIComponent(discordId)}`, { headers });
    if (!identityResponse.ok) return false;
    const discordUser = await identityResponse.json() as any;
    if (String(discordUser?.username || '').trim().toLowerCase() !== linkedUsername) return false;

    const channelResponse = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!channelResponse.ok) return false;
    const channel = await channelResponse.json() as any;
    if (!channel?.id) return false;

    const avatarUrl = discordUser?.id && discordUser?.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.${String(discordUser.avatar).startsWith('a_') ? 'gif' : 'png'}?size=128`
      : undefined;
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channel.id)}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: '',
        embeds: [{
          author: {
            name: 'SPMT',
            url: 'https://spmt.live',
          },
          title: 'SPMT • Account Recovery',
          description: `Your new recovery code is **${code}**.\n\nUse it at https://spmt.live under **Recover**. Do not share this code. If you did not request it, you can ignore this message and your password remains unchanged.`,
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
    return messageResponse.ok;
  } catch {
    return false;
  }
}

function normalizeScopes(value: unknown) {
  const requested = Array.isArray(value) ? value.map(String) : [];
  const scopes = requested.length ? requested : ['identity:read', 'apps:read', 'messages:write'];
  return Array.from(new Set(scopes.filter((scope) => PLATFORM_SCOPES.includes(scope))));
}

function normalizeRegistrationUsername(value: unknown): { username: string | null; error: string | null } {
  const submitted = String(value || '').trim().toLowerCase();
  const suffix = '@spmt.live';
  const username = submitted.endsWith(suffix) ? submitted.slice(0, -suffix.length) : submitted;

  if (username.length < 3) {
    return { username: null, error: 'Username must be at least 3 characters' };
  }
  if (username.length > 30) {
    return { username: null, error: 'Username must be 30 characters or fewer' };
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return {
      username: null,
      error: 'Enter only the username before @spmt.live using letters, numbers, dots, underscores, or hyphens',
    };
  }

  return { username, error: null };
}

function normalizeDeveloperUrl(value: unknown, field: string, required = false) {
  const url = String(value || '').trim();
  if (!url && !required) return null;
  if (!url) throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
  if (!/^https:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) {
    throw Object.assign(new Error(`${field} must be an HTTPS URL (localhost HTTP is allowed for development)`), { statusCode: 400 });
  }
  return url;
}

function normalizeAppSubmission(input: any) {
  const appId = String(input?.appId || input?.app_id || '').trim().toLowerCase();
  const name = compactText(input?.name, 80);
  const description = compactText(input?.description, 600);
  const category = compactText(input?.category || 'Games', 60);
  const version = String(input?.version || '0.1.0').trim();
  const permissions = Array.from(new Set(
    (Array.isArray(input?.permissions) ? input.permissions : [])
      .map((permission: unknown) => String(permission).trim())
      .filter((permission: string) => /^[a-z0-9][a-z0-9:._-]*$/i.test(permission))
      .slice(0, 20),
  ));

  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(appId)) {
    throw Object.assign(new Error('appId must be a 2-50 character lowercase slug using letters, numbers, or hyphens'), { statusCode: 400 });
  }
  if (SUITE_APPS.some((app) => app.id === appId)) {
    throw Object.assign(new Error('appId is reserved by a first-party SPMT app'), { statusCode: 409 });
  }
  if (name.length < 2 || description.length < 10) {
    throw Object.assign(new Error('name and a description of at least 10 characters are required'), { statusCode: 400 });
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw Object.assign(new Error('version must use semantic versioning such as 0.1.0'), { statusCode: 400 });
  }

  return {
    appId,
    name,
    description,
    category,
    launchUrl: normalizeDeveloperUrl(input?.launchUrl || input?.launch_url, 'launchUrl', true) as string,
    authUrl: normalizeDeveloperUrl(input?.authUrl || input?.auth_url, 'authUrl'),
    healthUrl: normalizeDeveloperUrl(input?.healthUrl || input?.health_url, 'healthUrl'),
    iconUrl: normalizeDeveloperUrl(input?.iconUrl || input?.icon_url, 'iconUrl'),
    version,
    permissions,
  };
}

function serializeAppSubmission(row: any) {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name,
    description: row.description,
    category: row.category,
    launchUrl: row.launch_url,
    authUrl: row.auth_url,
    healthUrl: row.health_url,
    iconUrl: row.icon_url,
    version: row.version,
    permissions: parseStringArray(row.permissions),
    status: row.status,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

function listAppSubmissions(userId: string) {
  return (db.prepare(`
    SELECT id, app_id, name, description, category, launch_url, auth_url, health_url,
      icon_url, version, permissions, status, review_notes, created_at, updated_at, reviewed_at
    FROM app_submissions
    WHERE user_id = ?
    ORDER BY datetime(COALESCE(updated_at, created_at)) DESC
  `).all(userId) as any[]).map(serializeAppSubmission);
}

function submitAppForUser(userId: string, input: any) {
  const submission = normalizeAppSubmission(input);
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM app_submissions WHERE user_id = ? AND app_id = ?').get(userId, submission.appId) as any;
  const id = existing?.id || uuidv4();

  if (existing) {
    db.prepare(`
      UPDATE app_submissions
      SET name = ?, description = ?, category = ?, launch_url = ?, auth_url = ?, health_url = ?,
        icon_url = ?, version = ?, permissions = ?, status = 'review', updated_at = ?, reviewed_at = NULL, review_notes = NULL
      WHERE id = ? AND user_id = ?
    `).run(
      submission.name, submission.description, submission.category, submission.launchUrl,
      submission.authUrl, submission.healthUrl, submission.iconUrl, submission.version,
      JSON.stringify(submission.permissions), now, id, userId,
    );
  } else {
    db.prepare(`
      INSERT INTO app_submissions (
        id, user_id, app_id, name, description, category, launch_url, auth_url, health_url,
        icon_url, version, permissions, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', ?, ?)
    `).run(
      id, userId, submission.appId, submission.name, submission.description, submission.category,
      submission.launchUrl, submission.authUrl, submission.healthUrl, submission.iconUrl,
      submission.version, JSON.stringify(submission.permissions), now, now,
    );
  }

  const row = db.prepare('SELECT * FROM app_submissions WHERE id = ?').get(id);
  return serializeAppSubmission(row);
}

function serializeUser(user: any) {
  const linkedAccounts = [
    user.discord_id || user.discord_username
      ? {
          provider: 'discord',
          providerUserId: user.discord_id || null,
          username: user.discord_username || null,
          displayName: user.discord_username || null,
          avatarUrl: user.avatar_url || null,
          connectedAt: user.created_at,
        }
      : null,
    user.twitch_id || user.twitch_username
      ? {
          provider: 'twitch',
          providerUserId: user.twitch_id || null,
          username: user.twitch_username || null,
          displayName: user.twitch_username || null,
          avatarUrl: user.avatar_url || null,
          connectedAt: user.created_at,
        }
      : null,
  ].filter(Boolean);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    handle: `${user.username}@spmt.live`,
    displayName: user.display_name,
    display_name: user.display_name,
    discordUsername: user.discord_username,
    discord_username: user.discord_username,
    discordId: user.discord_id,
    discord_id: user.discord_id,
    twitchUsername: user.twitch_username,
    twitch_username: user.twitch_username,
    twitchId: user.twitch_id,
    twitch_id: user.twitch_id,
    avatarUrl: user.avatar_url || null,
    avatar_url: user.avatar_url || null,
    linkedAccounts,
    linked_accounts: linkedAccounts,
    isAdmin: Boolean(user.is_admin),
    is_admin: Boolean(user.is_admin),
    credentialState: user.password_hash === 'SYSTEM_NO_LOGIN' ? 'provider-owned' : 'password-set',
    createdAt: user.created_at,
    created_at: user.created_at,
  };
}

function getUserById(id: string) {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as any;
}

function signSession(user: any, expiresIn: jwt.SignOptions['expiresIn'] = '30d') {
  return jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn });
}

function setSessionCookie(res: any, token: string) {
  res.cookie('spmt_token', token, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function appPermissionsFor(appId: string) {
  const base: Record<string, string[]> = {
    'spacemountain-live': ['identity:read', 'apps:launch', 'messages:read', 'messages:write'],
    'discord-stream-hub': ['identity:read', 'linked_accounts:read', 'messages:write'],
    streamweaver: ['identity:read', 'linked_accounts:read', 'messages:write'],
    companion: ['companion.status', 'overlay.control', 'obs.control', 'audio.control', 'workflow.run'],
    'chat-tag': ['identity:read', 'apps:launch'],
    hearmeout: ['identity:read', 'apps:launch'],
    mountainview: ['identity:read', 'linked_accounts:read', 'apps:launch'],
  };
  return base[appId] || ['identity:read'];
}

function parseStringArray(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function approvedPartnerApps(): EcosystemAppRecord[] {
  const rows = db.prepare(`
    SELECT app_id, name, description, category, launch_url, auth_url, health_url,
      icon_url, version, permissions, reviewed_at, updated_at, created_at
    FROM app_submissions
    WHERE status = 'approved' AND app_id IS NOT NULL
    ORDER BY datetime(COALESCE(reviewed_at, updated_at, created_at)) ASC
  `).all() as any[];

  const reservedIds = new Set(SUITE_APPS.map((app) => app.id));
  return rows
    .filter((row) => row.app_id && !reservedIds.has(row.app_id))
    .map((row) => ({
      id: row.app_id,
      name: row.name,
      url: row.launch_url,
      authUrl: row.auth_url || row.launch_url,
      healthUrl: row.health_url || undefined,
      iconUrl: row.icon_url || undefined,
      description: row.description,
      category: row.category || 'Games',
      status: 'available',
      version: row.version || '0.1.0',
      latestVersion: row.version || '0.1.0',
      updatedAt: row.reviewed_at || row.updated_at || row.created_at,
      releaseNotes: ['Approved partner app from the SPMT developer registry.'],
      official: false,
      permissions: parseStringArray(row.permissions),
    }));
}

function ecosystemApps() {
  return [...SUITE_APPS, ...approvedPartnerApps()];
}

function buildAppsForUser(userId?: string) {
  const installs = userId
    ? db.prepare('SELECT app_id, enabled, installed_at FROM app_installs WHERE user_id = ?').all(userId) as any[]
    : [];
  const installMap = new Map(installs.map((row) => [row.app_id, row]));

  return ecosystemApps().map((app) => {
    const installed = app.id === 'spacemountain-live' ? true : Boolean(installMap.get(app.id));
    const install = installMap.get(app.id);
    return {
      ...app,
      installed,
      enabled: app.id === 'spacemountain-live' ? true : Boolean(install?.enabled),
      installedAt: install?.installed_at || (app.id === 'spacemountain-live' ? 'first-party' : null),
      permissions: app.permissions?.length ? app.permissions : appPermissionsFor(app.id),
      updateAvailable: app.version !== app.latestVersion,
    };
  });
}

function providerGrantDefinitions() {
  return PROVIDER_GRANT_DEFINITIONS.map((grant) => ({ ...grant }));
}

function buildProviderGrantsForUser(userId: string) {
  const rows = db.prepare('SELECT * FROM provider_grants WHERE user_id = ?').all(userId) as any[];
  const rowMap = new Map(rows.map((row) => [`${row.provider}:${row.role}`, row]));
  return providerGrantDefinitions().map((definition) => {
    const row = rowMap.get(`${definition.provider}:${definition.role}`);
    return {
      ...definition,
      status: row?.status || 'not_connected',
      scopes: row?.scopes ? JSON.parse(row.scopes) : definition.scopes,
      grantedApps: row?.granted_apps ? JSON.parse(row.granted_apps) : definition.grantedApps,
      legacyAuthorizeUrl: row?.legacy_authorize_url || definition.legacyAuthorizeUrl,
      notes: row?.notes || definition.statusHelp,
      metadata: row?.metadata ? JSON.parse(row.metadata) : {},
      authorizedAt: row?.authorized_at || null,
      updatedAt: row?.updated_at || null,
      createdAt: row?.created_at || null,
    };
  });
}

function upsertProviderGrant(userId: string, grantId: string, status: string, metadata: Record<string, unknown> = {}) {
  const definition = PROVIDER_GRANT_DEFINITIONS.find((grant) => grant.id === grantId);
  if (!definition) return null;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO provider_grants (id, user_id, provider, role, display_name, status, scopes, granted_apps, legacy_authorize_url, notes, metadata, authorized_at, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider, role) DO UPDATE SET
      display_name = excluded.display_name,
      status = excluded.status,
      scopes = excluded.scopes,
      granted_apps = excluded.granted_apps,
      legacy_authorize_url = excluded.legacy_authorize_url,
      notes = excluded.notes,
      metadata = excluded.metadata,
      authorized_at = excluded.authorized_at,
      updated_at = excluded.updated_at
  `).run(
    `${userId}:${definition.provider}:${definition.role}`,
    userId,
    definition.provider,
    definition.role,
    definition.displayName,
    status,
    JSON.stringify(definition.scopes),
    JSON.stringify(definition.grantedApps),
    definition.legacyAuthorizeUrl,
    definition.statusHelp,
    JSON.stringify(metadata),
    status === 'connected' ? now : null,
    now,
    now
  );
  return buildProviderGrantsForUser(userId).find((grant) => grant.id === grantId);
}

function cleanHandle(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/@spmt\.live$/, '')
    .replace(/[^a-z0-9._-]/g, '');
}

function findUserByHandle(value: unknown) {
  const handle = cleanHandle(value);
  if (!handle) return null;
  return db.prepare('SELECT id, username, email, display_name FROM users WHERE username = ? OR email = ?')
    .get(handle, `${handle}@spmt.live`) as any;
}

function ensureSystemUser(username: string, displayName: string) {
  const clean = cleanHandle(username) || 'system';
  let user = db.prepare('SELECT id, username, email, display_name FROM users WHERE username = ?').get(clean) as any;
  if (user) return user;

  const id = `app_${clean}`;
  db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, clean, `${clean}@spmt.live`, displayName, 'SYSTEM_NO_LOGIN', new Date().toISOString());
  user = db.prepare('SELECT id, username, email, display_name FROM users WHERE username = ?').get(clean) as any;
  return user;
}

function ensureDirectConversation(userA: string, userB: string, now = new Date().toISOString()) {
  const existing = db.prepare(`
    SELECT c.id
    FROM conversations c
    JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
    JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
    WHERE c.type = 'direct'
    LIMIT 1
  `).get(userA, userB) as any;
  if (existing) {
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, existing.id);
    return existing.id;
  }

  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id, title, type, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, null, 'direct', userA, now, now);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(id, userA, 'member', now);
  db.prepare('INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(id, userB, 'member', now);
  return id;
}

function createNotification(userId: string, title: string, body: string, options: { type?: string; sourceApp?: string; linkUrl?: string } = {}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, source_app, link_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, options.type || 'message', title, body, options.sourceApp || null, options.linkUrl || null, new Date().toISOString());
  return id;
}

function importedUsername(provider: 'discord' | 'twitch', providerUserId: string, proposed: unknown) {
  const proposedUsername = cleanHandle(proposed).slice(0, 30);
  const base = proposedUsername.length >= 3 ? proposedUsername : `${provider}-user`;
  if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(base)) return base;

  // A display name collision is never proof that two identities are the same.
  const stableSuffix = crypto.createHash('sha256').update(`${provider}:${providerUserId}`).digest('hex').slice(0, 8);
  const suffixed = `${base.slice(0, 21)}-${stableSuffix}`;
  if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(suffixed)) return suffixed;

  let sequence = 2;
  while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(`${suffixed.slice(0, 27)}-${sequence}`)) sequence += 1;
  return `${suffixed.slice(0, 27)}-${sequence}`;
}

function normalizeEventLinks(value: unknown) {
  if (!Array.isArray(value)) return null;
  const links = value
    .map((item: any) => ({
      label: String(item?.label || '').trim(),
      url: String(item?.url || '').trim(),
      kind: String(item?.kind || 'details').trim(),
    }))
    .filter((item) => item.label && /^https?:\/\//i.test(item.url) && ['launch', 'details', 'manage', 'external'].includes(item.kind))
    .slice(0, 10);
  return links.length ? links : null;
}

function compactText(value: unknown, maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function findSingleProviderIdentity(column: 'discord_id' | 'twitch_id', providerUserId: string) {
  const matches = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE ${column} = ? ORDER BY datetime(created_at) ASC`).all(providerUserId) as any[];
  if (matches.length > 1) {
    throw Object.assign(new Error(`Multiple SPMT identities already use this ${column === 'discord_id' ? 'Discord' : 'Twitch'} account`), {
      statusCode: 409,
      code: 'duplicate_provider_identity',
    });
  }
  return matches[0] || null;
}

function issueProviderIdentityTicket(userId: string, purpose: 'claim' | 'recover', sourceApp: string) {
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

function providerClaimOrigin(req: any) {
  const configured = String(process.env.SPMT_PUBLIC_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (IS_PRODUCTION) return 'https://spmt.live';
  return `${req.protocol}://${req.get('host')}`;
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function providerClaimPage(input: { ticket: string; username: string; displayName: string; purpose: 'claim' | 'recover' }) {
  const action = input.purpose === 'claim' ? 'Claim your SPMT identity' : 'Recover your SPMT identity';
  const explanation = input.purpose === 'claim'
    ? 'Your linked account ownership is verified. Set a password to finish taking ownership of this existing SPMT identity.'
    : 'Your linked account ownership is verified. Set a new password to recover this SPMT identity.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(action)} · SPMT</title>
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#172554,#050816 55%);font-family:system-ui,sans-serif;color:#f8fafc;padding:24px}.card{width:min(520px,100%);background:rgba(15,23,42,.94);border:1px solid #334155;border-radius:20px;padding:28px;box-shadow:0 24px 80px #0008}h1{margin:0 0 8px;font-size:1.75rem}.eyebrow{color:#a5b4fc;font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:.78rem}.muted{color:#cbd5e1;line-height:1.55}.identity{margin:18px 0;padding:14px;border-radius:12px;background:#111c35;border:1px solid #293857}.identity strong{display:block;font-size:1.08rem}.identity span{color:#a5b4fc}label{display:block;margin:14px 0 6px;font-weight:650}input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #475569;background:#080d1c;color:#fff;font:inherit}button,.button{display:inline-flex;justify-content:center;width:100%;margin-top:18px;padding:12px 16px;border:0;border-radius:10px;background:#7c3aed;color:#fff;font:inherit;font-weight:750;text-decoration:none;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.notice{margin-top:14px;min-height:24px;color:#fca5a5}.success{color:#bbf7d0}.code{display:block;margin:14px 0;padding:12px;background:#020617;border:1px dashed #64748b;border-radius:10px;word-break:break-all;color:#fde68a}
  </style>
</head>
<body>
  <main class="card">
    <div class="eyebrow">One crew · one identity</div>
    <h1>${escapeHtml(action)}</h1>
    <p class="muted">${escapeHtml(explanation)}</p>
    <div class="identity"><strong>${escapeHtml(input.displayName || input.username)}</strong><span>${escapeHtml(input.username)}@spmt.live</span></div>
    <form id="claim-form">
      <label for="password">New password</label>
      <input id="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" required>
      <label for="confirm">Confirm new password</label>
      <input id="confirm" type="password" minlength="12" maxlength="200" autocomplete="new-password" required>
      <button id="submit" type="submit">${escapeHtml(input.purpose === 'claim' ? 'Claim identity and continue' : 'Recover identity and continue')}</button>
    </form>
    <div id="notice" class="notice" role="status"></div>
    <div id="finished" hidden></div>
  </main>
  <script>
    const ticket = ${JSON.stringify(input.ticket)};
    const form = document.getElementById('claim-form');
    const notice = document.getElementById('notice');
    const submit = document.getElementById('submit');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm').value;
      if (password !== confirmPassword) { notice.textContent = 'The passwords do not match.'; return; }
      submit.disabled = true;
      notice.textContent = 'Securing your SPMT identity…';
      try {
        const response = await fetch('/api/auth/provider-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ticket, password, confirmPassword }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'SPMT could not finish this identity.');
        if (data.token) localStorage.setItem('spmt_token', data.token);
        form.hidden = true;
        notice.className = 'notice success';
        notice.textContent = 'Identity secured. Save the recovery code below, then continue to SPMT.';
        const finished = document.getElementById('finished');
        finished.hidden = false;
        finished.innerHTML = '<span class="code"></span><a class="button" href="/">Continue to SPMT</a>';
        finished.querySelector('.code').textContent = data.recoveryCode || 'Recovery code unavailable';
      } catch (error) {
        notice.textContent = error instanceof Error ? error.message : 'SPMT could not finish this identity.';
        submit.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}

function summarizePlatformEventPayload(event: any) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  const summary = compactText(
    payload.summary ||
    payload.title ||
    payload.message ||
    payload.command ||
    payload.transcript ||
    payload.query ||
    payload.prompt ||
    event.type.replace(/\./g, ' '),
    500,
  );
  const actor = compactText(event.actor?.displayName || event.actor?.username || event.actor?.userId || '', 120);
  const target = compactText(payload.target || payload.channel || payload.roomName || payload.roomId || payload.tenantId || '', 180);
  const details = JSON.stringify({
    type: event.type,
    sourceApp: event.sourceApp,
    actor: event.actor,
    visibility: event.visibility,
    payload,
    links: event.links,
  });

  return [
    summary,
    actor ? `Actor: ${actor}` : '',
    target ? `Target: ${target}` : '',
    `Event: ${event.type} from ${event.sourceApp}`,
    `Details: ${compactText(details, 1800)}`,
  ].filter(Boolean).join('\n');
}

function recordPlatformEventMemory(event: any) {
  if (!event.createdBy) return;
  if (event.payload?.athenaMemory === false) return;
  if (!['private', 'creator', 'community', 'public'].includes(event.visibility)) return;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO athena_memory (id, user_id, scope, topic, content, source_app, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    event.createdBy,
    event.visibility === 'private' ? 'private-event' : 'app-event',
    `${event.sourceApp}: ${event.type}`,
    summarizePlatformEventPayload(event),
    event.sourceApp,
    now,
    now,
  );
}

function createPlatformEvent(input: any, createdBy?: string) {
  const type = String(input?.type || '').trim().toLowerCase();
  const sourceApp = String(input?.sourceApp || input?.source_app || '').trim();
  const visibility = String(input?.visibility || 'creator').trim();
  const allowedVisibility = ['private', 'creator', 'community', 'public', 'system'];
  const payload = input?.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {};
  const actor = input?.actor && typeof input.actor === 'object' ? input.actor : {};
  const links = normalizeEventLinks(input?.links);

  if (!/^[a-z0-9][a-z0-9._-]*$/.test(type)) {
    throw Object.assign(new Error('type must use dotted lowercase event naming'), { statusCode: 400 });
  }
  if (!sourceApp || !/^[a-z0-9][a-z0-9._-]*$/i.test(sourceApp)) {
    throw Object.assign(new Error('sourceApp is required'), { statusCode: 400 });
  }
  if (!allowedVisibility.includes(visibility)) {
    throw Object.assign(new Error('visibility must be private, creator, community, public, or system'), { statusCode: 400 });
  }

  const event = {
    id: String(input?.id || uuidv4()).trim(),
    type,
    version: Number.isFinite(Number(input?.version)) ? Math.max(1, Number(input.version)) : 1,
    timestamp: String(input?.timestamp || new Date().toISOString()),
    sourceApp,
    actor: {
      userId: actor.userId || actor.user_id || null,
      username: actor.username || null,
      displayName: actor.displayName || actor.display_name || null,
    },
    visibility,
    payload,
    links,
    createdBy: createdBy || null,
    createdAt: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO platform_events (
      id, type, version, timestamp, source_app, actor_user_id, actor_username,
      actor_display_name, visibility, payload, links, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.type,
    event.version,
    event.timestamp,
    event.sourceApp,
    event.actor.userId,
    event.actor.username,
    event.actor.displayName,
    event.visibility,
    JSON.stringify(event.payload),
    event.links ? JSON.stringify(event.links) : null,
    event.createdBy,
    event.createdAt,
  );

  if (event.createdBy && event.payload?.notify !== false && ['private', 'creator', 'community'].includes(event.visibility)) {
    const summary = typeof event.payload.summary === 'string'
      ? event.payload.summary
      : typeof event.payload.title === 'string'
        ? event.payload.title
        : event.type.replace(/\./g, ' ');
    createNotification(event.createdBy, `${event.sourceApp}: ${event.type}`, summary, {
      type: 'event',
      sourceApp: event.sourceApp,
      linkUrl: event.links?.[0]?.url,
    });
  }

  recordPlatformEventMemory(event);

  return event;
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) return null;
  const attachments = value
    .map((item: any) => ({
      url: String(item?.url || '').trim(),
      name: String(item?.name || item?.filename || '').trim() || null,
      type: String(item?.type || item?.contentType || '').trim() || null,
    }))
    .filter((item) => item.url && /^https?:\/\//i.test(item.url))
    .slice(0, 10);
  return attachments.length ? JSON.stringify(attachments) : null;
}

function extractMentionedUsers(body: unknown, explicitMentions: unknown) {
  const handles = new Set<string>();
  if (Array.isArray(explicitMentions)) {
    for (const mention of explicitMentions) {
      const handle = cleanHandle(typeof mention === 'string' ? mention : mention?.username || mention?.handle);
      if (handle) handles.add(handle);
    }
  }

  for (const match of String(body || '').matchAll(/@([a-z0-9._-]{3,32})(?:@spmt\.live)?/gi)) {
    const handle = cleanHandle(match[1]);
    if (handle) handles.add(handle);
  }

  const users = Array.from(handles)
    .map((handle) => findUserByHandle(handle))
    .filter(Boolean)
    .map((user: any) => ({ id: user.id, username: user.username, displayName: user.display_name }));

  return users.length ? JSON.stringify(users) : null;
}

app.use('/api/platform/companion/diagnostics', express.json({ limit: '512kb' }));
app.use(express.json());
app.use(cookieParser());

// CORS for ecosystem apps
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,If-Match,x-spmt-key');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Auth middleware
function authenticate(req: any, res: any, next: any) {
  const token = req.cookies?.spmt_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requirePlatformAdmin(req: any, res: any, next: any) {
  const user = getUserById(req.user?.id);
  if (!user?.is_admin) return res.status(403).json({ error: 'Platform administrator access required' });
  req.currentUser = user;
  next();
}

function authenticateCodexGateway(req: any, res: any, next: any) {
  const serviceSecret = String(process.env.SPMT_CODEX_SERVICE_SECRET || '').trim();
  const supplied = String(req.headers['x-spmt-codex-secret'] || '').trim();
  if (serviceSecret && supplied) {
    const expectedHash = crypto.createHash('sha256').update(serviceSecret).digest();
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
    if (crypto.timingSafeEqual(expectedHash, suppliedHash)) {
      req.codexCaller = 'service';
      return next();
    }
  }

  const token = req.cookies?.spmt_token || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      const user = getUserById(payload.id);
      if (user?.is_admin) {
        req.user = payload;
        req.currentUser = user;
        req.codexCaller = 'admin';
        return next();
      }
    } catch {}
  }
  return res.status(401).json({ error: 'Athena Codex authorization required' });
}

async function proxyCodexWorker(req: any, res: any, workerPath: string, method = 'GET') {
  const baseUrl = String(process.env.CODEX_WORKER_URL || 'https://mtman-machine-rotator.fly.dev').trim();
  const secret = String(process.env.CODEX_WORKER_SECRET || '').trim();
  if (!secret) return res.status(503).json({ error: 'CODEX_WORKER_SECRET is not configured' });
  const response = await fetch(new URL(workerPath, baseUrl), {
    method,
    headers: {
      accept: req.headers.accept || 'application/json',
      'content-type': 'application/json',
      'x-codex-worker-secret': secret,
    },
    ...(method === 'POST' ? { body: JSON.stringify(req.body || {}) } : {}),
  });
  const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';
  const body = Buffer.from(await response.arrayBuffer());
  res.status(response.status).set('content-type', contentType).set('cache-control', 'private, no-store').send(body);
}

function authenticatePlatformKey(requiredScope: string) {
  return (req: any, res: any, next: any) => {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const headerKey = String(req.headers['x-spmt-key'] || '').trim();
    const token = bearer || headerKey;
    if (!token) return res.status(401).json({ error: 'SPMT bearer or platform API key required' });

    // Platform OAuth supports two intentionally separate token classes:
    // user OAuth for ordinary app-scoped calls, and client credentials for
    // server-to-server writes such as XP awards. Historical user tokens that
    // still contain xp:write must never become XP service credentials.
    if (bearer) {
      try {
        const payload = jwt.verify(bearer, JWT_SECRET) as any;
        const appId = String(payload?.client_id || '').trim();
        const userId = String(payload?.id || '').trim();
        const tokenUse = String(payload?.token_use || '').trim();
        const scopes = Array.isArray(payload?.scopes) ? payload.scopes.map(String) : [];
        if (appId && tokenUse === 'client_credentials') {
          if (!scopes.includes(requiredScope)) {
            return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
          }
          req.platformKey = {
            id: null,
            userId: null,
            appId,
            name: `OAuth client ${appId}`,
            keyPrefix: null,
            scopes,
            oauth: true,
            service: true,
          };
          return next();
        }
        if (appId && userId) {
          if (requiredScope === 'xp:write') {
            return res.status(403).json({ error: 'xp:write requires OAuth client credentials' });
          }
          if (!scopes.includes(requiredScope)) {
            return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
          }
          req.user = payload;
          req.platformKey = {
            id: null,
            userId,
            appId,
            name: `OAuth ${appId}`,
            keyPrefix: null,
            scopes,
            oauth: true,
            service: false,
          };
          return next();
        }
      } catch {
        // Authorization bearer may still be a legacy developer API key.
      }
    }

    const row = db.prepare(`
      SELECT id, user_id, app_id, name, key_prefix, scopes
      FROM developer_api_keys
      WHERE key_hash = ? AND revoked_at IS NULL
    `).get(hashSecret(token)) as any;
    if (!row) return res.status(401).json({ error: 'Invalid SPMT bearer or platform API key' });

    const scopes = JSON.parse(row.scopes || '[]');
    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
    }

    db.prepare('UPDATE developer_api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    req.platformKey = { id: row.id, userId: row.user_id, appId: row.app_id || null, name: row.name, keyPrefix: row.key_prefix, scopes };
    next();
  };
}

// ─── Health ───
function getRuntimeReadiness() {
  const database = getDatabaseReadiness();
  const missingOauthSecrets = OAUTH_CLIENT_SECRET_NAMES.filter((name) => !process.env[name]);
  const requiredOperationalSecretsReady = !IS_PRODUCTION || (
    Boolean(process.env.SPMT_ADMIN_RECOVERY_KEY) && missingOauthSecrets.length === 0
  );
  const requiredReady = database.status === 'ready'
    && Boolean(JWT_SECRET)
    && requiredOperationalSecretsReady;
  const degradedReasons = [
    ...(missingOauthSecrets.length ? ['oauth_client_rotation_required'] : []),
    ...(!process.env.SPMT_ADMIN_RECOVERY_KEY ? ['owner_recovery_unconfigured'] : []),
  ];
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE password_hash != ?').get('SYSTEM_NO_LOGIN') as any;

  return {
    status: requiredReady ? (degradedReasons.length ? 'degraded' : 'ready') : 'not_ready',
    app: 'spmt-live',
    version: APP_VERSION,
    buildSha: BUILD_SHA,
    uptime: process.uptime(),
    checkedAt: new Date().toISOString(),
    users: userCount?.count || 0,
    database,
    configuration: {
      jwtSecret: JWT_SECRET ? 'configured' : 'missing',
      ownerRecovery: process.env.SPMT_ADMIN_RECOVERY_KEY ? 'configured' : 'unavailable',
      oauthClientSecrets: {
        status: missingOauthSecrets.length ? 'rotation_required' : 'configured',
        configured: OAUTH_CLIENT_SECRET_NAMES.length - missingOauthSecrets.length,
        total: OAUTH_CLIENT_SECRET_NAMES.length,
      },
    },
    dependencies: {
      discordIdentityLookup: process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID ? 'configured' : 'unavailable',
      twitchIdentityLookup: process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN ? 'configured' : 'unavailable',
      discordStreamHubPoints: process.env.DSH_BOT_KEY ? 'configured' : 'unavailable',
    },
    degradedReasons,
  };
}

app.get('/api/health/live', (req, res) => {
  res.json({
    status: 'alive',
    app: 'spmt-live',
    version: APP_VERSION,
    buildSha: BUILD_SHA,
    uptime: process.uptime(),
    checkedAt: new Date().toISOString(),
  });
});

function sendReadiness(res: express.Response) {
  const readiness = getRuntimeReadiness();
  res.status(readiness.status === 'not_ready' ? 503 : 200).json(readiness);
}

app.get('/api/health/ready', (req, res) => {
  sendReadiness(res);
});

app.get('/api/health', (req, res) => {
  sendReadiness(res);
});

app.get('/api/system/health', (req, res) => {
  const scalar = (sql: string) => (db.prepare(sql).get() as any)?.count || 0;
  res.json({
    status: 'ok',
    app: 'spmt-live',
    phase: 'identity-core',
    uptime: process.uptime(),
    checkedAt: new Date().toISOString(),
    database: {
      users: scalar("SELECT COUNT(*) as count FROM users WHERE password_hash != 'SYSTEM_NO_LOGIN'"),
      systemUsers: scalar("SELECT COUNT(*) as count FROM users WHERE password_hash = 'SYSTEM_NO_LOGIN'"),
      oauthClients: scalar('SELECT COUNT(*) as count FROM oauth_clients'),
      activeOauthCodes: scalar('SELECT COUNT(*) as count FROM oauth_codes WHERE datetime(expires_at) > datetime(\'now\')'),
      messages: scalar('SELECT COUNT(*) as count FROM messages'),
      forumThreads: scalar('SELECT COUNT(*) as count FROM forum_threads'),
      appInstalls: scalar('SELECT COUNT(*) as count FROM app_installs'),
      conversations: scalar('SELECT COUNT(*) as count FROM conversations'),
      notifications: scalar('SELECT COUNT(*) as count FROM notifications'),
    },
    endpoints: {
      me: '/api/me',
      apps: '/api/apps',
      refresh: '/api/auth/refresh',
      linkedAccounts: '/api/linked-accounts',
      conversations: '/api/conversations',
      notifications: '/api/notifications',
      messages: '/api/messages',
      search: '/api/search',
      aiConversations: '/api/ai/conversations',
      athena: '/api/athena/os',
      platform: '/api/platform',
      voiceMessages: '/api/voice-messages',
      oauthAuthorize: '/api/oauth/authorize',
      oauthToken: '/api/oauth/token',
    },
  });
});

app.get('/api/athena/os', (req, res) => {
  res.json({
    name: 'Athena OS',
    status: 'degraded',
    summary: 'Memory and catalog surfaces exist. Durable command dispatch, voice control, automation adapters, and a live agent crew are not available yet.',
    capabilities: ATHENA_CAPABILITIES,
    crew: ATHENA_CREW,
    skills: ATHENA_SKILLS,
    automations: AUTOMATION_RECIPES,
    apps: buildAppsForUser(),
  });
});

app.get('/api/athena/context', authenticate, (req: any, res) => {
  const memory = db.prepare(`
    SELECT id, scope, topic, content, source_app, created_at, updated_at
    FROM athena_memory
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC
    LIMIT 25
  `).all(req.user.id);

  res.json({
    user: req.user,
    apps: buildAppsForUser(req.user.id),
    crew: ATHENA_CREW,
    skills: ATHENA_SKILLS,
    automations: AUTOMATION_RECIPES,
    memory,
  });
});

app.get('/api/athena/memory', authenticate, (req: any, res) => {
  const rows = db.prepare(`
    SELECT id, scope, topic, content, source_app, created_at, updated_at
    FROM athena_memory
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC
    LIMIT 100
  `).all(req.user.id);
  res.json({ memory: rows });
});

app.post('/api/athena/memory', authenticate, (req: any, res) => {
  const topic = String(req.body?.topic || '').trim();
  const content = String(req.body?.content || '').trim();
  if (!topic || !content) return res.status(400).json({ error: 'topic and content are required' });

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO athena_memory (id, user_id, scope, topic, content, source_app, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, req.body?.scope || 'user', topic, content, req.body?.sourceApp || 'spmt', now, now);
  res.status(201).json({ id, topic, content, createdAt: now });
});

app.get('/api/athena/skills', (req, res) => {
  res.json({ skills: ATHENA_SKILLS, marketplace: ATHENA_SKILLS.map((skill) => ({ ...skill, installable: false })) });
});

app.get('/api/athena/crew', (req, res) => {
  res.json({ crew: ATHENA_CREW });
});

app.get('/api/athena/automations', (req, res) => {
  res.json({ automations: AUTOMATION_RECIPES });
});

app.post('/api/athena/commands', authenticate, (req: any, res) => {
  const command = String(req.body?.command || '').trim();
  if (!command) return res.status(400).json({ error: 'command is required' });

  res.status(501).json({
    accepted: false,
    routed: false,
    status: 'unavailable',
    command,
    error: 'Athena command dispatch is not implemented. No app action or durable job was created.',
  });
});

app.post('/api/athena/code-jobs', authenticateCodexGateway, async (req: any, res) => {
  try {
    await proxyCodexWorker(req, res, '/api/codex/jobs', 'POST');
  } catch (error) {
    console.error('Athena Codex worker create failed:', error);
    res.status(502).json({ error: 'Athena Codex worker is unavailable' });
  }
});

app.get('/api/athena/code-jobs/:id', authenticateCodexGateway, async (req: any, res) => {
  try {
    await proxyCodexWorker(req, res, `/api/codex/jobs/${encodeURIComponent(req.params.id)}`);
  } catch (error) {
    console.error('Athena Codex worker read failed:', error);
    res.status(502).json({ error: 'Athena Codex worker is unavailable' });
  }
});

app.post('/api/athena/code-jobs/:id/publish', authenticateCodexGateway, async (req: any, res) => {
  try {
    await proxyCodexWorker(req, res, `/api/codex/jobs/${encodeURIComponent(req.params.id)}/publish`, 'POST');
  } catch (error) {
    console.error('Athena Codex publish failed:', error);
    res.status(502).json({ error: 'Athena Codex worker is unavailable' });
  }
});

app.get('/api/athena/code-jobs/:id/:artifact', authenticateCodexGateway, async (req: any, res) => {
  const artifact = String(req.params.artifact || '');
  if (!['diff', 'checks', 'response'].includes(artifact)) return res.status(404).json({ error: 'Unknown artifact' });
  try {
    await proxyCodexWorker(req, res, `/api/codex/jobs/${encodeURIComponent(req.params.id)}/${artifact}`);
  } catch (error) {
    console.error('Athena Codex artifact read failed:', error);
    res.status(502).json({ error: 'Athena Codex worker is unavailable' });
  }
});

app.get('/api/athena/code-references', authenticateCodexGateway, async (req: any, res) => {
  try {
    await proxyCodexWorker(req, res, '/api/codex/references');
  } catch (error) {
    console.error('Athena Codex references read failed:', error);
    res.status(502).json({ error: 'Athena Codex worker is unavailable' });
  }
});

app.get('/api/platform', (req, res) => {
  res.json({
    name: 'SpaceMountain Platform',
    status: 'open',
    features: PLATFORM_FEATURES,
    endpoints: {
      sdk: '/api/platform/sdk',
      docs: '/api/platform/docs',
      events: '/api/platform/events',
      submitApp: '/api/platform/apps',
      apiKeys: '/api/platform/api-keys',
      webhooks: '/api/platform/webhooks',
      oauthClients: '/api/oauth/authorize',
      surfaces: '/api/platform/surfaces',
      components: '/api/platform/components',
      mcp: '/api/mcp',
    },
  });
});

app.get('/api/platform/sdk', (req, res) => {
  res.json({
    package: '@spmt/sdk',
    version: '0.3.0',
    npmPublished: false,
    install: 'npm install https://spmt.live/sdk/spmt-sdk.tgz',
    quickInstall: 'npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt install',
    download: 'https://spmt.live/sdk/spmt-sdk.tgz',
    starterZip: 'https://spmt.live/sdk/atherrea-spmt-starter.zip',
    example: "const spmt = new SpaceMountainClient({ apiKey: process.env.SPMT_API_KEY, appId: 'atherrea' }); await spmt.experience.award(mappedXpAwardV1({ userId, mappedEventType: 'dsh.discord.message', upstreamEventId }));",
    modules: ['identity', 'apps', 'developer', 'surfaces', 'events', 'game', 'experience', 'workspace', 'sharedChat', 'commlink', 'athena', 'webhooks'],
  });
});

app.get('/api/platform/docs', (req, res) => {
  res.json({
    sections: [
      { id: 'auth', title: 'OAuth Apps', path: '/docs/oauth', summary: 'Use SPMT OAuth to let ecosystem apps share identity without duplicate accounts.', endpoints: ['/api/oauth/authorize', '/api/oauth/token', '/api/oauth/userinfo'] },
      { id: 'apps', title: 'App Registry', path: '/docs/apps', summary: 'Read, install, disable, launch, and version registered apps.', endpoints: ['/api/apps', '/api/apps/:appId', '/api/apps/:appId/versions'] },
      { id: 'commlink', title: 'Commlink API', path: '/docs/commlink', summary: 'Send messages, create conversations, post voice metadata, and search communication records.', endpoints: ['/api/messages', '/api/conversations', '/api/voice-messages', '/api/search'] },
      { id: 'athena', title: 'Athena OS', path: '/docs/athena', summary: 'Inspect capability status, store memory, and view planned skills. Command dispatch reports unavailable until durable jobs and adapters exist.', endpoints: ['/api/athena/os', '/api/athena/context', '/api/athena/commands', '/api/athena/memory'] },
      { id: 'events', title: 'Event Bus', path: '/docs/events', summary: 'Publish typed ecosystem events for Commlink, Athena, plugins, analytics, and webhooks.', endpoints: ['/api/events', '/api/platform/events'] },
      { id: 'webhooks', title: 'Webhooks', path: '/docs/webhooks', summary: 'Register HTTPS endpoints for platform events.', endpoints: ['/api/platform/webhooks'] },
    ],
    scopes: PLATFORM_SCOPES,
    quickStart: [
      'Create an SPMT account.',
      'Generate a platform API key with the minimum scopes needed.',
      'Call scope-protected endpoints with Authorization: Bearer <token>.',
      'Register webhooks or submit apps through the developer portal.',
    ],
  });
});

function serializeDeveloperComponent(row: any) {
  return {
    id: `${row.app_id}:${row.component_id}`,
    appId: row.app_id,
    componentId: row.component_id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    launchUrl: row.launch_url,
    icon: row.icon || 'blocks',
    modes: parseStringArray(row.modes),
    permissions: parseStringArray(row.permissions),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listDeveloperComponents(includeInactive = false) {
  const rows = db.prepare(`
    SELECT * FROM developer_components
    ${includeInactive ? '' : 'WHERE active = 1'}
    ORDER BY app_id ASC, name ASC
  `).all() as any[];
  return rows.map(serializeDeveloperComponent);
}

function validateComponentInput(input: any, appId: string) {
  const componentId = String(input?.componentId || input?.component_id || '').trim().toLowerCase();
  const name = compactText(input?.name, 80);
  const description = compactText(input?.description, 300);
  const kind = String(input?.kind || 'panel').trim().toLowerCase();
  const launchUrl = String(input?.launchUrl || input?.launch_url || '').trim();
  const icon = compactText(input?.icon || 'blocks', 60);
  const modes = Array.from(new Set((Array.isArray(input?.modes) ? input.modes : ['panel'])
    .map((mode: unknown) => String(mode).trim().toLowerCase())
    .filter((mode: string) => (SHARED_SURFACE_MODES as readonly string[]).includes(mode))));
  const permissions = normalizeScopes(input?.permissions || []);
  if (!appId || !/^[a-z0-9][a-z0-9-]{1,49}$/.test(appId)) throw Object.assign(new Error('An app-bound SPMT key is required'), { statusCode: 403 });
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(componentId)) throw Object.assign(new Error('componentId must be a lowercase slug'), { statusCode: 400 });
  if (!name || !description) throw Object.assign(new Error('name and description are required'), { statusCode: 400 });
  if (!['card', 'panel', 'dock', 'overlay', 'action', 'settings'].includes(kind)) throw Object.assign(new Error('kind must be card, panel, dock, overlay, action, or settings'), { statusCode: 400 });
  if (!modes.length) throw Object.assign(new Error('At least one supported surface mode is required'), { statusCode: 400 });
  let parsedUrl: URL;
  try { parsedUrl = new URL(launchUrl); } catch { throw Object.assign(new Error('launchUrl must be a valid HTTPS URL'), { statusCode: 400 }); }
  if (parsedUrl.protocol !== 'https:') throw Object.assign(new Error('launchUrl must use HTTPS'), { statusCode: 400 });
  for (const key of parsedUrl.searchParams.keys()) {
    if (/^(?:access_?token|api_?key|auth|authorization|key|password|secret|session|token)$/i.test(key)) {
      throw Object.assign(new Error(`launchUrl cannot contain the sensitive ${key} query parameter`), { statusCode: 400 });
    }
  }
  return { appId, componentId, name, description, kind, launchUrl: parsedUrl.toString(), icon, modes, permissions };
}

function upsertDeveloperComponent(userId: string, appId: string, input: any) {
  const component = validateComponentInput(input, appId);
  const now = new Date().toISOString();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO developer_components (
      id, user_id, app_id, component_id, name, description, kind, launch_url,
      icon, modes, permissions, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(app_id, component_id) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      description = excluded.description,
      kind = excluded.kind,
      launch_url = excluded.launch_url,
      icon = excluded.icon,
      modes = excluded.modes,
      permissions = excluded.permissions,
      active = 1,
      updated_at = excluded.updated_at
  `).run(
    id, userId, component.appId, component.componentId, component.name, component.description,
    component.kind, component.launchUrl, component.icon, JSON.stringify(component.modes),
    JSON.stringify(component.permissions), now, now,
  );
  const row = db.prepare('SELECT * FROM developer_components WHERE app_id = ? AND component_id = ?')
    .get(component.appId, component.componentId);
  return serializeDeveloperComponent(row);
}

app.get('/api/platform/surfaces', (_req, res) => {
  res.json({
    version: 'shared-surfaces.v1',
    auth: {
      user: 'SPMT session cookie or Authorization: Bearer <SPMT token>',
      externalApp: 'SPMT app-bound API key',
      embed: 'POST /api/embed/launch for a short-lived one-time exchange code',
      tokenInUrl: false,
    },
    modes: SHARED_SURFACE_MODES,
    surfaces: SHARED_SURFACES,
    componentsEndpoint: '/api/platform/components',
  });
});

app.get('/api/platform/components', (_req, res) => {
  res.json({ version: 'shared-components.v1', components: listDeveloperComponents() });
});

app.post('/api/platform/components', authenticatePlatformKey('apps:write'), (req: any, res) => {
  try {
    const component = upsertDeveloperComponent(req.platformKey.userId, req.platformKey.appId, req.body);
    res.status(201).json({ component });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Invalid component manifest' });
  }
});

app.get('/api/platform/mcp', (_req, res) => {
  res.json({
    name: 'spmt-platform',
    transport: 'streamable-http-json-rpc',
    endpoint: '/api/mcp',
    authentication: 'Bearer SPMT app-bound API key for write tools',
    tools: ['spmt.surfaces.list', 'spmt.components.list', 'spmt.components.register'],
  });
});

app.post('/api/mcp', async (req: any, res) => {
  const id = req.body?.id ?? null;
  const method = String(req.body?.method || '');
  const ok = (result: any) => res.json({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string, data?: unknown) => res.json({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } });
  if (method === 'initialize') return ok({ protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'spmt-platform', version: APP_VERSION } });
  if (method === 'notifications/initialized') return res.status(202).end();
  if (method === 'tools/list') return ok({ tools: [
    { name: 'spmt.surfaces.list', description: 'List canonical SPMT shared surfaces and supported embed modes.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'spmt.components.list', description: 'List active app-provided components.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'spmt.components.register', description: 'Register or update a component using an app-bound SPMT key.', inputSchema: { type: 'object', required: ['componentId', 'name', 'description', 'kind', 'launchUrl'], properties: { componentId: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, kind: { enum: ['card', 'panel', 'dock', 'overlay', 'action', 'settings'] }, launchUrl: { type: 'string', format: 'uri' }, icon: { type: 'string' }, modes: { type: 'array', items: { enum: SHARED_SURFACE_MODES } }, permissions: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } },
  ] });
  if (method !== 'tools/call') return fail(-32601, 'Method not found');
  const name = String(req.body?.params?.name || '');
  const args = req.body?.params?.arguments || {};
  const toolResult = (value: unknown) => ok({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value });
  if (name === 'spmt.surfaces.list') return toolResult({ version: 'shared-surfaces.v1', surfaces: SHARED_SURFACES });
  if (name === 'spmt.components.list') return toolResult({ version: 'shared-components.v1', components: listDeveloperComponents() });
  if (name !== 'spmt.components.register') return fail(-32602, 'Unknown tool');

  const token = String(req.headers.authorization?.replace('Bearer ', '') || '').trim();
  if (!token) return fail(-32001, 'SPMT app-bound API key required');
  const key = db.prepare(`
    SELECT id, user_id, app_id, scopes FROM developer_api_keys
    WHERE key_hash = ? AND revoked_at IS NULL
  `).get(hashSecret(token)) as any;
  const scopes = parseStringArray(key?.scopes);
  if (!key || !key.app_id || !scopes.includes('apps:write')) return fail(-32003, 'An app-bound key with apps:write is required');
  try {
    db.prepare('UPDATE developer_api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), key.id);
    return toolResult({ component: upsertDeveloperComponent(key.user_id, key.app_id, args) });
  } catch (error: any) {
    return fail(-32602, error.message || 'Invalid component manifest');
  }
});

app.get('/api/platform/api-keys', authenticate, (req: any, res) => {
  const keys = db.prepare(`
    SELECT id, app_id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
    FROM developer_api_keys
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(req.user.id) as any[];
  res.json({ keys: keys.map((row) => ({
    id: row.id,
    appId: row.app_id || null,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: parseStringArray(row.scopes),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  })) });
});

app.post('/api/platform/api-keys', authenticate, (req: any, res) => {
  const name = String(req.body?.name || 'Default platform key').trim();
  const appId = String(req.body?.appId || req.body?.app_id || '').trim().toLowerCase() || null;
  const scopes = normalizeScopes(req.body?.scopes);
  if (appId && !/^[a-z0-9][a-z0-9-]{1,49}$/.test(appId)) {
    return res.status(400).json({ error: 'appId must be a lowercase slug using letters, numbers, or hyphens' });
  }
  if (!scopes.length) return res.status(400).json({ error: 'At least one valid scope is required' });
  const id = uuidv4();
  const token = `spmt_${uuidv4().replace(/-/g, '')}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO developer_api_keys (id, user_id, app_id, name, key_prefix, key_hash, scopes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, appId, name, token.slice(0, 12), hashSecret(token), JSON.stringify(scopes), now);
  res.status(201).json({ id, appId, name, token, scopes, createdAt: now });
});

app.post('/api/platform/api-keys/verify', (req, res) => {
  const token = String(req.body?.token || req.headers.authorization?.replace('Bearer ', '') || '').trim();
  if (!token) return res.status(400).json({ error: 'token required' });
  const row = db.prepare(`
    SELECT id, user_id, app_id, name, key_prefix, scopes
    FROM developer_api_keys
    WHERE key_hash = ? AND revoked_at IS NULL
  `).get(hashSecret(token)) as any;
  if (!row) return res.status(401).json({ valid: false });
  db.prepare('UPDATE developer_api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  res.json({ valid: true, key: { id: row.id, userId: row.user_id, appId: row.app_id || null, name: row.name, keyPrefix: row.key_prefix, scopes: JSON.parse(row.scopes || '[]') } });
});

app.get('/api/platform/me', authenticatePlatformKey('identity:read'), (req: any, res) => {
  const user = getUserById(req.platformKey.userId);
  res.json({ key: req.platformKey, user: user ? serializeUser(user) : null });
});

app.post('/api/platform/identity/grandfather', authenticatePlatformKey('identity:write'), (req: any, res) => {
  const sourceApp = String(req.platformKey.appId || '').trim().toLowerCase();
  if (!sourceApp) {
    return res.status(403).json({ error: 'Grandfathering requires an app-bound platform key' });
  }

  const provider = String(req.body?.provider || '').trim().toLowerCase();
  if (provider !== 'discord' && provider !== 'twitch') {
    return res.status(400).json({ error: 'provider must be discord or twitch' });
  }
  const providerUserId = String(req.body?.providerUserId || req.body?.provider_user_id || '').trim();
  if (!providerUserId || providerUserId.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(providerUserId)) {
    return res.status(400).json({ error: 'A valid immutable providerUserId is required' });
  }

  const idColumn = provider === 'discord' ? 'discord_id' : 'twitch_id';
  const usernameColumn = provider === 'discord' ? 'discord_username' : 'twitch_username';
  let user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE ${idColumn} = ? ORDER BY datetime(created_at) ASC LIMIT 1`).get(providerUserId) as any;
  let created = false;
  let linked = false;

  if (!user) {
    const providerUsername = cleanHandle(req.body?.providerUsername || req.body?.provider_username || req.body?.username).slice(0, 80) || null;
    const providerAvatarUrl = compactText(req.body?.avatarUrl || req.body?.avatar_url || req.body?.providerAvatarUrl || req.body?.provider_avatar_url, 2048) || null;
    const username = importedUsername(provider, providerUserId, req.body?.username || providerUsername);
    const displayName = compactText(req.body?.displayName || req.body?.display_name || providerUsername || username, 120) || username;
    const id = uuidv4();
    const email = `import-${provider}-${crypto.createHash('sha256').update(providerUserId).digest('hex').slice(0, 24)}@spmt.live`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, username, email, display_name, password_hash, ${usernameColumn}, ${idColumn}, avatar_url, created_at)
      VALUES (?, ?, ?, ?, 'SYSTEM_NO_LOGIN', ?, ?, ?, ?)
    `).run(id, username, email, displayName, providerUsername, providerUserId, providerAvatarUrl, now);
    user = getUserById(id);
    created = true;
  } else {
    const providerUsername = cleanHandle(req.body?.providerUsername || req.body?.provider_username).slice(0, 80);
    const displayName = compactText(req.body?.displayName || req.body?.display_name, 120);
    const providerAvatarUrl = compactText(req.body?.avatarUrl || req.body?.avatar_url || req.body?.providerAvatarUrl || req.body?.provider_avatar_url, 2048);
    if ((providerUsername && !user[usernameColumn]) || (displayName && user.password_hash === 'SYSTEM_NO_LOGIN') || (providerAvatarUrl && !user.avatar_url)) {
      const updates: string[] = [];
      const values: string[] = [];
      if (providerUsername && !user[usernameColumn]) {
        updates.push(`${usernameColumn} = ?`);
        values.push(providerUsername);
      }
      if (displayName && user.password_hash === 'SYSTEM_NO_LOGIN') {
        updates.push('display_name = ?');
        values.push(displayName);
      }
      if (providerAvatarUrl && !user.avatar_url) {
        updates.push('avatar_url = ?');
        values.push(providerAvatarUrl);
      }
      if (updates.length) {
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values, user.id);
        user = getUserById(user.id);
        linked = true;
      }
    }
  }

  const accessToken = req.body?.issueSession === true
    ? jwt.sign({ id: user.id, username: user.username, email: user.email, sourceApp, grandfathered: true }, JWT_SECRET, { expiresIn: '7d' })
    : undefined;

  res.status(created ? 201 : 200).json({
    created,
    linked,
    provider,
    providerUserId,
    sourceApp,
    user: serializeUser(user),
    ...(accessToken ? { accessToken, tokenType: 'Bearer', expiresIn: 7 * 24 * 3600 } : {}),
  });
});

app.post('/api/platform/identity/onboard', authenticatePlatformKey('identity:write'), (req: any, res) => {
  const sourceApp = String(req.platformKey.appId || '').trim().toLowerCase();
  if (!sourceApp) {
    return res.status(403).json({ error: 'Verified onboarding requires an app-bound platform key' });
  }

  const discord = req.body?.discord || {};
  const twitch = req.body?.twitch || {};
  const discordId = String(discord.providerUserId || discord.id || '').trim();
  const twitchId = String(twitch.providerUserId || twitch.id || '').trim();
  if (!discordId || !twitchId || !/^[A-Za-z0-9:_-]{1,128}$/.test(discordId) || !/^[A-Za-z0-9:_-]{1,128}$/.test(twitchId)) {
    return res.status(400).json({ error: 'Verified Discord and Twitch provider IDs are required' });
  }

  try {
    const result = db.transaction(() => {
      const discordUser = findSingleProviderIdentity('discord_id', discordId);
      const twitchUser = findSingleProviderIdentity('twitch_id', twitchId);
      let reconciled = false;
      let reconciledXpRows = 0;
      if (discordUser && twitchUser && discordUser.id !== twitchUser.id) {
        const reconciliation = reconcileVerifiedProviderSplit(db, discordUser, twitchUser);
        if (!reconciliation.merged) {
          throw Object.assign(new Error('Discord and Twitch are already attached to different SPMT identities. Crew review is required.'), {
            statusCode: 409,
            code: 'identity_conflict',
          });
        }
        reconciled = true;
        reconciledXpRows = reconciliation.xpRowsMoved;
      }

      const discordUsername = cleanHandle(discord.username || discord.providerUsername).slice(0, 80) || null;
      const twitchUsername = cleanHandle(twitch.username || twitch.providerUsername).slice(0, 80) || null;
      const displayName = compactText(discord.displayName || twitch.displayName || discordUsername || twitchUsername, 120);
      const avatarUrl = compactText(discord.avatarUrl || twitch.avatarUrl, 2048) || null;
      let user = reconciled && discordUser ? getUserById(discordUser.id) : discordUser || twitchUser;
      let created = false;

      if (!user) {
        const username = importedUsername('discord', discordId, discordUsername || twitchUsername);
        const id = uuidv4();
        const email = `import-discord-${crypto.createHash('sha256').update(discordId).digest('hex').slice(0, 24)}@spmt.live`;
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO users (
            id, username, email, display_name, password_hash,
            discord_username, discord_id, twitch_username, twitch_id, avatar_url, created_at
          ) VALUES (?, ?, ?, ?, 'SYSTEM_NO_LOGIN', ?, ?, ?, ?, ?, ?)
        `).run(id, username, email, displayName || username, discordUsername, discordId, twitchUsername, twitchId, avatarUrl, now);
        user = getUserById(id);
        created = true;
      } else {
        if (user.discord_id && String(user.discord_id) !== discordId) {
          throw Object.assign(new Error('This SPMT identity is already linked to another Discord account.'), { statusCode: 409, code: 'identity_conflict' });
        }
        if (user.twitch_id && String(user.twitch_id) !== twitchId) {
          throw Object.assign(new Error('This SPMT identity is already linked to another Twitch account.'), { statusCode: 409, code: 'identity_conflict' });
        }
        db.prepare(`
          UPDATE users
          SET discord_username = ?, discord_id = ?, twitch_username = ?, twitch_id = ?,
              avatar_url = COALESCE(?, avatar_url),
              display_name = CASE WHEN password_hash = 'SYSTEM_NO_LOGIN' AND ? != '' THEN ? ELSE display_name END
          WHERE id = ?
        `).run(discordUsername, discordId, twitchUsername, twitchId, avatarUrl, displayName, displayName, user.id);
        user = getUserById(user.id);
      }

      return {
        user,
        created,
        reconciled,
        reconciledXpRows,
        purpose: (user.password_hash === 'SYSTEM_NO_LOGIN' ? 'claim' : 'recover') as 'claim' | 'recover',
      };
    })();

    const issued = issueProviderIdentityTicket(result.user.id, result.purpose, sourceApp);
    const continueUrl = new URL('/api/auth/provider-claim', providerClaimOrigin(req));
    continueUrl.searchParams.set('ticket', issued.ticket);
    res.status(result.created ? 201 : 200).json({
      created: result.created,
      reconciled: result.reconciled,
      reconciledXpRows: result.reconciledXpRows,
      purpose: result.purpose,
      expiresAt: issued.expiresAt,
      continueUrl: continueUrl.toString(),
      user: serializeUser(result.user),
    });
  } catch (error: any) {
    const status = Number(error?.statusCode || 500);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: status >= 500 ? 'Verified identity onboarding is temporarily unavailable' : error.message,
      code: error?.code || (status === 409 ? 'identity_conflict' : 'onboarding_failed'),
    });
  }
});

app.get('/api/platform/apps/public', authenticatePlatformKey('apps:read'), (req: any, res) => {
  res.json({ key: req.platformKey, apps: buildAppsForUser(req.platformKey.userId) });
});

app.post('/api/platform/apps/submit', authenticatePlatformKey('apps:write'), (req: any, res) => {
  const requestedAppId = String(req.body?.appId || req.body?.app_id || '').trim().toLowerCase();
  if (req.platformKey.appId && requestedAppId !== req.platformKey.appId) {
    return res.status(403).json({ error: `This key is limited to appId ${req.platformKey.appId}` });
  }
  try {
    const submission = submitAppForUser(req.platformKey.userId, req.body);
    res.status(201).json({ submission });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Invalid app submission' });
  }
});

app.get('/api/platform/apps/submissions', authenticatePlatformKey('apps:read'), (req: any, res) => {
  res.json({ submissions: listAppSubmissions(req.platformKey.userId) });
});

app.post('/api/platform/events', authenticatePlatformKey('events:write'), (req: any, res) => {
  const requestedSourceApp = String(req.body?.sourceApp || req.body?.source_app || '').trim().toLowerCase();
  if (req.platformKey.appId && requestedSourceApp && requestedSourceApp !== req.platformKey.appId) {
    return res.status(403).json({ error: `This key may only publish events for ${req.platformKey.appId}` });
  }
  try {
    const event = createPlatformEvent({
      ...req.body,
      sourceApp: req.platformKey.appId || requestedSourceApp,
    }, req.platformKey.userId);
    res.status(201).json({ event });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Invalid event payload' });
  }
});

app.get('/api/platform/events', authenticatePlatformKey('events:write'), (req: any, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const events = db.prepare(`
    SELECT id, type, version, timestamp, source_app, actor_user_id, actor_username,
      actor_display_name, visibility, payload, links, created_by, created_at
    FROM platform_events
    WHERE created_by = ? AND (? IS NULL OR source_app = ?)
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(req.platformKey.userId, req.platformKey.appId, req.platformKey.appId, limit) as any[];
  res.json({
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      version: event.version,
      timestamp: event.timestamp,
      sourceApp: event.source_app,
      actor: {
        userId: event.actor_user_id,
        username: event.actor_username,
        displayName: event.actor_display_name,
      },
      visibility: event.visibility,
      payload: JSON.parse(event.payload || '{}'),
      links: event.links ? JSON.parse(event.links) : null,
      createdBy: event.created_by,
      createdAt: event.created_at,
    })),
  });
});

app.post('/api/platform/api-keys/:id/revoke', authenticate, (req: any, res) => {
  const revokedAt = new Date().toISOString();
  const result = db.prepare('UPDATE developer_api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND user_id = ?')
    .run(revokedAt, req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'API key not found' });
  res.json({ ok: true, revokedAt });
});

app.get('/api/platform/webhooks', authenticate, (req: any, res) => {
  const webhooks = db.prepare(`
    SELECT id, url, events, active, created_at
    FROM developer_webhooks
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(req.user.id);
  res.json({ webhooks });
});

app.post('/api/platform/webhooks', authenticate, (req: any, res) => {
  const url = String(req.body?.url || '').trim();
  if (!/^https:\/\//i.test(url)) return res.status(400).json({ error: 'https webhook url required' });
  const events = Array.isArray(req.body?.events) ? req.body.events : ['app.installed', 'message.created'];
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO developer_webhooks (id, user_id, url, events, active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(id, req.user.id, url, JSON.stringify(events), now);
  res.status(201).json({ id, url, events, active: true, createdAt: now });
});

app.post('/api/platform/apps', authenticate, (req: any, res) => {
  try {
    const submission = submitAppForUser(req.user.id, req.body);
    res.status(201).json({ submission });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Invalid app submission' });
  }
});

app.get('/api/platform/apps', authenticate, (req: any, res) => {
  res.json({ submissions: listAppSubmissions(req.user.id) });
});

app.delete('/api/platform/apps/:submissionId', authenticate, (req: any, res) => {
  const row = db.prepare('SELECT * FROM app_submissions WHERE id = ? AND user_id = ?')
    .get(req.params.submissionId, req.user.id) as any;
  if (!row) return res.status(404).json({ error: 'App submission not found' });

  db.prepare('DELETE FROM app_submissions WHERE id = ? AND user_id = ?')
    .run(row.id, req.user.id);
  res.json({ ok: true, submission: serializeAppSubmission(row) });
});

app.get('/api/platform/apps/review', authenticate, requirePlatformAdmin, (req: any, res) => {
  const rows = db.prepare(`
    SELECT s.*, u.username AS submitter_username, u.display_name AS submitter_display_name
    FROM app_submissions s
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'review'
    ORDER BY datetime(COALESCE(s.updated_at, s.created_at)) ASC
  `).all() as any[];
  res.json({
    submissions: rows.map((row) => ({
      ...serializeAppSubmission(row),
      submitter: {
        username: row.submitter_username,
        displayName: row.submitter_display_name,
      },
    })),
  });
});

app.post('/api/platform/apps/:submissionId/review', authenticate, requirePlatformAdmin, (req: any, res) => {
  const status = String(req.body?.status || '').trim().toLowerCase();
  const reviewNotes = compactText(req.body?.reviewNotes || req.body?.notes || '', 600) || null;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  const row = db.prepare('SELECT * FROM app_submissions WHERE id = ?').get(req.params.submissionId) as any;
  if (!row) return res.status(404).json({ error: 'App submission not found' });
  if (status === 'approved') {
    const conflict = db.prepare("SELECT id FROM app_submissions WHERE status = 'approved' AND app_id = ? AND id != ?")
      .get(row.app_id, row.id);
    if (conflict) return res.status(409).json({ error: 'Another approved app already uses this appId' });
  }

  const reviewedAt = new Date().toISOString();
  db.prepare('UPDATE app_submissions SET status = ?, review_notes = ?, reviewed_at = ?, updated_at = ? WHERE id = ?')
    .run(statu…17073 tokens truncated…
  try {
    const appId = validateRecordSlug(req.params.appId, 'appId');
    const namespace = validateRecordSlug(req.params.namespace, 'namespace');
    const data = req.body?.data ?? req.body;
    assertPublicAppState(data);
    const current = db.prepare('SELECT revision, created_at FROM app_state_records WHERE user_id = ? AND app_id = ? AND namespace = ?')
      .get(req.user.id, appId, namespace) as any;
    const expected = Number(req.headers['if-match']?.match(/(\d+)"?$/)?.[1] || req.body?.revision || 0);
    if (current && (!expected || expected !== current.revision)) {
      res.setHeader('ETag', appStateEtag(appId, namespace, current.revision));
      return res.status(409).json({ error: 'App state changed on another device', revision: current.revision });
    }
    const now = new Date().toISOString();
    const revision = current ? current.revision + 1 : 1;
    const schemaVersion = Math.max(1, Number(req.body?.schemaVersion || 1));
    db.prepare(`
      INSERT INTO app_state_records (user_id, app_id, namespace, schema_version, revision, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, app_id, namespace) DO UPDATE SET
        schema_version = excluded.schema_version, revision = excluded.revision,
        data_json = excluded.data_json, updated_at = excluded.updated_at
    `).run(req.user.id, appId, namespace, schemaVersion, revision, JSON.stringify(data), current?.created_at || now, now);
    res.setHeader('ETag', appStateEtag(appId, namespace, revision));
    res.json({ appId, namespace, schemaVersion, revision, data, createdAt: current?.created_at || now, updatedAt: now });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'App state could not be saved' });
  }
});

const DISCOVERY_DEFINITIONS = {
  'battle-arena': {
    title: 'The Hidden Battle Arena',
    sourceApp: 'spacemountain-live',
  },
  'cosmo-black-hole': {
    title: 'The Cosmo Black Hole',
    sourceApp: 'cosmo-commlink',
  },
  'commlink-constellation': {
    title: 'The Commlink Constellation',
    sourceApp: 'cosmo-commlink',
  },
} as const;

const DISCOVERY_REWARD = {
  title: 'Lord Puzzler',
  chatbotPersonality: {
    id: 'count-puzzle',
    name: 'Count Puzzle',
    basePersonality: 'A mysterious gothic puzzle-smith and useful stowaway who speaks in riddles, rhymes, and cosmic metaphors. Direct answers are dreadfully dull, but every riddle must remain ultimately helpful.',
    tone: 'Theatrical, cryptic, slightly paranoid',
    responseStyle: 'Riddle-forward, gothic, playful, and helpful',
  },
};

function recordUserDiscovery(
  userId: string,
  discoveryId: keyof typeof DISCOVERY_DEFINITIONS,
  metadata: Record<string, unknown> = {},
) {
  const definition = DISCOVERY_DEFINITIONS[discoveryId];
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT OR IGNORE INTO user_discoveries (
      user_id, discovery_id, source_app, metadata_json, discovered_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(userId, discoveryId, definition.sourceApp, JSON.stringify(metadata), now);
  return { created: result.changes > 0, discoveredAt: now };
}

function syncBattleArenaDiscovery(userId: string) {
  const arenaState = db.prepare(`
    SELECT 1
    FROM app_state_records
    WHERE user_id = ? AND app_id = 'spacemountain-live' AND namespace = 'arena'
    LIMIT 1
  `).get(userId);
  if (arenaState) {
    return recordUserDiscovery(userId, 'battle-arena', { evidence: 'account-arena-state' });
  }
  return { created: false, discoveredAt: null };
}

function userDiscoveryStatus(userId: string) {
  const rows = db.prepare(`
    SELECT discovery_id, source_app, discovered_at
    FROM user_discoveries
    WHERE user_id = ?
    ORDER BY datetime(discovered_at), discovery_id
  `).all(userId) as Array<{ discovery_id: string; source_app: string; discovered_at: string }>;
  const discoveredById = new Map(rows.map((row) => [row.discovery_id, row]));
  const discoveries = Object.entries(DISCOVERY_DEFINITIONS).map(([id, definition]) => {
    const row = discoveredById.get(id);
    return row
      ? { id, title: definition.title, sourceApp: row.source_app, discovered: true, discoveredAt: row.discovered_at }
      : { id: null, title: 'Undiscovered signal', sourceApp: null, discovered: false, discoveredAt: null };
  });
  const discoveredCount = discoveries.filter((item) => item.discovered).length;
  const complete = discoveredCount === Object.keys(DISCOVERY_DEFINITIONS).length;
  return {
    schemaVersion: 1,
    discoveredCount,
    total: Object.keys(DISCOVERY_DEFINITIONS).length,
    complete,
    discoveries,
    reward: complete ? DISCOVERY_REWARD : null,
  };
}

function notifyDiscoveryReward(userId: string, status: ReturnType<typeof userDiscoveryStatus>) {
  if (!status.complete) return;
  createNotification(
    userId,
    `${DISCOVERY_REWARD.title} unlocked`,
    `${DISCOVERY_REWARD.chatbotPersonality.name} has appeared in your Commlink collection.`,
    { type: 'achievement', sourceApp: 'cosmo-commlink', linkUrl: '/commlink/' },
  );
}

app.get('/api/discoveries', authenticate, (req: any, res) => {
  const arenaSync = syncBattleArenaDiscovery(req.user.id);
  const status = userDiscoveryStatus(req.user.id);
  if (arenaSync.created) notifyDiscoveryReward(req.user.id, status);
  res.json(status);
});

app.post('/api/discoveries/:discoveryId', authenticate, (req: any, res) => {
  const discoveryId = String(req.params.discoveryId || '') as keyof typeof DISCOVERY_DEFINITIONS;
  if (!['cosmo-black-hole', 'commlink-constellation'].includes(discoveryId)) {
    return res.status(404).json({ error: 'Discovery not found' });
  }
  const arenaSync = syncBattleArenaDiscovery(req.user.id);
  const recorded = recordUserDiscovery(req.user.id, discoveryId, {
    surface: String(req.body?.surface || 'commlink').slice(0, 80),
    clientVersion: String(req.body?.clientVersion || 'unknown').slice(0, 80),
  });
  const status = userDiscoveryStatus(req.user.id);
  if (recorded.created || arenaSync.created) notifyDiscoveryReward(req.user.id, status);
  return res.status(recorded.created ? 201 : 200).json({ created: recorded.created, ...status });
});

type CommlinkFeedItem = {
  version: string;
  eventId: string;
  upstreamId: string;
  platform: string;
  sourceId: string;
  sourceName?: string | null;
  channelId: string;
  channelName?: string | null;
  type: string;
  sender: {
    id: string;
    login?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    badges: Array<{ id: string; label?: string; imageUrl?: string; meta?: Record<string, unknown> }>;
    roles: string[];
  };
  text: string;
  media: Array<Record<string, unknown>>;
  links: Array<Record<string, unknown>>;
  donation?: Record<string, unknown>;
  membership?: Record<string, unknown>;
  reward?: Record<string, unknown>;
  reply?: Record<string, unknown>;
  originalTimestamp: string;
  receivedTimestamp: string;
  meta: Record<string, unknown>;
  dedupeKey: string;
  routing: {
    mirrored: boolean;
    reflected: boolean;
    canReply: boolean;
    botReadable: boolean;
    botCanReply: boolean;
    tenantIsolationKey: string;
  };
};

function commlinkFeedText(value: unknown, max = 4_000) {
  return String(value || '').trim().slice(0, max);
}

function commlinkTimestamp(value: unknown) {
  const raw = commlinkFeedText(value, 80);
  const parsed = raw ? new Date(raw) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function commlinkTimestampMs(value: unknown) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStoredObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseStoredArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === 'object').slice(0, 30) as Array<Record<string, unknown>>
      : [];
  } catch {
    return [];
  }
}

function commlinkRouting(userId: string, canReply = false) {
  return {
    mirrored: false,
    reflected: false,
    canReply,
    botReadable: true,
    botCanReply: false,
    tenantIsolationKey: userId,
  };
}

function listSpmtCommlinkItems(userId: string, limit: number): CommlinkFeedItem[] {
  const messages = db.prepare(`
    SELECT m.id, m.conversation_id, m.subject, m.body, m.channel, m.message_type,
      m.metadata, m.attachments, m.created_at, m.from_id,
      from_user.username AS from_user, from_user.display_name AS from_name, from_user.avatar_url AS from_avatar
    FROM messages m
    JOIN users from_user ON from_user.id = m.from_id
    WHERE m.from_id = ? OR m.to_id = ?
    ORDER BY datetime(m.created_at) DESC
    LIMIT ?
  `).all(userId, userId, limit) as any[];
  const notifications = db.prepare(`
    SELECT id, type, title, body, source_app, link_url, read_at, created_at
    FROM notifications
    WHERE user_id = ? AND type NOT IN ('message', 'voice_message', 'event')
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(userId, limit) as any[];
  const events = db.prepare(`
    SELECT id, type, timestamp, source_app, actor_user_id, actor_username,
      actor_display_name, payload, links, created_at
    FROM platform_events
    WHERE created_by = ? OR visibility IN ('public', 'community', 'system')
    ORDER BY datetime(timestamp) DESC
    LIMIT ?
  `).all(userId, limit) as any[];

  const messageItems = messages.map((row): CommlinkFeedItem => {
    const timestamp = commlinkTimestamp(row.created_at);
    const metadata = parseStoredObject(row.metadata);
    return {
      version: 'commlink-feed.v1',
      eventId: `spmt-message:${row.id}`,
      upstreamId: row.id,
      platform: 'spmt',
      sourceId: 'spmt:messages',
      sourceName: 'SPMT Messages',
      channelId: row.conversation_id || row.channel || 'direct',
      channelName: row.channel || 'Direct message',
      type: row.message_type === 'voice' ? 'voice' : 'message',
      sender: {
        id: row.from_id,
        login: row.from_user,
        displayName: row.from_name || row.from_user,
        avatarUrl: row.from_avatar || null,
        badges: row.from_id === userId ? [{ id: 'you', label: 'You' }] : [],
        roles: row.from_id === userId ? ['owner'] : ['viewer'],
      },
      text: [row.subject, row.body].filter(Boolean).join(row.subject ? ': ' : ''),
      media: parseStoredArray(row.attachments),
      links: [],
      originalTimestamp: timestamp,
      receivedTimestamp: timestamp,
      meta: { ...metadata, spmtRecordType: 'message', outgoing: row.from_id === userId },
      dedupeKey: `spmt:message:${row.id}`,
      routing: commlinkRouting(userId, true),
    };
  });
  const notificationItems = notifications.map((row): CommlinkFeedItem => {
    const timestamp = commlinkTimestamp(row.created_at);
    return {
      version: 'commlink-feed.v1',
      eventId: `spmt-notification:${row.id}`,
      upstreamId: row.id,
      platform: 'spmt',
      sourceId: `spmt:${row.source_app || 'notifications'}`,
      sourceName: row.source_app || 'SPMT',
      channelId: 'notifications',
      channelName: 'Notifications',
      type: 'system',
      sender: {
        id: row.source_app || 'spmt',
        login: row.source_app || 'spmt',
        displayName: row.source_app || 'SPMT',
        badges: [{ id: row.type || 'notification', label: row.type || 'Notification' }],
        roles: ['bot'],
      },
      text: [row.title, row.body].filter(Boolean).join(': '),
      media: [],
      links: row.link_url ? [{ url: row.link_url, safe: true }] : [],
      originalTimestamp: timestamp,
      receivedTimestamp: timestamp,
      meta: { spmtRecordType: 'notification', read: Boolean(row.read_at) },
      dedupeKey: `spmt:notification:${row.id}`,
      routing: commlinkRouting(userId),
    };
  });
  const eventItems = events.map((row): CommlinkFeedItem => {
    const timestamp = commlinkTimestamp(row.timestamp || row.created_at);
    const payload = parseStoredObject(row.payload);
    const summary = commlinkFeedText(payload.summary || payload.title || payload.message || row.type.replace(/\./g, ' '));
    return {
      version: 'commlink-feed.v1',
      eventId: `spmt-event:${row.id}`,
      upstreamId: row.id,
      platform: 'spmt',
      sourceId: `spmt:${row.source_app}`,
      sourceName: row.source_app,
      channelId: row.type,
      channelName: row.type.replace(/\./g, ' '),
      type: 'system',
      sender: {
        id: row.actor_user_id || row.source_app,
        login: row.actor_username || row.source_app,
        displayName: row.actor_display_name || row.actor_username || row.source_app,
        badges: [{ id: 'app-event', label: 'App event' }],
        roles: ['bot'],
      },
      text: summary,
      media: [],
      links: parseStoredArray(row.links),
      originalTimestamp: timestamp,
      receivedTimestamp: commlinkTimestamp(row.created_at),
      meta: { ...payload, spmtRecordType: 'event', eventType: row.type },
      dedupeKey: `spmt:event:${row.id}`,
      routing: commlinkRouting(userId),
    };
  });
  return [...messageItems, ...notificationItems, ...eventItems];
}

function isCommlinkFeedItem(value: unknown): value is CommlinkFeedItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as any;
  return Boolean(
    typeof item.eventId === 'string'
    && typeof item.upstreamId === 'string'
    && typeof item.platform === 'string'
    && typeof item.channelId === 'string'
    && typeof item.text === 'string'
    && typeof item.originalTimestamp === 'string'
    && item.sender
    && typeof item.sender.displayName === 'string'
  );
}

function dedupeCommlinkFeedItems(items: CommlinkFeedItem[]) {
  const byKey = new Map<string, CommlinkFeedItem>();
  for (const item of items) {
    const rawProvider = item.platform === 'social-stream'
      ? commlinkFeedText(item.meta?.rawProvider, 40).toLowerCase()
      : item.platform;
    const platform = ['twitch', 'discord', 'kick', 'youtube', 'tiktok'].includes(rawProvider) ? rawProvider : item.platform;
    const key = item.dedupeKey || [platform, item.channelId, item.upstreamId, item.sender.id].join(':');
    const existing = byKey.get(key);
    if (!existing || commlinkTimestampMs(item.receivedTimestamp) >= commlinkTimestampMs(existing.receivedTimestamp)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (
    commlinkTimestampMs(a.originalTimestamp) - commlinkTimestampMs(b.originalTimestamp)
  ));
}

function enrichCommlinkFeedXp(items: CommlinkFeedItem[]) {
  const identityCache = new Map<string, any>();
  const xpCache = new Map<string, { xp: number; level: number }>();
  return items.map((item): CommlinkFeedItem => {
    const rawProvider = item.platform === 'social-stream'
      ? commlinkFeedText(item.meta?.rawProvider, 40).toLowerCase()
      : item.platform;
    const senderId = commlinkFeedText(item.sender?.id, 120);
    const senderLogin = commlinkFeedText(item.sender?.login || item.sender?.displayName, 160).replace(/^@/, '').toLowerCase();
    const cacheKey = `${rawProvider}:${senderId}:${senderLogin}`;
    let linked = identityCache.get(cacheKey);
    if (linked === undefined) {
      if (rawProvider === 'discord') {
        linked = senderId
          ? db.prepare('SELECT id FROM users WHERE discord_id = ? OR lower(discord_username) = ? LIMIT 1').get(senderId, senderLogin)
          : db.prepare('SELECT id FROM users WHERE lower(discord_username) = ? LIMIT 1').get(senderLogin);
      } else if (rawProvider === 'twitch') {
        linked = senderId
          ? db.prepare('SELECT id FROM users WHERE twitch_id = ? OR lower(twitch_username) = ? LIMIT 1').get(senderId, senderLogin)
          : db.prepare('SELECT id FROM users WHERE lower(twitch_username) = ? LIMIT 1').get(senderLogin);
      } else if (rawProvider === 'spmt') {
        linked = db.prepare('SELECT id FROM users WHERE id = ? OR lower(username) = ? LIMIT 1').get(senderId, senderLogin);
      } else {
        linked = null;
      }
      identityCache.set(cacheKey, linked || null);
    }
    if (!linked?.id) return item;
    let balance = xpCache.get(linked.id);
    if (!balance) {
      const row = db.prepare('SELECT COALESCE(SUM(delta), 0) AS xp FROM xp_ledger WHERE user_id = ?').get(linked.id) as any;
      const xp = Number(row?.xp || 0);
      balance = { xp, level: Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1 };
      xpCache.set(linked.id, balance);
    }
    return {
      ...item,
      meta: {
        ...(item.meta || {}),
        spmtIdentityLinked: true,
        spmtUserId: linked.id,
        spmtXp: balance.xp,
        spmtLevel: balance.level,
      },
    };
  });
}

function streamweaverCommlinkFeedUrl() {
  if (!IS_PRODUCTION && process.env.NODE_ENV === 'test' && process.env.SPMT_TEST_STREAMWEAVER_FEED_URL) {
    return process.env.SPMT_TEST_STREAMWEAVER_FEED_URL;
  }
  return 'https://streamweaver-new.fly.dev/api/shared-chat/spmt-feed';
}

function streamweaverCommlinkDispatchUrl() {
  if (!IS_PRODUCTION && process.env.NODE_ENV === 'test' && process.env.SPMT_TEST_STREAMWEAVER_DISPATCH_URL) {
    return process.env.SPMT_TEST_STREAMWEAVER_DISPATCH_URL;
  }
  return 'https://streamweaver-new.fly.dev/api/shared-chat/spmt-dispatch';
}

function streamweaverCommlinkOperatorUrl() {
  if (!IS_PRODUCTION && process.env.NODE_ENV === 'test' && process.env.SPMT_TEST_STREAMWEAVER_OPERATOR_URL) {
    return process.env.SPMT_TEST_STREAMWEAVER_OPERATOR_URL;
  }
  return 'https://streamweaver-new.fly.dev/api/shared-chat/spmt-operator';
}

const COMMLINK_EGRESS_CAPABILITIES: Record<string, Record<string, boolean>> = {
  twitch: { compose: true, reply: true, timeout: true, delete: false },
  discord: { compose: true, reply: false, timeout: false, delete: true },
  kick: { compose: true, reply: false, timeout: false, delete: false },
  youtube: { compose: false, reply: false, timeout: false, delete: false },
  tiktok: { compose: false, reply: false, timeout: false, delete: false },
  spmt: { compose: false, reply: false, timeout: false, delete: false },
};

function commlinkDestination(value: any) {
  const platform = commlinkFeedText(value?.platform, 40).toLowerCase();
  const channelId = commlinkFeedText(value?.channelId, 160);
  const channelName = commlinkFeedText(value?.channelName, 160);
  if (!['twitch', 'discord', 'kick', 'youtube'].includes(platform) || !channelId || !channelName) return null;
  return { platform, channelId, channelName };
}

function serializeCommlinkReceipt(row: any, duplicate = false) {
  return {
    id: row.id,
    groupId: row.group_id,
    idempotencyKey: row.idempotency_key,
    action: row.action,
    destination: {
      platform: row.platform,
      channelId: row.channel_id,
      channelName: row.channel_name,
    },
    status: row.status,
    providerReceipt: row.provider_receipt_json ? JSON.parse(row.provider_receipt_json) : null,
    error: row.error_message ? { code: row.error_code || 'DISPATCH_FAILED', message: row.error_message } : null,
    retryOf: row.retry_of || null,
    duplicate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function dispatchCommlinkGroup(userId: string, sourceApp: string, input: any, options: { groupId?: string; retryOf?: string } = {}) {
  const user = getUserById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  const action = commlinkFeedText(input?.action || 'compose', 24).toLowerCase();
  if (!['compose', 'reply', 'timeout', 'delete'].includes(action)) {
    throw Object.assign(new Error('Unsupported Commlink action'), { statusCode: 400 });
  }
  const message = commlinkFeedText(input?.message, 2_000);
  if (['compose', 'reply'].includes(action) && !message) {
    throw Object.assign(new Error('Message required'), { statusCode: 400 });
  }
  const eventId = commlinkFeedText(input?.eventId, 240);
  if (action !== 'compose' && !eventId) {
    throw Object.assign(new Error('A source event is required for this action'), { statusCode: 400 });
  }
  const idempotencyKey = commlinkFeedText(input?.idempotencyKey, 160);
  if (idempotencyKey.length < 8) {
    throw Object.assign(new Error('A stable idempotency key is required'), { statusCode: 400 });
  }
  const destinations = Array.from(new Map(
    (Array.isArray(input?.destinations) ? input.destinations : [input?.destination])
      .map(commlinkDestination)
      .filter(Boolean)
      .slice(0, 8)
      .map((destination: any) => [`${destination.platform}:${destination.channelId}`, destination]),
  ).values()) as Array<{ platform: string; channelId: string; channelName: string }>;
  if (!destinations.length) throw Object.assign(new Error('At least one exact destination is required'), { statusCode: 400 });

  const groupId = options.groupId || uuidv4();
  const tenantId = String(user.twitch_id || user.id);
  const receipts = [];
  for (const destination of destinations) {
    const childKey = `${idempotencyKey}:${action}:${destination.platform}:${destination.channelId}`.slice(0, 200);
    const existing = db.prepare('SELECT * FROM commlink_dispatch_receipts WHERE user_id = ? AND idempotency_key = ?')
      .get(user.id, childKey) as any;
    if (existing) {
      receipts.push(serializeCommlinkReceipt(existing, true));
      continue;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const providerRequest = {
      idempotencyKey: childKey,
      action,
      destination,
      message,
      eventId: eventId || undefined,
      durationSeconds: action === 'timeout' ? Math.min(1_209_600, Math.max(1, Number(input?.durationSeconds || 600) || 600)) : undefined,
    };
    db.prepare(`
      INSERT INTO commlink_dispatch_receipts (
        id, group_id, user_id, source_app, idempotency_key, action, platform,
        channel_id, channel_name, request_json, status, retry_of, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dispatching', ?, ?, ?)
    `).run(
      id, groupId, user.id, sourceApp || 'cosmo-commlink', childKey, action,
      destination.platform, destination.channelId, destination.channelName,
      JSON.stringify(providerRequest), options.retryOf || null, now, now,
    );

    try {
      const response = await fetch(streamweaverCommlinkDispatchUrl(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-spmt-key': String(process.env.SYSTEM_API_KEY || ''),
          'x-spmt-tenant-id': tenantId,
          'x-spmt-user-id': user.id,
        },
        body: JSON.stringify(providerRequest),
        signal: AbortSignal.timeout(12_000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = commlinkFeedText(result?.error?.message || result?.error || `Provider returned ${response.status}`, 500);
        const code = commlinkFeedText(result?.error?.code || 'PROVIDER_DISPATCH_FAILED', 80);
        db.prepare(`
          UPDATE commlink_dispatch_receipts
          SET status = 'failed', error_code = ?, error_message = ?, provider_receipt_json = ?, updated_at = ?
          WHERE id = ?
        `).run(code, message, JSON.stringify(result), new Date().toISOString(), id);
      } else {
        db.prepare(`
          UPDATE commlink_dispatch_receipts
          SET status = 'delivered', provider_receipt_json = ?, updated_at = ?
          WHERE id = ?
        `).run(JSON.stringify(result), new Date().toISOString(), id);
      }
    } catch (error) {
      db.prepare(`
        UPDATE commlink_dispatch_receipts
        SET status = 'failed', error_code = 'UPSTREAM_UNAVAILABLE', error_message = ?, updated_at = ?
        WHERE id = ?
      `).run(error instanceof Error ? error.message.slice(0, 500) : 'Provider dispatch unavailable', new Date().toISOString(), id);
    }
    receipts.push(serializeCommlinkReceipt(
      db.prepare('SELECT * FROM commlink_dispatch_receipts WHERE id = ?').get(id),
    ));
  }

  const delivered = receipts.filter((receipt) => receipt.status === 'delivered').length;
  const failed = receipts.filter((receipt) => receipt.status === 'failed').length;
  return {
    version: 'commlink-dispatch-group.v1',
    groupId,
    status: failed === 0 ? 'delivered' : delivered === 0 ? 'failed' : 'partial',
    delivered,
    failed,
    receipts,
  };
}

async function handleCommlinkDispatch(req: any, res: any, userId: string, sourceApp = 'cosmo-commlink') {
  try {
    const result = await dispatchCommlinkGroup(userId, sourceApp, req.body);
    return res.status(result.status === 'delivered' ? 200 : 207).json(result);
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Commlink dispatch failed' });
  }
}

app.post('/api/commlink/dispatch', authenticate, (req: any, res) => (
  handleCommlinkDispatch(req, res, req.user.id, 'cosmo-commlink')
));

app.post('/api/platform/commlink/dispatch', authenticatePlatformKey('messages:write'), (req: any, res) => (
  handleCommlinkDispatch(req, res, req.platformKey.userId, req.platformKey.appId || req.platformKey.name || 'partner-app')
));

app.post('/api/commlink/dispatch/:groupId/retry', authenticate, async (req: any, res) => {
  const failed = db.prepare(`
    SELECT * FROM commlink_dispatch_receipts
    WHERE user_id = ? AND group_id = ? AND status = 'failed'
    ORDER BY datetime(created_at) ASC
  `).all(req.user.id, commlinkFeedText(req.params.groupId, 80)) as any[];
  if (!failed.length) return res.status(404).json({ error: 'No failed destinations are available to retry' });
  const request = JSON.parse(failed[0].request_json);
  request.destinations = failed.map((row) => JSON.parse(row.request_json).destination);
  request.idempotencyKey = `${failed[0].group_id}:retry:${uuidv4()}`.slice(0, 160);
  try {
    const result = await dispatchCommlinkGroup(req.user.id, failed[0].source_app, request, {
      groupId: failed[0].group_id,
      retryOf: failed[0].id,
    });
    return res.status(result.status === 'delivered' ? 200 : 207).json(result);
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Commlink retry failed' });
  }
});

const COMMLINK_OPERATOR_ACTIONS = new Set([
  'pin', 'unpin', 'queue', 'unqueue', 'feature', 'next', 'clear',
  'set-auto-show', 'set-feature-options', 'speak',
]);

function serializeCommlinkOperatorReceipt(row: any, duplicate = false) {
  return {
    version: 'commlink-operator-receipt.v1',
    id: row.id,
    idempotencyKey: row.idempotency_key,
    action: row.action,
    eventId: row.event_id || null,
    status: row.status,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error_message ? { code: row.error_code || 'OPERATOR_ACTION_FAILED', message: row.error_message } : null,
    duplicate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readCommlinkOperator(userId: string) {
  const user = getUserById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  const tenantId = String(user.twitch_id || user.id);
  const response = await fetch(streamweaverCommlinkOperatorUrl(), {
    headers: {
      'x-spmt-key': String(process.env.SYSTEM_API_KEY || ''),
      'x-spmt-tenant-id': tenantId,
      'x-spmt-user-id': user.id,
    },
    signal: AbortSignal.timeout(5_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(commlinkFeedText(result?.error?.message || result?.error || 'Operator runtime unavailable', 500)), {
    statusCode: response.status,
  });
  const streamweaverOrigin = new URL(streamweaverCommlinkOperatorUrl()).origin;
  return {
    ...result,
    outputs: Array.isArray(result.outputs) ? result.outputs.map((output: any) => ({
      ...output,
      url: output?.path ? new URL(String(output.path), streamweaverOrigin).href : null,
    })) : [],
  };
}

async function dispatchCommlinkOperator(userId: string, sourceApp: string, input: any) {
  const user = getUserById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  const action = commlinkFeedText(input?.action, 40).toLowerCase();
  if (!COMMLINK_OPERATOR_ACTIONS.has(action)) throw Object.assign(new Error('Unsupported operator action'), { statusCode: 400 });
  const idempotencyKey = commlinkFeedText(input?.idempotencyKey, 160);
  if (idempotencyKey.length < 8) throw Object.assign(new Error('A stable idempotency key is required'), { statusCode: 400 });
  const eventId = commlinkFeedText(input?.eventId, 240);
  if (['pin', 'unpin', 'queue', 'unqueue', 'feature'].includes(action) && !eventId) {
    throw Object.assign(new Error('A source event is required for this action'), { statusCode: 400 });
  }
  const message = commlinkFeedText(input?.message, 2_000);
  if (action === 'speak' && !message) throw Object.assign(new Error('TTS text is required'), { statusCode: 400 });
  const existing = db.prepare('SELECT * FROM commlink_operator_receipts WHERE user_id = ? AND idempotency_key = ?')
    .get(user.id, idempotencyKey) as any;
  if (existing) return serializeCommlinkOperatorReceipt(existing, true);

  const requestBody = {
    action,
    eventId: eventId || undefined,
    message: action === 'speak' ? message : undefined,
    enabled: typeof input?.enabled === 'boolean' ? input.enabled : undefined,
    autoAdvance: typeof input?.autoAdvance === 'boolean' ? input.autoAdvance : undefined,
    durationSeconds: Number.isFinite(Number(input?.durationSeconds))
      ? Math.min(300, Math.max(0, Math.floor(Number(input.durationSeconds))))
      : undefined,
    style: ['glass', 'solid', 'minimal'].includes(String(input?.style)) ? input.style : undefined,
  };
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO commlink_operator_receipts (
      id, user_id, source_app, idempotency_key, action, event_id,
      request_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'dispatching', ?, ?)
  `).run(id, user.id, sourceApp || 'cosmo-commlink', idempotencyKey, action, eventId || null, JSON.stringify(requestBody), now, now);

  try {
    const tenantId = String(user.twitch_id || user.id);
    const response = await fetch(streamweaverCommlinkOperatorUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-spmt-key': String(process.env.SYSTEM_API_KEY || ''),
        'x-spmt-tenant-id': tenantId,
        'x-spmt-user-id': user.id,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(action === 'speak' ? 30_000 : 8_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = commlinkFeedText(result?.error?.message || result?.error || `Operator runtime returned ${response.status}`, 500);
      const errorCode = commlinkFeedText(result?.error?.code || 'OPERATOR_ACTION_FAILED', 80);
      db.prepare(`
        UPDATE commlink_operator_receipts
        SET status = 'failed', result_json = ?, error_code = ?, error_message = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(result), errorCode, errorMessage, new Date().toISOString(), id);
    } else {
      const status = result?.status === 'skipped' ? 'skipped' : 'delivered';
      db.prepare(`
        UPDATE commlink_operator_receipts
        SET status = ?, result_json = ?, updated_at = ?
        WHERE id = ?
      `).run(status, JSON.stringify(result), new Date().toISOString(), id);
    }
  } catch (error) {
    db.prepare(`
      UPDATE commlink_operator_receipts
      SET status = 'failed', error_code = 'UPSTREAM_UNAVAILABLE', error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(error instanceof Error ? error.message.slice(0, 500) : 'Operator runtime unavailable', new Date().toISOString(), id);
  }
  return serializeCommlinkOperatorReceipt(db.prepare('SELECT * FROM commlink_operator_receipts WHERE id = ?').get(id));
}

app.get('/api/commlink/operator', authenticate, async (req: any, res) => {
  try {
    return res.json(await readCommlinkOperator(req.user.id));
  } catch (error: any) {
    return res.status(error?.statusCode || 503).json({ error: error?.message || 'Operator runtime unavailable' });
  }
});

app.post('/api/commlink/operator', authenticate, async (req: any, res) => {
  try {
    const result = await dispatchCommlinkOperator(req.user.id, 'cosmo-commlink', req.body);
    return res.status(result.status === 'failed' ? 502 : 200).json(result);
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Operator action failed' });
  }
});

app.get('/api/commlink/integrations', authenticate, (_req: any, res) => {
  res.json({
    version: 'commlink-integrations.v1',
    primarySurface: '/?view=commlink',
    embeddedSurface: '/embed/commlink?mode=panel',
    popoutSurface: '/commlink/',
    rollbackSurface: '/?legacyMessages=1#messages',
    cleanupApproved: false,
    adapters: [
      {
        appId: 'spmt',
        owner: 'SPMT',
        status: 'native',
        capabilities: ['direct-messages', 'group-conversations', 'notifications', 'app-events', 'xp'],
        deepLink: '/commlink/?lane=mail',
      },
      {
        appId: 'streamweaver',
        owner: 'StreamWeaver',
        status: 'connected',
        capabilities: ['twitch', 'kick', 'youtube-read', 'discord', 'tts', 'bots-ai', 'voice', 'translation', 'featured-output', 'stream-audio-video'],
        deepLink: 'https://streamweaver-new.fly.dev/chat',
      },
      {
        appId: 'discord-stream-hub',
        owner: 'DiscordStreamHub',
        status: 'delegated',
        capabilities: ['discord-channel-curation', 'discord-all-channel-read', 'advanced-discord-management', 'badges', 'xp'],
        deepLink: 'https://discord-stream-hub-new.fly.dev/messages',
      },
      {
        appId: 'hearmeout',
        owner: 'HearMeOut',
        status: 'deep-link',
        capabilities: ['voice-rooms', 'watch-sessions', 'media'],
        deepLink: 'https://hearmeout-main.fly.dev/messages',
      },
      {
        appId: 'chat-tag',
        owner: 'ChatTag',
        status: 'sdk-events',
        capabilities: ['game-events', 'notifications'],
        deepLink: 'https://chat-tag-new.fly.dev/messages',
      },
      {
        appId: 'companion',
        owner: 'SpaceMountain Companion',
        status: 'paired-device',
        capabilities: ['allowlisted-controls', 'obs', 'popouts', 'reviewed-workflows'],
        deepLink: '/?view=apps',
      },
    ],
  });
});

app.get('/api/commlink/feed', authenticate, async (req: any, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100) || 100));
  const query = commlinkFeedText(req.query.q, 120).toLowerCase();
  const platform = commlinkFeedText(req.query.platform, 40).toLowerCase();
  const since = commlinkTimestampMs(req.query.since);
  const before = commlinkTimestampMs(req.query.before);
  const tenantId = String(user.twitch_id || user.id);
  let streamweaver: any = null;
  let streamweaverError: string | null = null;

  try {
    const target = new URL(streamweaverCommlinkFeedUrl());
    target.searchParams.set('limit', '200');
    if (query) target.searchParams.set('q', query);
    if (platform && platform !== 'spmt') target.searchParams.set('platform', platform);
    if (since) target.searchParams.set('since', new Date(since).toISOString());
    if (before) target.searchParams.set('before', new Date(before).toISOString());
    const response = await fetch(target, {
      headers: {
        'x-spmt-key': String(process.env.SYSTEM_API_KEY || ''),
        'x-spmt-tenant-id': tenantId,
        'x-spmt-user-id': user.id,
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`StreamWeaver feed returned ${response.status}`);
    streamweaver = await response.json();
  } catch (error) {
    streamweaverError = error instanceof Error ? error.message : 'StreamWeaver feed unavailable';
  }

  const localItems = listSpmtCommlinkItems(user.id, 200);
  const latestLocalTimestamp = localItems.reduce<string | null>((latest, item) => {
    if (!latest || commlinkTimestampMs(item.originalTimestamp) > commlinkTimestampMs(latest)) {
      return item.originalTimestamp;
    }
    return latest;
  }, null);
  const remoteItems = Array.isArray(streamweaver?.events)
    ? streamweaver.events.filter(isCommlinkFeedItem).map((item: CommlinkFeedItem) => ({
      ...item,
      meta: { ...(item.meta || {}), feedOwner: 'streamweaver' },
    }))
    : [];
  const filtered = enrichCommlinkFeedXp(dedupeCommlinkFeedItems([...remoteItems, ...localItems])).filter((item) => {
    const eventTime = commlinkTimestampMs(item.originalTimestamp);
    if (platform && item.platform !== platform && !(item.platform === 'social-stream' && item.meta?.rawProvider === platform)) return false;
    if (since && eventTime <= since) return false;
    if (before && eventTime >= before) return false;
    if (query && !`${item.sender.displayName} ${item.sender.login || ''} ${item.text} ${item.channelName || ''}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const items = filtered.slice(-limit);
  const localChannels = Array.from(new Map(localItems.map((item) => {
    const id = `${item.platform}:${item.channelId}`;
    return [id, {
      id,
      platform: item.platform,
      sourceId: item.sourceId,
      sourceName: item.sourceName || null,
      channelId: item.channelId,
      channelName: item.channelName || item.sourceName || item.channelId,
      lastEventAt: item.originalTimestamp,
      readOnly: true,
      capabilities: COMMLINK_EGRESS_CAPABILITIES[item.platform] || COMMLINK_EGRESS_CAPABILITIES.spmt,
    }];
  })).values());
  const remoteSources = Array.isArray(streamweaver?.sources) ? streamweaver.sources : [];
  const unavailableSources = ['twitch', 'kick', 'youtube', 'discord', 'tiktok'].map((sourcePlatform) => ({
    platform: sourcePlatform,
    status: 'unavailable',
    runtimeConnected: false,
    eventCount: 0,
    lastEventAt: null,
    readOnly: true,
  }));

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    schemaVersion: 1,
    mode: 'live-actions',
    generatedAt: new Date().toISOString(),
    count: items.length,
    hasMore: filtered.length > items.length || Boolean(streamweaver?.hasMore),
    nextSince: items.at(-1)?.originalTimestamp || req.query.since || null,
    sources: [
      ...(remoteSources.length ? remoteSources : unavailableSources).map((source: any) => ({
        ...source,
        readOnly: !COMMLINK_EGRESS_CAPABILITIES[source.platform]?.compose,
        capabilities: COMMLINK_EGRESS_CAPABILITIES[source.platform] || COMMLINK_EGRESS_CAPABILITIES.spmt,
      })),
      {
        platform: 'spmt',
        status: 'live',
        runtimeConnected: true,
        eventCount: localItems.length,
        lastEventAt: latestLocalTimestamp,
        readOnly: true,
        capabilities: COMMLINK_EGRESS_CAPABILITIES.spmt,
      },
    ],
    channels: [
      ...(Array.isArray(streamweaver?.channels) ? streamweaver.channels.map((channel: any) => ({
        ...channel,
        readOnly: !(COMMLINK_EGRESS_CAPABILITIES[channel.platform]?.compose),
        capabilities: COMMLINK_EGRESS_CAPABILITIES[channel.platform] || COMMLINK_EGRESS_CAPABILITIES.spmt,
      })) : []),
      ...localChannels,
    ],
    upstream: {
      streamweaver: streamweaverError ? { status: 'degraded', error: streamweaverError } : { status: 'ready' },
      spmt: { status: 'ready' },
    },
    commands: Array.isArray(streamweaver?.commands)
      ? streamweaver.commands.slice(0, 250).map((command: any) => ({
          id: commlinkFeedText(command.id, 120),
          name: commlinkFeedText(command.name, 160),
          command: commlinkFeedText(command.command, 120),
          description: commlinkFeedText(command.description, 500),
          aliases: Array.isArray(command.aliases) ? command.aliases.map((alias: any) => commlinkFeedText(alias, 120)).filter(Boolean).slice(0, 20) : [],
          permissions: Array.isArray(command.permissions) ? command.permissions.map((permission: any) => commlinkFeedText(permission, 80)).filter(Boolean).slice(0, 20) : [],
          group: commlinkFeedText(command.group || 'custom', 80),
        })).filter((command: any) => command.id && command.command)
      : [],
    dedupe: {
      inputCount: remoteItems.length + localItems.length,
      outputCount: dedupeCommlinkFeedItems([...remoteItems, ...localItems]).length,
    },
    items,
  });
});

function listVersionedWorkspaceRecords(table: 'workspace_overlay_scenes' | 'workspace_workflow_definitions', jsonColumn: 'scene_json' | 'workflow_json', userId: string) {
  return (db.prepare(`SELECT id, revision, name, ${jsonColumn} AS data_json, created_at, updated_at FROM ${table} WHERE user_id = ? ORDER BY datetime(updated_at) DESC`).all(userId) as any[])
    .map((row) => ({ id: row.id, revision: row.revision, name: row.name, data: JSON.parse(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at }));
}

function saveVersionedWorkspaceRecord(table: 'workspace_overlay_scenes' | 'workspace_workflow_definitions', jsonColumn: 'scene_json' | 'workflow_json', userId: string, input: any) {
  const id = validateRecordSlug(input?.id, 'id');
  const name = String(input?.name || id).trim().slice(0, 120);
  const data = input?.data ?? {};
  assertPublicAppState(data);
  const current = db.prepare(`SELECT revision, created_at FROM ${table} WHERE user_id = ? AND id = ?`).get(userId, id) as any;
  const expected = Number(input?.revision || 0);
  if (current && expected !== current.revision) throw Object.assign(new Error('Workspace record changed on another device'), { statusCode: 409, revision: current.revision });
  const revision = current ? current.revision + 1 : 1;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO ${table} (id, user_id, revision, name, ${jsonColumn}, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, id) DO UPDATE SET revision = excluded.revision, name = excluded.name,
      ${jsonColumn} = excluded.${jsonColumn}, updated_at = excluded.updated_at
  `).run(id, userId, revision, name, JSON.stringify(data), current?.created_at || now, now);
  return { id, revision, name, data, createdAt: current?.created_at || now, updatedAt: now };
}

app.get('/api/workspace/overlay-scenes', authenticate, (req: any, res) => {
  res.json({ scenes: listVersionedWorkspaceRecords('workspace_overlay_scenes', 'scene_json', req.user.id) });
});
app.put('/api/workspace/overlay-scenes/:id', authenticate, (req: any, res) => {
  try { res.json({ scene: saveVersionedWorkspaceRecord('workspace_overlay_scenes', 'scene_json', req.user.id, { ...req.body, id: req.params.id }) }); }
  catch (error: any) { res.status(error.statusCode || 400).json({ error: error.message, revision: error.revision }); }
});
app.get('/api/workspace/workflows', authenticate, (req: any, res) => {
  res.json({ workflows: listVersionedWorkspaceRecords('workspace_workflow_definitions', 'workflow_json', req.user.id) });
});
app.put('/api/workspace/workflows/:id', authenticate, (req: any, res) => {
  try { res.json({ workflow: saveVersionedWorkspaceRecord('workspace_workflow_definitions', 'workflow_json', req.user.id, { ...req.body, id: req.params.id }) }); }
  catch (error: any) { res.status(error.statusCode || 400).json({ error: error.message, revision: error.revision }); }
});

function getSpmtXpWallet(userId: string) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(delta), 0) AS spendable_xp,
      COALESCE(SUM(CASE
        WHEN delta > 0
          AND COALESCE(CAST(json_extract(metadata_json, '$.lifetimeEligible') AS INTEGER), 1) != 0
        THEN delta ELSE 0 END), 0) AS lifetime_xp
    FROM xp_ledger
    WHERE user_id = ?
  `).get(userId) as any;
  const spendableXp = Math.max(0, Number(totals?.spendable_xp || 0));
  const lifetimeXp = Math.max(0, Number(totals?.lifetime_xp || 0));
  const rankRow = db.prepare(`
    WITH ranked AS (
      SELECT user_id, COALESCE(SUM(CASE
        WHEN delta > 0
          AND COALESCE(CAST(json_extract(metadata_json, '$.lifetimeEligible') AS INTEGER), 1) != 0
        THEN delta ELSE 0 END), 0) AS lifetime_xp
      FROM xp_ledger
      GROUP BY user_id
    )
    SELECT 1 + COUNT(*) AS rank
    FROM ranked
    WHERE lifetime_xp > ?
  `).get(lifetimeXp) as any;
  return {
    spendableXp,
    currentXp: spendableXp,
    lifetimeXp,
    totalXp: lifetimeXp,
    rank: Number(rankRow?.rank || 1),
    level: Math.floor(Math.sqrt(lifetimeXp / 100)) + 1,
  };
}

function serializeXpEntry(entry: any) {
  return {
    id: entry.id,
    sourceApp: entry.source_app,
    eventType: entry.event_type,
    delta: entry.delta,
    metadata: JSON.parse(entry.metadata_json || '{}'),
    createdAt: entry.created_at,
  };
}

app.get('/api/xp', authenticate, (req: any, res) => {
  const wallet = getSpmtXpWallet(req.user.id);
  const entries = db.prepare('SELECT id, source_app, event_type, delta, metadata_json, created_at FROM xp_ledger WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 100').all(req.user.id) as any[];
  res.json({ xp: wallet.spendableXp, ...wallet, entries: entries.map(serializeXpEntry) });
});

app.post('/api/platform/xp/balance', authenticatePlatformKey('xp:write'), (req: any, res) => {
  const userId = String(req.body?.userId || '').trim();
  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: serializeUser(user), ...getSpmtXpWallet(userId) });
});

app.post('/api/platform/xp/spend', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (req.platformKey.appId && sourceApp !== req.platformKey.appId) return res.status(403).json({ error: `This key may only spend XP for ${req.platformKey.appId}` });
    const userId = String(req.body?.userId || '').trim();
    const eventType = validateRecordSlug(req.body?.eventType || 'wallet-spend', 'eventType');
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const amount = Number(req.body?.amount);
    if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
    if (!idempotencyKey || idempotencyKey.length > 200 || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      return res.status(400).json({ error: 'userId, positive bounded amount, and idempotencyKey are required' });
    }
    const existing = db.prepare('SELECT id FROM xp_ledger WHERE source_app = ? AND idempotency_key = ?').get(sourceApp, idempotencyKey);
    if (existing) return res.json({ spent: false, duplicate: true, ...getSpmtXpWallet(userId) });
    const wallet = getSpmtXpWallet(userId);
    if (wallet.spendableXp < amount) return res.status(409).json({ error: 'Insufficient spendable XP', ...wallet });
    const metadata = { ...(req.body?.metadata || {}), lifetimeEligible: false, walletAction: 'spend' };
    assertPublicAppState(metadata, 'metadata');
    db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), userId, sourceApp, eventType, idempotencyKey, -amount, JSON.stringify(metadata), new Date().toISOString());
    res.status(201).json({ spent: true, duplicate: false, amount, ...getSpmtXpWallet(userId) });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'XP could not be spent' });
  }
});

app.post('/api/platform/xp/gamble-settle', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (req.platformKey.appId && sourceApp !== req.platformKey.appId) {
      return res.status(403).json({ error: `This key may only settle gambling XP for ${req.platformKey.appId}` });
    }
    const userId = String(req.body?.userId || '').trim();
    const eventType = validateRecordSlug(req.body?.eventType || 'gamble-settle', 'eventType');
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const wager = Number(req.body?.wager);
    const payout = Number(req.body?.payout);
    if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
    if (!idempotencyKey || idempotencyKey.length > 180
      || !Number.isInteger(wager) || wager < 0 || wager > 1_000_000
      || !Number.isInteger(payout) || payout < 0 || payout > 100_000_000) {
      return res.status(400).json({ error: 'userId, bounded wager and payout, and idempotencyKey are required' });
    }

    const debitKey = `${idempotencyKey}:wager`;
    const refillKey = `${idempotencyKey}:refill`;
    const growthKey = `${idempotencyKey}:growth`;
    const existing = db.prepare(
      'SELECT id FROM xp_ledger WHERE source_app = ? AND idempotency_key IN (?, ?, ?) LIMIT 1',
    ).get(sourceApp, debitKey, refillKey, growthKey);
    if (existing) return res.json({ settled: false, duplicate: true, ...getSpmtXpWallet(userId) });

    const before = getSpmtXpWallet(userId);
    if (before.spendableXp < wager) return res.status(409).json({ error: 'Insufficient spendable XP', ...before });

    const settlement = settleGambleWallet({ ...before, wager, payout });
    const metadata = req.body?.metadata ?? {};
    assertPublicAppState(metadata, 'metadata');
    const now = new Date().toISOString();
    const insertEntry = (key: string, delta: number, entryMetadata: Record<string, unknown>) => {
      db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), userId, sourceApp, eventType, key, delta, JSON.stringify({ ...metadata, ...entryMetadata, wager, payout }), now);
    };

    db.transaction(() => {
      if (wager > 0) insertEntry(debitKey, -wager, { lifetimeEligible: false, walletAction: 'gamble-wager' });
      if (settlement.refill > 0) {
        insertEntry(refillKey, settlement.refill, { lifetimeEligible: false, walletAction: 'gamble-refill', refill: settlement.refill });
      }
      if (settlement.matchedGrowth > 0) {
        insertEntry(growthKey, settlement.matchedGrowth, {
          lifetimeEligible: true,
          walletAction: 'gamble-growth',
          overflow: settlement.overflow,
          compressed: settlement.compressed,
          matchedGrowth: settlement.matchedGrowth,
        });
      }
    })();

    return res.status(201).json({ settled: true, duplicate: false, ...settlement, payout, before, ...getSpmtXpWallet(userId) });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ error: error.message || 'Gambling XP could not be settled' });
  }
});

app.post('/api/platform/xp/transfer', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (req.platformKey.appId && sourceApp !== req.platformKey.appId) return res.status(403).json({ error: `This key may only transfer XP for ${req.platformKey.appId}` });
    const fromUserId = String(req.body?.fromUserId || '').trim();
    const toUserId = String(req.body?.toUserId || '').trim();
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const amount = Number(req.body?.amount);
    const eventType = validateRecordSlug(req.body?.eventType || 'wallet-transfer', 'eventType');
    if (!fromUserId || !toUserId || fromUserId === toUserId || !getUserById(fromUserId) || !getUserById(toUserId)) {
      return res.status(400).json({ error: 'Two different valid users are required' });
    }
    if (!idempotencyKey || idempotencyKey.length > 180 || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      return res.status(400).json({ error: 'Positive bounded amount and idempotencyKey are required' });
    }
    const debitKey = `${idempotencyKey}:debit`;
    const creditKey = `${idempotencyKey}:credit`;
    const existing = db.prepare('SELECT id FROM xp_ledger WHERE source_app = ? AND idempotency_key IN (?, ?) LIMIT 1').get(sourceApp, debitKey, creditKey);
    if (existing) return res.json({ transferred: false, duplicate: true, from: getSpmtXpWallet(fromUserId), to: getSpmtXpWallet(toUserId) });
    if (getSpmtXpWallet(fromUserId).spendableXp < amount) return res.status(409).json({ error: 'Insufficient spendable XP', from: getSpmtXpWallet(fromUserId) });
    const now = new Date().toISOString();
    const metadata = { ...(req.body?.metadata || {}), lifetimeEligible: false, walletAction: 'transfer' };
    assertPublicAppState(metadata, 'metadata');
    db.transaction(() => {
      db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), fromUserId, sourceApp, eventType, debitKey, -amount, JSON.stringify({ ...metadata, direction: 'debit', otherUserId: toUserId }), now);
      db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), toUserId, sourceApp, eventType, creditKey, amount, JSON.stringify({ ...metadata, direction: 'credit', otherUserId: fromUserId }), now);
    })();
    res.status(201).json({ transferred: true, duplicate: false, amount, from: getSpmtXpWallet(fromUserId), to: getSpmtXpWallet(toUserId) });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'XP could not be transferred' });
  }
});

app.post('/api/platform/xp/leaderboard', authenticatePlatformKey('xp:write'), (req: any, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit || 10) || 10));
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url,
      MAX(0, COALESCE(SUM(x.delta), 0)) AS spendable_xp,
      COALESCE(SUM(CASE
        WHEN x.delta > 0
          AND COALESCE(CAST(json_extract(x.metadata_json, '$.lifetimeEligible') AS INTEGER), 1) != 0
        THEN x.delta ELSE 0 END), 0) AS lifetime_xp
    FROM users u
    LEFT JOIN xp_ledger x ON x.user_id = u.id
    GROUP BY u.id
    ORDER BY lifetime_xp DESC, u.username ASC
    LIMIT ?
  `).all(limit) as any[];
  res.json({ entries: rows.map((row, index) => ({ rank: index + 1, userId: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, spendableXp: Number(row.spendable_xp || 0), lifetimeXp: Number(row.lifetime_xp || 0) })) });
});

app.post('/api/platform/xp', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (req.platformKey.appId && sourceApp !== req.platformKey.appId) return res.status(403).json({ error: `This key may only award XP for ${req.platformKey.appId}` });
    const userId = String(req.body?.userId || req.platformKey.userId || '').trim();
    const eventType = validateRecordSlug(req.body?.eventType, 'eventType');
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const delta = Number(req.body?.delta);
    if (!userId || !idempotencyKey || idempotencyKey.length > 200 || !Number.isInteger(delta) || Math.abs(delta) > 10000) {
      return res.status(400).json({ error: 'userId, bounded integer delta, and idempotencyKey are required' });
    }
    const metadata = req.body?.metadata ?? {};
    assertPublicAppState(metadata, 'metadata');
    const existing = db.prepare('SELECT id, user_id, source_app, event_type, delta, metadata_json, created_at FROM xp_ledger WHERE source_app = ? AND idempotency_key = ?').get(sourceApp, idempotencyKey) as any;
    if (existing) return res.json({ awarded: false, duplicate: true, entry: { ...existing, metadata: JSON.parse(existing.metadata_json) } });
    if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, sourceApp, eventType, idempotencyKey, delta, JSON.stringify(metadata), createdAt);
    res.status(201).json({ awarded: true, duplicate: false, entry: { id, userId, sourceApp, eventType, delta, metadata, createdAt } });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'XP could not be awarded' });
  }
});

app.post('/api/platform/xp/migrate-balance', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (!req.platformKey.appId || sourceApp !== req.platformKey.appId) {
      return res.status(403).json({ error: 'Legacy XP migration requires a matching app-bound key' });
    }
    const userId = String(req.body?.userId || '').trim();
    const observedBalance = Number(req.body?.observedBalance);
    const migrationVersion = Number(req.body?.migrationVersion || 1);
    if (!userId || !Number.isInteger(observedBalance) || observedBalance < 0 || observedBalance > 100_000_000
      || !Number.isInteger(migrationVersion) || migrationVersion < 1 || migrationVersion > 100) {
      return res.status(400).json({ error: 'userId, migrationVersion, and a bounded non-negative observedBalance are required' });
    }
    if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
    const metadata = req.body?.metadata ?? {};
    assertPublicAppState(metadata, 'metadata');
    const migratedAt = new Date().toISOString();
    const result = migrateLegacyXpBalance(db, {
      userId,
      sourceApp,
      observedBalance,
      migrationVersion,
      entryId: uuidv4(),
      idempotencyKey: `legacy-balance:${sourceApp}:${userId}:${observedBalance}`.slice(0, 200),
      migratedAt,
      metadata: { schemaVersion: 1, migration: 'legacy-source-balance', ...metadata },
    });
    res.status(result.migrated ? 201 : 200).json(result);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({
      error: error.message || 'Legacy XP balance could not be migrated',
      previousSourceBalance: error.previousSourceBalance,
    });
  }
});

app.get('/api/overlay-workspace', authenticate, (req: any, res) => {
  const row = db.prepare('SELECT layout, updated_at FROM overlay_workspaces WHERE user_id = ?').get(req.user.id) as any;
  if (!row) return res.json({ layout: null, updatedAt: null });
  try {
    res.json({ layout: JSON.parse(row.layout), updatedAt: row.updated_at });
  } catch {
    res.json({ layout: null, updatedAt: row.updated_at });
  }
});

app.put('/api/overlay-workspace', authenticate, (req: any, res) => {
  const layout = req.body?.layout;
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    return res.status(400).json({ error: 'A layout object is required' });
  }
  const serialized = JSON.stringify(layout);
  if (serialized.length > 100_000) return res.status(413).json({ error: 'Overlay layout is too large' });
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO overlay_workspaces (user_id, layout, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at
  `).run(req.user.id, serialized, updatedAt);
  res.json({ ok: true, layout, updatedAt });
});

app.post('/api/ai/conversations', authenticate, (req: any, res) => {
  const botHandle = cleanHandle(req.body?.bot || 'athena') || 'athena';
  const botName = botHandle === 'athena' ? 'Athena Core' : botHandle;
  const botUser = ensureSystemUser(botHandle, botName);
  const now = new Date().toISOString();
  const conversationId = ensureDirectConversation(req.user.id, botUser.id, now);

  db.prepare('UPDATE conversations SET title = COALESCE(title, ?), type = ?, updated_at = ? WHERE id = ?')
    .run(`${botName} conversation`, 'ai', now, conversationId);

  if (req.body?.prompt) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, metadata, mentioned_users, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      botUser.id,
      conversationId,
      req.body?.subject || 'AI conversation',
      String(req.body.prompt),
      'ai',
      'ai_prompt',
      JSON.stringify({ requestedBot: botHandle, dispatchStatus: 'unavailable', sourceApp: req.body?.sourceApp || 'spmt' }),
      extractMentionedUsers(req.body.prompt, req.body?.mentions),
      now
    );
  }

  res.status(201).json({
    id: conversationId,
    bot: { username: botUser.username, displayName: botUser.display_name },
    stored: true,
    routed: false,
    status: 'unavailable',
  });
});

app.post('/api/ai/conversations/:id/messages', authenticate, (req: any, res) => {
  const membership = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!membership) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.body?.prompt) return res.status(400).json({ error: 'Prompt required' });

  const botUser = ensureSystemUser(cleanHandle(req.body?.bot || 'athena') || 'athena', 'Athena Core');
  db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
    .run(req.params.id, botUser.id, 'ai', new Date().toISOString());

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, metadata, mentioned_users, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.user.id,
    botUser.id,
    req.params.id,
    req.body?.subject || 'AI prompt',
    String(req.body.prompt),
    'ai',
    'ai_prompt',
    JSON.stringify({ requestedBot: botUser.username, dispatchStatus: 'unavailable', sourceApp: req.body?.sourceApp || 'spmt' }),
    extractMentionedUsers(req.body.prompt, req.body?.mentions),
    now
  );
  db.prepare('UPDATE conversations SET type = ?, updated_at = ? WHERE id = ?').run('ai', now, req.params.id);
  res.status(201).json({ id, stored: true, routed: false, status: 'unavailable' });
});

app.post('/api/voice-messages', authenticate, (req: any, res) => {
  const { to, conversationId, audioUrl, transcript, durationMs } = req.body || {};
  if (!audioUrl || !/^https?:\/\//i.test(String(audioUrl))) return res.status(400).json({ error: 'audioUrl must be an http(s) URL' });

  let targetConversationId = conversationId;
  let recipients: any[] = [];
  if (targetConversationId) {
    recipients = db.prepare('SELECT user_id as id FROM conversation_members WHERE conversation_id = ? AND user_id != ?')
      .all(targetConversationId, req.user.id) as any[];
  } else {
    const recipient = findUserByHandle(to);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
    targetConversationId = ensureDirectConversation(req.user.id, recipient.id);
    recipients = [recipient];
  }
  if (!recipients.length) return res.status(400).json({ error: 'No voice message recipients found' });

  const now = new Date().toISOString();
  const ids = [];
  for (const recipient of recipients) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, metadata, attachments, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user.id,
      recipient.id,
      targetConversationId,
      req.body?.subject || 'Voice message',
      transcript || 'Voice message',
      'voice',
      'voice',
      JSON.stringify({ durationMs: Number(durationMs || 0), transcript: transcript || null }),
      JSON.stringify([{ url: String(audioUrl), name: 'Voice message', type: 'audio' }]),
      now
    );
    createNotification(recipient.id, 'Voice message', transcript || 'New voice message', {
      type: 'voice_message',
      sourceApp: req.body?.sourceApp || 'spmt',
      linkUrl: `/messages/${targetConversationId}`,
    });
    ids.push(id);
  }

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, targetConversationId);
  res.status(201).json({ ids, conversationId: targetConversationId, sent: true });
});

app.get('/api/search', authenticate, (req: any, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ query: q, messages: [], notifications: [], forums: [] });
  const like = `%${q}%`;
  const limit = Math.min(Number(req.query.limit || 20) || 20, 50);

  const messages = db.prepare(`
    SELECT m.id, m.conversation_id, m.subject, m.body, m.channel, m.message_type, m.created_at,
      from_user.username as from_user, to_user.username as to_user
    FROM messages m
    JOIN users from_user ON m.from_id = from_user.id
    JOIN users to_user ON m.to_id = to_user.id
    WHERE (m.from_id = ? OR m.to_id = ?) AND (m.subject LIKE ? OR m.body LIKE ?)
    ORDER BY datetime(m.created_at) DESC
    LIMIT ?
  `).all(req.user.id, req.user.id, like, like, limit);

  const notifications = db.prepare(`
    SELECT id, type, title, body, source_app, link_url, read_at, created_at
    FROM notifications
    WHERE user_id = ? AND (title LIKE ? OR body LIKE ? OR source_app LIKE ?)
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(req.user.id, like, like, like, limit);

  const forums = db.prepare(`
    SELECT t.id, t.title, t.category, t.created_at, u.username as author,
      (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count
    FROM forum_threads t
    JOIN users u ON t.author_id = u.id
    WHERE t.title LIKE ? OR t.category LIKE ? OR EXISTS (
      SELECT 1 FROM forum_posts p WHERE p.thread_id = t.id AND p.body LIKE ?
    )
    ORDER BY datetime(t.created_at) DESC
    LIMIT ?
  `).all(like, like, like, limit);

  res.json({ query: q, messages, notifications, forums });
});

// ─── Forum: Create thread ───
app.post('/api/forum/threads', authenticate, (req: any, res) => {
  const { title, category, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

  const id = uuidv4();
  const postId = uuidv4();
  const now = new Date().toISOString();

  db.prepare('INSERT INTO forum_threads (id, title, category, author_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, category || 'General', req.user.id, now);
  db.prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(postId, id, req.user.id, body, now);

  res.status(201).json({ id, title });
});

// ─── Forum: Get thread posts ───
app.get('/api/forum/threads/:id', (req, res) => {
  const thread = db.prepare('SELECT t.*, u.username as author FROM forum_threads t JOIN users u ON t.author_id = u.id WHERE t.id = ?').get(req.params.id) as any;
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const posts = db.prepare(`
    SELECT p.id, p.body, p.created_at, u.username as author, u.display_name as author_name
    FROM forum_posts p JOIN users u ON p.author_id = u.id
    WHERE p.thread_id = ? ORDER BY p.created_at ASC
  `).all(req.params.id);

  res.json({ thread, posts });
});

// ─── Forum: Reply to thread ───
app.post('/api/forum/threads/:id/reply', authenticate, (req: any, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Body required' });

  const thread = db.prepare('SELECT id FROM forum_threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const id = uuidv4();
  db.prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, req.user.id, body, new Date().toISOString());

  res.status(201).json({ id });
});

// ─── User Settings ───
app.get('/api/settings', authenticate, (req: any, res) => {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id) as any;
  res.json(settings || {});
});

app.post('/api/settings', authenticate, (req: any, res) => {
  const { theme, notifications, bio } = req.body;
  const existing = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(req.user.id);

  if (existing) {
    db.prepare('UPDATE user_settings SET theme = COALESCE(?, theme), notifications = COALESCE(?, notifications), bio = COALESCE(?, bio) WHERE user_id = ?')
      .run(theme, notifications, bio, req.user.id);
  } else {
    db.prepare('INSERT INTO user_settings (user_id, theme, notifications, bio) VALUES (?, ?, ?, ?)')
      .run(req.user.id, theme || 'solar-flare', notifications ?? 1, bio || '');
  }

  res.json({ ok: true });
});

// ─── System Messaging: App-to-user messages (used by ecosystem apps) ───
app.post('/api/system/message', (req, res) => {
  const apiKey = req.headers['x-spmt-key'];
  if (apiKey !== process.env.SYSTEM_API_KEY) return res.status(401).json({ error: 'Invalid API key' });

  const { from_app, to, subject, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'to and body required' });

  const recipient = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(to, to) as any;
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

  // Create a system user for the app if it doesn't exist
  const appUsername = (from_app || 'system').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let appUser = db.prepare('SELECT id FROM users WHERE username = ?').get(appUsername) as any;
  if (!appUser) {
    const appId = `app_${appUsername}`;
    db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(appId, appUsername, `${appUsername}@spmt.live`, from_app || 'System', 'SYSTEM_NO_LOGIN', new Date().toISOString());
    appUser = { id: appId };
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const conversationId = ensureDirectConversation(appUser.id, recipient.id, now);
  const title = subject || `Message from ${from_app || 'System'}`;
  const attachments = normalizeAttachments(req.body?.attachments);
  const mentionedUsers = extractMentionedUsers(body, req.body?.mentions);
  db.prepare(`
    INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, attachments, mentioned_users, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, appUser.id, recipient.id, conversationId, title, body, 'app', 'app', attachments, mentionedUsers, now);
  createNotification(recipient.id, title, String(body).slice(0, 180), {
    type: 'app_message',
    sourceApp: from_app || 'system',
    linkUrl: `/messages/${conversationId}`,
  });

  res.status(201).json({ id, sent: true, conversationId });
});

// ─── System Messaging: Broadcast to all users ───
app.post('/api/system/broadcast', (req, res) => {
  const apiKey = req.headers['x-spmt-key'];
  if (apiKey !== process.env.SYSTEM_API_KEY) return res.status(401).json({ error: 'Invalid API key' });

  const { from_app, subject, body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });

  const allUsers = db.prepare('SELECT id FROM users WHERE password_hash != ?').all('SYSTEM_NO_LOGIN') as any[];
  const appUsername = (from_app || 'system').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let appUser = db.prepare('SELECT id FROM users WHERE username = ?').get(appUsername) as any;
  if (!appUser) {
    const appId = `app_${appUsername}`;
    db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(appId, appUsername, `${appUsername}@spmt.live`, from_app || 'System', 'SYSTEM_NO_LOGIN', new Date().toISOString());
    appUser = { id: appId };
  }

  const now = new Date().toISOString();
  const attachments = normalizeAttachments(req.body?.attachments);
  const mentionedUsers = extractMentionedUsers(body, req.body?.mentions);
  let sent = 0;
  for (const user of allUsers) {
    const id = uuidv4();
    const conversationId = ensureDirectConversation(appUser.id, user.id, now);
    const title = subject || `Broadcast from ${from_app}`;
    db.prepare(`
      INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, attachments, mentioned_users, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, appUser.id, user.id, conversationId, title, body, 'broadcast', 'app', attachments, mentionedUsers, now);
    createNotification(user.id, title, String(body).slice(0, 180), {
      type: 'broadcast',
      sourceApp: from_app || 'system',
      linkUrl: `/messages/${conversationId}`,
    });
    sent++;
  }

  res.json({ sent, ok: true });
});

// ─── Discord Forwarding: Mirror Discord messages into spmt.live forum threads ───
// DSH calls this to forward messages. Each Discord channel maps to one forum thread.
app.post('/api/forum/forward', (req, res) => {
  const apiKey = req.headers['x-spmt-key'];
  if (apiKey !== process.env.SYSTEM_API_KEY) return res.status(401).json({ error: 'Invalid API key' });

  const { channelId, channelName, guildName, userName, userAvatar, message, attachments } = req.body;
  if (!channelId || (!message && !(attachments?.length))) return res.status(400).json({ error: 'channelId and message required' });

  // Find or create the thread for this channel
  let thread = db.prepare('SELECT id, title FROM forum_threads WHERE category = ?').get(`discord:${channelId}`) as any;

  if (!thread) {
    // Create thread mapped to this Discord channel
    const threadId = uuidv4();
    const title = channelName ? `#${channelName}` : `Discord Channel`;
    const now = new Date().toISOString();

    // Get or create a system user for the guild
    const botUsername = (guildName || 'discord').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'discord';
    let botUser = db.prepare('SELECT id FROM users WHERE username = ?').get(botUsername) as any;
    if (!botUser) {
      const botId = `app_${botUsername}`;
      db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(botId, botUsername, `${botUsername}@spmt.live`, guildName || 'Discord', 'SYSTEM_NO_LOGIN', now);
      botUser = { id: botId };
    }

    db.prepare('INSERT INTO forum_threads (id, title, category, author_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(threadId, title, `discord:${channelId}`, botUser.id, now);

    thread = { id: threadId, title };
  }

  // Get or create user for the message author
  const authorUsername = (userName || 'unknown').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) || 'unknown';
  let author = db.prepare('SELECT id FROM users WHERE username = ?').get(authorUsername) as any;
  if (!author) {
    const authorId = `discord_${authorUsername}_${Date.now().toString(36)}`;
    db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(authorId, authorUsername, `${authorUsername}@discord`, userName || authorUsername, 'SYSTEM_NO_LOGIN', new Date().toISOString());
    author = { id: authorId };
  }

  // Post the message as a reply in the thread
  const postId = uuidv4();
  let body = message || '';
  if (attachments?.length) {
    const urls = attachments.map((a: any) => a.url || a.proxy_url).filter(Boolean);
    if (urls.length) body += (body ? '\n' : '') + urls.join('\n');
  }

  db.prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(postId, thread.id, author.id, body, new Date().toISOString());

  res.status(201).json({ success: true, threadId: thread.id, postId });
});

// ─── Forum: List threads (updated to hide internal discord: categories from public view) ───
app.get('/api/forum/threads', (req, res) => {
  const showDiscord = req.query.discord === 'true';
  const query = showDiscord
    ? 'SELECT t.id, t.title, t.category, t.created_at, u.username as author, (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count FROM forum_threads t JOIN users u ON t.author_id = u.id ORDER BY t.created_at DESC LIMIT 50'
    : `SELECT t.id, t.title, t.category, t.created_at, u.username as author, (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count FROM forum_threads t JOIN users u ON t.author_id = u.id WHERE t.category NOT LIKE 'discord:%' ORDER BY t.created_at DESC LIMIT 50`;
  const threads = db.prepare(query).all();
  res.json(threads);
});

// ─── Forum: List Discord-mirrored channels ───
app.get('/api/forum/discord-channels', (req, res) => {
  const threads = db.prepare(`
    SELECT t.id, t.title, t.category, t.created_at,
      (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count,
      (SELECT body FROM forum_posts WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM forum_threads t WHERE t.category LIKE 'discord:%' ORDER BY t.created_at DESC
  `).all();
  res.json(threads);
});

// ─── Arena: Shared PvP Rocket Battlefield ───
app.get('/api/arena/state', authenticate, (req: any, res) => {
  // Get all active players in the arena (active in last 10 seconds)
  const cutoff = new Date(Date.now() - 10000).toISOString();
  const players = db.prepare('SELECT * FROM arena_players WHERE last_seen > ?').all(cutoff);
  res.json({ players });
});

app.post('/api/arena/join', authenticate, (req: any, res) => {
  const existing = db.prepare('SELECT user_id FROM arena_players WHERE user_id = ?').get(req.user.id);
  if (!existing) {
    db.prepare('INSERT INTO arena_players (user_id, username, x, y, angle, hp, kills, deaths, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.username, Math.random() * 800, Math.random() * 600, 0, 100, 0, 0, new Date().toISOString());
  } else {
    db.prepare('UPDATE arena_players SET hp = 100, last_seen = ? WHERE user_id = ?')
      .run(new Date().toISOString(), req.user.id);
  }
  res.json({ joined: true });
});

app.post('/api/arena/update', authenticate, (req: any, res) => {
  const { x, y, angle } = req.body;
  db.prepare('UPDATE arena_players SET x = ?, y = ?, angle = ?, last_seen = ? WHERE user_id = ?')
    .run(x, y, angle, new Date().toISOString(), req.user.id);
  res.json({ ok: true });
});

app.post('/api/arena/shoot', authenticate, (req: any, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'targetId required' });

  const target = db.prepare('SELECT * FROM arena_players WHERE user_id = ?').get(targetId) as any;
  if (!target || target.hp <= 0) return res.status(400).json({ error: 'Invalid target' });

  const damage = 25;
  const newHp = Math.max(0, target.hp - damage);
  db.prepare('UPDATE arena_players SET hp = ? WHERE user_id = ?').run(newHp, targetId);

  let killed = false;
  if (newHp <= 0) {
    // Award kill to shooter
    db.prepare('UPDATE arena_players SET kills = kills + 1 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE arena_players SET deaths = deaths + 1, hp = 100, x = ?, y = ? WHERE user_id = ?')
      .run(Math.random() * 800, Math.random() * 600, targetId);
    // Award XP points via user table if exists
    db.prepare('UPDATE users SET display_name = display_name WHERE id = ?').run(req.user.id); // placeholder for points
    killed = true;
  }

  res.json({ hit: true, damage, killed, targetHp: newHp });
});

app.get('/api/arena/shop', authenticate, async (req: any, res) => {
  // Fetch user's points from Discord Stream Hub
  let dshPoints = 0;
  try {
    const dshRes = await fetch('https://discord-stream-hub-new.fly.dev/api/points/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DSH_BOT_KEY}` },
      body: JSON.stringify({ userId: req.user.id, username: req.user.username }),
    });
    if (dshRes.ok) { const d = await dshRes.json(); dshPoints = d.points || 0; }
  } catch {}

  res.json({
    balance: dshPoints,
    items: [
      { id: 'bullets-10', name: '10 Bullets', cost: 50, description: 'Standard ammo pack' },
      { id: 'missiles-3', name: '3 Missiles', cost: 150, description: 'High damage, slow fire' },
      { id: 'shield', name: 'Shield (30s)', cost: 200, description: 'Temporary invulnerability' },
      { id: 'speed-boost', name: 'Speed Boost', cost: 100, description: '2x speed for 20s' },
    ]
  });
});

app.get('/api/arena/leaderboard', (req, res) => {
  const leaders = db.prepare('SELECT username, kills, deaths FROM arena_players ORDER BY kills DESC LIMIT 20').all();
  res.json(leaders);
});

// ─── SpaceMountain Companion devices and scoped command relay ───
function createCompanionDevice(userId: string, nameValue: unknown, capabilityValues: unknown) {
  const name = String(nameValue || 'My SpaceMountain Companion').trim().slice(0, 80) || 'My SpaceMountain Companion';
  const requested = Array.isArray(capabilityValues)
    ? capabilityValues.map((value: unknown) => String(value))
    : COMPANION_CAPABILITIES;
  const capabilities = [...new Set(requested.filter((value: string) => COMPANION_CAPABILITIES.includes(value)))];
  const id = uuidv4();
  const token = randomCredential(48);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO companion_devices (
      id, user_id, name, token_hash, capabilities, status, last_seen_at, created_at, updated_at, revoked_at
    ) VALUES (?, ?, ?, ?, ?, 'offline', NULL, ?, ?, NULL)
  `).run(id, userId, name, hashSecret(token), JSON.stringify(capabilities), now, now);
  return {
    device: { id, name, capabilities, status: 'offline', createdAt: now },
    pairingToken: token,
    relayUrl: 'wss://spmt.live/api/companion/relay',
  };
}

app.get('/api/companion/capabilities', (_req, res) => {
  res.json({
    schemaVersion: 1,
    capabilities: COMPANION_CAPABILITIES,
    actions: COMPANION_ACTION_CAPABILITIES,
  });
});

app.post('/api/companion/bootstrap', authenticate, (req: any, res) => {
  const code = randomCredential(48);
  const now = new Date();
  db.prepare('DELETE FROM companion_bootstrap_codes WHERE expires_at <= ? OR used_at IS NOT NULL').run(now.toISOString());
  db.prepare(`
    INSERT INTO companion_bootstrap_codes (code_hash, user_id, expires_at, used_at, created_at)
    VALUES (?, ?, ?, NULL, ?)
  `).run(
    hashSecret(code),
    req.user.id,
    new Date(now.getTime() + COMPANION_BOOTSTRAP_SECONDS * 1000).toISOString(),
    now.toISOString(),
  );
  res.status(201).json({
    launchUrl: `spmt-companion://bootstrap?code=${encodeURIComponent(code)}`,
    downloadUrl: COMPANION_RELEASE_DOWNLOAD_URL,
    expiresIn: COMPANION_BOOTSTRAP_SECONDS,
  });
});

app.post('/api/companion/bootstrap/exchange', (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code || code.length > 512) return res.status(400).json({ error: 'A valid Companion link code is required' });
  const codeHash = hashSecret(code);
  const bootstrap = db.prepare(`
    SELECT * FROM companion_bootstrap_codes
    WHERE code_hash = ? AND used_at IS NULL
  `).get(codeHash) as any;
  if (!bootstrap) return res.status(400).json({ error: 'Companion link is invalid or already used' });
  if (new Date(bootstrap.expires_at) <= new Date()) {
    return res.status(400).json({ error: 'Companion link expired; create a new link from SPMT' });
  }

  const usedAt = new Date().toISOString();
  const claimed = db.prepare(`
    UPDATE companion_bootstrap_codes SET used_at = ?
    WHERE code_hash = ? AND used_at IS NULL
  `).run(usedAt, codeHash);
  if (!claimed.changes) return res.status(400).json({ error: 'Companion link is invalid or already used' });

  const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(bootstrap.user_id) as any;
  if (!user) return res.status(404).json({ error: 'Companion tenant no longer exists' });
  const pairing = createCompanionDevice(user.id, req.body?.name, req.body?.capabilities);
  return res.json({
    ...pairing,
    sessionToken: signSession(user),
    expiresIn: SPMT_SESSION_SECONDS,
    user: serializeUser(user),
  });
});

app.get('/api/companion/devices', authenticate, (req: any, res) => {
  const devices = db.prepare(`
    SELECT id, name, capabilities, status, last_seen_at, created_at, updated_at
    FROM companion_devices
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY datetime(updated_at) DESC
  `).all(req.user.id).map((row: any) => ({
    id: row.id,
    name: row.name,
    capabilities: JSON.parse(row.capabilities || '[]'),
    status: companionSockets.has(row.id) ? 'online' : row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  res.json({ devices });
});

app.post('/api/companion/devices/pair', authenticate, (req: any, res) => {
  res.status(201).json(createCompanionDevice(req.user.id, req.body?.name, req.body?.capabilities));
});

app.post('/api/platform/companion/diagnostics', authenticatePlatformKey('apps:read'), (req: any, res) => {
  const userId = String(req.platformKey?.userId || '').trim();
  if (!userId) return res.status(403).json({ error: 'A tenant-bound SPMT platform key is required' });
  const action = 'diagnostics.snapshot.write';
  const capability = COMPANION_ACTION_CAPABILITIES[action];
  const payload = validateCompanionPayload(action, req.body);
  if (!payload) return res.status(400).json({ error: 'Diagnostics snapshot payload is invalid or too large' });

  const newest = db.prepare(`
    SELECT created_at FROM companion_commands
    WHERE user_id = ? AND action = ?
    ORDER BY datetime(created_at) DESC LIMIT 1
  `).get(userId, action) as any;
  if (newest && Date.now() - Date.parse(newest.created_at) < 60_000) {
    return res.status(429).json({ error: 'A diagnostics snapshot was already accepted in the last minute' });
  }

  const device = db.prepare(`
    SELECT * FROM companion_devices
    WHERE user_id = ? AND revoked_at IS NULL
    ORDER BY CASE WHEN status = 'online' THEN 0 ELSE 1 END, datetime(updated_at) DESC
    LIMIT 1
  `).get(userId) as any;
  if (!device) return res.status(409).json({ error: 'No tenant-linked Companion device is available' });

  const capabilities = Array.from(new Set([...(JSON.parse(device.capabilities || '[]') as string[]), capability]));
  db.prepare('UPDATE companion_devices SET capabilities = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(capabilities), new Date().toISOString(), device.id);

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60_000);
  db.prepare(`
    UPDATE companion_commands
    SET status = 'expired', completed_at = COALESCE(completed_at, ?)
    WHERE device_id = ? AND action = ? AND status = 'queued'
  `).run(issuedAt.toISOString(), device.id, action);
  db.prepare(`
    DELETE FROM companion_commands
    WHERE action = ? AND user_id = ? AND status IN ('completed', 'failed', 'expired')
      AND id NOT IN (
        SELECT id FROM companion_commands
        WHERE action = ? AND user_id = ? AND status IN ('completed', 'failed', 'expired')
        ORDER BY datetime(created_at) DESC LIMIT 50
      )
  `).run(action, userId, action, userId);

  const id = uuidv4();
  const envelope = {
    schemaVersion: 1,
    id,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    userId,
    deviceId: device.id,
    source: 'fly-machine-rotator',
    capability,
    action,
    payload,
    requiresConfirmation: false,
  };
  const socket = companionSockets.get(device.id);
  const status = socket?.readyState === WebSocket.OPEN ? 'sent' : 'queued';
  db.prepare(`
    INSERT INTO companion_commands (
      id, user_id, device_id, source, capability, action, payload, status, result, error,
      requires_confirmation, issued_at, expires_at, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, ?, NULL)
  `).run(
    id, userId, device.id, envelope.source, capability, action, JSON.stringify(payload), status,
    envelope.issuedAt, envelope.expiresAt, envelope.issuedAt,
  );
  if (status === 'sent') socket!.send(JSON.stringify(envelope));
  return res.status(202).json({
    accepted: true,
    snapshotId: payload.snapshotId,
    deviceId: device.id,
    status,
    expiresAt: envelope.expiresAt,
  });
});

app.delete('/api/companion/devices/:deviceId', authenticate, (req: any, res) => {
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE companion_devices
    SET revoked_at = ?, status = 'revoked', updated_at = ?
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).run(now, now, req.params.deviceId, req.user.id);
  companionSockets.get(req.params.deviceId)?.close(4001, 'Device revoked');
  companionSockets.delete(req.params.deviceId);
  if (!result.changes) return res.status(404).json({ error: 'Companion device not found' });
  res.json({ revoked: true, deviceId: req.params.deviceId });
});

app.post('/api/companion/commands', authenticate, (req: any, res) => {
  const deviceId = String(req.body?.deviceId || '').trim();
  const action = String(req.body?.action || '').trim();
  const capability = String(req.body?.capability || COMPANION_ACTION_CAPABILITIES[action] || '').trim();
  const expectedCapability = COMPANION_ACTION_CAPABILITIES[action];
  if (!deviceId || !expectedCapability || capability !== expectedCapability) {
    return res.status(400).json({ error: 'Unsupported companion action or capability' });
  }
  const device = db.prepare(`
    SELECT * FROM companion_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `).get(deviceId, req.user.id) as any;
  if (!device) return res.status(404).json({ error: 'Companion device not found' });
  const capabilities = JSON.parse(device.capabilities || '[]') as string[];
  if (!capabilities.includes(capability)) return res.status(403).json({ error: `Device has not granted ${capability}` });

  const payload = validateCompanionPayload(action, req.body?.payload);
  if (!payload) return res.status(400).json({ error: 'Companion command payload is invalid' });
  const requiresConfirmation = Boolean(req.body?.requiresConfirmation) || companionRequiresConfirmation(action, payload);
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE companion_commands
    SET status = 'expired', completed_at = COALESCE(completed_at, ?)
    WHERE device_id = ? AND status IN ('queued', 'sent') AND expires_at <= ?
  `).run(nowIso, deviceId, nowIso);
  const pendingCount = Number((db.prepare(`
    SELECT COUNT(*) AS count FROM companion_commands
    WHERE device_id = ? AND status IN ('queued', 'sent')
  `).get(deviceId) as any)?.count || 0);
  if (pendingCount >= 100) return res.status(429).json({ error: 'Companion command queue is full' });

  const id = uuidv4();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + (requiresConfirmation ? 10 * 60_000 : 30_000));
  const source = String(req.body?.source || 'spmt').trim().slice(0, 40) || 'spmt';
  const envelope = {
    schemaVersion: 1,
    id,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    userId: req.user.id,
    deviceId,
    source,
    capability,
    action,
    payload,
    requiresConfirmation,
  };
  const socket = companionSockets.get(deviceId);
  const status = socket?.readyState === WebSocket.OPEN ? 'sent' : 'queued';
  db.prepare(`
    INSERT INTO companion_commands (
      id, user_id, device_id, source, capability, action, payload, status, result, error,
      requires_confirmation, issued_at, expires_at, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL)
  `).run(
    id, req.user.id, deviceId, source, capability, action, JSON.stringify(payload), status,
    requiresConfirmation ? 1 : 0, issuedAt.toISOString(), expiresAt.toISOString(), issuedAt.toISOString()
  );
  if (status === 'sent') socket!.send(JSON.stringify(envelope));
  res.status(202).json({ command: { ...envelope, status } });
});

app.get('/api/companion/commands/:commandId', authenticate, (req: any, res) => {
  const row = db.prepare(`
    SELECT * FROM companion_commands WHERE id = ? AND user_id = ?
  `).get(req.params.commandId, req.user.id) as any;
  if (!row) return res.status(404).json({ error: 'Companion command not found' });
  res.json({
    command: {
      id: row.id,
      deviceId: row.device_id,
      source: row.source,
      capability: row.capability,
      action: row.action,
      payload: JSON.parse(row.payload || '{}'),
      status: row.status,
      result: row.result ? JSON.parse(row.result) : null,
      error: row.error,
      requiresConfirmation: Boolean(row.requires_confirmation),
      issuedAt: row.issued_at || row.created_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    },
  });
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error('SPMT API error:', err);
  if (res.headersSent) return next(err);
  const status = Number(err?.status || err?.statusCode || 500);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status >= 500 ? 'Internal server error' : err?.message || 'Request failed',
    requestId: req.headers['x-request-id'] || null,
  });
});

// ─── Static fallback (for minimal frontend later) ───
app.use('/docs', express.static('docs'));
app.get('/embed/commlink', (req, res) => {
  const requestedMode = String(req.query.mode || 'panel').toLowerCase();
  const mode = (SHARED_SURFACE_MODES as readonly string[]).includes(requestedMode) ? requestedMode : 'panel';
  const target = new URL('/commlink/', `${req.protocol}://${req.get('host')}`);
  target.searchParams.set('embedded', '1');
  target.searchParams.set('mode', mode);
  if (req.query.app) target.searchParams.set('app', compactText(req.query.app, 50));
  if (req.query.demo === '1') target.searchParams.set('demo', '1');
  res.redirect(302, `${target.pathname}${target.search}`);
});

app.get('/embed/:surface', (req, res, next) => {
  if (!sharedSurface(req.params.surface)) return next();
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile('shared/index.html', { root: 'public' });
});

app.use(express.static('public'));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile('index.html', { root: 'public' });
});

// ─── Start ───
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}
initDb();
const httpServer = http.createServer(app);
const companionWss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = (() => {
    try {
      return new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    } catch {
      return '';
    }
  })();
  if (pathname !== '/api/companion/relay') {
    socket.destroy();
    return;
  }
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const deviceId = String(request.headers['x-spmt-device'] || '').trim();
  const device = token && deviceId
    ? db.prepare(`
        SELECT * FROM companion_devices
        WHERE id = ? AND token_hash = ? AND revoked_at IS NULL
      `).get(deviceId, hashSecret(token)) as any
    : null;
  if (!device) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  companionWss.handleUpgrade(request, socket, head, (webSocket) => {
    (webSocket as any).companionDevice = device;
    companionWss.emit('connection', webSocket, request);
  });
});

companionWss.on('connection', (socket: WebSocket) => {
  const device = (socket as any).companionDevice as any;
  const now = new Date().toISOString();
  companionSockets.get(device.id)?.close(4000, 'Replaced by a newer connection');
  companionSockets.set(device.id, socket);
  db.prepare(`
    UPDATE companion_devices SET status = 'online', last_seen_at = ?, updated_at = ? WHERE id = ?
  `).run(now, now, device.id);

  const queued = db.prepare(`
    SELECT * FROM companion_commands
    WHERE device_id = ? AND status = 'queued' AND expires_at > ?
    ORDER BY datetime(created_at) ASC
    LIMIT 100
  `).all(device.id, now) as any[];
  for (const row of queued) {
    socket.send(JSON.stringify({
      schemaVersion: 1,
      id: row.id,
      issuedAt: row.issued_at || row.created_at,
      expiresAt: row.expires_at,
      userId: row.user_id,
      deviceId: row.device_id,
      source: row.source,
      capability: row.capability,
      action: row.action,
      payload: JSON.parse(row.payload || '{}'),
      requiresConfirmation: Boolean(row.requires_confirmation),
    }));
    db.prepare(`UPDATE companion_commands SET status = 'sent' WHERE id = ?`).run(row.id);
  }

  socket.on('message', (raw) => {
    let message: any;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    const seenAt = new Date().toISOString();
    db.prepare(`
      UPDATE companion_devices SET status = 'online', last_seen_at = ?, updated_at = ? WHERE id = ?
    `).run(seenAt, seenAt, device.id);
    if (message?.type !== 'companion.result' || !message?.id) return;
    const command = db.prepare(`
      SELECT id FROM companion_commands WHERE id = ? AND device_id = ? AND user_id = ?
    `).get(String(message.id), device.id, device.user_id) as any;
    if (!command) return;
    db.prepare(`
      UPDATE companion_commands
      SET status = ?, result = ?, error = ?, completed_at = ?
      WHERE id = ?
    `).run(
      message.ok ? 'completed' : 'failed',
      message.result == null ? null : JSON.stringify(message.result),
      message.error ? String(message.error).slice(0, 500) : null,
      seenAt,
      command.id,
    );
  });
  socket.on('close', () => {
    if (companionSockets.get(device.id) === socket) companionSockets.delete(device.id);
    const closedAt = new Date().toISOString();
    db.prepare(`
      UPDATE companion_devices SET status = 'offline', last_seen_at = ?, updated_at = ? WHERE id = ?
    `).run(closedAt, closedAt, device.id);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`spmt.live running on http://localhost:${PORT}`);
});
