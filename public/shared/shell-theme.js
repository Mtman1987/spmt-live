(() => {
  const THEMES = {
    'solar-flare': {
      accent: '#F97316', secondary: '#FBBF24',
      backgroundImage: 'https://spacemountain.live/assets/theme-solar-flare-background.webp',
    },
    'nebula-purple': {
      accent: '#A855F7', secondary: '#E879F9',
      backgroundImage: 'https://spacemountain.live/assets/theme-nebula-purple-background.webp',
    },
    'oceanic-blue': {
      accent: '#3B82F6', secondary: '#22D3EE',
      backgroundImage: 'https://spacemountain.live/assets/theme-oceanic-blue-background.webp',
    },
    'aurora-green': {
      accent: '#10B981', secondary: '#A3E635',
      backgroundImage: 'https://spacemountain.live/assets/theme-aurora-green-background.webp',
    },
  };

  function rgbFromHex(hex) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 249, g: 115, b: 22 };
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  function saturateHex(hex, saturationPercent = 100) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
    const max = Math.max(...channels);
    const min = Math.min(...channels);
    const lightness = (max + min) / 2;
    if (max === min) return `#${value.toUpperCase()}`;
    const delta = max - min;
    let saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue = 0;
    if (max === channels[0]) hue = (channels[1] - channels[2]) / delta + (channels[1] < channels[2] ? 6 : 0);
    else if (max === channels[1]) hue = (channels[2] - channels[0]) / delta + 2;
    else hue = (channels[0] - channels[1]) / delta + 4;
    hue /= 6;
    saturation *= Math.max(0, Math.min(1.5, Number(saturationPercent || 100) / 100));
    saturation = Math.min(1, saturation);
    const hueToRgb = (p, q, tValue) => {
      let t = tValue;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    return `#${[hueToRgb(p, q, hue + 1 / 3), hueToRgb(p, q, hue), hueToRgb(p, q, hue - 1 / 3)]
      .map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0'))
      .join('')}`.toUpperCase();
  }

  function textScale(value) {
    if (Number.isFinite(Number(value))) return Math.max(0.8, Math.min(1.4, Number(value) / 100));
    return value === 'sm' ? 0.92 : value === 'lg' ? 1.08 : 1;
  }

  function toggleBodyClass(name, enabled) {
    document.body.classList.toggle(name, Boolean(enabled));
  }

  function apply(appearance) {
    if (!appearance) return;
    const theme = THEMES[appearance.themeId] || THEMES['solar-flare'];
    const accent = saturateHex(appearance.accentColor || theme.accent, appearance.accentSaturation ?? 100);
    const secondary = saturateHex(theme.secondary, appearance.accentSaturation ?? 100);
    const rgb = rgbFromHex(accent);
    const root = document.documentElement;
    const borderAlpha = Math.max(0.02, Math.min(0.55, Number(appearance.borderStrength ?? 60) / 100 * 0.36));
    const glass = Math.max(0.08, Math.min(0.9, Number(appearance.glassOpacity ?? 65) / 100));
    const glow = Math.max(0, Math.min(1.5, Number(appearance.glowIntensity ?? 80) / 100));
    const starDensity = Math.max(0, Math.min(100, Number(appearance.starDensity ?? 70)));
    const nebula = Math.max(0, Math.min(1, Number(appearance.nebulaIntensity ?? 80) / 100));
    const radius = ({ sm: '12px', md: '18px', lg: '26px', full: '999px' })[appearance.cornerRadius] || '18px';

    root.dataset.spmtTheme = appearance.themeId;
    root.dataset.spmtDensity = appearance.density;
    root.dataset.spmtContrast = appearance.accessibility?.highContrast ? 'high' : 'standard';
    root.dataset.spmtColorVision = appearance.accessibility?.colorVisionMode || 'default';
    root.dataset.spmtTabStyle = appearance.tabStyle || 'pills';
    root.style.setProperty('--orange', accent);
    root.style.setProperty('--blue', secondary);
    root.style.setProperty('--line', `rgba(${rgb.r},${rgb.g},${rgb.b},${borderAlpha})`);
    root.style.setProperty('--panel', `rgba(6,8,22,${glass})`);
    root.style.setProperty('--panel-2', `rgba(12,15,28,${Math.min(0.96, glass + 0.08)})`);
    root.style.setProperty('--spmt-accent', accent);
    root.style.setProperty('--spmt-secondary', secondary);
    root.style.setProperty('--spmt-accent-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
    root.style.setProperty('--spmt-line', `rgba(${rgb.r},${rgb.g},${rgb.b},${borderAlpha})`);
    root.style.setProperty('--spmt-line-strong', `rgba(${rgb.r},${rgb.g},${rgb.b},${Math.min(0.75, borderAlpha + 0.18)})`);
    root.style.setProperty('--spmt-glow', String(glow));
    root.style.setProperty('--spmt-glass', String(glass));
    root.style.setProperty('--spmt-blur', `${appearance.blurStrength ?? 22}px`);
    root.style.setProperty('--spmt-radius', radius);
    root.style.setProperty('--spmt-chat-opacity', String((appearance.chatTransparency ?? 65) / 100));
    root.style.setProperty('--spmt-text-scale', String(textScale(appearance.accessibility?.textScale ?? 100)));
    root.style.setProperty('--spmt-nebula-opacity', String(nebula));
    root.style.setProperty('--spmt-star-opacity', String(Math.max(0.04, starDensity / 100 * 0.62)));
    root.style.setProperty('--spmt-star-spacing', `${Math.max(18, Math.round(72 - starDensity * 0.48))}px`);
    root.style.setProperty('--spmt-star-spacing-2', `${Math.max(31, Math.round(118 - starDensity * 0.71))}px`);
    root.style.setProperty('--spmt-bg-image', `url("${theme.backgroundImage}")`);
    root.style.setProperty('--spmt-parallax-depth', String(Math.max(0, Math.min(100, Number(appearance.parallaxDepth ?? 65)))));
    root.style.setProperty('--spmt-animation-speed', `${Math.max(0.2, Number(appearance.animation?.speed ?? 85) / 100)}s`);

    toggleBodyClass('spmt-reduce-motion', appearance.accessibility?.reduceMotion || appearance.animation?.enabled === false || appearance.smoothTransitions === false);
    toggleBodyClass('spmt-sidebar-right', appearance.sidebarPosition === 'right');
    toggleBodyClass('spmt-sidebar-hidden', appearance.sidebarStyle === 'hidden');
    toggleBodyClass('spmt-sidebar-floating', appearance.sidebarStyle === 'floating');
    toggleBodyClass('spmt-sidebar-collapsed', appearance.sidebarCollapsed);
    toggleBodyClass('spmt-density-compact', appearance.density === 'compact');
    toggleBodyClass('spmt-density-spacious', appearance.density === 'spacious');
    toggleBodyClass('spmt-topbar-glass', appearance.topbarStyle === 'glass');
    toggleBodyClass('spmt-border-glow', appearance.borderGlow);
    toggleBodyClass('spmt-hover-glow', appearance.hoverGlow);
    toggleBodyClass('spmt-focus-highlight', appearance.accessibility?.focusHighlight);
    toggleBodyClass('spmt-high-contrast', appearance.accessibility?.highContrast);
    toggleBodyClass('spmt-particles-off', appearance.animation?.particles === false);
  }

  function installStyle() {
    if (document.getElementById('spmt-canonical-theme-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-canonical-theme-style';
    style.textContent = `
      html{background:#03050b}
      body{font-size:calc(16px*var(--spmt-text-scale,1));background:#03050b!important;position:relative;isolation:isolate;overflow-x:hidden}
      body:before{content:"";position:fixed;inset:-3%;z-index:0;pointer-events:none;background-image:linear-gradient(180deg,rgba(2,6,18,.3),rgba(2,6,18,.78)),var(--spmt-bg-image);background-size:cover;background-position:center;background-repeat:no-repeat;transform:translate3d(var(--spmt-parallax-x,0px),var(--spmt-parallax-y,0px),0) scale(1.035);transition:transform .2s ease;filter:saturate(1.03)}
      body:after{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(circle at 20% 18%,rgba(var(--spmt-accent-rgb,249,115,22),.22),transparent 30rem),radial-gradient(circle at 78% 68%,color-mix(in srgb,var(--spmt-secondary,#fbbf24) 14%,transparent),transparent 28rem),radial-gradient(circle,#fff 0 1px,transparent 1.3px),radial-gradient(circle,rgba(255,255,255,.75) 0 .8px,transparent 1.1px);background-size:auto,auto,var(--spmt-star-spacing,38px) var(--spmt-star-spacing,38px),var(--spmt-star-spacing-2,68px) var(--spmt-star-spacing-2,68px);background-position:center,center,0 0,17px 29px;opacity:var(--spmt-nebula-opacity,.8)}
      body.spmt-particles-off:after{background-image:radial-gradient(circle at 20% 18%,rgba(var(--spmt-accent-rgb,249,115,22),.22),transparent 30rem),radial-gradient(circle at 78% 68%,color-mix(in srgb,var(--spmt-secondary,#fbbf24) 14%,transparent),transparent 28rem)}
      .shell,.auth-wrap{position:relative;z-index:1}
      .sidebar{border-color:var(--spmt-line)!important;background:rgba(5,7,16,var(--spmt-glass,.65))!important;backdrop-filter:blur(var(--spmt-blur,22px))!important}
      .card,.account,.item,.modal-card,.developer-path,.surface-tile{border-color:var(--spmt-line)!important;border-radius:var(--spmt-radius,18px)!important;backdrop-filter:blur(var(--spmt-blur,22px))!important;background:rgba(7,9,20,var(--spmt-glass,.65))!important}
      .card,.account,.modal-card{box-shadow:0 18px calc(34px + 20px*var(--spmt-glow,.8)) rgba(0,0,0,.28)!important}
      body.spmt-border-glow .card,body.spmt-border-glow .account,body.spmt-border-glow .modal-card{box-shadow:0 18px 54px rgba(0,0,0,.3),0 0 calc(24px*var(--spmt-glow,.8)) rgba(var(--spmt-accent-rgb),.16)!important}
      .mark{background:radial-gradient(circle,#fff 0 4%,var(--spmt-accent) 8% 31%,color-mix(in srgb,var(--spmt-accent) 48%,#05070d) 34% 55%,#05070d 58%)!important;box-shadow:0 0 calc(28px*var(--spmt-glow,.8)) rgba(var(--spmt-accent-rgb),.45)!important}
      .btn{border-color:var(--spmt-line)!important;background:rgba(10,13,27,.72)!important;border-radius:min(var(--spmt-radius,18px),14px)!important}
      .btn.primary{background:linear-gradient(135deg,var(--spmt-accent,#f97316),var(--spmt-secondary,#fbbf24))!important;color:#050608!important;border-color:transparent!important}
      .btn.blue{background:color-mix(in srgb,var(--spmt-accent) 24%,#07101f)!important;border-color:var(--spmt-line-strong)!important;color:#f8fafc!important}
      input,textarea,select{border-color:var(--spmt-line)!important;border-radius:min(var(--spmt-radius,18px),14px)!important;background:rgba(3,5,12,.78)!important}
      input:focus,textarea:focus,select:focus{border-color:var(--spmt-line-strong)!important;box-shadow:0 0 0 2px rgba(var(--spmt-accent-rgb),.12)}
      .badge{border-color:var(--spmt-line)!important}
      .nav button{border-radius:min(var(--spmt-radius,18px),16px)!important}
      .nav button.active,.nav button:hover{border-color:var(--spmt-line-strong)!important;background:rgba(var(--spmt-accent-rgb),.12)!important;color:#fff!important}
      .tabs{border-color:var(--spmt-line)!important;border-radius:min(var(--spmt-radius,18px),16px)!important}
      .tabs button.active{background:rgba(var(--spmt-accent-rgb),.16)!important;color:#fff!important}
      [data-spmt-theme]{transition:background-color .2s ease,border-color .2s ease,box-shadow .2s ease}
      body.spmt-hover-glow .card:hover,body.spmt-hover-glow .item:hover{border-color:var(--spmt-line-strong)!important;box-shadow:0 0 calc(20px*var(--spmt-glow,.8)) rgba(var(--spmt-accent-rgb),.15)!important}
      body.spmt-topbar-glass .topbar{padding:12px 14px;border:1px solid var(--spmt-line);border-radius:var(--spmt-radius);background:rgba(6,8,18,var(--spmt-glass,.65));backdrop-filter:blur(var(--spmt-blur,22px))}
      body.spmt-sidebar-right .shell{grid-template-columns:minmax(0,1fr) 260px}body.spmt-sidebar-right .sidebar{grid-column:2;grid-row:1;border-right:0;border-left:1px solid var(--spmt-line)}body.spmt-sidebar-right .main{grid-column:1;grid-row:1}
      body.spmt-sidebar-hidden .shell{grid-template-columns:1fr}body.spmt-sidebar-hidden .sidebar{display:none}
      body.spmt-sidebar-floating .sidebar{margin:14px;height:calc(100vh - 28px);border:1px solid var(--spmt-line)!important;border-radius:var(--spmt-radius)!important}
      body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .shell{grid-template-columns:92px minmax(0,1fr)}body.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .sidebar{overflow:hidden;padding-inline:12px}
      body.spmt-sidebar-right.spmt-sidebar-collapsed:not(.spmt-sidebar-hidden) .shell{grid-template-columns:minmax(0,1fr) 92px}
      body.spmt-density-compact .main{padding:14px}body.spmt-density-compact .card{padding:12px}body.spmt-density-spacious .main{padding:30px}body.spmt-density-spacious .card{padding:20px}
      body.spmt-high-contrast .card,body.spmt-high-contrast .account,body.spmt-high-contrast .item,body.spmt-high-contrast .sidebar{background:rgba(0,0,0,.96)!important;border-color:rgba(255,255,255,.42)!important}
      body.spmt-focus-highlight :focus-visible{outline:2px solid var(--spmt-accent)!important;outline-offset:3px!important}
      body.spmt-reduce-motion *,body.spmt-reduce-motion *:before,body.spmt-reduce-motion *:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
      @media(max-width:900px){body.spmt-sidebar-right .shell,body.spmt-sidebar-collapsed .shell,body.spmt-sidebar-right.spmt-sidebar-collapsed .shell{grid-template-columns:1fr}body.spmt-sidebar-right .sidebar{grid-column:1;grid-row:auto;border-left:0;border-right:0}body.spmt-sidebar-floating .sidebar{height:auto}}
    `;
    document.head.append(style);
  }

  async function refresh() {
    try {
      const response = await fetch('/api/workspace-profile', { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      apply(data.profile?.appearance);
    } catch {}
  }

  function installParallax() {
    window.addEventListener('pointermove', (event) => {
      if (document.body.classList.contains('spmt-reduce-motion')) return;
      const depth = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--spmt-parallax-depth')) || 0;
      const x = ((event.clientX / Math.max(1, window.innerWidth)) - 0.5) * depth * 0.12;
      const y = ((event.clientY / Math.max(1, window.innerHeight)) - 0.5) * depth * 0.08;
      document.documentElement.style.setProperty('--spmt-parallax-x', `${x}px`);
      document.documentElement.style.setProperty('--spmt-parallax-y', `${y}px`);
    }, { passive: true });
  }

  function watchAuthentication() {
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(() => {
      if (!app.classList.contains('hidden')) refresh();
    }).observe(app, { attributes: true, attributeFilter: ['class'] });
  }

  installStyle();
  installParallax();
  watchAuthentication();
  refresh();
  window.addEventListener('focus', refresh);
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'spmt.surface.updated' && event.data?.surface === 'settings') refresh();
  });
  window.addEventListener('spmt:workspace-refresh', refresh);
})();
