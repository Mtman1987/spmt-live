const providers = {
  twitch: { name: 'Twitch', short: 'T', rgb: '145, 70, 255' },
  kick: { name: 'Kick', short: 'K', rgb: '83, 252, 24' },
  youtube: { name: 'YouTube', short: 'Y', rgb: '255, 54, 72' },
  discord: { name: 'Discord', short: 'D', rgb: '88, 101, 242' },
  spmt: { name: 'SPMT', short: 'S', rgb: '167, 139, 250' },
};

const sources = [
  { id: 'twitch-creatora', provider: 'twitch', channel: 'creatorA', state: 'Live · can send' },
  { id: 'kick-creatorc', provider: 'kick', channel: 'creatorC', state: 'Live · can send' },
  { id: 'youtube-creatorb', provider: 'youtube', channel: 'creatorB', state: 'Live · can send' },
  { id: 'discord-livechat', provider: 'discord', channel: '#live-chat', state: 'Live · can send' },
];

const chatSpaces = [
  { id: 'friday', name: 'Friday Stream', detail: '4 sources · live', icon: 'FS', rgb: '167,139,250', unread: 7, sources: sources.map((source) => source.id) },
  { id: 'partner', name: 'Partner Night', detail: '2 sources · live', icon: 'PN', rgb: '56,189,248', unread: 3, sources: ['twitch-creatora', 'youtube-creatorb'] },
  { id: 'mods', name: 'Mod Watch', detail: 'Discord · helper', icon: 'MW', rgb: '88,101,242', unread: 0, sources: ['discord-livechat'] },
  { id: 'redeems', name: 'Redeems + XP', detail: 'Events only', icon: 'XP', rgb: '52,211,153', unread: 2, sources: ['twitch-creatora', 'kick-creatorc'] },
];

const initialMessages = [
  {
    id: 'm1', provider: 'twitch', channel: 'creatorA', kind: 'chat', name: 'PixelRanger', handle: '@pixelranger',
    initials: 'PR', roles: ['MOD', 'SUB 18M'], time: '8:41 PM', text: 'That transition was ridiculously smooth <span class="emote">🔥</span>',
    xp: 31977, level: 42, queued: false, pinned: false, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm2', provider: 'youtube', channel: 'creatorB', kind: 'event', event: 'Super Chat', name: 'NovaSkies',
    handle: '@novaskies', initials: 'NS', roles: ['MEMBER'], time: '8:42 PM', text: 'Can we get a tour of the new setup?', value: '$20.00',
    xp: 12840, level: 26, queued: true, pinned: true, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm3', provider: 'kick', channel: 'creatorC', kind: 'chat', name: 'OrbitFox', handle: '@orbitfox',
    initials: 'OF', roles: ['OG', 'SUB'], time: '8:42 PM', text: 'All three chats in one place is going to be wild <span class="emote">🚀</span>',
    xp: 8740, level: 19, queued: false, pinned: false, capabilities: { reply: true, moderate: false, tts: true },
  },
  {
    id: 'm4', provider: 'discord', channel: '#live-chat', kind: 'chat', name: 'Rin', handle: '@rin',
    initials: 'RI', roles: ['CREW', 'ARTIST'], time: '8:43 PM', reply: 'Replying to Mountain: “Show me the new overlay”',
    text: 'I dropped the updated scene mockup in the design thread.', xp: 22104, level: 35, queued: false, pinned: false,
    capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm5', provider: 'twitch', channel: 'creatorA', kind: 'event', event: 'Channel Point Redeem', name: 'CometChaser',
    handle: '@cometchaser', initials: 'CC', roles: ['VIP'], time: '8:43 PM', text: 'Hydrate the captain', value: '5,000 points',
    xp: 18650, level: 31, queued: true, pinned: false, capabilities: { reply: true, moderate: true, tts: true },
  },
  {
    id: 'm6', provider: 'spmt', channel: 'XP Ledger', kind: 'event', event: 'SPMT XP', name: 'PixelRanger',
    handle: '@pixelranger', initials: 'PR', roles: ['VERIFIED'], time: '8:44 PM', text: 'Creator streak milestone', value: '+125 XP',
    xp: 32102, level: 42, queued: false, pinned: false, capabilities: { reply: false, moderate: false, tts: false },
  },
  {
    id: 'm7', provider: 'youtube', channel: 'creatorB', kind: 'chat', name: 'MochiByte', handle: '@mochibyte',
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
  activeFilter: 'all',
  activeView: 'focus',
  selectedMessage: null,
  selectedDestinations: sources.map((source) => source.id),
  messages: initialMessages.map((message) => ({ ...message })),
  profile: null,
  etag: null,
  appearance: structuredClone(defaultAppearance),
  profileStatus: 'loading',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const providerStyle = (provider) => `--provider-rgb:${providers[provider].rgb}`;
const activeSources = () => {
  const space = chatSpaces.find((item) => item.id === state.activeSpace) || chatSpaces[0];
  return sources.filter((source) => space.sources.includes(source.id));
};

function toast(message) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), 3200);
}

function renderSpaces() {
  $('#space-list').innerHTML = chatSpaces.map((space) => `
    <button class="space-button ${space.id === state.activeSpace ? 'active' : ''}" type="button" data-space="${space.id}">
      <span class="space-icon" style="--space-rgb:${space.rgb}">${space.icon}</span>
      <span><strong>${space.name}</strong><small>${space.detail}</small></span>
      ${space.unread ? `<span class="unread">${space.unread}</span>` : ''}
    </button>
  `).join('');
  $$('.space-button').forEach((button) => button.addEventListener('click', () => {
    state.activeSpace = button.dataset.space;
    state.selectedDestinations = activeSources().map((source) => source.id);
    state.selectedMessage = null;
    renderAll();
    document.body.classList.remove('rail-open');
  }));
}

function renderSourceChips() {
  const current = activeSources();
  $('#source-count').textContent = `${current.length} source${current.length === 1 ? '' : 's'} live`;
  $('#source-chips').innerHTML = current.map((source) => {
    const provider = providers[source.provider];
    return `<span class="source-chip" style="${providerStyle(source.provider)}" title="${source.state}">
      <span class="provider-logo">${provider.short}</span>${provider.name} · ${source.channel}<span class="source-state"></span>
    </span>`;
  }).join('');
}

function messageCard(message, compact = false) {
  const provider = providers[message.provider];
  const stateTags = [
    message.pinned ? '<span class="state-tag">Pinned</span>' : '',
    message.queued ? '<span class="state-tag">Queued</span>' : '',
    message.firstTime ? '<span class="state-tag">First time</span>' : '',
  ].filter(Boolean).join('');
  const roles = message.roles.map((role, index) => `<span class="role-badge" style="--badge-rgb:${index % 2 ? '56,189,248' : provider.rgb}">${role}</span>`).join('');
  if (compact) {
    return `<div class="mini-message" style="${providerStyle(message.provider)}">
      <span class="message-avatar">${message.initials}</span>
      <span><strong>${message.name} · ${provider.name}</strong><p>${message.event ? `${message.event}: ` : ''}${message.text.replace(/<[^>]+>/g, '')}</p></span>
    </div>`;
  }
  return `<article class="message-card ${message.kind === 'event' ? 'event' : ''} ${message.id === state.selectedMessage ? 'selected' : ''}" data-message="${message.id}" style="${providerStyle(message.provider)}">
    <span class="message-avatar">${message.initials}<span class="provider-mini">${provider.short}</span></span>
    <div class="message-main">
      ${message.kind === 'event' ? `<div class="event-title">${message.event}${message.value ? `<span class="event-value">${message.value}</span>` : ''}</div>` : ''}
      <div class="message-meta"><span class="message-name">${message.name}</span>${roles}<span class="channel-label">${provider.name} · ${message.channel}</span><span class="message-time">${message.time}</span></div>
      ${message.reply ? `<div class="reply-context">${message.reply}</div>` : ''}
      <p class="message-text">${message.text}</p>
      ${stateTags ? `<div class="state-tags">${stateTags}</div>` : ''}
    </div>
    ${message.kind !== 'event' ? '<div class="message-tools"><button type="button" aria-label="Message actions">•••</button></div>' : ''}
  </article>`;
}

function renderMessages() {
  const sourceIds = new Set(activeSources().map((source) => source.id));
  const providerChannels = new Set(activeSources().map((source) => `${source.provider}:${source.channel}`));
  const visible = state.messages.filter((message) => {
    const belongs = message.provider === 'spmt' || providerChannels.has(`${message.provider}:${message.channel}`);
    if (!belongs && state.activeSpace !== 'friday') return false;
    if (state.activeFilter === 'chat') return message.kind === 'chat';
    if (state.activeFilter === 'events') return message.kind === 'event';
    if (state.activeFilter === 'queued') return message.queued;
    return true;
  });
  $('#message-feed').innerHTML = `<div class="date-separator">Live now · synthetic preview</div>${visible.map((message) => messageCard(message)).join('') || '<div class="feed-empty">No messages match this view.</div>'}`;
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
  const provider = providers[message.provider];
  const xpPercent = Math.min(100, Math.max(4, (message.xp % 1000) / 10));
  $('#context-content').innerHTML = `
    <div class="context-profile" style="${providerStyle(message.provider)}">
      <span class="context-avatar">${message.initials}</span>
      <h2>${message.name}</h2>
      <p>${message.handle} · ${provider.name}</p>
      <p>${message.roles.join(' · ')}</p>
    </div>
    <div class="xp-card">
      <div class="between"><span>SPMT level ${message.level}</span><strong>${message.xp.toLocaleString()} XP</strong></div>
      <div class="xp-bar"><span style="width:${xpPercent}%"></span></div>
    </div>
    <section class="context-section">
      <h3>Operator actions</h3>
      <div class="context-actions">
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
        <div class="capability ${message.capabilities.reply ? '' : 'unavailable'}"><span>Reply to source</span><span>${message.capabilities.reply ? 'Available' : 'Read only'}</span></div>
        <div class="capability ${message.capabilities.moderate ? '' : 'unavailable'}"><span>Moderation</span><span>${message.capabilities.moderate ? 'Available' : 'Unavailable'}</span></div>
        <div class="capability"><span>Connection</span><span>Healthy</span></div>
      </div>
    </section>
    <section class="context-section">
      <h3>Identity boundary</h3>
      <p class="message-text">Provider identity is shown separately. SPMT XP appears only for a verified link in production.</p>
    </section>`;
  $$('.context-actions button').forEach((button) => button.addEventListener('click', () => handleMessageAction(message, button.dataset.action)));
}

function handleMessageAction(message, action) {
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
    const source = sources.find((item) => item.id === id);
    const provider = providers[source.provider];
    return `<span class="destination-chip" style="${providerStyle(source.provider)}">${provider.name}/${source.channel}<button type="button" data-remove-destination="${id}" aria-label="Remove ${provider.name} ${source.channel}">×</button></span>`;
  }).join('');
  $('#send-label').textContent = `Send → ${state.selectedDestinations.length}`;
  $$('[data-remove-destination]').forEach((button) => button.addEventListener('click', () => {
    state.selectedDestinations = state.selectedDestinations.filter((id) => id !== button.dataset.removeDestination);
    renderDestinations();
  }));
}

function renderDesk() {
  const chatMessages = state.messages.filter((message) => message.kind === 'chat').slice(0, 5);
  const discordMessages = state.messages.filter((message) => message.provider === 'discord');
  const events = state.messages.filter((message) => message.kind === 'event');
  $('#desk-grid').innerHTML = `
    <section class="desk-panel">
      <header class="desk-panel-header"><span><strong>Main Multistream</strong><small>Twitch · Kick · YouTube</small></span><span class="panel-label">main-chat</span></header>
      <div class="desk-panel-body">${chatMessages.map((message) => messageCard(message, true)).join('')}</div>
    </section>
    <section class="desk-panel">
      <header class="desk-panel-header"><span><strong>Discord Ops</strong><small>Helper controls</small></span><span class="panel-label">discord-ops</span></header>
      <div class="desk-panel-body">${discordMessages.map((message) => messageCard(message, true)).join('')}</div>
    </section>
    <section class="desk-panel">
      <header class="desk-panel-header"><span><strong>Redeems + XP</strong><small>Events only · synced queue</small></span><span class="panel-label">redeems</span></header>
      <div class="desk-panel-body event-list">${events.map((message) => messageCard(message)).join('')}</div>
    </section>`;
}

function renderAll() {
  const space = chatSpaces.find((item) => item.id === state.activeSpace) || chatSpaces[0];
  $('#space-title').textContent = space.name;
  renderSpaces();
  renderSourceChips();
  renderMessages();
  renderContext();
  renderDestinations();
  renderDesk();
}

function showMentionMenu() {
  const menu = $('#mention-menu');
  menu.innerHTML = activeSources().map((source) => {
    const provider = providers[source.provider];
    return `<button class="mention-option" type="button" data-mention="${source.id}" style="${providerStyle(source.provider)}">
      <span class="provider-logo">${provider.short}</span><span>${provider.name}/${source.channel}<small>Target only this destination</small></span><small>${source.state}</small>
    </button>`;
  }).join('');
  menu.classList.remove('hidden');
  $$('.mention-option').forEach((button) => button.addEventListener('click', () => {
    state.selectedDestinations = [button.dataset.mention];
    const input = $('#compose-input');
    input.value = input.value.replace(/(^|\s)@\S*$/, '$1');
    menu.classList.add('hidden');
    renderDestinations();
    input.focus();
  }));
}

function openSendPreview() {
  const input = $('#compose-input');
  const message = input.value.trim();
  if (!message) return toast('Type a message before opening the destination preview.');
  if (!state.selectedDestinations.length) return toast('Select at least one destination.');
  $('#modal-message').textContent = message;
  $('#modal-destinations').innerHTML = state.selectedDestinations.map((id) => {
    const source = sources.find((item) => item.id === id);
    const provider = providers[source.provider];
    return `<div class="modal-destination" style="${providerStyle(source.provider)}">
      <span class="provider-logo">${provider.short}</span>
      <span><strong>${provider.name} · ${source.channel}</strong><small>${source.state}</small></span>
      <span>Ready</span>
    </div>`;
  }).join('');
  $('#send-modal').classList.remove('hidden');
}

function simulateSend() {
  const destinationNames = state.selectedDestinations.map((id) => sources.find((source) => source.id === id)?.channel).filter(Boolean);
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

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
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
  $('#destination-edit').addEventListener('click', () => {
    const next = activeSources().find((source) => !state.selectedDestinations.includes(source.id));
    state.selectedDestinations = next ? [...state.selectedDestinations, next.id] : activeSources().map((source) => source.id);
    renderDestinations();
  });
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
  $('#replay-button').addEventListener('click', () => toast('Preview: replay requested without re-triggering XP, TTS, or automation.'));
  $('#add-source').addEventListener('click', () => toast('Pass 2 will connect the authorized provider picker.'));
  $('#create-space').addEventListener('click', () => toast('Preview: the ChatSpace creator will be implemented after layout approval.'));
  $('#search-button').addEventListener('click', () => toast('Pass 2 will add bounded history search.'));

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
