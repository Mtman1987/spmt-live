'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { JSDOM } = require('jsdom');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function assets() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commlink-navigation-'));
  const env = { SPMT_COMMLINK_JS_PATH: 'commlink.js', SPMT_COMMLINK_CSS_PATH: 'commlink.css', SPMT_COMMLINK_INDEX_PATH: 'index.html' };
  const previous = {};
  for (const [key, name] of Object.entries(env)) {
    previous[key] = process.env[key];
    process.env[key] = path.join(dir, name);
    // Startup contract tests mutate the working assets concurrently. Assemble
    // from the committed templates so we never read a half-migrated file.
    fs.writeFileSync(process.env[key], execFileSync('git', ['show', `HEAD:public/commlink/${name}`], { cwd: root }));
  }
  try {
    require('../commlink-rich-chat-bootstrap.cjs').installCommlinkRichChatBootstrap();
    require('../commlink-source-controls-bootstrap.cjs').installCommlinkSourceControlsBootstrap();
    require('../commlink-identity-routing-bootstrap.cjs').installCommlinkIdentityRoutingBootstrap();
    require('../commlink-production-bootstrap.cjs').installCommlinkProductionBootstrap();
    require('../commlink-auth-recovery-bootstrap.cjs').patchCommlinkAuthRecovery();
    const install = require('../commlink-chat-navigation-bootstrap.cjs').installCommlinkChatNavigationBootstrap;
    install();
    const read = () => Object.fromEntries(['commlink.js', 'commlink.css', 'index.html'].map(name => [name, fs.readFileSync(path.join(dir, name), 'utf8')]));
    const first = read();
    install();
    assert.deepEqual(read(), first, 'navigation build must be idempotent');
    return first;
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const built = assets();
const chat = (id, provider = 'twitch', extra = {}) => ({ id: `${provider}:${id}`, provider, channelId: id, channel: id, capabilities: { compose: true, reply: true }, health: 'live', state: 'Connected', ...extra });
function app(t, sources) {
  const dom = new JSDOM(built['index.html'], { url: 'https://spmt.live/commlink/', runScripts: 'outside-only' });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.CSS = { escape: value => String(value).replace(/["\\]/g, '\\$&') };
  const requests = [];
  w.fetch = async (url, options = {}) => { requests.push({ url, options }); throw new Error('Unexpected network request in UI test'); };
  const code = built['commlink.js'].split('\nrenderAll();\nwireEvents();')[0];
  w.eval(code + '\nwindow.app = { state, renderAll, renderSourceChips, renderDestinations, renderDesk, currentWorkspaceData, applyWorkspaceRecord, messageBelongsToSpace, openSendPreview, dispatchComposer, handleMessageAction, wireEvents };');
  const a = w.app;
  a.state.feedMode = 'real';
  a.state.sources = sources;
  a.state.chatSpaces = [{ id: 'account', name: 'All messages', sources: sources.map(item => item.id), sourceMode: 'all', hiddenSourceIds: [] }];
  a.renderAll(); a.wireEvents();
  t.after(() => w.close());
  return { ...a, w, document: w.document, requests, select(value) { const select = w.document.querySelector('#chat-destination'); select.value = value; select.dispatchEvent(new w.Event('change')); }, change(input, checked) { input.checked = checked; input.dispatchEvent(new w.Event('change')); } };
}

test('prepared assets parse and navigation is packaged after the existing migrations', () => {
  assert.doesNotThrow(() => new Function(built['commlink.js']));
  assert.match(fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8'), /COPY commlink-chat-navigation-bootstrap.cjs/);
  const start = fs.readFileSync(path.join(root, 'start.cjs'), 'utf8');
  assert.ok(start.indexOf('installCommlinkChatNavigationBootstrap') > start.indexOf('patchCommlinkAuthRecovery'));
});

test('32 chats become searchable groups, with duplicate Discord names separated by server and category', t => {
  const sources = Array.from({ length: 29 }, (_, i) => chat(`creator-${i}`));
  sources.push(chat('1', 'discord', { channel: '#general', guildId: 'g1', guildName: 'North', parentName: 'Community' }), chat('2', 'discord', { channel: '#general', guildId: 'g2', guildName: 'South', parentName: 'Members' }), chat('direct', 'spmt', { capabilities: {} }));
  sources.push(chat('all', 'twitch', { channel: 'All Twitch channels', aggregate: true, capabilities: {}, channelId: '' }));
  const a = app(t, sources);
  assert.equal(a.document.querySelectorAll('[data-chat-visible]').length, 32);
  assert.equal(a.document.querySelectorAll('#chat-groups .chat-platform').length, 3);
  assert.equal(a.document.querySelectorAll('#chat-groups .chat-server').length, 2);
  assert.match(a.document.querySelector('#chat-groups').textContent, /SPMT messages & activity.*Personal inbox/s);
  assert.doesNotMatch(a.document.querySelector('#source-chips').textContent, /All Twitch/);
  assert.match(a.document.querySelector('#chat-destination').textContent, /Discord \/ North \/ Community \/ #general/);
  const search = a.document.querySelector('#chat-search');
  search.value = 'South'; search.dispatchEvent(new a.w.Event('input'));
  assert.equal(a.document.querySelectorAll('[data-chat-visible]').length, 1);
  assert.equal(a.document.querySelector('[data-chat-visible]').dataset.chatVisible, 'discord:2');
  assert.equal(a.requests.length, 0);
});

test('hiding a chat overrides All feeds, survives workspace serialization, and leaves the chosen recipient unchanged', t => {
  const a = app(t, [chat('alice'), chat('bob'), chat('all', 'twitch', { aggregate: true, channelId: '', capabilities: {} })]);
  a.select('twitch:alice');
  a.change(a.document.querySelector('[data-chat-visible="twitch:alice"]'), false);
  assert.equal(a.state.selectedDestinations.join(), 'twitch:alice');
  const space = a.state.chatSpaces[0];
  assert.equal(a.messageBelongsToSpace({ sourceId: 'twitch:alice', provider: 'twitch' }, space, new Set(), new Set(['twitch'])), false);
  const data = a.currentWorkspaceData();
  assert.equal(data.chatSpaces[0].hiddenSourceIds.join(), 'twitch:alice');
  assert.equal(data.chatSpaces[0].selectedDestinationIds.length, 0);
  a.applyWorkspaceRecord({ data }, 'test');
  assert.equal(a.state.chatSpaces[0].hiddenSourceIds.join(), 'twitch:alice');
  assert.equal(a.state.selectedDestinations.join(), 'twitch:alice');
});

test('show/hide all is a reading preference; newly discovered chats appear in all mode', t => {
  const a = app(t, [chat('alice'), chat('bob')]);
  a.select('twitch:bob');
  a.document.querySelector('#chat-hide-all').click();
  assert.equal(a.document.querySelectorAll('[data-chat-visible]:checked').length, 0);
  assert.equal(a.state.selectedDestinations.join(), 'twitch:bob');
  a.document.querySelector('#chat-show-all').click();
  a.state.sources.push(chat('carol')); a.renderSourceChips();
  assert.equal(a.document.querySelectorAll('[data-chat-visible]:checked').length, 3);
  assert.equal(a.state.selectedDestinations.join(), 'twitch:bob');
});

test('legacy multi-send and aggregate selections are rejected; @person stays in the message', t => {
  const a = app(t, [chat('alice'), chat('bob'), chat('all', 'twitch', { aggregate: true, channelId: '', capabilities: {} })]);
  a.state.selectedDestinations = ['twitch:alice', 'twitch:bob']; a.renderDestinations();
  assert.equal(a.state.selectedDestinations.length, 0);
  a.state.selectedDestinations = ['twitch:all']; a.renderDestinations();
  assert.equal(a.state.selectedDestinations.length, 0);
  a.select('twitch:alice');
  const input = a.document.querySelector('#compose-input');
  input.value = 'Hello @bob'; input.dispatchEvent(new a.w.Event('input', { bubbles: true }));
  assert.equal(input.value, 'Hello @bob');
  assert.equal(a.state.selectedDestinations.join(), 'twitch:alice');
  assert.ok(a.document.querySelector('#mention-menu').classList.contains('hidden'));
});

test('send uses the reviewed message and exact channel even when feed selection changes; retries reuse the key', async t => {
  const a = app(t, [chat('alice'), chat('bob')]);
  const sent = [];
  a.w.fetch = async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); throw new Error('Connection lost'); };
  a.select('twitch:alice'); a.document.querySelector('#compose-input').value = 'Reviewed message';
  a.document.querySelector('#preview-send').click();
  a.select('twitch:bob'); a.document.querySelector('#compose-input').value = 'New draft';
  await a.dispatchComposer(); await a.dispatchComposer();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].body.destinations.length, 1);
  assert.equal(sent[0].body.destinations[0].channelId, 'alice');
  assert.equal(sent[0].body.message, 'Reviewed message');
  assert.equal(sent[0].body.idempotencyKey, sent[1].body.idempotencyKey);
});

test('reply names the person and keeps its original public channel', async t => {
  const a = app(t, [chat('alice'), chat('bob')]);
  const message = { id: 'message-1', sourceId: 'twitch:alice', provider: 'twitch', channel: 'alice', name: 'Viewer', capabilities: { reply: true } };
  a.state.messages.push(message);
  a.handleMessageAction(message, 'reply');
  assert.match(a.document.querySelector('#routing-note').textContent, /Reply to Viewer.*Visible in that chat/);
  a.document.querySelector('#compose-input').value = 'Hello'; a.openSendPreview();
  let sent;
  a.w.fetch = async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ status: 'delivered', delivered: 1, failed: 0, receipts: [] }) }; };
  await a.dispatchComposer();
  assert.equal(sent.action, 'reply'); assert.equal(sent.eventId, 'message-1'); assert.equal(sent.destinations[0].channelId, 'alice');
});

test('personal messages require an exact verified person and never pass through channel dispatch', async t => {
  const a = app(t, [chat('alice')]);
  a.select('__personal__');
  a.document.querySelector('#compose-input').value = 'Private hello'; a.openSendPreview();
  assert.ok(a.document.querySelector('#send-modal').classList.contains('hidden'));
  a.document.querySelector('#personal-handle').value = 'bob';
  const calls = [];
  a.w.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url === '/api/messages' ? { sent: true } : ({ id: 'user-bob', username: 'bob', display_name: 'Bob' }) };
  };
  a.document.querySelector('#personal-find').click();
  await new Promise(resolve => setImmediate(resolve));
  a.openSendPreview();
  assert.match(a.document.querySelector('#modal-destinations').textContent, /Private message to Bob \(@bob\)/);
  await a.dispatchComposer();
  assert.deepEqual(calls.map(call => call.url), ['/api/user/lookup?username=bob', '/api/messages']);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.to, 'bob'); assert.equal(body.body, 'Private hello'); assert.equal(body.conversationId, undefined);
});

test('Discord names and usernames are rendered as text, never executable markup', t => {
  const a = app(t, [chat('1', 'discord', { channel: '<img src=x onerror=alert(1)>', guildName: '<script>bad</script>', parentName: '<svg/onload=alert(1)>' })]);
  a.select('discord:1'); a.document.querySelector('#compose-input').value = 'Hello'; a.openSendPreview();
  assert.equal(a.document.querySelectorAll('#source-chips img, #source-chips script, #source-chips svg, #modal-destinations img').length, 0);
});
