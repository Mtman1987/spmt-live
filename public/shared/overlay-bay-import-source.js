(() => {
  if (typeof surfaceId === 'undefined' || surfaceId !== 'overlays') return;
  if (typeof params === 'undefined') return;

  const requestedUrl = String(params.get('sourceUrl') || params.get('addSource') || '').trim();
  if (!requestedUrl) return;

  let parsedUrl;
  try {
    parsedUrl = new URL(requestedUrl);
  } catch {
    return;
  }

  const localhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
  if (parsedUrl.protocol !== 'https:' && !(localhost && parsedUrl.protocol === 'http:')) return;

  const sourceUrl = parsedUrl.toString();
  const sourceTitle = String(params.get('sourceTitle') || 'Games Hub Overlay').trim().slice(0, 80) || 'Games Hub Overlay';
  const sourceKey = String(params.get('sourceKey') || sourceUrl).trim().slice(0, 240) || sourceUrl;
  let staged = false;
  let attempts = 0;

  function nextZIndex(widgets) {
    return widgets.reduce((max, widget) => Math.max(max, Number(widget?.zIndex) || 0), 0) + 1;
  }

  function stageRequestedSource() {
    if (staged) return true;
    if (typeof state === 'undefined' || !state?.overlay || !Array.isArray(state.overlay.widgets)) return false;

    const existing = state.overlay.widgets.find((widget) =>
      String(widget?.sourceKey || '') === sourceKey
      || (String(widget?.kind || '') === 'embed' && String(widget?.url || '') === sourceUrl)
    );

    if (existing) {
      staged = true;
      if (typeof setStatus === 'function') {
        setStatus(`${sourceTitle} is already in Overlay Bay.`, 'ok');
      }
      return true;
    }

    const widgets = state.overlay.widgets;
    widgets.push({
      id: `games-hub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: sourceTitle,
      kind: 'embed',
      url: sourceUrl,
      sourceKey,
      sourceApp: String(params.get('app') || 'chat-tag').trim().slice(0, 50) || 'chat-tag',
      visible: true,
      locked: false,
      interactive: true,
      x: 8,
      y: 8,
      width: 640,
      height: 360,
      opacity: 1,
      zIndex: nextZIndex(widgets),
    });
    state.overlayDirty = true;
    staged = true;

    if (typeof renderOverlays === 'function') renderOverlays();
    if (typeof setStatus === 'function') {
      setStatus(`${sourceTitle} staged as a Web source. Position it, then use Overlay Bay's existing Save overlay control.`, 'ok');
    }
    return true;
  }

  if (stageRequestedSource()) return;

  const timer = window.setInterval(() => {
    attempts += 1;
    if (stageRequestedSource() || attempts >= 80) window.clearInterval(timer);
  }, 100);
})();
