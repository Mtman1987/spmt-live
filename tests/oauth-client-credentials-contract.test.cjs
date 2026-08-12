const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('server.ts', 'utf8');

test('SpaceMountain user OAuth does not carry platform XP write scope', () => {
  assert.match(source, /'spacemountain-live': \['identity:read'\],/);
  assert.doesNotMatch(source, /'spacemountain-live': \['identity:read', 'xp:write'\],/);
});

test('XP write is available only through SpaceMountain client credentials', () => {
  assert.match(source, /OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT[\s\S]*'spacemountain-live': \['xp:write'\]/);
  assert.match(source, /grant_type === 'client_credentials'/);
  assert.match(source, /token_use: 'client_credentials'/);
  assert.match(source, /tokenUse === 'client_credentials'/);
});

test('refresh rotation strips historical SpaceMountain xp:write user scope', () => {
  assert.match(source, /String\(client_id\) === 'spacemountain-live'[\s\S]*filter\(\(value\) => value !== 'xp:write'\)/);
});
