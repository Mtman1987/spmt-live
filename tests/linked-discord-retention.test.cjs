const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const source = process.env.TEST_BASELINE ? execFileSync('git', ['show', 'HEAD:server.ts'], { encoding: 'utf8' }) : fs.readFileSync('server.ts', 'utf8');
const start = source.indexOf("app.post('/api/user/link'");
const end = source.indexOf('\n});', start) + 4;
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
async function run(username, storedId, members, fail = false) {
  let handler, payload, updatedId = storedId;
  const existing = { discord_username: 'registered', discord_id: storedId };
  vm.runInNewContext(code, {
    app: { post: (_path, _auth, fn) => { handler = fn; } }, authenticate() {},
    db: { prepare: sql => ({ get: () => existing, run: (...params) => { if (sql.includes('discord_id = ?')) updatedId = params[1]; } }) },
    process: { env: { DISCORD_BOT_TOKEN: 'test-token', DISCORD_GUILD_ID: 'test-guild' } },
    fetch: async () => { if (fail) throw new Error('provider unavailable'); return { ok: true, json: async () => members }; }, console,
  });
  const response = { json: data => { payload = data; }, status() { return response; } };
  await handler({ body: { discordUsername: username }, user: { id: 'test-user' } }, response);
  return { payload, updatedId };
}
test('guild search with no member preserves the previously linked Discord ID', async () => {
  const { payload, updatedId } = await run('registered', '12345', []);
  assert.equal(updatedId, '12345');
  assert.equal(payload.discordId, '12345');
  assert.equal(payload.discordVerification, 'retained');
});
test('provider outage preserves the same account link', async () => {
  const { updatedId } = await run('REGISTERED', '12345', [], true);
  assert.equal(updatedId, '12345');
});
test('a different unverified username never inherits the old Discord ID', async () => {
  const { updatedId, payload } = await run('different', '12345', []);
  assert.equal(updatedId, null);
  assert.equal(payload.discordVerified, false);
});
test('a never-linked username is not upgraded by an empty guild response', async () => {
  const { updatedId, payload } = await run('registered', null, []);
  assert.equal(updatedId, null);
  assert.equal(payload.discordVerified, false);
});
