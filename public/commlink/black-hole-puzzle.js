(() => {
  const PUZZLE_DURATION_MS = 120_000;
  const ARTIFACT_SIZE = 32;
  const ARTIFACT_RADIUS = ARTIFACT_SIZE / 2;
  const MAX_SPEED = 13;
  const PASSIVE_DRAG = 0.999;
  const ACTIVE_DRAG = 0.994;

  const ARTIFACTS = [
    {
      id: 'planet',
      label: 'planet',
      x: 0.42,
      y: 0.28,
      vx: 0.62,
      vy: 0.44,
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2"></circle><path d="M3.5 13.8c2.6 2.2 6.8 2.6 10.8 1.4 3.2-1 5.7-2.8 6.3-4.5"></path><path d="M4.2 10.6c1.1-2 3.4-3.7 6.3-4.6"></path></svg>',
    },
    {
      id: 'rocket',
      label: 'rocket',
      x: 0.73,
      y: 0.46,
      vx: -0.55,
      vy: 0.7,
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.2c2.7-1.1 4.8-.9 5.3-.4.5.5.7 2.6-.4 5.3l-5.9 8.2-4.8-4.8 5.8-8.3Z"></path><circle cx="15.8" cy="8.2" r="1.7"></circle><path d="M8.9 12.8 5.2 13.9 3.8 17l4.3-.6"></path><path d="m11.2 15.1-1.1 3.7-3.1 1.4.6-4.3"></path></svg>',
    },
    {
      id: 'asteroid',
      label: 'asteroid',
      x: 0.57,
      y: 0.72,
      vx: 0.48,
      vy: -0.63,
      svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8 13 3l5 3.1 3 5.7-2.4 6-5.8 3.2-6.2-1.8L3 14.4l1.2-5.8L7 4.8Z"></path><circle cx="9" cy="9" r="1.4"></circle><circle cx="15.4" cy="13.3" r="1.7"></circle><path d="m8.2 16.2 2.2-1"></path></svg>',
    },
  ];

  const runtime = {
    active: false,
    completing: false,
    startedAt: 0,
    frame: 0,
    lastFrameAt: 0,
    layer: null,
    logo: null,
    orbit: null,
    artifacts: [],
  };

  function announce(message) {
    if (typeof window.toast === 'function') {
      window.toast(message);
      return;
    }
    const region = document.getElementById('toast-region');
    if (!region) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function injectStyles() {
    if (document.getElementById('cosmo-black-hole-physics-styles')) return;
    const style = document.createElement('style');
    style.id = 'cosmo-black-hole-physics-styles';
    style.textContent = `
      /* The old full-screen click-the-target puzzle is intentionally retired. */
      #black-hole-game { display: none !important; }

      #cosmo-logo { position: relative; }
      #cosmo-logo.cosmo-black-hole-active { z-index: 96; }
      #cosmo-logo.cosmo-black-hole-active .brand-orbit {
        width: 39px;
        height: 39px;
        overflow: visible;
        border-color: rgba(167,139,250,.78);
        background:
          radial-gradient(circle at 50% 50%, #000 0 35%, rgba(2,0,8,.98) 36% 46%, rgba(88,28,135,.9) 48% 55%, rgba(56,189,248,.34) 58% 62%, transparent 65%);
        box-shadow:
          0 0 0 2px rgba(124,58,237,.12),
          0 0 18px rgba(167,139,250,.55),
          0 0 34px rgba(56,189,248,.16),
          inset 0 0 13px #000;
        animation: cosmo-hole-breathe 1.7s ease-in-out infinite;
      }
      #cosmo-logo.cosmo-black-hole-active .brand-orbit > span { opacity: 0; }
      #cosmo-logo.cosmo-black-hole-active .brand-orbit::after {
        width: 47px;
        height: 18px;
        border-color: rgba(167,139,250,.78);
        border-right-color: rgba(56,189,248,.32);
        border-left-color: rgba(124,58,237,.18);
        box-shadow: 0 0 10px rgba(167,139,250,.28);
        animation: cosmo-hole-spin .8s linear infinite;
      }
      #cosmo-logo.cosmo-hole-kick .brand-orbit { animation: cosmo-hole-kick .2s ease-out, cosmo-hole-breathe 1.7s ease-in-out infinite .2s; }

      .cosmo-physics-layer {
        position: absolute;
        z-index: 80;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
      }
      .cosmo-station-artifact {
        position: absolute;
        left: 0;
        top: 0;
        display: grid;
        place-items: center;
        width: ${ARTIFACT_SIZE}px;
        height: ${ARTIFACT_SIZE}px;
        border-radius: 50%;
        color: rgba(220,226,255,.68);
        background: rgba(12,16,38,.42);
        border: 1px solid rgba(167,139,250,.14);
        box-shadow: 0 0 9px rgba(167,139,250,.08);
        opacity: .72;
        transform: translate3d(0,0,0);
        will-change: transform, opacity;
        transition: opacity .18s ease, filter .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease;
      }
      .cosmo-station-artifact svg {
        width: 19px;
        height: 19px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.55;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .commlink-black-hole-active .cosmo-station-artifact {
        opacity: 1;
        color: #f6f0ff;
        background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.2), rgba(124,58,237,.22) 34%, rgba(5,8,24,.92) 72%);
        border-color: rgba(167,139,250,.6);
        box-shadow: 0 0 12px rgba(167,139,250,.42), 0 0 26px rgba(56,189,248,.12);
      }
      .cosmo-station-artifact.consumed {
        opacity: 0;
        filter: blur(4px);
      }

      @keyframes cosmo-hole-spin { to { transform: rotate(338deg); } }
      @keyframes cosmo-hole-breathe { 50% { box-shadow: 0 0 0 2px rgba(124,58,237,.14), 0 0 25px rgba(167,139,250,.68), 0 0 40px rgba(56,189,248,.2), inset 0 0 15px #000; } }
      @keyframes cosmo-hole-kick { 50% { transform: scale(.9); } }

      @media (prefers-reduced-motion: reduce) {
        #cosmo-logo.cosmo-black-hole-active .brand-orbit,
        #cosmo-logo.cosmo-black-hole-active .brand-orbit::after,
        #cosmo-logo.cosmo-hole-kick .brand-orbit { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function createArtifactLayer() {
    const shell = document.getElementById('app-shell');
    if (!shell) return null;
    const layer = document.createElement('div');
    layer.id = 'cosmo-physics-layer';
    layer.className = 'cosmo-physics-layer';
    layer.setAttribute('aria-hidden', 'true');
    shell.appendChild(layer);

    const rect = layer.getBoundingClientRect();
    runtime.artifacts = ARTIFACTS.map((definition) => {
      const element = document.createElement('div');
      element.className = 'cosmo-station-artifact';
      element.dataset.cosmoArtifact = definition.id;
      element.title = definition.label;
      element.innerHTML = definition.svg;
      layer.appendChild(element);
      return {
        ...definition,
        x: Math.max(ARTIFACT_RADIUS, rect.width * definition.x),
        y: Math.max(ARTIFACT_RADIUS, rect.height * definition.y),
        vx: definition.vx,
        vy: definition.vy,
        consumed: false,
        element,
      };
    });
    return layer;
  }

  function clampSpeed(artifact) {
    const speed = Math.hypot(artifact.vx, artifact.vy);
    if (speed <= MAX_SPEED || speed === 0) return;
    const scale = MAX_SPEED / speed;
    artifact.vx *= scale;
    artifact.vy *= scale;
  }

  function segmentCrossesCircle(x1, y1, x2, y2, cx, cy, radius) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return Math.hypot(x1 - cx, y1 - cy) <= radius;
    const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lengthSquared));
    const nearestX = x1 + dx * t;
    const nearestY = y1 + dy * t;
    return Math.hypot(nearestX - cx, nearestY - cy) <= radius;
  }

  function holeGeometry() {
    const layerRect = runtime.layer.getBoundingClientRect();
    const orbitRect = runtime.orbit.getBoundingClientRect();
    return {
      x: orbitRect.left - layerRect.left + orbitRect.width / 2,
      y: orbitRect.top - layerRect.top + orbitRect.height / 2,
      radius: orbitRect.width / 2 + 5,
    };
  }

  function renderArtifact(artifact) {
    artifact.element.style.transform = `translate3d(${artifact.x - ARTIFACT_RADIUS}px, ${artifact.y - ARTIFACT_RADIUS}px, 0)`;
  }

  function captureArtifact(artifact) {
    if (artifact.consumed) return;
    artifact.consumed = true;
    artifact.element.classList.add('consumed');
    if (runtime.artifacts.every((item) => item.consumed)) {
      void completePuzzle();
    }
  }

  function restoreArtifacts() {
    for (const artifact of runtime.artifacts) {
      artifact.consumed = false;
      artifact.element.classList.remove('consumed');
      artifact.vx = (Math.random() < .5 ? -1 : 1) * (.35 + Math.random() * .45);
      artifact.vy = (Math.random() < .5 ? -1 : 1) * (.35 + Math.random() * .45);
      renderArtifact(artifact);
    }
  }

  function finishPuzzle({ completed = false } = {}) {
    runtime.active = false;
    runtime.completing = false;
    runtime.startedAt = 0;
    runtime.logo.classList.remove('cosmo-black-hole-active', 'cosmo-hole-kick');
    document.body.classList.remove('commlink-black-hole-active');
    restoreArtifacts();
    if (!completed) announce('The anomaly collapsed. The station artifacts returned to their drift.');
  }

  async function completePuzzle() {
    if (runtime.completing) return;
    runtime.completing = true;
    let recorded = null;
    try {
      if (typeof window.recordDiscovery === 'function') {
        recorded = await window.recordDiscovery('cosmo-black-hole');
      } else {
        console.warn('[CommlinkBlackHole] recordDiscovery is unavailable');
      }
    } catch (error) {
      console.warn('[CommlinkBlackHole] discovery persistence failed', error);
    }
    announce(recorded ? 'Cosmo anomaly captured. Hidden signal preserved.' : 'Cosmo anomaly captured.');
    window.setTimeout(() => finishPuzzle({ completed: true }), 480);
  }

  function exciteArtifacts() {
    for (const artifact of runtime.artifacts) {
      if (artifact.consumed) continue;
      artifact.vx += (Math.random() - .5) * 12;
      artifact.vy += (Math.random() - .5) * 12;
      clampSpeed(artifact);
    }
    runtime.logo.classList.remove('cosmo-hole-kick');
    void runtime.logo.offsetWidth;
    runtime.logo.classList.add('cosmo-hole-kick');
  }

  function startPuzzle() {
    if (runtime.active || runtime.completing) return;
    runtime.active = true;
    runtime.startedAt = performance.now();
    restoreArtifacts();
    runtime.logo.classList.add('cosmo-black-hole-active');
    document.body.classList.add('commlink-black-hole-active');
    announce('A black hole opened in the Cosmo mark. Keep clicking it to kick the drifting station artifacts.');
    exciteArtifacts();
  }

  function step(timestamp) {
    const layerRect = runtime.layer.getBoundingClientRect();
    const width = Math.max(ARTIFACT_SIZE, layerRect.width);
    const height = Math.max(ARTIFACT_SIZE, layerRect.height);
    const dt = runtime.lastFrameAt ? Math.min(2.2, (timestamp - runtime.lastFrameAt) / (1000 / 60)) : 1;
    runtime.lastFrameAt = timestamp;
    const hole = runtime.active ? holeGeometry() : null;

    for (const artifact of runtime.artifacts) {
      if (artifact.consumed) continue;
      const previousX = artifact.x;
      const previousY = artifact.y;
      let nextX = artifact.x + artifact.vx * dt;
      let nextY = artifact.y + artifact.vy * dt;

      if (nextX <= ARTIFACT_RADIUS) {
        nextX = ARTIFACT_RADIUS;
        artifact.vx = Math.abs(artifact.vx);
      } else if (nextX >= width - ARTIFACT_RADIUS) {
        nextX = width - ARTIFACT_RADIUS;
        artifact.vx = -Math.abs(artifact.vx);
      }
      if (nextY <= ARTIFACT_RADIUS) {
        nextY = ARTIFACT_RADIUS;
        artifact.vy = Math.abs(artifact.vy);
      } else if (nextY >= height - ARTIFACT_RADIUS) {
        nextY = height - ARTIFACT_RADIUS;
        artifact.vy = -Math.abs(artifact.vy);
      }

      artifact.x = nextX;
      artifact.y = nextY;
      const drag = runtime.active ? ACTIVE_DRAG : PASSIVE_DRAG;
      artifact.vx *= Math.pow(drag, dt);
      artifact.vy *= Math.pow(drag, dt);

      if (!runtime.active && Math.hypot(artifact.vx, artifact.vy) < .25) {
        artifact.vx += (Math.random() - .5) * .12;
        artifact.vy += (Math.random() - .5) * .12;
      }

      renderArtifact(artifact);

      if (hole && segmentCrossesCircle(previousX, previousY, artifact.x, artifact.y, hole.x, hole.y, hole.radius)) {
        captureArtifact(artifact);
      }
    }

    if (runtime.active && !runtime.completing && timestamp - runtime.startedAt >= PUZZLE_DURATION_MS) {
      finishPuzzle();
    }

    runtime.frame = requestAnimationFrame(step);
  }

  function install() {
    runtime.logo = document.getElementById('cosmo-logo');
    runtime.orbit = runtime.logo?.querySelector('.brand-orbit') || null;
    if (!runtime.logo || !runtime.orbit) return;

    injectStyles();
    runtime.layer = createArtifactLayer();
    if (!runtime.layer) return;

    const legacyModal = document.getElementById('black-hole-game');
    legacyModal?.setAttribute('aria-hidden', 'true');

    // Capture-phase ownership prevents the legacy bubble listener from reopening
    // the full-screen click-the-artifact modal. The Cosmo mark is the only input.
    runtime.logo.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (runtime.active) {
        exciteArtifacts();
      } else if (!runtime.completing) {
        startPuzzle();
      }
    }, { capture: true });

    runtime.frame = requestAnimationFrame(step);
  }

  install();
})();
