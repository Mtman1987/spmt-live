const providers = {
  twitch: { name: 'Twitch', short: 'T', rgb: '145, 70, 255' },
  kick: { name: 'Kick', short: 'K', rgb: '83, 252, 24' },
  youtube: { name: 'YouTube', short: 'Y', rgb: '255, 54, 72' },
  discord: { name: 'Discord', short: 'D', rgb: '88, 101, 242' },
  spmt: { name: 'SPMT', short: 'S', rgb: '167, 139, 250' },
  app: { name: 'App', short: 'A', rgb: '167, 139, 250' },
  'social-stream': { name: 'Social Stream', short: 'SS', rgb: '56, 189, 248' },
};

const defaultSources = [
  { id: 'twitch-creatora', provider: 'twitch', channelId: 'creatorA', channel: 'creatorA', state: 'Live · can send', capabilities: { compose: true, reply: true, timeout: true, delete: false } },
  { id: 'kick-creatorc', provider: 'kick', channelId: 'creatorC', channel: 'creatorC', state: 'Live · can send', capabilities: { compose: true, reply: false, timeout: false, delete: false } },
  { id: 'youtube-creatorb', provider: 'youtube', channelId: 'creatorB', channel: 'creatorB', state: 'Read only', capabilities: { compose: false, reply: false, timeout: false, delete: false } },
  { id: 'discord-livechat', provider: 'discord', channelId: 'live-chat', channel: '#live-chat', state: 'Live · can send', capabilities: { compose: true, reply: false, timeout: false, delete: true } },
];

const defaultChatSpaces = [
  { id: 'friday', name: 'Friday Stream', detail: '4 sources · live', icon: 'FS', rgb: '167,139,250', unread: 7, sources: defaultSources.map((source) => source.id) },
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
  },
  {
    id: 'mod-shift',
    name: 'Mod Shift',
    panels: [
      { panelId: 'mod-main', label: 'mod-main', chatSpaceId: 'mods', accessMode: 'operator' },
      { panelId: 'partner-watch', label: 'partner-watch', chatSpaceId: 'partner', accessMode: 'view-only' },
    ],
  },
];

const initialMessages = [
  {
    id: 'm1', sourceId: 'twitch-creatora', provider: 'twitch', channel: 'creatorA', kind: 'chat', name: 'PixelRanger', handle: '@pixelranger',
    initials: 'PR', roles: ['MOD', 'SUB 18M'], time: '8:41 PM', text: 'That transition was ridiculously smooth <span class="emote">🔥</span>',
    xp: 31977, level: 42, queued: false, pinned: false, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm2', sourceId: 'youtube-creatorb', provider: 'youtube', channel: 'creatorB', kind: 'event', event: 'Super Chat', name: 'NovaSkies',
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
    id: 'm5', sourceId: 'twitch-creatora', provider: 'twitch', channel: 'creatorA', kind: 'event', event: 'Channel Point Redeem', name: 'CometChaser',
    handle: '@cometchaser', initials: 'CC', roles: ['VIP'], time: '8:43 PM', text: 'Hydrate the captain', value: '5,000 points',
    xp: 18650, level: 31, queued: true, pinned: false, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm6', sourceId: 'spmt-xp', provider: 'spmt', channel: 'XP Ledger', kind: 'event', event: 'SPMT XP', name: 'PixelRanger',
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

const state = {
  activeSpace: 'friday',
  activeDesk: 'live-show',
  activeFilter: 'all',
  activeView: 'focus',
  sources: structuredClone(defaultSources),
  sourceHealth: [],
  feedMode: 'synthetic',
  feedCursor: null,
  feedPollTimer: null,
  liveMessages: [],
  searchQuery: '',
  replayActive: false,
  selectedMessage: null,
  replyToMessageId: null,
  lastDispatchGroup: null,
  selectedDestinations: defaultSources.map((source) => source.id),
  messages: initialMessages.map((message) => ({ ...message })),
  chatSpaces: structuredClone(defaultChatSpaces),
  desks: structuredClone(defaultDesks),
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

function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), 3200);
}

function renderSpaces() {
  $('#space-list').innerHTML = state.chatSpaces.map((space) => `
    <button class="space-button ${space.id === state.activeSpace ? 'active' : ''}" type="button" data-space="${space.id}">
      <span class="space-icon" style="--space-rgb:${space.rgb}">${space.icon}</span>
      <span><strong>${space.name}</strong><small>${space.detail}</small></span>
      ${space.unread ? `<span class="unread">${space.unread}</span>` : ''}
    </button>
  `).join('');
  $$('.space-button').forEach((button) => button.addEventListener('click', () => {
    state.activeSpace = button.dataset.space;
    const selectedSpace = state.chatSpaces.find((space) => space.id === state.activeSpace);
    state.selectedDestinations = selectedSpace?.selectedDestinationIds?.filter((id) => selectedSpace.sources.includes(id))
      || activeSources().map((source) => source.id);
    state.selectedMessage = null;
    renderAll();
    scheduleWorkspaceSave();
    document.body.classList.remove('rail-open');
  }));
}

function renderSourceChips() {
  const current = activeSources();
  const live = current.filter((source) => source.health === 'live' || source.health === 'recent').length;
  $('#source-count').textContent = state.feedMode === 'synthetic'
    ? `${current.length} preview source${current.length === 1 ? '' : 's'}`
    : `${current.length} source${current.length === 1 ? '' : 's'} · ${live} active`;
  $('#source-chips').innerHTML = current.map((source) => {
    const provider = providerFor(source.provider);
    return `<span class="source-chip" style="${providerStyle(source.provider)}" title="${source.state}">
      <span class="provider-logo">${provider.short}</span>${provider.name} · ${escapeHtml(source.channel)}<span class="source-state ${source.health || ''}"></span>
    </span>`;
  }).join('');
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
  ].filter(Boolean).join('');
  const roles = message.roles.map((role, index) => `<span class="role-badge" style="--badge-rgb:${index % 2 ? '56,189,248' : provider.rgb}">${escapeHtml(role)}</span>`).join('');
  const avatar = message.avatarUrl
    ? `<img src="${escapeHtml(message.avatarUrl)}" alt="" loading="lazy">`
    : escapeHtml(message.initials);
  const media = (message.media || []).slice(0, 4).map((item) => {
    if (!item?.url || !['image', 'emote', 'sticker'].includes(item.type)) return '';
    return `<img class="message-media" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt || item.type)}" loading="lazy">`;
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
  const visible = state.messages.filter((message) => {
    const belongs = sourceIds.has(message.sourceId) || message.provider === 'spmt';
    if (!belongs && state.feedMode !== 'synthetic') return false;
    if (!belongs && state.activeSpace !== 'friday') return false;
    if (state.activeFilter === 'chat') return message.kind === 'chat';
    if (state.activeFilter === 'events') return message.kind === 'event';
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
          ? 'Feed degraded · preview data shown'
          : 'Synthetic preview · sign in for real sources';
  $('#message-feed').innerHTML = `<div class="date-separator">${modeLabel}</div>${visible.map((message) => messageCard(message)).join('') || '<div class="feed-empty">No messages match this view. The source is connected, but this bounded window is empty.</div>'}`;
  $$('.message-card').forEach((card) => card.addEventListener('click', () => {
    state.selectedMessage = card.dataset.message;
    renderMessages();
    renderContext();
  }));
  $('#queue-count').textContent = String(state.messages.filter((message) => message.queued).length);
}

function renderContext() {
  const message = state.messages.find((item) => item.id === state.selectedMessage);
  $('#context-empty').classList.toggle('hidden', Boolean(message));
  $('#context-content').classList.toggle('hidden', !message);
  if (!message) return;
  const provider = providerFor(message.provider);
  const xpPercent = Math.min(100, Math.max(4, (message.xp % 1000) / 10));
  $('#context-content').innerHTML = `
    <div class="context-profile" style="${providerStyle(message.provider)}">
      <span class="context-avatar">${message.avatarUrl ? `<img src="${escapeHtml(message.avatarUrl)}" alt="">` : escapeHtml(message.initials)}</span>
      <h2>${escapeHtml(message.name)}</h2>
      <p>${escapeHtml(message.handle)} · ${provider.name}</p>
      <p>${message.roles.map(escapeHtml).join(' · ')}</p>
    </div>
    <div class="xp-card">
      <div class="between"><span>SPMT level ${message.level}</span><strong>${message.xp.toLocaleString()} XP</strong></div>
      <div class="xp-bar"><span style="width:${xpPercent}%"></span></div>
    </div>
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
    return toast('This show-control action arrives in Pass 5. No provider request was made.');
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
  state.selectedDestinations = state.selectedDestinations.filter((id) => active.some((source) => source.id === id));
  $('#destination-chips').innerHTML = state.selectedDestinations.map((id) => {
    const source = state.sources.find((item) => item.id === id);
    if (!source) return '';
    const provider = providerFor(source.provider);
    return `<span class="destination-chip" style="${providerStyle(source.provider)}">${provider.name}/${source.channel}<button type="button" data-remove-destination="${id}" aria-label="Remove ${provider.name} ${source.channel}">×</button></span>`;
  }).join('');
  $('#send-label').textContent = `${state.replyToMessageId ? 'Reply' : 'Send'} → ${state.selectedDestinations.length}`;
  $$('[data-remove-destination]').forEach((button) => button.addEventListener('click', () => {
    state.selectedDestinations = state.selectedDestinations.filter((id) => id !== button.dataset.removeDestination);
    rememberSpaceDestinations();
    renderDestinations();
    scheduleWorkspaceSave();
  }));
}

function renderDesk() {
  const chatMessages = state.messages.filter((message) => message.kind === 'chat').slice(0, 5);
  const discordMessages = state.messages.filter((message) => message.provider === 'discord');
  const events = state.messages.filter((message) => message.kind === 'event');
  $('#desk-grid').innerHTML = `
    <section class="desk-panel" data-constellation-panel="0">
      <header class="desk-panel-header"><span><strong>Main Multistream</strong><small>Twitch · Kick · YouTube</small></span><button class="panel-label" type="button" data-constellation-step="0">main-chat</button></header>
      <div class="desk-panel-body">${chatMessages.map((message) => messageCard(message, true)).join('')}</div>
    </section>
    <section class="desk-panel" data-constellation-panel="1">
      <header class="desk-panel-header"><span><strong>Discord Ops</strong><small>Helper controls</small></span><button class="panel-label" type="button" data-constellation-step="1">discord-ops</button></header>
      <div class="desk-panel-body">${discordMessages.map((message) => messageCard(message, true)).join('')}</div>
    </section>
    <section class="desk-panel" data-constellation-panel="2">
      <header class="desk-panel-header"><span><strong>Redeems + XP</strong><small>Events only · synced queue</small></span><button class="panel-label" type="button" data-constellation-step="2">redeems</button></header>
      <div class="desk-panel-body event-list">${events.map((message) => messageCard(message)).join('')}</div>
    </section>`;
  $$('[data-constellation-step]').forEach((button) => button.addEventListener('click', () => handleConstellationStep(Number(button.dataset.constellationStep))));
}

function renderDeskSelection() {
  const activeDesk = state.desks.find((desk) => desk.id === state.activeDesk);
  $('#desk-name').textContent = activeDesk?.name || 'Live Show';
  $$('[data-desk]').forEach((button) => button.classList.toggle('active', button.dataset.desk === state.activeDesk));
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
  const token = localStorage.getItem('spmt_token');
  if (!token) throw new Error('Sign in to send through Commlink.');
  const response = await fetch('/api/commlink/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
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
      const token = localStorage.getItem('spmt_token');
      const response = await fetch(`/api/commlink/dispatch/${encodeURIComponent(state.lastDispatchGroup.groupId)}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
    text: escapeHtml(item.text || '').replaceAll('\n', '<br>'),
    media,
    xp: Number(item.meta?.spmtXp || 0),
    level: Number(item.meta?.spmtLevel || 1),
    queued: false,
    pinned: false,
    capabilities: {
      reply: Boolean(item.routing?.canReply),
      moderate: provider === 'twitch' || provider === 'discord',
      tts: false,
    },
  };
}

function applyFeedSources(payload) {
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
  for (const health of state.sourceHealth) {
    const provider = canonicalProvider({ platform: health.platform });
    if (!providers[provider] || unique.some((source) => source.provider === provider)) continue;
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
  if (!localStorage.getItem('spmt_token') || state.searchQuery || state.replayActive) return;
  state.feedPollTimer = setTimeout(() => loadCommlinkFeed({ incremental: true }), 5_000);
}

async function loadCommlinkFeed({ incremental = false, query = '', replayMinutes = 0 } = {}) {
  const token = localStorage.getItem('spmt_token');
  if (!token) {
    setFeedBanner('synthetic', 'Synthetic preview · sign in for account-scoped live feeds');
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
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Commlink feed returned ${response.status}`);
    const payload = await response.json();
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
    }
    const degraded = payload.upstream?.streamweaver?.status !== 'ready';
    setFeedBanner('real', degraded
      ? 'SPMT records live · StreamWeaver feed degraded · outbound adapters unavailable'
      : 'Real Twitch, Kick, YouTube, Discord, and SPMT feeds · writes require exact receipts');
    $('#replay-button').textContent = state.replayActive ? '● Return live' : '↻ Replay 5m';
    renderAll();
  } catch {
    if (!state.liveMessages.length) {
      state.messages = initialMessages.map((message) => ({ ...message }));
      state.sources = structuredClone(defaultSources);
      setFeedBanner('degraded', 'Real feed unavailable · labeled preview data shown · no provider writes');
    }
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

function currentWorkspaceData() {
  rememberSpaceDestinations();
  return {
    schemaVersion: 1,
    chatSpaces: state.chatSpaces.map((space) => ({
      id: space.id,
      name: space.name,
      detail: space.detail,
      icon: space.icon,
      rgb: space.rgb,
      unread: Number(space.unread || 0),
      sources: [...space.sources],
      selectedDestinationIds: (space.selectedDestinationIds || []).filter((id) => space.sources.includes(id)),
    })),
    desks: state.desks,
    activeChatSpaceId: state.activeSpace,
    activeDeskId: state.activeDesk,
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
  if (data?.schemaVersion === 1 && Array.isArray(data.chatSpaces) && data.chatSpaces.length) {
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
      || activeSources().map((source) => source.id);
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
      body: JSON.stringify({ schemaVersion: 1, data: currentWorkspaceData() }),
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
  const seedSources = state.sources.slice(0, 2).map((source) => source.id);
  state.chatSpaces.push({
    id,
    name: `Untitled ChatSpace ${sequence}`,
    detail: `${seedSources.length} sources · new`,
    icon: `C${sequence}`,
    rgb: '251,146,60',
    unread: 0,
    sources: seedSources,
    selectedDestinationIds: [...seedSources],
  });
  state.activeSpace = id;
  state.selectedDestinations = [...seedSources];
  renderAll();
  scheduleWorkspaceSave();
  toast('New ChatSpace created and queued for SPMT sync.');
}

function addSourceToActiveSpace() {
  const space = state.chatSpaces.find((item) => item.id === state.activeSpace);
  if (!space) return;
  const next = state.sources.find((source) => !space.sources.includes(source.id));
  if (!next) return toast('All available sources are already in this ChatSpace.');
  space.sources.push(next.id);
  space.selectedDestinationIds = [...(space.selectedDestinationIds || []), next.id];
  state.selectedDestinations = [...space.selectedDestinationIds];
  space.detail = `${space.sources.length} sources · saved`;
  renderAll();
  scheduleWorkspaceSave();
  toast(`${providerFor(next.provider).name}/${next.channel} added to ${space.name}.`);
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

function wireEvents() {
  $$('.filter-tabs button').forEach((button) => button.addEventListener('click', () => {
    state.activeFilter = button.dataset.filter;
    $$('.filter-tabs button').forEach((item) => item.classList.toggle('active', item === button));
    renderMessages();
  }));
  $$('.view-switch button').forEach((button) => button.addEventListener('click', () => {
    state.activeView = button.dataset.view;
    $$('.view-switch button').forEach((item) => item.classList.toggle('active', item === button));
    $('#focus-view').classList.toggle('hidden', state.activeView !== 'focus');
    $('#desk-view').classList.toggle('hidden', state.activeView !== 'desk');
    if (state.activeView === 'desk') renderDesk();
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
  $('#destination-edit').addEventListener('click', () => showMentionMenu('toggle'));
  $('#settings-button').addEventListener('click', () => $('#settings-drawer').classList.remove('hidden'));
  $('#close-settings').addEventListener('click', () => $('#settings-drawer').classList.add('hidden'));
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
  $$('[data-desk]').forEach((button) => button.addEventListener('click', () => {
    state.activeDesk = button.dataset.desk;
    renderDeskSelection();
    scheduleWorkspaceSave();
  }));

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
loadWorkspaceProfile();
loadCommlinkWorkspace();
loadDiscoveries();
loadCommlinkFeed();
window.addEventListener('beforeunload', () => clearTimeout(state.feedPollTimer));
