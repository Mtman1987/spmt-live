(() => {
  'use strict';
  if (window.__spmtTenantTextRuntimeInstalled) return;
  window.__spmtTenantTextRuntimeInstalled = true;

  const parts = location.pathname.split('/').filter(Boolean);
  const tenant = decodeURIComponent(parts[1] || '').toLowerCase();
  const output = parts[2] === 'personal' ? 'personal' : 'public';
  if (!tenant) return;

  function applyWidgetStyle(element, widget) {
    if (!element || !widget) return;
    element.style.fontFamily = widget.fontFamily || 'Inter, ui-sans-serif, system-ui, sans-serif';
    element.style.fontWeight = String(widget.fontWeight || 900);
    element.style.fontStyle = widget.fontStyle === 'italic' ? 'italic' : 'normal';
    element.style.textDecoration = widget.textDecoration === 'underline' ? 'underline' : 'none';
    element.style.letterSpacing = `${Number(widget.letterSpacing) || 0}px`;
    element.style.lineHeight = String(Math.max(.7, Math.min(3, Number(widget.lineHeight) || 1.05)));
    element.style.background = widget.backgroundEnabled ? (widget.backgroundColor || '#000000') : 'transparent';
    element.style.textShadow = widget.textShadow === false ? 'none' : '0 3px 18px rgba(0,0,0,.8)';
  }

  async function refresh() {
    try {
      const response = await fetch(`/api/tenant/${encodeURIComponent(tenant)}/${output}`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json();
      const widgets = Array.isArray(data?.layout?.widgets) ? data.layout.widgets : [];
      for (const widget of widgets) {
        if (widget?.kind !== 'text') continue;
        const section = document.querySelector(`[data-tenant-widget="${CSS.escape(String(widget.id || ''))}"]`);
        applyWidgetStyle(section?.querySelector('.tenant-text'), widget);
      }
    } catch {}
  }

  const observer = new MutationObserver(() => void refresh());
  const start = () => {
    void refresh();
    observer.observe(document.getElementById('scene') || document.body, { childList: true, subtree: true });
    window.setInterval(() => void refresh(), 2500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
