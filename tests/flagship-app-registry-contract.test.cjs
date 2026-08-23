const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.ts'), 'utf8');

test('publishes the versioned dynamic app registry contract', () => {
  assert.match(source, /schemaVersion:\s*'spmt\.app-registry\/v1'/);
  assert.match(source, /manifestVersion:\s*'spmt\.app-manifest\/v1'/);
  assert.match(source, /supportsApprovedApps:\s*true/);
  assert.match(source, /const FIRST_PARTY_REGISTRY_METADATA/);
  assert.match(source, /approvedPartnerApps\(\)\.map\(\(app\) => registryApp\(app, false\)\)/);
});

test('declares every flagship app and its runtime health contract', () => {
  const expected = [
    ['spacemountain-live', 'https://spacemountain.live/api/health'],
    ['discord-stream-hub', 'https://discord-stream-hub-new.fly.dev/api/health'],
    ['streamweaver', 'https://streamweaver-new.fly.dev/api/health'],
    ['companion', 'https://spmt.live/api/health'],
    ['chat-tag', 'https://chat-tag-new.fly.dev/api/health'],
    ['hearmeout', 'https://hearmeout-main.fly.dev/api/health'],
    ['mountainview', 'https://mtman-machine-rotator.fly.dev/api/health'],
  ];

  for (const [id, healthUrl] of expected) {
    assert.ok(source.includes(`'${id}'`), `missing flagship app ${id}`);
    assert.ok(source.includes(`healthUrl: '${healthUrl}'`), `missing health URL for ${id}`);
  }
});

test('keeps legacy consumers compatible while adding manifest provenance', () => {
  assert.match(source, /launchUrl:\s*app\.url/);
  assert.match(source, /registrySource:\s*firstParty \? 'first-party' : 'approved-partner'/);
  assert.match(source, /capabilities:/);
  assert.match(source, /surfaces:/);
  assert.match(source, /integration:/);
  assert.match(source, /apps:\s*buildAppsForUser\(userId\)/);
});
