const pathParts = window.location.pathname.split('/').filter(Boolean);
const surfaceId = pathParts.at(-1) || 'worktray';
const params = new URLSearchParams(window.location.search);
const mode = ['full', 'panel', 'dock', 'compact', 'overlay'].includes(params.get('mode')) ? params.get('mode') : 'panel';
const hostApp = String(params.get('app') || 'spmt').replace(/[^a-z0-9-]/gi, '').slice(0, 50) || 'spmt';
const state = { registry: null, profile: null, profileEtag: null };
const icons = { settings: 'settings', worktray: 'grid', notifications: 'bell', profile: 'user', overlays: 'layers' };

document.body.classList.add(`mode-${mode}`, `surface-${surfaceId}`);
document.getElementById('mode-chip').textContent = `${hostApp} · ${mode}`;

function token() { return localStorage.getItem('spmt_token') || ''; }
async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  return fetch(path, { ...options, headers, credentials: 'include' });
}
function escapeHtml(value) { const node = document.createElement('div'); node.textContent = String(value ?? ''); return node.innerHTML; }
function icon(name) { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`; }
function setStatus(message, kind = '') { const el = document.getElementById('status'); el.textContent = message; el.className = `status ${kind}`.trim(); }
function cardIcon(name) { return `<div class="icon-box">${icon(name)}</div>`; }
function initials(user) { return String(user?.displayName || user?.username || 'SPMT').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }

async function loadRegistry() {
  const response = await fetch('/api/platform/surfaces');
  if (!response.ok) throw new Error('Shared surface registry is unavailable.');
  state.registry = await response.json();
  const surface = state.registry.surfaces.find((item) => item.id === surfaceId);
  document.getElementById('surface-title').textContent = surface?.name || 'Shared surface';
  document.getElementById('surface-description').textContent = surface?.description || 'A canonical SPMT account surface.';
  document.title = `${surface?.name || 'Shared Surface'} · SPMT`;
  return surface;
}

function renderSettings(profile) {
  const a = profile.appearance;
  document.getElementById('surface-content').innerHTML = `<div class="settings-grid card full">
    <section class="setting-group"><h3>Theme & accent</h3>
      ${field('Theme preset', 'themeId', 'select', a.themeId, ['solar-flare','nebula-purple','oceanic-blue','aurora-green'])}
      ${field('Accent color', 'accentColor', 'color', a.accentColor)}
      ${field('Accent saturation', 'accentSaturation', 'range', a.accentSaturation, null, 0, 100)}
      ${field('Glow intensity', 'glowIntensity', 'range', a.glowIntensity, null, 0, 100)}
    </section>
    <section class="setting-group"><h3>Surface & density</h3>
      ${field('Density', 'density', 'select', a.density, ['compact','comfortable','spacious'])}
      ${field('Corner radius', 'cornerRadius', 'select', a.cornerRadius, ['sm','md','lg','full'])}
      ${field('Glass opacity', 'glassOpacity', 'range', a.glassOpacity, null, 0, 100)}
      ${toggle('Border glow', 'borderGlow', a.borderGlow)}
      ${toggle('Hover glow', 'hoverGlow', a.hoverGlow)}
    </section>
    <section class="setting-group"><h3>Chat & voice</h3>
      ${field('Tab style', 'tabStyle', 'select', a.tabStyle, ['pills','underline','cards'])}
      ${field('Mic button', 'micButtonStyle', 'select', a.micButtonStyle, ['round','square','minimal'])}
      ${field('Voice wave', 'voiceWaveStyle', 'select', a.voiceWaveStyle, ['bars','wave','pulse'])}
      ${field('Push-to-talk key', 'pushToTalkKey', 'text', a.pushToTalkKey)}
      ${toggle('Push to talk', 'pushToTalk', a.pushToTalk)}
    </section>
    <section class="setting-group"><h3>Accessibility & motion</h3>
      ${field('Text scale', 'accessibility.textScale', 'range', a.accessibility.textScale, null, 80, 140)}
      ${field('Color vision', 'accessibility.colorVisionMode', 'select', a.accessibility.colorVisionMode, ['default','deuteranopia','protanopia','tritanopia'])}
      ${toggle('High contrast', 'accessibility.highContrast', a.accessibility.highContrast)}
      ${toggle('Reduce motion', 'accessibility.reduceMotion', a.accessibility.reduceMotion)}
      ${toggle('Focus highlight', 'accessibility.focusHighlight', a.accessibility.focusHighlight)}
    </section>
  </div>`;
  document.getElementById('save-button').classList.remove('hidden');
}

function field(label, key, type, value, choices = null, min = 0, max = 100) {
  const control = type === 'select'
    ? `<select data-setting="${key}">${choices.map((choice) => `<option value="${choice}" ${choice === value ? 'selected' : ''}>${choice.replaceAll('-', ' ')}</option>`).join('')}</select>`
    : `<input data-setting="${key}" type="${type}" value="${escapeHtml(value)}" ${type === 'range' ? `min="${min}" max="${max}"` : ''}>`;
  return `<label class="field"><span>${label}</span>${control}</label>`;
}
function toggle(label, key, value) { return `<label class="field toggle"><span>${label}</span><input data-setting="${key}" type="checkbox" ${value ? 'checked' : ''}></label>`; }

function settingsPatch() {
  const result = structuredClone(state.profile.appearance);
  document.querySelectorAll('[data-setting]').forEach((input) => {
    const keys = input.dataset.setting.split('.');
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    let target = result;
    keys.slice(0, -1).forEach((key) => { target = target[key]; });
    target[keys.at(-1)] = value;
  });
  return result;
}

async function loadSettings() {
  const response = await api('/api/workspace-profile');
  if (response.status === 401) return signedOut();
  if (!response.ok) throw new Error('Universal settings could not be loaded.');
  const data = await response.json();
  state.profile = data.profile;
  state.profileEtag = response.headers.get('etag');
  renderSettings(data.profile);
  setStatus(`Synced revision ${data.profile.revision} across the SPMT account.`, 'ok');
}

async function saveSettings() {
  const button = document.getElementById('save-button');
  button.disabled = true;
  setStatus('Saving universal settings…');
  const response = await api('/api/workspace-profile', { method: 'PATCH', headers: { 'If-Match': state.profileEtag }, body: JSON.stringify({ profile: { appearance: settingsPatch() } }) });
  const data = await response.json().catch(() => ({}));
  button.disabled = false;
  if (response.status === 409) { setStatus('Settings changed in another app. Refresh and try again.', 'error'); return; }
  if (!response.ok) { setStatus(data.error || 'Settings could not be saved.', 'error'); return; }
  state.profile = data.profile;
  state.profileEtag = response.headers.get('etag');
  setStatus(`Saved revision ${data.profile.revision}. Every app can read it now.`, 'ok');
  window.parent.postMessage({ type: 'spmt.surface.updated', surface: 'settings', revision: data.profile.revision }, '*');
}

async function loadNotifications() {
  const response = await api('/api/notifications');
  if (response.status === 401) return signedOut();
  if (!response.ok) throw new Error('Notifications could not be loaded.');
  const data = await response.json();
  const items = data.notifications || [];
  document.getElementById('surface-content').innerHTML = `<div class="card full"><div class="row"><button class="button ghost" id="read-all">Mark all read</button><span class="chip">${items.filter((item) => !item.read_at).length} unread</span></div><div class="list">${items.length ? items.map((item) => `<article class="list-item"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.body)} · ${escapeHtml(item.source_app || 'SPMT')}</small></div><span class="chip">${item.read_at ? 'read' : 'new'}</span></article>`).join('') : '<div class="empty">No notifications yet.</div>'}</div></div>`;
  document.getElementById('read-all').onclick = async () => { await api('/api/notifications/read-all', { method: 'POST' }); loadNotifications(); };
  setStatus('Account notifications are live.', 'ok');
}

async function loadProfile() {
  const response = await api('/api/session/bridge');
  if (response.status === 401) return signedOut();
  if (!response.ok) throw new Error('Profile could not be loaded.');
  const data = await response.json();
  const user = data.user;
  document.getElementById('surface-content').innerHTML = `<article class="card wide profile-card"><div class="avatar">${initials(user)}</div><div><h2>${escapeHtml(user.displayName || user.username)}</h2><p>${escapeHtml(user.handle || `${user.username}@spmt.live`)}</p><div class="meta"><span>SPMT identity</span><span>${user.discord_username ? `Discord · ${escapeHtml(user.discord_username)}` : 'Discord not linked'}</span><span>${user.twitch_username ? `Twitch · ${escapeHtml(user.twitch_username)}` : 'Twitch not linked'}</span></div></div></article><article class="card"><h3>Available apps</h3><p>${(data.apps || []).length} apps share this account session.</p></article>`;
  setStatus('Profile is account-scoped and ready to embed.', 'ok');
}

async function loadOverlays() {
  const [scenesResponse, workspaceResponse] = await Promise.all([api('/api/workspace/overlay-scenes'), api('/api/overlay-workspace')]);
  if (scenesResponse.status === 401 || workspaceResponse.status === 401) return signedOut();
  const scenes = scenesResponse.ok ? (await scenesResponse.json()).scenes || [] : [];
  const workspace = workspaceResponse.ok ? await workspaceResponse.json() : { layout: null };
  document.getElementById('surface-content').innerHTML = `<article class="card wide"><h2>Overlay scenes</h2><p>Canonical scenes stay in SPMT so streaming apps render the same outputs.</p><div class="list">${scenes.length ? scenes.map((scene) => `<div class="list-item"><div><strong>${escapeHtml(scene.name)}</strong><small>Revision ${scene.revision}</small></div><span class="chip">scene</span></div>`).join('') : '<div class="empty">No saved scenes yet.</div>'}</div></article><article class="card"><h3>Workspace</h3><p>${workspace.layout?.widgets?.length || 0} widgets · ${workspace.layout?.workflows?.length || 0} workflows</p><a class="button ghost launch-link" href="/?view=overlay">Open manager</a></article>`;
  setStatus('Overlay data is loaded from the shared workspace.', 'ok');
}

async function loadWorktray() {
  const componentsResponse = await fetch('/api/platform/components');
  const components = componentsResponse.ok ? (await componentsResponse.json()).components || [] : [];
  const builtIns = state.registry.surfaces.filter((surface) => surface.id !== 'worktray');
  document.getElementById('surface-content').innerHTML = [...builtIns.map((surface) => `<article class="card">${cardIcon(icons[surface.id] || 'grid')}<h2>${escapeHtml(surface.name)}</h2><p>${escapeHtml(surface.description)}</p><div class="meta">${surface.modes.slice(0,3).map((item) => `<span>${item}</span>`).join('')}</div><a class="button ghost launch-link" href="${surface.path}?mode=${mode}&app=${encodeURIComponent(hostApp)}">Open</a></article>`), ...components.map((component) => `<article class="card"><div class="icon-box">${icon('grid')}</div><h2>${escapeHtml(component.name)}</h2><p>${escapeHtml(component.description)}</p><div class="meta"><span>${escapeHtml(component.appId)}</span><span>${escapeHtml(component.kind)}</span></div><a class="button ghost launch-link" href="${escapeHtml(component.launchUrl)}">Open</a></article>`)].join('');
  setStatus(`${builtIns.length} shared surfaces · ${components.length} app components.`, 'ok');
}

function signedOut() {
  document.getElementById('surface-content').innerHTML = '<div class="empty"><strong>Sign in to SPMT</strong><p>This surface uses your SPMT session. Tokens are never accepted in the URL.</p><a class="button primary launch-link" href="/">Open sign in</a></div>';
  setStatus('No active SPMT session.', 'error');
}

async function load() {
  try {
    await loadRegistry();
    document.getElementById('save-button').classList.add('hidden');
    if (surfaceId === 'settings') await loadSettings();
    else if (surfaceId === 'notifications') await loadNotifications();
    else if (surfaceId === 'profile') await loadProfile();
    else if (surfaceId === 'overlays') await loadOverlays();
    else await loadWorktray();
  } catch (error) {
    setStatus(error.message || 'This surface is unavailable.', 'error');
    document.getElementById('surface-content').innerHTML = '<div class="empty">The shared surface could not be loaded.</div>';
  }
}

document.getElementById('refresh-button').addEventListener('click', load);
document.getElementById('save-button').addEventListener('click', saveSettings);
load();
