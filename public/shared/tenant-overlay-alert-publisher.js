(() => {
  'use strict';
  if (window.__spmtTenantAlertPublisherInstalled) return;
  window.__spmtTenantAlertPublisherInstalled = true;

  const samples = {
    follow: { eventType: 'follow', user: 'MountainTester' },
    sub: { eventType: 'sub', user: 'MountainTester' },
    resub: { eventType: 'resub', user: 'MountainTester', months: 12 },
    raid: { eventType: 'raid', user: 'RaidCrew', count: 42 },
    cheer: { eventType: 'cheer', user: 'BitsPilot', amount: 500 },
    gift: { eventType: 'gift', user: 'GiftCaptain', count: 5 },
    custom: { eventType: 'custom', headline: 'SpaceMountain Test', message: 'Canonical tenant alerts are live.' },
  };

  async function publish(payload, outputs = ['public', 'personal'], source = 'overlay-bay') {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    try {
      const token = localStorage.getItem('spmt_token') || '';
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {}
    const response = await fetch('/api/tenant-overlay-alert', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: JSON.stringify({ payload, outputs, source }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Alert publish failed (${response.status})`);
    return data;
  }

  window.spmtPublishOverlayAlert = publish;

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-test-alert]');
    if (!button) return;
    const type = String(button.dataset.testAlert || 'follow').toLowerCase();
    const payload = samples[type] || samples.follow;
    void publish(payload, ['public', 'personal'], 'overlay-bay-test')
      .then(() => {
        try { setStatus?.(`${type} test sent to Public + Personal.`, 'ok'); } catch {}
      })
      .catch((error) => {
        try { setStatus?.(error.message || 'Test alert could not be sent.', 'error'); } catch {}
      });
  }, true);
})();
