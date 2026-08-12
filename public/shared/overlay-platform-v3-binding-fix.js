(() => {
  if (window.__spmtOverlayPlatformV3BindingFixInstalled) return;
  window.__spmtOverlayPlatformV3BindingFixInstalled = true;

  const currentSurface = typeof surfaceId === 'undefined' ? '' : surfaceId;
  const currentMode = typeof mode === 'undefined' ? 'panel' : mode;
  if (currentSurface !== 'overlays' || currentMode === 'overlay') return;

  const requestedOutput = typeof params !== 'undefined' && params.get('output') === 'personal' ? 'personal' : 'public';
  let initialTenantLoadStarted = false;

  function tenantLoad() {
    return typeof window.loadOverlayWorkspace === 'function'
      ? window.loadOverlayWorkspace
      : (typeof loadOverlayWorkspace === 'function' ? loadOverlayWorkspace : null);
  }

  function tenantRender() {
    return typeof window.renderOverlays === 'function'
      ? window.renderOverlays
      : (typeof renderOverlays === 'function' ? renderOverlays : null);
  }

  function tenantSave() {
    return typeof window.saveOverlayWorkspace === 'function'
      ? window.saveOverlayWorkspace
      : (typeof saveOverlayWorkspace === 'function' ? saveOverlayWorkspace : null);
  }

  function bindFreshSaveButton() {
    const button = document.getElementById('save-overlay');
    if (!button || button.dataset.tenantSaveBound === '1') return;

    // The first v2 render happens before v3 is installed and captured the legacy
    // Public save function by reference. Replacing this one DOM node removes that
    // stale listener without changing any v2 source code or other controls.
    const replacement = button.cloneNode(true);
    replacement.dataset.tenantSaveBound = '1';
    button.replaceWith(replacement);
    replacement.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const save = tenantSave();
      if (save) await save();
    });
  }

  async function hydrateRequestedOutputAfterLegacyRender() {
    if (initialTenantLoadStarted || !document.querySelector('.obv2-manager')) return;
    initialTenantLoadStarted = true;
    try {
      const load = tenantLoad();
      const render = tenantRender();
      if (!load || !render) return;
      await load(requestedOutput);
      render();
    } catch (error) {
      try { setStatus(error?.message || 'Tenant overlay could not be loaded.', 'error'); } catch {}
    } finally {
      bindFreshSaveButton();
    }
  }

  const observer = new MutationObserver(() => {
    bindFreshSaveButton();
    hydrateRequestedOutputAfterLegacyRender();
  });
  observer.observe(document.getElementById('surface-content') || document.documentElement, { childList: true, subtree: true });

  bindFreshSaveButton();
  hydrateRequestedOutputAfterLegacyRender();
})();
