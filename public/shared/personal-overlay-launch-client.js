(() => {
  'use strict';
  if (window.__spmtPersonalOverlayLaunchClientInstalled) return;
  window.__spmtPersonalOverlayLaunchClientInstalled = true;

  let launch = null;
  let applying = false;

  function status(message, kind = '') {
    try { setStatus?.(message, kind); } catch {}
  }

  function apply() {
    if (!launch?.url || applying) return;
    applying = true;
    try {
      document.querySelectorAll('[data-output-url-row="personal"]').forEach((row) => {
        const input = row.querySelector('input');
        const link = row.querySelector('a');
        if (input && input.value !== launch.url) input.value = launch.url;
        if (link && link.href !== launch.url) link.href = launch.url;
      });
      window.spmtTenantOutputs = { ...(window.spmtTenantOutputs || {}), tenant: launch.tenant, personal: launch.url };
    } finally {
      applying = false;
    }
  }

  async function load() {
    try {
      const headers = { Accept: 'application/json' };
      try {
        const token = localStorage.getItem('spmt_token') || '';
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {}
      const response = await fetch('/api/personal-overlay-launch', { credentials: 'include', cache: 'no-store', headers });
      if (!response.ok) return;
      launch = await response.json();
      apply();
    } catch {}
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-copy-output="personal"]');
    if (!button || !launch?.url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const copy = navigator.clipboard?.writeText(launch.url);
    if (copy?.then) copy.then(() => status('Personal output URL copied.', 'ok')).catch(() => status('Select the Personal URL and copy it.', ''));
  }, true);

  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  void load();
})();
