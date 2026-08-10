(() => {
  const THEMES = {
    'solar-flare': { accent: '#F97316', secondary: '#FBBF24', rgb: '249,115,22' },
    'nebula-purple': { accent: '#A855F7', secondary: '#E879F9', rgb: '168,85,247' },
    'oceanic-blue': { accent: '#3B82F6', secondary: '#22D3EE', rgb: '59,130,246' },
    'aurora-green': { accent: '#10B981', secondary: '#A3E635', rgb: '16,185,129' },
  };

  function apply(a) {
    if (!a) return;
    const theme = THEMES[a.themeId] || THEMES['solar-flare'];
    const root = document.documentElement;
    root.dataset.spmtTheme = a.themeId;
    root.dataset.spmtDensity = a.density;
    root.dataset.spmtContrast = a.accessibility?.highContrast ? 'high' : 'standard';
    root.dataset.spmtTabStyle = a.tabStyle;
    root.dataset.spmtTabPosition = a.tabPosition;
    root.style.setProperty('--accent', a.accentColor || theme.accent);
    root.style.setProperty('--accent-rgb', theme.rgb);
    root.style.setProperty('--accent-2', theme.secondary);
    root.style.setProperty('--glow', String((a.glowIntensity ?? 80) / 100));
    root.style.setProperty('--star-opacity', String((a.starDensity ?? 70) / 100));
    root.style.setProperty('--surface-opacity', String((a.glassOpacity ?? 65) / 100));
    root.style.setProperty('--blur', `${a.blurStrength ?? 22}px`);
    root.style.setProperty('--nebula-opacity', String((a.nebulaIntensity ?? 80) / 285));
    root.style.setProperty('--border-opacity', String(Math.max(.05, (a.borderStrength ?? 60) / 400)));
    root.style.setProperty('--chat-opacity', String((a.chatTransparency ?? 65) / 100));
    root.style.setProperty('--radius', ({ sm: '8px', md: '14px', lg: '20px', full: '28px' })[a.cornerRadius] || '14px');
    root.style.setProperty('--canonical-text-scale', String((a.accessibility?.textScale ?? 100) / 100));
    document.body.classList.toggle('density-compact', a.density === 'compact');
    document.body.classList.toggle('density-spacious', a.density === 'spacious');
    document.body.classList.toggle('hide-avatars', !a.showAvatars);
    document.body.classList.toggle('no-motion', a.animation?.enabled === false || a.accessibility?.reduceMotion === true);
    document.body.classList.toggle('rail-right', a.sidebarPosition === 'right');
    document.body.classList.toggle('canonical-rail-hidden', a.sidebarStyle === 'hidden');
    document.body.classList.toggle('canonical-topbar-glass', a.topbarStyle === 'glass');
    document.body.classList.toggle('canonical-no-focus', a.accessibility?.focusHighlight === false);
    const stars = document.querySelector('.stars');
    if (stars) stars.style.display = a.animation?.particles === false ? 'none' : '';
  }

  function installCss() {
    const style = document.createElement('style');
    style.textContent = `
      body{font-size:calc(16px*var(--canonical-text-scale,1))}
      body.canonical-rail-hidden .space-rail{display:none!important}body.canonical-rail-hidden .app-shell{grid-template-columns:1fr!important}
      body.canonical-topbar-glass .topbar{background:rgba(5,7,13,var(--surface-opacity,.65));backdrop-filter:blur(var(--blur,22px))}
      body.canonical-no-focus :focus-visible{outline:none!important}
      #canonical-settings-host{position:fixed;inset:28px 0 0 auto;z-index:100000;width:min(760px,100vw);background:#05070d;border-left:1px solid rgba(255,255,255,.12);box-shadow:-22px 0 70px rgba(0,0,0,.6)}
      #canonical-settings-host iframe{width:100%;height:100%;border:0;background:#05070d}
      #canonical-settings-host .canonical-close{position:absolute;right:10px;top:10px;z-index:2;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#090b10;color:#fff;padding:7px 10px;cursor:pointer}
      @media(max-width:760px){#canonical-settings-host{inset:28px 0 0 0;width:100vw}}
    `;
    document.head.append(style);
  }

  async function refresh() {
    try {
      const response = await fetch('/api/workspace-profile', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      apply(data.profile?.appearance);
    } catch {}
  }

  function openSettings(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('settings-drawer')?.classList.add('hidden');
    let host = document.getElementById('canonical-settings-host');
    if (!host) {
      host = document.createElement('aside');
      host.id = 'canonical-settings-host';
      host.innerHTML = '<button class="canonical-close" type="button" aria-label="Close universal settings">×</button><iframe src="/embed/settings?mode=panel&app=commlink" title="Universal SPMT settings"></iframe>';
      document.body.append(host);
      host.querySelector('.canonical-close').addEventListener('click', () => host.remove());
    }
  }

  installCss();
  refresh();
  document.getElementById('settings-button')?.addEventListener('click', openSettings, true);
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'spmt.surface.updated') return;
    if (event.data.surface === 'settings') refresh();
  });
})();
