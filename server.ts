import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, getDatabaseReadiness, initDb } from './db.js';
import {
  createDefaultWorkspaceProfile,
  mergeWorkspaceProfile,
  validateWorkspaceProfile,
  type WorkspaceProfileV1,
} from './workspace-profile.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'spmt-dev-secret-change-in-production');
const APP_VERSION = '1.0.0';
const BUILD_SHA = process.env.BUILD_SHA || 'development';
const RECOVERY_DELIVERY_COOLDOWN_MS = 10 * 60 * 1000;
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
};

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

    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channel.id)}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: `Your new SPMT recovery code is **${code}**. Use it at https://spmt.live under Recover. Do not share this code. If you did not request it, you can ignore this message and your password remains unchanged.`,
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
  res.cookie('spmt_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function appPermissionsFor(appId: string) {
  const base: Record<string, string[]> = {
    'spacemountain-live': ['identity:read', 'apps:launch', 'messages:read', 'messages:write'],
    'discord-stream-hub': ['identity:read', 'linked_accounts:read', 'messages:write'],
    streamweaver: ['identity:read', 'linked_accounts:read', 'messages:write'],
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

function authenticatePlatformKey(requiredScope: string) {
  return (req: any, res: any, next: any) => {
    const token = String(req.headers.authorization?.replace('Bearer ', '') || req.body?.token || req.query?.token || '').trim();
    if (!token) return res.status(401).json({ error: 'Platform API key required' });

    const row = db.prepare(`
      SELECT id, user_id, app_id, name, key_prefix, scopes
      FROM developer_api_keys
      WHERE key_hash = ? AND revoked_at IS NULL
    `).get(hashSecret(token)) as any;
    if (!row) return res.status(401).json({ error: 'Invalid platform API key' });

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
    },
  });
});

app.get('/api/platform/sdk', (req, res) => {
  res.json({
    package: '@spmt/sdk',
    version: '0.1.4',
    npmPublished: true,
    install: 'npm install @spmt/sdk',
    quickInstall: 'npm exec --yes --package=@spmt/sdk -- spmt install',
    download: 'https://spmt.live/sdk/spmt-sdk.tgz',
    starterZip: 'https://spmt.live/sdk/atherrea-spmt-starter.zip',
    example: "const spmt = new SpaceMountainClient({ apiKey: process.env.SPMT_API_KEY, appId: 'atherrea' }); await spmt.experience.award(mappedXpAwardV1({ userId, mappedEventType: 'dsh.discord.message', upstreamEventId }));",
    modules: ['identity', 'apps', 'developer', 'events', 'game', 'experience', 'workspace', 'sharedChat', 'commlink', 'athena', 'webhooks'],
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
    .run(status, reviewNotes, reviewedAt, reviewedAt, row.id);
  createNotification(
    row.user_id,
    `${row.name} submission ${status}`,
    reviewNotes || (status === 'approved' ? 'Your app is now available in the SPMT app list.' : 'Update the manifest and submit again when ready.'),
    { type: 'app_submission', sourceApp: 'spmt', linkUrl: '/?view=developers' },
  );
  const updated = db.prepare('SELECT * FROM app_submissions WHERE id = ?').get(row.id);
  res.json({ submission: serializeAppSubmission(updated) });
});

app.get('/api/platform/plugins', (req, res) => {
  res.json({ plugins: PLUGIN_MARKETPLACE });
});

app.get('/api/platform/plugins/installed', authenticate, (req: any, res) => {
  const installs = db.prepare('SELECT plugin_id, enabled, installed_at, updated_at FROM plugin_installs WHERE user_id = ?')
    .all(req.user.id) as any[];
  const installMap = new Map(installs.map((row) => [row.plugin_id, row]));
  res.json({
    plugins: PLUGIN_MARKETPLACE.map((plugin) => ({
      ...plugin,
      installed: installMap.has(plugin.id),
      enabled: Boolean(installMap.get(plugin.id)?.enabled),
      installedAt: installMap.get(plugin.id)?.installed_at || null,
    })),
  });
});

app.post('/api/platform/plugins/:id/install', authenticate, (req: any, res) => {
  const plugin = PLUGIN_MARKETPLACE.find((item) => item.id === req.params.id);
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO plugin_installs (user_id, plugin_id, enabled, installed_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(user_id, plugin_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at
  `).run(req.user.id, plugin.id, now, now);
  res.status(201).json({ ok: true, plugin: { ...plugin, installed: true, enabled: true, installedAt: now } });
});

app.post('/api/platform/plugins/:id/disable', authenticate, (req: any, res) => {
  const plugin = PLUGIN_MARKETPLACE.find((item) => item.id === req.params.id);
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' });
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO plugin_installs (user_id, plugin_id, enabled, installed_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(user_id, plugin_id) DO UPDATE SET enabled = 0, updated_at = excluded.updated_at
  `).run(req.user.id, plugin.id, now, now);
  res.json({ ok: true, plugin: { ...plugin, installed: true, enabled: false } });
});

app.get('/api/apps', (req, res) => {
  const token = req.cookies?.spmt_token || req.headers.authorization?.replace('Bearer ', '');
  let userId: string | undefined;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      userId = payload.id;
    } catch {}
  }
  res.json({ apps: buildAppsForUser(userId) });
});

app.post('/api/events', authenticate, (req: any, res) => {
  try {
    const user = getUserById(req.user.id);
    const event = createPlatformEvent({
      ...req.body,
      actor: req.body?.actor || {
        userId: user?.id,
        username: user?.username,
        displayName: user?.display_name,
      },
    }, req.user.id);
    res.status(201).json({ event });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'Invalid event payload' });
  }
});

app.get('/api/events', authenticate, (req: any, res) => {
  const limit = Math.min(Number(req.query.limit || 100) || 100, 200);
  const rows = db.prepare(`
    SELECT id, type, version, timestamp, source_app, actor_user_id, actor_username,
      actor_display_name, visibility, payload, links, created_by, created_at
    FROM platform_events
    WHERE created_by = ? OR visibility IN ('public', 'community', 'system')
    ORDER BY datetime(timestamp) DESC
    LIMIT ?
  `).all(req.user.id, limit) as any[];
  res.json({
    events: rows.map((row) => ({
      id: row.id,
      type: row.type,
      version: row.version,
      timestamp: row.timestamp,
      sourceApp: row.source_app,
      actor: { userId: row.actor_user_id, username: row.actor_username, displayName: row.actor_display_name },
      visibility: row.visibility,
      payload: JSON.parse(row.payload || '{}'),
      links: row.links ? JSON.parse(row.links) : null,
      createdAt: row.created_at,
    })),
  });
});

app.get('/api/apps/:appId', (req, res) => {
  const appId = String(req.params.appId || '');
  const token = req.cookies?.spmt_token || req.headers.authorization?.replace('Bearer ', '');
  let userId: string | undefined;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      userId = payload.id;
    } catch {}
  }

  const app = buildAppsForUser(userId).find((item) => item.id === appId);
  if (!app) return res.status(404).json({ error: 'Unknown app' });
  res.json({ app });
});

app.get('/api/apps/:appId/versions', (req, res) => {
  const appId = String(req.params.appId || '');
  const app = ecosystemApps().find((item) => item.id === appId);
  if (!app) return res.status(404).json({ error: 'Unknown app' });

  res.json({
    appId,
    currentVersion: app.version,
    latestVersion: app.latestVersion,
    updateAvailable: app.version !== app.latestVersion,
    versions: [
      {
        version: app.latestVersion,
        releasedAt: app.updatedAt,
        notes: app.releaseNotes,
        current: app.version === app.latestVersion,
      },
    ],
  });
});

app.post('/api/apps/:appId/install', authenticate, (req: any, res) => {
  const appId = String(req.params.appId || '');
  const app = ecosystemApps().find((item) => item.id === appId);
  if (!app) return res.status(404).json({ error: 'Unknown app' });

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_installs (user_id, app_id, enabled, installed_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(user_id, app_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at
  `).run(req.user.id, appId, now, now);

  for (const permission of appPermissionsFor(appId)) {
    db.prepare(`
      INSERT INTO app_permissions (user_id, app_id, permission, granted, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, app_id, permission) DO UPDATE SET granted = 1, updated_at = excluded.updated_at
    `).run(req.user.id, appId, permission, now);
  }

  res.json({ ok: true, app, apps: buildAppsForUser(req.user.id) });
});

app.post('/api/apps/:appId/disable', authenticate, (req: any, res) => {
  const appId = String(req.params.appId || '');
  const app = ecosystemApps().find((item) => item.id === appId);
  if (!app) return res.status(404).json({ error: 'Unknown app' });
  if (appId === 'spacemountain-live') return res.status(400).json({ error: 'SpaceMountain is a first-party app and cannot be disabled' });

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_installs (user_id, app_id, enabled, installed_at, updated_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(user_id, app_id) DO UPDATE SET enabled = 0, updated_at = excluded.updated_at
  `).run(req.user.id, appId, now, now);

  res.json({ ok: true, app, apps: buildAppsForUser(req.user.id) });
});

// ─── Auth: Register ───
app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName, discordUsername, twitchUsername } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const normalized = normalizeRegistrationUsername(username);
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  const clean = normalized.username as string;

  const existing = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(clean) as any;
  if (existing?.password_hash === 'SYSTEM_NO_LOGIN') {
    return res.status(409).json({ error: 'That username belongs to an existing imported profile. Contact support to claim and merge it safely.' });
  }
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  // Resolve Discord ID from username if provided
  let discordId: string | null = null;
  let avatarUrl: string | null = null;
  const cleanDiscord = (discordUsername || '').trim().replace(/^@/, '');
  if (cleanDiscord && process.env.DISCORD_BOT_TOKEN) {
    try {
      const guildId = process.env.DISCORD_GUILD_ID || '';
      if (guildId) {
        const searchRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(cleanDiscord)}&limit=1`, {
          headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });
        if (searchRes.ok) {
          const members = await searchRes.json();
          if (members.length > 0 && members[0].user) {
            discordId = members[0].user.id;
            const discordAvatar = String(members[0].user.avatar || '');
            if (discordAvatar) {
              const ext = discordAvatar.startsWith('a_') ? 'gif' : 'png';
              avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.${ext}`;
            }
          }
        }
      }
    } catch (e) { console.warn('Discord lookup failed:', e); }
  }

  // Resolve Twitch ID from username if provided
  let twitchId: string | null = null;
  const cleanTwitch = (twitchUsername || '').trim().toLowerCase();
  if (cleanTwitch && process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN) {
    try {
      const twitchRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cleanTwitch)}`, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
        },
      });
      if (twitchRes.ok) {
        const data = await twitchRes.json();
        if (data.data?.length > 0) {
          twitchId = data.data[0].id;
          if (!avatarUrl) avatarUrl = data.data[0].profile_image_url || null;
        }
      }
    } catch (e) { console.warn('Twitch lookup failed:', e); }
  }

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 12);
  const email = `${clean}@spmt.live`;

  db.prepare(`INSERT INTO users (id, username, email, display_name, password_hash, discord_username, discord_id, twitch_username, twitch_id, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, clean, email, displayName || clean, hash, cleanDiscord || null, discordId, cleanTwitch || null, twitchId, avatarUrl, new Date().toISOString());

  const user = getUserById(id);
  const token = signSession(user);
  const recoveryCode = createRecoveryCode(id);
  setSessionCookie(res, token);
  res.status(201).json({ user: serializeUser(user), token, recoveryCode });
});

// ─── Auth: Login ───
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const clean = username.trim().toLowerCase().replace(/@spmt\.live$/, '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(clean) as any;
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signSession(user);
  setSessionCookie(res, token);
  res.json({ user: serializeUser(user), token });
});

app.post('/api/auth/recover-username', (req, res) => {
  const discordUsername = String(req.body?.discordUsername || '').trim().replace(/^@/, '').toLowerCase();
  const twitchUsername = String(req.body?.twitchUsername || '').trim().replace(/^@/, '').toLowerCase();
  if (!discordUsername && !twitchUsername) return res.status(400).json({ error: 'Enter a linked Discord or Twitch username' });
  const user = discordUsername
    ? db.prepare(`SELECT username FROM users WHERE lower(discord_username) = ? AND password_hash != 'SYSTEM_NO_LOGIN'`).get(discordUsername) as any
    : db.prepare(`SELECT username FROM users WHERE lower(twitch_username) = ? AND password_hash != 'SYSTEM_NO_LOGIN'`).get(twitchUsername) as any;
  if (!user) return res.status(404).json({ error: 'No SPMT account is linked to that username' });
  res.json({ username: user.username, handle: `${user.username}@spmt.live` });
});

app.post('/api/auth/request-recovery-code', async (req, res) => {
  const startedAt = Date.now();
  const username = String(req.body?.username || '').trim().toLowerCase().replace(/@spmt\.live$/, '');
  const attemptKey = hashSecret(`${req.ip || 'unknown'}:${username || 'missing'}`);
  const lastAttempt = recoveryDeliveryAttempts.get(attemptKey) || 0;
  const now = Date.now();

  if (now - lastAttempt >= RECOVERY_DELIVERY_COOLDOWN_MS) {
    recoveryDeliveryAttempts.set(attemptKey, now);
    if (recoveryDeliveryAttempts.size > 2_000) {
      for (const [key, attemptedAt] of recoveryDeliveryAttempts) {
        if (now - attemptedAt >= RECOVERY_DELIVERY_COOLDOWN_MS) recoveryDeliveryAttempts.delete(key);
      }
    }

    const user = username
      ? db.prepare(`
          SELECT id, username, discord_username, discord_id
          FROM users
          WHERE username = ? AND password_hash != 'SYSTEM_NO_LOGIN'
        `).get(username) as any
      : null;
    if (user) {
      const code = generateRecoveryCode();
      const delivered = await sendRecoveryCodeToDiscord(user, code);
      if (delivered) saveRecoveryCode(user.id, code);
    }
  }

  const minimumResponseMs = 250;
  const remainingDelay = Math.max(0, minimumResponseMs - (Date.now() - startedAt));
  if (remainingDelay) await new Promise((resolve) => setTimeout(resolve, remainingDelay));
  res.status(202).json({
    ok: true,
    message: 'If that account has an exact linked Discord identity and DM delivery is available, a fresh recovery code has been sent.',
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase().replace(/@spmt\.live$/, '');
  const recoveryCode = String(req.body?.recoveryCode || '').trim().toUpperCase();
  const newPassword = String(req.body?.newPassword || '');
  if (!username || !recoveryCode || newPassword.length < 8) {
    return res.status(400).json({ error: 'Username, recovery code, and a new password of at least 8 characters are required' });
  }
  const user = db.prepare(`SELECT id FROM users WHERE username = ? AND password_hash != 'SYSTEM_NO_LOGIN'`).get(username) as any;
  const recovery = user
    ? db.prepare('SELECT code_hash, used_at FROM account_recovery_codes WHERE user_id = ?').get(user.id) as any
    : null;
  if (!user || !recovery || recovery.used_at || recovery.code_hash !== hashSecret(recoveryCode)) {
    return res.status(400).json({ error: 'Invalid or already-used recovery code' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const usedAt = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);
    db.prepare('UPDATE account_recovery_codes SET used_at = ? WHERE user_id = ?').run(usedAt, user.id);
  });
  transaction();
  res.json({ ok: true });
});

app.post('/api/auth/change-password', authenticate, async (req: any, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || newPassword.length < 8) return res.status(400).json({ error: 'Current password and a new password of at least 8 characters are required' });
  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) return res.status(401).json({ error: 'Current password is incorrect' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await bcrypt.hash(newPassword, 12), user.id);
  res.json({ ok: true });
});

app.post('/api/auth/recovery-code', authenticate, (req: any, res) => {
  res.json({ recoveryCode: createRecoveryCode(req.user.id) });
});

app.post('/api/auth/admin/recovery-code', (req, res) => {
  const configuredSecret = String(process.env.SPMT_ADMIN_RECOVERY_KEY || '');
  const providedSecret = String(req.headers['x-spmt-recovery-admin'] || '');
  if (!configuredSecret) return res.status(503).json({ error: 'Owner-assisted recovery is not configured' });
  if (!providedSecret || providedSecret !== configuredSecret) return res.status(401).json({ error: 'Unauthorized' });
  const username = String(req.body?.username || '').trim().toLowerCase().replace(/@spmt\.live$/, '');
  const user = db.prepare(`SELECT id, username FROM users WHERE username = ? AND password_hash != 'SYSTEM_NO_LOGIN'`).get(username) as any;
  if (!user) return res.status(404).json({ error: 'Account not found' });
  res.json({ username: user.username, recoveryCode: createRecoveryCode(user.id) });
});

// ─── Auth: Logout ───
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('spmt_token', { secure: true, sameSite: 'none' });
  res.json({ ok: true });
});

// ─── Auth: Current user ───
app.get('/api/auth/me', authenticate, (req: any, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: serializeUser(user), apps: buildAppsForUser(user.id) });
});

app.get('/api/me', authenticate, (req: any, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: serializeUser(user), apps: buildAppsForUser(user.id), providerGrants: buildProviderGrantsForUser(user.id) });
});

app.post('/api/auth/refresh', authenticate, (req: any, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = signSession(user);
  setSessionCookie(res, token);
  res.json({ token, user: serializeUser(user), apps: buildAppsForUser(user.id) });
});

app.get('/api/session/bridge', authenticate, (req: any, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const token = jwt.sign({ id: user.id, username: user.username, email: user.email, bridge: true }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    token,
    user: serializeUser(user),
    apps: buildAppsForUser(user.id),
    providerGrants: buildProviderGrantsForUser(user.id),
  });
});

app.post('/api/auth/claim-imported', authenticate, async (req: any, res) => {
  const password = String(req.body?.password || '');
  if (password.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });
  const current = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id) as any;
  if (!current) return res.status(404).json({ error: 'User not found' });
  if (current.password_hash !== 'SYSTEM_NO_LOGIN') {
    return res.status(409).json({ error: 'This SPMT account already has sign-in credentials' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?')
    .run(passwordHash, req.user.id, 'SYSTEM_NO_LOGIN');
  const user = getUserById(req.user.id);
  const token = signSession(user);
  setSessionCookie(res, token);
  res.json({ claimed: true, token, user: serializeUser(user), recoveryCode: createRecoveryCode(user.id) });
});

app.get('/api/provider-grants', authenticate, (req: any, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ grants: buildProviderGrantsForUser(user.id), user: serializeUser(user) });
});

app.post('/api/provider-grants/:grantId/status', authenticate, (req: any, res) => {
  const grant = upsertProviderGrant(req.user.id, req.params.grantId, String(req.body?.status || 'pending'), {
    source: 'manual-status',
    updatedBy: req.user.username,
  });
  if (!grant) return res.status(404).json({ error: 'Unknown provider grant' });
  createNotification(req.user.id, `${grant.displayName} marked ${grant.status}`, 'SPMT updated this provider connection state.', {
    type: 'provider-grant',
    sourceApp: 'spmt',
    linkUrl: '/?view=connections',
  });
  res.json({ ok: true, grant });
});

app.get('/api/provider-grants/:grantId/authorize', authenticate, (req: any, res) => {
  const grant = upsertProviderGrant(req.user.id, req.params.grantId, 'pending', {
    source: 'authorize-start',
    returnTo: req.query.returnTo || null,
  }) as any;
  if (!grant) return res.status(404).json({ error: 'Unknown provider grant' });
  const redirectUrl = grant.legacyAuthorizeUrl || '/?view=connections';
  res.redirect(redirectUrl);
});

// ─── User: Link Discord/Twitch ───
app.post('/api/user/link', authenticate, async (req: any, res) => {
  try {
    const { discordUsername, twitchUsername } = req.body;

  const existingLinks = db.prepare('SELECT discord_username, discord_id FROM users WHERE id = ?').get(req.user.id) as any;
  let resolvedDiscordId: string | null = null;
  let resolvedAvatarUrl: string | null = null;
  let discordVerification = 'not_requested';
  const cleanDiscord = (discordUsername || '').trim().replace(/^@/, '');
  if (cleanDiscord) discordVerification = 'unavailable';
  if (cleanDiscord && process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_GUILD_ID) {
    try {
      const searchRes = await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/search?query=${encodeURIComponent(cleanDiscord)}&limit=100`, {
        headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      });
      if (searchRes.ok) {
        const members = await searchRes.json() as any[];
        const exactMember = Array.isArray(members)
          ? members.find((member) => String(member?.user?.username || '').trim().toLowerCase() === cleanDiscord.toLowerCase())
          : null;
        resolvedDiscordId = exactMember?.user?.id ? String(exactMember.user.id) : null;
        const discordAvatar = String(exactMember?.user?.avatar || '');
        if (resolvedDiscordId && discordAvatar) {
          const ext = discordAvatar.startsWith('a_') ? 'gif' : 'png';
          resolvedAvatarUrl = `https://cdn.discordapp.com/avatars/${resolvedDiscordId}/${discordAvatar}.${ext}`;
        }
        discordVerification = resolvedDiscordId ? 'verified' : 'not_found';
      }
    } catch {}
  }
  const sameDiscordUsername = cleanDiscord
    && String(existingLinks?.discord_username || '').trim().toLowerCase() === cleanDiscord.toLowerCase();
  const discordId = resolvedDiscordId
    || (discordVerification === 'unavailable' && sameDiscordUsername ? String(existingLinks?.discord_id || '') || null : null);
  if (discordId && discordVerification === 'unavailable') discordVerification = 'retained';

  let twitchId: string | null = null;
  const cleanTwitch = (twitchUsername || '').trim().toLowerCase();
  if (cleanTwitch && process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN) {
    try {
      const twitchRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cleanTwitch)}`, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
        },
      });
      if (twitchRes.ok) {
        const data = await twitchRes.json();
        if (data.data?.length > 0) {
          twitchId = data.data[0].id;
          if (!resolvedAvatarUrl) resolvedAvatarUrl = data.data[0].profile_image_url || null;
        }
      }
    } catch {}
  }

  const updates: string[] = [];
  const params: any[] = [];
  if (cleanDiscord) {
    updates.push('discord_username = ?', 'discord_id = ?');
    params.push(cleanDiscord, discordId);
  }
  if (cleanTwitch) { updates.push('twitch_username = ?'); params.push(cleanTwitch); }
  if (twitchId) { updates.push('twitch_id = ?'); params.push(twitchId); }
  if (resolvedAvatarUrl) { updates.push('avatar_url = ?'); params.push(resolvedAvatarUrl); }

  if (updates.length > 0) {
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  res.json({
    ok: true,
    discordId,
    discordVerified: Boolean(discordId),
    discordVerification,
    twitchId,
    discordUsername: cleanDiscord,
    twitchUsername: cleanTwitch,
  });
  } catch (err: any) {
    console.error('Link failed:', err);
    res.status(500).json({ error: 'Link failed: ' + (err.message || 'unknown error') });
  }
});

app.get('/api/linked-accounts', authenticate, (req: any, res) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    accounts: [
      {
        platform: 'discord',
        username: user.discord_username,
        externalId: user.discord_id,
        linked: Boolean(user.discord_username || user.discord_id),
      },
      {
        platform: 'twitch',
        username: user.twitch_username,
        externalId: user.twitch_id,
        linked: Boolean(user.twitch_username || user.twitch_id),
      },
    ],
    user: serializeUser(user),
  });
});

app.put('/api/linked-accounts', authenticate, async (req: any, res) => {
  const updates: string[] = [];
  const values: any[] = [];
  const discordUsername = req.body?.discord?.username ?? req.body?.discordUsername;
  const twitchUsername = req.body?.twitch?.username ?? req.body?.twitchUsername;

  if (discordUsername !== undefined) {
    const cleanDiscord = String(discordUsername || '').trim().replace(/^@/, '');
    updates.push('discord_username = ?', 'discord_id = NULL');
    values.push(cleanDiscord || null);
  }
  if (twitchUsername !== undefined) {
    const cleanTwitch = String(twitchUsername || '').trim().toLowerCase().replace(/^@/, '');
    updates.push('twitch_username = ?', 'twitch_id = NULL');
    values.push(cleanTwitch || null);
  }

  if (!updates.length) return res.status(400).json({ error: 'No linked account fields provided' });

  values.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const user = getUserById(req.user.id);
  res.json({ ok: true, user: serializeUser(user) });
});

app.delete('/api/linked-accounts/:platform', authenticate, (req: any, res) => {
  const platform = String(req.params.platform || '').toLowerCase();
  if (!['discord', 'twitch'].includes(platform)) {
    return res.status(400).json({ error: 'Platform must be discord or twitch' });
  }

  if (platform === 'discord') {
    db.prepare('UPDATE users SET discord_username = NULL, discord_id = NULL WHERE id = ?').run(req.user.id);
  } else {
    db.prepare('UPDATE users SET twitch_username = NULL, twitch_id = NULL WHERE id = ?').run(req.user.id);
  }

  const user = getUserById(req.user.id);
  res.json({ ok: true, user: serializeUser(user) });
});

// ─── User: Lookup by username, discord_id, or twitch_id ───
app.get('/api/user/lookup', (req, res) => {
  const { username, discord_id, twitch_id } = req.query;
  let user: any = null;
  if (username) user = db.prepare('SELECT id, username, display_name, discord_id, twitch_id, twitch_username, discord_username FROM users WHERE username = ?').get(username);
  else if (discord_id) user = db.prepare('SELECT id, username, display_name, discord_id, twitch_id, twitch_username, discord_username FROM users WHERE discord_id = ?').get(discord_id);
  else if (twitch_id) user = db.prepare('SELECT id, username, display_name, discord_id, twitch_id, twitch_username, discord_username FROM users WHERE twitch_id = ?').get(twitch_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── OAuth2: Authorize (simplified) ───
// Other apps redirect here: GET /api/oauth/authorize?client_id=X&redirect_uri=Y&state=Z
app.get('/api/oauth/authorize', (req: any, res) => {
  const { client_id, redirect_uri, state } = req.query;
  if (!client_id || !redirect_uri) return res.status(400).json({ error: 'client_id and redirect_uri required' });

  // Check if user is authenticated
  const token = req.cookies?.spmt_token || req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  let user: any = null;
  if (token) {
    try {
      user = jwt.verify(token, JWT_SECRET) as any;
    } catch {}
  }

  // If not logged in, redirect to login page with return params
  if (!user) {
    const returnUrl = `/api/oauth/authorize?client_id=${encodeURIComponent(client_id as string)}&redirect_uri=${encodeURIComponent(redirect_uri as string)}${state ? `&state=${encodeURIComponent(state as string)}` : ''}`;
    return res.redirect(`/?return=${encodeURIComponent(returnUrl)}`);
  }

  // Verify client
  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(client_id) as any;
  if (!client) return res.status(404).json({ error: 'Unknown client' });
  if (!client.redirect_uris.split(',').includes(redirect_uri)) return res.status(400).json({ error: 'Invalid redirect_uri' });

  // Generate authorization code
  const code = uuidv4();
  db.prepare('INSERT INTO oauth_codes (code, user_id, client_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(code, user.id, client_id, redirect_uri, new Date(Date.now() + 5 * 60 * 1000).toISOString());

  const bridgeToken = jwt.sign({ id: user.id, username: user.username, email: user.email, client_id, bridge: true }, JWT_SECRET, { expiresIn: '7d' });
  const codeOnlyClients = new Set(['mountainview', 'spacemountain-live', 'discord-stream-hub', 'hearmeout']);
  const tokenParameter = codeOnlyClients.has(String(client_id)) ? '' : `&token=${encodeURIComponent(bridgeToken)}`;
  const url = `${redirect_uri}?code=${code}${tokenParameter}${state ? `&state=${encodeURIComponent(state as string)}` : ''}`;
  res.redirect(url);
});

// ─── OAuth2: Token exchange ───
app.post('/api/oauth/token', (req, res) => {
  const { code, client_id, client_secret, redirect_uri } = req.body;
  if (!code || !client_id || !client_secret) return res.status(400).json({ error: 'Missing fields' });

  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ? AND client_secret = ?').get(client_id, client_secret) as any;
  if (!client) return res.status(401).json({ error: 'Invalid client credentials' });

  const authCode = db.prepare('SELECT * FROM oauth_codes WHERE code = ? AND client_id = ? AND redirect_uri = ?').get(code, client_id, redirect_uri) as any;
  if (!authCode) return res.status(400).json({ error: 'Invalid code' });
  if (new Date(authCode.expires_at) < new Date()) return res.status(400).json({ error: 'Code expired' });

  // Delete used code
  db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(code);

  const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(authCode.user_id) as any;
  const access_token = jwt.sign({ id: user.id, username: user.username, email: user.email, client_id, is_admin: Boolean(user.is_admin) }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ access_token, token_type: 'Bearer', expires_in: 7 * 24 * 3600, user: serializeUser(user) });
});

// ─── OAuth2: User info (for apps to verify tokens) ───
app.get('/api/oauth/userinfo', authenticate, (req: any, res) => {
  const user = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(serializeUser(user));
});

// ─── Messaging: Send ───
app.post('/api/messages', authenticate, (req: any, res) => {
  const { to, subject, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'Recipient and body required' });

  const recipient = findUserByHandle(to);
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

  const id = uuidv4();
  const now = new Date().toISOString();
  const conversationId = req.body?.conversationId || ensureDirectConversation(req.user.id, recipient.id, now);
  const attachments = normalizeAttachments(req.body?.attachments);
  const mentionedUsers = extractMentionedUsers(body, req.body?.mentions);
  db.prepare(`
    INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, metadata, attachments, mentioned_users, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, recipient.id, conversationId, subject || '', body, req.body?.channel || 'direct', req.body?.messageType || 'direct', req.body?.metadata ? JSON.stringify(req.body.metadata) : null, attachments, mentionedUsers, now);

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
  createNotification(recipient.id, subject || `Message from ${req.user.username}`, body.slice(0, 180), {
    type: 'message',
    sourceApp: req.body?.sourceApp || 'spmt',
    linkUrl: `/messages/${conversationId}`,
  });

  res.status(201).json({ id, sent: true, conversationId });
});

app.get('/api/messages', authenticate, (req: any, res) => {
  const filters: string[] = ['(m.from_id = ? OR m.to_id = ?)'];
  const values: any[] = [req.user.id, req.user.id];
  if (req.query.unread === 'true') {
    filters.push('m.to_id = ? AND m.read_at IS NULL');
    values.push(req.user.id);
  }
  if (req.query.type) {
    filters.push('m.message_type = ?');
    values.push(String(req.query.type));
  }
  if (req.query.q) {
    filters.push('(m.subject LIKE ? OR m.body LIKE ?)');
    values.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }

  values.push(Math.min(Number(req.query.limit || 100) || 100, 200));
  const messages = db.prepare(`
    SELECT m.id, m.conversation_id, m.subject, m.body, m.channel, m.message_type, m.metadata, m.attachments, m.mentioned_users, m.created_at, m.read_at,
      from_user.username as from_user, from_user.display_name as from_name,
      to_user.username as to_user, to_user.display_name as to_name
    FROM messages m
    JOIN users from_user ON m.from_id = from_user.id
    JOIN users to_user ON m.to_id = to_user.id
    WHERE ${filters.join(' AND ')}
    ORDER BY datetime(m.created_at) DESC
    LIMIT ?
  `).all(...values);
  res.json({ messages });
});

// ─── Messaging: Inbox ───
app.get('/api/messages/inbox', authenticate, (req: any, res) => {
  const messages = db.prepare(`
    SELECT m.id, m.subject, m.body, m.created_at, m.read_at, m.channel, m.message_type, m.attachments, m.mentioned_users, u.username as from_user, u.display_name as from_name
    FROM messages m JOIN users u ON m.from_id = u.id
    WHERE m.to_id = ? ORDER BY m.created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(messages);
});

// ─── Messaging: Sent ───
app.get('/api/messages/sent', authenticate, (req: any, res) => {
  const messages = db.prepare(`
    SELECT m.id, m.subject, m.body, m.created_at, m.read_at, m.channel, m.message_type, m.attachments, m.mentioned_users, u.username as to_user, u.display_name as to_name
    FROM messages m JOIN users u ON m.to_id = u.id
    WHERE m.from_id = ? ORDER BY m.created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(messages);
});

app.post('/api/messages/:id/read', authenticate, (req: any, res) => {
  const result = db.prepare('UPDATE messages SET read_at = ? WHERE id = ? AND to_id = ?')
    .run(new Date().toISOString(), req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true });
});

app.get('/api/conversations', authenticate, (req: any, res) => {
  const conversations = db.prepare(`
    SELECT c.id, c.title, c.type, c.created_at, c.updated_at,
      (
        SELECT body FROM messages
        WHERE conversation_id = c.id
        ORDER BY datetime(created_at) DESC LIMIT 1
      ) as last_message,
      (
      SELECT COUNT(*) FROM messages
        WHERE conversation_id = c.id AND to_id = ? AND read_at IS NULL
      ) as unread_count
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY datetime(c.updated_at) DESC
    LIMIT 100
  `).all(req.user.id, req.user.id);
  res.json({ conversations });
});

app.post('/api/conversations', authenticate, (req: any, res) => {
  const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [req.body?.to].filter(Boolean);
  const members = recipients.map(findUserByHandle).filter(Boolean) as any[];
  if (!members.length) return res.status(400).json({ error: 'At least one valid recipient is required' });

  const now = new Date().toISOString();
  const type = members.length === 1 ? 'direct' : 'group';
  const conversationId = type === 'direct'
    ? ensureDirectConversation(req.user.id, members[0].id, now)
    : uuidv4();

  if (type === 'group') {
    db.prepare('INSERT INTO conversations (id, title, type, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(conversationId, String(req.body?.title || 'Group conversation').slice(0, 120), 'group', req.user.id, now, now);
    db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
      .run(conversationId, req.user.id, 'owner', now);
    for (const member of members) {
      db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
        .run(conversationId, member.id, 'member', now);
    }
  }

  res.status(201).json({ id: conversationId, type });
});

app.get('/api/conversations/:id/messages', authenticate, (req: any, res) => {
  const membership = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!membership) return res.status(404).json({ error: 'Conversation not found' });

  const messages = db.prepare(`
    SELECT m.id, m.subject, m.body, m.channel, m.message_type, m.metadata, m.attachments, m.mentioned_users, m.created_at, m.read_at,
      from_user.username as from_user, from_user.display_name as from_name,
      to_user.username as to_user, to_user.display_name as to_name
    FROM messages m
    JOIN users from_user ON m.from_id = from_user.id
    JOIN users to_user ON m.to_id = to_user.id
    WHERE m.conversation_id = ?
    ORDER BY datetime(m.created_at) ASC
    LIMIT 200
  `).all(req.params.id);
  res.json({ messages });
});

app.post('/api/conversations/:id/messages', authenticate, (req: any, res) => {
  const membership = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!membership) return res.status(404).json({ error: 'Conversation not found' });
  if (!req.body?.body) return res.status(400).json({ error: 'Body required' });

  const members = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?')
    .all(req.params.id, req.user.id) as any[];
  if (!members.length) return res.status(400).json({ error: 'Conversation has no recipients' });

  const now = new Date().toISOString();
  const ids = [];
  const attachments = normalizeAttachments(req.body?.attachments);
  const mentionedUsers = extractMentionedUsers(req.body.body, req.body?.mentions);
  for (const member of members) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, metadata, attachments, mentioned_users, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, member.user_id, req.params.id, req.body?.subject || '', req.body.body, req.body?.channel || 'conversation', req.body?.messageType || 'conversation', req.body?.metadata ? JSON.stringify(req.body.metadata) : null, attachments, mentionedUsers, now);
    createNotification(member.user_id, req.body?.subject || `Message from ${req.user.username}`, String(req.body.body).slice(0, 180), {
      type: 'message',
      sourceApp: req.body?.sourceApp || 'spmt',
      linkUrl: `/messages/${req.params.id}`,
    });
    ids.push(id);
  }

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.status(201).json({ sent: true, ids });
});

app.post('/api/conversations/:id/read', authenticate, (req: any, res) => {
  const now = new Date().toISOString();
  const membership = db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?')
    .run(now, req.params.id, req.user.id);
  if (!membership.changes) return res.status(404).json({ error: 'Conversation not found' });
  db.prepare('UPDATE messages SET read_at = COALESCE(read_at, ?) WHERE conversation_id = ? AND to_id = ?')
    .run(now, req.params.id, req.user.id);
  res.json({ ok: true, readAt: now });
});

app.get('/api/notifications', authenticate, (req: any, res) => {
  const limit = Math.min(Number(req.query.limit || 50) || 50, 100);
  const notifications = db.prepare(`
    SELECT id, type, title, body, source_app, link_url, read_at, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(req.user.id, limit);
  res.json({ notifications });
});

app.post('/api/notifications/:id/read', authenticate, (req: any, res) => {
  const result = db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?')
    .run(new Date().toISOString(), req.params.id, req.user.id);
  if (!result.changes) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', authenticate, (req: any, res) => {
  const readAt = new Date().toISOString();
  const result = db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?')
    .run(readAt, req.user.id);
  res.json({ ok: true, updated: result.changes, readAt });
});

type StoredWorkspaceProfile = {
  profile: WorkspaceProfileV1;
  created: boolean;
};

function workspaceProfileEtag(revision: number) {
  return `"workspace-${revision}"`;
}

function sendWorkspaceProfile(res: express.Response, stored: StoredWorkspaceProfile, extra: Record<string, unknown> = {}) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('ETag', workspaceProfileEtag(stored.profile.revision));
  res.json({ profile: stored.profile, created: stored.created, ...extra });
}

function getOrCreateWorkspaceProfile(userId: string): StoredWorkspaceProfile {
  const row = db.prepare(`
    SELECT schema_version, revision, profile, created_at, updated_at
    FROM workspace_profiles
    WHERE user_id = ?
  `).get(userId) as any;

  if (row) {
    let parsed: any;
    try {
      parsed = JSON.parse(row.profile);
    } catch {
      throw Object.assign(new Error('Stored workspace profile JSON is invalid'), { statusCode: 500 });
    }
    const fallback = createDefaultWorkspaceProfile(row.updated_at);
    const validation = validateWorkspaceProfile({
      ...parsed,
      schemaVersion: Number(row.schema_version),
      revision: Number(row.revision),
      updatedAt: row.updated_at,
    }, fallback);
    if (Object.keys(validation.fields).length) {
      throw Object.assign(new Error('Stored workspace profile failed validation'), { statusCode: 500 });
    }
    return {
      created: false,
      profile: {
        ...validation.profile,
        revision: Number(row.revision),
        updatedAt: row.updated_at,
      },
    };
  }

  const now = new Date().toISOString();
  const settings = db.prepare('SELECT theme FROM user_settings WHERE user_id = ?').get(userId) as any;
  const profile = createDefaultWorkspaceProfile(now, String(settings?.theme || 'solar-flare'));
  db.prepare(`
    INSERT INTO workspace_profiles (user_id, schema_version, revision, profile, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, profile.schemaVersion, profile.revision, JSON.stringify(profile), now, now);
  return { profile, created: true };
}

function expectedWorkspaceRevision(req: express.Request) {
  const ifMatch = String(req.header('if-match') || '').trim();
  const match = ifMatch.match(/^(?:W\/)?"workspace-(\d+)"$/);
  if (match) return Number(match[1]);
  const bodyRevision = Number(req.body?.revision ?? req.body?.profile?.revision);
  return Number.isInteger(bodyRevision) && bodyRevision >= 1 ? bodyRevision : null;
}

function changedWorkspaceSections(previous: WorkspaceProfileV1, next: WorkspaceProfileV1) {
  return ['appearance', 'dockSlots', 'activeOverlaySceneId', 'ttsSubscriptions', 'appThemeMappings']
    .filter((key) => JSON.stringify((previous as any)[key]) !== JSON.stringify((next as any)[key]));
}

function updateWorkspaceProfile(userId: string, input: any, expectedRevision: number, mode: 'replace' | 'patch') {
  const current = getOrCreateWorkspaceProfile(userId).profile;
  if (current.revision !== expectedRevision) {
    return { conflict: true as const, current };
  }

  const candidate = mode === 'patch' ? mergeWorkspaceProfile(current, input) : input;
  const validation = validateWorkspaceProfile(candidate, current);
  if (Object.keys(validation.fields).length) {
    return { invalid: true as const, fields: validation.fields };
  }

  const updatedAt = new Date().toISOString();
  const profile: WorkspaceProfileV1 = {
    ...validation.profile,
    schemaVersion: 1,
    revision: current.revision + 1,
    updatedAt,
  };
  const result = db.prepare(`
    UPDATE workspace_profiles
    SET schema_version = ?, revision = ?, profile = ?, updated_at = ?
    WHERE user_id = ? AND revision = ?
  `).run(profile.schemaVersion, profile.revision, JSON.stringify(profile), updatedAt, userId, current.revision);
  if (result.changes !== 1) {
    return { conflict: true as const, current: getOrCreateWorkspaceProfile(userId).profile };
  }

  const changed = changedWorkspaceSections(current, profile);
  try {
    createPlatformEvent({
      type: 'workspace.profile.updated',
      sourceApp: 'spmt',
      visibility: 'private',
      payload: {
        revision: profile.revision,
        changed,
        notify: false,
        athenaMemory: false,
      },
    }, userId);
  } catch (error) {
    console.error('Workspace profile event could not be recorded:', error);
  }

  return { profile, changed };
}

function handleWorkspaceProfileWrite(req: any, res: express.Response, mode: 'replace' | 'patch') {
  const expectedRevision = expectedWorkspaceRevision(req);
  if (expectedRevision === null) {
    return res.status(428).json({ error: 'If-Match or the current profile revision is required' });
  }
  const input = req.body?.profile ?? req.body;
  const result = updateWorkspaceProfile(req.user.id, input, expectedRevision, mode);
  if ('conflict' in result) {
    const current = result.current || getOrCreateWorkspaceProfile(req.user.id).profile;
    res.setHeader('ETag', workspaceProfileEtag(current.revision));
    return res.status(409).json({ error: 'Workspace profile revision conflict', profile: current });
  }
  if ('invalid' in result) {
    return res.status(400).json({ error: 'Workspace profile validation failed', fields: result.fields });
  }
  return sendWorkspaceProfile(res, { profile: result.profile, created: false }, { changed: result.changed });
}

app.get('/api/workspace-profile', authenticate, (req: any, res) => {
  try {
    sendWorkspaceProfile(res, getOrCreateWorkspaceProfile(req.user.id));
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Workspace profile could not be loaded' });
  }
});

app.get('/api/workspace-profile/export', authenticate, (req: any, res) => {
  try {
    const stored = getOrCreateWorkspaceProfile(req.user.id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="spmt-workspace-profile-v1.json"');
    res.json({ profile: stored.profile, exportedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Workspace profile could not be exported' });
  }
});

app.put('/api/workspace-profile', authenticate, (req: any, res) => {
  handleWorkspaceProfileWrite(req, res, 'replace');
});

app.patch('/api/workspace-profile', authenticate, (req: any, res) => {
  handleWorkspaceProfileWrite(req, res, 'patch');
});

app.post('/api/workspace-profile/import', authenticate, (req: any, res) => {
  handleWorkspaceProfileWrite(req, res, 'replace');
});

app.post('/api/workspace-profile/reset', authenticate, (req: any, res) => {
  const expectedRevision = expectedWorkspaceRevision(req);
  if (expectedRevision === null) {
    return res.status(428).json({ error: 'If-Match or the current profile revision is required' });
  }
  const current = getOrCreateWorkspaceProfile(req.user.id).profile;
  if (current.revision !== expectedRevision) {
    res.setHeader('ETag', workspaceProfileEtag(current.revision));
    return res.status(409).json({ error: 'Workspace profile revision conflict', profile: current });
  }
  const reset = createDefaultWorkspaceProfile(new Date().toISOString());
  const result = updateWorkspaceProfile(req.user.id, reset, expectedRevision, 'replace');
  if ('conflict' in result) return res.status(409).json({ error: 'Workspace profile revision conflict', profile: result.current });
  if ('invalid' in result) return res.status(500).json({ error: 'Default workspace profile failed validation', fields: result.fields });
  return sendWorkspaceProfile(res, { profile: result.profile, created: false }, { reset: true, changed: result.changed });
});

function validateRecordSlug(value: unknown, label: string) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(slug)) {
    throw Object.assign(new Error(`${label} must be a lowercase slug using letters, numbers, or hyphens`), { statusCode: 400 });
  }
  return slug;
}

function assertPublicAppState(value: unknown, path = 'data') {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return;
  if (typeof value === 'string') {
    if (value.length > 20_000) throw Object.assign(new Error(`${path} is too large`), { statusCode: 400 });
    try {
      const url = new URL(value);
      for (const key of url.searchParams.keys()) {
        if (/(?:token|secret|password|session|api[_-]?key|authorization)/i.test(key)) {
          throw Object.assign(new Error(`${path} contains a sensitive URL parameter`), { statusCode: 400 });
        }
      }
    } catch (error: any) {
      if (error?.statusCode) throw error;
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 500) throw Object.assign(new Error(`${path} has too many items`), { statusCode: 400 });
    value.forEach((item, index) => assertPublicAppState(item, `${path}.${index}`));
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 250) throw Object.assign(new Error(`${path} has too many fields`), { statusCode: 400 });
    for (const [key, child] of entries) {
      const normalizedKey = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      if (/(^|[-_])(access-token|refresh-token|auth-token|authorization|password|secret|client-secret|api-key|session-token)([-_]|$)/.test(normalizedKey)) {
        throw Object.assign(new Error(`${path}.${key} is a secret-bearing field and cannot be stored as app state`), { statusCode: 400 });
      }
      assertPublicAppState(child, `${path}.${key}`);
    }
    return;
  }
  throw Object.assign(new Error(`${path} contains an unsupported value`), { statusCode: 400 });
}

function appStateEtag(appId: string, namespace: string, revision: number) {
  return `"app-state-${appId}-${namespace}-${revision}"`;
}

app.get('/api/app-state/:appId/:namespace', authenticate, (req: any, res) => {
  try {
    const appId = validateRecordSlug(req.params.appId, 'appId');
    const namespace = validateRecordSlug(req.params.namespace, 'namespace');
    const row = db.prepare(`
      SELECT schema_version, revision, data_json, created_at, updated_at
      FROM app_state_records WHERE user_id = ? AND app_id = ? AND namespace = ?
    `).get(req.user.id, appId, namespace) as any;
    if (!row) return res.status(404).json({ error: 'App state record not found', appId, namespace });
    res.setHeader('ETag', appStateEtag(appId, namespace, row.revision));
    res.json({ appId, namespace, schemaVersion: row.schema_version, revision: row.revision, data: JSON.parse(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'App state could not be loaded' });
  }
});

app.put('/api/app-state/:appId/:namespace', authenticate, (req: any, res) => {
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

app.get('/api/xp', authenticate, (req: any, res) => {
  const balance = db.prepare('SELECT COALESCE(SUM(delta), 0) AS xp FROM xp_ledger WHERE user_id = ?').get(req.user.id) as any;
  const entries = db.prepare('SELECT id, source_app, event_type, delta, metadata_json, created_at FROM xp_ledger WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 100').all(req.user.id) as any[];
  const xp = Number(balance?.xp || 0);
  res.json({ xp, level: Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1, entries: entries.map((entry) => ({ id: entry.id, sourceApp: entry.source_app, eventType: entry.event_type, delta: entry.delta, metadata: JSON.parse(entry.metadata_json), createdAt: entry.created_at })) });
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`spmt.live running on http://localhost:${PORT}`);
});
