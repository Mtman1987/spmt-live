const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('server.ts', 'utf8');

test('Discord Stream Hub has only its approved service OAuth scopes', () => {
  assert.match(source, /'discord-stream-hub': \['discord:control', 'athena:write'\]/);
});

test('serviceinfo validates signed client-credentials tokens without a user session', () => {
  assert.match(source, /app\.get\('/api/oauth/serviceinfo'[\s\S]*jwt\.verify\(bearer, JWT_SECRET\)[\s\S]*tokenUse !== 'client_credentials'[\s\S]*client_id: clientId[\s\S]*scopes/);
});
