(() => {
  'use strict';
  if (window.__spmtOverlayAppCatalogInstalled) return;
  window.__spmtOverlayAppCatalogInstalled = true;

  if (typeof mode !== 'undefined' && mode === 'overlay') return;

  const STREAMWEAVER = 'https://streamweaver-new.fly.dev';
  const CHAT_TAG = 'https://chat-tag-new.fly.dev';
  const HEAR_ME_OUT = 'https://hearmeout-main.fly.dev';

  const catalog = [
    { app: 'StreamWeaver', title: 'Avatar', url: `${STREAMWEAVER}/overlay/avatar?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'BIC Counter', url: `${STREAMWEAVER}/overlay/bic-counter?tenant={tenant}` },
    { app: 'StreamWeaver', title: 'Leaderboard', url: `${STREAMWEAVER}/overlay/leaderboard?tenant={tenant}` },
    { app: 'StreamWeaver', title: 'Featured Shared Chat', url: `${STREAMWEAVER}/overlay/shared-chat-featured?tenant={tenant}` },
    { app: 'StreamWeaver', title: 'Social Overlay', url: `${STREAMWEAVER}/overlay/social?tenant={tenant}` },
    { app: 'StreamWeaver', title: 'Notification', url: `${STREAMWEAVER}/overlay/notification?tenant={tenant}` },
    { app: 'StreamWeaver', title: 'Gamble', url: `${STREAMWEAVER}/overlay/gamble?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Space Mountain Game', url: `${STREAMWEAVER}/overlay/space-mountain?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Classic Gamble', url: `${STREAMWEAVER}/overlay/classic-gamble?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'XPN Overlay', url: `${STREAMWEAVER}/xpn/overlay/{tenant}`, full: true },
    { app: 'StreamWeaver', title: 'BRB Player', url: `${STREAMWEAVER}/brb-player?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Classic Gamble Player', url: `${STREAMWEAVER}/classic-gamble-overlay?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Gamble Player', url: `${STREAMWEAVER}/gamble-overlay?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Gym Battle', url: `${STREAMWEAVER}/gym-battle-overlay?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Partner Check-in', url: `${STREAMWEAVER}/partner-checkin?tenant={tenant}` },
    { app: 'StreamWeaver', title: 'Pokemon Overlay', url: `${STREAMWEAVER}/pokemon-overlay?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Pokemon Collection', url: `${STREAMWEAVER}/pokemon-collection-overlay?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Pokemon Pack', url: `${STREAMWEAVER}/pokemon-pack-overlay?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Pokemon Trade', url: `${STREAMWEAVER}/pokemon-trade-overlay?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'Shoutout Player', url: `${STREAMWEAVER}/shoutout-player?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'TTS Listener', url: `${STREAMWEAVER}/tts-listener?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'TTS Player', url: `${STREAMWEAVER}/tts-player?tenant={tenant}`, full: true },
    { app: 'StreamWeaver', title: 'TTS Player (route)', url: `${STREAMWEAVER}/tts/player?tenant={tenant}`, full: true },
    { app: 'Chat Tag', title: 'Chat Tag Overlay', url: `${CHAT_TAG}/overlay/user_{twitchId}`, full: true, prompt: 'twitchId' },
    { app: 'Chat Tag', title: 'Quackverse Overlay', url: `${CHAT_TAG}/quackverse-overlay?tenant={tenant}&roomId=default`, full: true },
    { app: 'Hear Me Out', title: 'Room Overlay', url: `${HEAR_ME_OUT}/overlay/{roomId}`, full: true, prompt: 'roomId' },
  ];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[char]));
  }

  function currentTenant() {
    return String(window.spmtTenantOutputs?.tenant || '').trim().toLowerCase();
  }

  function nextZ() {
    const widgets = state?.overlay?.widgets || [];
    return widgets.reduce((max, item) => Math.max(max, Number(item.zIndex) || 0), 0) + 1;
  }

  function resolveUrl(entry) {
    let url = String(entry.url || '');
    if (url.includes('{tenant}')) {
      const tenant = currentTenant() || String(prompt('SPMT tenant / username', '') || '').trim().toLowerCase();
      if (!tenant) return '';
      url = url.replaceAll('{tenant}', encodeURIComponent(tenant));
    }
    if (url.includes('{twitchId}')) {
      let twitchId = String(prompt('Twitch numeric user ID for Chat Tag', '') || '').trim();
      twitchId = twitchId.replace(/^user_/i, '');
      if (!/^\d+$/.test(twitchId)) return '';
      url = url.replaceAll('{twitchId}', encodeURIComponent(twitchId));
    }
    if (url.includes('{roomId}')) {
      const roomId = String(prompt('Hear Me Out room ID', '') || '').trim();
      if (!roomId) return '';
      url = url.replaceAll('{roomId}', encodeURIComponent(roomId));
    }
    return url;
  }

  function addEntry(index) {
    const entry = catalog[index];
    if (!entry || !state?.overlay) return;
    const url = resolveUrl(entry);
    if (!url) {
      try { setStatus?.(`${entry.title} was not added because its required ID was not supplied.`, 'error'); } catch {}
      return;
    }

    state.overlay.widgets ??= [];
    const widget = {
      id: `embed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: entry.title,
      kind: 'embed',
      visible: true,
      locked: false,
      interactive: true,
      x: entry.full ? 0 : 8,
      y: entry.full ? 0 : 8,
      width: entry.full ? 960 : 480,
      height: entry.full ? 540 : 270,
      opacity: 1,
      zIndex: nextZ(),
      url,
      sourceApp: entry.app,
      legacyUrl: true,
    };
    state.overlay.widgets.push(widget);
    state.overlayDirty = true;
    try { renderOverlays(); } catch {}
    try { setStatus?.(`${entry.title} added to ${typeof params !== 'undefined' && params.get('output') === 'personal' ? 'Personal' : 'the current'} overlay. Save when ready.`, 'ok'); } catch {}
  }

  function catalogMarkup() {
    const groups = [...new Set(catalog.map((entry) => entry.app))];
    const body = groups.map((group) => {
      const buttons = catalog.map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.app === group)
        .map(({ entry, index }) => `<button type="button" class="button ghost spmt-app-overlay-button" data-app-overlay-index="${index}" title="Adds the existing ${esc(entry.app)} overlay URL as a normal web widget">+ ${esc(entry.title)}</button>`)
        .join('');
      return `<details class="spmt-app-overlay-group" ${group === 'StreamWeaver' ? 'open' : ''}><summary>${esc(group)}</summary><div class="spmt-app-overlay-buttons">${buttons}</div></details>`;
    }).join('');

    return `<section class="spmt-app-overlay-catalog" data-app-overlay-catalog>
      <div class="spmt-app-overlay-head"><div><strong>App overlays</strong><span>One-click wrappers around the existing standalone overlay URLs.</span></div><span class="chip">legacy-safe</span></div>
      <p>Choose an overlay to add it to the currently selected Public or Personal scene. Existing standalone URLs remain unchanged for OBS and advanced users.</p>
      ${body}
    </section>`;
  }

  function installStyles() {
    if (document.getElementById('spmt-app-overlay-catalog-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-app-overlay-catalog-style';
    style.textContent = `
      .spmt-app-overlay-catalog{margin-top:10px;padding:12px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(2,6,18,.28)}
      .spmt-app-overlay-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.spmt-app-overlay-head>div{display:grid;gap:2px}.spmt-app-overlay-head span:not(.chip),.spmt-app-overlay-catalog>p{font-size:11px;color:rgba(226,232,240,.62)}
      .spmt-app-overlay-catalog>p{margin:8px 0 10px;line-height:1.4}.spmt-app-overlay-group{border-top:1px solid rgba(255,255,255,.07);padding-top:8px;margin-top:8px}.spmt-app-overlay-group summary{cursor:pointer;font-size:12px;font-weight:800;color:#e2e8f0}.spmt-app-overlay-buttons{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.spmt-app-overlay-button{font-size:11px!important}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    installStyles();
    if (document.querySelector('[data-app-overlay-catalog]')) return;
    const toolbar = document.querySelector('.obv2-source-toolbar');
    if (!toolbar) return;
    toolbar.insertAdjacentHTML('afterend', catalogMarkup());
    document.querySelectorAll('[data-app-overlay-index]').forEach((button) => {
      button.addEventListener('click', () => addEntry(Number(button.dataset.appOverlayIndex)));
    });
  }

  const observer = new MutationObserver(mount);
  const start = () => {
    mount();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
