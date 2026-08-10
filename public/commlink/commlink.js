const providers = {
  twitch: { name: 'Twitch', short: 'T', rgb: '145, 70, 255' },
  kick: { name: 'Kick', short: 'K', rgb: '83, 252, 24' },
  youtube: { name: 'YouTube', short: 'Y', rgb: '255, 54, 72' },
  discord: { name: 'Discord', short: 'D', rgb: '88, 101, 242' },
  tiktok: { name: 'TikTok', short: 'TT', rgb: '37, 244, 238' },
  spmt: { name: 'SPMT', short: 'S', rgb: '167, 139, 250' },
  app: { name: 'App', short: 'A', rgb: '167, 139, 250' },
  'social-stream': { name: 'Social Stream', short: 'SS', rgb: '56, 189, 248' },
};

const commlinkParams = new URLSearchParams(window.location.search);
const demoMode = commlinkParams.get('demo') === '1';
const accountChatSpaces = [
  { id: 'account', name: 'All messages', detail: 'Account-scoped live sources', icon: 'CM', rgb: '167,139,250', unread: 0, sources: [], bridgeSourceIds: [] },
];
const accountDesks = [
  { id: 'account', name: 'Account', panels: [{ panelId: 'account-feed', label: 'account-feed', chatSpaceId: 'account', accessMode: 'owner' }], hiddenSourceIds: [] },
];

function commlinkAuthHeaders(extra = {}) {
  const token = localStorage.getItem('spmt_token');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

const defaultSources = [
  { id: 'twitch-creatora', provider: 'twitch', channelId: 'creatorA', channel: 'creatorA', state: 'Live · can send', capabilities: { compose: true, reply: true, timeout: true, delete: false } },
  { id: 'kick-creatorc', provider: 'kick', channelId: 'creatorC', channel: 'creatorC', state: 'Live · can send', capabilities: { compose: true, reply: false, timeout: false, delete: false } },
  { id: 'youtube-creatorb', provider: 'youtube', channelId: 'creatorB', channel: 'creatorB', state: 'Read only', capabilities: { compose: false, reply: false, timeout: false, delete: false } },
  { id: 'discord-livechat', provider: 'discord', channelId: 'live-chat', channel: '#live-chat', state: 'Live · can send', capabilities: { compose: true, reply: false, timeout: false, delete: true } },
  { id: 'tiktok-creatora', provider: 'tiktok', channelId: 'creatorA', channel: 'creatorA', state: 'Preview · adapter required', capabilities: { compose: false, reply: false, timeout: false, delete: false } },
  { id: 'spmt-direct', provider: 'spmt', channelId: 'direct', channel: 'Direct messages', state: 'Preview · read only', capabilities: { compose: false, reply: false, timeout: false, delete: false } },
];

const defaultChatSpaces = [
  { id: 'friday', name: 'Friday Stream', detail: '6 sources · preview', icon: 'FS', rgb: '167,139,250', unread: 7, sources: defaultSources.map((source) => source.id), bridgeSourceIds: ['twitch-creatora', 'kick-creatorc', 'youtube-creatorb'] },
  { id: 'partner', name: 'Partner Night', detail: '2 sources · live', icon: 'PN', rgb: '56,189,248', unread: 3, sources: ['twitch-creatora', 'youtube-creatorb'] },
  { id: 'mods', name: 'Mod Watch', detail: 'Discord · helper', icon: 'MW', rgb: '88,101,242', unread: 0, sources: ['discord-livechat'] },
  { id: 'redeems', name: 'Redeems + XP', detail: 'Events only', icon: 'XP', rgb: '52,211,153', unread: 2, sources: ['twitch-creatora', 'kick-creatorc'] },
];

const defaultDesks = [
  {
    id: 'live-show',
    name: 'Live Show',
    panels: [
      { panelId: 'main-chat', label: 'main-chat', chatSpaceId: 'friday', accessMode: 'owner', syncGroupId: 'show-queue' },
      { panelId: 'discord-ops', label: 'discord-ops', chatSpaceId: 'mods', accessMode: 'helper' },
      { panelId: 'redeems', label: 'redeems', chatSpaceId: 'redeems', accessMode: 'queue-only', syncGroupId: 'show-queue' },
    ],
    hiddenSourceIds: [],
  },
  {
    id: 'mod-shift',
    name: 'Mod Shift',
    panels: [
      { panelId: 'mod-main', label: 'mod-main', chatSpaceId: 'mods', accessMode: 'operator' },
      { panelId: 'partner-watch', label: 'partner-watch', chatSpaceId: 'partner', accessMode: 'view-only' },
    ],
    hiddenSourceIds: [],
  },
];

const initialMessages = [
  {
    id: 'm1', sourceId: 'twitch-creatora', provider: 'twitch', channel: 'creatorA', kind: 'chat', name: 'PixelRanger', handle: '@pixelranger',
    initials: 'PR', roles: ['MOD', 'SUB 18M'], time: '8:41 PM', text: 'That transition was ridiculously smooth <span class="emote">🔥</span>',
    xp: 31977, level: 42, queued: false, pinned: false, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm2', sourceId: 'youtube-creatorb', provider: 'youtube', channel: 'creatorB', kind: 'event', eventType: 'donation', event: 'Super Chat', name: 'NovaSkies',
    handle: '@novaskies', initials: 'NS', roles: ['MEMBER'], time: '8:42 PM', text: 'Can we get a tour of the new setup?', value: '$20.00',
    xp: 12840, level: 26, queued: true, pinned: true, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm3', sourceId: 'kick-creatorc', provider: 'kick', channel: 'creatorC', kind: 'chat', name: 'OrbitFox', handle: '@orbitfox',
    initials: 'OF', roles: ['OG', 'SUB'], time: '8:42 PM', text: 'All three chats in one place is going to be wild <span class="emote">🚀</span>',
    xp: 8740, level: 19, queued: false, pinned: false, capabilities: { reply: true, moderate: false, tts: true },
  },
  {
    id: 'm4', sourceId: 'discord-livechat', provider: 'discord', channel: '#live-chat', kind: 'chat', name: 'Rin', handle: '@rin',
    initials: 'RI', roles: ['CREW', 'ARTIST'], time: '8:43 PM', reply: 'Replying to Mountain: “Show me the new overlay”',
    text: 'I dropped the updated scene mockup in the design thread.', xp: 22104, level: 35, queued: false, pinned: false,
    capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm5', sourceId: 'twitch-creatora', provider: 'twitch', channel: 'creatorA', kind: 'event', eventType: 'reward', event: 'Channel Point Redeem', name: 'CometChaser',
    handle: '@cometchaser', initials: 'CC', roles: ['VIP'], time: '8:43 PM', text: 'Hydrate the captain', value: '5,000 points',
    xp: 18650, level: 31, queued: true, pinned: false, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm6', sourceId: 'spmt-xp', provider: 'spmt', channel: 'XP Ledger', kind: 'event', eventType: 'xp', event: 'SPMT XP', name: 'PixelRanger',
    handle: '@pixelranger', initials: 'PR', roles: ['VERIFIED'], time: '8:44 PM', text: 'Creator streak milestone', value: '+125 XP',
    xp: 32102, level: 42, queued: false, pinned: false, capabilities: { reply: false, moderate: false, tts: false },
  },
  {
    id: 'm7', sourceId: 'youtube-creatorb', provider: 'youtube', channel: 'creatorB', kind: 'chat', name: 'MochiByte', handle: '@mochibyte',
    initials: 'MB', roles: ['NEW'], time: '8:45 PM', text: 'First stream here—do the XP levels carry between apps?',
    xp: 0, level: 1, queued: false, pinned: false, firstTime: true, capabilities: { reply: true, moderate: true, tts: true },
  },
];

const defaultAppearance = {
  themeId: 'nebula-purple',
  glowIntensity: 80,
  starDensity: 70,
  glassOpacity: 65,
  blurStrength: 22,
  nebulaIntensity: 80,
  parallaxDepth: 65,
  borderStrength: 60,
  cornerRadius: 'md',
  density: 'comfortable',
  sidebarCollapsed: false,
  sidebarStyle: 'docked',
  sidebarPosition: 'left',
  topbarStyle: 'transparent',
  tabStyle: 'pills',
  tabPosition: 'top',
  chatTransparency: 65,
  showAvatars: true,
  smoothTransitions: true,
  pushToTalk: true,
  animation: { enabled: true, speed: 85, particles: true, shootingStars: true },
};

const defaultProduction = {
  panelRole: 'owner',
  syncGroupId: 'show-queue',
  staging: { enabled: false, trigger: 'reward', action: 'queue' },
  bindings: [],
};

const state = {
  activeSpace: demoMode ? 'friday' : 'account',
  activeDesk: demoMode ? 'live-show' : 'account',
  activeFilter: 'all',
  activeView: 'focus',
  sources: demoMode ? structuredClone(defaultSources) : [],
  sourceHealth: [],
  feedMode: demoMode ? 'synthetic' : 'loading',
  feedCursor: null,
  feedPollTimer: null,
  liveMessages: [],
  searchQuery: '',
  replayActive: false,
  selectedMessage: null,
  replyToMessageId: null,
  lastDispatchGroup: null,
  selectedDestinations: demoMode ? defaultSources.filter((source) => source.capabilities.compose).map((source) => source.id) : [],
  messages: demoMode ? initialMessages.map((message) => ({ ...message, xpLinked: message.xp > 0 })) : [],
  chatSpaces: structuredClone(demoMode ? defaultChatSpaces : accountChatSpaces),
  desks: structuredClone(demoMode ? defaultDesks : accountDesks),
  workspaceRecord: null,
  workspaceEtag: null,
  workspaceSaveTimer: null,
  discoveryStatus: null,
  constellationStep: 0,
  blackHoleArtifacts: new Set(),
  profile: null,
  etag: null,
  appearance: structuredClone(defaultAppearance),
  profileStatus: 'loading',
  production: structuredClone(defaultProduction),
  operator: null,
  operatorStatus: 'loading',
  stagedEventIds: new Set(),
  companionDevices: [],
  integrations: [],
  commands: [],
  accountXp: null,
  workspaceEditor: null,
  streamSourceId: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const providerFor = (provider) => providers[provider] || providers.app;
const providerStyle = (provider) => `--provider-rgb:${providerFor(provider).rgb}`;
const activeSources = () => {
  const space = state.chatSpaces.find((item) => item.id === state.activeSpace) || state.chatSpaces[0];
  const selected = state.sources.filter((source) => space.sources.includes(source.id));
  return selected.length || state.feedMode === 'synthetic' ? selected : state.sources;
};
const composeDestinationIds = () => activeSources()
  .filter((source) => source.capabilities?.compose)
  .map((source) => source.id);

function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), 3200);
}

function renderSpaces() {
  $('#space-list').innerHTML = state.chatSpaces.map((space) => `
    <div class="space-entry">
      <button class="space-button ${space.id === state.activeSpace ? 'active' : ''}" type="button" data-space="${space.id}">
        <span class="space-icon" style="--space-rgb:${space.rgb}">${space.icon}</span>
        <span><strong>${escapeHtml(space.name)}</strong><small>${escapeHtml(space.detail)}</small></span>
        ${space.unread ? `<span class="unread">${space.unread}</span>` : ''}
      </button>
      <button class="entry-edit" type="button" data-edit-space="${space.id}" aria-label="Edit ${escapeHtml(space.name)}">✎</button>
    </div>
  `).join('');
  $$('.space-button').forEach((button) => button.addEventListener('click', () => {
    state.activeSpace = button.dataset.space;
    const selectedSpace = state.chatSpaces.find((space) => space.id === state.activeSpace);
    state.selectedDestinations = selectedSpace?.selectedDestinationIds?.filter((id) => selectedSpace.sources.includes(id))
      || composeDestinationIds();
    state.selectedMessage = null;
    renderAll();
    scheduleWorkspaceSave();
    document.body.classList.remove('rail-open');
  }));
  $$('[data-edit-space]').forEach((button) => button.addEventListener('click', () => openWorkspaceEditor('chatspace', button.dataset.editSpace)));
}

function renderSourceChips() {
  const current = activeSources();
  const live = current.filter((source) => source.health === 'live' || source.health === 'recent').length;
  $('#source-count').textContent = state.feedMode === 'synthetic'
    ? `${current.length} preview source${current.length === 1 ? '' : 's'}`
    : `${current.length} source${current.length === 1 ? '' : 's'} · ${live} active`;
  $('#source-chips').innerHTML = current.map((source) => {
    const provider = providerFor(source.provider);
    const canWatch = !source.aggregate && ['twitch', 'youtube', 'kick'].includes(source.provider);
    return `<span class="source-chip ${source.aggregate ? 'aggregate' : ''}" style="${providerStyle(source.provider)}" title="${source.state}">
      <span class="provider-logo">${provider.short}</span>${provider.name} · ${escapeHtml(source.channel)}<span class="source-state ${source.health || ''}"></span>
      ${canWatch ? `<span class="source-stream-actions">
        <button type="button" data-open-stream="${source.id}" data-stream-mode="audio" aria-label="Listen to ${escapeHtml(source.channel)}">Audio</button>
        <button type="button" data-open-stream="${source.id}" data-stream-mode="video" aria-label="Watch ${escapeHtml(source.channel)}">Video</button>
      </span>` : ''}
    </span>`;
  }).join('');
  $$('[data-open-stream]').forEach((button) => button.addEventListener('click', () => {
    openStreamDock(button.dataset.openStream);
    if (button.dataset.streamMode) setStreamMode(button.dataset.streamMode);
  }));
  const degraded = state.sourceHealth.filter((source) => source.status === 'unavailable').map((source) => providerFor(source.platform).name);
  $('#source-health-summary').textContent = state.feedMode === 'synthetic'
    ? 'Preview data'
    : degraded.length
      ? `Unavailable: ${degraded.join(', ')}`
      : 'No source outages reported';
}

function messageCard(message, compact = false) {
  const provider = providerFor(message.provider);
  const stateTags = [
    message.pinned ? '<span class="state-tag">Pinned</span>' : '',
    message.queued ? '<span class="state-tag">Queued</span>' : '',
    message.firstTime ? '<span class="state-tag">First time</span>' : '',
    message.streamweaver?.command ? `<span class="state-tag">Command · ${escapeHtml(message.streamweaver.command.command)}</span>` : '',
  ].filter(Boolean).join('');
  const roles = message.roles.map((role, index) => `<span class="role-badge" style="--badge-rgb:${index % 2 ? '56,189,248' : provider.rgb}">${escapeHtml(role)}</span>`).join('');
  const avatar = message.avatarUrl
    ? `<img src="${escapeHtml(message.avatarUrl)}" alt="" loading="lazy">`
    : escapeHtml(message.initials);
  const media = (message.media || []).slice(0, 4).map((item) => {
    if (!item?.url) return '';
    if (['image', 'emote', 'sticker'].includes(item.type)) {
      return `<img class="message-media" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || item.type)}" loading="lazy">`;
    }
    if (item.type === 'video') {
      return `<video class="message-media message-media-video" src="${escapeHtml(item.url)}" ${item.thumbnailUrl ? `poster="${escapeHtml(item.thumbnailUrl)}"` : ''} controls playsinline preload="metadata"></video>`;
    }
    if (item.type === 'audio') {
      return `<audio class="message-media-audio" src="${escapeHtml(item.url)}" controls preload="metadata"></audio>`;
    }
    return `<a class="message-media-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.alt || 'Open link preview')}</a>`;
  }).join('');
  if (compact) {
    return `<div class="mini-message" style="${providerStyle(message.provider)}">
      <span class="message-avatar">${avatar}</span>
      <span><strong>${escapeHtml(message.name)} · ${provider.name}</strong><p>${message.event ? `${escapeHtml(message.event)}: ` : ''}${message.text.replace(/<[^>]+>/g, '')}</p></span>
    </div>`;
  }
  return `<article class="message-card ${message.kind === 'event' ? 'event' : ''} ${message.id === state.selectedMessage ? 'selected' : ''}" data-message="${message.id}" style="${providerStyle(message.provider)}">
    <span class="message-avatar">${avatar}<span class="provider-mini">${provider.short}</span></span>
    <div class="message-main">
      ${message.kind === 'event' ? `<div class="event-title">${escapeHtml(message.event)}${message.value ? `<span class="event-value">${escapeHtml(message.value)}</span>` : ''}</div>` : ''}
      <div class="message-meta"><span class="message-name">${escapeHtml(message.name)}</span>${roles}<span class="channel-label">${provider.name} · ${escapeHtml(message.channel)}</span><span class="message-time">${escapeHtml(message.time)}</span></div>
      ${message.reply ? `<div class="reply-context">${escapeHtml(message.reply)}</div>` : ''}
      <p class="message-text">${message.text}</p>
      ${media ? `<div class="message-media-row">${media}</div>` : ''}
      ${stateTags ? `<div class="state-tags">${stateTags}</div>` : ''}
    </div>
    ${message.kind !== 'event' ? '<div class="message-tools"><button type="button" aria-label="Message actions">•••</button></div>' : ''}
  </article>`;
}

function renderMessages() {
  const sourceIds = new Set(activeSources().map((source) => source.id));
  const aggregateProviders = new Set(activeSources().filter((source) => source.aggregate).map((source) => source.provider));
  const visible = state.messages.filter((message) => {
    const belongs = sourceIds.has(message.sourceId) || aggregateProviders.has(message.provider) || message.provider === 'spmt';
    if (!belongs && state.feedMode !== 'synthetic') return false;
    if (!belongs && state.activeSpace !== 'friday') return false;
    if (state.activeFilter === 'chat') return message.kind === 'chat';
    if (state.activeFilter === 'events') return message.kind === 'event';
    if (state.activeFilter === 'streamweaver') return Boolean(message.streamweaver && (
      message.streamweaver.command
      || Number(message.streamweaver.points || 0) > 0
      || (message.streamweaver.globalBadges || []).length
      || Number(message.streamweaver.cards?.total || 0) > 0
    ));
    if (state.activeFilter === 'queued') return message.queued;
    return true;
  });
  const modeLabel = state.searchQuery
    ? `History search · “${escapeHtml(state.searchQuery)}”`
    : state.replayActive
      ? 'Safe replay · last 5 minutes · automations disabled'
      : state.feedMode === 'real'
        ? 'Live Commlink feed · actions are capability-gated'
        : state.feedMode === 'degraded'
          ? 'Feed degraded · real data unavailable'
          : state.feedMode === 'signed-out'
            ? 'Sign in to load your account feed'
            : state.feedMode === 'loading'
              ? 'Loading account-scoped messages…'
              : 'Explicit demo mode · sample data';
  $('#message-feed').innerHTML = `<div class="date-separator">${modeLabel}</div>${visible.map((message) => messageCard(message)).join('') || '<div class="feed-empty">No account messages are available in this view.</div>'}`;
  $$('.message-card').forEach((card) => card.addEventListener('click', () => {
    state.selectedMessage = state.selectedMessage === card.dataset.message ? null : card.dataset.message;
    renderMessages();
    renderContext();
  }));
  $('#queue-count').textContent = String(state.messages.filter((message) => message.queued).length);
}

function renderContext() {
  const message = state.messages.find((item) => item.id === state.selectedMessage);
  $('#focus-view').classList.toggle('context-open', Boolean(message));
  $('#context-empty').classList.toggle('hidden', Boolean(message));
  $('#context-content').classList.toggle('hidden', !message);
  if (!message) return;
  const provider = providerFor(message.provider);
  const xpPercent = Math.min(100, Math.max(4, (message.xp % 1000) / 10));
  $('#context-content').innerHTML = `
    <button class="context-close" id="context-close" type="button" aria-label="Close message context">×</button>
    <div class="context-profile" style="${providerStyle(message.provider)}">
      <span class="context-avatar">${message.avatarUrl ? `<img src="${escapeHtml(message.avatarUrl)}" alt="">` : escapeHtml(message.initials)}</span>
      <h2>${escapeHtml(message.name)}</h2>
      <p>${escapeHtml(message.handle)} · ${provider.name}</p>
      <p>${message.roles.map(escapeHtml).join(' · ')}</p>
    </div>
    <div class="xp-card">
      <div class="between"><span>${message.xpLinked ? `SPMT level ${message.level}` : 'SPMT identity'}</span><strong>${message.xpLinked ? `${message.xp.toLocaleString()} XP` : 'Not linked'}</strong></div>
      <div class="xp-bar"><span style="width:${xpPercent}%"></span></div>
    </div>
    ${message.streamweaver ? `<section class="context-section streamweaver-context">
      <h3>Tenant StreamWeaver</h3>
      <div class="capability-list">
        <div class="capability"><span>Points</span><span>${escapeHtml(message.streamweaver.pointsDisplay || String(message.streamweaver.points || 0))} · level ${Number(message.streamweaver.level || 1)}</span></div>
        <div class="capability"><span>Global gym badges</span><span>${Number(message.streamweaver.globalBadges?.length || 0)}</span></div>
        <div class="capability"><span>Tenant cards</span><span>${Number(message.streamweaver.cards?.total || 0)} total · ${Number(message.streamweaver.cards?.rare || 0)} rare</span></div>
        ${message.streamweaver.command ? `<div class="capability"><span>Command event</span><span>${escapeHtml(message.streamweaver.command.command)}</span></div>` : ''}
      </div>
    </section>` : ''}
    <section class="context-section">
      <h3>Operator actions</h3>
      <div class="context-actions">
        <button type="button" data-action="reply" ${message.capabilities.reply ? '' : 'disabled'}>Reply</button>
        ${message.provider === 'twitch' && message.capabilities.moderate ? '<button type="button" data-action="timeout">Timeout 10m</button>' : ''}
        ${message.provider === 'discord' && message.capabilities.moderate ? '<button type="button" data-action="delete">Delete</button>' : ''}
        <button type="button" data-action="pin">${message.pinned ? 'Unpin' : 'Pin'}</button>
        <button type="button" data-action="queue">${message.queued ? 'Remove queue' : 'Add queue'}</button>
        <button type="button" data-action="feature">Feature</button>
        <button type="button" data-action="tts" ${message.capabilities.tts ? '' : 'disabled'}>Read TTS</button>
      </div>
    </section>
    <section class="context-section">
      <h3>${provider.name} capabilities</h3>
      <div class="capability-list">
        <div class="capability"><span>Receive rich chat</span><span>Available</span></div>
        <div class="capability ${message.capabilities.reply ? '' : 'unavailable'}"><span>Reply to source</span><span>${message.capabilities.reply ? 'Available' : 'Unavailable'}</span></div>
        <div class="capability ${message.capabilities.moderate ? '' : 'unavailable'}"><span>Moderation</span><span>${message.capabilities.moderate ? 'Scoped' : 'Unavailable'}</span></div>
        <div class="capability"><span>Connection</span><span>${state.feedMode === 'real' ? 'Live contract' : 'Preview'}</span></div>
      </div>
    </section>
    <section class="context-section">
      <h3>Identity boundary</h3>
      <p class="message-text">Provider identity is shown separately. SPMT XP appears only for a verified link in production.</p>
    </section>`;
  $('#context-close').addEventListener('click', () => {
    state.selectedMessage = null;
    renderMessages();
    renderContext();
  });
  $$('.context-actions button').forEach((button) => button.addEventListener('click', () => handleMessageAction(message, button.dataset.action)));
}

function handleMessageAction(message, action) {
  if (action === 'reply') {
    if (!message.capabilities.reply) return toast('This source does not expose a verified reply adapter.');
    state.replyToMessageId = message.id;
    state.selectedDestinations = [message.sourceId];
    $('#routing-note').textContent = `Reply locked to ${providerFor(message.provider).name}/${message.channel}`;
    renderDestinations();
    $('#compose-input').focus();
    return;
  }
  if (['timeout', 'delete'].includes(action)) {
    if (!message.capabilities.moderate) return toast('Moderation is unavailable for this source.');
    const prompt = action === 'timeout'
      ? `Timeout ${message.name} on ${message.channel} for 10 minutes?`
      : `Delete this Discord message from ${message.channel}?`;
    if (window.confirm(prompt)) dispatchMessageAction(message, action);
    return;
  }
  if (state.feedMode === 'real' && ['pin', 'queue', 'feature', 'tts'].includes(action)) {
    const operatorAction = action === 'pin'
      ? (message.pinned ? 'unpin' : 'pin')
      : action === 'queue'
        ? (message.queued ? 'unqueue' : 'queue')
        : action === 'tts'
          ? 'speak'
          : action;
    return runOperatorAction(operatorAction, message);
  }
  if (action === 'pin') message.pinned = !message.pinned;
  if (action === 'queue') message.queued = !message.queued;
  if (action === 'feature') toast(`Preview: ${message.name}'s message targeted to “main-feature”`);
  if (action === 'tts') toast(`Preview: ${message.name}'s message added to the Friday Stream TTS queue`);
  renderMessages();
  renderContext();
}

function renderDestinations() {
  const active = activeSources();
  const replyMessage = state.replyToMessageId
    ? state.messages.find((message) => message.id === state.replyToMessageId)
    : null;
  const replySource = replyMessage
    ? state.sources.find((source) => source.id === replyMessage.sourceId)
    : null;
  if (replySource && !active.some((source) => source.id === replySource.id)) active.unshift(replySource);
  state.selectedDestinations = state.selectedDestinations.filter((id) => active.some((source) => source.id === id));
  $('#destination-chips').innerHTML = active.map((source) => {
    const provider = providerFor(source.provider);
    const selected = state.selectedDestinations.includes(source.id);
    const sendable = Boolean(source.capabilities?.compose);
    return `<button class="destination-chip ${selected ? '' : 'inactive'}" style="${providerStyle(source.provider)}" type="button" data-toggle-destination="${source.id}" ${sendable ? '' : 'disabled'} title="${sendable ? 'Highlight to include in the next message' : 'Connected read-only source'}">${provider.name}/${escapeHtml(source.channel)}</button>`;
  }).join('');
  $('#send-label').textContent = `${state.replyToMessageId ? 'Reply' : 'Send'} → ${state.selectedDestinations.length}`;
  $$('[data-toggle-destination]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.toggleDestination;
    state.replyToMessageId = null;
    state.selectedDestinations = state.selectedDestinations.includes(id)
      ? state.selectedDestinations.filter((item) => item !== id)
      : [...state.selectedDestinations, id];
    rememberSpaceDestinations();
    renderDestinations();
    scheduleWorkspaceSave();
  }));
}

function renderDesk() {
  const activeDesk = state.desks.find((desk) => desk.id === state.activeDesk) || state.desks[0];
  const panels = activeDesk?.panels || [];
  const hidden = new Set(activeDesk?.hiddenSourceIds || []);
  const deskSourceIds = new Set(panels.flatMap((panel) => state.chatSpaces.find((space) => space.id === panel.chatSpaceId)?.sources || []));
  const deskSources = state.sources.filter((source) => deskSourceIds.has(source.id));
  $('#desk-tabs').innerHTML = deskSources.map((source) => {
    const provider = providerFor(source.provider);
    return `<span class="desk-tab-wrap">
      <button class="desk-tab ${hidden.has(source.id) ? 'hidden-source' : ''}" type="button" data-toggle-desk-source="${source.id}" style="${providerStyle(source.provider)}">
        <span class="provider-logo">${provider.short}</span>${provider.name} · ${escapeHtml(source.channel)}
      </button>
      ${['twitch', 'youtube', 'kick', 'tiktok'].includes(source.provider) ? `<button class="desk-listen" type="button" data-open-stream="${source.id}" aria-label="Listen to ${escapeHtml(source.channel)}">▶</button>` : ''}
    </span>`;
  }).join('') || '<span class="feed-empty">Add a ChatSpace to this Desk to expose its connected tabs.</span>';
  $('#desk-grid').innerHTML = panels.map((panel, index) => {
    const space = state.chatSpaces.find((item) => item.id === panel.chatSpaceId);
    if (!space) return '';
    const sourceIds = new Set(space.sources.filter((id) => !hidden.has(id)));
    const aggregateProviders = new Set(state.sources
      .filter((source) => source.aggregate && sourceIds.has(source.id))
      .map((source) => source.provider));
    const visibleMessages = state.messages.filter((message) => (
      sourceIds.has(message.sourceId)
      || aggregateProviders.has(message.provider)
      || (message.provider === 'spmt' && sourceIds.has('spmt-direct'))
    )).slice(-30);
    const bridgeCount = (space.bridgeSourceIds || []).filter((id) => sourceIds.has(id)).length;
    return `<section class="desk-panel" data-constellation-panel="${index}">
      <header class="desk-panel-header">
        <span><strong>${escapeHtml(space.name)}</strong><small>${escapeHtml(panel.accessMode || 'owner')} · ${bridgeCount > 1 ? `${bridgeCount} bridged` : 'separate chats'}</small></span>
        <span class="desk-panel-actions">
          <button type="button" data-open-space="${space.id}">Open</button>
          <button type="button" data-constellation-step="${index}">${escapeHtml(panel.label || `panel-${index + 1}`)}</button>
        </span>
      </header>
      <div class="desk-panel-body">${visibleMessages.map((message) => messageCard(message, true)).join('') || '<div class="feed-empty">No messages in this ChatSpace yet.</div>'}</div>
    </section>`;
  }).join('') || '<div class="feed-empty">This Desk is empty. Edit it to add one or more ChatSpaces.</div>';
  $$('[data-toggle-desk-source]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.toggleDeskSource;
    activeDesk.hiddenSourceIds = hidden.has(id) ? [...hidden].filter((item) => item !== id) : [...hidden, id];
    renderDesk();
    scheduleWorkspaceSave();
  }));
  $$('#desk-tabs [data-open-stream]').forEach((button) => button.addEventListener('click', () => openStreamDock(button.dataset.openStream)));
  $$('[data-open-space]').forEach((button) => button.addEventListener('click', () => {
    state.activeSpace = button.dataset.openSpace;
    state.activeView = 'focus';
    updateView();
    renderAll();
  }));
  $$('[data-constellation-step]').forEach((button) => button.addEventListener('click', () => handleConstellationStep(Number(button.dataset.constellationStep))));
}

function renderDeskSelection() {
  const activeDesk = state.desks.find((desk) => desk.id === state.activeDesk);
  $('#desk-name').textContent = activeDesk?.name || 'Live Show';
  $('#desk-list').innerHTML = state.desks.map((desk) => `
    <div class="space-entry">
      <button class="desk-card ${desk.id === state.activeDesk ? 'active' : ''}" type="button" data-desk="${desk.id}">
        <span class="desk-icon">⌘</span>
        <span><strong>${escapeHtml(desk.name)}</strong><small>${desk.panels.length} ChatSpace${desk.panels.length === 1 ? '' : 's'}</small></span>
      </button>
      <button class="entry-edit" type="button" data-edit-desk="${desk.id}" aria-label="Edit ${escapeHtml(desk.name)}">✎</button>
    </div>`).join('');
  $$('[data-desk]').forEach((button) => button.addEventListener('click', () => {
    state.activeDesk = button.dataset.desk;
    renderAll();
    scheduleWorkspaceSave();
  }));
  $$('[data-edit-desk]').forEach((button) => button.addEventListener('click', () => openWorkspaceEditor('desk', button.dataset.editDesk)));
}

function renderAll() {
  const space = state.chatSpaces.find((item) => item.id === state.activeSpace) || state.chatSpaces[0];
  $('#space-title').textContent = space.name;
  renderSpaces();
  renderSourceChips();
  renderMessages();
  renderContext();
  renderDestinations();
  renderDesk();
  renderDeskSelection();
}

function showMentionMenu(mode = 'single') {
  const menu = $('#mention-menu');
  const sendable = activeSources().filter((source) => source.capabilities?.compose);
  menu.innerHTML = sendable.map((source) => {
    const provider = providerFor(source.provider);
    const selected = state.selectedDestinations.includes(source.id);
    return `<button class="mention-option" type="button" data-mention="${source.id}" data-mode="${mode}" style="${providerStyle(source.provider)}">
      <span class="provider-logo">${provider.short}</span><span>${provider.name}/${source.channel}<small>${mode === 'single' ? 'Target only this destination' : selected ? 'Selected · click to remove' : 'Click to add'}</small></span><small>${source.state}</small>
    </button>`;
  }).join('') || '<div class="feed-empty">No provider currently has a verified compose adapter.</div>';
  menu.classList.remove('hidden');
  $$('.mention-option').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.mode === 'single') {
      state.selectedDestinations = [button.dataset.mention];
      state.replyToMessageId = null;
      $('#routing-note').textContent = 'Single destination selected with @channel routing';
    } else if (state.selectedDestinations.includes(button.dataset.mention)) {
      state.selectedDestinations = state.selectedDestinations.filter((id) => id !== button.dataset.mention);
    } else {
      state.selectedDestinations = [...state.selectedDestinations, button.dataset.mention];
    }
    rememberSpaceDestinations();
    const input = $('#compose-input');
    if (button.dataset.mode === 'single') {
      input.value = input.value.replace(/(^|\s)@\S*$/, '$1');
      menu.classList.add('hidden');
    } else {
      showMentionMenu('toggle');
    }
    renderDestinations();
    scheduleWorkspaceSave();
    input.focus();
  }));
}

function showCommandMenu() {
  const menu = $('#mention-menu');
  menu.innerHTML = state.commands.map((command) => `
    <button class="mention-option" type="button" data-command="${escapeHtml(command.command)}">
      <span class="provider-logo" style="--provider-rgb:167,139,250">⌘</span>
      <span>${escapeHtml(command.command)}<small>${escapeHtml(command.description || command.name)}</small></span>
      <small>${escapeHtml(command.group || 'custom')}</small>
    </button>`).join('') || '<div class="feed-empty">No enabled tenant commands were returned by StreamWeaver.</div>';
  menu.classList.remove('hidden');
  $$('[data-command]').forEach((button) => button.addEventListener('click', () => {
    $('#compose-input').value = `${button.dataset.command} `;
    menu.classList.add('hidden');
    $('#compose-input').focus();
  }));
}

function openSendPreview() {
  const input = $('#compose-input');
  const message = input.value.trim();
  if (!message) return toast('Type a message before opening the destination preview.');
  if (!state.selectedDestinations.length) return toast('Select at least one destination.');
  const selected = state.selectedDestinations.map((id) => state.sources.find((source) => source.id === id)).filter(Boolean);
  if (selected.some((source) => !source.capabilities?.compose)) {
    return toast('Remove destinations that do not have a verified compose adapter.');
  }
  $('#modal-message').textContent = message;
  $('#modal-destinations').innerHTML = state.selectedDestinations.map((id) => {
    const source = state.sources.find((item) => item.id === id);
    if (!source) return '';
    const provider = providerFor(source.provider);
    return `<div class="modal-destination" style="${providerStyle(source.provider)}">
      <span class="provider-logo">${provider.short}</span>
      <span><strong>${provider.name} · ${source.channel}</strong><small>${source.state}</small></span>
      <span>${source.capabilities?.compose ? 'Ready' : 'Unavailable'}</span>
    </div>`;
  }).join('');
  $('#simulate-send').textContent = state.feedMode === 'real' ? (state.replyToMessageId ? 'Send source-locked reply' : 'Send deliberately') : 'Simulate send';
  $('#simulate-send').dataset.receiptMode = '';
  $('#send-safety-note').innerHTML = state.feedMode === 'real'
    ? '<span>✓</span> Every destination receives its own idempotent request and receipt. Partial failure never appears as a complete send.'
    : '<span>✓</span> Synthetic preview mode never contacts a provider.';
  $('#send-modal').classList.remove('hidden');
}

async function simulateSend() {
  if (state.feedMode === 'real') return dispatchComposer();
  const destinationNames = state.selectedDestinations.map((id) => state.sources.find((source) => source.id === id)?.channel).filter(Boolean);
  state.messages.push({
    id: `preview-${Date.now()}`, provider: 'spmt', channel: 'Operator preview', kind: 'chat', name: 'Mountain Crew',
    handle: '@mountaincrew', initials: 'MT', roles: ['OPERATOR', 'PREVIEW'], time: 'Now',
    text: `${escapeHtml($('#compose-input').value.trim())}<div class="reply-context">Synthetic destinations: ${destinationNames.join(', ')}</div>`,
    xp: 0, level: 1, queued: false, pinned: false, capabilities: { reply: false, moderate: false, tts: false },
  });
  $('#compose-input').value = '';
  $('#send-modal').classList.add('hidden');
  renderMessages();
  $('#message-feed').scrollTop = $('#message-feed').scrollHeight;
  toast('Synthetic message added. No provider request was made.');
}

function dispatchDestination(source) {
  return { platform: source.provider, channelId: source.channelId, channelName: source.channel };
}

async function requestCommlinkDispatch(body) {
  const response = await fetch('/api/commlink/dispatch', {
    method: 'POST',
    headers: commlinkAuthHeaders({ 'content-type': 'application/json' }),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) throw new Error(result.error || `Commlink dispatch returned ${response.status}`);
  return result;
}

function renderDispatchReceipts(group) {
  state.lastDispatchGroup = group;
  $('#modal-destinations').innerHTML = (group.receipts || []).map((receipt) => {
    const provider = providerFor(receipt.destination.platform);
    const failed = receipt.status !== 'delivered';
    return `<div class="modal-destination ${failed ? 'receipt-failed' : 'receipt-delivered'}" style="${providerStyle(receipt.destination.platform)}">
      <span class="provider-logo">${provider.short}</span>
      <span><strong>${provider.name} · ${escapeHtml(receipt.destination.channelName)}</strong><small>${failed ? escapeHtml(receipt.error?.message || 'Delivery failed') : 'Provider receipt recorded'}</small></span>
      <span>${failed ? 'Failed' : 'Delivered'}</span>
    </div>`;
  }).join('');
  $('#send-safety-note').innerHTML = `<span>${group.status === 'delivered' ? '✓' : '!'}</span> ${group.delivered} delivered · ${group.failed} failed.`;
  $('#simulate-send').textContent = group.failed ? 'Retry failed only' : 'Done';
  $('#simulate-send').dataset.receiptMode = group.failed ? 'retry' : 'done';
}

async function dispatchComposer() {
  const button = $('#simulate-send');
  if (button.dataset.receiptMode === 'done') {
    $('#send-modal').classList.add('hidden');
    button.dataset.receiptMode = '';
    return;
  }
  if (button.dataset.receiptMode === 'retry') {
    button.disabled = true;
    try {
      const response = await fetch(`/api/commlink/dispatch/${encodeURIComponent(state.lastDispatchGroup.groupId)}/retry`, {
        method: 'POST',
        headers: commlinkAuthHeaders(),
        credentials: 'include',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) throw new Error(result.error || 'Retry failed');
      renderDispatchReceipts(result);
    } catch (error) {
      toast(error.message || 'Retry failed');
    } finally {
      button.disabled = false;
    }
    return;
  }

  const sources = state.selectedDestinations.map((id) => state.sources.find((source) => source.id === id)).filter(Boolean);
  button.disabled = true;
  button.textContent = 'Dispatching…';
  try {
    const result = await requestCommlinkDispatch({
      idempotencyKey: crypto.randomUUID(),
      action: state.replyToMessageId ? 'reply' : 'compose',
      message: $('#compose-input').value.trim(),
      eventId: state.replyToMessageId || undefined,
      destinations: sources.map(dispatchDestination),
    });
    renderDispatchReceipts(result);
    if (result.delivered) {
      $('#compose-input').value = '';
      state.replyToMessageId = null;
      $('#routing-note').textContent = 'Replies remain source-locked';
    }
  } catch (error) {
    toast(error.message || 'Commlink dispatch failed');
    button.textContent = state.replyToMessageId ? 'Send source-locked reply' : 'Send deliberately';
  } finally {
    button.disabled = false;
  }
}

async function dispatchMessageAction(message, action) {
  const source = state.sources.find((item) => item.id === message.sourceId);
  if (!source) return toast('The source destination is no longer available.');
  try {
    const result = await requestCommlinkDispatch({
      idempotencyKey: crypto.randomUUID(),
      action,
      eventId: message.id,
      durationSeconds: action === 'timeout' ? 600 : undefined,
      destinations: [dispatchDestination(source)],
    });
    const receipt = result.receipts?.[0];
    toast(receipt?.status === 'delivered' ? `${action} completed with a provider receipt.` : receipt?.error?.message || `${action} failed.`);
  } catch (error) {
    toast(error.message || `${action} failed`);
  }
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

function normalizeProviderMentions(text, item) {
  let normalized = String(text || '');
  const candidates = [
    item?.mentions,
    item?.meta?.mentions,
    item?.meta?.mentionedUsers,
    item?.meta?.mentioned_users,
  ];
  const directory = new Map();
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      candidate.forEach((mention) => {
        const id = String(mention?.id || mention?.userId || '').trim();
        const name = String(mention?.displayName || mention?.global_name || mention?.username || mention?.name || '').trim();
        if (id && name) directory.set(id, name);
      });
    } else if (candidate && typeof candidate === 'object') {
      Object.entries(candidate).forEach(([id, value]) => {
        const name = typeof value === 'string'
          ? value
          : String(value?.displayName || value?.global_name || value?.username || value?.name || '').trim();
        if (id && name) directory.set(String(id), name);
      });
    }
  }
  normalized = normalized.replace(/<@!?(\d+)>/g, (token, id) => directory.has(id) ? `@${directory.get(id)}` : token);
  return normalized;
}

function canonicalProvider(item) {
  const raw = item?.platform === 'social-stream'
    ? String(item?.meta?.rawProvider || '').toLowerCase()
    : String(item?.platform || '').toLowerCase();
  if (providers[raw]) return raw === 'app' ? 'spmt' : raw;
  return item?.platform === 'app' ? 'spmt' : 'social-stream';
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function eventLabel(item) {
  const labels = {
    donation: 'Donation',
    membership: 'Membership',
    reward: 'Channel Point Redeem',
    raid: 'Raid',
    follow: 'Follow',
    delete: 'Message deleted',
    edit: 'Message edited',
    system: 'App event',
    voice: 'Voice message',
  };
  return labels[item.type] || String(item.type || 'Event').replaceAll('-', ' ');
}

function eventValue(item) {
  if (item.donation?.display) return String(item.donation.display);
  if (item.donation?.amount != null) return `${item.donation.amount} ${item.donation.currency || ''}`.trim();
  if (item.membership?.tier) return String(item.membership.tier);
  if (item.reward?.cost != null) return `${Number(item.reward.cost).toLocaleString()} points`;
  return '';
}

function normalizeFeedItem(item) {
  const provider = canonicalProvider(item);
  const timestamp = new Date(item.originalTimestamp || item.receivedTimestamp || Date.now());
  const displayName = String(item.sender?.displayName || item.sender?.login || 'Unknown');
  const badgeLabels = (item.sender?.badges || []).map((badge) => badge.label || badge.id);
  const roles = Array.from(new Set([...(item.sender?.roles || []), ...badgeLabels]))
    .filter(Boolean)
    .slice(0, 8)
    .map((role) => String(role).replaceAll('_', ' ').toUpperCase());
  const avatarUrl = safeHttpUrl(item.sender?.avatarUrl);
  const media = (item.media || []).map((entry) => ({
    ...entry,
    url: safeHttpUrl(entry.url),
    thumbnailUrl: safeHttpUrl(entry.thumbnailUrl),
  })).filter((entry) => entry.url);
  const isChat = ['message', 'action', 'reply', 'edit'].includes(item.type);
  return {
    id: String(item.eventId),
    sourceId: `${provider}:${item.channelId}`,
    provider,
    channel: String(item.channelName || item.sourceName || item.channelId || 'unknown'),
    channelId: String(item.channelId || ''),
    upstreamId: String(item.upstreamId || ''),
    kind: isChat ? 'chat' : 'event',
    eventType: String(item.type || 'message'),
    event: isChat ? null : eventLabel(item),
    value: eventValue(item),
    name: displayName,
    handle: item.sender?.login ? `@${item.sender.login}` : displayName,
    initials: displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?',
    avatarUrl,
    roles,
    time: Number.isNaN(timestamp.getTime()) ? 'Unknown' : timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    timestamp: Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString(),
    reply: item.reply?.text ? `Replying to ${item.reply.senderName || 'message'}: “${item.reply.text}”` : '',
    text: escapeHtml(normalizeProviderMentions(item.text, item)).replaceAll('\n', '<br>'),
    media,
    streamweaver: item.meta?.streamweaver && typeof item.meta.streamweaver === 'object' ? item.meta.streamweaver : null,
    xp: Number(item.meta?.spmtXp || 0),
    level: Number(item.meta?.spmtLevel || 1),
    xpLinked: Boolean(item.meta && Object.prototype.hasOwnProperty.call(item.meta, 'spmtXp')),
    queued: false,
    pinned: false,
    firstTime: Boolean(item.meta?.firstTime || item.meta?.first_time),
    capabilities: {
      reply: Boolean(item.routing?.canReply),
      moderate: provider === 'twitch' || provider === 'discord',
      tts: provider !== 'spmt',
    },
  };
}

function applyFeedSources(payload) {
  const previousSources = new Map(state.sources.map((source) => [source.id, source]));
  state.sourceHealth = Array.isArray(payload.sources) ? payload.sources : [];
  const healthByProvider = new Map(state.sourceHealth.map((source) => [source.platform, source]));
  const channelSources = (Array.isArray(payload.channels) ? payload.channels : []).map((channel) => {
    const provider = canonicalProvider({ platform: channel.platform });
    const health = healthByProvider.get(channel.platform) || healthByProvider.get(provider) || {};
    return {
      id: `${provider}:${channel.channelId}`,
      provider,
      channel: String(channel.channelName || channel.sourceName || channel.channelId),
      channelId: String(channel.channelId || ''),
      capabilities: channel.capabilities || { compose: false, reply: false, timeout: false, delete: false },
      state: `${String(health.status || 'idle')} · ${channel.capabilities?.compose ? 'can send' : 'read only'}`,
      health: health.status || 'idle',
      readOnly: !channel.capabilities?.compose,
    };
  });
  const unique = Array.from(new Map(channelSources.map((source) => [source.id, source])).values());
  for (const provider of ['discord', 'twitch']) {
    const providerSources = unique.filter((source) => source.provider === provider);
    if (!providerSources.length) continue;
    unique.unshift({
      id: `${provider}:all`,
      provider,
      channel: `All ${providerFor(provider).name} channels`,
      channelId: '',
      capabilities: { compose: false, reply: true, timeout: false, delete: false },
      state: 'Combined read view · replies stay source-locked',
      health: providerSources.some((source) => source.health === 'live') ? 'live' : 'recent',
      readOnly: true,
      aggregate: true,
    });
  }
  for (const health of state.sourceHealth) {
    const provider = canonicalProvider({ platform: health.platform });
    if (!health.runtimeConnected || !providers[provider] || unique.some((source) => source.provider === provider)) continue;
    unique.push({
      id: `${provider}:status`,
      provider,
      channel: health.status === 'live' ? 'Connected · awaiting messages' : 'No recent channel',
      state: `${health.status} · read only`,
      health: health.status,
      readOnly: true,
      capabilities: { compose: false, reply: false, timeout: false, delete: false },
    });
  }
  const sourceByProviderChannel = new Map(unique.map((source) => [`${source.provider}:${String(source.channelId || source.channel).toLowerCase()}`, source.id]));
  state.chatSpaces.forEach((space) => {
    const remap = (ids) => Array.from(new Set((ids || []).map((id) => {
      if (unique.some((source) => source.id === id)) return id;
      const previous = previousSources.get(id);
      return previous ? sourceByProviderChannel.get(`${previous.provider}:${String(previous.channelId || previous.channel).toLowerCase()}`) : null;
    }).filter(Boolean)));
    space.sources = remap(space.sources);
    space.selectedDestinationIds = remap(space.selectedDestinationIds);
    space.bridgeSourceIds = remap(space.bridgeSourceIds);
    space.detail = `${space.sources.length} connection${space.sources.length === 1 ? '' : 's'} · ${(space.bridgeSourceIds || []).length > 1 ? `${space.bridgeSourceIds.length} bridged` : 'separate'}`;
  });
  state.sources = unique;
  state.selectedDestinations = state.selectedDestinations.filter((id) => unique.some((source) => source.id === id));
}

function setFeedBanner(mode, detail) {
  state.feedMode = mode;
  $('#feed-banner-detail').textContent = detail;
}

function mergeFeedMessages(incoming) {
  const byId = new Map(state.liveMessages.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  state.liveMessages = Array.from(byId.values())
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')))
    .slice(-200);
}

function scheduleFeedPoll() {
  clearTimeout(state.feedPollTimer);
  if (demoMode || state.feedMode === 'signed-out' || state.searchQuery || state.replayActive) return;
  state.feedPollTimer = setTimeout(() => loadCommlinkFeed({ incremental: true }), 5_000);
}

async function loadCommlinkFeed({ incremental = false, query = '', replayMinutes = 0 } = {}) {
  if (demoMode) {
    setFeedBanner('synthetic', 'Explicit demo mode · sample data only · no provider writes');
    renderAll();
    return;
  }
  const params = new URLSearchParams({ limit: query ? '100' : '200' });
  if (query) params.set('q', query);
  if (replayMinutes) params.set('since', new Date(Date.now() - replayMinutes * 60_000).toISOString());
  if (incremental && state.feedCursor) params.set('since', state.feedCursor);
  if (!incremental) setFeedBanner(state.feedMode, query ? 'Searching bounded account history…' : replayMinutes ? 'Loading safe five-minute replay…' : 'Loading real account feeds…');
  try {
    const response = await fetch(`/api/commlink/feed?${params}`, {
      headers: commlinkAuthHeaders(),
      credentials: 'include',
    });
    if (response.status === 401) {
      state.messages = [];
      state.sources = [];
      setFeedBanner('signed-out', 'Sign in to load your account-scoped Commlink feed');
      renderAll();
      return;
    }
    if (!response.ok) throw new Error(`Commlink feed returned ${response.status}`);
    const payload = await response.json();
    state.commands = Array.isArray(payload.commands) ? payload.commands : state.commands;
    const normalized = (payload.items || []).map(normalizeFeedItem);
    applyFeedSources(payload);
    state.feedCursor = payload.nextSince || state.feedCursor;
    if (query) {
      state.searchQuery = query;
      state.replayActive = false;
      state.messages = normalized;
      $('#history-search-status').textContent = `${normalized.length} result${normalized.length === 1 ? '' : 's'} in the bounded account history window.`;
    } else if (replayMinutes) {
      state.searchQuery = '';
      state.replayActive = true;
      state.messages = normalized;
    } else {
      state.searchQuery = '';
      state.replayActive = false;
      if (incremental) mergeFeedMessages(normalized);
      else state.liveMessages = normalized;
      state.messages = [...state.liveMessages];
      await applySmartStaging(normalized);
    }
    const degraded = payload.upstream?.streamweaver?.status !== 'ready';
    setFeedBanner('real', degraded
      ? 'SPMT records live · StreamWeaver feed degraded · outbound adapters unavailable'
      : 'Real Twitch, Kick, YouTube, Discord, and SPMT feeds · writes require exact receipts');
    $('#replay-button').textContent = state.replayActive ? '● Return live' : '↻ Replay 5m';
    renderAll();
  } catch {
    if (!state.liveMessages.length) state.messages = [];
    setFeedBanner('degraded', 'Real feed temporarily unavailable · no sample messages substituted');
    renderAll();
  } finally {
    scheduleFeedPoll();
  }
}

function clearHistoryMode() {
  state.searchQuery = '';
  state.replayActive = false;
  $('#history-query').value = '';
  $('#history-search').classList.add('hidden');
  loadCommlinkFeed();
}

function activePanel() {
  const desk = state.desks.find((item) => item.id === state.activeDesk) || state.desks[0];
  return desk?.panels?.find((panel) => panel.chatSpaceId === state.activeSpace) || desk?.panels?.[0] || null;
}

function canRunOperatorAction(action) {
  const role = state.production.panelRole || activePanel()?.accessMode || 'owner';
  if (role === 'view-only') return false;
  if (role === 'queue-only') return ['queue', 'unqueue', 'next'].includes(action);
  if (role === 'pinned-only') return ['pin', 'unpin'].includes(action);
  if (role === 'helper') return ['pin', 'unpin', 'queue', 'unqueue', 'feature', 'next', 'clear', 'speak'].includes(action);
  return true;
}

async function requestOperator(body) {
  const token = localStorage.getItem('spmt_token');
  if (!token) throw new Error('Sign in to use tenant show controls.');
  const response = await fetch('/api/commlink/operator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || result.error || `Operator action returned ${response.status}`);
  return result;
}

function syncMessagesFromOperator() {
  const operator = state.operator?.state;
  if (!operator) return;
  const pinned = new Set(operator.pinnedEventIds || []);
  const queued = new Set(operator.queuedEventIds || []);
  state.messages.forEach((message) => {
    message.pinned = pinned.has(message.id);
    message.queued = queued.has(message.id);
  });
}

async function runOperatorAction(action, message = null, idempotencyKey = crypto.randomUUID()) {
  if (!canRunOperatorAction(action)) return toast(`${state.production.panelRole} mode cannot run ${action}.`);
  try {
    const result = await requestOperator({
      idempotencyKey,
      action,
      eventId: message?.id,
      message: action === 'speak' ? String(message?.text || $('#tts-text')?.value || '').replace(/<[^>]+>/g, '') : undefined,
    });
    if (result.result?.state) state.operator = { ...(state.operator || {}), state: result.result.state };
    if (result.status === 'skipped') toast(result.result?.reason || 'TTS skipped because no listener is active.');
    else toast(`${action} completed with a durable operator receipt.`);
    syncMessagesFromOperator();
    renderAll();
    renderProductionDock();
    return result;
  } catch (error) {
    toast(error.message || `${action} failed`);
    return null;
  }
}

async function loadOperator() {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    state.operatorStatus = 'signed-out';
    renderProductionDock();
    return;
  }
  state.operatorStatus = 'loading';
  renderProductionDock();
  try {
    const response = await fetch('/api/commlink/operator', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Operator runtime returned ${response.status}`);
    state.operator = await response.json();
    state.operatorStatus = 'ready';
    syncMessagesFromOperator();
  } catch (error) {
    state.operatorStatus = 'degraded';
    state.operator = { error: error.message };
  }
  renderAll();
  renderProductionDock();
}

function stagingMatches(message, trigger) {
  if (trigger === 'first-time') return message.firstTime === true;
  if (trigger === 'reward') return ['reward', 'redeem'].includes(message.eventType);
  return message.eventType === trigger;
}

async function applySmartStaging(messages) {
  const rule = state.production.staging;
  if (!rule?.enabled || state.searchQuery || state.replayActive) return;
  const candidates = messages
    .filter((message) => stagingMatches(message, rule.trigger))
    .filter((message) => !state.stagedEventIds.has(`${rule.action}:${message.id}`))
    .slice(0, 8);
  for (const message of candidates) {
    const key = `${rule.action}:${message.id}`;
    state.stagedEventIds.add(key);
    await runOperatorAction(rule.action, message, `staging:${state.activeSpace}:${key}`.slice(0, 160));
  }
}

function dryRunStaging() {
  const rule = state.production.staging;
  const matches = state.messages.filter((message) => stagingMatches(message, rule.trigger));
  $('#rule-result').textContent = matches.length
    ? `${matches.length} typed match${matches.length === 1 ? '' : 'es'}: ${matches.slice(0, 4).map((item) => item.name).join(', ')}. No action was executed.`
    : 'No typed events in the current bounded feed match this rule. No action was executed.';
}

function eventMetric(label, count) {
  return `<div class="event-metric"><strong>${count}</strong><small>${label}</small></div>`;
}

function renderProductionDock() {
  const health = $('#operator-health');
  if (!health) return;
  const ready = state.operatorStatus === 'ready';
  health.className = `production-status ${ready ? 'live' : state.operatorStatus === 'degraded' ? 'degraded' : ''}`;
  health.innerHTML = `<span class="live-pulse"></span><span><strong>${ready ? 'Tenant show controls ready' : state.operatorStatus === 'signed-out' ? 'Sign in for show controls' : state.operatorStatus === 'degraded' ? 'Show controls degraded' : 'Checking StreamWeaver controls'}</strong><small>${ready ? 'Actions return durable SPMT receipts.' : state.operator?.error || 'Pin, queue, feature, TTS, and OBS remain tenant scoped.'}</small></span>`;
  $('#panel-role').value = state.production.panelRole;
  $('#sync-group').value = state.production.syncGroupId || '';
  $('#staging-enabled').checked = state.production.staging.enabled;
  $('#staging-trigger').value = state.production.staging.trigger;
  $('#staging-action').value = state.production.staging.action;

  const operator = state.operator?.state || {};
  $('#queue-health').textContent = ready ? 'Live' : 'Unavailable';
  $('#show-stats').innerHTML = [
    ['Pinned', operator.pinnedEventIds?.length || 0],
    ['Queued', operator.queuedEventIds?.length || 0],
    ['Featured', operator.featuredEventId ? 1 : 0],
  ].map(([label, count]) => `<div class="show-stat"><strong>${count}</strong><small>${label}</small></div>`).join('');

  const counts = state.messages.reduce((result, message) => {
    const type = message.firstTime ? 'first-time' : message.eventType || (message.kind === 'event' ? 'event' : 'chat');
    result[type] = (result[type] || 0) + 1;
    return result;
  }, {});
  $('#event-metrics').innerHTML = [
    eventMetric('Redeems', (counts.reward || 0) + (counts.redeem || 0)),
    eventMetric('Donations', counts.donation || 0),
    eventMetric('Members', counts.membership || 0),
    eventMetric('Raids', counts.raid || 0),
    eventMetric('First time', counts['first-time'] || 0),
    eventMetric('SPMT events', state.messages.filter((message) => message.provider === 'spmt' && message.kind === 'event').length),
  ].join('');

  const outputs = state.operator?.outputs || [];
  $('#named-outputs').innerHTML = outputs.length ? outputs.map((output) => `
    <div class="output-item"><span><strong>${escapeHtml(output.label)}</strong><small>${escapeHtml(output.kind)} · ${output.readOnly ? 'read only' : 'controlled'}</small></span><a href="${escapeHtml(output.url)}" target="_blank" rel="noopener">Open output</a></div>
  `).join('') : '<p class="setting-help">No named output is available for this account right now.</p>';
  $('#companion-status').textContent = state.companionDevices.length
    ? `${state.companionDevices.filter((device) => device.online).length} of ${state.companionDevices.length} paired devices online. ${state.production.bindings.length} binding(s) saved.`
    : `No paired device detected. ${state.production.bindings.length} binding(s) saved for later.`;
  $('#integration-list').innerHTML = state.integrations.length ? state.integrations.map((adapter) => `
    <div class="integration-item"><span><strong>${escapeHtml(adapter.owner)}</strong><small>${escapeHtml(adapter.status)} · ${adapter.capabilities.map(escapeHtml).join(', ')}</small></span><a href="${escapeHtml(adapter.deepLink)}">Open</a></div>
  `).join('') : '<p class="setting-help">App adapter status is unavailable. Native owner links remain above.</p>';
}

async function loadIntegrations() {
  const token = localStorage.getItem('spmt_token');
  if (!token) return;
  try {
    const response = await fetch('/api/commlink/integrations', { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) state.integrations = (await response.json()).adapters || [];
  } catch {}
  renderProductionDock();
}

async function loadCompanionDevices() {
  const token = localStorage.getItem('spmt_token');
  if (!token) return;
  try {
    const response = await fetch('/api/companion/devices', { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) state.companionDevices = (await response.json()).devices || [];
  } catch {}
  renderProductionDock();
}

function saveControlBinding() {
  const input = $('#control-input').value;
  const action = $('#control-action').value;
  state.production.bindings = [
    ...state.production.bindings.filter((binding) => binding.input !== input),
    { input, action, panelLabel: activePanel()?.label || 'main-chat' },
  ].slice(-24);
  scheduleWorkspaceSave();
  renderProductionDock();
  toast('Scoped control binding saved to the Commlink workspace.');
}

async function runControlBinding() {
  const action = $('#control-action').value;
  if (action === 'feature-next') return runOperatorAction('next');
  if (action === 'clear-feature') return runOperatorAction('clear');
  const device = state.companionDevices.find((item) => item.online) || state.companionDevices[0];
  if (!device) return toast('Pair and start Companion before running this mapping.');
  const token = localStorage.getItem('spmt_token');
  const payload = action === 'popout.show' ? { id: 1 } : {};
  try {
    const response = await fetch('/api/companion/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId: device.id, action, capability: action === 'companion.status' ? 'companion.status' : 'overlay.control', payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Companion returned ${response.status}`);
    $('#companion-status').textContent = `Command ${result.command.status}; receipt ${result.command.id}.`;
  } catch (error) {
    toast(error.message || 'Companion command failed');
  }
}

function updateProductionSetting() {
  state.production.panelRole = $('#panel-role').value;
  state.production.syncGroupId = $('#sync-group').value.trim();
  state.production.staging = {
    enabled: $('#staging-enabled').checked,
    trigger: $('#staging-trigger').value,
    action: $('#staging-action').value,
  };
  const panel = activePanel();
  if (panel) {
    panel.accessMode = state.production.panelRole;
    panel.syncGroupId = state.production.syncGroupId || undefined;
  }
  scheduleWorkspaceSave();
  renderDesk();
  renderProductionDock();
}

function currentWorkspaceData() {
  rememberSpaceDestinations();
  return {
    schemaVersion: 3,
    chatSpaces: state.chatSpaces.map((space) => ({
      id: space.id,
      name: space.name,
      detail: space.detail,
      icon: space.icon,
      rgb: space.rgb,
      unread: Number(space.unread || 0),
      sources: [...space.sources],
      selectedDestinationIds: (space.selectedDestinationIds || []).filter((id) => space.sources.includes(id)),
      bridgeSourceIds: (space.bridgeSourceIds || []).filter((id) => space.sources.includes(id)),
    })),
    desks: state.desks,
    activeChatSpaceId: state.activeSpace,
    activeDeskId: state.activeDesk,
    production: state.production,
  };
}

function rememberSpaceDestinations() {
  const space = state.chatSpaces.find((item) => item.id === state.activeSpace);
  if (space) space.selectedDestinationIds = [...state.selectedDestinations];
}

function setWorkspaceState(text, tone = 'normal') {
  const element = $('#workspace-state');
  element.textContent = text;
  element.style.color = tone === 'error' ? 'var(--danger)' : tone === 'saved' ? 'var(--success)' : '';
}

function applyWorkspaceRecord(record, etag) {
  const data = record?.data;
  if ([1, 2, 3].includes(data?.schemaVersion) && Array.isArray(data.chatSpaces) && data.chatSpaces.length) {
    const validSpaces = data.chatSpaces.filter((space) => (
      space && typeof space.id === 'string' && typeof space.name === 'string' && Array.isArray(space.sources)
    )).slice(0, 40);
    if (validSpaces.length) state.chatSpaces = validSpaces;
    if (Array.isArray(data.desks) && data.desks.length) state.desks = data.desks.slice(0, 20);
    state.activeSpace = state.chatSpaces.some((space) => space.id === data.activeChatSpaceId)
      ? data.activeChatSpaceId
      : state.chatSpaces[0].id;
    state.activeDesk = state.desks.some((desk) => desk.id === data.activeDeskId)
      ? data.activeDeskId
      : state.desks[0]?.id || 'live-show';
    const active = state.chatSpaces.find((space) => space.id === state.activeSpace);
    state.selectedDestinations = active?.selectedDestinationIds?.filter((id) => active.sources.includes(id))
      || composeDestinationIds();
    if (data.schemaVersion >= 2 && data.production && typeof data.production === 'object') {
      state.production = {
        ...structuredClone(defaultProduction),
        ...data.production,
        staging: { ...defaultProduction.staging, ...(data.production.staging || {}) },
        bindings: Array.isArray(data.production.bindings) ? data.production.bindings.slice(0, 24) : [],
      };
    }
  }
  state.workspaceRecord = record;
  state.workspaceEtag = etag;
}

async function loadCommlinkWorkspace() {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    setWorkspaceState('Local preview · sign in to save');
    return;
  }
  setWorkspaceState('Loading saved workspace…');
  try {
    const response = await fetch('/api/app-state/cosmo-commlink/workspace', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) {
      await saveCommlinkWorkspace(true);
      return;
    }
    if (response.status === 401 || response.status === 403) {
      setWorkspaceState('Session expired · local preview', 'error');
      return;
    }
    if (!response.ok) throw new Error(`Workspace returned ${response.status}`);
    const record = await response.json();
    applyWorkspaceRecord(record, response.headers.get('etag'));
    setWorkspaceState(`Saved workspace r${record.revision}`, 'saved');
    renderAll();
  } catch {
    setWorkspaceState('Workspace offline · local preview', 'error');
  }
}

function scheduleWorkspaceSave() {
  if (!localStorage.getItem('spmt_token')) {
    setWorkspaceState('Local change · sign in to save');
    return;
  }
  setWorkspaceState('Unsaved workspace changes');
  clearTimeout(state.workspaceSaveTimer);
  state.workspaceSaveTimer = setTimeout(() => saveCommlinkWorkspace(false), 450);
}

async function saveCommlinkWorkspace(create = false) {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    setWorkspaceState('Local preview · sign in to save');
    return;
  }
  setWorkspaceState('Saving workspace…');
  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (!create && state.workspaceEtag) headers['If-Match'] = state.workspaceEtag;
    const response = await fetch('/api/app-state/cosmo-commlink/workspace', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ schemaVersion: 3, data: currentWorkspaceData() }),
    });
    if (response.status === 409) {
      setWorkspaceState('Changed on another device · reloading', 'error');
      await loadCommlinkWorkspace();
      toast('The newer Commlink workspace was loaded from SPMT.');
      return;
    }
    if (!response.ok) throw new Error(`Workspace save returned ${response.status}`);
    const record = await response.json();
    applyWorkspaceRecord(record, response.headers.get('etag'));
    setWorkspaceState(`Saved workspace r${record.revision}`, 'saved');
  } catch {
    setWorkspaceState('Save failed · changes remain local', 'error');
  }
}

function createChatSpace() {
  const sequence = state.chatSpaces.length + 1;
  const id = `chatspace-${Date.now().toString(36)}`;
  state.chatSpaces.push({
    id,
    name: `Untitled ChatSpace ${sequence}`,
    detail: '0 connections · new',
    icon: `C${sequence}`,
    rgb: '251,146,60',
    unread: 0,
    sources: [],
    selectedDestinationIds: [],
    bridgeSourceIds: [],
  });
  state.activeSpace = id;
  state.selectedDestinations = [];
  renderAll();
  scheduleWorkspaceSave();
  openWorkspaceEditor('chatspace', id);
}

function addSourceToActiveSpace() {
  openWorkspaceEditor('chatspace', state.activeSpace);
}

function createDesk() {
  const sequence = state.desks.length + 1;
  const id = `desk-${Date.now().toString(36)}`;
  state.desks.push({ id, name: `Untitled Desk ${sequence}`, panels: [], hiddenSourceIds: [] });
  state.activeDesk = id;
  state.activeView = 'desk';
  updateView();
  renderAll();
  scheduleWorkspaceSave();
  openWorkspaceEditor('desk', id);
}

function renderWorkspaceEditor() {
  const editor = state.workspaceEditor;
  if (!editor) return;
  const isSpace = editor.type === 'chatspace';
  const item = isSpace
    ? state.chatSpaces.find((entry) => entry.id === editor.id)
    : state.desks.find((entry) => entry.id === editor.id);
  if (!item) return;
  $('#workspace-modal-title').textContent = isSpace ? 'Edit ChatSpace' : 'Edit Desk';
  $('#workspace-name').value = item.name;
  $('#workspace-modal-help').textContent = isSpace
    ? 'Choose every connection visible in this ChatSpace. Highlight Bridge only for chats that should share one combined lane.'
    : 'Choose which saved ChatSpaces appear as panels. Every connected provider inside those ChatSpaces remains available as a hide/show tab.';
  $('#workspace-source-editor').classList.toggle('hidden', !isSpace);
  $('#workspace-panel-editor').classList.toggle('hidden', isSpace);
  if (isSpace) {
    const members = new Set(item.sources || []);
    const bridged = new Set(item.bridgeSourceIds || []);
    $('#workspace-source-editor').innerHTML = state.sources.map((source) => {
      const provider = providerFor(source.provider);
      return `<div class="workspace-source-row" style="${providerStyle(source.provider)}">
        <span class="provider-logo">${provider.short}</span>
        <span><strong>${provider.name} · ${escapeHtml(source.channel)}</strong><small>${escapeHtml(source.state)}</small></span>
        <label><input type="checkbox" data-space-source="${source.id}" ${members.has(source.id) ? 'checked' : ''}> In ChatSpace</label>
        <label><input type="checkbox" data-bridge-source="${source.id}" ${bridged.has(source.id) ? 'checked' : ''} ${members.has(source.id) ? '' : 'disabled'}> Bridge</label>
      </div>`;
    }).join('') + `<a class="secondary-button full-button link-button" href="/?view=connections" target="_top">Open the SPMT Connections hub</a>`;
  } else {
    const selected = new Set((item.panels || []).map((panel) => panel.chatSpaceId));
    $('#workspace-panel-editor').innerHTML = state.chatSpaces.map((space) => `
      <label class="workspace-panel-row">
        <span><strong>${escapeHtml(space.name)}</strong><small>${space.sources.length} connection${space.sources.length === 1 ? '' : 's'}</small></span>
        <input type="checkbox" data-desk-space="${space.id}" ${selected.has(space.id) ? 'checked' : ''}>
      </label>`).join('') || '<div class="feed-empty">Create a ChatSpace before adding Desk panels.</div>';
  }
}

function openWorkspaceEditor(type, id) {
  state.workspaceEditor = { type, id };
  renderWorkspaceEditor();
  $('#workspace-modal').classList.remove('hidden');
}

function saveWorkspaceEditor() {
  const editor = state.workspaceEditor;
  if (!editor) return;
  const name = $('#workspace-name').value.trim();
  if (!name) return toast('Give this workspace item a name.');
  if (editor.type === 'chatspace') {
    const space = state.chatSpaces.find((item) => item.id === editor.id);
    if (!space) return;
    const sources = $$('[data-space-source]:checked').map((input) => input.dataset.spaceSource);
    const sourceSet = new Set(sources);
    space.name = name;
    space.sources = sources;
    space.bridgeSourceIds = $$('[data-bridge-source]:checked').map((input) => input.dataset.bridgeSource).filter((id) => sourceSet.has(id));
    space.selectedDestinationIds = (space.selectedDestinationIds || []).filter((id) => sourceSet.has(id));
    space.detail = `${sources.length} connection${sources.length === 1 ? '' : 's'} · ${space.bridgeSourceIds.length > 1 ? `${space.bridgeSourceIds.length} bridged` : 'separate'}`;
    if (space.id === state.activeSpace) state.selectedDestinations = [...space.selectedDestinationIds];
  } else {
    const desk = state.desks.find((item) => item.id === editor.id);
    if (!desk) return;
    const previous = new Map((desk.panels || []).map((panel) => [panel.chatSpaceId, panel]));
    desk.name = name;
    desk.panels = $$('[data-desk-space]:checked').map((input, index) => {
      const prior = previous.get(input.dataset.deskSpace);
      return prior || {
        panelId: `${desk.id}-${input.dataset.deskSpace}`,
        label: `panel-${index + 1}`,
        chatSpaceId: input.dataset.deskSpace,
        accessMode: 'owner',
      };
    });
  }
  $('#workspace-modal').classList.add('hidden');
  state.workspaceEditor = null;
  renderAll();
  scheduleWorkspaceSave();
  toast('Workspace changes saved and queued for SPMT sync.');
}

function deleteWorkspaceEditor() {
  const editor = state.workspaceEditor;
  if (!editor) return;
  if (editor.type === 'chatspace') {
    if (state.chatSpaces.length === 1) return toast('Keep at least one ChatSpace.');
    state.chatSpaces = state.chatSpaces.filter((item) => item.id !== editor.id);
    state.desks.forEach((desk) => { desk.panels = desk.panels.filter((panel) => panel.chatSpaceId !== editor.id); });
    if (state.activeSpace === editor.id) state.activeSpace = state.chatSpaces[0].id;
  } else {
    if (state.desks.length === 1) return toast('Keep at least one Desk.');
    state.desks = state.desks.filter((item) => item.id !== editor.id);
    if (state.activeDesk === editor.id) state.activeDesk = state.desks[0].id;
  }
  state.workspaceEditor = null;
  $('#workspace-modal').classList.add('hidden');
  renderAll();
  scheduleWorkspaceSave();
  toast('Workspace item removed. Connected accounts were not disconnected.');
}

function renderDiscoveryStatus(status, showUnlock = false) {
  state.discoveryStatus = status;
  const found = Number(status?.discoveredCount || 0);
  $$('.discovery-dot').forEach((dot, index) => dot.classList.toggle('found', index < found));
  $('#discovery-summary').textContent = status
    ? `${found} / ${status.total} hidden signals`
    : 'Sign in to preserve hidden signals';
  const complete = Boolean(status?.complete && status?.reward);
  $('#count-puzzle-card').classList.toggle('hidden', !complete);
  $('#account-title').textContent = complete ? `Mountain Crew · ${status.reward.title}` : 'Mountain Crew';
  if (complete && showUnlock) $('#unlock-overlay').classList.remove('hidden');
}

async function loadDiscoveries() {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    renderDiscoveryStatus(null);
    return;
  }
  try {
    const response = await fetch('/api/discoveries', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Discovery state unavailable');
    const status = await response.json();
    const unlockSeen = sessionStorage.getItem('spmt-count-puzzle-unlock-seen') === 'true';
    renderDiscoveryStatus(status, status.complete && !unlockSeen);
    if (status.complete && !unlockSeen) sessionStorage.setItem('spmt-count-puzzle-unlock-seen', 'true');
  } catch {
    $('#discovery-summary').textContent = 'Hidden signal sync unavailable';
  }
}

async function recordDiscovery(discoveryId) {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    toast('Signal found locally. Sign in to preserve the discovery.');
    return null;
  }
  try {
    const response = await fetch(`/api/discoveries/${encodeURIComponent(discoveryId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ surface: 'commlink', clientVersion: 'pass-2' }),
    });
    if (!response.ok) throw new Error('Discovery could not be recorded');
    const status = await response.json();
    renderDiscoveryStatus(status, status.created && status.complete);
    toast(status.created ? `${status.discoveredCount} of ${status.total} hidden signals discovered.` : 'This hidden signal was already in your collection.');
    return status;
  } catch {
    toast('The signal appeared, but SPMT could not preserve it yet.');
    return null;
  }
}

function openBlackHoleGame() {
  state.blackHoleArtifacts = new Set();
  $$('.cosmic-artifact').forEach((artifact) => artifact.classList.remove('captured'));
  $('#black-hole-count').textContent = '0 / 3 captured';
  $('#black-hole-game').classList.remove('hidden');
}

async function captureBlackHoleArtifact(artifact) {
  const id = artifact.dataset.artifact;
  if (!id || state.blackHoleArtifacts.has(id)) return;
  state.blackHoleArtifacts.add(id);
  artifact.classList.add('captured');
  $('#black-hole-count').textContent = `${state.blackHoleArtifacts.size} / 3 captured`;
  if (state.blackHoleArtifacts.size === 3) {
    await recordDiscovery('cosmo-black-hole');
    setTimeout(() => $('#black-hole-game').classList.add('hidden'), 650);
  }
}

async function handleConstellationStep(step) {
  if (step !== state.constellationStep) {
    state.constellationStep = step === 0 ? 1 : 0;
    return;
  }
  const panel = $(`[data-constellation-panel="${step}"]`);
  panel?.classList.add('constellation-found');
  setTimeout(() => panel?.classList.remove('constellation-found'), 850);
  state.constellationStep += 1;
  if (state.constellationStep === 3) {
    state.constellationStep = 0;
    await recordDiscovery('commlink-constellation');
  }
}

const themeMap = {
  'solar-flare': { accent: '#fb923c', rgb: '251,146,60', accent2: '#fbbf24' },
  'nebula-purple': { accent: '#a78bfa', rgb: '167,139,250', accent2: '#38bdf8' },
  'oceanic-blue': { accent: '#38bdf8', rgb: '56,189,248', accent2: '#60a5fa' },
  'aurora-green': { accent: '#34d399', rgb: '52,211,153', accent2: '#22d3ee' },
};

function applyAppearance() {
  const appearance = state.appearance;
  const theme = themeMap[appearance.themeId] || themeMap['nebula-purple'];
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-rgb', theme.rgb);
  root.style.setProperty('--accent-2', theme.accent2);
  root.style.setProperty('--glow', String(appearance.glowIntensity / 100));
  root.style.setProperty('--star-opacity', String(appearance.starDensity / 100));
  root.style.setProperty('--surface-opacity', String(appearance.glassOpacity / 100));
  root.style.setProperty('--blur', `${appearance.blurStrength}px`);
  root.style.setProperty('--nebula-opacity', String(appearance.nebulaIntensity / 285));
  root.style.setProperty('--border-opacity', String(Math.max(.05, appearance.borderStrength / 400)));
  root.style.setProperty('--chat-opacity', String(appearance.chatTransparency / 100));
  root.style.setProperty('--radius', ({ sm: '8px', md: '14px', lg: '20px', full: '28px' })[appearance.cornerRadius] || '14px');
  document.body.classList.toggle('density-compact', appearance.density === 'compact');
  document.body.classList.toggle('density-spacious', appearance.density === 'spacious');
  document.body.classList.toggle('hide-avatars', !appearance.showAvatars);
  document.body.classList.toggle('no-motion', !appearance.animation.enabled);
  document.body.classList.toggle('rail-right', appearance.sidebarPosition === 'right');
  $('.stars').style.display = appearance.animation.particles ? '' : 'none';
  syncSettingsControls();
}

function syncSettingsControls() {
  const appearance = state.appearance;
  $$('[data-theme]').forEach((button) => button.classList.toggle('active', button.dataset.theme === appearance.themeId));
  $('#glow-input').value = appearance.glowIntensity;
  $('#stars-input').value = appearance.starDensity;
  $('#glass-input').value = appearance.glassOpacity;
  $('#blur-input').value = appearance.blurStrength;
  $('#glow-output').value = `${appearance.glowIntensity}%`;
  $('#stars-output').value = `${appearance.starDensity}%`;
  $('#glass-output').value = `${appearance.glassOpacity}%`;
  $('#blur-output').value = `${appearance.blurStrength}px`;
  $('#density-select').value = appearance.density;
  $('#radius-select').value = appearance.cornerRadius;
  $('#sidebar-position').value = appearance.sidebarPosition;
  $('#tab-style').value = appearance.tabStyle;
  $('#avatars-toggle').checked = appearance.showAvatars;
  $('#animations-toggle').checked = appearance.animation.enabled;
  $('#particles-toggle').checked = appearance.animation.particles;
  $('#shooting-toggle').checked = appearance.animation.shootingStars;
}

function setSyncState(status, title, detail) {
  state.profileStatus = status;
  $('#sync-card').className = `sync-card ${status === 'saved' ? 'saved' : status === 'error' || status === 'conflict' ? 'error' : ''}`;
  $('#sync-title').textContent = title;
  $('#sync-detail').textContent = detail;
  $('#sync-summary').textContent = detail;
  $('#save-profile').disabled = status === 'signed-out' || status === 'saving';
}

async function loadWorkspaceProfile() {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    state.profile = null;
    state.etag = null;
    state.appearance = structuredClone(defaultAppearance);
    setSyncState('signed-out', 'Local preview', 'Sign in at spmt.live to sync settings.');
    applyAppearance();
    return;
  }
  setSyncState('loading', 'Loading workspace', 'Reading your SPMT appearance profile…');
  try {
    const response = await fetch('/api/workspace-profile', { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401 || response.status === 403) {
      setSyncState('signed-out', 'Session expired', 'Sign in again at spmt.live to sync.');
      return;
    }
    if (!response.ok) throw new Error(`Workspace returned ${response.status}`);
    const data = await response.json();
    state.profile = data.profile;
    state.etag = response.headers.get('etag');
    state.appearance = structuredClone(data.profile.appearance);
    setSyncState('saved', 'Synced with SPMT', `Workspace revision ${data.profile.revision}`);
    applyAppearance();
  } catch (error) {
    setSyncState('error', 'Workspace unavailable', 'Using local preview settings. Retry when online.');
    applyAppearance();
  }
}

async function saveWorkspaceProfile() {
  const token = localStorage.getItem('spmt_token');
  if (!token || !state.profile || !state.etag) {
    setSyncState('signed-out', 'Local preview', 'Sign in at spmt.live before saving.');
    return;
  }
  setSyncState('saving', 'Saving workspace', 'Sending this appearance revision to SPMT…');
  try {
    const response = await fetch('/api/workspace-profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'If-Match': state.etag,
      },
      body: JSON.stringify({ profile: { appearance: state.appearance } }),
    });
    const data = await response.json();
    if (response.status === 409) {
      state.profile = data.profile;
      state.etag = response.headers.get('etag');
      setSyncState('conflict', 'Changed on another device', `Server revision ${data.profile.revision}. Reload before saving.`);
      return;
    }
    if (!response.ok) throw new Error(data.error || `Save returned ${response.status}`);
    state.profile = data.profile;
    state.etag = response.headers.get('etag');
    state.appearance = structuredClone(data.profile.appearance);
    setSyncState('saved', 'Saved to SPMT', `Workspace revision ${data.profile.revision}`);
    applyAppearance();
    toast('Appearance saved to your SPMT workspace.');
  } catch (error) {
    setSyncState('error', 'Save failed', 'Your preview remains local. Retry when the connection recovers.');
  }
}

function markAppearanceDirty() {
  applyAppearance();
  if (state.profile) setSyncState('dirty', 'Unsaved changes', `Based on workspace revision ${state.profile.revision}`);
  else setSyncState('signed-out', 'Local preview', 'Sign in at spmt.live to sync settings.');
}

function updateView() {
  $$('.view-switch button').forEach((item) => item.classList.toggle('active', item.dataset.view === state.activeView));
  $('#focus-view').classList.toggle('hidden', state.activeView !== 'focus');
  $('#desk-view').classList.toggle('hidden', state.activeView !== 'desk');
  if (state.activeView === 'desk') renderDesk();
}

async function loadAccountXp() {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    $('#account-xp').textContent = 'Sign in for account XP';
    return;
  }
  try {
    const response = await fetch('/api/xp', { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error('XP unavailable');
    state.accountXp = result;
    $('#account-xp').textContent = `${Number(result.xp || 0).toLocaleString()} XP · level ${Number(result.level || 1)}`;
  } catch {
    $('#account-xp').textContent = 'Account XP unavailable';
  }
}

function streamEmbedUrl(source) {
  const channel = encodeURIComponent(source.channelId || source.channel.replace(/^[@#]/, ''));
  const parent = encodeURIComponent(window.location.hostname);
  if (source.provider === 'twitch') return `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=true`;
  if (source.provider === 'youtube') return `https://www.youtube.com/embed/live_stream?channel=${channel}&autoplay=1`;
  if (source.provider === 'kick') return `https://player.kick.com/${channel}?autoplay=true`;
  return '';
}

function openStreamDock(sourceId) {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  const url = streamEmbedUrl(source);
  if (!url) return toast(`${providerFor(source.provider).name} does not expose an embeddable channel player for this connection yet.`);
  state.streamSourceId = sourceId;
  $('#stream-dock-title').textContent = `${providerFor(source.provider).name} · ${source.channel}`;
  $('#stream-frame').src = url;
  $('#stream-dock').classList.remove('hidden', 'audio-only');
  $('#stream-dock-mode').textContent = 'Audio and video';
}

function setStreamMode(mode) {
  $('#stream-dock').classList.toggle('audio-only', mode === 'audio');
  $('#stream-dock-mode').textContent = mode === 'audio' ? 'Audio only' : 'Audio and video';
}

function setupEmojiMenu() {
  const emojis = ['😀', '😂', '😍', '🔥', '💜', '🚀', '🎉', '👏', '❤️', '👍', '👀', '✨', '🎙️', '🎮', '💯', '🌌', '🫡', '🤣'];
  $('#emoji-menu').innerHTML = emojis.map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('');
  $$('[data-emoji]').forEach((button) => button.addEventListener('click', () => {
    const input = $('#compose-input');
    const start = input.selectionStart ?? input.value.length;
    input.value = `${input.value.slice(0, start)}${button.dataset.emoji}${input.value.slice(input.selectionEnd ?? start)}`;
    $('#emoji-menu').classList.add('hidden');
    input.focus();
  }));
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return toast('Voice typing is not supported by this browser.');
  const recognition = new SpeechRecognition();
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.lang = document.documentElement.lang || 'en-US';
  $('#voice-input').classList.add('listening');
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (transcript) $('#compose-input').value = `${$('#compose-input').value}${$('#compose-input').value ? ' ' : ''}${transcript}`;
  };
  recognition.onerror = () => toast('Voice typing could not hear a complete message.');
  recognition.onend = () => $('#voice-input').classList.remove('listening');
  recognition.start();
}

function wireEvents() {
  $$('.filter-tabs button').forEach((button) => button.addEventListener('click', () => {
    state.activeFilter = button.dataset.filter;
    $$('.filter-tabs button').forEach((item) => item.classList.toggle('active', item === button));
    renderMessages();
  }));
  $$('.view-switch button').forEach((button) => button.addEventListener('click', () => {
    state.activeView = button.dataset.view;
    updateView();
  }));
  $('#compose-input').addEventListener('input', (event) => {
    const value = event.target.value;
    $('#mention-menu').classList.toggle('hidden', !/(^|\s)@\S*$/.test(value));
    if (/(^|\s)@\S*$/.test(value)) showMentionMenu();
    event.target.style.height = '39px';
    event.target.style.height = `${Math.min(110, event.target.scrollHeight)}px`;
  });
  $('#preview-send').addEventListener('click', openSendPreview);
  $('#close-send-modal').addEventListener('click', () => $('#send-modal').classList.add('hidden'));
  $('#cancel-send').addEventListener('click', () => $('#send-modal').classList.add('hidden'));
  $('#simulate-send').addEventListener('click', simulateSend);
  $('#emoji-button').addEventListener('click', () => $('#emoji-menu').classList.toggle('hidden'));
  $('#command-button').addEventListener('click', showCommandMenu);
  $('#voice-input').addEventListener('click', startVoiceInput);
  $('#settings-button').addEventListener('click', () => $('#settings-drawer').classList.remove('hidden'));
  $('#close-settings').addEventListener('click', () => $('#settings-drawer').classList.add('hidden'));
  $('#production-button').addEventListener('click', () => {
    $('#production-drawer').classList.remove('hidden');
    loadOperator();
    loadCompanionDevices();
    loadIntegrations();
  });
  $('#close-production').addEventListener('click', () => $('#production-drawer').classList.add('hidden'));
  ['panel-role', 'sync-group', 'staging-enabled', 'staging-trigger', 'staging-action'].forEach((id) => {
    $(`#${id}`).addEventListener(id === 'sync-group' ? 'input' : 'change', updateProductionSetting);
  });
  $('#dry-run-rule').addEventListener('click', dryRunStaging);
  $('#feature-next').addEventListener('click', () => runOperatorAction('next'));
  $('#clear-feature').addEventListener('click', () => runOperatorAction('clear'));
  $('#speak-tts').addEventListener('click', () => runOperatorAction('speak'));
  $('#open-popout').addEventListener('click', () => {
    const target = new URL('/commlink/', window.location.origin);
    target.searchParams.set('popout', '1');
    target.searchParams.set('chatSpace', state.activeSpace);
    window.open(target, `commlink-${state.activeSpace}`, 'popup,width=720,height=900');
  });
  $('#save-binding').addEventListener('click', saveControlBinding);
  $('#run-binding').addEventListener('click', runControlBinding);
  $('#reload-profile').addEventListener('click', loadWorkspaceProfile);
  $('#save-profile').addEventListener('click', saveWorkspaceProfile);
  $('#reset-preview').addEventListener('click', () => {
    state.appearance = structuredClone(state.profile?.appearance || defaultAppearance);
    markAppearanceDirty();
  });
  $('#mobile-rail-toggle').addEventListener('click', () => document.body.classList.toggle('rail-open'));
  $('#compact-toggle').addEventListener('click', () => {
    state.appearance.density = state.appearance.density === 'compact' ? 'comfortable' : 'compact';
    markAppearanceDirty();
  });
  $('#replay-button').addEventListener('click', () => {
    if (!localStorage.getItem('spmt_token')) return toast('Sign in to replay real account history.');
    if (state.replayActive) clearHistoryMode();
    else loadCommlinkFeed({ replayMinutes: 5 });
  });
  $('#add-source').addEventListener('click', addSourceToActiveSpace);
  $('#create-space').addEventListener('click', createChatSpace);
  $('#create-desk').addEventListener('click', createDesk);
  $('#close-workspace-modal').addEventListener('click', () => $('#workspace-modal').classList.add('hidden'));
  $('#save-workspace-item').addEventListener('click', saveWorkspaceEditor);
  $('#delete-workspace-item').addEventListener('click', deleteWorkspaceEditor);
  $('#workspace-source-editor').addEventListener('change', (event) => {
    if (!event.target.matches('[data-space-source]')) return;
    const bridge = $(`[data-bridge-source="${CSS.escape(event.target.dataset.spaceSource)}"]`);
    bridge.disabled = !event.target.checked;
    if (!event.target.checked) bridge.checked = false;
  });
  $('#stream-audio-mode').addEventListener('click', () => setStreamMode('audio'));
  $('#stream-video-mode').addEventListener('click', () => setStreamMode('video'));
  $('#stream-close').addEventListener('click', () => {
    $('#stream-frame').src = 'about:blank';
    $('#stream-dock').classList.add('hidden');
  });
  $('#search-button').addEventListener('click', () => {
    $('#history-search').classList.remove('hidden');
    $('#history-query').focus();
  });
  $('#close-search').addEventListener('click', () => $('#history-search').classList.add('hidden'));
  $('#clear-search').addEventListener('click', clearHistoryMode);
  $('#history-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('#history-query').value.trim();
    if (query.length < 2) return toast('Enter at least two characters to search history.');
    loadCommlinkFeed({ query });
  });
  $('#cosmo-logo').addEventListener('click', openBlackHoleGame);
  $('#black-hole-close').addEventListener('click', () => $('#black-hole-game').classList.add('hidden'));
  $$('.cosmic-artifact').forEach((artifact) => artifact.addEventListener('click', () => captureBlackHoleArtifact(artifact)));
  $('#accept-unlock').addEventListener('click', () => {
    sessionStorage.setItem('spmt-count-puzzle-unlock-seen', 'true');
    $('#unlock-overlay').classList.add('hidden');
  });
  $('#count-puzzle-card').addEventListener('click', () => {
    const bot = state.discoveryStatus?.reward?.chatbotPersonality;
    toast(bot ? `${bot.name}: “Direct answers are dreadfully dull. Bring me a worthy riddle.”` : 'The hidden personality is still out of phase.');
  });
  $$('[data-theme]').forEach((button) => button.addEventListener('click', () => {
    state.appearance.themeId = button.dataset.theme;
    markAppearanceDirty();
  }));
  const ranges = [
    ['glow-input', 'glowIntensity'],
    ['stars-input', 'starDensity'],
    ['glass-input', 'glassOpacity'],
    ['blur-input', 'blurStrength'],
  ];
  ranges.forEach(([id, key]) => $(`#${id}`).addEventListener('input', (event) => {
    state.appearance[key] = Number(event.target.value);
    markAppearanceDirty();
  }));
  $('#density-select').addEventListener('change', (event) => { state.appearance.density = event.target.value; markAppearanceDirty(); });
  $('#radius-select').addEventListener('change', (event) => { state.appearance.cornerRadius = event.target.value; markAppearanceDirty(); });
  $('#sidebar-position').addEventListener('change', (event) => { state.appearance.sidebarPosition = event.target.value; markAppearanceDirty(); });
  $('#tab-style').addEventListener('change', (event) => { state.appearance.tabStyle = event.target.value; markAppearanceDirty(); });
  $('#avatars-toggle').addEventListener('change', (event) => { state.appearance.showAvatars = event.target.checked; markAppearanceDirty(); });
  $('#animations-toggle').addEventListener('change', (event) => { state.appearance.animation.enabled = event.target.checked; markAppearanceDirty(); });
  $('#particles-toggle').addEventListener('change', (event) => { state.appearance.animation.particles = event.target.checked; markAppearanceDirty(); });
  $('#shooting-toggle').addEventListener('change', (event) => { state.appearance.animation.shootingStars = event.target.checked; markAppearanceDirty(); });
}

renderAll();
wireEvents();
setupEmojiMenu();
const launchParams = commlinkParams;
if (launchParams.get('embedded') === '1') document.body.classList.add('embedded-mode');
if (launchParams.get('popout') === '1') document.body.classList.add('popout-mode');
if (['full', 'panel', 'dock', 'compact', 'overlay'].includes(launchParams.get('mode'))) document.body.classList.add(`surface-${launchParams.get('mode')}`);
if (launchParams.get('chatSpace') && state.chatSpaces.some((space) => space.id === launchParams.get('chatSpace'))) {
  state.activeSpace = launchParams.get('chatSpace');
}
renderProductionDock();
loadWorkspaceProfile();
loadAccountXp();
loadCommlinkWorkspace();
loadDiscoveries();
loadCommlinkFeed();
loadOperator();
loadCompanionDevices();
loadIntegrations();
window.addEventListener('beforeunload', () => clearTimeout(state.feedPollTimer));
