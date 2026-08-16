(() => {
  if (window.SpmtSessionCache) return;
  const PREFIX = 'spmt.cache.v1.';

  function read(name) {
    try {
      const envelope = JSON.parse(localStorage.getItem(PREFIX + name) || 'null');
      if (!envelope || envelope.version !== 1 || !envelope.value) return null;
      return { value: envelope.value, savedAt: envelope.savedAt || null };
    } catch {
      return null;
    }
  }

  function write(name, value) {
    try {
      localStorage.setItem(PREFIX + name, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), value }));
    } catch {
      // A full or disabled cache must never block the live session.
    }
    return value;
  }

  function remove(name) {
    try { localStorage.removeItem(PREFIX + name); } catch {}
  }

  function clearPrivate() {
    ['bridge', 'workspace', 'overlay'].forEach(remove);
  }

  // The primary shell treats a 401/403 from /api/session/bridge as a definitive
  // sign-out. During a rollout or short restart, confirm that response once so
  // one transient probe cannot eject every tenant. A truly expired/revoked
  // session still fails the second request and is handled normally by the shell.
  function installBridgeFetchResilience() {
    if (window.__spmtBridgeFetchResilienceInstalled || typeof window.fetch !== 'function') return;
    window.__spmtBridgeFetchResilienceInstalled = true;
    const nativeFetch = window.fetch.bind(window);

    function isBridgeRequest(input) {
      const raw = typeof input === 'string' ? input : String(input?.url || '');
      try {
        const url = new URL(raw, window.location.href);
        return url.origin === window.location.origin && url.pathname === '/api/session/bridge';
      } catch {
        return raw === '/api/session/bridge' || raw.startsWith('/api/session/bridge?');
      }
    }

    window.fetch = async function resilientSpmtFetch(input, init) {
      if (!isBridgeRequest(input)) return nativeFetch(input, init);

      let first;
      try {
        first = await nativeFetch(input, init);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 450));
        return nativeFetch(input, init);
      }

      if (![401, 403, 502, 503, 504].includes(first.status)) return first;
      await new Promise((resolve) => setTimeout(resolve, 450));
      try {
        return await nativeFetch(input, { ...init, cache: 'no-store' });
      } catch {
        return first;
      }
    };
  }

  installBridgeFetchResilience();
  window.SpmtSessionCache = { read, write, remove, clearPrivate };
})();
