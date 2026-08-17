(() => {
  if (window.__spmtWorkspaceControllerInstalled) return;
  if (window.self !== window.top) return;

  const pathname = String(window.location.pathname || '').toLowerCase();
  const params = new URLSearchParams(window.location.search || '');
  if (/(?:^|\/)(?:overlay|browser-source|obs|tenant-output)(?:\/|$)/.test(pathname)) return;
  if (['overlay', 'embed', 'browser-source', 'obs'].includes(String(params.get('mode') || '').toLowerCase())) return;
  if (['personal', 'public'].includes(String(params.get('output') || '').toLowerCase())) return;

  window.__spmtWorkspaceControllerInstalled = true;

  const host = String(window.location.hostname || 'app').toLowerCase();
  const isNativeSpmt = host === 'spmt.live' || host.endsWith('.spmt.live');
  const STORAGE_KEY = `spmt.workspace.controller.v1.${host}`;
  const OPACITY_STEPS = [100, 85, 70, 55, 40];
  const Z_OVERLAY = 2147481000;
  const Z_WORKSPACE = 2147481100;
  const Z_TRAY = 2147481200;
  const Z_CONTROLLER = 2147482990;

  let state = { x: null, y: null, width: null, height: null, opacity: 100, passThrough: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') state = { ...state, ...saved };
  } catch {}

  let panel = null;
  let controller = null;
  let opacityButton = null;
  let passButton = null;
  let dragHandle = null;
  let framePending = false;
  let lastOpenState = null;

  function persist() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function installStyle() {
    if (document.getElementById('spmt-workspace-controller-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-workspace-controller-style';
    style.textContent = `
      [data-canonical-personal-overlay="true"],#spmt-overlay-runtime{z-index:${Z_OVERLAY}!important;pointer-events:none!important}
      aside[data-workspace-footer="true"],#spmt-workspace-tray{z-index:${Z_TRAY}!important}
      #spmt-workspace-tray:not(:has(.spmt-tray-panel)){display:none!important}
      body.spmt-runtime-mounted:not(:has(#spmt-workspace-tray .spmt-tray-panel)) .main{padding-bottom:24px!important}
      .spmt-workspace-managed-panel{z-index:${Z_WORKSPACE}!important}
      #spmt-workspace-tray.spmt-workspace-managed-panel{z-index:${Z_TRAY}!important}
      #spmt-workspace-controller{position:fixed;top:calc(var(--spmt-ecosystem-header-height,40px) + 6px);right:8px;z-index:${Z_CONTROLLER};display:none;align-items:center;gap:5px;padding:5px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(3,5,12,.9);box-shadow:0 10px 28px rgba(0,0,0,.38);backdrop-filter:blur(14px);font:800 9px/1 Inter,ui-sans-serif,system-ui,sans-serif;color:#e7ebf3}
      #spmt-workspace-controller.visible{display:flex}#spmt-workspace-controller button{appearance:none;border:1px solid rgba(255,255,255,.11);border-radius:999px;background:rgba(255,255,255,.045);color:#d9dfeb;padding:6px 8px;font:800 9px/1 inherit;cursor:pointer;white-space:nowrap}#spmt-workspace-controller button:hover{background:rgba(255,255,255,.1);color:#fff}#spmt-workspace-controller .spmt-workspace-drag{cursor:grab;color:#fff;border-color:rgba(249,115,22,.5);background:rgba(249,115,22,.12)}#spmt-workspace-controller button.active{border-color:rgba(52,211,153,.55);background:rgba(52,211,153,.13);color:#a7f3d0}
      @media(max-width:720px){#spmt-workspace-controller{left:6px;right:6px;justify-content:flex-end;overflow-x:auto;border-radius:13px}#spmt-workspace-controller button{padding:6px 7px}}
    `;
    document.head.append(style);
  }

  function findPanel() {
    const nativeTray = document.getElementById('spmt-workspace-tray');
    if (nativeTray instanceof HTMLElement && nativeTray.querySelector('.spmt-tray-panel')) return nativeTray;
    const tray = document.querySelector('aside[data-workspace-footer="true"]');
    if (tray instanceof HTMLElement) {
      const previous = tray.previousElementSibling;
      if (previous instanceof HTMLElement && previous.tagName === 'SECTION' && getComputedStyle(previous).position === 'fixed') return previous;
      return tray;
    }
    const candidates = [...document.querySelectorAll('section')].filter((node) => node instanceof HTMLElement && getComputedStyle(node).position === 'fixed' && (node.className.includes('bottom-[76px]') || node.className.includes('bottom-3')));
    return candidates[candidates.length - 1] || null;
  }

  function emitWorkspaceState(open) {
    if (lastOpenState === open) return;
    lastOpenState = open;
    window.dispatchEvent(new CustomEvent('spmt:workspace-state', { detail: { open } }));
  }

  function installController() {
    if (controller) return;
    installStyle();
    controller = document.createElement('div');
    controller.id = 'spmt-workspace-controller';
    controller.setAttribute('aria-label', 'SPMT workspace window controls');

    dragHandle = document.createElement('button'); dragHandle.type = 'button'; dragHandle.className = 'spmt-workspace-drag'; dragHandle.textContent = 'MOVE';
    opacityButton = document.createElement('button'); opacityButton.type = 'button';
    passButton = document.createElement('button'); passButton.type = 'button';
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'RESET';

    opacityButton.addEventListener('click', () => {
      const current = OPACITY_STEPS.includes(Number(state.opacity)) ? Number(state.opacity) : 100;
      state.opacity = OPACITY_STEPS[(OPACITY_STEPS.indexOf(current) + 1) % OPACITY_STEPS.length];
      persist(); applyPanelState();
    });
    passButton.addEventListener('click', () => { state.passThrough = !state.passThrough; persist(); applyPanelState(); });
    reset.addEventListener('click', () => {
      state = { x: null, y: null, width: null, height: null, opacity: 100, passThrough: false };
      persist();
      if (panel) for (const prop of ['left','top','right','bottom','width','height','margin','transform','opacity','pointer-events']) panel.style.removeProperty(prop);
      applyPanelState();
    });

    dragHandle.addEventListener('pointerdown', (event) => {
      if (!panel || event.button !== 0) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      state.width = rect.width; state.height = rect.height; state.x = rect.left; state.y = rect.top;
      Object.assign(panel.style, { width: `${rect.width}px`, height: `${rect.height}px`, right: 'auto', bottom: 'auto', margin: '0', transform: 'none' });
      dragHandle.setPointerCapture?.(event.pointerId);
      const move = (moveEvent) => {
        const maxX = Math.max(4, window.innerWidth - Number(state.width || rect.width) - 4);
        const maxY = Math.max(42, window.innerHeight - Number(state.height || rect.height) - 70);
        state.x = clamp(moveEvent.clientX - offsetX, 4, maxX); state.y = clamp(moveEvent.clientY - offsetY, 42, maxY);
        panel.style.left = `${state.x}px`; panel.style.top = `${state.y}px`;
      };
      const done = () => { dragHandle.removeEventListener('pointermove', move); dragHandle.removeEventListener('pointerup', done); dragHandle.removeEventListener('pointercancel', done); persist(); };
      dragHandle.addEventListener('pointermove', move); dragHandle.addEventListener('pointerup', done); dragHandle.addEventListener('pointercancel', done);
    });

    controller.append(dragHandle, opacityButton, passButton, reset);
    document.body.append(controller);
  }

  function applyPanelState() {
    document.querySelectorAll('[data-canonical-personal-overlay="true"],#spmt-overlay-runtime').forEach((node) => { if (node instanceof HTMLElement) node.style.setProperty('z-index', String(Z_OVERLAY), 'important'); });
    const nextPanel = findPanel();
    if (nextPanel !== panel) { if (panel) panel.classList.remove('spmt-workspace-managed-panel'); panel = nextPanel; }
    emitWorkspaceState(Boolean(panel));
    if (!panel) { controller?.classList.remove('visible'); return; }

    panel.classList.add('spmt-workspace-managed-panel');
    panel.style.setProperty('z-index', String(panel.id === 'spmt-workspace-tray' ? Z_TRAY : Z_WORKSPACE), 'important');
    panel.style.opacity = String(clamp(Number(state.opacity || 100), 40, 100) / 100);
    panel.style.pointerEvents = state.passThrough ? 'none' : 'auto';
    if (Number.isFinite(Number(state.x)) && Number.isFinite(Number(state.y)) && Number(state.width) > 0 && Number(state.height) > 0) {
      const width = Math.min(Number(state.width), Math.max(240, window.innerWidth - 8));
      const height = Math.min(Number(state.height), Math.max(180, window.innerHeight - 84));
      state.width = width; state.height = height;
      state.x = clamp(Number(state.x), 4, Math.max(4, window.innerWidth - width - 4));
      state.y = clamp(Number(state.y), 42, Math.max(42, window.innerHeight - height - 70));
      Object.assign(panel.style, { left: `${state.x}px`, top: `${state.y}px`, right: 'auto', bottom: 'auto', width: `${width}px`, height: `${height}px`, margin: '0', transform: 'none' });
    }
    opacityButton.textContent = `${Math.round(Number(state.opacity || 100))}%`;
    passButton.textContent = state.passThrough ? 'CLICK THRU ON' : 'CLICK THRU';
    passButton.classList.toggle('active', Boolean(state.passThrough));
    controller.classList.add('visible');
  }

  function scheduleApply() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => { framePending = false; applyPanelState(); });
  }

  async function assignNativeSlot(detail) {
    const url = String(detail?.url || '').trim();
    if (!url) return false;
    try {
      const response = await fetch('/api/workspace-profile', { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return false;
      const data = await response.json();
      const profile = data?.profile;
      if (!profile) return false;
      const slots = Array.isArray(profile.dockSlots) ? profile.dockSlots.map((slot) => ({ ...slot })) : [];
      let target = slots.find((slot) => String(slot.url || '').trim().toLowerCase() === url.toLowerCase());
      if (!target) target = slots.find((slot) => slot.collapsed || !String(slot.url || '').trim()) || slots[0];
      if (!target) return false;
      target.title = String(detail?.title || detail?.appId || 'Workspace app').slice(0, 100);
      target.url = url; target.collapsed = false;
      const etag = response.headers.get('etag') || `"workspace-${profile.revision}"`;
      const update = await fetch('/api/workspace-profile', {
        method: 'PATCH', credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify({ profile: {
          appearance: profile.appearance || {}, dockSlots: slots, activeOverlaySceneId: profile.activeOverlaySceneId ?? null,
          ttsSubscriptions: profile.ttsSubscriptions || [], appThemeMappings: profile.appThemeMappings || {}, savedThemes: profile.savedThemes || [],
        } }),
      });
      if (!update.ok) return false;
      window.dispatchEvent(new CustomEvent('spmt:workspace-refresh'));
      window.setTimeout(() => {
        const workspace = document.querySelector('[data-spmt-tray-workspace]');
        if (workspace instanceof HTMLElement) workspace.click();
        window.setTimeout(() => {
          const slot = document.querySelector(`[data-spmt-tray-slot="${Number(target.id)}"]`);
          if (slot instanceof HTMLElement) slot.click();
        }, 80);
      }, 80);
      return true;
    } catch { return false; }
  }

  if (isNativeSpmt) {
    window.addEventListener('spmt:workspace-toggle', (event) => {
      event.preventDefault();
      const close = document.querySelector('[data-spmt-tray-close]');
      if (close instanceof HTMLElement) close.click();
      else {
        const open = document.querySelector('[data-spmt-tray-workspace],[data-spmt-open-workspace]');
        if (open instanceof HTMLElement) open.click();
      }
      scheduleApply();
    });
    window.addEventListener('spmt:workspace-open-app', (event) => {
      event.preventDefault();
      void assignNativeSlot(event.detail);
    });
  }

  installController(); scheduleApply();
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleApply);
  window.addEventListener('focus', scheduleApply);
})();
