(() => {
  if (window.__spmtShellChromeInstalled) return;
  window.__spmtShellChromeInstalled = true;

  const ASSET_BASE = 'https://spacemountain.live/assets';
  const BRAND_LOGO = `${ASSET_BASE}/space-logo-main.png`;
  const BRAND_MARK = `${ASSET_BASE}/model-rocket.png`;
  const APP_ART = {
    spacemountain: `${ASSET_BASE}/space-logo-header.png`,
    'spacemountain companion': `${ASSET_BASE}/model-rocket.png`,
    'discord stream hub': `${ASSET_BASE}/app-discord-hub.png`,
    streamweaver: `${ASSET_BASE}/app-streamweaver.png`,
    'chat tag + quackverse': `${ASSET_BASE}/app-chat-tag.png`,
    'chat tag': `${ASSET_BASE}/app-chat-tag.png`,
    hearmeout: `${ASSET_BASE}/app-hearmeout.png`,
  };
  const NAV_GLYPHS = {
    dashboard: '⌂', commlink: '✦', messages: '✉', apps: '▦', connections: '⛓',
    docs: '≡', developers: '</>', forums: '◇', settings: '⚙',
  };
  const state = {
    profile: null,
    profileEtag: null,
    overlay: null,
    trayOpen: false,
    trayTarget: { kind: 'workspace', slotId: null },
    loadingRuntime: false,
    lastRuntimeRefreshAt: 0,
  };
  let runtimeSignedIn = false;
  const sessionCache = window.SpmtSessionCache;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[character]);
  }

  function signedIn() {
    const app = document.getElementById('app');
    return Boolean(app && !app.classList.contains('hidden'));
  }

  function signedOut() {
    const auth = document.getElementById('auth');
    return Boolean(auth && !auth.classList.contains('hidden'));
  }

  function displayName() {
    const handle = document.getElementById('signed-in-as')?.textContent?.trim() || '';
    const username = handle.split('@')[0].trim();
    if (!username || username === '-') return 'Captain';
    return username.charAt(0).toUpperCase() + username.slice(1);
  }

  function installStyle() {
    if (document.getElementById('spmt-shell-chrome-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-shell-chrome-style';
    style.textContent = `
      .spmt-brand-mark{overflow:hidden!important;padding:3px!important;background:rgba(3,5,12,.35)!important}
      .spmt-brand-mark img{width:100%;height:100%;object-fit:contain;display:block;filter:drop-shadow(0 0 8px rgba(var(--spmt-accent-rgb,249,115,22),.52))}
      .spmt-welcome-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) minmax(190px,280px);gap:28px;align-items:center;border:1px solid var(--spmt-line);border-radius:var(--spmt-radius,18px);padding:28px;background:linear-gradient(135deg,rgba(var(--spmt-accent-rgb,249,115,22),.12),rgba(5,8,18,.24)),rgba(7,9,20,var(--spmt-surface-glass,.47));backdrop-filter:blur(var(--spmt-blur,22px));box-shadow:0 20px 62px rgba(0,0,0,.3),0 0 calc(24px*var(--spmt-glow,.8)) rgba(var(--spmt-accent-rgb,249,115,22),.1)}
      .spmt-welcome-hero:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 12% 12%,rgba(var(--spmt-accent-rgb,249,115,22),.18),transparent 34%)}
      .spmt-welcome-copy,.spmt-welcome-art{position:relative;z-index:1}
      .spmt-welcome-kicker{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--spmt-line);border-radius:999px;background:rgba(0,0,0,.24);padding:6px 10px;color:#dbe4f4;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
      .spmt-welcome-kicker:before{content:"";width:7px;height:7px;border-radius:999px;background:var(--spmt-accent,#f97316);box-shadow:0 0 10px var(--spmt-accent,#f97316)}
      .spmt-welcome-hero h2{margin:14px 0 0;font-size:clamp(27px,4vw,46px);line-height:1.02;letter-spacing:-.035em}
      .spmt-welcome-hero p{max-width:680px;margin:14px 0 0;color:var(--muted);font-size:14px;line-height:1.65}
      .spmt-welcome-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}
      .spmt-welcome-art{display:grid;place-items:center;min-height:150px}.spmt-welcome-art img{width:min(100%,270px);max-height:170px;object-fit:contain;filter:drop-shadow(0 0 24px rgba(var(--spmt-accent-rgb,249,115,22),.3))}
      .spmt-auth-hero{margin:6px 0 18px}#view-dashboard>.spmt-welcome-hero{grid-column:1/-1}
      .spmt-nav-glyph{display:inline-grid;place-items:center;min-width:22px;font-size:16px;line-height:1;color:var(--spmt-accent,#f97316);font-weight:900}.nav button{display:flex;align-items:center;gap:9px}
      #spmt-sidebar-collapse-toggle{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;margin:-8px 0 10px;padding:7px 8px;border:1px solid var(--spmt-line);border-radius:999px;background:rgba(0,0,0,.2);color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}#spmt-sidebar-collapse-toggle:hover{color:#fff;border-color:var(--spmt-line-strong)}
      body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .sidebar .brand{justify-content:center}body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .sidebar .brand>div:not(.mark),body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .spmt-nav-label{display:none}body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .nav button{justify-content:center;padding-inline:8px}
      body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .sidebar .account .small,body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .sidebar .account strong,body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .sidebar .account .row{display:none}body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .sidebar .account{min-height:42px;padding:8px;background:rgba(var(--spmt-accent-rgb,249,115,22),.08)!important}body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) #spmt-sidebar-collapse-toggle .spmt-collapse-label{display:none}
      .spmt-app-art{height:82px;margin:-2px 0 13px;display:grid;place-items:center;border:1px solid var(--spmt-line);border-radius:min(var(--spmt-radius,18px),16px);background:rgba(0,0,0,.23);overflow:hidden}.spmt-app-art img{width:72px;height:72px;object-fit:contain;filter:drop-shadow(0 0 12px rgba(var(--spmt-accent-rgb,249,115,22),.18))}.spmt-app-art.wide img{width:138px;height:66px}
      #spmt-workspace-tray{position:fixed;left:50%;bottom:12px;z-index:80;width:min(980px,calc(100vw - 24px));transform:translateX(-50%);overflow:hidden;border:1px solid var(--spmt-line);border-radius:18px;background:rgba(5,7,14,.86);backdrop-filter:blur(calc(var(--spmt-blur,22px) + 4px));box-shadow:0 -14px 46px rgba(0,0,0,.42),0 0 22px rgba(var(--spmt-accent-rgb,249,115,22),.1)}
      .spmt-tray-bar{display:flex;align-items:center;gap:8px;min-height:58px;padding:8px 10px}.spmt-tray-workspace,.spmt-tray-slot{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.035);color:#fff}.spmt-tray-workspace{display:flex;align-items:center;gap:8px;flex:0 0 auto;padding:10px 12px;font-size:12px;font-weight:900}.spmt-tray-workspace span:first-child{color:var(--spmt-accent,#f97316);font-size:17px}
      .spmt-tray-slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;min-width:0;flex:1}.spmt-tray-slot{min-width:0;padding:8px 10px;text-align:left}.spmt-tray-slot strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.spmt-tray-slot small{display:block;margin-top:3px;color:#71788a;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.spmt-tray-slot.active,.spmt-tray-workspace.active{border-color:var(--spmt-line-strong);background:rgba(var(--spmt-accent-rgb,249,115,22),.13)}
      .spmt-tray-panel{border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.3)}.spmt-tray-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px}.spmt-tray-panel-head strong{display:block;font-size:12px}.spmt-tray-panel-head small{display:block;margin-top:2px;color:#747b8d;font-size:9px;text-transform:uppercase;font-weight:800}.spmt-tray-panel-actions{display:flex;align-items:center;gap:7px}.spmt-tray-panel-actions a,.spmt-tray-panel-actions button{border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.035);color:#c7ceda;padding:6px 9px;text-decoration:none;font-size:9px;font-weight:800}
      .spmt-tray-frame-wrap{position:relative;height:min(48vh,430px);border-top:1px solid rgba(255,255,255,.08);background:#030408}.spmt-tray-frame-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#030408}.spmt-tray-empty{height:100%;display:grid;place-items:center;padding:20px;color:#737b8e;text-align:center;font-size:12px}body.spmt-runtime-mounted .main{padding-bottom:96px!important}body.spmt-runtime-mounted .commlink-frame{height:calc(100vh - 190px)!important;min-height:520px}
      #spmt-overlay-runtime{position:fixed;inset:0;z-index:48;pointer-events:none;overflow:hidden}.spmt-overlay-widget{position:absolute;overflow:hidden;border-radius:12px;transition:opacity .15s ease;transform-origin:center}.spmt-overlay-widget iframe{width:100%;height:100%;border:0;background:transparent}
      @media(max-width:900px){.spmt-welcome-hero{grid-template-columns:1fr;padding:20px}.spmt-welcome-art{min-height:90px}.spmt-welcome-art img{max-height:110px}.spmt-tray-workspace .spmt-workspace-label{display:none}.spmt-tray-frame-wrap{height:min(52vh,390px)}body.spmt-runtime-mounted .main{padding-bottom:92px!important}}
    `;
    document.head.append(style);
  }

  function enhanceBranding() {
    document.querySelectorAll('.brand .mark').forEach((mark) => {
      if (mark.classList.contains('spmt-brand-mark')) return;
      mark.classList.add('spmt-brand-mark');
      mark.textContent = '';
      const image = document.createElement('img');
      image.src = BRAND_MARK;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      mark.append(image);
    });
  }

  function enhanceNav() {
    document.querySelectorAll('.nav button[data-view]').forEach((button) => {
      if (button.dataset.spmtIconReady === '1') return;
      const view = button.dataset.view || '';
      const label = button.textContent.trim();
      button.textContent = '';
      const icon = document.createElement('span');
      icon.className = 'spmt-nav-glyph';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = NAV_GLYPHS[view] || '•';
      const copy = document.createElement('span');
      copy.className = 'spmt-nav-label';
      copy.textContent = label;
      button.append(icon, copy);
      button.dataset.spmtIconReady = '1';
    });
  }

  function makeHero(kind) {
    const hero = document.createElement('section');
    hero.className = `spmt-welcome-hero ${kind === 'auth' ? 'spmt-auth-hero' : ''}`;
    hero.dataset.spmtHero = kind;
    const name = kind === 'home' ? displayName() : '';
    hero.innerHTML = `
      <div class="spmt-welcome-copy">
        <span class="spmt-welcome-kicker">SPMT · SpaceMountain identity</span>
        <h2>${kind === 'home' ? `Welcome back, ${escapeHtml(name)}.` : 'Welcome to SPMT.'}</h2>
        <p>${kind === 'home'
          ? 'Your identity, apps, Worktray, overlays, messages, and workspace appearance stay connected here and across the SpaceMountain suite.'
          : 'Sign in once to carry the same identity, workspace, apps, messages, Worktray, and overlay setup across the SpaceMountain ecosystem.'}</p>
        <div class="spmt-welcome-actions">
          ${kind === 'home'
            ? '<a class="btn primary" href="https://spacemountain.live">Open SpaceMountain</a><button class="btn" type="button" data-spmt-open-workspace>Open Workspace</button>'
            : '<a class="btn primary" href="#form-login">Sign in below</a><a class="btn" href="https://spacemountain.live">SpaceMountain.live</a>'}
        </div>
      </div>
      <div class="spmt-welcome-art"><img src="${BRAND_LOGO}" alt="SpaceMountain.live" referrerpolicy="no-referrer"></div>`;
    return hero;
  }

  function installHeroes() {
    const auth = document.getElementById('auth');
    if (auth && !auth.querySelector('[data-spmt-hero="auth"]')) {
      const grid = auth.querySelector('.auth-grid');
      if (grid) grid.before(makeHero('auth'));
    }
    const dashboard = document.getElementById('view-dashboard');
    if (dashboard && !dashboard.querySelector('[data-spmt-hero="home"]')) {
      dashboard.prepend(makeHero('home'));
    } else if (dashboard) {
      const heading = dashboard.querySelector('[data-spmt-hero="home"] h2');
      const nextHeading = `Welcome back, ${displayName()}.`;
      if (heading && heading.textContent !== nextHeading) heading.textContent = nextHeading;
    }
  }

  function enhanceAppCards() {
    document.querySelectorAll('#dashboard-apps .app-card, #apps-list .app-card').forEach((card) => {
      if (card.querySelector('.spmt-app-art')) return;
      const name = card.querySelector('h3')?.textContent?.trim().toLowerCase() || '';
      const asset = APP_ART[name];
      if (!asset) return;
      const art = document.createElement('div');
      art.className = `spmt-app-art ${name === 'spacemountain' ? 'wide' : ''}`;
      const image = document.createElement('img');
      image.src = asset;
      image.alt = '';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      art.append(image);
      card.prepend(art);
    });
  }

  function sidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return null;
    let button = document.getElementById('spmt-sidebar-collapse-toggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'spmt-sidebar-collapse-toggle';
      button.type = 'button';
      const brand = sidebar.querySelector('.brand');
      if (brand) brand.after(button);
      button.addEventListener('click', async () => {
        const next = !document.body.classList.contains('spmt-sidebar-collapsed');
        setSidebarCollapsed(next);
        await persistSidebarCollapsed(next);
      });
    }
    const collapsed = document.body.classList.contains('spmt-sidebar-collapsed');
    const visualState = collapsed ? 'collapsed' : 'expanded';
    if (button.dataset.visualState !== visualState) {
      button.dataset.visualState = visualState;
      button.innerHTML = `<span aria-hidden="true">${collapsed ? '›' : '‹'}</span><span class="spmt-collapse-label">${collapsed ? 'Expand' : 'Collapse'}</span>`;
      button.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    return button;
  }

  function setSidebarCollapsed(collapsed) {
    document.body.classList.toggle('spmt-sidebar-collapsed', Boolean(collapsed));
    sidebarToggle();
  }

  async function persistSidebarCollapsed(collapsed) {
    try {
      let profile = state.profile;
      let etag = state.profileEtag;
      if (!profile) {
        const response = await fetch('/api/workspace-profile', { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        profile = data.profile;
        etag = response.headers.get('etag');
      }
      const draft = {
        appearance: { ...profile.appearance, sidebarCollapsed: Boolean(collapsed) },
        dockSlots: profile.dockSlots || [],
        activeOverlaySceneId: profile.activeOverlaySceneId ?? null,
        ttsSubscriptions: profile.ttsSubscriptions || [],
        appThemeMappings: profile.appThemeMappings || {},
        savedThemes: profile.savedThemes || [],
      };
      const response = await fetch('/api/workspace-profile', {
        method: 'PATCH', credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': etag || `"workspace-${profile.revision}"` },
        body: JSON.stringify({ profile: draft }),
      });
      if (!response.ok) return;
      const data = await response.json();
      state.profile = data.profile;
      state.profileEtag = response.headers.get('etag');
      window.dispatchEvent(new CustomEvent('spmt:workspace-refresh'));
    } catch {}
  }

  function removeRuntime() {
    document.getElementById('spmt-workspace-tray')?.remove();
    document.getElementById('spmt-overlay-runtime')?.remove();
    document.body.classList.remove('spmt-runtime-mounted');
  }

  function currentTrayTarget() {
    if (state.trayTarget.kind === 'workspace') {
      return { title: 'Workspace Control Center', subtitle: 'SPMT canonical Worktray', url: '/embed/worktray?mode=dock&app=spmt' };
    }
    const slot = (state.profile?.dockSlots || []).find((item) => Number(item.id) === Number(state.trayTarget.slotId));
    return {
      title: slot?.title || `Slot ${state.trayTarget.slotId || ''}`,
      subtitle: slot?.collapsed ? 'Hidden slot preview' : `Workspace slot ${slot?.id || ''}`,
      url: slot?.url || '',
    };
  }

  function renderWorktray() {
    if (!signedIn() || !state.profile) return;
    document.getElementById('spmt-workspace-tray')?.remove();
    const slots = Array.isArray(state.profile.dockSlots) ? state.profile.dockSlots : [];
    const target = currentTrayTarget();
    const tray = document.createElement('aside');
    tray.id = 'spmt-workspace-tray';
    tray.setAttribute('aria-label', 'SPMT workspace tray');
    tray.innerHTML = `
      <div class="spmt-tray-bar">
        <button type="button" class="spmt-tray-workspace ${state.trayTarget.kind === 'workspace' && state.trayOpen ? 'active' : ''}" data-spmt-tray-workspace><span>▣</span><span class="spmt-workspace-label">Workspace</span></button>
        <div class="spmt-tray-slots">${[1, 2, 3].map((id) => {
          const slot = slots.find((item) => Number(item.id) === id) || { id, title: `Slot ${id}`, url: '', collapsed: true };
          const active = state.trayTarget.kind === 'slot' && Number(state.trayTarget.slotId) === id && state.trayOpen;
          return `<button type="button" class="spmt-tray-slot ${active ? 'active' : ''}" data-spmt-tray-slot="${id}"><strong>${escapeHtml(slot.title || `Slot ${id}`)}</strong><small>${slot.collapsed ? 'Hidden' : `Slot ${id}`}</small></button>`;
        }).join('')}</div>
      </div>
      ${state.trayOpen ? `<div class="spmt-tray-panel"><div class="spmt-tray-panel-head"><div><strong>${escapeHtml(target.title)}</strong><small>${escapeHtml(target.subtitle)}</small></div><div class="spmt-tray-panel-actions">${target.url ? `<a href="${escapeHtml(target.url)}" target="_blank" rel="noreferrer">Pop out</a>` : ''}<button type="button" data-spmt-tray-close>Collapse</button></div></div><div class="spmt-tray-frame-wrap">${target.url ? `<iframe src="${escapeHtml(target.url)}" title="${escapeHtml(target.title)}" allow="autoplay; microphone; camera; fullscreen; clipboard-write"></iframe>` : '<div class="spmt-tray-empty">No URL is assigned to this workspace slot yet.</div>'}</div></div>` : ''}`;
    document.body.append(tray);
    document.body.classList.add('spmt-runtime-mounted');
    tray.querySelector('[data-spmt-tray-workspace]')?.addEventListener('click', () => {
      state.trayTarget = { kind: 'workspace', slotId: null }; state.trayOpen = true; renderWorktray();
    });
    tray.querySelectorAll('[data-spmt-tray-slot]').forEach((button) => button.addEventListener('click', () => {
      state.trayTarget = { kind: 'slot', slotId: Number(button.dataset.spmtTraySlot) }; state.trayOpen = true; renderWorktray();
    }));
    tray.querySelector('[data-spmt-tray-close]')?.addEventListener('click', () => { state.trayOpen = false; renderWorktray(); });
    wireWorkspaceHeroButtons();
  }

  function wireWorkspaceHeroButtons() {
    document.querySelectorAll('[data-spmt-open-workspace]').forEach((button) => {
      if (button.dataset.spmtWorkspaceWired === '1') return;
      button.dataset.spmtWorkspaceWired = '1';
      button.addEventListener('click', () => {
        state.trayTarget = { kind: 'workspace', slotId: null }; state.trayOpen = true; renderWorktray();
      });
    });
  }

  function renderOverlay() {
    document.getElementById('spmt-overlay-runtime')?.remove();
    if (!signedIn() || !state.overlay || state.overlay.enabled === false) return;
    const widgets = Array.isArray(state.overlay.widgets) ? state.overlay.widgets : [];
    const visible = widgets.filter((widget) => widget && (widget.visible !== false || widget.hoverReveal) && widget.url);
    if (!visible.length) return;
    const root = document.createElement('div');
    root.id = 'spmt-overlay-runtime';
    root.setAttribute('aria-label', 'SPMT overlay workspace runtime');
    visible.map((widget, index) => ({ widget, layer: Number.isFinite(Number(widget.zIndex)) ? Number(widget.zIndex) : index + 1 }))
      .sort((a, b) => a.layer - b.layer)
      .forEach(({ widget, layer }) => {
        const section = document.createElement('section');
        section.className = 'spmt-overlay-widget';
        const hiddenUntilHover = widget.visible === false && Boolean(widget.hoverReveal);
        const mode = widget.interactionMode || (widget.interactive ? 'interactive' : 'click-through');
        const opacity = Math.max(0, Math.min(1, Number(widget.opacity ?? 1)));
        section.style.left = `${Number(widget.x || 0)}%`;
        section.style.top = `${Number(widget.y || 0)}%`;
        section.style.width = `min(${Math.max(1, Number(widget.width || 320))}px, 100vw)`;
        section.style.height = `min(${Math.max(1, Number(widget.height || 180))}px, 100vh)`;
        section.style.opacity = hiddenUntilHover ? '0' : String(opacity);
        section.style.zIndex = String(layer);
        section.style.transform = `rotate(${Number(widget.rotation || 0)}deg)`;
        section.style.pointerEvents = hiddenUntilHover || mode !== 'click-through' ? 'auto' : 'none';
        const frame = document.createElement('iframe');
        frame.src = String(widget.url);
        frame.title = String(widget.title || widget.id || 'SPMT overlay');
        frame.allow = 'autoplay; microphone; camera; fullscreen; clipboard-write';
        frame.style.pointerEvents = mode === 'click-through' ? 'none' : 'auto';
        section.append(frame);
        if (hiddenUntilHover) {
          section.addEventListener('pointerenter', () => { section.style.opacity = String(opacity); });
          section.addEventListener('pointerleave', () => { section.style.opacity = '0'; });
        }
        root.append(section);
      });
    document.body.append(root);
  }

  async function loadRuntimeState(force = false) {
    if (!signedIn() || state.loadingRuntime) return;
    const cachedWorkspace = sessionCache?.read('workspace')?.value;
    const cachedOverlay = sessionCache?.read('overlay')?.value;
    if (!state.profile && cachedWorkspace?.profile) {
      state.profile = cachedWorkspace.profile;
      state.profileEtag = cachedWorkspace.etag || null;
      state.overlay = cachedOverlay || { enabled: true, widgets: [], workflows: [] };
      setSidebarCollapsed(Boolean(state.profile?.appearance?.sidebarCollapsed));
      installHeroes();
      renderWorktray();
      renderOverlay();
    }
    if (!force && Date.now() - state.lastRuntimeRefreshAt < 30_000) return;
    state.loadingRuntime = true;
    state.lastRuntimeRefreshAt = Date.now();
    try {
      const [profileResponse, overlayResponse] = await Promise.all([
        fetch('/api/workspace-profile', { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' }),
        fetch('/api/overlay-workspace', { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' }),
      ]);
      if (!profileResponse.ok) return;
      const profileData = await profileResponse.json();
      state.profile = profileData.profile;
      state.profileEtag = profileResponse.headers.get('etag');
      sessionCache?.write('workspace', { profile: state.profile, etag: state.profileEtag });
      if (overlayResponse.ok) {
        const overlayData = await overlayResponse.json();
        state.overlay = overlayData.layout || { enabled: true, widgets: [], workflows: [] };
        sessionCache?.write('overlay', state.overlay);
      } else state.overlay = { enabled: true, widgets: [], workflows: [] };
      setSidebarCollapsed(Boolean(state.profile?.appearance?.sidebarCollapsed));
      installHeroes();
      renderWorktray();
      renderOverlay();
    } catch {} finally {
      state.loadingRuntime = false;
    }
  }

  function enhanceStaticShell() {
    enhanceBranding();
    enhanceNav();
    installHeroes();
    enhanceAppCards();
    sidebarToggle();
    wireWorkspaceHeroButtons();
  }

  function observeShellState() {
    enhanceStaticShell();
    const nowSignedIn = signedIn();
    if (nowSignedIn !== runtimeSignedIn) {
      runtimeSignedIn = nowSignedIn;
      if (runtimeSignedIn) void loadRuntimeState();
      else removeRuntime();
    } else if (!runtimeSignedIn && signedOut()) removeRuntime();
  }

  installStyle();
  runtimeSignedIn = signedIn();
  enhanceStaticShell();
  if (runtimeSignedIn) void loadRuntimeState();

  const observer = new MutationObserver(observeShellState);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  window.addEventListener('focus', () => { if (signedIn()) void loadRuntimeState(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && signedIn()) void loadRuntimeState(); });
  window.addEventListener('spmt:workspace-refresh', () => { if (signedIn()) void loadRuntimeState(true); });
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'spmt.surface.updated') return;
    if (['settings', 'worktray', 'overlays'].includes(event.data.surface)) void loadRuntimeState(true);
  });
})();
