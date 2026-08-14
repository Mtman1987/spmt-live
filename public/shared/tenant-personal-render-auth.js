(() => {
  'use strict';
  const parts = location.pathname.split('/').filter(Boolean);
  const tenant = decodeURIComponent(parts[1] || '').toLowerCase();
  const output = parts[2] === 'personal' ? 'personal' : 'public';
  if (!tenant || output !== 'personal') return;

  const TRANSPARENCY_STYLE_ID = 'spmt-personal-renderer-transparency';
  const installTransparencyContract = () => {
    if (document.head && !document.getElementById(TRANSPARENCY_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = TRANSPARENCY_STYLE_ID;
      style.textContent = 'html,body,#stage-wrap{background:transparent!important;background-color:transparent!important;background-image:none!important;}';
      document.head.appendChild(style);
    }

    for (const element of [document.documentElement, document.body, document.getElementById('stage-wrap')]) {
      if (!element) continue;
      element.style.setProperty('background', 'transparent', 'important');
      element.style.setProperty('background-color', 'transparent', 'important');
      element.style.setProperty('background-image', 'none', 'important');
    }
  };

  installTransparencyContract();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installTransparencyContract, { once: true });
  }
  window.addEventListener('load', installTransparencyContract, { once: true });

  const storageKey = `spmt.personal-render-key:${tenant}`;
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const fragmentKey = String(hash.get('render') || '').trim();
  if (fragmentKey) {
    try { sessionStorage.setItem(storageKey, fragmentKey); } catch {}
    try { history.replaceState(null, '', `${location.pathname}${location.search}`); } catch {}
  }
  let renderKey = fragmentKey;
  if (!renderKey) {
    try { renderKey = String(sessionStorage.getItem(storageKey) || '').trim(); } catch {}
  }
  if (!renderKey) return;

  window.__spmtPersonalRenderKey = renderKey;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      const raw = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
      const url = new URL(raw, location.href);
      const personalScenePath = `/api/tenant/${encodeURIComponent(tenant)}/personal`;
      const alertPath = `/api/tenant/${encodeURIComponent(tenant)}/alerts`;
      if (url.origin === location.origin && (url.pathname === personalScenePath || url.pathname === alertPath)) {
        const headers = new Headers(init.headers || (typeof input === 'object' ? input.headers : undefined) || {});
        headers.set('x-spmt-render-key', renderKey);
        return originalFetch(input, { ...init, headers });
      }
    } catch {}
    return originalFetch(input, init);
  };

  const applyLocalOpacity = (value) => {
    const numeric = Number(value);
    const opacity = Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 1;
    const scene = document.getElementById('scene');
    if (scene) {
      scene.style.opacity = String(opacity);
      scene.dataset.localPersonalOpacity = String(Math.round(opacity * 100));
    }
    installTransparencyContract();
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    if (event.data?.type !== 'spmt.personal.local-opacity') return;
    applyLocalOpacity(event.data.opacity);
  });
})();