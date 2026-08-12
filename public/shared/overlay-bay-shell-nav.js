(() => {
  if (window.__spmtOverlayBayShellNavInstalled) return;
  window.__spmtOverlayBayShellNavInstalled = true;

  const VIEW_ID = 'overlay-bay';
  const FRAME_URL = '/embed/overlays?mode=full&app=spmt-shell';
  let showViewWrapped = false;

  function installStyle() {
    if (document.getElementById('spmt-overlay-bay-shell-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-overlay-bay-shell-style';
    style.textContent = `
      #view-overlay-bay{min-height:calc(100vh - 112px)}
      .spmt-overlay-bay-frame{display:block;width:100%;height:calc(100vh - 112px);min-height:680px;border:1px solid var(--line);border-radius:14px;background:#03050a}
      .spmt-overlay-bay-dashboard-card{grid-column:span 12;display:flex;align-items:center;justify-content:space-between;gap:14px}
      .spmt-overlay-bay-dashboard-card p{margin-top:5px!important}
      @media(max-width:900px){.spmt-overlay-bay-frame{height:76vh;min-height:560px}.spmt-overlay-bay-dashboard-card{align-items:flex-start;flex-direction:column}}
    `;
    document.head.append(style);
  }

  function installView() {
    const main = document.querySelector('.main');
    if (!main || document.getElementById('view-overlay-bay')) return;
    const section = document.createElement('section');
    section.id = 'view-overlay-bay';
    section.className = 'hidden';
    section.innerHTML = `<iframe class="spmt-overlay-bay-frame" title="SPMT Overlay Bay" src="${FRAME_URL}" allow="autoplay; camera; microphone; fullscreen; display-capture; clipboard-write"></iframe>`;
    main.append(section);
  }

  function installNav() {
    const nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('[data-view="overlay-bay"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = VIEW_ID;
    button.textContent = 'Overlay Bay';
    button.addEventListener('click', () => window.showView?.(VIEW_ID));
    const accountButton = nav.querySelector('[data-view="settings"]');
    accountButton ? nav.insertBefore(button, accountButton) : nav.append(button);
  }

  function installDashboardCard() {
    const dashboard = document.getElementById('view-dashboard');
    if (!dashboard || dashboard.querySelector('.spmt-overlay-bay-dashboard-card')) return;
    const card = document.createElement('div');
    card.className = 'card spmt-overlay-bay-dashboard-card';
    card.innerHTML = `<div><h3>Overlay Bay</h3><p class="muted small">Build the canonical streaming scene here: Xbox, camera, screen, images, web sources, text, and replaceable SpaceMountain alerts.</p></div><button class="btn primary" type="button">Open Overlay Bay</button>`;
    card.querySelector('button').addEventListener('click', () => window.showView?.(VIEW_ID));
    dashboard.append(card);
  }

  function wrapShowView() {
    if (showViewWrapped || typeof window.showView !== 'function') return;
    const original = window.showView;
    window.showView = function spmtShowView(view) {
      if (view !== VIEW_ID) return original(view);
      try {
        original(view);
      } catch (error) {
        if (!document.getElementById('view-overlay-bay') || !String(error?.message || '').includes('undefined')) throw error;
      }
      document.querySelector('.main')?.classList.remove('commlink-active');
      const title = document.getElementById('view-title');
      const subtitle = document.getElementById('view-subtitle');
      if (title) title.textContent = 'Overlay Bay';
      if (subtitle) subtitle.textContent = 'Canonical SPMT scenes, live sources, layouts, and SpaceMountain alert defaults.';
    };
    showViewWrapped = true;
  }

  function install() {
    installStyle();
    installView();
    installNav();
    installDashboardCard();
    wrapShowView();
  }

  install();
  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
