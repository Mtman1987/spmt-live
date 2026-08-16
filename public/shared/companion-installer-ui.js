(() => {
  if (window.__spmtCompanionInstallerUiInstalled) return;
  window.__spmtCompanionInstallerUiInstalled = true;

  const PENDING_KEY = 'spmt:companion-bootstrap';

  function readPendingLink() {
    try {
      const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
      if (!value?.launchUrl || Number(value.expiresAt || 0) <= Date.now()) {
        sessionStorage.removeItem(PENDING_KEY);
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  function addConnectButton(card) {
    const pending = readPendingLink();
    let button = card.querySelector('[data-companion-connect]');
    if (!pending) {
      button?.remove();
      return;
    }
    if (button) return;
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.companionConnect = 'true';
    button.className = 'btn';
    button.textContent = 'Connect installed Companion';
    button.addEventListener('click', () => {
      window.location.href = pending.launchUrl;
    });
    card.appendChild(button);
  }

  async function beginTenantLinkedDownload(event, card, anchor) {
    event.preventDefault();
    if (anchor.dataset.companionDownloadBusy === 'true') return;
    anchor.dataset.companionDownloadBusy = 'true';
    const previousText = anchor.textContent;
    anchor.textContent = 'Preparing tenant link…';
    try {
      const token = localStorage.getItem('spmt_token') || '';
      const response = await fetch('/api/companion/bootstrap', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.launchUrl || !payload?.downloadUrl) {
        throw new Error(payload?.error || 'Sign in to SPMT before downloading your tenant-linked Companion.');
      }
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        launchUrl: payload.launchUrl,
        expiresAt: Date.now() + Math.max(300, Number(payload.expiresIn || 3600)) * 1000,
      }));
      addConnectButton(card);
      const download = document.createElement('a');
      download.href = payload.downloadUrl;
      download.download = 'SpaceMountain-Companion-Setup.exe';
      document.body.appendChild(download);
      download.click();
      download.remove();
      anchor.textContent = 'Download installer again';
    } catch (error) {
      anchor.textContent = previousText || 'Download installer';
      window.alert(error instanceof Error ? error.message : 'Companion download could not be prepared.');
    } finally {
      anchor.dataset.companionDownloadBusy = 'false';
    }
  }

  function patchCompanionCards() {
    document.querySelectorAll('#dashboard-apps .app-card, #apps-list .app-card').forEach((card) => {
      const name = card.querySelector('h3')?.textContent?.trim().toLowerCase() || '';
      if (name !== 'spacemountain companion') return;

      card.querySelectorAll('a, button, span').forEach((node) => {
        const text = node.textContent?.trim() || '';
        if (text === 'Download unsigned ZIP') node.textContent = 'Download installer';
        if (text === 'Unsigned portable beta') node.textContent = 'Unsigned installer';
      });
      const download = Array.from(card.querySelectorAll('a')).find((anchor) =>
        String(anchor.getAttribute('href') || '').includes('/downloads/companion/windows'));
      if (download && download.dataset.companionTenantLinked !== 'true') {
        download.dataset.companionTenantLinked = 'true';
        download.addEventListener('click', (event) => void beginTenantLinkedDownload(event, card, download));
      }
      addConnectButton(card);
    });
  }

  patchCompanionCards();
  const observer = new MutationObserver(patchCompanionCards);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
