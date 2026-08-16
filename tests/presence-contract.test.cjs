'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('canonical presence service owns heartbeat, counts, and the public live list', () => {
  const bootstrap = read('presence-bootstrap.cjs');
  const header = read('public/shared/ecosystem-header.js');
  const live = read('public/live/index.html');
  const start = read('start.cjs');
  const dockerfile = read('Dockerfile');

  assert.match(bootstrap, /CREATE TABLE IF NOT EXISTS ecosystem_presence/);
  assert.match(bootstrap, /app\.post\('\/api\/presence\/heartbeat'/);
  assert.match(bootstrap, /app\.get\('\/api\/presence'/);
  assert.match(bootstrap, /PRESENCE_TTL_MS\s*=\s*90_000/);
  assert.match(bootstrap, /shareUrl:\s*'https:\/\/spmt\.live\/live\/'/);

  assert.match(header, /https:\/\/spmt\.live\/api\/presence/);
  assert.match(header, /\/heartbeat/);
  assert.match(header, /\?detail=0/);
  assert.match(header, /padStart\(2, '0'\)/);
  assert.match(header, /SPACEMOUNTAIN\.LIVE/);
  assert.match(header, /aria-current/);
  assert.match(header, /window\.self !== window\.top/);
  assert.match(header, /#spmt-ecosystem-header\{[^}]*pointer-events:none/);
  assert.match(header, /spmt-eco-brand[^}]*pointer-events:auto/);
  assert.match(header, /spmt-eco-chip[^}]*pointer-events:auto/);
  assert.match(header, /spmt-eco-total[^}]*pointer-events:auto/);

  assert.match(live, /Ecosystem Live/);
  assert.match(live, /fetch\(endpoint/);
  assert.match(live, /App \+ display name only/);
  assert.doesNotMatch(live, /\bdiscordId\b|\bdiscord_id\b/);

  assert.match(start, /\/shared\/ecosystem-header\.js/);
  assert.match(start, /presence-bootstrap\.cjs/);
  assert.match(start, /installPresenceBootstrap/);
  assert.match(dockerfile, /COPY presence-bootstrap\.cjs \.\/presence-bootstrap\.cjs/);
});
