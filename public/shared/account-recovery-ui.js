(() => {
  if (window.__spmtAccountRecoveryUiInstalled) return;
  window.__spmtAccountRecoveryUiInstalled = true;

  function enhanceRecovery() {
    const root = document.getElementById('form-recover');
    if (!root || root.dataset.spmtRecoveryEnhanced === '1') return;

    const primary = root.querySelector('a[href="/api/auth/recover/twitch"]');
    if (primary) {
      const label = 'Verify with Twitch and recover in SPMT';
      if (primary.textContent !== label) primary.textContent = label;
      primary.setAttribute('title', 'This verification returns to spmt.live and never signs you into another app.');
      const description = primary.parentElement?.querySelector('.field-help');
      const text = 'If you joined through Space Mountain or your Discord DM does not arrive, verify the linked Twitch account here. The callback stays on spmt.live.';
      if (description && description.textContent !== text) description.textContent = text;
    }

    const dmForm = Array.from(root.querySelectorAll('form')).find((form) =>
      String(form.getAttribute('onsubmit') || '').includes('handleRecoveryCodeRequest')
    );
    if (dmForm && !dmForm.querySelector('[data-spmt-recovery-fallback]')) {
      const help = dmForm.querySelector('.field-help');
      const helpText = 'SPMT sends the code to the immutable Discord account linked to this SPMT identity. Discord username changes no longer break recovery. If the bot cannot open a DM, use Twitch verification below.';
      if (help && help.textContent !== helpText) help.textContent = helpText;
      const fallback = document.createElement('a');
      fallback.className = 'btn blue';
      fallback.href = '/api/auth/recover/twitch';
      fallback.textContent = 'No DM? Verify with Twitch';
      fallback.dataset.spmtRecoveryFallback = 'true';
      fallback.style.marginLeft = '8px';
      dmForm.querySelector('button[type="submit"]')?.insertAdjacentElement('afterend', fallback);
    }

    root.dataset.spmtRecoveryEnhanced = '1';
  }

  function showRecoveryError() {
    const params = new URLSearchParams(window.location.search);
    const message = params.get('recoverError');
    if (!message) return;
    try {
      if (typeof window.showAuthTab === 'function') window.showAuthTab('recover');
      if (typeof window.setNotice === 'function') window.setNotice('auth-msg', message, 'err');
      else {
        const notice = document.getElementById('auth-msg');
        if (notice) {
          notice.textContent = message;
          notice.classList.add('err');
        }
      }
    } catch {}
  }

  const boot = () => {
    enhanceRecovery();
    showRecoveryError();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
