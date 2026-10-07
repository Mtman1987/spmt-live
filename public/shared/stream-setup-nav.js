(() => {
  if (document.querySelector('[data-stream-setup-nav]')) return;
  const link = document.createElement('a');
  link.href = '/stream-setup.html'; link.className = 'btn';
  link.dataset.streamSetupNav = 'true'; link.textContent = 'Set up streaming';
  const target = document.querySelector('#view-dashboard .card') || document.querySelector('header');
  target?.appendChild(link);
})();
