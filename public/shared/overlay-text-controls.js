(() => {
  'use strict';
  if (window.__spmtOverlayTextControlsInstalled) return;
  window.__spmtOverlayTextControlsInstalled = true;
  if (typeof mode !== 'undefined' && mode === 'overlay') return;

  const FONTS = [
    ['Inter', 'Inter, ui-sans-serif, system-ui, sans-serif'],
    ['Arial', 'Arial, Helvetica, sans-serif'],
    ['Georgia', 'Georgia, serif'],
    ['Times', '"Times New Roman", Times, serif'],
    ['Trebuchet', '"Trebuchet MS", sans-serif'],
    ['Verdana', 'Verdana, sans-serif'],
    ['Monospace', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'],
  ];

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));

  function currentWidget(inspector) {
    const id = inspector?.dataset?.inspectorWidget;
    return (state?.overlay?.widgets || []).find((item) => item.id === id) || null;
  }

  function markDirty() {
    try { state.overlayDirty = true; } catch {}
  }

  function rerender() {
    markDirty();
    try { renderOverlays(); } catch {}
  }

  function styleMarkup(widget) {
    const family = String(widget.fontFamily || FONTS[0][1]);
    const weight = String(widget.fontWeight || '900');
    const align = ['left', 'center', 'right'].includes(widget.align) ? widget.align : 'center';
    return `<section class="spmt-text-controls" data-spmt-text-controls>
      <div class="spmt-text-controls-title">Text</div>
      <label class="obv3-control spmt-text-wide"><span>Content</span><textarea rows="3" data-text-content>${esc(widget.text || '')}</textarea></label>
      <div class="spmt-text-grid">
        <label class="obv3-control"><span>Font</span><select data-text-font>${FONTS.map(([label, value]) => `<option value="${esc(value)}" ${family === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label class="obv3-control"><span>Size</span><input type="number" min="8" max="240" step="1" value="${Math.max(8, Number(widget.fontSize) || 42)}" data-text-size></label>
        <label class="obv3-control"><span>Weight</span><select data-text-weight>${['300','400','500','600','700','800','900'].map((value) => `<option value="${value}" ${weight === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label class="obv3-control"><span>Color</span><input type="color" value="${/^#[0-9a-f]{6}$/i.test(widget.color || '') ? widget.color : '#ffffff'}" data-text-color></label>
        <label class="obv3-control"><span>Align</span><select data-text-align>${['left','center','right'].map((value) => `<option value="${value}" ${align === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <label class="obv3-control"><span>Letter spacing</span><input type="number" min="-10" max="40" step="0.5" value="${Number(widget.letterSpacing) || 0}" data-text-letter-spacing></label>
        <label class="obv3-control"><span>Line height</span><input type="number" min="0.7" max="3" step="0.05" value="${Number(widget.lineHeight) || 1.05}" data-text-line-height></label>
        <label class="obv3-control"><span>Background</span><input type="color" value="${/^#[0-9a-f]{6}$/i.test(widget.backgroundColor || '') ? widget.backgroundColor : '#000000'}" data-text-background-color></label>
      </div>
      <div class="spmt-text-toggles">
        <label><input type="checkbox" data-text-italic ${widget.fontStyle === 'italic' ? 'checked' : ''}> Italic</label>
        <label><input type="checkbox" data-text-underline ${widget.textDecoration === 'underline' ? 'checked' : ''}> Underline</label>
        <label><input type="checkbox" data-text-background-enabled ${widget.backgroundEnabled ? 'checked' : ''}> Background</label>
        <label><input type="checkbox" data-text-shadow ${widget.textShadow === false ? '' : 'checked'}> Shadow</label>
      </div>
    </section>`;
  }

  function wire(inspector, widget) {
    const root = inspector.querySelector('[data-spmt-text-controls]');
    if (!root) return;
    const bind = (selector, eventName, apply) => root.querySelector(selector)?.addEventListener(eventName, (event) => {
      apply(event.target);
      rerender();
    });
    bind('[data-text-content]', 'input', (target) => { widget.text = target.value; });
    bind('[data-text-font]', 'change', (target) => { widget.fontFamily = target.value; });
    bind('[data-text-size]', 'change', (target) => { widget.fontSize = Math.max(8, Math.min(240, Number(target.value) || 42)); });
    bind('[data-text-weight]', 'change', (target) => { widget.fontWeight = target.value; });
    bind('[data-text-color]', 'input', (target) => { widget.color = target.value; });
    bind('[data-text-align]', 'change', (target) => { widget.align = target.value; });
    bind('[data-text-letter-spacing]', 'change', (target) => { widget.letterSpacing = Math.max(-10, Math.min(40, Number(target.value) || 0)); });
    bind('[data-text-line-height]', 'change', (target) => { widget.lineHeight = Math.max(.7, Math.min(3, Number(target.value) || 1.05)); });
    bind('[data-text-background-color]', 'input', (target) => { widget.backgroundColor = target.value; });
    bind('[data-text-italic]', 'change', (target) => { widget.fontStyle = target.checked ? 'italic' : 'normal'; });
    bind('[data-text-underline]', 'change', (target) => { widget.textDecoration = target.checked ? 'underline' : 'none'; });
    bind('[data-text-background-enabled]', 'change', (target) => { widget.backgroundEnabled = target.checked; });
    bind('[data-text-shadow]', 'change', (target) => { widget.textShadow = target.checked; });
  }

  function installStyles() {
    if (document.getElementById('spmt-overlay-text-controls-style')) return;
    const style = document.createElement('style');
    style.id = 'spmt-overlay-text-controls-style';
    style.textContent = `
      .spmt-text-controls{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.10);display:grid;gap:9px}.spmt-text-controls-title{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;color:#a5f3fc}.spmt-text-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.spmt-text-wide textarea{width:100%;resize:vertical;min-height:64px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(2,6,18,.6);color:#fff;padding:8px;font:inherit}.spmt-text-toggles{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:#cbd5e1}.spmt-text-toggles label{display:inline-flex;gap:5px;align-items:center}@media(max-width:720px){.spmt-text-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function enhance() {
    installStyles();
    const inspector = document.querySelector('[data-obv3-inspector]');
    if (!inspector || inspector.querySelector('[data-spmt-text-controls]')) return;
    const widget = currentWidget(inspector);
    if (!widget || widget.kind !== 'text') return;
    inspector.insertAdjacentHTML('beforeend', styleMarkup(widget));
    wire(inspector, widget);
  }

  const observer = new MutationObserver(enhance);
  const start = () => {
    enhance();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-inspector-widget'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
