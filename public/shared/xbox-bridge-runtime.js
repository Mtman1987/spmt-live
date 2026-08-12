(() => {
  if (window.__SPMT_XBOX_BRIDGE__) {
    window.__SPMT_XBOX_BRIDGE__.show();
    return;
  }

  const SPMT_ORIGIN = 'https://spmt.live';
  const OVERLAY_URL = `${SPMT_ORIGIN}/embed/overlays?mode=overlay&app=xbox-bridge&bridge=1`;
  let stopped = false;
  let sourceVideo = null;
  let clonedTrack = null;

  function findLiveXboxVideo() {
    return [...document.querySelectorAll('video')].find((video) => {
      const stream = video.srcObject;
      return stream && typeof stream.getVideoTracks === 'function' && stream.getVideoTracks().some((track) => track.readyState === 'live');
    }) || null;
  }

  const root = document.createElement('div');
  root.id = '__spmt_xbox_bridge_root';
  Object.assign(root.style, {
    position: 'fixed', inset: '0', zIndex: '2147483000', pointerEvents: 'none', overflow: 'hidden', background: '#000'
  });

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  Object.assign(video.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', background: '#000' });

  const frame = document.createElement('iframe');
  frame.src = OVERLAY_URL;
  frame.title = 'SPMT Overlay Bay';
  frame.allow = 'autoplay; camera; microphone; fullscreen; display-capture';
  Object.assign(frame.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0', background: 'transparent', pointerEvents: 'none' });

  const controls = document.createElement('div');
  Object.assign(controls.style, {
    position: 'absolute', top: '10px', right: '10px', zIndex: '4', display: 'flex', gap: '6px', padding: '7px',
    border: '1px solid rgba(255,255,255,.18)', borderRadius: '12px', background: 'rgba(5,7,14,.78)',
    backdropFilter: 'blur(12px)', pointerEvents: 'auto', fontFamily: 'system-ui,sans-serif'
  });

  function button(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, { border: '1px solid rgba(255,255,255,.16)', borderRadius: '9px', background: 'rgba(255,255,255,.06)', color: '#fff', padding: '7px 10px', fontWeight: '800', fontSize: '11px', cursor: 'pointer' });
    b.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); onClick(); });
    return b;
  }

  let overlayVisible = true;
  controls.append(
    button('Overlay', () => { overlayVisible = !overlayVisible; frame.style.display = overlayVisible ? 'block' : 'none'; }),
    button('Test alert', () => frame.contentWindow?.postMessage({ type: 'spmt.overlay.alert', eventType: 'follow', user: 'XboxBridgeTest' }, SPMT_ORIGIN)),
    button('Hide controls', () => { controls.style.display = 'none'; }),
    button('Exit', () => stop())
  );

  root.append(video, frame, controls);
  document.documentElement.append(root);

  async function start() {
    for (let i = 0; i < 120 && !stopped; i += 1) {
      sourceVideo = findLiveXboxVideo();
      if (sourceVideo) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!sourceVideo || stopped) {
      root.remove();
      alert('SPMT Xbox Bridge: no live Xbox MediaStream was found. Start the game stream first, then run the bridge again.');
      return;
    }
    clonedTrack = sourceVideo.srcObject.getVideoTracks()[0].clone();
    video.srcObject = new MediaStream([clonedTrack]);
    await video.play().catch(() => {});
  }

  function stop() {
    stopped = true;
    try { clonedTrack?.stop(); } catch {}
    try { video.srcObject = null; } catch {}
    root.remove();
    delete window.__SPMT_XBOX_BRIDGE__;
  }

  window.__SPMT_XBOX_BRIDGE__ = {
    stop,
    show() { root.style.display = 'block'; controls.style.display = 'flex'; },
    hide() { root.style.display = 'none'; },
    testAlert(payload = {}) { frame.contentWindow?.postMessage({ type: 'spmt.overlay.alert', eventType: 'custom', headline: 'Bridge Test', message: 'Overlay Bay is live.', ...payload }, SPMT_ORIGIN); },
  };

  start();
})();
