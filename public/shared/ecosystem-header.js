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

  const API = 'https://spmt.live/api/presence';
  const SHARE_URL = 'https://spmt.live/live/';
  const CLIENT_KEY = 'spmt.presence.client.v1';
  const HEARTBEAT_MS = 25_000;
  const REFRESH_MS = 10_000;
  const APPS = [
    { id: 'spmt', label: 'SPMT', url: 'https://spmt.live/' },
    { id: 'spacemountain-live', label: 'SPACEMOUNTAIN.LIVE', url: 'https://spacemountain.live/' },
    { id: 'discord-stream-hub', label: 'DSH', url: 'https://discord-stream-hub-new.fly.dev/dashboard' },
    { id: 'streamweaver', label: 'STREAMWEAVER', url: 'https://streamweaver-new.fly.dev/commands' },
    { id: 'hearmeout', label: 'HEARMEOUT', url: 'https://hearmeout-main.fly.dev/' },
    { id: 'chat-tag', label: 'CHATTAG', url: 'https://chat-tag-new.fly.dev/' },
    { id: 'mountainview', label: 'MOUNTAINVIEW', url: 'https://mtman-machine-rotator.fly.dev/mountainview' },
    { id: 'companion', label: 'COMPANION', url: 'https://spmt.live/downloads/companion/windows' },
  ];

  function normalizeName(value) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (!text || text === '-' || /@.+\.[a-z]{2,}$/i.test(text)) return '';
    return text.slice(0, 60);
  }

  function findName(value, depth = 0) {
    if (!value || depth > 5) return '';
    if (typeof value === 'string') return normalizeName(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findName(item, depth + 1);
        if (found) return found;
      }
      return '';
    }
    if (typeof value !== 'object') return '';
    const keys = ['displayName', 'display_name', 'username', 'spmtUsername', 'discordDisplayName', 'discordUsername', 'twitchUsername', 'handle'];
    for (const key of keys) {
      const found = normalizeName(value[key]);
      if (found) return found.replace(/@spmt\.live$/i, '');
    }
    for (const key of ['user', 'session', 'profile', 'identity', 'bridge', 'value']) {
      if (!value[key]) continue;
      const found = findName(value[key], depth + 1);
      if (found) return found;
    }
    return '';
  }

  function readJsonStorage(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; }
  }

  function inferredName() {
    const selectors = ['#signed-in-as', '[data-spmt-user]', '[data-user-name]', '[data-username]'];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const found = normalizeName(node?.getAttribute?.('data-spmt-user') || node?.getAttribute?.('data-user-name') || node?.getAttribute?.('data-username') || node?.textContent);
      if (found) return found.replace(/@spmt\.live$/i, '');
    }
    const keys = [
      'spmt.cache.v1.bridge',
      'spmt.cache.v1.spacemountain.identity',
      'spmt.cache.v1.discord-stream-hub.session',
      'spmt.cache.v1.chat-tag.session',
      'spmt.cache.v1.hearmeout.session',
      'spmtIdentity',
    ];
    for (const key of keys) {
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
  let header = null;
  let chips = null;
  let total = null;

  function installStyle() {
    if (document.getElementById('spmt-ecosystem-header-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-ecosystem-header-style';
    style.textContent = `
      :root{--spmt-ecosystem-header-height:38px}
      #spmt-ecosystem-header{position:fixed;inset:0 0 auto 0;z-index:2147483000;height:var(--spmt-ecosystem-header-height);display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.12);background:rgba(3,5,12,.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 6px 20px rgba(0,0,0,.3);font:800 10px/1.1 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.035em;color:#d7dce8}
      #spmt-ecosystem-header .spmt-eco-brand{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;color:#fff;text-decoration:none;padding:0 3px;font-size:10px;letter-spacing:.08em}.spmt-eco-brand:before{content:"";width:7px;height:7px;border-radius:999px;background:#34d399;box-shadow:0 0 9px #34d399}
      #spmt-ecosystem-header .spmt-eco-chips{display:flex;align-items:center;gap:5px;min-width:0;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:none;flex:1}#spmt-ecosystem-header .spmt-eco-chips::-webkit-scrollbar{display:none}
      #spmt-ecosystem-header .spmt-eco-chip,#spmt-ecosystem-header .spmt-eco-total{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.04);color:#cfd5e2;text-decoration:none;padding:6px 8px;transition:background .15s ease,border-color .15s ease,color .15s ease}#spmt-ecosystem-header .spmt-eco-chip:hover,#spmt-ecosystem-header .spmt-eco-total:hover{background:rgba(255,255,255,.09);color:#fff}
      #spmt-ecosystem-header .spmt-eco-chip[aria-current="page"]{border-color:rgba(249,115,22,.72);background:rgba(249,115,22,.16);color:#fff;box-shadow:0 0 12px rgba(249,115,22,.14)}
      #spmt-ecosystem-header .spmt-eco-count{margin-left:3px;color:#7ee7b7;font-variant-numeric:tabular-nums}#spmt-ecosystem-header .spmt-eco-total{flex:0 0 auto;color:#fff}.spmt-eco-total strong{margin-left:4px;color:#7ee7b7;font-variant-numeric:tabular-nums}
      #spmt-ecosystem-header-spacer{height:var(--spmt-ecosystem-header-height);width:100%;display:block;pointer-events:none;visibility:hidden;flex:0 0 var(--spmt-ecosystem-header-height)}
      @media(max-width:720px){#spmt-ecosystem-header{gap:5px;padding-inline:5px}#spmt-ecosystem-header .spmt-eco-brand{font-size:0}.spmt-eco-brand:after{content:"SPMT";font-size:9px}#spmt-ecosystem-header .spmt-eco-chip{padding-inline:7px}}
    `;
    document.head.append(style);
  }

  function installHeader() {
    if (document.getElementById('spmt-ecosystem-header')) return;
    installStyle();
    header = document.createElement('nav');
    header.id = 'spmt-ecosystem-header';
    header.setAttribute('aria-label', 'SPMT ecosystem navigation and live users');
    const brand = document.createElement('a');
    brand.className = 'spmt-eco-brand';
    brand.href = SHARE_URL;
    brand.textContent = 'ECOSYSTEM LIVE';
    chips = document.createElement('div');
    chips.className = 'spmt-eco-chips';
    total = document.createElement('a');
    total.className = 'spmt-eco-total';
    total.href = SHARE_URL;
    total.title = 'Open the canonical SPMT ecosystem live list';
    total.innerHTML = 'LIVE:<strong>00</strong>';
    header.append(brand, chips, total);

    const spacer = document.createElement('div');
    spacer.id = 'spmt-ecosystem-header-spacer';
    document.body.prepend(spacer);
    document.body.prepend(header);
    renderCounts({});
  }

  function renderCounts(counts, totalActive) {
    if (!chips || !total) return;
    chips.textContent = '';
    APPS.forEach((app) => {
      const link = document.createElement('a');
      link.className = 'spmt-eco-chip';
      link.href = app.url;
      if (app.id === appId) link.setAttribute('aria-current', 'page');
      const label = document.createElement('span');
      label.textContent = `${app.label}:`;
      const count = document.createElement('span');
      count.className = 'spmt-eco-count';
      count.textContent = String(Number(counts?.[app.id] || 0)).padStart(2, '0');
      link.append(label, count);
      chips.append(link);
    });
    total.querySelector('strong').textContent = String(Number(totalActive || 0)).padStart(2, '0');
  }

  async function streamweaverName() {
    if (appId !== 'streamweaver') return '';
    try {
      const response = await fetch('/api/session', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return '';
      return findName(await response.json());
    } catch { return ''; }
  }

  async function heartbeat() {
    if (document.visibilityState === 'hidden') return;
    const displayName = (await streamweaverName()) || inferredName();
    try {
      await fetch(`${API}/heartbeat`, {
        method: 'POST',
        mode: 'cors',
        cache: 'no-store',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appId, clientId: browserId, displayName }),
      });
    } catch {}
  }

  async function refresh() {
    try {
      const response = await fetch(`${API}?detail=0`, { mode: 'cors', cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      renderCounts(data.counts || {}, data.totalActive || 0);
    } catch {}
  }

  installHeader();
  void heartbeat();
  void refresh();
  const heartbeatTimer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS);
  const refreshTimer = window.setInterval(() => void refresh(), REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void heartbeat();
      void refresh();
    }
  });
  window.addEventListener('pagehide', () => {
    window.clearInterval(heartbeatTimer);
    window.clearInterval(refreshTimer);
  }, { once: true });
})();
