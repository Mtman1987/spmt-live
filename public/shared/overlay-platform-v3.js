(() => {
  if (window.__spmtOverlayPlatformV3Installed || !window.SPMTOverlayWidgets) return;
  window.__spmtOverlayPlatformV3Installed = true;

  const contract = window.SPMTOverlayWidgets;
  const currentSurface = typeof surfaceId === 'undefined' ? '' : surfaceId;
  const currentMode = typeof mode === 'undefined' ? 'panel' : mode;
  const currentHost = typeof hostApp === 'undefined' ? 'spmt' : hostApp;
  if (currentMode === 'overlay') return; // Never alter legacy/render-only overlay runtimes.

  const platformState = {
    output: typeof params !== 'undefined' && params.get('output') === 'personal' ? 'personal' : 'public',
    tenant: '',
    urls: null,
    selectedId: null,
    baseRender: window.renderOverlays,
    baseEdit: window.editOverlayWidget,
    stageObserver: null,
    enhancing: false,
  };

  function request(path, options = {}) {
    if (typeof api === 'function') return api(path, options);
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem('spmt_token') || '';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return fetch(path, { ...options, headers, credentials: 'include' });
  }

  function markDirty() {
    try { state.overlayDirty = true; } catch {}
  }

  function setUiStatus(message, kind = '') {
    try { setStatus(message, kind); } catch {}
  }

  function notifyScene(detail = {}) {
    try { notifyHost('overlays', detail); } catch {}
  }

  function outputLabel(output = platformState.output) {
    return output === 'personal' ? 'Personal' : 'Public';
  }

  function rememberTenant(data) {
    platformState.tenant = String(data?.tenant || platformState.tenant || '');
    platformState.urls = data?.urls || platformState.urls;
    window.spmtTenantOutputs = platformState.urls ? { tenant: platformState.tenant, ...platformState.urls } : null;
  }

  async function loadTenantOverlay(output = platformState.output) {
    const response = await request(`/api/tenant-scene?output=${encodeURIComponent(output)}`);
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`${outputLabel(output)} overlay could not be loaded.`);
    const data = await response.json();
    rememberTenant(data);
    platformState.output = data.output === 'personal' ? 'personal' : 'public';
    state.overlay = contract.normalizeLayout(data.layout);
    state.overlayDirty = false;
    return state.overlay;
  }

  async function saveTenantOverlay() {
    state.overlay = contract.normalizeLayout(state.overlay);
    const response = await request(`/api/tenant-scene/${platformState.output}`, {
      method: 'PUT',
      body: JSON.stringify({ layout: state.overlay }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUiStatus(data.error || `${outputLabel()} overlay could not be saved.`, 'error');
      return false;
    }
    rememberTenant(data);
    state.overlay = contract.normalizeLayout(data.layout || state.overlay);
    state.overlayDirty = false;
    setUiStatus(`${outputLabel()} overlay saved to ${platformState.tenant}.`, 'ok');
    notifyScene({ output: platformState.output, tenant: platformState.tenant, updatedAt: data.updatedAt, urls: platformState.urls });
    renderPlatformOverlay();
    return true;
  }

  function sceneScale(canvas) {
    const rect = canvas?.getBoundingClientRect?.();
    return rect?.width ? rect.width / contract.scene.width : 1;
  }

  function wireScenePointer(element) {
    const id = element.dataset.overlayWidget;
    const widget = state.overlay?.widgets?.find((item) => item.id === id);
    if (!widget || widget.locked) return;
    const dragHandle = element.querySelector('[data-drag-handle]');
    const resizeHandle = element.querySelector('[data-resize-handle]');
    if (!dragHandle || !resizeHandle) return;

    const begin = (event, resizing) => {
      event.preventDefault();
      selectWidget(id, false);
      const canvas = element.closest('#overlay-canvas');
      const scale = Math.max(.05, sceneScale(canvas));
      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: Number(widget.x) || 0,
        y: Number(widget.y) || 0,
        width: Number(widget.width) || 360,
        height: Number(widget.height) || 220,
      };

      const move = (nextEvent) => {
        const dx = (nextEvent.clientX - start.pointerX) / scale;
        const dy = (nextEvent.clientY - start.pointerY) / scale;
        if (resizing) {
          widget.width = Math.max(24, Math.min(contract.scene.width * 2, start.width + dx));
          widget.height = Math.max(24, Math.min(contract.scene.height * 2, start.height + dy));
        } else {
          const maxX = Math.max(0, 100 - (widget.width / contract.scene.width) * 100);
          const maxY = Math.max(0, 100 - (widget.height / contract.scene.height) * 100);
          widget.x = Math.max(0, Math.min(maxX, start.x + (dx / contract.scene.width) * 100));
          widget.y = Math.max(0, Math.min(maxY, start.y + (dy / contract.scene.height) * 100));
        }
        markDirty();
        element.style.left = `${widget.x}%`;
        element.style.top = `${widget.y}%`;
        element.style.width = `${widget.width}px`;
        element.style.height = `${widget.height}px`;
        updateInspectorValues(widget);
      };

      const end = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
    };

    dragHandle.addEventListener('pointerdown', (event) => begin(event, false));
    resizeHandle.addEventListener('pointerdown', (event) => begin(event, true));
  }

  function copyText(value, input = null) {
    const text = String(value || '');
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => setUiStatus('Output URL copied.', 'ok')).catch(() => {
      if (input) {
        input.focus();
        input.select();
      }
      try { document.execCommand('copy'); setUiStatus('Output URL copied.', 'ok'); } catch {}
    });
  }

  function urlRow(kind, url) {
    const label = kind === 'personal' ? 'Personal' : 'Public';
    const safeUrl = String(url || '');
    return `<div class="obv3-url-row" data-output-url-row="${kind}"><strong>${label}</strong><input readonly value="${escapeHtml(safeUrl)}" aria-label="${label} output URL"><button class="button ghost" type="button" data-copy-output="${kind}">Copy</button><a class="button ghost" href="${escapeHtml(safeUrl || '#')}" target="_blank" rel="noopener">Open</a></div>`;
  }

  function outputBarMarkup() {
    return `<section class="obv3-output-bar" data-obv3-output-bar>
      <div class="obv3-output-tabs" aria-label="Overlay output"><button type="button" class="button ghost ${platformState.output === 'public' ? 'active' : ''}" data-select-output="public">Public</button><button type="button" class="button ghost ${platformState.output === 'personal' ? 'active' : ''}" data-select-output="personal">Personal</button></div>
      <div class="obv3-url-grid">${urlRow('public', platformState.urls?.public)}${urlRow('personal', platformState.urls?.personal)}</div>
    </section>`;
  }

  function selectedWidget() {
    const widgets = state.overlay?.widgets || [];
    let widget = widgets.find((item) => item.id === platformState.selectedId) || null;
    if (!widget && widgets.length) {
      widget = [...widgets].sort((a, b) => (Number(b.zIndex) || 0) - (Number(a.zIndex) || 0))[0];
      platformState.selectedId = widget.id;
    }
    return widget;
  }

  function inspectorMarkup() {
    const widget = selectedWidget();
    if (!widget) return '<aside class="obv3-inspector" data-obv3-inspector><div class="obv3-empty-inspector">Select or add a source to edit its standardized controls.</div></aside>';
    const media = contract.isMediaKind(widget.kind);
    const opacity = Math.round((Number(widget.opacity) || 0) * 100);
    return `<aside class="obv3-inspector" data-obv3-inspector data-inspector-widget="${escapeHtml(widget.id)}">
      <div class="obv3-inspector-head"><div><strong>${escapeHtml(widget.title || widget.id)}</strong><small>${escapeHtml(widget.kind)} · layer ${Number(widget.zIndex) || 0}</small></div><button class="button ghost" type="button" data-inspector-edit>Edit</button></div>
      <div class="obv3-toggle-row"><label><input type="checkbox" data-inspector-visible ${widget.visible === false ? '' : 'checked'}> Visible</label><label><input type="checkbox" data-inspector-locked ${widget.locked ? 'checked' : ''}> Lock</label></div>
      <div class="obv3-inspector-grid">
        <label class="obv3-control range"><span>Opacity</span><span class="obv3-range-line"><input type="range" min="0" max="100" step="1" value="${opacity}" data-inspector-opacity><output data-inspector-opacity-output>${opacity}%</output></span></label>
        <label class="obv3-control"><span>X %</span><input type="number" min="0" max="100" step="0.1" value="${Number(widget.x).toFixed(1)}" data-inspector-x></label>
        <label class="obv3-control"><span>Y %</span><input type="number" min="0" max="100" step="0.1" value="${Number(widget.y).toFixed(1)}" data-inspector-y></label>
        <label class="obv3-control"><span>Width</span><input type="number" min="24" max="1920" step="1" value="${Math.round(widget.width)}" data-inspector-width></label>
        <label class="obv3-control"><span>Height</span><input type="number" min="24" max="1080" step="1" value="${Math.round(widget.height)}" data-inspector-height></label>
        <label class="obv3-control"><span>Media fit</span><select data-inspector-fit ${media ? '' : 'disabled'}>${contract.fits.map((fit) => `<option value="${fit}" ${widget.fit === fit ? 'selected' : ''}>${fit}</option>`).join('')}</select></label>
        <label class="obv3-control"><span>Layer</span><input type="number" step="1" value="${Number(widget.zIndex) || 0}" data-inspector-z></label>
      </div>
      <div class="obv3-preset-actions"><button class="button ghost" type="button" data-inspector-action="full">Full scene</button><button class="button ghost" type="button" data-inspector-action="fit">Fit scene</button><button class="button ghost" type="button" data-inspector-action="fill">Fill scene</button><button class="button ghost" type="button" data-inspector-action="stretch">Stretch</button><button class="button ghost" type="button" data-inspector-action="center">Center</button><button class="button ghost" type="button" data-inspector-action="front">Bring front</button><button class="button ghost" type="button" data-inspector-action="back">Send back</button><button class="button ghost" type="button" data-inspector-action="reset-opacity">100% opacity</button></div>
    </aside>`;
  }

  function updateInspectorValues(widget) {
    const inspector = document.querySelector(`[data-inspector-widget="${CSS.escape(widget.id)}"]`);
    if (!inspector) return;
    const set = (selector, value) => { const input = inspector.querySelector(selector); if (input && document.activeElement !== input) input.value = value; };
    set('[data-inspector-x]', Number(widget.x).toFixed(1));
    set('[data-inspector-y]', Number(widget.y).toFixed(1));
    set('[data-inspector-width]', Math.round(widget.width));
    set('[data-inspector-height]', Math.round(widget.height));
  }

  function updateSelectionStyles() {
    document.querySelectorAll('[data-overlay-widget]').forEach((element) => element.classList.toggle('obv3-selected', element.dataset.overlayWidget === platformState.selectedId));
    document.querySelectorAll('[data-layer-id]').forEach((row) => row.classList.toggle('obv3-layer-selected', row.dataset.layerId === platformState.selectedId));
  }

  function selectWidget(id, refreshInspector = true) {
    if (!(state.overlay?.widgets || []).some((widget) => widget.id === id)) return;
    platformState.selectedId = id;
    updateSelectionStyles();
    if (refreshInspector) {
      const inspector = document.querySelector('[data-obv3-inspector]');
      if (inspector) inspector.outerHTML = inspectorMarkup();
      wireInspector();
    }
  }

  function updateStageScale() {
    const viewport = document.querySelector('.obv3-stage-viewport');
    const shell = document.querySelector('.obv3-stage-shell');
    const canvas = viewport?.querySelector('#overlay-canvas');
    if (!viewport || !shell || !canvas) return;
    const available = Math.max(280, shell.clientWidth || contract.scene.width);
    const scale = Math.min(1, available / contract.scene.width);
    viewport.style.width = `${contract.scene.width * scale}px`;
    viewport.style.height = `${contract.scene.height * scale}px`;
    canvas.style.transform = `scale(${scale})`;
  }

  function applyMediaFits() {
    for (const widget of state.overlay?.widgets || []) {
      if (!contract.isMediaKind(widget.kind)) continue;
      const section = document.querySelector(`[data-overlay-widget="${CSS.escape(widget.id)}"]`);
      if (!section) continue;
      section.querySelectorAll('.obv2-media,.cloud-xbox-frame').forEach((media) => { media.style.objectFit = widget.fit || 'contain'; });
    }
  }

  function wireOutputBar() {
    document.querySelectorAll('[data-copy-output]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.copyOutput;
      const row = button.closest('[data-output-url-row]');
      copyText(platformState.urls?.[kind], row?.querySelector('input'));
    }));
    document.querySelectorAll('[data-select-output]').forEach((button) => button.addEventListener('click', async () => {
      const next = button.dataset.selectOutput === 'personal' ? 'personal' : 'public';
      if (next === platformState.output) return;
      if (state.overlayDirty) {
        setUiStatus(`Save ${outputLabel()} before switching outputs.`, 'error');
        return;
      }
      platformState.output = next;
      platformState.selectedId = null;
      const url = new URL(location.href);
      url.searchParams.set('output', next);
      history.replaceState(null, '', url);
      try {
        await loadTenantOverlay(next);
        renderPlatformOverlay();
        setUiStatus(`${outputLabel()} overlay loaded.`, 'ok');
      } catch (error) {
        setUiStatus(error.message || `${outputLabel()} overlay could not be loaded.`, 'error');
      }
    }));
  }

  function wireInspector() {
    const widget = selectedWidget();
    const inspector = document.querySelector('[data-obv3-inspector]');
    if (!widget || !inspector) return;
    inspector.querySelector('[data-inspector-edit]')?.addEventListener('click', () => platformState.baseEdit?.(widget.id));
    inspector.querySelector('[data-inspector-visible]')?.addEventListener('change', (event) => { widget.visible = event.target.checked; markDirty(); renderPlatformOverlay(); });
    inspector.querySelector('[data-inspector-locked]')?.addEventListener('change', (event) => { widget.locked = event.target.checked; markDirty(); renderPlatformOverlay(); });
    inspector.querySelector('[data-inspector-opacity]')?.addEventListener('input', (event) => {
      widget.opacity = Math.max(0, Math.min(1, Number(event.target.value) / 100));
      inspector.querySelector('[data-inspector-opacity-output]').textContent = `${Math.round(widget.opacity * 100)}%`;
      document.querySelector(`[data-overlay-widget="${CSS.escape(widget.id)}"]`)?.style.setProperty('opacity', String(widget.opacity));
      markDirty();
    });
    inspector.querySelector('[data-inspector-fit]')?.addEventListener('change', (event) => {
      if (!contract.isMediaKind(widget.kind)) return;
      widget.fit = contract.fits.includes(event.target.value) ? event.target.value : 'contain';
      markDirty();
      applyMediaFits();
    });

    const geometry = [
      ['[data-inspector-x]', 'x', 0, 100], ['[data-inspector-y]', 'y', 0, 100],
      ['[data-inspector-width]', 'width', 24, contract.scene.width * 2], ['[data-inspector-height]', 'height', 24, contract.scene.height * 2],
      ['[data-inspector-z]', 'zIndex', -100000, 100000],
    ];
    geometry.forEach(([selector, key, min, max]) => inspector.querySelector(selector)?.addEventListener('change', (event) => {
      widget[key] = Math.max(min, Math.min(max, Number(event.target.value) || 0));
      markDirty();
      renderPlatformOverlay();
    }));

    inspector.querySelectorAll('[data-inspector-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.inspectorAction;
      if (action === 'full' || action === 'fit' || action === 'fill' || action === 'stretch') {
        const fit = action === 'fit' ? 'contain' : action === 'fill' ? 'cover' : action === 'stretch' ? 'fill' : null;
        Object.assign(widget, contract.fullScene(widget, fit));
      } else if (action === 'center') {
        Object.assign(widget, contract.centered(widget));
      } else if (action === 'front') {
        widget.zIndex = (state.overlay.widgets || []).reduce((max, item) => Math.max(max, Number(item.zIndex) || 0), 0) + 1;
      } else if (action === 'back') {
        widget.zIndex = (state.overlay.widgets || []).reduce((min, item) => Math.min(min, Number(item.zIndex) || 0), 0) - 1;
      } else if (action === 'reset-opacity') {
        widget.opacity = 1;
      }
      markDirty();
      renderPlatformOverlay();
    }));
  }

  function enhanceOverlayBay() {
    if (platformState.enhancing || currentSurface !== 'overlays') return;
    const manager = document.querySelector('.obv2-manager');
    const canvas = manager?.querySelector('#overlay-canvas');
    if (!manager || !canvas) return;
    platformState.enhancing = true;
    try {
      manager.classList.add('obv3-editor');
      if (!manager.querySelector('[data-obv3-output-bar]')) {
        const bar = document.createElement('div');
        bar.innerHTML = outputBarMarkup();
        const outputBar = bar.firstElementChild;
        manager.querySelector('.obv2-heading')?.after(outputBar);
      }

      if (!canvas.closest('.obv3-stage-viewport')) {
        const grid = document.createElement('div');
        grid.className = 'obv3-editor-grid';
        const shell = document.createElement('div');
        shell.className = 'obv3-stage-shell';
        const viewport = document.createElement('div');
        viewport.className = 'obv3-stage-viewport';
        canvas.before(grid);
        viewport.append(canvas);
        shell.append(viewport);
        grid.append(shell);
        const inspectorHost = document.createElement('div');
        inspectorHost.innerHTML = inspectorMarkup();
        grid.append(inspectorHost.firstElementChild);
      }

      platformState.stageObserver?.disconnect?.();
      const shell = manager.querySelector('.obv3-stage-shell');
      if (shell && typeof ResizeObserver === 'function') {
        platformState.stageObserver = new ResizeObserver(updateStageScale);
        platformState.stageObserver.observe(shell);
      }
      updateStageScale();
      updateSelectionStyles();
      wireOutputBar();
      wireInspector();
      document.querySelectorAll('[data-layer-id]').forEach((row) => row.addEventListener('click', (event) => {
        if (event.target.closest('button,input,select,a')) return;
        selectWidget(row.dataset.layerId);
      }));
      document.querySelectorAll('[data-overlay-widget] header').forEach((header) => header.addEventListener('click', () => selectWidget(header.parentElement.dataset.overlayWidget)));
      applyMediaFits();
      setTimeout(applyMediaFits, 700);
    } finally {
      platformState.enhancing = false;
    }
  }

  function renderPlatformOverlay() {
    if (state.overlay) state.overlay = contract.normalizeLayout(state.overlay);
    platformState.baseRender?.();
    enhanceOverlayBay();
  }

  function worktrayUrlCard() {
    return `<section class="obv3-worktray-urls" data-obv3-worktray-urls><div><strong>Canonical tenant outputs</strong><small>Public is the browser-source program. Personal is the private app/HUD overlay.</small></div><div class="obv3-url-grid">${urlRow('public', platformState.urls?.public)}${urlRow('personal', platformState.urls?.personal)}</div><div class="control-actions"><a class="button ghost" href="/embed/overlays?mode=full&app=${encodeURIComponent(currentHost)}&output=public">Edit Public</a><a class="button ghost" href="/embed/overlays?mode=full&app=${encodeURIComponent(currentHost)}&output=personal">Edit Personal</a></div></section>`;
  }

  function enhanceWorktray() {
    if (currentSurface !== 'worktray' || !platformState.urls) return;
    const panel = document.querySelector('[data-control-panel="overlay"]');
    if (!panel || panel.querySelector('[data-obv3-worktray-urls]')) return;
    const host = document.createElement('div');
    host.innerHTML = worktrayUrlCard();
    panel.prepend(host.firstElementChild);
    const masterCopy = panel.querySelector('.control-overlay-master strong');
    if (masterCopy) masterCopy.textContent = 'Public overlay workspace';
    panel.querySelectorAll('[data-copy-output]').forEach((button) => button.addEventListener('click', () => {
      const kind = button.dataset.copyOutput;
      const row = button.closest('[data-output-url-row]');
      copyText(platformState.urls?.[kind], row?.querySelector('input'));
    }));
  }

  async function loadWorktrayTenantInfo() {
    if (currentSurface !== 'worktray') return;
    try {
      const response = await request('/api/tenant-scene?output=public');
      if (!response.ok) return;
      rememberTenant(await response.json());
      enhanceWorktray();
    } catch {}
  }

  // Override only the shared editor bindings. The old API remains a Public compatibility alias.
  if (currentSurface === 'overlays') {
    window.loadOverlayWorkspace = loadTenantOverlay;
    window.saveOverlayWorkspace = saveTenantOverlay;
    window.wireOverlayPointer = wireScenePointer;
    window.renderOverlays = renderPlatformOverlay;
    try { loadOverlayWorkspace = loadTenantOverlay; } catch {}
    try { saveOverlayWorkspace = saveTenantOverlay; } catch {}
    try { wireOverlayPointer = wireScenePointer; } catch {}
    try { renderOverlays = renderPlatformOverlay; } catch {}
  }

  if (currentSurface === 'worktray') {
    loadWorktrayTenantInfo();
    const observer = new MutationObserver(enhanceWorktray);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
