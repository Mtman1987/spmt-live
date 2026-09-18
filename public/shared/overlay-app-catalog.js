(() => {
  'use strict';
  if (window.__spmtOverlayAppCatalogInstalled) return;
  window.__spmtOverlayAppCatalogInstalled = true;

  if (typeof mode !== 'undefined' && mode === 'overlay') return;

  const STREAMWEAVER = 'https://streamweaver-new.fly.dev';
  const CHAT_TAG = 'https://chat-tag-new.fly.dev';
  const HEAR_ME_OUT = 'https://hearmeout-main.fly.dev';
  const DSH = 'https://discord-stream-hub-new.fly.dev';
  const DSH_SERVER_ID = '1240832965865635881';

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

  function safeHttpsUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' ? parsed.toString() : '';
    } catch {
      return '';
    }
  }

  function loungeEmbed(id, title, url, {
    x = 0,
    y = 0,
    width = 960,
    height = 540,
    zIndex = 1,
    sourceApp = 'spmt',
    role = '',
  } = {}) {
    return {
      id,
      title,
      kind: 'embed',
      visible: true,
      locked: true,
      interactive: false,
      x,
      y,
      width,
      height,
      opacity: 1,
      zIndex,
      url,
      sourceApp,
      role,
      legacyUrl: true,
    };
  }

  function addCommunityLoungePreset() {
    if (!state?.overlay) return;

    const tenant = currentTenant() || String(prompt('SPMT tenant / username', '') || '').trim().toLowerCase();
    if (!tenant) {
      try { setStatus?.('Community Lounge needs an SPMT tenant.', 'error'); } catch {}
      return;
    }

    const roomId = String(prompt('Hear Me Out room ID (blank skips the media mini-player)', '') || '').trim();
    let twitchId = String(prompt('Twitch numeric user ID for the permanent Chat Tag overlay (blank skips it)', '') || '').trim();
    twitchId = twitchId.replace(/^user_/i, '');

    const nebulaMain = safeHttpsUrl(prompt(
      'NebulaBay MAIN overlay URL. Use NebulaBay\'s Overlay option, not its rotating home screen. Blank skips it.',
      '',
    ));
    const nebulaRain = safeHttpsUrl(prompt(
      'NebulaBay EMOJI RAIN overlay URL. Use a dedicated overlay output so rain can cover the full canvas independently. Blank skips it.',
      '',
    ));

    const replace = confirm('Replace the current scene with the reusable Community Lounge preset?');
    if (!replace) return;

    const encTenant = encodeURIComponent(tenant);
    const widgets = [];

    widgets.push(loungeEmbed(
      'community-lounge-live-spotlight',
      'DSH Live Community Spotlight',
      `${DSH}/headless/community-spotlight?parent=spmt.live&volume=0.58`,
      { zIndex: 0, sourceApp: 'DiscordStreamHub', role: 'community-program' },
    ));

    if (roomId) {
      widgets.push(loungeEmbed(
        'community-lounge-hmo-media',
        'Hear Me Out Media',
        `${HEAR_ME_OUT}/overlay/${encodeURIComponent(roomId)}?media=auto&clean=1&volume=0.58`,
        { x: 68, y: 3, width: 300, height: 169, zIndex: 35, sourceApp: 'Hear Me Out', role: 'media-mini-player' },
      ));
    }

    if (nebulaMain) {
      widgets.push(loungeEmbed(
        'community-lounge-nebula-stage',
        'NebulaBay Game Stage',
        nebulaMain,
        { x: 9, y: 5, width: 787, height: 378, zIndex: 90, sourceApp: 'NebulaBay', role: 'game-stage' },
      ));
    }

    if (nebulaRain) {
      widgets.push(loungeEmbed(
        'community-lounge-emoji-rain',
        'NebulaBay Emoji Rain',
        nebulaRain,
        { zIndex: 220, sourceApp: 'NebulaBay', role: 'full-canvas-effect' },
      ));
    }

    const streamWeaver = [
      ['sw-featured-chat', 'Featured Shared Chat', `${STREAMWEAVER}/overlay/shared-chat-featured?tenant=${encTenant}`, 245],
      ['sw-social', 'Social Overlay', `${STREAMWEAVER}/overlay/social?tenant=${encTenant}`, 246],
      ['sw-notification', 'Notification', `${STREAMWEAVER}/overlay/notification?tenant=${encTenant}`, 247],
      ['sw-partner-checkin', 'Partner Check-in', `${STREAMWEAVER}/partner-checkin?tenant=${encTenant}`, 250],
      ['sw-gamble', 'Gamble', `${STREAMWEAVER}/gamble-overlay?tenant=${encTenant}`, 255],
      ['sw-classic-gamble', 'Classic Gamble', `${STREAMWEAVER}/classic-gamble-overlay?tenant=${encTenant}`, 256],
      ['sw-pokemon', 'Pokemon Overlay', `${STREAMWEAVER}/pokemon-overlay?tenant=${encTenant}`, 260],
      ['sw-pokemon-collection', 'Pokemon Collection', `${STREAMWEAVER}/pokemon-collection-overlay?tenant=${encTenant}`, 261],
      ['sw-pokemon-pack', 'Pokemon Pack', `${STREAMWEAVER}/pokemon-pack-overlay?tenant=${encTenant}`, 262],
      ['sw-pokemon-trade', 'Pokemon Trade', `${STREAMWEAVER}/pokemon-trade-overlay?tenant=${encTenant}`, 263],
      ['sw-shoutout', 'Shoutout Player', `${STREAMWEAVER}/shoutout-player?tenant=${encTenant}`, 270],
    ];
    for (const [id, title, url, zIndex] of streamWeaver) {
      widgets.push(loungeEmbed(id, title, url, { zIndex, sourceApp: 'StreamWeaver', role: 'event-layer' }));
    }

    if (/^\d+$/.test(twitchId)) {
      widgets.push(loungeEmbed(
        'community-lounge-chat-tag',
        'Chat Tag',
        `${CHAT_TAG}/overlay/user_${encodeURIComponent(twitchId)}?cycle=420&hudOn=45&hudOff=120`,
        { x: 67, y: 72, width: 310, height: 145, zIndex: 275, sourceApp: 'NebulaBay', role: 'persistent-chat-tag' },
      ));
    }

    // One canonical StreamWeaver TTS player owns both voice playback and the configured avatar.
    widgets.push(loungeEmbed(
      'community-lounge-stella-tts',
      'Stella / TTS',
      `${STREAMWEAVER}/tts-player?tenant=${encTenant}`,
      { zIndex: 280, sourceApp: 'StreamWeaver', role: 'host-avatar-tts' },
    ));

    widgets.push(loungeEmbed(
      'community-lounge-leaderboard',
      'DSH Community Leaderboard',
      `${DSH}/headless/leaderboard/${DSH_SERVER_ID}?mode=overlay&cycle=1800&show=20&serverName=Space%20Mountain&memberName=Mountaineer&memberNamePlural=Mountaineers`,
      { zIndex: 320, sourceApp: 'DiscordStreamHub', role: 'scheduled-community-leaderboard' },
    ));

    widgets.push(loungeEmbed(
      'community-lounge-brb',
      'BRB Player',
      `${STREAMWEAVER}/brb-player?tenant=${encTenant}`,
      { zIndex: 500, sourceApp: 'StreamWeaver', role: 'full-screen-override' },
    ));

    state.overlay = {
      schemaVersion: 3,
      enabled: true,
      template: 'community-lounge-v1',
      widgets,
      workflows: [],
    };
    state.overlayDirty = true;
    try { renderOverlays(); } catch {}
    try {
      setStatus?.(
        `Community Lounge staged with ${widgets.length} live sources. Bic Counter, StreamWeaver leaderboard, and Gym Battle are intentionally excluded. Save overlay when ready.`,
        'ok',
      );
    } catch {}
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
      <div class="spmt-app-overlay-preset"><button type="button" class="button primary" data-community-lounge-preset>Load Community Lounge preset</button><span>Reusable live-app composition: DSH program + leaderboard, NebulaBay overlays, Hear Me Out media, and StreamWeaver event layers.</span></div>
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
      .spmt-app-overlay-catalog>p{margin:8px 0 10px;line-height:1.4}.spmt-app-overlay-preset{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px;margin:8px 0;border:1px solid rgba(103,232,249,.16);border-radius:12px;background:rgba(103,232,249,.05)}.spmt-app-overlay-preset span{font-size:10px;color:rgba(226,232,240,.6)}.spmt-app-overlay-group{border-top:1px solid rgba(255,255,255,.07);padding-top:8px;margin-top:8px}.spmt-app-overlay-group summary{cursor:pointer;font-size:12px;font-weight:800;color:#e2e8f0}.spmt-app-overlay-buttons{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.spmt-app-overlay-button{font-size:11px!important}
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
    document.querySelector('[data-community-lounge-preset]')?.addEventListener('click', addCommunityLoungePreset);
  }

  const observer = new MutationObserver(mount);
  const start = () => {
    mount();
    observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
