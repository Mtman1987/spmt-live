'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../public/restream-studio-control.html'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function controller(holdClick = false) {
  const calls = [];
  let releaseClick;
  const dom = new JSDOM(html, {
    url: 'https://controller.test/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.setInterval = () => 0;
      window.setTimeout = () => 0;
      window.fetch = async (url, options = {}) => {
        if (url === '/api/cloud-xbox/status') return {
          ok: true, headers: { get: () => 'application/json' },
          json: async () => ({ running: true, mode: 'restream', viewport: { width: 1280, height: 720 } }),
        };
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({ url, body });
        if (holdClick && body?.type === 'click') await new Promise(resolve => { releaseClick = resolve; });
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
      };
    },
  });
  await tick();
  const screen = dom.window.document.getElementById('screen');
  dom.window.document.getElementById('frame').getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });
  return { dom, screen, calls, releaseClick: () => releaseClick() };
}

test('a slow remote click completes before quickly typed characters are delivered', async t => {
  const c = await controller(true);
  t.after(() => c.dom.window.close());
  c.screen.dispatchEvent(new c.dom.window.MouseEvent('pointerdown', { clientX: 400, clientY: 300, cancelable: true }));
  c.screen.dispatchEvent(new c.dom.window.KeyboardEvent('keydown', { key: 'a', code: 'KeyA', cancelable: true }));
  c.screen.dispatchEvent(new c.dom.window.KeyboardEvent('keydown', { key: 'B', code: 'KeyB', shiftKey: true, cancelable: true }));
  await tick();
  assert.deepEqual(c.calls.map(x => x.body.type), ['click']);
  c.releaseClick();
  await tick();
  assert.deepEqual(c.calls.map(x => x.body), [
    { type: 'click', x: 400, y: 300, button: 'left' },
    { type: 'text', text: 'a' },
    { type: 'text', text: 'B' },
  ]);
});

test('remote keyboard navigation and explicit paste reach the focused preview', async t => {
  const c = await controller();
  t.after(() => c.dom.window.close());
  c.screen.dispatchEvent(new c.dom.window.KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey: true, cancelable: true }));
  c.screen.dispatchEvent(new c.dom.window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', cancelable: true }));
  const paste = new c.dom.window.Event('paste', { cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'fixture text' } });
  c.screen.dispatchEvent(paste);
  await tick();
  assert.deepEqual(c.calls.map(x => x.body.type), ['key', 'key', 'text']);
  assert.equal(c.calls[0].body.modifiers, 8);
  assert.equal(c.calls[1].body.key, 'Enter');
  assert.equal(c.calls[2].body.text, 'fixture text');
  assert.equal(paste.defaultPrevented, true);
});

test('running preview removes the loading overlay and fallback typing stays masked', async t => {
  const c = await controller();
  t.after(() => c.dom.window.close());
  const empty = c.dom.window.document.getElementById('empty');
  assert.equal(empty.hidden, true);
  assert.equal(c.dom.window.getComputedStyle(empty).display, 'none');
  const input = c.dom.window.document.getElementById('text');
  assert.equal(input.type, 'password');
  input.value = 'fixture only';
  c.dom.window.document.getElementById('send').click();
  assert.equal(input.value, '');
  await tick();
  assert.equal(c.calls[0].body.text, 'fixture only');
});


test('transient Restream status timeouts do not mark a running host as stopped', () => {
  assert.match(html, /if\(running\)\{\s*setStatus\('Restream host still running/);
  assert.doesNotMatch(html, /catch\(error\)\{running=false;setStatus\(error\.message,true\)/);
  assert.match(html, /if\(!running\|\|frameBusy\)return/);
  assert.match(html, /statusTimer=setInterval\(status,5000\);frameTimer=setInterval\(refreshFrame,1200\)/);
});
