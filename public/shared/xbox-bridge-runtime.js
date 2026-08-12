(() => {
  if (window.__SPMT_XBOX_BRIDGE__) {
    window.__SPMT_XBOX_BRIDGE__.show();
    return;
  }

  const savedLayout = window.__SPMT_XBOX_BRIDGE_LAYOUT__ || null;
  const alertTimers = new Map();
  const alertStages = new Map();
  const localSourceStreams = new Map();
  let stopped = false;
  let sourceVideo = null;
  let clonedTrack = null;
  let overlayVisible = true;
  let fullscreenBlocked = false;

  const DEFAULT_ALERT_TEMPLATES = {
    follow: { headline: '{user} joined the climb!', body: 'Welcome to SpaceMountain.' },
    sub: { headline: '{user} subscribed!', body: 'Thanks for fueling the mission.' },
    resub: { headline: '{user} resubscribed!', body: '{months} months on the mountain.' },
    gift: { headline: '{user} gifted {count} subs!', body: 'The crew just got bigger.' },
    raid: { headline: '{user} raided with {count}!', body: 'Raid party incoming.' },
    cheer: { headline: '{user} cheered {amount}!', body: 'Energy received.' },
    custom: { headline: '{headline}', body: '{message}' },
  };

  const originalFullscreenDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'requestFullscreen');

  function blockXboxFullscreenRequests() {
    if (!originalFullscreenDescriptor?.value || fullscreenBlocked) return;
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        ...originalFullscreenDescriptor,
        value() {
          return Promise.resolve();
        },
      });
      fullscreenBlocked = true;
    } catch {}
  }

  function restoreFullscreenRequests() {
    if (!fullscreenBlocked || !originalFullscreenDescriptor) return;
    try {
      Object.defineProperty(Element.prototype, 'requestFullscreen', originalFullscreenDescriptor);
      fullscreenBlocked = false;
    } catch {}
  }

  function findLiveXboxVideo() {
    return [...document.querySelectorAll('video')].find((candidate) => {
      const stream = candidate.srcObject;
      return stream
        && typeof stream.getVideoTracks === 'function'
        && stream.getVideoTracks().some((track) => track.readyState === 'live');
    }) || null;
  }

  function safeVideoSettings(track) {
    try {
      const settings = track?.getSettings?.() || {};
      return {
        width: settings.width || null,
        height: settings.height || null,
        frameRate: settings.frameRate || null,
      };
    } catch {
      return { width: null, height: null, frameRate: null };
    }
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function applyTokens(template, payload) {
    return String(template || '').replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
      const value = payload[key];
      return value === undefined || value === null || value === '' ? '' : String(value);
    });
  }

  function normalizeAlert(payload = {}) {
    return {
      eventType: String(payload.eventType || payload.kind || payload.alertType || 'custom').toLowerCase(),
      user: payload.user || payload.username || payload.displayName || 'Someone',
      count: payload.count ?? payload.viewers ?? payload.gifts ?? 1,
      amount: payload.amount ?? payload.bits ?? '',
      months: payload.months ?? '',
      headline: payload.headline || 'SpaceMountain Alert',
      message: payload.message || '',
      imageUrl: payload.imageUrl || '',
    };
  }

  const root = document.createElement('div');
  root.id = '__spmt_xbox_bridge_root';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483000',
    pointerEvents: 'none',
    overflow: 'hidden',
    background: '#000',
  });

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  Object.assign(video.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#000',
  });

  const overlayLayer = document.createElement('div');
  overlayLayer.id = '__spmt_xbox_overlay_layer';
  Object.assign(overlayLayer.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '2',
    pointerEvents: 'none',
    overflow: 'hidden',
    background: 'transparent',
  });

  const controls = document.createElement('div');
  Object.assign(controls.style, {
    position: 'absolute',
    top: '10px',
    right: '10px',
    zIndex: '5',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    padding: '7px',
    border: '1px solid rgba(255,255,255,.18)',
    borderRadius: '12px',
    background: 'rgba(5,7,14,.84)',
    backdropFilter: 'blur(12px)',
    pointerEvents: 'auto',
    fontFamily: 'system-ui,sans-serif',
    maxWidth: 'min(92vw,820px)',
  });

  const collapsedButton = document.createElement('button');
  collapsedButton.type = 'button';
  collapsedButton.textContent = 'SPMT controls';
  Object.assign(collapsedButton.style, {
    position: 'absolute',
    top: '10px',
    right: '10px',
    zIndex: '6',
    display: 'none',
    pointerEvents: 'auto',
    border: '1px solid rgba(255,255,255,.18)',
    borderRadius: '999px',
    background: 'rgba(5,7,14,.84)',
    color: '#fff',
    padding: '8px 12px',
    fontFamily: 'system-ui,sans-serif',
    fontWeight: '800',
    fontSize: '11px',
    cursor: 'pointer',
  });
  collapsedButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    collapsedButton.style.display = 'none';
    controls.style.display = 'flex';
  });

  const status = document.createElement('span');
  status.textContent = savedLayout ? 'SPMT bridge · scene loaded' : 'SPMT bridge · no saved scene';
  Object.assign(status.style, {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '7px 9px',
    color: '#dbe4f4',
    fontSize: '10px',
    fontWeight: '800',
  });

  function button(label, onClick) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    Object.assign(element.style, {
      border: '1px solid rgba(255,255,255,.16)',
      borderRadius: '9px',
      background: 'rgba(255,255,255,.06)',
      color: '#fff',
      padding: '7px 10px',
      fontWeight: '800',
      fontSize: '11px',
      cursor: 'pointer',
    });
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return element;
  }

  function applyWidgetBox(element, widget, index) {
    Object.assign(element.style, {
      position: 'absolute',
      left: `${number(widget.x, 5)}%`,
      top: `${number(widget.y, 5)}%`,
      width: `${Math.max(1, number(widget.width, 360))}px`,
      height: `${Math.max(1, number(widget.height, 220))}px`,
      opacity: String(widget.opacity ?? 1),
      zIndex: String(number(widget.zIndex, index + 1)),
      overflow: 'hidden',
      pointerEvents: 'none',
      boxSizing: 'border-box',
    });
  }

  function makeMedia(widget, index, kind) {
    const box = document.createElement('div');
    box.dataset.spmtWidget = widget.id || `${kind}-${index}`;
    applyWidgetBox(box, widget, index);

    if (kind === 'image') {
      const image = document.createElement('img');
      image.alt = widget.title || 'Overlay image';
      image.src = widget.url || '';
      Object.assign(image.style, {
        width: '100%', height: '100%', display: 'block', objectFit: widget.fit || 'contain', background: 'transparent',
      });
      box.append(image);
    } else if (kind === 'embed') {
      const frame = document.createElement('iframe');
      frame.src = widget.url || 'about:blank';
      frame.title = widget.title || 'Overlay web source';
      frame.allow = 'autoplay; microphone; camera; fullscreen; clipboard-write; display-capture';
      Object.assign(frame.style, {
        width: '100%', height: '100%', display: 'block', border: '0', background: 'transparent', pointerEvents: 'none',
      });
      box.append(frame);
    } else if (kind === 'text') {
      const text = document.createElement('div');
      text.textContent = widget.text || 'Text';
      Object.assign(text.style, {
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: '12px',
        boxSizing: 'border-box',
        color: widget.color || '#fff',
        fontFamily: 'system-ui,sans-serif',
        fontSize: `${Math.max(12, number(widget.fontSize, 42))}px`,
        fontWeight: '900',
        lineHeight: '1.05',
        textAlign: widget.align || 'center',
        textShadow: '0 3px 18px rgba(0,0,0,.8)',
        overflowWrap: 'anywhere',
      });
      box.append(text);
    } else if (kind === 'camera' || kind === 'screen') {
      const media = document.createElement('video');
      media.autoplay = true;
      media.playsInline = true;
      media.muted = true;
      media.dataset.localSourceVideo = widget.id || `${kind}-${index}`;
      Object.assign(media.style, {
        width: '100%', height: '100%', display: 'block', objectFit: widget.fit || (kind === 'camera' ? 'cover' : 'contain'), background: 'transparent',
      });
      const cover = document.createElement('div');
      cover.dataset.localSourceCover = widget.id || `${kind}-${index}`;
      cover.textContent = `${kind === 'camera' ? 'Camera' : 'Screen'} source · use SPMT controls to connect`;
      Object.assign(cover.style, {
        position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', padding: '12px', boxSizing: 'border-box',
        background: 'rgba(5,7,14,.72)', color: '#dbe4f4', fontFamily: 'system-ui,sans-serif', fontSize: '12px', fontWeight: '800', textAlign: 'center',
      });
      box.append(media, cover);
    }

    return box;
  }

  function makeAlert(widget, index) {
    const box = document.createElement('div');
    const id = widget.id || `alert-${index}`;
    box.dataset.spmtWidget = id;
    applyWidgetBox(box, widget, index);
    Object.assign(box.style, {
      display: 'grid',
      placeItems: 'center',
      padding: '14px',
      boxSizing: 'border-box',
      overflow: 'visible',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width: 'min(100%,500px)',
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0,1fr)',
      alignItems: 'center',
      gap: '14px',
      padding: '15px 18px',
      boxSizing: 'border-box',
      border: `1px solid ${widget.accent || '#f97316'}`,
      borderRadius: '18px',
      background: 'rgba(5,7,14,.92)',
      boxShadow: `0 18px 50px rgba(0,0,0,.46), 0 0 28px ${widget.accent || '#f97316'}55`,
      opacity: '0',
      transform: 'translateY(22px) scale(.96)',
      transition: 'opacity .22s ease, transform .32s cubic-bezier(.2,.8,.2,1)',
      fontFamily: 'system-ui,sans-serif',
    });

    const image = document.createElement('img');
    image.alt = '';
    Object.assign(image.style, {
      width: '70px', height: '70px', objectFit: 'contain', display: 'none',
    });

    const copy = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.textContent = 'SPACEMOUNTAIN ALERT';
    Object.assign(kicker.style, {
      display: 'block', color: widget.accent || '#f97316', fontSize: '9px', fontWeight: '900', letterSpacing: '.14em',
    });
    const headline = document.createElement('strong');
    headline.textContent = 'Generic alert ready';
    Object.assign(headline.style, {
      display: 'block', marginTop: '3px', color: '#fff', fontSize: '20px', lineHeight: '1.05',
    });
    const body = document.createElement('p');
    body.textContent = 'Follow, sub, raid, cheer, gift, or custom event.';
    Object.assign(body.style, {
      margin: '6px 0 0', color: '#c6cede', fontSize: '11px', lineHeight: '1.35',
    });
    copy.append(kicker, headline, body);
    card.append(image, copy);
    box.append(card);
    alertStages.set(id, { widget, card, image, headline, body });
    return box;
  }

  function renderSavedLayout() {
    overlayLayer.replaceChildren();
    alertStages.clear();
    const layout = savedLayout && typeof savedLayout === 'object' ? savedLayout : { enabled: true, widgets: [] };
    if (layout.enabled === false) {
      overlayLayer.style.display = 'none';
      overlayVisible = false;
      return;
    }

    const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
    widgets.forEach((widget, index) => {
      if (!widget || widget.visible === false || widget.kind === 'xbox') return;
      const kind = widget.kind || 'embed';
      if (kind === 'alert') overlayLayer.append(makeAlert(widget, index));
      else if (['image', 'embed', 'text', 'camera', 'screen'].includes(kind)) overlayLayer.append(makeMedia(widget, index, kind));
    });
  }

  function fireAlert(rawPayload = {}) {
    const payload = normalizeAlert(rawPayload);
    alertStages.forEach((stage, id) => {
      const { widget, card, image, headline, body } = stage;
      const accepts = Array.isArray(widget.accepts) ? widget.accepts : Object.keys(DEFAULT_ALERT_TEMPLATES);
      if (!accepts.includes(payload.eventType) && !accepts.includes('custom')) return;
      const templates = widget.templates || DEFAULT_ALERT_TEMPLATES;
      const template = templates[payload.eventType] || templates.custom || DEFAULT_ALERT_TEMPLATES.custom;
      headline.textContent = applyTokens(template.headline, payload) || payload.headline;
      body.textContent = applyTokens(template.body, payload) || payload.message;
      const imageUrl = payload.imageUrl || widget.imageUrl || '';
      if (imageUrl) {
        image.src = imageUrl;
        image.style.display = 'block';
      } else {
        image.removeAttribute('src');
        image.style.display = 'none';
      }
      card.style.opacity = '0';
      card.style.transform = 'translateY(22px) scale(.96)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0) scale(1)';
        });
      });
      clearTimeout(alertTimers.get(id));
      alertTimers.set(id, setTimeout(() => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(22px) scale(.96)';
      }, Math.max(1500, number(widget.durationMs, 6500))));
    });
  }

  async function connectLocalSource(widget, index) {
    const id = widget.id || `${widget.kind}-${index}`;
    const media = overlayLayer.querySelector(`[data-local-source-video="${CSS.escape(id)}"]`);
    const cover = overlayLayer.querySelector(`[data-local-source-cover="${CSS.escape(id)}"]`);
    if (!media) return;

    try {
      localSourceStreams.get(id)?.getTracks?.().forEach((track) => track.stop());
      const stream = widget.kind === 'camera'
        ? await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        : await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 60, max: 60 } }, audio: false });
      localSourceStreams.set(id, stream);
      media.srcObject = stream;
      await media.play().catch(() => {});
      if (cover) cover.style.display = 'none';
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack?.addEventListener('ended', () => {
        localSourceStreams.delete(id);
        media.srcObject = null;
        if (cover) cover.style.display = 'grid';
      }, { once: true });
      status.textContent = `SPMT bridge · ${widget.title || widget.kind} connected`;
    } catch (error) {
      status.textContent = `SPMT bridge · ${widget.kind} denied`;
      console.warn('SPMT local overlay source could not connect', error);
    }
  }

  function stop() {
    stopped = true;
    restoreFullscreenRequests();
    alertTimers.forEach((timer) => clearTimeout(timer));
    localSourceStreams.forEach((stream) => stream.getTracks?.().forEach((track) => track.stop()));
    localSourceStreams.clear();
    try { clonedTrack?.stop(); } catch {}
    try { video.srcObject = null; } catch {}
    root.remove();
    delete window.__SPMT_XBOX_BRIDGE__;
    delete window.__SPMT_XBOX_BRIDGE_LAYOUT__;
  }

  controls.append(
    status,
    button('Overlay', () => {
      overlayVisible = !overlayVisible;
      overlayLayer.style.display = overlayVisible ? 'block' : 'none';
    }),
    button('Test follow', () => fireAlert({ eventType: 'follow', user: 'XboxBridgeTest' })),
    button('Test raid', () => fireAlert({ eventType: 'raid', user: 'RaidCrew', count: 42 })),
  );

  const widgets = Array.isArray(savedLayout?.widgets) ? savedLayout.widgets : [];
  widgets.forEach((widget, index) => {
    if (!widget || widget.visible === false || !['camera', 'screen'].includes(widget.kind)) return;
    const label = widget.kind === 'camera' ? `Camera${widgets.filter((item) => item?.kind === 'camera').length > 1 ? ` ${index + 1}` : ''}` : `Screen${widgets.filter((item) => item?.kind === 'screen').length > 1 ? ` ${index + 1}` : ''}`;
    controls.append(button(label, () => connectLocalSource(widget, index)));
  });

  controls.append(
    button('Collapse', () => {
      controls.style.display = 'none';
      collapsedButton.style.display = 'block';
    }),
    button('Exit', () => stop()),
  );

  root.append(video, overlayLayer, controls, collapsedButton);
  document.documentElement.append(root);
  renderSavedLayout();

  async function start() {
    blockXboxFullscreenRequests();
    for (let i = 0; i < 120 && !stopped; i += 1) {
      sourceVideo = findLiveXboxVideo();
      if (sourceVideo) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!sourceVideo || stopped) {
      restoreFullscreenRequests();
      root.remove();
      alert('SPMT Xbox Bridge: no live Xbox MediaStream was found. Start the game stream first, then run the bridge again.');
      return;
    }

    clonedTrack = sourceVideo.srcObject.getVideoTracks()[0].clone();
    video.srcObject = new MediaStream([clonedTrack]);
    await video.play().catch(() => {});
    const settings = safeVideoSettings(clonedTrack);
    status.textContent = `SPMT bridge · ${settings.width || '?'}×${settings.height || '?'} · ${widgets.length} saved source${widgets.length === 1 ? '' : 's'}`;
  }

  window.__SPMT_XBOX_BRIDGE__ = {
    stop,
    show() {
      root.style.display = 'block';
      collapsedButton.style.display = 'none';
      controls.style.display = 'flex';
    },
    hide() { root.style.display = 'none'; },
    fireAlert,
    toggleOverlay() {
      overlayVisible = !overlayVisible;
      overlayLayer.style.display = overlayVisible ? 'block' : 'none';
      return overlayVisible;
    },
  };

  start();
})();
