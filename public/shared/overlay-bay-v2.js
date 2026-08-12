(() => {
  if (window.__spmtOverlayBayV2Installed) return;
  window.__spmtOverlayBayV2Installed = true;

  const localMedia = new Map();
  const alertTimers = new Map();
  const isOverlayRuntime = typeof mode !== 'undefined' && mode === 'overlay';
  const bridgeRuntime = typeof params !== 'undefined' && params.get('bridge') === '1';

  const ALERT_TEMPLATES = {
    follow: { headline: '{user} joined the climb!', body: 'Welcome to SpaceMountain.' },
    sub: { headline: '{user} subscribed!', body: 'Thanks for fueling the mission.' },
    resub: { headline: '{user} resubscribed!', body: '{months} months on the mountain.' },
    gift: { headline: '{user} gifted {count} subs!', body: 'The crew just got bigger.' },
    raid: { headline: '{user} raided with {count}!', body: 'Raid party incoming.' },
    cheer: { headline: '{user} cheered {amount}!', body: 'Energy received.' },
    custom: { headline: '{headline}', body: '{message}' },
  };

  function esc(value) {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function nextZ() {
    const widgets = state.overlay?.widgets || [];
    return widgets.reduce((max, item) => Math.max(max, Number(item.zIndex) || 0), 0) + 1;
  }

  function commonWidget(kind, title, extra = {}) {
    return {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      kind,
      visible: true,
      locked: false,
      interactive: true,
      x: kind === 'xbox' ? 0 : 8,
      y: kind === 'xbox' ? 0 : 8,
      width: kind === 'xbox' ? 960 : 360,
      height: kind === 'xbox' ? 540 : 220,
      opacity: 1,
      zIndex: kind === 'xbox' ? 0 : nextZ(),
      ...extra,
    };
  }

  function defaultAlertWidget() {
    return commonWidget('alert', 'SpaceMountain Alerts', {
      width: 520,
      height: 220,
      x: 36,
      y: 8,
      durationMs: 6500,
      imageUrl: 'https://spacemountain.live/assets/model-rocket.png',
      accent: '#f97316',
      accepts: ['follow', 'sub', 'resub', 'gift', 'raid', 'cheer', 'custom'],
      templates: structuredClone(ALERT_TEMPLATES),
    });
  }

  function addWidget(kind) {
    state.overlay.widgets ??= [];
    let widget = null;
    if (kind === 'embed') {
      const url = prompt('Web / overlay HTTPS URL', 'https://');
      if (url === null) return;
      widget = commonWidget('embed', 'Web Source', { url: url.trim() || 'about:blank' });
    } else if (kind === 'image') {
      const url = prompt('Image URL', 'https://');
      if (url === null) return;
      widget = commonWidget('image', 'Image', { url: url.trim(), width: 320, height: 180, fit: 'contain' });
    } else if (kind === 'camera') {
      widget = commonWidget('camera', 'Camera', { width: 360, height: 220, muted: true, fit: 'cover' });
    } else if (kind === 'screen') {
      widget = commonWidget('screen', 'Screen / Window', { width: 640, height: 360, muted: true, fit: 'contain' });
    } else if (kind === 'text') {
      widget = commonWidget('text', 'Text', { text: 'SpaceMountain LIVE', width: 420, height: 120, fontSize: 42, align: 'center' });
    } else if (kind === 'alert') {
      widget = defaultAlertWidget();
    } else if (kind === 'xbox') {
      if (state.overlay.widgets.some((item) => item.kind === 'xbox')) {
        setStatus?.('An Xbox source is already in this scene.', 'error');
        return;
      }
      widget = commonWidget('xbox', 'Xbox Cloud Gaming', { width: 960, height: 540, fit: 'contain', zIndex: 0 });
      state.overlay.widgets.forEach((item) => { if ((Number(item.zIndex) || 0) <= 0) item.zIndex = nextZ(); });
    }
    if (!widget) return;
    state.overlay.widgets.push(widget);
    state.overlayDirty = true;
    renderOverlays();
    setStatus?.(`${widget.title} added. Save Overlay Bay when ready.`);
  }

  function addSpaceMountainDefaults() {
    state.overlay.widgets ??= [];
    let added = 0;
    if (!state.overlay.widgets.some((item) => item.kind === 'alert')) {
      state.overlay.widgets.push(defaultAlertWidget());
      added += 1;
    }
    if (!state.overlay.widgets.some((item) => item.kind === 'text' && item.role === 'live-badge')) {
      state.overlay.widgets.push(commonWidget('text', 'LIVE Badge', {
        role: 'live-badge', text: '● LIVE', width: 170, height: 72, x: 2, y: 2, fontSize: 34, align: 'center', zIndex: nextZ(),
      }));
      added += 1;
    }
    state.overlayDirty = true;
    renderOverlays();
    setStatus?.(added ? `Added ${added} SpaceMountain default source${added === 1 ? '' : 's'}.` : 'SpaceMountain defaults are already in this scene.', added ? 'ok' : '');
  }

  function applyTokens(template, payload) {
    return String(template || '').replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
      const value = payload[key];
      return value === undefined || value === null || value === '' ? '' : String(value);
    });
  }

  function normalizeAlert(payload = {}) {
    const eventType = String(payload.eventType || payload.kind || payload.alertType || 'custom').toLowerCase();
    return {
      eventType,
      user: payload.user || payload.username || payload.displayName || 'Someone',
      count: payload.count ?? payload.viewers ?? payload.gifts ?? 1,
      amount: payload.amount ?? payload.bits ?? '',
      months: payload.months ?? '',
      headline: payload.headline || 'SpaceMountain Alert',
      message: payload.message || '',
      imageUrl: payload.imageUrl || '',
    };
  }

  function fireGenericAlert(rawPayload = {}) {
    const payload = normalizeAlert(rawPayload);
    document.querySelectorAll('[data-generic-alert]').forEach((stage) => {
      const id = stage.dataset.genericAlert;
      const widget = state.overlay?.widgets?.find((item) => item.id === id);
      if (!widget || widget.visible === false) return;
      const accepts = widget.accepts || Object.keys(ALERT_TEMPLATES);
      if (!accepts.includes(payload.eventType) && !accepts.includes('custom')) return;
      const template = (widget.templates || ALERT_TEMPLATES)[payload.eventType] || (widget.templates || ALERT_TEMPLATES).custom || ALERT_TEMPLATES.custom;
      const headline = applyTokens(template.headline, payload) || payload.headline;
      const body = applyTokens(template.body, payload) || payload.message;
      const image = payload.imageUrl || widget.imageUrl || '';
      stage.style.setProperty('--alert-accent', widget.accent || '#f97316');
      const imageEl = stage.querySelector('[data-alert-image]');
      if (imageEl) {
        imageEl.src = image;
        imageEl.hidden = !image;
      }
      const headlineEl = stage.querySelector('[data-alert-headline]');
      const bodyEl = stage.querySelector('[data-alert-body]');
      if (headlineEl) headlineEl.textContent = headline;
      if (bodyEl) bodyEl.textContent = body;
      stage.classList.remove('is-showing');
      void stage.offsetWidth;
      stage.classList.add('is-showing');
      clearTimeout(alertTimers.get(id));
      alertTimers.set(id, setTimeout(() => stage.classList.remove('is-showing'), Math.max(1500, Number(widget.durationMs) || 6500)));
    });
  }

  window.spmtOverlayAlert = fireGenericAlert;
  window.addEventListener('spmt:overlay-alert', (event) => fireGenericAlert(event.detail || {}));
  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'spmt.overlay.alert' || data.type === 'spacemountain.alert') fireGenericAlert(data);
  });

  function testAlert(eventType = 'follow') {
    const samples = {
      follow: { eventType: 'follow', user: 'MountainTester' },
      sub: { eventType: 'sub', user: 'MountainTester' },
      raid: { eventType: 'raid', user: 'RaidCrew', count: 42 },
      cheer: { eventType: 'cheer', user: 'BitsPilot', amount: 500 },
      gift: { eventType: 'gift', user: 'GiftCaptain', count: 5 },
      custom: { eventType: 'custom', headline: 'SpaceMountain Test', message: 'Generic alerts are replaceable and working.' },
    };
    fireGenericAlert(samples[eventType] || samples.follow);
  }

  function renderSourceBody(widget) {
    const kind = widget.kind || 'embed';
    if (kind === 'xbox') {
      if (isOverlayRuntime && bridgeRuntime) return '<div class="obv2-xbox-runtime-spacer" aria-hidden="true"></div>';
      return `<div class="obv2-placeholder xbox-placeholder"><div class="obv2-source-icon">XBOX</div><strong>Xbox Cloud Gaming source</strong><span>Live video is supplied by the Xbox Bridge inside the Xbox tab.</span><small>Keep this source as the base layer. The bridge hides this placeholder and supplies the cloned WebRTC video underneath your saved overlays.</small></div>`;
    }
    if (kind === 'image') {
      return widget.url ? `<img class="obv2-media" src="${esc(widget.url)}" alt="${esc(widget.title || 'Overlay image')}" style="object-fit:${esc(widget.fit || 'contain')}">` : '<div class="obv2-placeholder">Double-click and add an image URL.</div>';
    }
    if (kind === 'camera' || kind === 'screen') {
      const label = kind === 'camera' ? 'Connect camera' : 'Share screen / window';
      return `<div class="obv2-local-source"><video class="obv2-media" data-local-video="${esc(widget.id)}" autoplay playsinline ${widget.muted === false ? '' : 'muted'} style="object-fit:${esc(widget.fit || (kind === 'camera' ? 'cover' : 'contain'))}"></video><div class="obv2-local-cover" data-local-cover="${esc(widget.id)}"><strong>${kind === 'camera' ? 'Camera' : 'Screen / Window'}</strong><span>Local permission is required each browser session.</span>${isOverlayRuntime ? '' : `<button type="button" class="button primary" data-connect-local="${esc(widget.id)}">${label}</button>`}</div></div>`;
    }
    if (kind === 'text') {
      return `<div class="obv2-text-source" style="font-size:${Math.max(12, Number(widget.fontSize) || 42)}px;text-align:${esc(widget.align || 'center')}">${esc(widget.text || 'Text')}</div>`;
    }
    if (kind === 'alert') {
      return `<div class="obv2-alert-stage" data-generic-alert="${esc(widget.id)}"><div class="obv2-alert-card"><img data-alert-image alt="" hidden><div><span class="obv2-alert-kicker">SPACEMOUNTAIN ALERT</span><strong data-alert-headline>Generic alert ready</strong><p data-alert-body>Follow, sub, raid, cheer, gift, or custom event.</p></div></div></div>`;
    }
    return `<iframe src="${esc(widget.url || 'about:blank')}" title="${esc(widget.title || 'Overlay web source')}" allow="autoplay; microphone; camera; fullscreen; clipboard-write; display-capture"></iframe>`;
  }

  function v2OverlayWidgetMarkup(widget, index) {
    const z = Number.isFinite(widget.zIndex) ? widget.zIndex : index + 1;
    const runtimeXbox = widget.kind === 'xbox' && isOverlayRuntime && bridgeRuntime;
    const chrome = isOverlayRuntime ? '' : `<header data-drag-handle><strong>${esc(widget.title || 'Source')}</strong><span>${esc(widget.kind || 'embed')}</span></header>`;
    const resize = isOverlayRuntime ? '' : `<button class="resize-handle" type="button" data-resize-handle aria-label="Resize ${esc(widget.title || 'widget')}"></button>`;
    return `<section class="overlay-widget obv2-widget kind-${esc(widget.kind || 'embed')} ${widget.visible === false ? 'widget-hidden' : ''} ${runtimeXbox ? 'obv2-runtime-xbox' : ''}" data-overlay-widget="${esc(widget.id)}" style="left:${widget.x ?? 5}%;top:${widget.y ?? 5}%;width:${Math.max(120, widget.width ?? 360)}px;height:${Math.max(60, widget.height ?? 220)}px;opacity:${widget.opacity ?? 1};z-index:${z}">${chrome}<div class="obv2-source-body">${renderSourceBody(widget)}</div>${resize}</section>`;
  }

  async function connectLocalSource(id) {
    const widget = state.overlay?.widgets?.find((item) => item.id === id);
    if (!widget) return;
    const video = document.querySelector(`[data-local-video="${CSS.escape(id)}"]`);
    const cover = document.querySelector(`[data-local-cover="${CSS.escape(id)}"]`);
    if (!video) return;
    try {
      const previous = localMedia.get(id);
      previous?.getTracks?.().forEach((track) => track.stop());
      const stream = widget.kind === 'camera'
        ? await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 } }, audio: true });
      localMedia.set(id, stream);
      video.srcObject = stream;
      video.muted = widget.muted !== false;
      await video.play().catch(() => {});
      if (cover) cover.classList.add('connected');
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        localMedia.delete(id);
        if (video) video.srcObject = null;
        if (cover) cover.classList.remove('connected');
      }, { once: true });
      setStatus?.(`${widget.title} connected locally.`, 'ok');
    } catch (error) {
      setStatus?.(`${widget.title} could not connect: ${error?.message || 'permission denied'}`, 'error');
    }
  }

  function editAlert(widget) {
    const templates = widget.templates || structuredClone(ALERT_TEMPLATES);
    const imageUrl = prompt('Default alert image URL (blank = none)', widget.imageUrl || '');
    if (imageUrl === null) return;
    const followHeadline = prompt('Follow headline template. Tokens: {user}', templates.follow?.headline || ALERT_TEMPLATES.follow.headline);
    if (followHeadline === null) return;
    const customBody = prompt('Custom alert body template. Tokens: {message}', templates.custom?.body || ALERT_TEMPLATES.custom.body);
    if (customBody === null) return;
    const duration = prompt('Alert duration in milliseconds', String(widget.durationMs || 6500));
    if (duration === null) return;
    widget.imageUrl = imageUrl.trim();
    widget.templates = { ...structuredClone(ALERT_TEMPLATES), ...templates, follow: { ...(templates.follow || {}), headline: followHeadline }, custom: { ...(templates.custom || {}), body: customBody } };
    widget.durationMs = Math.max(1500, Number(duration) || 6500);
  }

  function v2EditOverlayWidget(id) {
    const widget = state.overlay.widgets.find((item) => item.id === id);
    if (!widget) return;
    const title = prompt('Source title', widget.title || 'Source');
    if (title === null) return;
    widget.title = title.trim() || widget.title;
    if (widget.kind === 'embed' || widget.kind === 'image') {
      const url = prompt(widget.kind === 'image' ? 'Image URL' : 'Web / overlay HTTPS URL', widget.url || '');
      if (url === null) return;
      widget.url = url.trim();
    } else if (widget.kind === 'text') {
      const text = prompt('Text', widget.text || '');
      if (text === null) return;
      widget.text = text;
    } else if (widget.kind === 'alert') {
      editAlert(widget);
    }
    state.overlayDirty = true;
    renderOverlays();
  }

  function sourceToolbar() {
    const items = [
      ['xbox', 'Xbox'], ['camera', 'Camera'], ['screen', 'Screen'], ['image', 'Image'],
      ['embed', 'Web'], ['text', 'Text'], ['alert', 'Alert'],
    ];
    return `<div class="obv2-source-toolbar">${items.map(([kind, label]) => `<button type="button" class="button ghost" data-add-source="${kind}">+ ${label}</button>`).join('')}<button type="button" class="button ghost obv2-defaults" id="add-space-defaults">SpaceMountain defaults</button></div>`;
  }

  function alertTester() {
    if (isOverlayRuntime) return '';
    return `<div class="obv2-alert-tester"><strong>Alert tester</strong><span>These use the generic event contract that StreamWeaver or any app can replace later.</span><div>${['follow','sub','raid','cheer','gift','custom'].map((type) => `<button type="button" class="button ghost" data-test-alert="${type}">${type}</button>`).join('')}</div></div>`;
  }

  function bridgeHelp() {
    if (isOverlayRuntime) return '';
    return `<div class="obv2-bridge-help"><div><strong>Xbox Bridge</strong><span>Add an Xbox source, save the scene, then run the local Xbox Bridge test while Xbox Cloud Gaming is open. The bridge supplies the cloned WebRTC video and mounts this saved Overlay Bay above it without switching windows.</span></div><code>Xbox WebRTC → cloned track → Overlay Bay → broadcaster</code></div>`;
  }

  function v2RenderOverlays() {
    const layout = state.overlay || { enabled: true, widgets: [], workflows: [] };
    const editorChrome = isOverlayRuntime ? '' : `<div class="tray-heading obv2-heading"><div><span class="eyebrow">Canonical overlay workspace</span><h2>Overlay Bay</h2><p>One saved scene for Xbox, camera, screen, images, web sources, text, and replaceable alerts.</p></div><div class="action-row"><button class="button primary" id="save-overlay">Save overlay</button></div></div>${sourceToolbar()}${bridgeHelp()}${alertTester()}`;
    const layers = isOverlayRuntime ? '' : `<div class="overlay-layers obv2-layers"><div class="row between"><strong>Layers</strong><label class="inline-check"><input id="overlay-enabled" type="checkbox" ${layout.enabled !== false ? 'checked' : ''}> Workspace enabled</label></div><p class="obv2-layer-help">Drag/resize on canvas. Double-click a source to edit it.</p><div id="overlay-layer-list">${(layout.widgets || []).slice().sort((a,b)=>(Number(b.zIndex)||0)-(Number(a.zIndex)||0)).map((widget) => `<article data-layer-id="${esc(widget.id)}"><span>${Number(widget.zIndex) || 0}</span><strong>${esc(widget.title || widget.id)}</strong><small>${esc(widget.kind || 'embed')}</small><button data-toggle-widget="${esc(widget.id)}">${widget.visible === false ? 'Show' : 'Hide'}</button><button data-remove-widget="${esc(widget.id)}">Remove</button></article>`).join('')}</div></div>`;
    document.getElementById('surface-content').innerHTML = `<div class="overlay-manager card full obv2-manager ${isOverlayRuntime ? 'obv2-runtime' : ''}">${editorChrome}<div class="overlay-canvas ${layout.enabled === false ? 'disabled' : ''}" id="overlay-canvas">${(layout.widgets || []).map((widget, index) => v2OverlayWidgetMarkup(widget, index)).join('') || (isOverlayRuntime ? '' : '<div class="empty overlay-empty">No sources yet. Add Xbox, camera, screen, image, web, text, or alerts above.</div>')}</div>${layers}</div>`;
    v2WireOverlayManager();
    if (isOverlayRuntime) document.body.classList.add('obv2-runtime-body');
  }

  function v2WireOverlayManager() {
    document.querySelectorAll('[data-add-source]').forEach((button) => button.addEventListener('click', () => addWidget(button.dataset.addSource)));
    document.getElementById('add-space-defaults')?.addEventListener('click', addSpaceMountainDefaults);
    document.getElementById('save-overlay')?.addEventListener('click', saveOverlayWorkspace);
    document.getElementById('overlay-enabled')?.addEventListener('change', (event) => {
      state.overlay.enabled = event.target.checked;
      state.overlayDirty = true;
      document.getElementById('overlay-canvas')?.classList.toggle('disabled', !event.target.checked);
    });
    document.querySelectorAll('[data-toggle-widget]').forEach((button) => button.addEventListener('click', () => {
      const widget = state.overlay.widgets.find((item) => item.id === button.dataset.toggleWidget);
      if (widget) widget.visible = widget.visible === false;
      state.overlayDirty = true;
      renderOverlays();
    }));
    document.querySelectorAll('[data-remove-widget]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.removeWidget;
      localMedia.get(id)?.getTracks?.().forEach((track) => track.stop());
      localMedia.delete(id);
      state.overlay.widgets = state.overlay.widgets.filter((item) => item.id !== id);
      state.overlayDirty = true;
      renderOverlays();
    }));
    document.querySelectorAll('[data-connect-local]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation(); connectLocalSource(button.dataset.connectLocal);
    }));
    document.querySelectorAll('[data-test-alert]').forEach((button) => button.addEventListener('click', () => testAlert(button.dataset.testAlert)));

    if (!isOverlayRuntime) {
      document.querySelectorAll('[data-overlay-widget]').forEach((element) => wireOverlayPointer(element));
      document.querySelectorAll('[data-overlay-widget] header').forEach((header) => header.addEventListener('dblclick', () => v2EditOverlayWidget(header.parentElement.dataset.overlayWidget)));
      document.querySelectorAll('[data-layer-id]').forEach((row) => row.addEventListener('dblclick', () => v2EditOverlayWidget(row.dataset.layerId)));
    }
  }

  function exposeOverlayBayInWorktray() {
    if (typeof surfaceId === 'undefined' || surfaceId !== 'worktray') return;
    const install = () => {
      const heading = document.querySelector('.worktray-shell .tray-heading');
      if (!heading || heading.querySelector('[data-open-overlay-bay]')) return false;
      const link = document.createElement('a');
      link.className = 'button primary';
      link.dataset.openOverlayBay = '1';
      link.href = `/embed/overlays?mode=full&app=${encodeURIComponent(typeof hostApp === 'undefined' ? 'spmt' : hostApp)}`;
      link.textContent = 'Open Overlay Bay';
      heading.append(link);
      return true;
    };
    if (install()) return;
    const observer = new MutationObserver(() => { if (install()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.renderOverlays = v2RenderOverlays;
  window.overlayWidgetMarkup = v2OverlayWidgetMarkup;
  window.wireOverlayManager = v2WireOverlayManager;
  window.editOverlayWidget = v2EditOverlayWidget;
  try { renderOverlays = v2RenderOverlays; } catch {}
  try { overlayWidgetMarkup = v2OverlayWidgetMarkup; } catch {}
  try { wireOverlayManager = v2WireOverlayManager; } catch {}
  try { editOverlayWidget = v2EditOverlayWidget; } catch {}

  exposeOverlayBayInWorktray();
})();
