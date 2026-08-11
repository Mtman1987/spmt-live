(() => {
  if (window.__spmtCompanionInstallerUiInstalled) return;
  window.__spmtCompanionInstallerUiInstalled = true;

  function patchCompanionCards() {
    document.querySelectorAll('#dashboard-apps .app-card, #apps-list .app-card').forEach((card) => {
      const name = card.querySelector('h3')?.textContent?.trim().toLowerCase() || '';
      if (name !== 'spacemountain companion') return;

      card.querySelectorAll('a, button, span').forEach((node) => {
        const text = node.textContent?.trim() || '';
        if (text === 'Download unsigned ZIP') node.textContent = 'Download installer';
        if (text === 'Unsigned portable beta') node.textContent = 'Unsigned installer';
      });
    });
  }

  patchCompanionCards();
  const observer = new MutationObserver(patchCompanionCards);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
