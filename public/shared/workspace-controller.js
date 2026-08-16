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

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function installStyle() {
    if (document.getElementById('spmt-workspace-controller-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-workspace-controller-style';
    style.textContent = `
      [data-canonical-personal-overlay="true"],#spmt-overlay-runtime{z-index:${Z_OVERLAY}!important;pointer-events:none!important}
      aside[data-workspace-footer="true"],#spmt-workspace-tray{z-index:${Z_TRAY}!important}
      .spmt-workspace-managed-panel{z-index:${Z_WORKSPACE}!important}
      #spmt-workspace-tray.spmt-workspace-managed-panel{z-index:${Z_TRAY}!important}
      #spmt-workspace-controller{position:fixed;top:calc(var(--spmt-ecosystem-header-height,38px) + 6px);right:8px;z-index:${Z_CONTROLLER};display:none;align-items:center;gap:5px;padding:5px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(3,5,12,.9);box-shadow:0 10px 28px rgba(0,0,0,.38);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font:800 9px/1 Inter,ui-sans-serif,system-ui,sans-serif;color:#e7ebf3}
      #spmt-workspace-controller.visible{display:flex}
      #spmt-workspace-controller button{appearance:none;border:1px solid rgba(255,255,255,.11);border-radius:999px;background:rgba(255,255,255,.045);color:#d9dfeb;padding:6px 8px;font:800 9px/1 inherit;letter-spacing:.035em;cursor:pointer;white-space:nowrap}
      #spmt-workspace-controller button:hover{background:rgba(255,255,255,.1);color:#fff}
      #spmt-workspace-controller .spmt-workspace-drag{cursor:grab;color:#fff;border-color:rgba(249,115,22,.5);background:rgba(249,115,22,.12)}
      #spmt-workspace-controller .spmt-workspace-drag:active{cursor:grabbing}
      #spmt-workspace-controller button.active{border-color:rgba(52,211,153,.55);background:rgba(52,211,153,.13);color:#a7f3d0}
      @media(max-width:720px){#spmt-workspace-controller{left:6px;right:6px;justify-content:flex-end;overflow-x:auto;border-radius:13px}#spmt-workspace-controller button{padding:6px 7px}}
    `;
    document.head.append(style);
  }

  function installController() {
    if (controller) return;
    installStyle();
    controller = document.createElement('div');
    controller.id = 'spmt-workspace-controller';
    controller.setAttribute('aria-label', 'SPMT workspace window controls');

    dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'spmt-workspace-drag';
    dragHandle.textContent = 'MOVE';
    dragHandle.title = 'Drag to move the open Workspace panel';

    opacityButton = document.createElement('button');
    opacityButton.type = 'button';
    opacityButton.title = 'Cycle Workspace transparency';

    passButton = document.createElement('button');
    passButton.type = 'button';
    passButton.title = 'Let clicks pass through the Workspace panel';
    passButton.addEventListener('click', () => {
      state.passThrough = !state.passThrough;
      persist();
      applyPanelState();
    });

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'RESET';
    reset.title = 'Reset Workspace position, opacity, and click-through';
    reset.addEventListener('click', () => {
      state = { x: null, y: null, width: null, height: null, opacity: 100, passThrough: false };
      persist();
      if (panel) {
        panel.style.removeProperty('left');
        panel.style.removeProperty('top');
        panel.style.removeProperty('right');
        panel.style.removeProperty('bottom');
        panel.style.removeProperty('width');
        panel.style.removeProperty('height');
        panel.style.removeProperty('margin');
        panel.style.removeProperty('transform');
        panel.style.removeProperty('opacity');
        panel.style.removeProperty('pointer-events');
      }
      applyPanelState();
    });

    opacityButton.addEventListener('click', () => {
      const current = OPACITY_STEPS.includes(Number(state.opacity)) ? Number(state.opacity) : 100;
      state.opacity = OPACITY_STEPS[(OPACITY_STEPS.indexOf(current) + 1) % OPACITY_STEPS.length];
      persist();
      applyPanelState();
    });

    dragHandle.addEventListener('pointerdown', (event) => {
      if (!panel || event.button !== 0) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      state.width = rect.width;
      state.height = rect.height;
      state.x = rect.left;
      state.y = rect.top;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.margin = '0';
      panel.style.transform = 'none';
      dragHandle.setPointerCapture?.(event.pointerId);

      const move = (moveEvent) => {
        const maxX = Math.max(4, window.innerWidth - Number(state.width || rect.width) - 4);
        const maxY = Math.max(42, window.innerHeight - Number(state.height || rect.height) - 70);
        state.x = clamp(moveEvent.clientX - offsetX, 4, maxX);
        state.y = clamp(moveEvent.clientY - offsetY, 42, maxY);
        panel.style.left = `${state.x}px`;
        panel.style.top = `${state.y}px`;
      };
      const done = () => {
        dragHandle.removeEventListener('pointermove', move);
        dragHandle.removeEventListener('pointerup', done);
        dragHandle.removeEventListener('pointercancel', done);
        persist();
      };
      dragHandle.addEventListener('pointermove', move);
      dragHandle.addEventListener('pointerup', done);
      dragHandle.addEventListener('pointercancel', done);
    });

    controller.append(dragHandle, opacityButton, passButton, reset);
    document.body.append(controller);
  }

  function findPanel() {
    const nativeTray = document.getElementById('spmt-workspace-tray');
    if (nativeTray instanceof HTMLElement) {
      nativeTray.style.setProperty('z-index', String(Z_TRAY), 'important');
      if (nativeTray.querySelector('.spmt-tray-panel')) return nativeTray;
    }

    const tray = document.querySelector('aside[data-workspace-footer="true"]');
    if (tray instanceof HTMLElement) {
      tray.style.setProperty('z-index', String(Z_TRAY), 'important');
      const previous = tray.previousElementSibling;
      if (previous instanceof HTMLElement && previous.tagName === 'SECTION' && getComputedStyle(previous).position === 'fixed') return previous;
    }

    const candidates = [...document.querySelectorAll('section')].filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (getComputedStyle(node).position !== 'fixed') return false;
      return node.classList.contains('bottom-[76px]') || node.className.includes('bottom-[76px]');
    });
    return candidates[candidates.length - 1] || null;
  }

  function applyPanelState() {
    document.querySelectorAll('[data-canonical-personal-overlay="true"],#spmt-overlay-runtime').forEach((node) => {
      if (node instanceof HTMLElement) node.style.setProperty('z-index', String(Z_OVERLAY), 'important');
    });
    document.querySelectorAll('aside[data-workspace-footer="true"],#spmt-workspace-tray').forEach((node) => {
      if (node instanceof HTMLElement) node.style.setProperty('z-index', String(Z_TRAY), 'important');
    });

    const nextPanel = findPanel();
    if (nextPanel !== panel) {
      if (panel) panel.classList.remove('spmt-workspace-managed-panel');
      panel = nextPanel;
    }
    if (!panel) {
      controller?.classList.remove('visible');
      return;
    }

    panel.classList.add('spmt-workspace-managed-panel');
    panel.style.setProperty('z-index', String(panel.id === 'spmt-workspace-tray' ? Z_TRAY : Z_WORKSPACE), 'important');
    panel.style.opacity = String(clamp(Number(state.opacity || 100), 40, 100) / 100);
    panel.style.pointerEvents = state.passThrough ? 'none' : 'auto';

    if (Number.isFinite(Number(state.x)) && Number.isFinite(Number(state.y)) && Number(state.width) > 0 && Number(state.height) > 0) {
      const width = Math.min(Number(state.width), Math.max(240, window.innerWidth - 8));
      const height = Math.min(Number(state.height), Math.max(180, window.innerHeight - 84));
      state.width = width;
      state.height = height;
      state.x = clamp(Number(state.x), 4, Math.max(4, window.innerWidth - width - 4));
      state.y = clamp(Number(state.y), 42, Math.max(42, window.innerHeight - height - 70));
      panel.style.left = `${state.x}px`;
      panel.style.top = `${state.y}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.margin = '0';
      panel.style.transform = 'none';
    }

    opacityButton.textContent = `${Math.round(Number(state.opacity || 100))}%`;
    passButton.textContent = state.passThrough ? 'CLICK THRU ON' : 'CLICK THRU';
    passButton.classList.toggle('active', Boolean(state.passThrough));
    controller.classList.add('visible');
  }

  function scheduleApply() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      applyPanelState();
    });
  }

  installController();
  scheduleApply();
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleApply);
  window.addEventListener('focus', scheduleApply);
})();
