'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  classifyCommlinkItem,
  projectCommlinkPayload,
} = require('../commlink-feed-projection-bootstrap.cjs');

const discordChannelId = '1521763002439962756';
const discordUserId = '626334020000000000';
const discordRoleId = '726334020000000000';

function baseItem(overrides = {}) {
  return {
    version: 'commlink-feed.v1',
    eventId: 'event-1',
    upstreamId: 'upstream-1',
    platform: 'spmt',
    sourceId: 'spmt:chat-tag',
    sourceName: 'chat-tag',
    channelId: 'game.player_tagged',
    channelName: 'game.player_tagged',
    type: 'system',
    sender: { id: 'actor-1', login: 'kyouya66', displayName: 'kyouya66', badges: [], roles: [] },
    text: 'kyouya66 tagged user_62633402',
    media: [],
    links: [],
    originalTimestamp: '2026-08-17T18:00:00.000Z',
    receivedTimestamp: '2026-08-17T18:00:00.000Z',
    meta: { spmtRecordType: 'event', eventType: 'game.player_tagged', targetUserId: discordUserId },
    dedupeKey: 'event-1',
    routing: { mirrored: false, reflected: false, canReply: false, botReadable: true, botCanReply: false, tenantIsolationKey: 'tenant-1' },
    ...overrides,
  };
}

const deps = {
  resolveDiscordChannel: async (id) => id === discordChannelId ? {
    channelId: id,
    channelName: 'general',
    guildId: '111111111111111111',
    guildName: 'Mountain Crew',
    categoryId: '222222222222222222',
    categoryName: 'STREAM CHAT',
    channelType: 0,
  } : null,
  resolveDiscordUser: async (id) => id === discordUserId ? 'SaltyBear' : null,
  resolveDiscordRole: async (id) => id === discordRoleId ? 'Moderators' : null,
  resolveIdentity: async () => null,
  logger: { warn() {} },
};

test('routing and delivery acknowledgements are diagnostics by default', () => {
  assert.equal(classifyCommlinkItem(baseItem({ meta: { spmtRecordType: 'event', eventType: 'discord.activity_forwarded' } })).category, 'diagnostic');
  assert.equal(classifyCommlinkItem(baseItem({ meta: { spmtRecordType: 'event', eventType: 'bridge.message.delivered' } })).category, 'diagnostic');
  assert.equal(classifyCommlinkItem(baseItem()).category, 'activity');
});

test('important user-facing events beat diagnostic token matches', () => {
  const presentation = classifyCommlinkItem(baseItem({
    meta: { spmtRecordType: 'event', eventType: 'game.reward_received' },
  }));
  assert.equal(presentation.category, 'activity');
  assert.equal(presentation.importance, 'important');
  assert.equal(presentation.defaultVisible, true);
});

test('default feed hides diagnostics but callers can opt in and count matches visible items', async () => {
  const diagnostic = baseItem({ eventId: 'diag', meta: { spmtRecordType: 'event', eventType: 'discord.activity_forwarded' }, text: 'Discord activity was forwarded to Chat Tag.' });
  const activity = baseItem({ eventId: 'activity' });
  const normal = await projectCommlinkPayload({ items: [diagnostic, activity], channels: [], count: 2 }, { query: {} }, deps);
  assert.deepEqual(normal.items.map((item) => item.eventId), ['activity']);
  assert.equal(normal.count, 1);
  assert.equal(normal.presentation.hiddenCount, 1);
  const debug = await projectCommlinkPayload({ items: [diagnostic, activity], channels: [], count: 2 }, { query: { diagnostics: '1' } }, deps);
  assert.deepEqual(debug.items.map((item) => item.eventId), ['diag', 'activity']);
  assert.equal(debug.count, 2);
});

test('Discord snowflakes stay identifiers while channel display text becomes readable', async () => {
  const payload = await projectCommlinkPayload({
    items: [{
      ...baseItem(),
      platform: 'discord',
      sourceId: `discord:${discordChannelId}`,
      sourceName: `discord:${discordChannelId}`,
      channelId: discordChannelId,
      channelName: discordChannelId,
      type: 'message',
      text: `Hi <@${discordUserId}> in <#${discordChannelId}> — ask <@&${discordRoleId}>`,
      meta: {},
    }],
    channels: [{ platform: 'discord', sourceId: `discord:${discordChannelId}`, sourceName: discordChannelId, channelId: discordChannelId, channelName: discordChannelId }],
  }, { query: {} }, deps);
  assert.equal(payload.channels[0].channelId, discordChannelId);
  assert.equal(payload.channels[0].channelName, 'general');
  assert.equal(payload.channels[0].guildName, 'Mountain Crew');
  assert.equal(payload.channels[0].categoryName, 'STREAM CHAT');
  assert.equal(payload.items[0].channelName, 'general');
  assert.equal(payload.items[0].sourceName, 'Mountain Crew');
  assert.match(payload.items[0].text, /@SaltyBear/);
  assert.match(payload.items[0].text, /#general/);
  assert.match(payload.items[0].text, /@Moderators/);
  assert.doesNotMatch(payload.items[0].text, /626334020000000000|1521763002439962756|726334020000000000/);
});

test('structured app events compose readable actor and target text', async () => {
  const payload = await projectCommlinkPayload({ items: [baseItem()], channels: [] }, { query: {} }, deps);
  assert.equal(payload.items[0].text, 'kyouya66 tagged SaltyBear');
  assert.equal(payload.items[0].sourceName, 'ChatTag');
  assert.equal(payload.items[0].channelName, 'Player Tagged');
  assert.equal(payload.items[0].presentation.category, 'activity');
});

test('friendly app source names keep their capitalization', async () => {
  const payload = await projectCommlinkPayload({ items: [baseItem({ sourceName: 'MyCoolApp' })], channels: [] }, { query: {} }, deps);
  assert.equal(payload.items[0].sourceName, 'MyCoolApp');
});

test('unresolved opaque identifiers never become human display text', async () => {
  const payload = await projectCommlinkPayload({ items: [baseItem({
    meta: { spmtRecordType: 'event', eventType: 'game.player_tagged', targetUserId: 'user_432778419' },
    text: 'kyouya66 tagged user_432778419',
  })], channels: [] }, { query: {} }, { ...deps, resolveDiscordUser: async () => null });
  assert.equal(payload.items[0].text, 'kyouya66 tagged another player');
  assert.doesNotMatch(payload.items[0].text, /user_432778419/);
});
