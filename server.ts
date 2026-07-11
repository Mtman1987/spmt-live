import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : 'spmt-dev-secret-change-in-production');
const CORS_ORIGINS = (process.env.CORS_ORIGINS || [
  'https://spacemountain.live',
  'https://spacemountain-live.fly.dev',
  'https://discord-stream-hub-new.fly.dev',
  'https://streamweaver-new.fly.dev',
  'https://chat-tag-new.fly.dev',
  'https://hearmeout-main.fly.dev',
].join(',')).split(',');

const SUITE_APPS = [
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
];

const ATHENA_SKILLS = [
  { id: 'command-routing', name: 'Command Routing', description: 'Routes creator commands to apps, dock slots, Commlink, forums, and rooms.', phase: 'core' },
  { id: 'shared-memory', name: 'Shared Memory', description: 'Stores user and app context for reuse across the ecosystem.', phase: 'core' },
  { id: 'creator-copilot', name: 'Creator Copilot', description: 'Turns creator goals into launch, message, forum, and automation actions.', phase: 'assistant' },
  { id: 'voice-control', name: 'Voice Control', description: 'Accepts voice transcripts and maps them to Command Bridge actions.', phase: 'assistant' },
];

const ATHENA_CREW = [
  { id: 'athena', name: 'Athena Core', role: 'orchestrator', status: 'online' },
  { id: 'atlas', name: 'Atlas', role: 'app awareness', status: 'ready' },
  { id: 'echo', name: 'Echo', role: 'voice and conversation', status: 'ready' },
  { id: 'forge', name: 'Forge', role: 'automation and plugins', status: 'ready' },
];

const AUTOMATION_RECIPES = [
  { id: 'live-creator-brief', name: 'Live Creator Brief', trigger: 'stream-start', action: 'summarize apps, forums, notifications, and shoutouts' },
  { id: 'dock-workspace', name: 'Dock Workspace', trigger: 'voice-command', action: 'open the requested app into the active dock slot' },
  { id: 'community-followup', name: 'Community Follow-up', trigger: 'forum-or-message', action: 'route reply drafts through Commlink' },
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

const PLATFORM_SCOPES = ['identity:read', 'apps:read', 'apps:write', 'messages:read', 'messages:write', 'athena:write', 'events:write', 'webhooks:write'];

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

const USER_COLUMNS = 'id, username, email, display_name, discord_username, discord_id, twitch_username, twitch_id, created_at';

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeScopes(value: unknown) {
  const requested = Array.isArray(value) ? value.map(String) : [];
  const scopes = requested.length ? requested : ['identity:read', 'apps:read', 'messages:write'];
  return Array.from(new Set(scopes.filter((scope) => PLATFORM_SCOPES.includes(scope))));
}

function serializeUser(user: any) {
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
  };
  return base[appId] || ['identity:read'];
}

function buildAppsForUser(userId?: string) {
  const installs = userId
    ? db.prepare('SELECT app_id, enabled, installed_at FROM app_installs WHERE user_id = ?').all(userId) as any[]
    : [];
  const installMap = new Map(installs.map((row) => [row.app_id, row]));

  return SUITE_APPS.map((app) => {
    const installed = app.id === 'spacemountain-live' ? true : Boolean(installMap.get(app.id));
    const install = installMap.get(app.id);
    return {
      ...app,
      installed,
      enabled: app.id === 'spacemountain-live' ? true : Boolean(install?.enabled),
      installedAt: install?.installed_at || (app.id === 'spacemountain-live' ? 'first-party' : null),
      permissions: appPermissionsFor(app.id),
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

  if (event.createdBy && ['private', 'creator', 'community'].includes(event.visibility)) {
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
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-spmt-key');
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

function authenticatePlatformKey(requiredScope: string) {
  return (req: any, res: any, next: any) => {
    const token = String(req.headers.authorization?.replace('Bearer ', '') || req.body?.token || req.query?.token || '').trim();
    if (!token) return res.status(401).json({ error: 'Platform API key required' });

    const row = db.prepare(`
      SELECT id, user_id, name, key_prefix, scopes
      FROM developer_api_keys
      WHERE key_hash = ? AND revoked_at IS NULL
    `).get(hashSecret(token)) as any;
    if (!row) return res.status(401).json({ error: 'Invalid platform API key' });

    const scopes = JSON.parse(row.scopes || '[]');
    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
    }

    db.prepare('UPDATE developer_api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    req.platformKey = { id: row.id, userId: row.user_id, name: row.name, keyPrefix: row.key_prefix, scopes };
    next();
  };
}

// ─── Health ───
app.get('/api/health', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE password_hash != ?').get('SYSTEM_NO_LOGIN') as any;
  res.json({ status: 'ok', app: 'spmt-live', uptime: process.uptime(), users: userCount?.count || 0 });
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
    status: 'online',
    capabilities: {
      sharedMemory: true,
      appAwareness: true,
      voiceControl: true,
      automation: true,
      multiAgentCrew: true,
      crossAppContext: true,
      creatorAssistant: true,
      aiSkills: true,
      aiMarketplace: true,
    },
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
  res.json({ skills: ATHENA_SKILLS, marketplace: ATHENA_SKILLS.map((skill) => ({ ...skill, installable: true })) });
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

  const lower = command.toLowerCase();
  const target = lower.includes('forum') ? 'forums'
    : lower.includes('inbox') || lower.includes('message') ? 'commlink'
    : lower.includes('app') || lower.includes('shipyard') ? 'shipyard'
    : lower.includes('voice') ? 'voice'
    : 'command-bridge';
  const now = new Date().toISOString();
  const botUser = ensureSystemUser('athena', 'Athena Core');
  const conversationId = ensureDirectConversation(req.user.id, botUser.id, now);
  const messageId = uuidv4();
  const memoryId = uuidv4();

  db.prepare('UPDATE conversations SET title = COALESCE(title, ?), type = ?, updated_at = ? WHERE id = ?')
    .run('Athena Core conversation', 'ai', now, conversationId);
  db.prepare(`
    INSERT INTO messages (id, from_id, to_id, conversation_id, subject, body, channel, message_type, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    req.user.id,
    botUser.id,
    conversationId,
    'Athena command',
    command,
    'ai',
    'ai_prompt',
    JSON.stringify({ target, routedBy: 'athena-os' }),
    now
  );
  db.prepare(`
    INSERT INTO athena_memory (id, user_id, scope, topic, content, source_app, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(memoryId, req.user.id, 'command', `Routed to ${target}`, command, 'athena-os', now, now);

  res.json({
    routed: true,
    target,
    command,
    conversationId,
    messageId,
    memoryId,
    context: {
      apps: buildAppsForUser(req.user.id).length,
      skills: ATHENA_SKILLS.length,
      crew: ATHENA_CREW.length,
    },
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
    package: '@spacemountain/sdk',
    version: '0.1.0',
    install: 'npm install @spacemountain/sdk',
    example: "const client = new SpaceMountain({ token }); await client.apps.list();",
    modules: ['identity', 'apps', 'events', 'commlink', 'athena', 'webhooks'],
  });
});

app.get('/api/platform/docs', (req, res) => {
  res.json({
    sections: [
      { id: 'auth', title: 'OAuth Apps', path: '/docs/oauth', summary: 'Use SPMT OAuth to let ecosystem apps share identity without duplicate accounts.', endpoints: ['/api/oauth/authorize', '/api/oauth/token', '/api/oauth/userinfo'] },
      { id: 'apps', title: 'App Registry', path: '/docs/apps', summary: 'Read, install, disable, launch, and version registered apps.', endpoints: ['/api/apps', '/api/apps/:appId', '/api/apps/:appId/versions'] },
      { id: 'commlink', title: 'Commlink API', path: '/docs/commlink', summary: 'Send messages, create conversations, post voice metadata, and search communication records.', endpoints: ['/api/messages', '/api/conversations', '/api/voice-messages', '/api/search'] },
      { id: 'athena', title: 'Athena OS', path: '/docs/athena', summary: 'Route commands, store memory, list skills, and coordinate the AI crew.', endpoints: ['/api/athena/os', '/api/athena/context', '/api/athena/commands', '/api/athena/memory'] },
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
    SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
    FROM developer_api_keys
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(req.user.id);
  res.json({ keys });
});

app.post('/api/platform/api-keys', authenticate, (req: any, res) => {
  const name = String(req.body?.name || 'Default platform key').trim();
  const scopes = normalizeScopes(req.body?.scopes);
  if (!scopes.length) return res.status(400).json({ error: 'At least one valid scope is required' });
  const id = uuidv4();
  const token = `spmt_${uuidv4().replace(/-/g, '')}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO developer_api_keys (id, user_id, name, key_prefix, key_hash, scopes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, name, token.slice(0, 12), hashSecret(token), JSON.stringify(scopes), now);
  res.status(201).json({ id, name, token, scopes, createdAt: now });
});

app.post('/api/platform/api-keys/verify', (req, res) => {
  const token = String(req.body?.token || req.headers.authorization?.replace('Bearer ', '') || '').trim();
  if (!token) return res.status(400).json({ error: 'token required' });
  const row = db.prepare(`
    SELECT id, user_id, name, key_prefix, scopes
    FROM developer_api_keys
    WHERE key_hash = ? AND revoked_at IS NULL
  `).get(hashSecret(token)) as any;
  if (!row) return res.status(401).json({ valid: false });
  db.prepare('UPDATE developer_api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
  res.json({ valid: true, key: { id: row.id, userId: row.user_id, name: row.name, keyPrefix: row.key_prefix, scopes: JSON.parse(row.scopes || '[]') } });
});

app.get('/api/platform/me', authenticatePlatformKey('identity:read'), (req: any, res) => {
  const user = getUserById(req.platformKey.userId);
  res.json({ key: req.platformKey, user: user ? serializeUser(user) : null });
});

app.get('/api/platform/apps/public', authenticatePlatformKey('apps:read'), (req: any, res) => {
  res.json({ key: req.platformKey, apps: buildAppsForUser(req.platformKey.userId) });
});

app.post('/api/platform/events', authenticatePlatformKey('events:write'), (req: any, res) => {
  try {
    const event = createPlatformEvent(req.body, req.platformKey.userId);
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
    WHERE created_by = ?
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(req.platformKey.userId, limit) as any[];
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
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  const launchUrl = String(req.body?.launchUrl || req.body?.launch_url || '').trim();
  if (!name || !description || !/^https?:\/\//i.test(launchUrl)) {
    return res.status(400).json({ error: 'name, description, and launchUrl are required' });
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_submissions (id, user_id, name, description, launch_url, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'review', ?)
  `).run(id, req.user.id, name, description, launchUrl, now);
  res.status(201).json({ id, name, description, launchUrl, status: 'review', createdAt: now });
});

app.get('/api/platform/apps', authenticate, (req: any, res) => {
  const submissions = db.prepare(`
    SELECT id, name, description, launch_url, status, created_at
    FROM app_submissions
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
  `).all(req.user.id);
  res.json({ submissions });
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
  const app = SUITE_APPS.find((item) => item.id === appId);
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
  const app = SUITE_APPS.find((item) => item.id === appId);
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
  const app = SUITE_APPS.find((item) => item.id === appId);
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

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (clean.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(clean);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  // Resolve Discord ID from username if provided
  let discordId: string | null = null;
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
        }
      }
    } catch (e) { console.warn('Twitch lookup failed:', e); }
  }

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 12);
  const email = `${clean}@spmt.live`;

  db.prepare(`INSERT INTO users (id, username, email, display_name, password_hash, discord_username, discord_id, twitch_username, twitch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, clean, email, displayName || clean, hash, cleanDiscord || null, discordId, cleanTwitch || null, twitchId, new Date().toISOString());

  const user = getUserById(id);
  const token = signSession(user);
  setSessionCookie(res, token);
  res.status(201).json({ user: serializeUser(user), token });
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

  let discordId: string | null = null;
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
          }
        }
      }
    } catch {}
  }

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
        if (data.data?.length > 0) twitchId = data.data[0].id;
      }
    } catch {}
  }

  const updates: string[] = [];
  const params: any[] = [];
  if (cleanDiscord) { updates.push('discord_username = ?'); params.push(cleanDiscord); }
  if (discordId) { updates.push('discord_id = ?'); params.push(discordId); }
  if (cleanTwitch) { updates.push('twitch_username = ?'); params.push(cleanTwitch); }
  if (twitchId) { updates.push('twitch_id = ?'); params.push(twitchId); }

  if (updates.length > 0) {
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  res.json({ ok: true, discordId, twitchId, discordUsername: cleanDiscord, twitchUsername: cleanTwitch });
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
  const url = `${redirect_uri}?code=${code}&token=${encodeURIComponent(bridgeToken)}${state ? `&state=${encodeURIComponent(state as string)}` : ''}`;
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

  const user = db.prepare('SELECT id, username, email, display_name FROM users WHERE id = ?').get(authCode.user_id) as any;
  const access_token = jwt.sign({ id: user.id, username: user.username, email: user.email, client_id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ access_token, token_type: 'Bearer', expires_in: 7 * 24 * 3600, user });
});

// ─── OAuth2: User info (for apps to verify tokens) ───
app.get('/api/oauth/userinfo', authenticate, (req: any, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, created_at FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
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
      JSON.stringify({ routedTo: botHandle, sourceApp: req.body?.sourceApp || 'spmt' }),
      extractMentionedUsers(req.body.prompt, req.body?.mentions),
      now
    );
  }

  res.status(201).json({
    id: conversationId,
    bot: { username: botUser.username, displayName: botUser.display_name },
    routed: true,
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
    JSON.stringify({ routedTo: botUser.username, sourceApp: req.body?.sourceApp || 'spmt' }),
    extractMentionedUsers(req.body.prompt, req.body?.mentions),
    now
  );
  db.prepare('UPDATE conversations SET type = ?, updated_at = ? WHERE id = ?').run('ai', now, req.params.id);
  res.status(201).json({ id, routed: true });
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
