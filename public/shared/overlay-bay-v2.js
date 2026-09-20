(() => {
  if (window.__spmtOverlayBayV2Installed) return;
  window.__spmtOverlayBayV2Installed = true;

  const localMedia = new Map();
  const alertTimers = new Map();
  const isOverlayRuntime = typeof mode !== 'undefined' && mode === 'overlay';
  const bridgeRuntime = typeof params !== 'undefined' && params.get('bridge') === '1';
  const allowedBridgeOrigins = new Set(['https://www.xbox.com', 'https://play.xbox.com']);

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
    return typeof escapeHtml === 'function'
      ? escapeHtml(value)
      : String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  function clone(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
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

  function defaultAlertWidget(id = null) {
    return {
      ...commonWidget('alert', 'SpaceMountain Alerts', {
        width: 520,
        height: 220,
        x: 36,
        y: 8,
        durationMs: 6500,
        imageUrl: 'https://spacemountain.live/assets/model-rocket.png',
        accent: '#f97316',
        accepts: ['follow', 'sub', 'resub', 'gift', 'raid', 'cheer', 'custom'],
        templates: clone(ALERT_TEMPLATES),
        role: 'default-alerts',
        replaceable: true,
      }),
      ...(id ? { id } : {}),
    };
  }

  function spaceMountainDefaultLayout() {
    return {
      schemaVersion: 2,
      enabled: true,
      defaultsVersion: 1,
      widgets: [
        defaultAlertWidget('sm-alerts-default'),
        {
          ...commonWidget('text', 'LIVE Badge', {
            role: 'live-badge',
            text: '● LIVE',
            width: 170,
            height: 72,
            x: 2,
            y: 2,
            fontSize: 34,
            align: 'center',
          }),
          id: 'sm-live-badge',
        },
      ],
      workflows: [],
    };
  }

  function normalizeLayout(layout) {
    const next = layout && typeof layout === 'object' && !Array.isArray(layout)
      ? clone(layout)
      : spaceMountainDefaultLayout();
    next.schemaVersion = Math.max(2, Number(next.schemaVersion) || 0);
    next.enabled = next.enabled !== false;
    next.widgets = Array.isArray(next.widgets) ? next.widgets : [];
    next.workflows = Array.isArray(next.workflows) ? next.workflows : [];
    return next;
  }

  async function loadOverlayWorkspaceV2() {
    const response = await api('/api/overlay-workspace');
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Overlay workspace could not be loaded.');
    const data = await response.json();
    state.overlay = data.layout ? normalizeLayout(data.layout) : spaceMountainDefaultLayout();
    state.overlayDirty = !data.layout;
    return state.overlay;
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
    } else if (kind === 'video') {
      const url = prompt('Looping video URL', '/assets/overlay-bay/starfield-pingpong.mp4');
      if (url === null) return;
      widget = commonWidget('video', 'Looping Video', { url: url.trim(), width: 960, height: 540, fit: 'cover', muted: true, loop: true });
    } else if (kind === 'frame') {
      widget = commonWidget('frame', 'Neon Panel Frame', { width: 960, height: 540, x: 0, y: 0, locked: true, interactive: false, preset: 'broadcast-v1' });
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
      state.overlay.widgets.forEach((item) => {
        if ((Number(item.zIndex) || 0) <= 0) item.zIndex = Math.max(1, nextZ());
      });
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
    if (!state.overlay.widgets.some((item) => item.kind === 'alert' && item.role === 'default-alerts')) {
      state.overlay.widgets.push(defaultAlertWidget());
      added += 1;
    }
    if (!state.overlay.widgets.some((item) => item.kind === 'text' && item.role === 'live-badge')) {
      state.overlay.widgets.push(commonWidget('text', 'LIVE Badge', {
        role: 'live-badge', text: '● LIVE', width: 170, height: 72, x: 2, y: 2, fontSize: 34, align: 'center', zIndex: nextZ(),
      }));
      added += 1;
    }
    state.overlay.defaultsVersion = 1;
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
      const templates = widget.templates || ALERT_TEMPLATES;
      const template = templates[payload.eventType] || templates.custom || ALERT_TEMPLATES.custom;
      const headline = applyTokens(template.headline, payload) || payload.headline;
      const body = applyTokens(template.body, payload) || payload.message;
      const image = payload.imageUrl || widget.imageUrl || '';
      stage.style.setProperty('--alert-accent', widget.accent || '#f97316');
      const imageEl = stage.querySelector('[data-alert-image]');
      if (imageEl) {
        imageEl.src = image;
        imageEl.hidden = !image;
      }
      stage.querySelector('[data-alert-headline]')?.replaceChildren(document.createTextNode(headline));
      stage.querySelector('[data-alert-body]')?.replaceChildren(document.createTextNode(body));
      stage.classList.remove('is-showing');
      void stage.offsetWidth;
      stage.classList.add('is-showing');
      clearTimeout(alertTimers.get(id));
      alertTimers.set(id, setTimeout(() => stage.classList.remove('is-showing'), Math.max(1500, Number(widget.durationMs) || 6500)));
    });
  }

  window.spmtOverlayAlert = fireGenericAlert;
  window.addEventListener('spmt:overlay-alert', (event) => fireGenericAlert(event.detail || {}));

  function bridgeMessageAllowed(event) {
    return bridgeRuntime && allowedBridgeOrigins.has(event.origin);
  }

  window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (bridgeMessageAllowed(event) && data.type === 'spmt.overlay.layout') {
      state.overlay = normalizeLayout(data.layout || spaceMountainDefaultLayout());
      state.overlayDirty = false;
      renderOverlays();
      window.parent.postMessage({ type: 'spmt.overlay.layout.ready' }, event.origin);
      return;
    }
    if (data.type === 'spmt.overlay.alert' || data.type === 'spacemountain.alert') {
      if (!bridgeRuntime || bridgeMessageAllowed(event) || event.source === window) fireGenericAlert(data);
    }
  });

  function testAlert(eventType = 'follow') {
    const samples = {
      follow: { eventType: 'follow', user: 'MountainTester' },
      sub: { eventType: 'sub', user: 'MountainTester' },
      resub: { eventType: 'resub', user: 'MountainTester', months: 12 },
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
      return widget.url
        ? `<img class="obv2-media" src="${esc(widget.url)}" alt="${esc(widget.title || 'Overlay image')}" style="object-fit:${esc(widget.fit || 'contain')}">`
        : '<div class="obv2-placeholder">Double-click and add an image URL.</div>';
    }
    if (kind === 'video') {
      return widget.url
        ? `<video class="obv2-media" src="${esc(widget.url)}" autoplay muted loop playsinline style="object-fit:${esc(widget.fit || 'cover')}"></video>`
        : '<div class="obv2-placeholder">Double-click and add a looping video URL.</div>';
    }
    if (kind === 'frame') {
      const slots = [
        ['main', 2.5, 4.5, 69.5, 67], ['alerts', 75.5, 4.5, 22, 7.5],
        ['media', 75.5, 16, 22, 24], ['activity', 75.5, 44, 22, 49],
        ['stats', 2.5, 76, 21, 17], ['shoutouts', 26.75, 76, 21, 17], ['games', 51, 76, 21, 17],
      ];
      return `<div class="obv2-broadcast-frame">${slots.map(([id, x, y, width, height]) => `<i data-slot="${id}" style="left:${x}%;top:${y}%;width:${width}%;height:${height}%"></i>`).join('')}</div>`;
    }
    if (kind === 'camera' || kind === 'screen') {
      const label = kind === 'camera' ? 'Connect camera' : 'Share screen / window';
      return `<div class="obv2-local-source"><video class="obv2-media" data-local-video="${esc(widget.id)}" autoplay playsinline ${widget.muted === false ? '' : 'muted'} style="object-fit:${esc(widget.fit || (kind === 'camera' ? 'cover' : 'contain'))}"></video><div class="obv2-local-cover" data-local-cover="${esc(widget.id)}"><strong>${kind === 'camera' ? 'Camera' : 'Screen / Window'}</strong><span>Local permission is required each browser session.</span>${isOverlayRuntime ? '' : `<button type="button" class="button primary" data-connect-local="${esc(widget.id)}">${label}</button>`}</div></div>`;
    }
    if (kind === 'text') {
      return `<div class="obv2-text-source" style="font-size:${Math.max(12, Number(widget.fontSize) || 42)}px;text-align:${esc(widget.align || 'center')}">${esc(widget.text || 'Text')}</div>`;
    }
    if (kind === 'alert') {
      return `<div class="obv2-alert-stage" data-generic-alert="${esc(widget.id)}"><div class="obv2-alert-card"><img data-alert-image alt="" hidden><div><span class="obv2-alert-kicker">SPACEMOUNTAIN ALERT</span><strong data-alert-headline>Generic alert ready</strong><p data-alert-body>Follow, sub, resub, gift, raid, cheer, or custom event.</p></div></div></div>`;
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

  function restoreLocalMedia() {
    for (const [id, stream] of localMedia.entries()) {
      const video = document.querySelector(`[data-local-video="${CSS.escape(id)}"]`);
      const cover = document.querySelector(`[data-local-cover="${CSS.escape(id)}"]`);
      if (!video || !stream?.active) continue;
      video.srcObject = stream;
      video.play().catch(() => {});
      cover?.classList.add('connected');
    }
  }

  async function connectLocalSource(id) {
    const widget = state.overlay?.widgets?.find((item) => item.id === id);
    if (!widget) return;
    const video = document.querySelector(`[data-local-video="${CSS.escape(id)}"]`);
    const cover = document.querySelector(`[data-local-cover="${CSS.escape(id)}"]`);
    if (!video) return;
    try {
      localMedia.get(id)?.getTracks?.().forEach((track) => track.stop());
      const stream = widget.kind === 'camera'
        ? await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 } }, audio: true });
      localMedia.set(id, stream);
      video.srcObject = stream;
      video.muted = widget.muted !== false;
      await video.play().catch(() => {});
      cover?.classList.add('connected');
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        localMedia.delete(id);
        if (video) video.srcObject = null;
        cover?.classList.remove('connected');
      }, { once: true });
      setStatus?.(`${widget.title} connected locally.`, 'ok');
    } catch (error) {
      setStatus?.(`${widget.title} could not connect: ${error?.message || 'permission denied'}`, 'error');
    }
  }

  function editAlert(widget) {
    const imageUrl = prompt('Default alert image URL (blank = none)', widget.imageUrl || '');
    if (imageUrl === null) return;
    const accent = prompt('Alert accent color', widget.accent || '#f97316');
    if (accent === null) return;
    const duration = prompt('Alert duration in milliseconds', String(widget.durationMs || 6500));
    if (duration === null) return;
    const followHeadline = prompt('Follow headline template. Token: {user}', widget.templates?.follow?.headline || ALERT_TEMPLATES.follow.headline);
    if (followHeadline === null) return;
    const customHeadline = prompt('Custom headline template. Token: {headline}', widget.templates?.custom?.headline || ALERT_TEMPLATES.custom.headline);
    if (customHeadline === null) return;
    const customBody = prompt('Custom body template. Token: {message}', widget.templates?.custom?.body || ALERT_TEMPLATES.custom.body);
    if (customBody === null) return;
    widget.imageUrl = imageUrl.trim();
    widget.accent = accent.trim() || '#f97316';
    widget.durationMs = Math.max(1500, Number(duration) || 6500);
    widget.templates = {
      ...clone(ALERT_TEMPLATES),
      ...(widget.templates || {}),
      follow: { ...(widget.templates?.follow || ALERT_TEMPLATES.follow), headline: followHeadline },
      custom: { ...(widget.templates?.custom || ALERT_TEMPLATES.custom), headline: customHeadline, body: customBody },
    };
  }

  function v2EditOverlayWidget(id) {
    const widget = state.overlay.widgets.find((item) => item.id === id);
    if (!widget) return;
    const title = prompt('Source title', widget.title || 'Source');
    if (title === null) return;
    widget.title = title.trim() || widget.title;
    if (widget.kind === 'embed' || widget.kind === 'image' || widget.kind === 'video') {
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
      ['xbox', 'Xbox'], ['camera', 'Camera'], ['screen', 'Screen'], ['image', 'Image'], ['video', 'Video'],
      ['embed', 'Web'], ['text', 'Text'], ['alert', 'Alerts'], ['frame', 'Frame'],
    ];
    const loungeTest = !isOverlayRuntime && new URLSearchParams(location.search).get('output') === 'lounge'
      ? '<button type="button" class="button primary" id="apply-lounge-24x7">Apply 24/7 layout</button><button type="button" class="button primary" id="test-lounge-layers">Test all Lounge layers</button>'
      : '';
    return `<div class="obv2-source-toolbar">${items.map(([kind, label]) => `<button type="button" class="button ghost" data-add-source="${kind}">+ ${label}</button>`).join('')}<button type="button" class="button ghost obv2-defaults" id="add-space-defaults">SpaceMountain defaults</button>${loungeTest}</div>`;
  }

  function alertTester() {
    if (isOverlayRuntime) return '';
    return `<div class="obv2-alert-tester"><strong>Alert tester</strong><span>Generic replaceable contract: follow, sub, resub, gift, raid, cheer, or custom.</span><div>${['follow', 'sub', 'resub', 'raid', 'cheer', 'gift', 'custom'].map((type) => `<button type="button" class="button ghost" data-test-alert="${type}">${type}</button>`).join('')}</div></div>`;
  }

  function bridgeHelp() {
    if (isOverlayRuntime) return '';
    return `<div class="obv2-bridge-help"><div><strong>Xbox Bridge test</strong><span>Add an Xbox source, save the scene, then run the one-click Windows test. Keep Xbox focused and use the controls injected into the Xbox page.</span></div><div class="action-row"><a class="button primary" href="/downloads/RUN_XBOX_OVERLAY_BAY_TEST.bat" download>Download Xbox test</a><a class="button ghost" href="/overlay-bay.html" target="_top">Open full Overlay Bay</a></div></div>`;
  }

  function v2RenderOverlays() {
    const layout = state.overlay || spaceMountainDefaultLayout();
    const editorChrome = isOverlayRuntime ? '' : `<div class="tray-heading obv2-heading"><div><span class="eyebrow">Canonical overlay workspace</span><h2>Overlay Bay</h2><p>One saved scene for Xbox, camera, screen, images, web sources, text, and replaceable alerts.</p></div><div class="action-row"><button class="button primary" id="save-overlay">Save overlay</button></div></div>${sourceToolbar()}${bridgeHelp()}${alertTester()}`;
    const layers = isOverlayRuntime ? '' : `<div class="overlay-layers obv2-layers"><div class="row between"><strong>Layers</strong><label class="inline-check"><input id="overlay-enabled" type="checkbox" ${layout.enabled !== false ? 'checked' : ''}> Workspace enabled</label></div><p class="obv2-layer-help">Drag/resize on canvas. Double-click a source to edit it.</p><div id="overlay-layer-list">${(layout.widgets || []).slice().sort((a, b) => (Number(b.zIndex) || 0) - (Number(a.zIndex) || 0)).map((widget) => `<article data-layer-id="${esc(widget.id)}"><span>${Number(widget.zIndex) || 0}</span><strong>${esc(widget.title || widget.id)}</strong><small>${esc(widget.kind || 'embed')}</small><button data-lock-widget="${esc(widget.id)}">${widget.locked ? 'Unlock' : 'Lock'}</button><button data-front-widget="${esc(widget.id)}">Front</button><button data-toggle-widget="${esc(widget.id)}">${widget.visible === false ? 'Show' : 'Hide'}</button><button data-remove-widget="${esc(widget.id)}">Remove</button></article>`).join('')}</div></div>`;
    document.getElementById('surface-content').innerHTML = `<div class="overlay-manager card full obv2-manager ${isOverlayRuntime ? 'obv2-runtime' : ''}">${editorChrome}<div class="overlay-canvas ${layout.enabled === false ? 'disabled' : ''}" id="overlay-canvas">${(layout.widgets || []).map((widget, index) => v2OverlayWidgetMarkup(widget, index)).join('') || (isOverlayRuntime ? '' : '<div class="empty overlay-empty">No sources yet. Add Xbox, camera, screen, image, web, text, or alerts above.</div>')}</div>${layers}</div>`;
    v2WireOverlayManager();
    restoreLocalMedia();
    if (isOverlayRuntime) document.body.classList.add('obv2-runtime-body');
  }

  function v2WireOverlayManager() {
    document.querySelectorAll('[data-add-source]').forEach((button) => button.addEventListener('click', () => addWidget(button.dataset.addSource)));
    document.getElementById('add-space-defaults')?.addEventListener('click', addSpaceMountainDefaults);
    document.getElementById('apply-lounge-24x7')?.addEventListener('click', () => {
      const tenant = String(window.spmtTenantOutputs?.tenant || '').trim().toLowerCase();
      if (tenant !== 'mtman1987') {
        setStatus?.('The 24/7 Lounge layout is reserved for the mtman1987 Lounge.', 'error');
        return;
      }
      const slots = {
        main: { x: 2.5, y: 4.5, width: 667, height: 362 }, alerts: { x: 75.5, y: 4.5, width: 211, height: 41 },
        mainAlert: { x: 6, y: 6, width: 590, height: 150 }, mainEvent: { x: 2.5, y: 4.5, width: 667, height: 362 },
        media: { x: 75.5, y: 16, width: 211, height: 130 }, activity: { x: 75.5, y: 44, width: 211, height: 265 },
        stats: { x: 2.5, y: 76, width: 202, height: 92 }, shoutouts: { x: 26.75, y: 76, width: 202, height: 92 },
        games: { x: 51, y: 76, width: 202, height: 92 },
      };
      const slotById = new Map([
        ['community-lounge-live-spotlight', 'main'], ['community-lounge-alerts', 'mainAlert'], ['community-lounge-hmo-media', 'media'],
        ['community-lounge-nebula-stage', 'activity'], ['sw-featured-chat', 'activity'], ['sw-social', 'activity'],
        ['sw-notification', 'activity'], ['sw-gamble', 'games'], ['sw-classic-gamble', 'activity'], ['sw-pokemon-pack', 'mainEvent'],
        ['community-lounge-leaderboard-v2', 'activity'], ['sw-partner-checkin', 'mainEvent'], ['sw-shoutout', 'shoutouts'],
        ['community-lounge-chat-tag', 'games'],
      ]);
      state.overlay.widgets = (state.overlay.widgets || [])
        .filter((item) => !['community-lounge-starfield-24x7', 'community-lounge-frame-24x7'].includes(item.id))
        .map((item) => {
          if (item.id === 'sw-gamble') return { ...item, ...slots.games, layoutSlot: 'games', zIndex: 276, url: 'https://streamweaver-new.fly.dev/gamble-overlay?tenant=spacemountainlive&placement=lounge-tag' };
          if (item.id === 'sw-classic-gamble') return { ...item, visible: false };
          if (item.id === 'sw-pokemon-pack') return { ...item, ...slots.mainEvent, layoutSlot: 'mainEvent', url: 'https://streamweaver-new.fly.dev/overlay/card-pack?tenant=spacemountainlive&placement=lounge-main' };
          const slot = slotById.get(item.id);
          return slot ? { ...item, ...slots[slot], layoutSlot: slot } : item;
        });
      state.overlay.widgets.unshift(commonWidget('video', '24/7 Starfield', {
        id: 'community-lounge-starfield-24x7', url: '/assets/overlay-bay/starfield-pingpong.mp4', x: 0, y: 0,
        width: 960, height: 540, fit: 'cover', muted: true, loop: true, locked: true, interactive: false,
        zIndex: -100, role: 'broadcast-background',
      }));
      state.overlay.widgets.push(commonWidget('frame', '24/7 Neon Panel Frame', {
        id: 'community-lounge-frame-24x7', x: 0, y: 0, width: 960, height: 540,
        locked: true, interactive: false, zIndex: 480, role: 'broadcast-frame',
      }));
      state.overlay.template = 'community-lounge-24x7-v1';
      state.overlay.lounge24x7LayoutVersion = 4;
      state.overlayDirty = true;
      renderOverlays();
      setStatus?.('24/7 layout applied to this Lounge. Save overlay to keep it.', 'ok');
    });
    document.getElementById('test-lounge-layers')?.addEventListener('click', () => {
      const tenant = String(window.spmtTenantOutputs?.tenant || '').trim().toLowerCase();
      if (!tenant) {
        setStatus?.('Could not resolve the current Lounge tenant.', 'error');
        return;
      }
      const url = `${location.origin}/tenant/${encodeURIComponent(tenant)}/lounge?test=1`;
      window.open(url, '_blank', 'noopener,noreferrer');
      setStatus?.('Opened a temporary all-layer Lounge test. Debug labels disappear automatically.', 'ok');
    });
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
    document.querySelectorAll('[data-lock-widget]').forEach((button) => button.addEventListener('click', () => {
      const widget = state.overlay.widgets.find((item) => item.id === button.dataset.lockWidget);
      if (widget) widget.locked = !widget.locked;
      state.overlayDirty = true;
      renderOverlays();
    }));
    document.querySelectorAll('[data-front-widget]').forEach((button) => button.addEventListener('click', () => {
      const widget = state.overlay.widgets.find((item) => item.id === button.dataset.frontWidget);
      if (widget) widget.zIndex = nextZ();
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
      event.preventDefault();
      event.stopPropagation();
      connectLocalSource(button.dataset.connectLocal);
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
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.renderOverlays = v2RenderOverlays;
  window.overlayWidgetMarkup = v2OverlayWidgetMarkup;
  window.wireOverlayManager = v2WireOverlayManager;
  window.editOverlayWidget = v2EditOverlayWidget;
  window.loadOverlayWorkspace = loadOverlayWorkspaceV2;
  window.spmtOverlayBayDefaults = spaceMountainDefaultLayout;

  try { renderOverlays = v2RenderOverlays; } catch {}
  try { overlayWidgetMarkup = v2OverlayWidgetMarkup; } catch {}
  try { wireOverlayManager = v2WireOverlayManager; } catch {}
  try { editOverlayWidget = v2EditOverlayWidget; } catch {}
  try { loadOverlayWorkspace = loadOverlayWorkspaceV2; } catch {}

  exposeOverlayBayInWorktray();

  if (bridgeRuntime) {
    setTimeout(() => {
      if (!state.overlay) {
        state.overlay = spaceMountainDefaultLayout();
        renderOverlays();
      }
      window.parent.postMessage({ type: 'spmt.overlay.ready' }, '*');
    }, 800);
  }
})();
