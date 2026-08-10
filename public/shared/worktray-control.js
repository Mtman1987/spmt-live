(() => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  if ((pathParts.at(-1) || '') !== 'worktray') return;

  const params = new URLSearchParams(window.location.search);
  const hostApp = String(params.get('app') || 'spmt').replace(/[^a-z0-9-]/gi, '').slice(0, 50) || 'spmt';
  const controlState = { profile: null, etag: null, overlay: null, overlayUpdatedAt: null };

  async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem('spmt_token') || '';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(path, { ...options, headers, credentials: 'include' });
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  }

  function notify(surface, detail = {}) {
    window.parent.postMessage({ type: 'spmt.surface.updated', surface, ...detail }, '*');
  }

  async function loadState() {
    const [profileResponse, overlayResponse] = await Promise.all([
      request('/api/workspace-profile'),
      request('/api/overlay-workspace'),
    ]);
    if (!profileResponse.ok) throw new Error('Workspace profile is unavailable.');
    const profileData = await profileResponse.json();
    controlState.profile = profileData.profile;
    controlState.etag = profileResponse.headers.get('etag');
    if (overlayResponse.ok) {
      const overlayData = await overlayResponse.json();
      controlState.overlay = overlayData.layout || { enabled: true, widgets: [], workflows: [] };
      controlState.overlayUpdatedAt = overlayData.updatedAt || null;
    } else {
      controlState.overlay = { enabled: true, widgets: [], workflows: [] };
    }
  }

  function slotCard(slot) {
    return `<article class="control-slot" data-control-slot="${slot.id}">
      <div class="control-slot-head">
        <div><span>Embed ${slot.id}</span><strong>${escapeHtml(slot.title)}</strong></div>
        <label class="control-switch"><input type="checkbox" data-slot-visible="${slot.id}" ${slot.collapsed ? '' : 'checked'}><span></span></label>
      </div>
      <label>Title<input data-slot-title="${slot.id}" maxlength="80" value="${escapeHtml(slot.title)}"></label>
      <label>Embed URL<input data-slot-url="${slot.id}" value="${escapeHtml(slot.url)}"></label>
      <div class="control-slot-row">
        <label>Volume<input data-slot-volume="${slot.id}" type="range" min="0" max="1" step="0.05" value="${slot.volume}"></label>
        <label class="control-check"><input data-slot-muted="${slot.id}" type="checkbox" ${slot.muted ? 'checked' : ''}> Mute</label>
      </div>
      <div class="control-actions">
        <button type="button" class="button ghost" data-slot-preview="${slot.id}">Preview</button>
        <button type="button" class="button primary" data-slot-save="${slot.id}">Save embed ${slot.id}</button>
      </div>
    </article>`;
  }

  function overlayRow(widget, index) {
    return `<article class="control-overlay-row" data-widget-row="${escapeHtml(widget.id)}">
      <span class="control-layer">${index + 1}</span>
      <div class="control-overlay-copy"><strong>${escapeHtml(widget.title || widget.id)}</strong><small>${escapeHtml(widget.kind || 'embed')}</small></div>
      <label class="control-switch"><input type="checkbox" data-widget-visible="${escapeHtml(widget.id)}" ${widget.visible === false ? '' : 'checked'}><span></span></label>
      <label class="control-check"><input type="checkbox" data-widget-locked="${escapeHtml(widget.id)}" ${widget.locked ? 'checked' : ''}> Lock</label>
      <button type="button" class="button ghost" data-widget-edit="${escapeHtml(widget.id)}">Edit</button>
    </article>`;
  }

  function renderControls() {
    const shell = document.querySelector('.worktray-shell');
    if (!shell || document.getElementById('worktray-control-center')) return;
    const slots = controlState.profile?.dockSlots || [];
    const overlay = controlState.overlay || { enabled: true, widgets: [] };
    const section = document.createElement('section');
    section.id = 'worktray-control-center';
    section.className = 'worktray-control-center';
    section.innerHTML = `
      <div class="control-center-head">
        <div><span class="eyebrow">Universal in-app controls</span><h2>Workspace Control Center</h2><p>Edit embeds and overlays here without leaving ${escapeHtml(hostApp)}.</p></div>
        <div class="control-actions">
          <button type="button" class="button ghost" id="control-refresh">Refresh</button>
          <a class="button ghost" href="/embed/settings?mode=panel&app=${encodeURIComponent(hostApp)}">Theme settings</a>
        </div>
      </div>
      <div class="control-tabs">
        <button type="button" class="active" data-control-tab="embeds">3 embeds</button>
        <button type="button" data-control-tab="overlay">Overlay</button>
      </div>
      <div class="control-panel active" data-control-panel="embeds">
        <div class="control-slot-grid">${slots.map(slotCard).join('')}</div>
        <div class="control-preview" id="control-preview"><div class="empty">Preview any embed here while you configure it.</div></div>
      </div>
      <div class="control-panel" data-control-panel="overlay">
        <div class="control-overlay-master">
          <div><strong>Overlay workspace</strong><small>${(overlay.widgets || []).length} widgets · shared across every host</small></div>
          <label class="control-switch large"><input id="overlay-master-enabled" type="checkbox" ${overlay.enabled === false ? '' : 'checked'}><span></span></label>
        </div>
        <div class="control-overlay-list">${(overlay.widgets || []).map(overlayRow).join('') || '<div class="empty">No overlay widgets yet.</div>'}</div>
        <div class="control-actions">
          <button type="button" class="button primary" id="save-overlay-controls">Save overlay controls</button>
          <button type="button" class="button ghost" id="open-overlay-editor">Open full Overlay Bay here</button>
        </div>
        <div class="control-inline-editor hidden" id="control-inline-editor">
          <div class="control-inline-head"><strong>Overlay Bay</strong><button type="button" class="button ghost" id="close-overlay-editor">Close editor</button></div>
          <iframe src="/embed/overlays?mode=full&app=${encodeURIComponent(hostApp)}" title="SPMT Overlay Bay" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe>
        </div>
      </div>`;
    shell.prepend(section);
    wireControls();
  }

  function wireControls() {
    document.querySelectorAll('[data-control-tab]').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('[data-control-tab]').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-control-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.controlPanel === button.dataset.controlTab));
    }));
    document.querySelectorAll('[data-slot-save]').forEach((button) => button.addEventListener('click', () => saveSlot(Number(button.dataset.slotSave))));
    document.querySelectorAll('[data-slot-visible]').forEach((input) => input.addEventListener('change', () => saveSlot(Number(input.dataset.slotVisible), true)));
    document.querySelectorAll('[data-slot-preview]').forEach((button) => button.addEventListener('click', () => previewSlot(Number(button.dataset.slotPreview))));
    document.getElementById('save-overlay-controls')?.addEventListener('click', saveOverlayControls);
    document.getElementById('overlay-master-enabled')?.addEventListener('change', saveOverlayControls);
    document.querySelectorAll('[data-widget-visible],[data-widget-locked]').forEach((input) => input.addEventListener('change', saveOverlayControls));
    document.querySelectorAll('[data-widget-edit]').forEach((button) => button.addEventListener('click', () => editWidget(button.dataset.widgetEdit)));
    document.getElementById('open-overlay-editor')?.addEventListener('click', () => document.getElementById('control-inline-editor')?.classList.remove('hidden'));
    document.getElementById('close-overlay-editor')?.addEventListener('click', () => document.getElementById('control-inline-editor')?.classList.add('hidden'));
    document.getElementById('control-refresh')?.addEventListener('click', async () => { await reloadControls(); });
  }

  async function saveSlot(id, visibilityOnly = false) {
    const slot = controlState.profile.dockSlots.find((item) => item.id === id);
    if (!slot) return;
    const next = controlState.profile.dockSlots.map((item) => item.id === id ? {
      ...item,
      title: visibilityOnly ? item.title : (document.querySelector(`[data-slot-title="${id}"]`)?.value.trim() || `Slot ${id}`),
      url: visibilityOnly ? item.url : (document.querySelector(`[data-slot-url="${id}"]`)?.value.trim() || ''),
      volume: visibilityOnly ? item.volume : Number(document.querySelector(`[data-slot-volume="${id}"]`)?.value ?? item.volume),
      muted: visibilityOnly ? item.muted : Boolean(document.querySelector(`[data-slot-muted="${id}"]`)?.checked),
      collapsed: !Boolean(document.querySelector(`[data-slot-visible="${id}"]`)?.checked),
    } : item);
    const response = await request('/api/workspace-profile', {
      method: 'PATCH',
      headers: { 'If-Match': controlState.etag },
      body: JSON.stringify({ profile: { dockSlots: next } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      document.getElementById('status').textContent = data.error || Object.values(data.fields || {})[0] || `Embed ${id} could not be saved.`;
      return;
    }
    controlState.profile = data.profile;
    controlState.etag = response.headers.get('etag');
    document.getElementById('status').textContent = `Embed ${id} saved to SPMT revision ${data.profile.revision}.`;
    notify('worktray', { revision: data.profile.revision, changed: ['dockSlots'] });
  }

  function previewSlot(id) {
    const title = document.querySelector(`[data-slot-title="${id}"]`)?.value.trim() || `Embed ${id}`;
    const url = document.querySelector(`[data-slot-url="${id}"]`)?.value.trim();
    const target = document.getElementById('control-preview');
    if (!target) return;
    if (!url) { target.innerHTML = '<div class="empty">Add an HTTPS URL first.</div>'; return; }
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('embed', '1');
      target.innerHTML = `<iframe src="${escapeHtml(parsed.toString())}" title="${escapeHtml(title)}" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe>`;
    } catch { target.innerHTML = '<div class="empty">Enter a valid HTTPS URL.</div>'; }
  }

  function collectOverlay() {
    const next = structuredClone(controlState.overlay || { enabled: true, widgets: [], workflows: [] });
    next.enabled = Boolean(document.getElementById('overlay-master-enabled')?.checked);
    next.widgets = (next.widgets || []).map((widget) => ({
      ...widget,
      visible: Boolean(document.querySelector(`[data-widget-visible="${CSS.escape(widget.id)}"]`)?.checked),
      locked: Boolean(document.querySelector(`[data-widget-locked="${CSS.escape(widget.id)}"]`)?.checked),
    }));
    return next;
  }

  async function saveOverlayControls() {
    const next = collectOverlay();
    const response = await request('/api/overlay-workspace', { method: 'PUT', body: JSON.stringify({ layout: next }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      document.getElementById('status').textContent = data.error || 'Overlay controls could not be saved.';
      return;
    }
    controlState.overlay = next;
    controlState.overlayUpdatedAt = data.updatedAt || new Date().toISOString();
    document.getElementById('status').textContent = `Overlay controls saved from ${hostApp}.`;
    notify('overlays', { updatedAt: controlState.overlayUpdatedAt });
  }

  async function editWidget(id) {
    const widget = (controlState.overlay?.widgets || []).find((item) => item.id === id);
    if (!widget) return;
    const title = prompt('Overlay title', widget.title || 'Embed');
    if (title === null) return;
    const url = prompt('Overlay HTTPS URL', widget.url || '');
    if (url === null) return;
    widget.title = title.trim() || widget.title;
    widget.url = url.trim() || widget.url;
    await saveOverlayControls();
    await reloadControls('overlay');
  }

  async function reloadControls(openTab = null) {
    await loadState();
    document.getElementById('worktray-control-center')?.remove();
    renderControls();
    if (openTab) document.querySelector(`[data-control-tab="${openTab}"]`)?.click();
  }

  window.addEventListener('message', async (event) => {
    if (event.data?.type !== 'spmt.surface.updated') return;
    if (event.data.surface === 'overlays') await reloadControls('overlay');
  });

  const observer = new MutationObserver(() => {
    if (document.querySelector('.worktray-shell') && !document.getElementById('worktray-control-center')) {
      observer.disconnect();
      loadState().then(renderControls).catch(() => {});
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.querySelector('.worktray-shell')) loadState().then(renderControls).catch(() => {});
})();