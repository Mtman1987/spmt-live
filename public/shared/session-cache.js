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

  window.SpmtSessionCache = { read, write, remove, clearPrivate };
})();
