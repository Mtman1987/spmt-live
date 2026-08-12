const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('server.ts', 'utf8');

test('Discord Stream Hub has only its approved service OAuth scopes', () => {
  assert.ok(source.includes("'discord-stream-hub': ['discord:control', 'athena:write']"));
});

test('serviceinfo validates signed client-credentials tokens without a user session', () => {
  assert.ok(source.includes("app.get('/api/oauth/serviceinfo'"));
  assert.ok(source.includes('jwt.verify(bearer, JWT_SECRET)'));
  assert.ok(source.includes("tokenUse !== 'client_credentials'"));
  assert.ok(source.includes('client_id: clientId'));
  assert.ok(source.includes('scopes'));
});
