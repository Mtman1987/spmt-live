(() => {
  const clampCanonicalControls = () => {
    const saturation = document.querySelector('[data-setting="accentSaturation"]');
    if (saturation) {
      saturation.max = '100';
      if (Number(saturation.value) > 100) saturation.value = '100';
    }
  };
  new MutationObserver(clampCanonicalControls).observe(document.documentElement, { childList: true, subtree: true });
  clampCanonicalControls();
})();
