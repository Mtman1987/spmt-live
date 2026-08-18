(() => {
  'use strict';

  const EGG_APP_ID = 'spacemountain-live';
  const EGG_NAMESPACE = 'easter-eggs';
  const EGG_KEY = 'blackHole';
  const GAME_DURATION_MS = 120000;
  const FLICKER_MIN_MS = 120000;
  const FLICKER_MAX_MS = 300000;
  const BALL_COUNT = 10;
  const CAPTURE_RADIUS = 34;
  const MARK_SELECTOR = '#app:not(.hidden) .sidebar .brand .mark';
  const BALL_LABELS = ['🚀', '🎮', '📡', '💬', '🎧', '🃏', '⭐', '🛰️', '🎲', '🌌'];

  let installedMark = null;
  let clickTimer = null;
  let ambientTimer = null;
  let activeGame = null;

  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function ensureStyles() {
    if (document.getElementById('spmt-black-hole-egg-styles')) return;
    const style = document.createElement('style');
    style.id = 'spmt-black-hole-egg-styles';
    style.textContent = `
      .spmt-black-hole-flicker {
        color: transparent !important;
        background:
          radial-gradient(circle at 50% 50%, #000 0 25%, #08020f 27% 34%, #7c3aed 38% 42%, #0ea5e9 48% 52%, transparent 64%) !important;
        box-shadow: 0 0 18px #7c3aed99, 0 0 34px #0ea5e955 !important;
        transform: rotate(12deg) scale(1.08);
      }
      #spmt-black-hole-game {
        position: fixed;
        inset: 0;
        z-index: 2147482000;
        pointer-events: auto;
        overflow: hidden;
        background: rgba(2, 3, 12, .24);
        backdrop-filter: blur(1.5px);
        cursor: crosshair;
        user-select: none;
      }
      #spmt-black-hole-game .egg-hud {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 3;
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 9px 14px;
        border: 1px solid rgba(167, 139, 250, .28);
        border-radius: 999px;
        background: rgba(5, 8, 22, .78);
        box-shadow: 0 12px 44px rgba(0, 0, 0, .38);
        color: #f8fafc;
        font: 700 12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      #spmt-black-hole-game .egg-hud strong { color: #c4b5fd; font-variant-numeric: tabular-nums; }
      #spmt-black-hole-game .egg-hint { color: #94a3b8; font-weight: 600; letter-spacing: .02em; text-transform: none; }
      #spmt-black-hole-game .egg-void {
        position: fixed;
        width: 82px;
        height: 82px;
        margin: -41px 0 0 -41px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 2;
        background:
          radial-gradient(circle at 50% 50%, #000 0 26%, #05020a 27% 36%, #5b21b6 39% 43%, #22d3ee 47% 50%, #7c3aed 54% 58%, transparent 68%);
        box-shadow: 0 0 24px rgba(124, 58, 237, .65), 0 0 52px rgba(34, 211, 238, .28);
        animation: spmtVoidPulse 1.15s ease-in-out infinite alternate, spmtVoidSpin 5.4s linear infinite;
      }
      #spmt-black-hole-game .egg-ball {
        position: fixed;
        width: 42px;
        height: 42px;
        margin: -21px 0 0 -21px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        z-index: 1;
        font-size: 20px;
        background: radial-gradient(circle at 34% 28%, rgba(255,255,255,.96), rgba(196,181,253,.9) 22%, rgba(49,46,129,.96) 66%, rgba(2,6,23,.98));
        border: 1px solid rgba(255,255,255,.32);
        box-shadow: 0 8px 22px rgba(0,0,0,.46), 0 0 14px rgba(167,139,250,.36);
        cursor: pointer;
        will-change: transform, left, top;
      }
      #spmt-black-hole-game .egg-ball.bumped { animation: spmtEggBump .22s ease-out; }
      #spmt-black-hole-game .egg-ball.captured { animation: spmtEggCapture .32s ease-in forwards; pointer-events:none; }
      #spmt-black-hole-game .egg-result {
        position: fixed;
        inset: 0;
        z-index: 5;
        display: grid;
        place-items: center;
        pointer-events: none;
        font: 900 clamp(20px, 4vw, 44px)/1.1 Inter, ui-sans-serif, system-ui, sans-serif;
        letter-spacing: .12em;
        text-transform: uppercase;
        text-shadow: 0 3px 30px #000;
      }
      #spmt-black-hole-game .egg-result span {
        padding: 18px 24px;
        border-radius: 18px;
        background: rgba(2,6,23,.86);
        border: 1px solid rgba(167,139,250,.3);
      }
      @keyframes spmtVoidPulse { from { scale: .94; filter: brightness(.8); } to { scale: 1.08; filter: brightness(1.22); } }
      @keyframes spmtVoidSpin { to { rotate: 360deg; } }
      @keyframes spmtEggBump { 50% { scale: 1.34; rotate: 28deg; filter: brightness(1.5); } }
      @keyframes spmtEggCapture { to { scale: 0; rotate: 420deg; opacity: 0; filter: blur(4px); } }
      @media (prefers-reduced-motion: reduce) {
        #spmt-black-hole-game .egg-void { animation-duration: 8s; }
        #spmt-black-hole-game .egg-ball { transition: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function setBlackHoleMark(mark, enabled) {
    if (!mark) return;
    mark.classList.toggle('spmt-black-hole-flicker', enabled);
  }

  function flicker(mark, duration = 115) {
    if (!mark || activeGame) return;
    setBlackHoleMark(mark, true);
    window.setTimeout(() => setBlackHoleMark(mark, false), duration);
  }

  function scheduleAmbientFlicker() {
    window.clearTimeout(ambientTimer);
    ambientTimer = window.setTimeout(() => {
      const mark = document.querySelector(MARK_SELECTOR);
      if (mark) flicker(mark, randomBetween(70, 145));
      scheduleAmbientFlicker();
    }, randomBetween(FLICKER_MIN_MS, FLICKER_MAX_MS));
  }

  async function readEggState() {
    const response = await fetch(`/api/app-state/${EGG_APP_ID}/${EGG_NAMESPACE}`, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return { revision: 0, etag: '', data: {} };
    if (!response.ok) throw new Error(`egg state read failed: ${response.status}`);
    const payload = await response.json();
    return {
      revision: Number(payload.revision || 0),
      etag: response.headers.get('etag') || '',
      data: payload.data && typeof payload.data === 'object' ? payload.data : {},
    };
  }

  async function writeCompletion(attempt = 0) {
    const current = await readEggState();
    const existingEggs = current.data.eggs && typeof current.data.eggs === 'object' ? current.data.eggs : {};
    const existing = existingEggs[EGG_KEY] && typeof existingEggs[EGG_KEY] === 'object' ? existingEggs[EGG_KEY] : {};
    const discoveredAt = existing.discoveredAt || new Date().toISOString();
    const data = {
      ...current.data,
      eggs: {
        ...existingEggs,
        [EGG_KEY]: {
          ...existing,
          completed: true,
          discoveredAt,
          source: 'spmt-live',
        },
      },
    };
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (current.etag) headers['If-Match'] = current.etag;
    const response = await fetch(`/api/app-state/${EGG_APP_ID}/${EGG_NAMESPACE}`, {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify({ schemaVersion: 1, revision: current.revision, data }),
    });
    if (response.status === 409 && attempt < 1) return writeCompletion(attempt + 1);
    if (!response.ok) throw new Error(`egg state write failed: ${response.status}`);
    window.dispatchEvent(new CustomEvent('spmt:easter-egg-complete', {
      detail: { egg: EGG_KEY, completed: true, titleCandidate: 'Voidwalker' },
    }));
  }

  function blackHoleCenter(mark) {
    const rect = mark.getBoundingClientRect();
    return {
      x: clamp(rect.left + rect.width / 2, 64, window.innerWidth - 64),
      y: clamp(rect.top + rect.height / 2, 64, window.innerHeight - 64),
    };
  }

  function makeBall(index, center) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'egg-ball';
    element.setAttribute('aria-label', 'Anomaly object');
    element.textContent = BALL_LABELS[index % BALL_LABELS.length];
    const angle = (Math.PI * 2 * index / BALL_COUNT) + randomBetween(-0.45, 0.45);
    const distance = randomBetween(150, Math.max(190, Math.min(window.innerWidth, window.innerHeight) * .42));
    let x = clamp(center.x + Math.cos(angle) * distance, 34, window.innerWidth - 34);
    let y = clamp(center.y + Math.sin(angle) * distance, 78, window.innerHeight - 34);
    let speed = randomBetween(85, 155);
    let velocityAngle = randomBetween(0, Math.PI * 2);
    const ball = {
      element,
      x,
      y,
      vx: Math.cos(velocityAngle) * speed,
      vy: Math.sin(velocityAngle) * speed,
      captured: false,
    };
    const bump = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (ball.captured || !activeGame) return;
      const liveCenter = activeGame.center;
      const dx = liveCenter.x - ball.x;
      const dy = liveCenter.y - ball.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const impulse = randomBetween(105, 180);
      ball.vx = ball.vx * .72 + (dx / length) * impulse + randomBetween(-45, 45);
      ball.vy = ball.vy * .72 + (dy / length) * impulse + randomBetween(-45, 45);
      element.classList.remove('bumped');
      void element.offsetWidth;
      element.classList.add('bumped');
    };
    element.addEventListener('click', bump);
    element.addEventListener('pointerdown', bump);
    return ball;
  }

  function finishGame(won) {
    const game = activeGame;
    if (!game) return;
    activeGame = null;
    cancelAnimationFrame(game.frame);
    const result = document.createElement('div');
    result.className = 'egg-result';
    result.innerHTML = `<span>${won ? 'ANOMALY STABILIZED' : 'THE VOID CLOSED'}</span>`;
    game.root.appendChild(result);
    if (won) {
      writeCompletion().catch((error) => console.warn('[BlackHoleEgg] completion persistence failed', error));
    }
    window.setTimeout(() => {
      game.root.remove();
      setBlackHoleMark(game.mark, false);
    }, won ? 1800 : 1100);
  }

  function startGame(mark) {
    if (activeGame || !mark) return;
    ensureStyles();
    setBlackHoleMark(mark, true);

    const root = document.createElement('div');
    root.id = 'spmt-black-hole-game';
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Black hole anomaly');

    const hud = document.createElement('div');
    hud.className = 'egg-hud';
    hud.innerHTML = '<span>ANOMALY</span><strong>02:00</strong><span class="egg-hint">Click the drifting objects. Feed the void.</span>';
    root.appendChild(hud);

    const voidElement = document.createElement('div');
    voidElement.className = 'egg-void';
    root.appendChild(voidElement);

    const center = blackHoleCenter(mark);
    const balls = Array.from({ length: BALL_COUNT }, (_, index) => makeBall(index, center));
    for (const ball of balls) root.appendChild(ball.element);
    document.body.appendChild(root);

    const game = {
      root,
      mark,
      center,
      voidElement,
      hudTime: hud.querySelector('strong'),
      balls,
      startedAt: performance.now(),
      previousAt: performance.now(),
      frame: 0,
    };
    activeGame = game;

    const animate = (now) => {
      if (activeGame !== game) return;
      const dt = Math.min(.035, Math.max(.001, (now - game.previousAt) / 1000));
      game.previousAt = now;
      game.center = blackHoleCenter(mark);
      game.voidElement.style.left = `${game.center.x}px`;
      game.voidElement.style.top = `${game.center.y}px`;

      const elapsed = now - game.startedAt;
      const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
      const seconds = Math.ceil(remaining / 1000);
      game.hudTime.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      const lateAssist = elapsed > GAME_DURATION_MS * .55 ? clamp((elapsed / GAME_DURATION_MS - .55) * 18, 0, 7) : 0;
      let alive = 0;

      for (const ball of game.balls) {
        if (ball.captured) continue;
        alive += 1;
        const dx = game.center.x - ball.x;
        const dy = game.center.y - ball.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (lateAssist > 0) {
          ball.vx += (dx / distance) * lateAssist * dt * 26;
          ball.vy += (dy / distance) * lateAssist * dt * 26;
        }
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        if (ball.x < 23 || ball.x > window.innerWidth - 23) {
          ball.x = clamp(ball.x, 23, window.innerWidth - 23);
          ball.vx *= -.96;
        }
        if (ball.y < 64 || ball.y > window.innerHeight - 23) {
          ball.y = clamp(ball.y, 64, window.innerHeight - 23);
          ball.vy *= -.96;
        }

        const currentDistance = Math.hypot(game.center.x - ball.x, game.center.y - ball.y);
        if (currentDistance <= CAPTURE_RADIUS) {
          ball.captured = true;
          alive -= 1;
          ball.element.classList.add('captured');
          window.setTimeout(() => ball.element.remove(), 340);
          continue;
        }
        ball.element.style.left = `${ball.x}px`;
        ball.element.style.top = `${ball.y}px`;
      }

      if (alive === 0) return finishGame(true);
      if (remaining <= 0) return finishGame(false);
      game.frame = requestAnimationFrame(animate);
    };
    game.frame = requestAnimationFrame(animate);
  }

  function attachToMark(mark) {
    if (!mark || mark === installedMark) return;
    installedMark = mark;
    mark.style.cursor = 'pointer';
    mark.title = mark.title || 'SPMT';
    mark.addEventListener('click', () => {
      window.clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => flicker(mark), 235);
    });
    mark.addEventListener('dblclick', (event) => {
      event.preventDefault();
      window.clearTimeout(clickTimer);
      startGame(mark);
    });
  }

  function install() {
    ensureStyles();
    const refresh = () => attachToMark(document.querySelector(MARK_SELECTOR));
    refresh();
    new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    scheduleAmbientFlicker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
