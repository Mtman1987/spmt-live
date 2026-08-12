(() => {
  'use strict';
  const parts = location.pathname.split('/').filter(Boolean);
  const tenant = decodeURIComponent(parts[1] || '').toLowerCase();
  const output = parts[2] === 'personal' ? 'personal' : 'public';
  if (!tenant || !['public', 'personal'].includes(output)) return;

  let cursor = null;
  let busy = false;
  let stopped = false;

  async function poll() {
    if (busy || stopped) return;
    busy = true;
    try {
      const query = new URLSearchParams({ output });
      if (cursor !== null) query.set('after', String(cursor));
      const response = await fetch(`/api/tenant/${encodeURIComponent(tenant)}/alerts?${query}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (!data) return;
      const firstSync = cursor === null;
      cursor = Math.max(Number(cursor) || 0, Number(data.cursor) || 0);
      if (!firstSync) {
        for (const event of Array.isArray(data.events) ? data.events : []) {
          if (typeof window.spmtOverlayAlert === 'function') window.spmtOverlayAlert(event.payload || event);
        }
      }
    } catch {
      // Renderers stay transparent and retry through transient network misses.
    } finally {
      busy = false;
    }
  }

  window.addEventListener('beforeunload', () => { stopped = true; });
  void poll();
  setInterval(poll, 600);
})();
