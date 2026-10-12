const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function handler(fetch) {
  const source = fs.readFileSync('server.ts', 'utf8');
  const start = source.indexOf("app.post('/api/commlink/transcribe'");
  const end = source.indexOf("app.post('/api/commlink/dispatch'", start);
  let route;
  const authenticate = () => {};
  const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { app: { post(path, auth, callback) { assert.equal(path, '/api/commlink/transcribe'); assert.equal(auth, authenticate); route = callback; } }, authenticate, fetch, AbortSignal });
  return route;
}
function response() { return { code: 200, body: null, status(code) { this.code = code; return this; }, setHeader() {}, json(body) { this.body = body; return this; } }; }

test('Commlink requires its signed-in session and forces free-only bounded microphone transcription', async () => {
  let request;
  const route = handler(async (url, init) => { request = { url, body: JSON.parse(init.body) }; return { status: 200, json: async () => ({ data: { transcription: 'mic test' } }) }; });
  const res = response();
  await route({ body: { base64Audio: 'UklGRg==', freeOnly: false } }, res);
  assert.equal(request.url, 'https://streamweaver-new.fly.dev/api/speech/transcribe');
  assert.equal(request.body.freeOnly, true);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.transcription, 'mic test');
});
test('Commlink rejects large or malformed clips before contacting any transcription provider', async () => {
  let calls = 0;
  const route = handler(async () => { calls++; throw new Error('must not call'); });
  for (const base64Audio of ['', 'not audio', 'A'.repeat(700001)]) {
    const res = response(); await route({ body: { base64Audio } }, res); assert.equal(res.code, 400);
  }
  assert.equal(calls, 0);
});
test('Commlink shows a service error when free transcription is unavailable', async () => {
  const route = handler(async () => { throw new Error('network'); });
  const res = response(); await route({ body: { base64Audio: 'UklGRg==' } }, res);
  assert.equal(res.code, 502);
  assert.match(res.body.error, /Free microphone transcription/);
});
