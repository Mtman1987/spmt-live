(() => {
  if (window.__spmtEcosystemHeaderInstalled) return;
  if (window.self !== window.top) return;

  const path = String(window.location.pathname || '').toLowerCase();
  const params = new URLSearchParams(window.location.search || '');
  const hiddenPath = /(?:^|\/)(?:overlay|overlays|browser-source|obs|tenant-output)(?:\/|$)/.test(path);
  const hiddenMode = ['overlay', 'embed', 'browser-source', 'obs'].includes(String(params.get('mode') || '').toLowerCase())
    || ['personal', 'public'].includes(String(params.get('output') || '').toLowerCase());
  if (hiddenPath || hiddenMode) return;

  window.__spmtEcosystemHeaderInstalled = true;

  const PRESENCE_API = 'https://spmt.live/api/presence';
  const LIVE_API = 'https://spmt.live/api/live-community';
  const ECOSYSTEM_URL = 'https://spmt.live/live/';
  const CLIENT_KEY = 'spmt.presence.client.v1';
  const HEARTBEAT_MS = 25_000;
  const REFRESH_MS = 10_000;
  const LIVE_REFRESH_MS = 60_000;
  const APPS = [
    { id: 'spmt', label: 'SPMT', title: 'SPMT', url: 'https://spmt.live/' },
    { id: 'spacemountain-live', label: 'SPACE', title: 'SpaceMountain.live', url: 'https://spacemountain.live/' },
    { id: 'discord-stream-hub', label: 'DSH', title: 'Discord Stream Hub', url: 'https://discord-stream-hub-new.fly.dev/dashboard' },
    { id: 'streamweaver', label: 'STREAMWEAVER', title: 'StreamWeaver', url: 'https://streamweaver-new.fly.dev/commands' },
    { id: 'hearmeout', label: 'HEARMEOUT', title: 'HearMeOut', url: 'https://hearmeout-main.fly.dev/' },
    { id: 'chat-tag', label: 'CHATTAG', title: 'ChatTag', url: 'https://chat-tag-new.fly.dev/' },
    { id: 'mountainview', label: 'MOUNTAINVIEW', title: 'MountainView', url: 'https://mtman-machine-rotator.fly.dev/mountainview' },
    { id: 'companion', label: 'COMPANION', title: 'Companion', url: 'https://spmt.live/downloads/companion/windows' },
  ];

  let header = null;
  let appStrip = null;
  let ecosystemButton = null;
  let workspaceButton = null;
  let liveButton = null;
  let livePanel = null;
  let utcClock = null;
  let localClock = null;
  let workspaceActive = false;
  let liveRows = [];

  function normalizeName(value) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!text || text === '-' || /@.+\.[a-z]{2,}$/i.test(text)) return '';
    return text.slice(0, 60);
  }

  function findName(value, depth = 0) {
    if (!value || depth > 5) return '';
    if (typeof value === 'string') return normalizeName(value);
    if (Array.isArray(value)) {
      for (const item of value) { const found = findName(item, depth + 1); if (found) return found; }
      return '';
    }
    if (typeof value !== 'object') return '';
    for (const key of ['displayName', 'display_name', 'username', 'spmtUsername', 'discordDisplayName', 'discordUsername', 'twitchUsername', 'handle']) {
      const found = normalizeName(value[key]);
      if (found) return found.replace(/@spmt\.live$/i, '');
    }
    for (const key of ['user', 'session', 'profile', 'identity', 'bridge', 'value']) {
      const found = findName(value[key], depth + 1);
      if (found) return found;
    }
    return '';
  }

  function readJsonStorage(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  function inferredName() {
    for (const selector of ['#signed-in-as', '[data-spmt-user]', '[data-user-name]', '[data-username]']) {
      const node = document.querySelector(selector);
      const found = normalizeName(node?.getAttribute?.('data-spmt-user') || node?.getAttribute?.('data-user-name') || node?.getAttribute?.('data-username') || node?.textContent);
      if (found) return found.replace(/@spmt\.live$/i, '');
    }
    for (const key of ['spmt.cache.v1.bridge', 'spmt.cache.v1.spacemountain.identity', 'spmt.cache.v1.discord-stream-hub.session', 'spmt.cache.v1.chat-tag.session', 'spmt.cache.v1.hearmeout.session', 'spmtIdentity']) {
      const found = findName(readJsonStorage(key));
      if (found) return found;
    }
    return 'Guest';
  }

  function detectedAppId() {
    const explicit = String(document.currentScript?.dataset?.app || '').trim().toLowerCase();
    if (APPS.some((app) => app.id === explicit)) return explicit;
    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'spmt.live' || host.endsWith('.spmt.live')) return 'spmt';
    if (host === 'spacemountain.live' || host.endsWith('.spacemountain.live')) return 'spacemountain-live';
    if (host.includes('discord-stream-hub')) return 'discord-stream-hub';
    if (host.includes('streamweaver')) return 'streamweaver';
    if (host.includes('hearmeout')) return 'hearmeout';
    if (host.includes('chat-tag')) return 'chat-tag';
    if (host.includes('mtman-machine-rotator')) return 'mountainview';
    return '';
  }

  function clientId() {
    try {
      const existing = window.localStorage.getItem(CLIENT_KEY);
      if (existing && /^[A-Za-z0-9._:-]{8,96}$/.test(existing)) return existing;
      const generated = (window.crypto?.randomUUID?.() || `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 96);
      window.localStorage.setItem(CLIENT_KEY, generated);
      return generated;
    } catch {
      return `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`.slice(0, 96);
    }
  }

  const appId = detectedAppId();
  if (!appId) return;
  const browserId = clientId();

  function installStyle() {
    if (document.getElementById('spmt-ecosystem-header-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-ecosystem-header-style';
    style.textContent = `
      :root{--spmt-ecosystem-header-height:40px}
      #spmt-ecosystem-header{position:fixed;inset:0 0 auto 0;z-index:2147483000;height:var(--spmt-ecosystem-header-height);display:flex;align-items:center;gap:6px;padding:5px 7px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(3,5,12,.96);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 6px 20px rgba(0,0,0,.3);font:800 9px/1.1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.035em;color:#d7dce8;pointer-events:none}
      #spmt-ecosystem-header button,#spmt-ecosystem-header a{font:inherit;letter-spacing:inherit}
      .spmt-eco-apps{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:none;flex:1;pointer-events:none}.spmt-eco-apps::-webkit-scrollbar{display:none}
      .spmt-eco-chip,.spmt-eco-utility{appearance:none;display:inline-flex;align-items:center;white-space:nowrap;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.04);color:#cfd5e2;text-decoration:none;padding:6px 8px;cursor:pointer;transition:.15s ease;pointer-events:auto}.spmt-eco-chip:hover,.spmt-eco-utility:hover{background:rgba(255,255,255,.1);color:#fff}.spmt-eco-chip[aria-current="page"]{border-color:rgba(249,115,22,.72);background:rgba(249,115,22,.16);color:#fff}
      .spmt-eco-ecosystem{color:#fff;border-color:rgba(52,211,153,.28)}.spmt-eco-ecosystem:before{content:"";width:6px;height:6px;margin-right:5px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399}
      .spmt-eco-count{margin-left:3px;color:#7ee7b7;font-variant-numeric:tabular-nums}.spmt-eco-workspace{border-color:rgba(56,189,248,.28);color:#dff7ff}.spmt-eco-live{border-color:rgba(248,113,113,.34);color:#ffe6e6}.spmt-eco-live .spmt-eco-count{color:#fb7185}
      .spmt-eco-clocks{display:flex;align-items:center;gap:4px;flex:0 0 auto;pointer-events:auto}.spmt-eco-clock{white-space:nowrap;border-left:1px solid rgba(255,255,255,.1);padding-left:7px;color:#aeb7c8;font-variant-numeric:tabular-nums}.spmt-eco-clock strong{color:#fff;font-weight:900}
      #spmt-ecosystem-header-spacer{height:var(--spmt-ecosystem-header-height);width:100%;display:block;pointer-events:none;visibility:hidden;flex:0 0 var(--spmt-ecosystem-header-height)}
      #spmt-live-panel{position:fixed;top:calc(var(--spmt-ecosystem-header-height) + 7px);right:8px;z-index:2147482999;width:min(420px,calc(100vw - 16px));max-height:min(72vh,620px);overflow:auto;border:1px solid rgba(255,255,255,.14);border-radius:15px;background:rgba(4,6,13,.97);box-shadow:0 20px 60px rgba(0,0,0,.55);backdrop-filter:blur(18px);padding:9px;font:700 11px/1.35 Inter,ui-sans-serif,system-ui;color:#d7dce8}
      #spmt-live-panel[hidden]{display:none}.spmt-live-head{display:flex;align-items:center;justify-content:space-between;padding:3px 4px 9px}.spmt-live-head strong{color:#fff;font-size:12px}.spmt-live-head span{color:#778196;font-size:9px}.spmt-live-card{display:grid;grid-template-columns:46px minmax(0,1fr);gap:9px;padding:9px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.035);text-decoration:none;color:inherit;margin-top:6px}.spmt-live-card:hover{background:rgba(255,255,255,.07)}.spmt-live-avatar{width:46px;height:46px;border-radius:10px;object-fit:cover;background:#111827}.spmt-live-name{display:flex;align-items:center;gap:6px;color:#fff;font-weight:900}.spmt-live-platform{font-size:8px;color:#fb7185;border:1px solid rgba(251,113,133,.25);border-radius:999px;padding:2px 5px}.spmt-live-title{margin-top:3px;color:#c7cedb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.spmt-live-meta{margin-top:4px;color:#7f899b;font-size:9px}.spmt-live-empty{padding:22px 10px;text-align:center;color:#778196}
      @media(max-width:940px){.spmt-eco-clocks .spmt-eco-local-label{display:none}.spmt-eco-clock{padding-left:5px}.spmt-eco-chip{padding-inline:7px}}
      @media(max-width:720px){#spmt-ecosystem-header{gap:4px;padding-inline:4px}.spmt-eco-chip,.spmt-eco-utility{padding:6px}.spmt-eco-clocks{display:none}.spmt-eco-ecosystem .spmt-eco-word{display:none}}
    `;
    document.head.append(style);
  }

  function reserveTopForNativeHeaders() {
    const apply = () => {
      const height = header?.getBoundingClientRect().height || 40;
      document.documentElement.style.setProperty('--spmt-ecosystem-header-height', `${Math.ceil(height)}px`);
      document.querySelectorAll('header,nav,[role="banner"]').forEach((node) => {
        if (!(node instanceof HTMLElement) || node === header || header?.contains(node)) return;
        const style = getComputedStyle(node);
        if (!['fixed', 'sticky'].includes(style.position)) return;
        const rect = node.getBoundingClientRect();
        if (rect.height < 18 || rect.height > 180 || rect.top > 6) return;
        if (node.dataset.spmtHeaderOffset === '1') return;
        node.dataset.spmtHeaderOffset = '1';
        node.style.setProperty('top', 'var(--spmt-ecosystem-header-height)', 'important');
      });
      window.dispatchEvent(new CustomEvent('spmt:ecosystem-header-mounted', { detail: { height: Math.ceil(height) } }));
    };
    apply();
    const observer = new MutationObserver(() => requestAnimationFrame(apply));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', apply);
  }

  function formatClock(date, utc) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: utc ? 'UTC' : undefined, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date).replace(',', '');
  }

  function updateClocks() {
    const now = new Date();
    if (utcClock) utcClock.innerHTML = `<strong>${formatClock(now, true)}</strong> UTC`;
    if (localClock) localClock.innerHTML = `<strong>${formatClock(now, false)}</strong> <span class="spmt-eco-local-label">LOCAL</span>`;
  }

  function installHeader() {
    if (document.getElementById('spmt-ecosystem-header')) return;
    installStyle();
    header = document.createElement('nav');
    header.id = 'spmt-ecosystem-header';
    header.setAttribute('aria-label', 'SpaceMountain ecosystem controls');

    ecosystemButton = document.createElement('a');
    ecosystemButton.className = 'spmt-eco-utility spmt-eco-ecosystem';
    ecosystemButton.href = ECOSYSTEM_URL;
    ecosystemButton.title = 'See who is using which ecosystem app';
    ecosystemButton.innerHTML = '<span class="spmt-eco-word">ECOSYSTEM:</span><span class="spmt-eco-count">00</span>';

    appStrip = document.createElement('div');
    appStrip.className = 'spmt-eco-apps';

    workspaceButton = document.createElement('button');
    workspaceButton.type = 'button';
    workspaceButton.className = 'spmt-eco-utility spmt-eco-workspace';
    workspaceButton.innerHTML = 'WORKSPACE:<span class="spmt-eco-count">00</span>';
    workspaceButton.title = 'Open or collapse the shared three-slot Workspace';
    workspaceButton.addEventListener('click', () => {
      const event = new CustomEvent('spmt:workspace-toggle', { cancelable: true, detail: { source: 'ecosystem-header' } });
      window.dispatchEvent(event);
      if (!event.defaultPrevented) {
        const nativeButton = document.querySelector('[data-spmt-tray-workspace],[data-spmt-open-workspace]');
        if (nativeButton instanceof HTMLElement) nativeButton.click();
        else window.location.href = 'https://spmt.live/';
      }
    });

    liveButton = document.createElement('button');
    liveButton.type = 'button';
    liveButton.className = 'spmt-eco-utility spmt-eco-live';
    liveButton.innerHTML = 'LIVE:<span class="spmt-eco-count">00</span>';
    liveButton.title = 'Community members currently live';
    liveButton.addEventListener('click', () => { livePanel.hidden = !livePanel.hidden; });

    const clocks = document.createElement('div');
    clocks.className = 'spmt-eco-clocks';
    utcClock = document.createElement('span'); utcClock.className = 'spmt-eco-clock';
    localClock = document.createElement('span'); localClock.className = 'spmt-eco-clock';
    clocks.append(utcClock, localClock);

    header.append(ecosystemButton, appStrip, workspaceButton, liveButton, clocks);
    const spacer = document.createElement('div'); spacer.id = 'spmt-ecosystem-header-spacer';
    document.body.prepend(spacer); document.body.prepend(header);

    livePanel = document.createElement('section'); livePanel.id = 'spmt-live-panel'; livePanel.hidden = true; livePanel.setAttribute('aria-label', 'Community live streams');
    document.body.append(livePanel);
    document.addEventListener('pointerdown', (event) => {
      if (!livePanel.hidden && !livePanel.contains(event.target) && !liveButton.contains(event.target)) livePanel.hidden = true;
    });
    renderApps({}); updateClocks(); reserveTopForNativeHeaders();
  }

  function openApp(app, mouseEvent) {
    if (mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.shiftKey || mouseEvent.altKey) {
      window.open(app.url, '_blank', 'noopener,noreferrer'); return;
    }
    const event = new CustomEvent('spmt:workspace-open-app', {
      cancelable: true,
      detail: { appId: app.id, title: app.title, url: app.url, popoutUrl: app.url, source: 'ecosystem-header' },
    });
    window.dispatchEvent(event);
    if (!event.defaultPrevented) window.location.href = app.url;
  }

  function renderApps(counts) {
    if (!appStrip) return;
    appStrip.textContent = '';
    APPS.forEach((app) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'spmt-eco-chip';
      if (app.id === appId) button.setAttribute('aria-current', 'page');
      button.innerHTML = `${app.label}:<span class="spmt-eco-count">${String(Number(counts?.[app.id] || 0)).padStart(2, '0')}</span>`;
      button.title = `Open ${app.title} in Workspace (Ctrl/Cmd-click opens separately)`;
      button.addEventListener('click', (event) => openApp(app, event));
      appStrip.append(button);
    });
  }

  function renderLive() {
    if (!livePanel || !liveButton) return;
    liveButton.querySelector('.spmt-eco-count').textContent = String(liveRows.length).padStart(2, '0');
    livePanel.textContent = '';
    const head = document.createElement('div'); head.className = 'spmt-live-head'; head.innerHTML = `<strong>Community Live</strong><span>DSH shoutout feed</span>`; livePanel.append(head);
    if (!liveRows.length) { const empty = document.createElement('div'); empty.className = 'spmt-live-empty'; empty.textContent = 'Nobody in the connected community is live right now.'; livePanel.append(empty); return; }
    liveRows.forEach((row) => {
      const link = document.createElement('a'); link.className = 'spmt-live-card'; link.href = row.streamUrl || '#'; link.target = '_blank'; link.rel = 'noreferrer';
      const avatar = document.createElement('img'); avatar.className = 'spmt-live-avatar'; avatar.src = row.avatarUrl || row.bannerUrl || row.imageUrl || 'https://spacemountain.live/assets/model-rocket.png'; avatar.alt = '';
      const body = document.createElement('div');
      const platform = String(row.platform || (row.twitchLogin ? 'Twitch' : 'Live')).toUpperCase();
      const name = document.createElement('div'); name.className = 'spmt-live-name'; name.textContent = row.displayName || row.twitchLogin || 'Live creator';
      const badge = document.createElement('span'); badge.className = 'spmt-live-platform'; badge.textContent = platform; name.append(badge);
      const title = document.createElement('div'); title.className = 'spmt-live-title'; title.textContent = row.title || row.gameName || 'Live now';
      const meta = document.createElement('div'); meta.className = 'spmt-live-meta'; meta.textContent = `${row.gameName || row.groupName || 'Community'} · ${Number(row.viewerCount || 0).toLocaleString()} viewers`;
      body.append(name, title, meta); link.append(avatar, body); livePanel.append(link);
    });
  }

  async function heartbeat() {
    if (document.visibilityState === 'hidden') return;
    try {
      await fetch(`${PRESENCE_API}/heartbeat`, {
        method: 'POST', mode: 'cors', cache: 'no-store', keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appId, clientId: browserId, displayName: inferredName(), workspaceActive }),
      });
    } catch {}
  }

  async function refreshPresence() {
    try {
      const response = await fetch(`${PRESENCE_API}?detail=0`, { mode: 'cors', cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      renderApps(data.counts || {});
      ecosystemButton.querySelector('.spmt-eco-count').textContent = String(Number(data.totalActive || 0)).padStart(2, '0');
      workspaceButton.querySelector('.spmt-eco-count').textContent = String(Number(data.workspaceActive || 0)).padStart(2, '0');
    } catch {}
  }

  async function refreshLive() {
    try {
      const response = await fetch(LIVE_API, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      liveRows = (Array.isArray(data?.shoutouts) ? data.shoutouts : []).filter((row) => row && row.isLive).slice(0, 24);
      renderLive();
    } catch {}
  }

  window.addEventListener('spmt:workspace-state', (event) => {
    const next = Boolean(event.detail?.open);
    if (workspaceActive === next) return;
    workspaceActive = next;
    void heartbeat(); void refreshPresence();
  });

  installHeader();
  void heartbeat(); void refreshPresence(); void refreshLive();
  const heartbeatTimer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS);
  const refreshTimer = window.setInterval(() => void refreshPresence(), REFRESH_MS);
  const liveTimer = window.setInterval(() => void refreshLive(), LIVE_REFRESH_MS);
  const clockTimer = window.setInterval(updateClocks, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { void heartbeat(); void refreshPresence(); void refreshLive(); updateClocks(); }
  });
  window.addEventListener('pagehide', () => {
    window.clearInterval(heartbeatTimer); window.clearInterval(refreshTimer); window.clearInterval(liveTimer); window.clearInterval(clockTimer);
  }, { once: true });
})();
