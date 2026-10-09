const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

function fixture(sourceLink) {
  const dom = new JSDOM('<div class="obv2-source-toolbar"></div>', { url: 'https://spmt.live/overlay-bay' });
  const state = { overlay: { widgets: [] } };
  const context = vm.createContext({ window: dom.window, document: dom.window.document,
    MutationObserver: dom.window.MutationObserver, state, prompt: () => sourceLink,
    setStatus() {}, renderOverlays() {}, URL });
  vm.runInContext(fs.readFileSync('public/shared/overlay-app-catalog.js', 'utf8'), context);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  const button = [...dom.window.document.querySelectorAll('[data-app-overlay-index]')]
    .find(el => el.textContent.includes('Twitch Song Requests'));
  assert.ok(button, 'Twitch song requests are discoverable in Overlay Bay');
  return { dom, state, button };
}

test('Overlay Bay adds the supplied signed Twitch source as a full-size web widget', () => {
  const f = fixture('https://hearmeout-main.fly.dev/overlay/twitch-321?sourceKey=capability-321&clean=0');
  try {
    f.button.click();
    assert.equal(f.state.overlay.widgets.length, 1);
    const widget = f.state.overlay.widgets[0];
    const url = new URL(widget.url);
    assert.equal(url.pathname, '/overlay/twitch-321');
    assert.equal(url.searchParams.get('sourceKey'), 'capability-321');
    assert.equal(url.searchParams.get('clean'), '1');
    assert.equal(url.searchParams.get('media'), 'music');
    assert.equal(widget.kind, 'embed'); assert.equal(widget.width, 960); assert.equal(widget.height, 540);
    assert.equal(f.state.overlayDirty, true);
  } finally { f.dom.window.close(); }
});

for (const url of ['https://example.com/overlay/twitch-321?sourceKey=x',
  'https://hearmeout-main.fly.dev/overlay/private-room?sourceKey=x',
  'https://hearmeout-main.fly.dev/overlay/twitch-321', '']) {
  test('Overlay Bay refuses an incomplete or unrelated music source: ' + url, () => {
    const f = fixture(url);
    try { f.button.click(); assert.equal(f.state.overlay.widgets.length, 0); }
    finally { f.dom.window.close(); }
  });
}
