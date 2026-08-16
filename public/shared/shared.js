const pathParts = window.location.pathname.split('/').filter(Boolean);
const surfaceId = pathParts.at(-1) || 'worktray';
const params = new URLSearchParams(window.location.search);
const supportedModes = ['full', 'panel', 'dock', 'compact', 'overlay'];
const mode = supportedModes.includes(params.get('mode')) ? params.get('mode') : 'panel';
const hostApp = String(params.get('app') || 'spmt').replace(/[^a-z0-9-]/gi, '').slice(0, 50) || 'spmt';
const state = { registry: null, profile: null, profileEtag: null, overlay: null, overlayDirty: false };
const sessionCache = window.SpmtSessionCache;

const THEMES = {
  'solar-flare': { name: 'Solar Flare', accent: '#F97316', secondary: '#FBBF24', glow: '249,115,22' },
  'nebula-purple': { name: 'Nebula Purple', accent: '#A855F7', secondary: '#E879F9', glow: '168,85,247' },
  'oceanic-blue': { name: 'Oceanic Blue', accent: '#3B82F6', secondary: '#22D3EE', glow: '59,130,246' },
  'aurora-green': { name: 'Aurora Green', accent: '#10B981', secondary: '#A3E635', glow: '16,185,129' },
};
const icons = { settings: 'settings', worktray: 'grid', notifications: 'bell', profile: 'user', overlays: 'layers', commlink: 'grid' };

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
function clone(value) { return structuredClone(value); }
function notifyHost(surface, detail = {}) { window.parent.postMessage({ type: 'spmt.surface.updated', surface, ...detail }, '*'); }

function applyAppearance(appearance) {
  if (!appearance) return;
  const theme = THEMES[appearance.themeId] || THEMES['solar-flare'];
  const accent = appearance.accentColor || theme.accent;
  const root = document.documentElement;
  root.dataset.spmtTheme = appearance.themeId;
  root.dataset.spmtDensity = appearance.density;
  root.dataset.spmtContrast = appearance.accessibility?.highContrast ? 'high' : 'standard';
  root.dataset.spmtSidebar = appearance.sidebarStyle;
  root.dataset.spmtTopbar = appearance.topbarStyle;
  root.dataset.spmtTabs = appearance.tabStyle;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent2', theme.secondary);
  root.style.setProperty('--accent-rgb', theme.glow);
  root.style.setProperty('--glow-strength', String((appearance.glowIntensity ?? 80) / 100));
  root.style.setProperty('--glass-opacity', String((appearance.glassOpacity ?? 65) / 100));
  root.style.setProperty('--surface-blur', `${appearance.blurStrength ?? 22}px`);
  root.style.setProperty('--star-opacity', String((appearance.starDensity ?? 70) / 100));
  root.style.setProperty('--nebula-opacity', String((appearance.nebulaIntensity ?? 80) / 100));
  root.style.setProperty('--border-strength', String((appearance.borderStrength ?? 60) / 100));
  root.style.setProperty('--chat-opacity', String((appearance.chatTransparency ?? 65) / 100));
  root.style.setProperty('--radius', ({ sm: '9px', md: '14px', lg: '20px', full: '999px' })[appearance.cornerRadius] || '14px');
  root.style.setProperty('--text-scale', `${(appearance.accessibility?.textScale ?? 100) / 100}`);
  document.body.classList.toggle('reduce-motion', Boolean(appearance.accessibility?.reduceMotion) || appearance.animation?.enabled === false);
  document.body.classList.toggle('no-particles', appearance.animation?.particles === false);
}

async function loadRegistry() {
  const response = await fetch('/api/platform/surfaces');
  if (!response.ok) throw new Error('Shared surface registry is unavailable.');
  state.registry = await response.json();
  sessionCache.write('registry', state.registry);
  const surface = state.registry.surfaces.find((item) => item.id === surfaceId);
  document.getElementById('surface-title').textContent = surface?.name || 'Shared surface';
  document.getElementById('surface-description').textContent = surface?.description || 'A canonical SPMT account surface.';
  document.title = `${surface?.name || 'Shared Surface'} · SPMT`;
  return surface;
}

async function loadProfile() {
  const response = await api('/api/workspace-profile');
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Workspace profile could not be loaded.');
  const data = await response.json();
  state.profile = data.profile;
  state.profileEtag = response.headers.get('etag');
  sessionCache.write('workspace', { profile: state.profile, etag: state.profileEtag });
  applyAppearance(data.profile.appearance);
  return data.profile;
}

function optionList(values, value) { return values.map((item) => `<option value="${item}" ${item === value ? 'selected' : ''}>${item.replaceAll('-', ' ')}</option>`).join(''); }
function field(label, key, type, value, choices = null, min = 0, max = 100, suffix = '') {
  const control = type === 'select'
    ? `<select data-setting="${key}">${optionList(choices, value)}</select>`
    : type === 'color'
      ? `<div class="value-control"><input data-setting="${key}" type="color" value="${escapeHtml(value)}"><code>${escapeHtml(value)}</code></div>`
      : type === 'range'
        ? `<div class="value-control"><input data-setting="${key}" type="range" value="${value}" min="${min}" max="${max}"><output>${value}${suffix}</output></div>`
        : `<input data-setting="${key}" type="${type}" value="${escapeHtml(value)}">`;
  return `<label class="field"><span>${label}</span>${control}</label>`;
}
function toggle(label, key, value, help = '') { return `<label class="field toggle"><span><strong>${label}</strong>${help ? `<small>${help}</small>` : ''}</span><input data-setting="${key}" type="checkbox" ${value ? 'checked' : ''}></label>`; }
function group(title, content, id = '') { return `<section class="setting-group" ${id ? `data-group="${id}"` : ''}><h3>${title}</h3>${content}</section>`; }

function renderThemePresets(a) {
  return `<div class="preset-grid">${Object.entries(THEMES).map(([id, theme]) => `
    <button type="button" class="preset-card ${a.themeId === id ? 'active' : ''}" data-theme-preset="${id}" style="--preset:${theme.accent};--preset2:${theme.secondary}">
      <span class="preset-orb"></span><strong>${theme.name}</strong><small>${id === 'solar-flare' ? 'Warm orange-gold energy' : id === 'nebula-purple' ? 'Deep violet cosmic glow' : id === 'oceanic-blue' ? 'Clean cyan-blue depth' : 'Emerald aurora light'}</small>
    </button>`).join('')}</div>`;
}

function renderSettings(profile) {
  const a = profile.appearance;
  const acc = a.accessibility;
  const anim = a.animation;
  document.getElementById('surface-content').innerHTML = `<div class="settings-layout card full">
    <aside class="settings-nav">
      ${['appearance','cosmos','layout','chat','motion','voice','accessibility','themes'].map((id, index) => `<button type="button" data-settings-section="${id}" class="${index === 0 ? 'active' : ''}">${id === 'cosmos' ? 'Background & Cosmos' : id === 'themes' ? 'Save / Load Theme' : id[0].toUpperCase() + id.slice(1)}</button>`).join('')}
    </aside>
    <div class="settings-panels">
      <div class="settings-section active" data-settings-panel="appearance">
        ${group('Theme presets', renderThemePresets(a))}
        ${group('Accent & glass', field('Accent color','accentColor','color',a.accentColor) + field('Accent saturation','accentSaturation','range',a.accentSaturation,null,0,150,'%') + field('Glow intensity','glowIntensity','range',a.glowIntensity,null,0,100,'%') + field('Glass opacity','glassOpacity','range',a.glassOpacity,null,20,95,'%') + field('Blur strength','blurStrength','range',a.blurStrength,null,0,60,'px') + toggle('Border glow','borderGlow',a.borderGlow) + toggle('Hover glow','hoverGlow',a.hoverGlow))}
      </div>
      <div class="settings-section" data-settings-panel="cosmos">
        ${group('Background & Cosmos', field('Star density','starDensity','range',a.starDensity,null,0,100,'%') + field('Nebula intensity','nebulaIntensity','range',a.nebulaIntensity,null,0,100,'%') + field('Parallax depth','parallaxDepth','range',a.parallaxDepth,null,0,100,'%') + toggle('Shooting stars','animation.shootingStars',anim.shootingStars) + toggle('Particle effects','animation.particles',anim.particles))}
      </div>
      <div class="settings-section" data-settings-panel="layout">
        ${group('Surface & density', field('UI density','density','select',a.density,['compact','comfortable','spacious']) + field('Border strength','borderStrength','range',a.borderStrength,null,0,100,'%') + field('Corner radius','cornerRadius','select',a.cornerRadius,['sm','md','lg','full']))}
        ${group('Application shell', toggle('Sidebar collapsed','sidebarCollapsed',a.sidebarCollapsed) + field('Sidebar style','sidebarStyle','select',a.sidebarStyle,['docked','floating','hidden']) + field('Sidebar position','sidebarPosition','select',a.sidebarPosition,['left','right']) + field('Top bar style','topbarStyle','select',a.topbarStyle,['transparent','glass']))}
      </div>
      <div class="settings-section" data-settings-panel="chat">
        ${group('Chat & tabs', field('Tab style','tabStyle','select',a.tabStyle,['pills','underline','cards']) + field('Tab position','tabPosition','select',a.tabPosition,['top','bottom','left','right']) + field('Chat transparency','chatTransparency','range',a.chatTransparency,null,0,100,'%') + toggle('Show avatars','showAvatars',a.showAvatars))}
      </div>
      <div class="settings-section" data-settings-panel="motion">
        ${group('Motion & effects', toggle('UI animations','animation.enabled',anim.enabled) + toggle('Smooth transitions','smoothTransitions',a.smoothTransitions) + field('Animation speed','animation.speed','range',anim.speed,null,20,200,'%') + toggle('Particle effects','animation.particles',anim.particles) + toggle('Shooting stars','animation.shootingStars',anim.shootingStars))}
      </div>
      <div class="settings-section" data-settings-panel="voice">
        ${group('Voice UI', toggle('Push to talk','pushToTalk',a.pushToTalk) + field('Push-to-talk key','pushToTalkKey','text',a.pushToTalkKey) + field('Mic button style','micButtonStyle','select',a.micButtonStyle,['round','square','minimal']) + field('Voice wave style','voiceWaveStyle','select',a.voiceWaveStyle,['bars','wave','pulse']))}
        ${group('Shared subscriptions', toggle('Follow StreamWeaver TTS','tts:streamweaver-main',(profile.ttsSubscriptions || []).includes('streamweaver-main'),'Use the shared account mixer when available.'))}
      </div>
      <div class="settings-section" data-settings-panel="accessibility">
        ${group('Accessibility', toggle('High contrast','accessibility.highContrast',acc.highContrast) + field('Color vision mode','accessibility.colorVisionMode','select',acc.colorVisionMode,['default','deuteranopia','protanopia','tritanopia']) + field('Text scale','accessibility.textScale','range',acc.textScale,null,80,140,'%') + toggle('Reduce motion','accessibility.reduceMotion',acc.reduceMotion) + toggle('Focus highlight','accessibility.focusHighlight',acc.focusHighlight))}
      </div>
      <div class="settings-section" data-settings-panel="themes">
        ${group('Save this workspace theme', `<label class="field"><span>Theme name</span><input id="theme-name" type="text" maxlength="80" value="My SpaceMountain Theme"></label><div class="action-row"><button class="button primary" id="save-theme" type="button">Save theme</button><button class="button ghost" id="export-theme" type="button">Export JSON</button><label class="button ghost file-button">Import JSON<input id="import-theme" type="file" accept="application/json"></label></div><div id="saved-theme-list" class="saved-theme-list"></div>`)}
      </div>
    </div>
  </div>`;
  document.getElementById('save-button').classList.remove('hidden');
  wireSettings();
  renderSavedThemes();
}

function settingValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'range') return Number(input.value);
  return input.value;
}
function setNested(target, key, value) {
  const keys = key.split('.');
  let cursor = target;
  keys.slice(0, -1).forEach((part) => { cursor[part] ??= {}; cursor = cursor[part]; });
  cursor[keys.at(-1)] = value;
}
function settingsPatch() {
  const result = clone(state.profile.appearance);
  document.querySelectorAll('[data-setting]').forEach((input) => {
    if (input.dataset.setting.startsWith('tts:')) return;
    setNested(result, input.dataset.setting, settingValue(input));
  });
  return result;
}
function wireSettings() {
  document.querySelectorAll('[data-settings-section]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-settings-section]').forEach((item) => item.classList.toggle('active', item === button));
    document.querySelectorAll('[data-settings-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.settingsPanel === button.dataset.settingsSection));
  }));
  document.querySelectorAll('[data-theme-preset]').forEach((button) => button.addEventListener('click', () => {
    const theme = THEMES[button.dataset.themePreset];
    state.profile.appearance.themeId = button.dataset.themePreset;
    state.profile.appearance.accentColor = theme.accent;
    renderSettings(state.profile);
    setStatus(`${theme.name} previewed. Save changes to sync it everywhere.`);
  }));
  document.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('input', () => {
    if (input.type === 'range') input.parentElement.querySelector('output').textContent = `${input.value}${input.dataset.setting === 'blurStrength' ? 'px' : '%'}`;
    if (!input.dataset.setting.startsWith('tts:')) {
      state.profile.appearance = settingsPatch();
      applyAppearance(state.profile.appearance);
    }
  }));
  const tts = document.querySelector('[data-setting="tts:streamweaver-main"]');
  if (tts) tts.addEventListener('change', () => {
    const current = new Set(state.profile.ttsSubscriptions || []);
    tts.checked ? current.add('streamweaver-main') : current.delete('streamweaver-main');
    state.profile.ttsSubscriptions = [...current];
  });
  document.getElementById('save-theme')?.addEventListener('click', saveNamedTheme);
  document.getElementById('export-theme')?.addEventListener('click', exportTheme);
  document.getElementById('import-theme')?.addEventListener('change', importTheme);
}
function renderSavedThemes() {
  const target = document.getElementById('saved-theme-list');
  if (!target) return;
  const themes = state.profile.savedThemes || [];
  target.innerHTML = themes.length ? themes.map((saved) => `<article><div><strong>${escapeHtml(saved.name)}</strong><small>${THEMES[saved.appearance.themeId]?.name || saved.appearance.themeId}</small></div><div><button class="button ghost" data-apply-theme="${saved.id}">Apply</button><button class="button ghost danger" data-delete-theme="${saved.id}">Delete</button></div></article>`).join('') : '<p class="empty-inline">No saved themes yet.</p>';
  target.querySelectorAll('[data-apply-theme]').forEach((button) => button.addEventListener('click', () => {
    const saved = themes.find((item) => item.id === button.dataset.applyTheme); if (!saved) return;
    state.profile.appearance = clone(saved.appearance); renderSettings(state.profile); setStatus(`${saved.name} applied. Save changes to sync it.`);
  }));
  target.querySelectorAll('[data-delete-theme]').forEach((button) => button.addEventListener('click', () => {
    state.profile.savedThemes = themes.filter((item) => item.id !== button.dataset.deleteTheme); renderSavedThemes();
  }));
}
function saveNamedTheme() {
  const now = new Date().toISOString();
  const name = document.getElementById('theme-name').value.trim() || 'Custom Theme';
  state.profile.savedThemes = [...(state.profile.savedThemes || []), { id: `theme-${Date.now()}`, name, appearance: clone(settingsPatch()), createdAt: now, updatedAt: now }].slice(-20);
  renderSavedThemes(); setStatus(`${name} added to this workspace. Save changes to persist it.`);
}
function exportTheme() {
  const payload = { name: document.getElementById('theme-name')?.value || 'SPMT Theme', appearance: settingsPatch() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'spmt-theme.json'; anchor.click(); URL.revokeObjectURL(url);
}
async function importTheme(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try { const parsed = JSON.parse(await file.text()); if (!parsed.appearance?.themeId) throw new Error(); state.profile.appearance = parsed.appearance; renderSettings(state.profile); setStatus(`${parsed.name || file.name} imported. Save changes to sync it.`); }
  catch { setStatus('That file is not a valid SPMT theme.', 'error'); }
}
async function saveSettings() {
  const button = document.getElementById('save-button'); button.disabled = true; setStatus('Saving universal workspace…');
  const profilePatch = { appearance: settingsPatch(), ttsSubscriptions: state.profile.ttsSubscriptions || [], savedThemes: state.profile.savedThemes || [], appThemeMappings: state.profile.appThemeMappings || {} };
  const response = await api('/api/workspace-profile', { method: 'PATCH', headers: { 'If-Match': state.profileEtag }, body: JSON.stringify({ profile: profilePatch }) });
  const data = await response.json().catch(() => ({})); button.disabled = false;
  if (response.status === 409) { state.profile = data.profile; setStatus('A newer workspace revision exists. Refresh before saving again.', 'error'); return; }
  if (!response.ok) { setStatus(data.error || Object.values(data.fields || {})[0] || 'Settings could not be saved.', 'error'); return; }
  state.profile = data.profile; state.profileEtag = response.headers.get('etag'); applyAppearance(data.profile.appearance); setStatus(`Saved revision ${data.profile.revision}. Every consumer now reads this SPMT workspace.`, 'ok'); notifyHost('settings', { revision: data.profile.revision });
  sessionCache.write('workspace', { profile: state.profile, etag: state.profileEtag });
}

function dockFrameUrl(slot) { try { const url = new URL(slot.url); url.searchParams.set('embed', '1'); return url.toString(); } catch { return slot.url; } }
function renderWorktray() {
  const profile = state.profile;
  const slots = profile.dockSlots || [];
  document.getElementById('surface-content').innerHTML = `<div class="worktray-shell card full">
    <div class="tray-heading"><div><span class="eyebrow">Account workspace</span><h2>Crew Desk</h2><p>Your three dock slots live in SPMT and follow you to every host.</p></div><a class="button ghost" href="/embed/settings?mode=panel&app=${encodeURIComponent(hostApp)}">Universal settings</a></div>
    <div class="dock-slots">${slots.map((slot) => `<button type="button" class="dock-slot ${slot.collapsed ? 'collapsed' : ''}" data-dock-slot="${slot.id}"><span>Slot ${slot.id}</span><strong>${escapeHtml(slot.title)}</strong><small>${slot.collapsed ? 'Hidden' : 'Ready'}</small></button>`).join('')}</div>
    <div class="dock-stage" id="dock-stage"><div class="empty">Choose a slot to open it here.</div></div>
    <div class="dock-editor" id="dock-editor"></div>
    <div class="surface-launch-grid">${state.registry.surfaces.filter((surface) => surface.id !== 'worktray').map((surface) => `<a class="surface-launch" href="${surface.path}?mode=${mode}&app=${encodeURIComponent(hostApp)}">${cardIcon(icons[surface.id] || 'grid')}<strong>${escapeHtml(surface.name)}</strong><small>${escapeHtml(surface.description)}</small></a>`).join('')}</div>
    <div id="component-launch-grid" class="surface-launch-grid"></div>
  </div>`;
  document.querySelectorAll('[data-dock-slot]').forEach((button) => button.addEventListener('click', () => openDockSlot(Number(button.dataset.dockSlot))));
  loadComponents();
}
async function loadComponents() {
  const response = await fetch('/api/platform/components'); const data = response.ok ? await response.json() : { components: [] };
  const target = document.getElementById('component-launch-grid'); if (!target) return;
  target.innerHTML = (data.components || []).map((component) => `<a class="surface-launch" href="${escapeHtml(component.launchUrl)}">${cardIcon('grid')}<strong>${escapeHtml(component.name)}</strong><small>${escapeHtml(component.appId)} · ${escapeHtml(component.kind)}</small></a>`).join('');
}
function openDockSlot(id) {
  const slot = state.profile.dockSlots.find((item) => item.id === id); if (!slot) return;
  document.querySelectorAll('[data-dock-slot]').forEach((button) => button.classList.toggle('active', Number(button.dataset.dockSlot) === id));
  document.getElementById('dock-stage').innerHTML = slot.url ? `<iframe src="${escapeHtml(dockFrameUrl(slot))}" title="${escapeHtml(slot.title)}" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe>` : '<div class="empty">This slot has no URL yet.</div>';
  document.getElementById('dock-editor').innerHTML = `<label><span>Title</span><input id="dock-title" maxlength="80" value="${escapeHtml(slot.title)}"></label><label><span>HTTPS URL</span><input id="dock-url" value="${escapeHtml(slot.url)}"></label><label><span>Volume</span><input id="dock-volume" type="range" min="0" max="1" step="0.05" value="${slot.volume}"></label><label class="inline-check"><input id="dock-muted" type="checkbox" ${slot.muted ? 'checked' : ''}> Muted</label><label class="inline-check"><input id="dock-collapsed" type="checkbox" ${slot.collapsed ? 'checked' : ''}> Hidden by default</label><button class="button primary" id="save-dock-slot" type="button">Save slot ${id}</button>`;
  document.getElementById('save-dock-slot').addEventListener('click', () => saveDockSlot(id));
}
async function saveDockSlot(id) {
  const nextSlots = state.profile.dockSlots.map((slot) => slot.id === id ? { ...slot, title: document.getElementById('dock-title').value.trim() || `Slot ${id}`, url: document.getElementById('dock-url').value.trim(), volume: Number(document.getElementById('dock-volume').value), muted: document.getElementById('dock-muted').checked, collapsed: document.getElementById('dock-collapsed').checked } : slot);
  const response = await api('/api/workspace-profile', { method: 'PATCH', headers: { 'If-Match': state.profileEtag }, body: JSON.stringify({ profile: { dockSlots: nextSlots } }) });
  const data = await response.json().catch(() => ({})); if (!response.ok) { setStatus(data.error || Object.values(data.fields || {})[0] || 'Dock slot could not be saved.', 'error'); return; }
  state.profile = data.profile; state.profileEtag = response.headers.get('etag'); renderWorktray(); openDockSlot(id); setStatus(`Slot ${id} saved to SPMT revision ${data.profile.revision}.`, 'ok'); notifyHost('worktray', { revision: data.profile.revision, changed: ['dockSlots'] });
  sessionCache.write('workspace', { profile: state.profile, etag: state.profileEtag });
}

function overlayDefaults() { return { enabled: true, widgets: [], workflows: [] }; }
async function loadOverlayWorkspace() {
  const response = await api('/api/overlay-workspace');
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Overlay workspace could not be loaded.');
  const data = await response.json(); state.overlay = data.layout || overlayDefaults(); sessionCache.write('overlay', state.overlay); return state.overlay;
}
function renderOverlays() {
  const layout = state.overlay || overlayDefaults();
  document.getElementById('surface-content').innerHTML = `<div class="overlay-manager card full">
    <div class="tray-heading"><div><span class="eyebrow">Canonical overlay workspace</span><h2>Overlay Bay</h2><p>Drag, resize, hide, lock, and layer account widgets. Changes save to SPMT.</p></div><div class="action-row"><button class="button ghost" id="add-overlay-widget">Add embed</button><button class="button primary" id="save-overlay">Save overlay</button></div></div>
    <div class="overlay-canvas ${layout.enabled === false ? 'disabled' : ''}" id="overlay-canvas">${(layout.widgets || []).map((widget, index) => overlayWidgetMarkup(widget, index)).join('') || '<div class="empty overlay-empty">No overlay widgets yet. Add an embed to start.</div>'}</div>
    <div class="overlay-layers"><div class="row between"><strong>Layers</strong><label class="inline-check"><input id="overlay-enabled" type="checkbox" ${layout.enabled !== false ? 'checked' : ''}> Workspace enabled</label></div><div id="overlay-layer-list">${(layout.widgets || []).map((widget, index) => `<article><span>${index + 1}</span><strong>${escapeHtml(widget.title || widget.id)}</strong><button data-toggle-widget="${escapeHtml(widget.id)}">${widget.visible === false ? 'Show' : 'Hide'}</button><button data-remove-widget="${escapeHtml(widget.id)}">Remove</button></article>`).join('')}</div></div>
  </div>`;
  wireOverlayManager();
}
function overlayWidgetMarkup(widget, index) {
  const z = Number.isFinite(widget.zIndex) ? widget.zIndex : index + 1;
  return `<section class="overlay-widget ${widget.visible === false ? 'widget-hidden' : ''}" data-overlay-widget="${escapeHtml(widget.id)}" style="left:${widget.x ?? 5}%;top:${widget.y ?? 5}%;width:${Math.max(160, widget.width ?? 360)}px;height:${Math.max(90, widget.height ?? 220)}px;opacity:${widget.opacity ?? 1};z-index:${z}"><header data-drag-handle><strong>${escapeHtml(widget.title || 'Embed')}</strong><span>${escapeHtml(widget.kind || 'embed')}</span></header><iframe src="${escapeHtml(widget.url || 'about:blank')}" title="${escapeHtml(widget.title || 'Overlay embed')}" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe><button class="resize-handle" type="button" data-resize-handle aria-label="Resize ${escapeHtml(widget.title || 'widget')}"></button></section>`;
}
function wireOverlayManager() {
  document.getElementById('add-overlay-widget').addEventListener('click', () => {
    const id = `embed-${Date.now()}`; state.overlay.widgets ??= []; state.overlay.widgets.push({ id, title: 'New Embed', kind: 'embed', url: 'about:blank', visible: true, locked: false, interactive: true, x: 8, y: 8, width: 360, height: 220, opacity: 1, zIndex: state.overlay.widgets.length + 1 }); renderOverlays();
  });
  document.getElementById('save-overlay').addEventListener('click', saveOverlayWorkspace);
  document.getElementById('overlay-enabled').addEventListener('change', (event) => { state.overlay.enabled = event.target.checked; state.overlayDirty = true; document.getElementById('overlay-canvas').classList.toggle('disabled', !event.target.checked); });
  document.querySelectorAll('[data-toggle-widget]').forEach((button) => button.addEventListener('click', () => { const widget = state.overlay.widgets.find((item) => item.id === button.dataset.toggleWidget); if (widget) widget.visible = widget.visible === false; renderOverlays(); }));
  document.querySelectorAll('[data-remove-widget]').forEach((button) => button.addEventListener('click', () => { state.overlay.widgets = state.overlay.widgets.filter((item) => item.id !== button.dataset.removeWidget); renderOverlays(); }));
  document.querySelectorAll('[data-overlay-widget]').forEach((element) => wireOverlayPointer(element));
  document.querySelectorAll('[data-overlay-widget] header').forEach((header) => header.addEventListener('dblclick', () => editOverlayWidget(header.parentElement.dataset.overlayWidget)));
}
function editOverlayWidget(id) {
  const widget = state.overlay.widgets.find((item) => item.id === id); if (!widget) return;
  const title = prompt('Overlay title', widget.title || 'Embed'); if (title === null) return;
  const url = prompt('Overlay HTTPS URL', widget.url || ''); if (url === null) return;
  widget.title = title.trim() || widget.title; widget.url = url.trim() || widget.url; renderOverlays();
}
function wireOverlayPointer(element) {
  const id = element.dataset.overlayWidget; const widget = state.overlay.widgets.find((item) => item.id === id); if (!widget || widget.locked) return;
  const begin = (event, resizing) => {
    event.preventDefault(); const sx = event.clientX, sy = event.clientY; const start = { x: widget.x ?? 0, y: widget.y ?? 0, width: widget.width ?? 360, height: widget.height ?? 220 };
    const move = (e) => { const dx = e.clientX - sx, dy = e.clientY - sy; if (resizing) { widget.width = Math.max(160, start.width + dx); widget.height = Math.max(90, start.height + dy); } else { widget.x = Math.max(0, Math.min(95, start.x + dx / Math.max(1, window.innerWidth) * 100)); widget.y = Math.max(0, Math.min(95, start.y + dy / Math.max(1, window.innerHeight) * 100)); } state.overlayDirty = true; element.style.left = `${widget.x}%`; element.style.top = `${widget.y}%`; element.style.width = `${widget.width}px`; element.style.height = `${widget.height}px`; };
    const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  };
  element.querySelector('[data-drag-handle]').addEventListener('pointerdown', (event) => begin(event, false));
  element.querySelector('[data-resize-handle]').addEventListener('pointerdown', (event) => begin(event, true));
}
async function saveOverlayWorkspace() {
  const response = await api('/api/overlay-workspace', { method: 'PUT', body: JSON.stringify({ layout: state.overlay }) });
  const data = await response.json().catch(() => ({})); if (!response.ok) { setStatus(data.error || 'Overlay workspace could not be saved.', 'error'); return; }
  state.overlayDirty = false; sessionCache.write('overlay', state.overlay); setStatus('Overlay workspace saved to SPMT.', 'ok'); notifyHost('overlays', { updatedAt: data.updatedAt });
}

async function loadNotifications() {
  const response = await api('/api/notifications'); if (response.status === 401) return signedOut(); if (!response.ok) throw new Error('Notifications could not be loaded.');
  const data = await response.json(); const items = data.notifications || [];
  document.getElementById('surface-content').innerHTML = `<div class="card full"><div class="row between"><h2>Notifications</h2><button class="button ghost" id="read-all">Mark all read</button></div><div class="list">${items.length ? items.map((item) => `<article class="list-item"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.body)} · ${escapeHtml(item.source_app || 'SPMT')}</small></div><span class="chip">${item.read_at ? 'read' : 'new'}</span></article>`).join('') : '<div class="empty">No notifications yet.</div>'}</div></div>`;
  document.getElementById('read-all').onclick = async () => { await api('/api/notifications/read-all', { method: 'POST' }); loadNotifications(); };
  setStatus('Account notifications are live.', 'ok');
}
async function loadIdentityProfile() {
  const response = await api('/api/session/bridge'); if (response.status === 401) return signedOut(); if (!response.ok) throw new Error('Profile could not be loaded.');
  const data = await response.json(); const user = data.user;
  document.getElementById('surface-content').innerHTML = `<article class="card wide profile-card"><div class="avatar">${initials(user)}</div><div><span class="eyebrow">SPMT identity</span><h2>${escapeHtml(user.displayName || user.username)}</h2><p>${escapeHtml(user.handle || `${user.username}@spmt.live`)}</p><div class="meta"><span>${user.discord_username ? `Discord · ${escapeHtml(user.discord_username)}` : 'Discord not linked'}</span><span>${user.twitch_username ? `Twitch · ${escapeHtml(user.twitch_username)}` : 'Twitch not linked'}</span></div></div></article><article class="card"><h3>Suite access</h3><p>${(data.apps || []).length} apps share this account session.</p></article>`;
  setStatus('Profile is account-scoped and ready to embed.', 'ok');
}
function signedOut() { document.getElementById('surface-content').innerHTML = '<div class="empty"><strong>Sign in to SPMT</strong><p>This shared surface uses the canonical SPMT account session.</p><a class="button primary launch-link" href="/">Open sign in</a></div>'; setStatus('No active SPMT session.', 'error'); }

async function renderCurrentSurface(profile, cached = false) {
  if (surfaceId === 'settings') renderSettings(profile);
  else if (surfaceId === 'worktray') renderWorktray();
  else if (surfaceId === 'overlays') {
    if (!cached) await loadOverlayWorkspace();
    renderOverlays();
  } else renderWorktray();
  if (surfaceId === 'settings') document.getElementById('save-button').disabled = cached;
  setStatus(cached
    ? `Showing saved workspace revision ${profile.revision} while SPMT refreshes in the background.`
    : `Synced workspace revision ${profile.revision}.`, cached ? '' : 'ok');
}

async function load() {
  document.getElementById('save-button').classList.add('hidden');
  if (surfaceId === 'notifications') return loadNotifications();
  if (surfaceId === 'profile') return loadIdentityProfile();

  const cachedRegistry = sessionCache.read('registry')?.value;
  const cachedWorkspace = sessionCache.read('workspace')?.value;
  const cachedOverlay = sessionCache.read('overlay')?.value;
  let restored = false;
  if (cachedWorkspace?.profile && (surfaceId === 'settings' || cachedRegistry)) {
    state.registry = cachedRegistry || state.registry;
    state.profile = cachedWorkspace.profile;
    state.profileEtag = cachedWorkspace.etag || null;
    state.overlay = cachedOverlay || overlayDefaults();
    applyAppearance(state.profile.appearance);
    await renderCurrentSurface(state.profile, true);
    restored = true;
  }

  try {
    await loadRegistry();
    const profile = await loadProfile();
    if (!profile) {
      if (restored) return setStatus('The saved workspace is visible, but this SPMT session needs sign-in before it can sync.', 'error');
      return signedOut();
    }
    await renderCurrentSurface(profile, false);
  } catch (error) {
    if (restored) return setStatus('Using the saved workspace while SPMT reconnects.', 'error');
    setStatus(error.message || 'This surface is unavailable.', 'error');
    document.getElementById('surface-content').innerHTML = '<div class="empty">The shared surface could not be loaded.</div>';
  }
}

document.getElementById('refresh-button').addEventListener('click', load);
document.getElementById('save-button').addEventListener('click', saveSettings);
load();
