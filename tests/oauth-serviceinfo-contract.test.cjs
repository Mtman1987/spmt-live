const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('server.ts', 'utf8');

test('Discord Stream Hub has its approved canonical service OAuth scopes', () => {
  const blockStart = source.indexOf('const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT');
  const blockEnd = source.indexOf('\n};', blockStart);
  assert.ok(blockStart >= 0 && blockEnd > blockStart, 'client-credentials scope allow-list should exist');
  const serviceScopes = source.slice(blockStart, blockEnd);
  const entry = serviceScopes.match(/'discord-stream-hub': \[([^\]]+)\]/);
  assert.ok(entry, 'discord-stream-hub client-credentials scope entry should exist');
  for (const scope of ['discord:control', 'athena:write', 'identity:write', 'events:write', 'xp:write']) {
    assert.ok(entry[1].includes(`'${scope}'`), `discord-stream-hub should include ${scope}`);
  }
});

test('serviceinfo validates signed client-credentials tokens without a user session', () => {
  assert.ok(source.includes("app.get('/api/oauth/serviceinfo'"));
  assert.ok(source.includes('jwt.verify(bearer, JWT_SECRET)'));
  assert.ok(source.includes("tokenUse !== 'client_credentials'"));
  assert.ok(source.includes('client_id: clientId'));
  assert.ok(source.includes('scopes'));
});
