(() => {
  const THEMES = {
    'solar-flare': { accent: '#F97316', secondary: '#FBBF24', rgb: '249,115,22' },
    'nebula-purple': { accent: '#A855F7', secondary: '#E879F9', rgb: '168,85,247' },
    'oceanic-blue': { accent: '#3B82F6', secondary: '#22D3EE', rgb: '59,130,246' },
    'aurora-green': { accent: '#10B981', secondary: '#A3E635', rgb: '16,185,129' },
  };

  function apply(appearance) {
    if (!appearance) return;
    const theme = THEMES[appearance.themeId] || THEMES['solar-flare'];
    const accent = appearance.accentColor || theme.accent;
    const root = document.documentElement;
    root.dataset.spmtTheme = appearance.themeId;
    root.dataset.spmtDensity = appearance.density;
    root.dataset.spmtContrast = appearance.accessibility?.highContrast ? 'high' : 'standard';
    root.style.setProperty('--orange', accent);
    root.style.setProperty('--blue', theme.secondary);
    root.style.setProperty('--spmt-accent', accent);
    root.style.setProperty('--spmt-secondary', theme.secondary);
    root.style.setProperty('--spmt-accent-rgb', theme.rgb);
    root.style.setProperty('--spmt-glow', String((appearance.glowIntensity ?? 80) / 100));
    root.style.setProperty('--spmt-glass', String((appearance.glassOpacity ?? 65) / 100));
    root.style.setProperty('--spmt-blur', `${appearance.blurStrength ?? 22}px`);
    root.style.setProperty('--spmt-radius', ({ sm: '9px', md: '14px', lg: '20px', full: '30px' })[appearance.cornerRadius] || '14px');
    root.style.setProperty('--spmt-chat-opacity', String((appearance.chatTransparency ?? 65) / 100));
    root.style.setProperty('--spmt-text-scale', String((appearance.accessibility?.textScale ?? 100) / 100));
    document.body.classList.toggle('spmt-reduce-motion', Boolean(appearance.accessibility?.reduceMotion) || appearance.animation?.enabled === false);
    document.body.classList.toggle('spmt-sidebar-right', appearance.sidebarPosition === 'right');
    document.body.classList.toggle('spmt-sidebar-hidden', appearance.sidebarStyle === 'hidden');
    document.body.classList.toggle('spmt-density-compact', appearance.density === 'compact');
    document.body.classList.toggle('spmt-density-spacious', appearance.density === 'spacious');
  }

  function installStyle() {
    if (document.getElementById('spmt-canonical-theme-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-canonical-theme-style';
    style.textContent = `
      body{font-size:calc(16px*var(--spmt-text-scale,1));background:radial-gradient(circle at 16% 8%,rgba(var(--spmt-accent-rgb,249,115,22),.16),transparent 34rem),radial-gradient(circle at 88% 78%,color-mix(in srgb,var(--spmt-secondary,#fbbf24) 11%,transparent),transparent 32rem),#05070d!important}
      .sidebar{background:rgba(7,9,16,var(--spmt-glass,.65))!important;backdrop-filter:blur(var(--spmt-blur,22px))!important}
      .card,.account,.item,.modal-card{border-radius:var(--spmt-radius,14px)!important;backdrop-filter:blur(var(--spmt-blur,22px))!important;background-color:rgba(12,15,25,var(--spmt-glass,.65))!important}
      .mark{box-shadow:0 0 calc(28px*var(--spmt-glow,.8)) color-mix(in srgb,var(--spmt-accent,#f97316) 45%,transparent)!important}
      .btn.primary{background:linear-gradient(135deg,var(--spmt-accent,#f97316),var(--spmt-secondary,#fbbf24))!important;color:#050608!important}
      .nav button.active,.nav button:hover{border-color:color-mix(in srgb,var(--spmt-accent,#f97316) 25%,transparent)!important;background:color-mix(in srgb,var(--spmt-accent,#f97316) 10%,transparent)!important}
      body.spmt-sidebar-right .shell{grid-template-columns:minmax(0,1fr) 260px}body.spmt-sidebar-right .sidebar{grid-column:2;grid-row:1}body.spmt-sidebar-right .main{grid-column:1;grid-row:1}
      body.spmt-sidebar-hidden .shell{grid-template-columns:1fr}body.spmt-sidebar-hidden .sidebar{display:none}
      body.spmt-density-compact .main{padding:14px}body.spmt-density-spacious .main{padding:30px}
      body.spmt-reduce-motion *,body.spmt-reduce-motion *:before,body.spmt-reduce-motion *:after{animation:none!important;transition:none!important}
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

  installStyle();
  refresh();
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'spmt.surface.updated' && event.data?.surface === 'settings') refresh();
  });
  window.addEventListener('spmt:workspace-refresh', refresh);
})();
