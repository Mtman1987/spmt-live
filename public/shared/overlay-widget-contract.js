(() => {
  if (window.SPMTOverlayWidgets) return;

  const SCENE = Object.freeze({ width: 960, height: 540 });
  const OUTPUTS = Object.freeze(['public', 'personal']);
  const KINDS = Object.freeze(['xbox', 'camera', 'screen', 'image', 'embed', 'text', 'alert']);
  const FITS = Object.freeze(['contain', 'cover', 'fill']);
  const MEDIA_KINDS = new Set(['xbox', 'camera', 'screen', 'image']);

  function clone(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  function normalizeWidget(input, index = 0) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : {};
    const kind = KINDS.includes(source.kind) ? source.kind : 'embed';
    const fallbackWidth = kind === 'xbox' ? SCENE.width : kind === 'screen' ? 640 : kind === 'alert' ? 520 : 360;
    const fallbackHeight = kind === 'xbox' ? SCENE.height : kind === 'screen' ? 360 : 220;
    const normalized = {
      ...source,
      id: String(source.id || `${kind}-${Date.now()}-${index}`).slice(0, 160),
      title: String(source.title || kind).slice(0, 160),
      kind,
      visible: source.visible !== false,
      locked: Boolean(source.locked),
      interactive: source.interactive !== false,
      x: clamp(source.x, 0, 100, kind === 'xbox' ? 0 : 8),
      y: clamp(source.y, 0, 100, kind === 'xbox' ? 0 : 8),
      width: clamp(source.width, 24, SCENE.width * 2, fallbackWidth),
      height: clamp(source.height, 24, SCENE.height * 2, fallbackHeight),
      opacity: clamp(source.opacity, 0, 1, 1),
      zIndex: clamp(source.zIndex, -100000, 100000, kind === 'xbox' ? 0 : index + 1),
    };
    if (MEDIA_KINDS.has(kind)) normalized.fit = FITS.includes(source.fit) ? source.fit : (kind === 'camera' ? 'cover' : 'contain');
    return normalized;
  }

  function emptyLayout() {
    return {
      schemaVersion: 3,
      scene: { ...SCENE },
      enabled: true,
      widgets: [],
      workflows: [],
    };
  }

  function normalizeLayout(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : {};
    return {
      ...source,
      schemaVersion: Math.max(3, Number(source.schemaVersion) || 0),
      scene: { ...SCENE },
      enabled: source.enabled !== false,
      widgets: Array.isArray(source.widgets) ? source.widgets.map(normalizeWidget) : [],
      workflows: Array.isArray(source.workflows) ? source.workflows : [],
    };
  }

  function isMediaKind(kind) {
    return MEDIA_KINDS.has(kind);
  }

  function fullScene(widget, fit = null) {
    const next = normalizeWidget(widget);
    next.x = 0;
    next.y = 0;
    next.width = SCENE.width;
    next.height = SCENE.height;
    if (fit && isMediaKind(next.kind) && FITS.includes(fit)) next.fit = fit;
    return next;
  }

  function centered(widget) {
    const next = normalizeWidget(widget);
    next.x = Math.max(0, (100 - (next.width / SCENE.width) * 100) / 2);
    next.y = Math.max(0, (100 - (next.height / SCENE.height) * 100) / 2);
    return next;
  }

  function setGeometry(widget, patch = {}) {
    return normalizeWidget({ ...widget, ...patch });
  }

  window.SPMTOverlayWidgets = Object.freeze({
    scene: SCENE,
    outputs: OUTPUTS,
    kinds: KINDS,
    fits: FITS,
    normalizeWidget,
    normalizeLayout,
    emptyLayout,
    isMediaKind,
    fullScene,
    centered,
    setGeometry,
  });
})();
