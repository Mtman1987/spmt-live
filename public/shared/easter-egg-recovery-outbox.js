(() => {
  'use strict';

  const STORAGE_KEY = 'spmt.pendingEggCompletions.v1';
  const APP_ID = 'spacemountain-live';
  const NAMESPACE = 'easter-eggs';
  const STATE_PATH = `/api/app-state/${APP_ID}/${NAMESPACE}`;
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const RETRY_MS = 30 * 1000;
  const originalFetch = window.fetch.bind(window);
  let replaying = false;
  let retryTimer = 0;

  function nowIso() {
    return new Date().toISOString();
  }

  function safeParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function readOutbox() {
    const raw = safeParse(localStorage.getItem(STORAGE_KEY) || '{}', {});
    const now = Date.now();
    const entries = {};
    for (const [egg, receipt] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      if (!receipt || typeof receipt !== 'object') continue;
      const createdAt = Date.parse(receipt.createdAt || '');
      if (!Number.isFinite(createdAt) || now - createdAt > TTL_MS) continue;
      entries[egg] = receipt;
    }
    if (Object.keys(entries).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    else localStorage.removeItem(STORAGE_KEY);
    return entries;
  }

  function writeOutbox(entries) {
    if (Object.keys(entries).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function completionEntriesFromData(data) {
    const eggs = data && typeof data === 'object' && data.eggs && typeof data.eggs === 'object' ? data.eggs : {};
    return Object.entries(eggs)
      .filter(([, value]) => value && typeof value === 'object' && value.completed === true)
      .map(([egg, value]) => [egg, value]);
  }

  function queueFromWriteBody(body, reason = 'write-failed') {
    if (typeof body !== 'string') return false;
    const payload = safeParse(body, null);
    const data = payload && typeof payload === 'object' ? (payload.data ?? payload) : null;
    const completions = completionEntriesFromData(data);
    if (!completions.length) return false;

    const outbox = readOutbox();
    const queuedAt = nowIso();
    for (const [egg, value] of completions) {
      const existing = outbox[egg] && typeof outbox[egg] === 'object' ? outbox[egg] : {};
      outbox[egg] = {
        version: 1,
        appId: APP_ID,
        namespace: NAMESPACE,
        egg,
        createdAt: existing.createdAt || queuedAt,
        lastQueuedAt: queuedAt,
        reason,
        value: {
          ...value,
          completed: true,
          discoveredAt: value.discoveredAt || existing.value?.discoveredAt || queuedAt,
        },
      };
    }
    writeOutbox(outbox);
    window.dispatchEvent(new CustomEvent('spmt:easter-egg-recovery-queued', { detail: { eggs: completions.map(([egg]) => egg), reason } }));
    scheduleReplay(2500);
    return true;
  }

  function clearPersistedFromBody(body) {
    if (typeof body !== 'string') return;
    const payload = safeParse(body, null);
    const data = payload && typeof payload === 'object' ? (payload.data ?? payload) : null;
    const completions = completionEntriesFromData(data);
    if (!completions.length) return;
    const outbox = readOutbox();
    let changed = false;
    for (const [egg] of completions) {
      if (outbox[egg]) {
        delete outbox[egg];
        changed = true;
      }
    }
    if (changed) writeOutbox(outbox);
  }

  function isEggStateWrite(input, init) {
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = String(input instanceof Request ? input.url : input || '');
    if (method !== 'PUT') return false;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin && parsed.pathname === STATE_PATH;
    } catch {
      return false;
    }
  }

  function requestBody(input, init) {
    if (typeof init?.body === 'string') return init.body;
    return null;
  }

  async function replayOnce(attempt = 0) {
    if (replaying) return false;
    const outbox = readOutbox();
    if (!Object.keys(outbox).length) return true;
    replaying = true;
    try {
      const read = await originalFetch(STATE_PATH, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (read.status === 401 || read.status === 403) return false;
      if (!read.ok && read.status !== 404) return false;

      const payload = read.status === 404 ? {} : await read.json().catch(() => ({}));
      const revision = Number(payload.revision || 0);
      const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
      const eggs = data.eggs && typeof data.eggs === 'object' ? data.eggs : {};
      const mergedEggs = { ...eggs };
      for (const [egg, receipt] of Object.entries(outbox)) {
        const current = mergedEggs[egg] && typeof mergedEggs[egg] === 'object' ? mergedEggs[egg] : {};
        const pending = receipt.value && typeof receipt.value === 'object' ? receipt.value : {};
        mergedEggs[egg] = {
          ...current,
          ...pending,
          completed: true,
          discoveredAt: current.discoveredAt || pending.discoveredAt || receipt.createdAt || nowIso(),
        };
      }

      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      const etag = read.headers.get('etag');
      if (etag) headers['If-Match'] = etag;
      const writeBody = JSON.stringify({ schemaVersion: 1, revision, data: { ...data, eggs: mergedEggs } });
      const write = await originalFetch(STATE_PATH, {
        method: 'PUT',
        credentials: 'include',
        headers,
        body: writeBody,
      });
      if (write.status === 409 && attempt < 1) {
        replaying = false;
        return replayOnce(attempt + 1);
      }
      if (!write.ok) return false;

      const confirmed = await originalFetch(STATE_PATH, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!confirmed.ok) return false;
      const confirmedPayload = await confirmed.json().catch(() => ({}));
      const confirmedEggs = confirmedPayload?.data?.eggs && typeof confirmedPayload.data.eggs === 'object' ? confirmedPayload.data.eggs : {};
      const nextOutbox = readOutbox();
      const recovered = [];
      for (const egg of Object.keys(outbox)) {
        if (confirmedEggs?.[egg]?.completed === true) {
          delete nextOutbox[egg];
          recovered.push(egg);
        }
      }
      writeOutbox(nextOutbox);
      if (recovered.length) {
        window.dispatchEvent(new CustomEvent('spmt:easter-egg-recovered', { detail: { eggs: recovered } }));
        console.info('[EasterEggRecovery] restored pending completion(s):', recovered.join(', '));
      }
      return recovered.length > 0;
    } catch (error) {
      console.warn('[EasterEggRecovery] replay failed; keeping local receipt', error);
      return false;
    } finally {
      replaying = false;
    }
  }

  function scheduleReplay(delay = RETRY_MS) {
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => void replayOnce(), delay);
  }

  window.fetch = async function spmtEggRecoveryFetch(input, init) {
    if (!isEggStateWrite(input, init)) return originalFetch(input, init);
    const body = requestBody(input, init);
    try {
      const response = await originalFetch(input, init);
      if (response.ok) {
        clearPersistedFromBody(body);
      } else {
        queueFromWriteBody(body, `http-${response.status}`);
      }
      return response;
    } catch (error) {
      queueFromWriteBody(body, 'network-error');
      throw error;
    }
  };

  window.SPMTEasterEggRecovery = Object.freeze({
    storageKey: STORAGE_KEY,
    queueFromWriteBody,
    replay: replayOnce,
    pending: () => readOutbox(),
  });

  window.addEventListener('online', () => scheduleReplay(250));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleReplay(250);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleReplay(500), { once: true });
  } else {
    scheduleReplay(500);
  }
})();
