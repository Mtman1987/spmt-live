'use strict';

const path = require('node:path');

const DEFAULT_VISIBLE_CATEGORIES = new Set(['chat', 'activity', 'notification']);
const VALID_CATEGORIES = new Set(['chat', 'activity', 'notification', 'diagnostic']);
const CHAT_TYPES = new Set(['message', 'action', 'reply', 'edit', 'voice']);
const IMPORTANT_EVENT_RE = /(?:^|[._-])(donation|membership|reward|raid|tagged|shoutout|subscription|gift)(?:$|[._-])/i;
const DIAGNOSTIC_EVENT_RE = /(?:^|[._-])(forwarded?|delivered?|delivery|received|synced?|webhook|heartbeat|healthcheck|telemetry|diagnostic|debug|internal|routing|routed|bridge[_-]?ack|acknowledged|transport|receipt)(?:$|[._-])/i;
const TECHNICAL_EVENT_RE = /^(?:workspace\.profile\.updated|app\.state\.updated|session\.|oauth\.|provider\.grant\.|commlink\.dispatch\.)/i;
const DISCORD_ID_RE = /^\d{15,24}$/;
const OPAQUE_APP_USER_RE = /\buser[_-]\d+\b/gi;
const UUID_TOKEN_RE = /^\s*[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\s*$/i;
const UUID_REPLACE_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const APP_LABELS = new Map([
  ['spmt', 'SPMT'],
  ['cosmo-commlink', 'Commlink'],
  ['spacemountain-live', 'SpaceMountain'],
  ['discord-stream-hub', 'Discord Stream Hub'],
  ['discord-hub', 'Discord Stream Hub'],
  ['streamweaver', 'StreamWeaver'],
  ['chat-tag', 'ChatTag'],
  ['chattag', 'ChatTag'],
  ['hearmeout', 'HearMeOut'],
  ['mountainview', 'MountainView'],
  ['companion', 'SpaceMountain Companion'],
]);

const CACHE_TTL_MS = 15 * 60 * 1000;
const DISCORD_API_CACHE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;
const MAX_DISCORD_LOOKUPS = 8;
const channelCache = new Map();
const userCache = new Map();
const guildCache = new Map();
const roleCache = new Map();
const discordApiCache = new Map();
const discordApiInFlight = new Map();
const queuedDiscordLookups = [];
let activeDiscordLookups = 0;
let identityDb = null;

function compactText(value, max = 240) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function appLabel(value) {
  const raw = compactText(value, 120);
  if (!raw) return 'SPMT';
  const known = APP_LABELS.get(raw.toLowerCase());
  if (known) return known;
  if (/\s/.test(raw) || !/[._-]/.test(raw)) return raw;
  return raw
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function humanizeEventType(value) {
  const raw = compactText(value, 160);
  if (!raw) return 'Activity';
  const parts = raw.split(/[._-]+/).filter(Boolean);
  const useful = parts.length > 1 ? parts.slice(1) : parts;
  const label = useful.join(' ').replace(/\b\w/g, (character) => character.toUpperCase());
  return label || 'Activity';
}

function canonicalProvider(value) {
  const platform = compactText(value?.platform || value?.provider, 40).toLowerCase();
  if (platform === 'social-stream') {
    const rawProvider = compactText(value?.meta?.rawProvider, 40).toLowerCase();
    if (['discord', 'twitch', 'kick', 'youtube', 'tiktok'].includes(rawProvider)) return rawProvider;
  }
  return platform || 'spmt';
}

function eventTypeFor(item) {
  return compactText(item?.meta?.eventType || item?.eventType || item?.type, 160).toLowerCase();
}

function classifyCommlinkItem(item) {
  const provider = canonicalProvider(item);
  const recordType = compactText(item?.meta?.spmtRecordType, 40).toLowerCase();
  const eventType = eventTypeFor(item);
  const type = compactText(item?.type, 40).toLowerCase();
  const important = IMPORTANT_EVENT_RE.test(eventType);

  let category = 'activity';
  if (recordType === 'notification') category = 'notification';
  else if (recordType === 'message' || CHAT_TYPES.has(type)) category = 'chat';
  else if (important) category = 'activity';
  else if (DIAGNOSTIC_EVENT_RE.test(eventType) || TECHNICAL_EVENT_RE.test(eventType)) category = 'diagnostic';
  else if (provider === 'spmt' && type === 'system') category = 'activity';
  else if (type === 'notification') category = 'notification';

  return {
    category,
    defaultVisible: category !== 'diagnostic',
    importance: important ? 'important' : 'normal',
  };
}

function requestedCategories(req) {
  const explicit = compactText(req?.query?.categories, 120)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => VALID_CATEGORIES.has(value));
  const categories = new Set(explicit.length ? explicit : DEFAULT_VISIBLE_CATEGORIES);
  if (String(req?.query?.diagnostics || '') === '1') categories.add('diagnostic');
  return categories;
}

function cacheLookup(cache, key) {
  const entry = cache.get(key);
  if (!entry) return { hit: false, value: null };
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: entry.value };
}

function cacheRead(cache, key) {
  const cached = cacheLookup(cache, key);
  return cached.hit ? cached.value : null;
}

function cacheWrite(cache, key, value, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(entryKey);
    }
  }
  return value;
}

function runDiscordLookup(task) {
  return new Promise((resolve, reject) => {
    const execute = () => {
      activeDiscordLookups += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          activeDiscordLookups -= 1;
          const next = queuedDiscordLookups.shift();
          if (next) next();
        });
    };
    if (activeDiscordLookups < MAX_DISCORD_LOOKUPS) execute();
    else queuedDiscordLookups.push(execute);
  });
}

function databasePath() {
  return process.env.DATABASE_PATH || ((process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME)
    ? '/data/spmt.db'
    : path.join(process.cwd(), 'spmt.db'));
}

function openIdentityDb() {
  if (identityDb) return identityDb;
  try {
    const Database = require('better-sqlite3');
    identityDb = new Database(databasePath(), { readonly: true, fileMustExist: true });
    identityDb.pragma('busy_timeout = 1000');
    return identityDb;
  } catch {
    return null;
  }
}

function resolveLocalIdentity(value) {
  const raw = compactText(value, 160);
  if (!raw) return null;
  const cached = cacheRead(userCache, `local:${raw}`);
  if (cached) return cached;
  const db = openIdentityDb();
  if (!db) return null;
  try {
    const row = db.prepare(`
      SELECT id, username, display_name, discord_username, twitch_username
      FROM users
      WHERE id = ? OR discord_id = ? OR twitch_id = ? OR lower(username) = lower(?)
      LIMIT 1
    `).get(raw, raw, raw, raw);
    if (!row) return null;
    const valueOut = compactText(row.display_name || row.discord_username || row.twitch_username || row.username, 120) || null;
    return valueOut ? cacheWrite(userCache, `local:${raw}`, valueOut) : null;
  } catch {
    return null;
  }
}

async function discordApi(pathname, fetchImpl = global.fetch) {
  const token = compactText(process.env.DISCORD_BOT_TOKEN, 256);
  if (!token || typeof fetchImpl !== 'function') return null;

  const cacheKey = compactText(pathname, 500);
  const cached = cacheLookup(discordApiCache, cacheKey);
  if (cached.hit) return cached.value;
  const existing = discordApiInFlight.get(cacheKey);
  if (existing) return existing;

  const request = runDiscordLookup(async () => {
    try {
      const response = await fetchImpl(`https://discord.com/api/v10${pathname}`, {
        headers: { Authorization: `Bot ${token}`, Accept: 'application/json' },
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(1800) : undefined,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }).then((value) => cacheWrite(
    discordApiCache,
    cacheKey,
    value,
    value == null ? NEGATIVE_CACHE_TTL_MS : DISCORD_API_CACHE_TTL_MS,
  )).finally(() => {
    discordApiInFlight.delete(cacheKey);
  });

  discordApiInFlight.set(cacheKey, request);
  return request;
}

async function resolveDiscordGuild(guildId, fetchImpl = global.fetch) {
  const id = compactText(guildId, 32);
  if (!DISCORD_ID_RE.test(id)) return null;
  const cached = cacheRead(guildCache, id);
  if (cached) return cached;
  const guild = await discordApi(`/guilds/${encodeURIComponent(id)}`, fetchImpl);
  if (!guild) return null;
  return cacheWrite(guildCache, id, {
    guildId: id,
    guildName: compactText(guild.name, 120) || 'Discord server',
  });
}

async function resolveDiscordChannel(channelId, fetchImpl = global.fetch) {
  const id = compactText(channelId, 32);
  if (!DISCORD_ID_RE.test(id)) return null;
  const cached = cacheRead(channelCache, id);
  if (cached) return cached;
  const channel = await discordApi(`/channels/${encodeURIComponent(id)}`, fetchImpl);
  if (!channel) return null;
  const guildId = compactText(channel.guild_id, 32) || null;
  const categoryId = compactText(channel.parent_id, 32) || null;
  const [guild, category] = await Promise.all([
    guildId ? resolveDiscordGuild(guildId, fetchImpl) : null,
    categoryId ? discordApi(`/channels/${encodeURIComponent(categoryId)}`, fetchImpl) : null,
  ]);
  return cacheWrite(channelCache, id, {
    channelId: id,
    channelName: compactText(channel.name, 120) || 'Discord channel',
    guildId,
    guildName: guild?.guildName || null,
    categoryId,
    categoryName: compactText(category?.name, 120) || null,
    channelType: Number.isFinite(Number(channel.type)) ? Number(channel.type) : null,
  });
}

async function resolveDiscordUser(userId, guildId, fetchImpl = global.fetch) {
  const id = compactText(userId, 32);
  if (!DISCORD_ID_RE.test(id)) return null;
  const local = resolveLocalIdentity(id);
  if (local) return local;
  const cacheKey = `${guildId || 'global'}:${id}`;
  const cached = cacheRead(userCache, cacheKey);
  if (cached) return cached;
  let record = null;
  if (guildId && DISCORD_ID_RE.test(String(guildId))) {
    record = await discordApi(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(id)}`, fetchImpl);
  }
  const user = record?.user || await discordApi(`/users/${encodeURIComponent(id)}`, fetchImpl);
  if (!user) return null;
  const name = compactText(record?.nick || user.global_name || user.username, 120) || null;
  return name ? cacheWrite(userCache, cacheKey, name) : null;
}

async function resolveDiscordRole(roleId, guildId, fetchImpl = global.fetch) {
  const id = compactText(roleId, 32);
  const guild = compactText(guildId, 32);
  if (!DISCORD_ID_RE.test(id) || !DISCORD_ID_RE.test(guild)) return null;
  let roles = cacheRead(roleCache, guild);
  if (!roles) {
    const records = await discordApi(`/guilds/${encodeURIComponent(guild)}/roles`, fetchImpl);
    if (!Array.isArray(records)) return null;
    roles = new Map(records.map((role) => [String(role.id), compactText(role.name, 120) || 'Discord role']));
    cacheWrite(roleCache, guild, roles);
  }
  return roles.get(id) || null;
}

function isFriendlyChannelName(value) {
  const raw = compactText(value, 160);
  return Boolean(raw && !DISCORD_ID_RE.test(raw) && !/^discord:\d+$/i.test(raw) && !/^unknown$/i.test(raw));
}

function opaqueTargetLabel(value) {
  const raw = compactText(value, 160);
  if (!raw) return null;
  const local = resolveLocalIdentity(raw);
  if (local) return local;
  if (DISCORD_ID_RE.test(raw)) return 'Unknown Discord user';
  if (/^user[_-]\d+$/i.test(raw) || UUID_TOKEN_RE.test(raw)) return 'another player';
  return raw;
}

function firstMetaValue(meta, keys) {
  for (const key of keys) {
    const value = meta?.[key];
    if (value !== undefined && value !== null && compactText(value, 200)) return value;
  }
  return null;
}

async function resolveStructuredTarget(meta, guildId, deps) {
  const display = firstMetaValue(meta, [
    'targetDisplayName', 'target_display_name', 'targetName', 'target_name',
    'taggedDisplayName', 'tagged_display_name', 'taggedName', 'tagged_name',
    'recipientDisplayName', 'recipient_display_name', 'recipientName', 'recipient_name',
    'playerDisplayName', 'player_display_name', 'playerName', 'player_name',
    'toDisplayName', 'to_display_name', 'toName', 'to_name',
  ]);
  if (display) return compactText(display, 120);
  const id = firstMetaValue(meta, [
    'targetUserId', 'target_user_id', 'taggedUserId', 'tagged_user_id',
    'recipientId', 'recipient_id', 'playerId', 'player_id', 'toUserId', 'to_user_id',
    'targetId', 'target_id',
  ]);
  if (!id) return null;
  const raw = compactText(id, 160);
  const local = await deps.resolveIdentity(raw);
  if (local) return local;
  if (DISCORD_ID_RE.test(raw)) {
    return await deps.resolveDiscordUser(raw, guildId) || 'Unknown Discord user';
  }
  return opaqueTargetLabel(raw);
}

function scrubTechnicalIdentifiers(text, category) {
  let next = compactText(text, 4000);
  if (!next) return next;
  next = next.replace(OPAQUE_APP_USER_RE, 'another player');
  if (category !== 'chat') {
    next = next
      .replace(/\bdiscord:\d{15,24}\b/gi, 'Discord channel')
      .replace(UUID_REPLACE_RE, 'another user')
      .replace(/\b\d{15,24}\b/g, 'Discord target');
  }
  return next;
}

async function replaceDiscordMentions(text, guildId, deps) {
  let next = String(text || '');
  const userIds = [...new Set(Array.from(next.matchAll(/<@!?(\d{15,24})>/g), (match) => match[1]))];
  const channelIds = [...new Set(Array.from(next.matchAll(/<#(\d{15,24})>/g), (match) => match[1]))];
  const roleIds = [...new Set(Array.from(next.matchAll(/<@&(\d{15,24})>/g), (match) => match[1]))];
  const [users, channels, roles] = await Promise.all([
    Promise.all(userIds.slice(0, 24).map(async (id) => [id, await deps.resolveDiscordUser(id, guildId)])),
    Promise.all(channelIds.slice(0, 24).map(async (id) => [id, await deps.resolveDiscordChannel(id)])),
    Promise.all(roleIds.slice(0, 24).map(async (id) => [id, await deps.resolveDiscordRole(id, guildId)])),
  ]);
  const userMap = new Map(users);
  const channelMap = new Map(channels);
  const roleMap = new Map(roles);
  next = next.replace(/<@!?(\d{15,24})>/g, (_token, id) => `@${userMap.get(id) || 'Unknown user'}`);
  next = next.replace(/<#(\d{15,24})>/g, (_token, id) => `#${channelMap.get(id)?.channelName || 'Unknown channel'}`);
  next = next.replace(/<@&(\d{15,24})>/g, (_token, id) => `@${roleMap.get(id) || 'Unknown role'}`);
  return next;
}

async function humanizeSpmtEventText(item, presentation, guildId, deps) {
  const meta = item?.meta && typeof item.meta === 'object' ? item.meta : {};
  const eventType = eventTypeFor(item);
  const actor = compactText(
    firstMetaValue(meta, ['actorDisplayName', 'actor_display_name', 'taggerDisplayName', 'tagger_display_name'])
    || item?.sender?.displayName
    || item?.sender?.login,
    120,
  ) || appLabel(item?.sourceName || item?.sourceId);
  const target = await resolveStructuredTarget(meta, guildId, deps);

  if (/(?:^|[._-])player[_-]?tagged(?:$|[._-])|(?:^|[._-])tagged(?:$|[._-])/i.test(eventType)) {
    return `${actor} tagged ${target || 'another player'}`;
  }
  if (/(?:^|[._-])tag[_-]?passed(?:$|[._-])|(?:^|[._-])passed[_-]?tag(?:$|[._-])/i.test(eventType)) {
    return `${actor} passed the tag to ${target || 'another player'}`;
  }

  let text = scrubTechnicalIdentifiers(item?.text, presentation.category);
  if (!text || text.toLowerCase() === eventType || text.toLowerCase() === eventType.replace(/[._-]+/g, ' ')) {
    text = humanizeEventType(eventType);
  }
  return text;
}

function defaultDependencies(overrides = {}) {
  const fetchImpl = overrides.fetch || global.fetch;
  return {
    resolveDiscordChannel: overrides.resolveDiscordChannel || ((id) => resolveDiscordChannel(id, fetchImpl)),
    resolveDiscordUser: overrides.resolveDiscordUser || ((id, guildId) => resolveDiscordUser(id, guildId, fetchImpl)),
    resolveDiscordRole: overrides.resolveDiscordRole || ((id, guildId) => resolveDiscordRole(id, guildId, fetchImpl)),
    resolveIdentity: overrides.resolveIdentity || (async (id) => resolveLocalIdentity(id)),
    logger: overrides.logger || console,
  };
}

async function projectChannel(channel, deps) {
  if (!channel || typeof channel !== 'object') return channel;
  const next = { ...channel };
  const provider = canonicalProvider(next);
  if (provider === 'discord') {
    const channelId = compactText(next.channelId, 32);
    const info = DISCORD_ID_RE.test(channelId) ? await deps.resolveDiscordChannel(channelId) : null;
    next.channelName = isFriendlyChannelName(next.channelName)
      ? compactText(next.channelName, 160)
      : info?.channelName || 'Discord channel';
    if (info) {
      next.guildId = info.guildId;
      next.guildName = info.guildName;
      next.categoryId = info.categoryId;
      next.categoryName = info.categoryName;
      next.sourceName = info.guildName || (isFriendlyChannelName(next.sourceName) ? compactText(next.sourceName, 160) : 'Discord');
      next.displayName = info.guildName ? `${info.guildName} / #${next.channelName}` : `#${next.channelName}`;
    } else {
      next.sourceName = isFriendlyChannelName(next.sourceName) ? compactText(next.sourceName, 160) : 'Discord';
      next.displayName = `#${next.channelName}`;
    }
  } else if (provider === 'spmt') {
    next.sourceName = appLabel(next.sourceName || String(next.sourceId || '').replace(/^spmt:/i, ''));
    if (!compactText(next.channelName, 160) || compactText(next.channelName, 160) === compactText(next.channelId, 160)) {
      next.channelName = humanizeEventType(next.channelId);
    }
  }
  return next;
}

async function projectItem(item, deps) {
  if (!item || typeof item !== 'object') return item;
  const presentation = classifyCommlinkItem(item);
  const next = {
    ...item,
    sender: item.sender && typeof item.sender === 'object' ? { ...item.sender } : item.sender,
    meta: item.meta && typeof item.meta === 'object' ? { ...item.meta } : {},
    presentation,
  };
  const provider = canonicalProvider(next);
  let guildId = compactText(next.meta?.discord?.guildId || next.meta?.guildId, 32) || null;

  if (provider === 'discord') {
    const channelId = compactText(next.channelId, 32);
    const info = DISCORD_ID_RE.test(channelId) ? await deps.resolveDiscordChannel(channelId) : null;
    if (info) {
      guildId = info.guildId || guildId;
      next.channelName = isFriendlyChannelName(next.channelName) ? compactText(next.channelName, 160) : info.channelName;
      next.sourceName = info.guildName || (isFriendlyChannelName(next.sourceName) ? compactText(next.sourceName, 160) : 'Discord');
      next.meta.discord = { ...(next.meta.discord || {}), ...info };
    } else {
      if (!isFriendlyChannelName(next.channelName)) next.channelName = 'Discord channel';
      if (!isFriendlyChannelName(next.sourceName)) next.sourceName = 'Discord';
    }
  }

  if (provider === 'spmt') {
    next.sourceName = appLabel(next.sourceName || String(next.sourceId || '').replace(/^spmt:/i, ''));
    const eventType = eventTypeFor(next);
    if (!compactText(next.channelName, 160) || compactText(next.channelName, 160) === compactText(next.channelId, 160) || compactText(next.channelName, 160).toLowerCase() === eventType) {
      next.channelName = humanizeEventType(eventType);
    }
    next.text = await humanizeSpmtEventText(next, presentation, guildId, deps);
  } else {
    next.text = scrubTechnicalIdentifiers(next.text, presentation.category);
  }

  if (String(next.text || '').match(/<@!?\d{15,24}>|<#\d{15,24}>|<@&\d{15,24}>/)) {
    next.text = await replaceDiscordMentions(next.text, guildId, deps);
  }

  next.meta.presentation = presentation;
  return next;
}

async function projectCommlinkPayload(payload, req = {}, overrides = {}) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) return payload;
  const deps = defaultDependencies(overrides);
  const categories = requestedCategories(req);
  const projectedItems = await Promise.all(payload.items.map((item) => projectItem(item, deps)));
  const visibleItems = projectedItems.filter((item) => categories.has(item?.presentation?.category || 'activity'));
  const projectedChannels = Array.isArray(payload.channels)
    ? await Promise.all(payload.channels.map((channel) => projectChannel(channel, deps)))
    : payload.channels;

  return {
    ...payload,
    items: visibleItems,
    count: visibleItems.length,
    channels: projectedChannels,
    presentation: {
      version: 'commlink-presentation.v1',
      categories: ['chat', 'activity', 'notification', 'diagnostic'],
      defaultCategories: ['chat', 'activity', 'notification'],
      requestedCategories: [...categories],
      hiddenCount: projectedItems.length - visibleItems.length,
      rawIdentifiers: 'retained-in-contract-not-display-text',
    },
  };
}

function installProjectionRoute(app) {
  if (app.__spmtCommlinkFeedProjectionInstalled) return;
  app.__spmtCommlinkFeedProjectionInstalled = true;
  app.get('/api/commlink/feed', (req, res, next) => {
    const sendJson = res.json.bind(res);
    let projected = false;
    res.json = function projectedJson(payload) {
      if (projected) return sendJson(payload);
      projected = true;
      Promise.resolve(projectCommlinkPayload(payload, req))
        .then((body) => sendJson(body))
        .catch((error) => {
          console.warn('[SPMT] Commlink presentation projection failed; returning canonical raw feed', error);
          sendJson(payload);
        });
      return res;
    };
    next();
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtCommlinkFeedProjectionFactory) return;

  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installProjectionRoute(app);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtCommlinkFeedProjectionFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installCommlinkFeedProjectionBootstrap() {
  patchExpress();
}

module.exports = {
  classifyCommlinkItem,
  humanizeEventType,
  projectCommlinkPayload,
  installCommlinkFeedProjectionBootstrap,
};
