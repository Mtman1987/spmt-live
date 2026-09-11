const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(new URL('../public/shared/session-renewal.js', `file://${__filename}`), 'utf8');
function setup(refreshStatus = 200) {
  const values = new Map([['spmt_token', 'old']]);
  const requests = [];
  const events = [];
  let heartbeat;
  const window = { location: { href: 'https://spmt.live/', origin: 'https://spmt.live' }, dispatchEvent: e => events.push(e), fetch: async (input, init) => {
    requests.push({ input, init });
    return input === '/api/auth/refresh' ? new Response(JSON.stringify({ token: 'renewed' }), { status: refreshStatus }) : new Response('{}');
  } };
  vm.runInNewContext(source, { window, URL, Headers, CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } }, localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }, setInterval: fn => { heartbeat = fn; } });
  return { window, requests, values, events, heartbeat };
}
test('concurrent bridge loads renew once and use the new browser token immediately', async () => {
  const { window, requests, values, events } = setup();
  await Promise.all(Array.from({ length: 8 }, () => window.fetch('/api/session/bridge', { headers: { Authorization: 'Bearer old' } })));
  assert.equal(requests.filter(r => r.input === '/api/auth/refresh').length, 1);
  assert.ok(requests.filter(r => r.input === '/api/session/bridge').every(r => r.init.headers.get('Authorization') === 'Bearer renewed'));
  assert.equal(values.get('spmt_token'), 'renewed');
  assert.equal(events.length, 1);
});
test('outage preserves stored identity and never sends credentials to another origin', async () => {
  const { window, requests, values } = setup(503);
  await window.fetch('/api/session/bridge');
  assert.equal(values.get('spmt_token'), 'old');
  await window.fetch('https://other.example/api/session/bridge');
  assert.equal(requests.at(-1).init, undefined);
});
