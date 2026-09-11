(() => {
  if (window.__spmtSessionRenewalInstalled || typeof window.fetch !== 'function') return;
  window.__spmtSessionRenewalInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  let renewal = null;
  let renewedAt = 0;
  async function renewSession() {
    if (Date.now() - renewedAt < 6 * 60 * 60 * 1000) return;
    if (!renewal) renewal = (async () => {
      const previous = localStorage.getItem('spmt_token');
      const headers = previous ? { Authorization: 'Bearer ' + previous } : {};
      const response = await nativeFetch('/api/auth/refresh', { method: 'POST', headers, credentials: 'include', cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      // A sign-out or another account signing in wins over an in-flight renewal.
      if (!data.token || localStorage.getItem('spmt_token') !== previous) return;
      localStorage.setItem('spmt_token', data.token);
      renewedAt = Date.now();
      window.dispatchEvent(new CustomEvent('spmt-session-refreshed', { detail: { token: data.token } }));
    })().catch(() => {}).finally(() => { renewal = null; });
    await renewal;
  }
  setInterval(() => {
    if (localStorage.getItem('spmt_token')) void renewSession();
  }, 60 * 60 * 1000);
  window.fetch = async function renewingSessionFetch(input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== '/api/session/bridge') return nativeFetch(input, init);
    await renewSession();
    const headers = new Headers(init?.headers || (typeof input === 'object' ? input.headers : undefined));
    const token = localStorage.getItem('spmt_token');
    if (token) headers.set('Authorization', 'Bearer ' + token);
    return nativeFetch(input, { ...init, headers, credentials: 'include' });
  };
})();
