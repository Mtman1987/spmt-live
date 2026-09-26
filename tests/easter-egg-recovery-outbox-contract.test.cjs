'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('SPMT recovery outbox retains failed egg writes and replays after authentication', () => {
  const source = read('public/shared/easter-egg-recovery-outbox.js');
  assert.match(source, /spmt\.pendingEggCompletions\.v1/);
  assert.match(source, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /queueFromWriteBody/);
  assert.match(source, /http-\$\{response\.status\}/);
  assert.match(source, /network-error/);
  assert.match(source, /credentials: 'include'/);
  assert.match(source, /If-Match/);
  assert.match(source, /write\.status === 409/);
  assert.match(source, /confirmedEggs\?\.\[egg\]\?\.completed === true/);
  assert.match(source, /localStorage\.removeItem/);
});

test('production bootstrap loads the outbox before Black Hole and on Lost Signal', () => {
  const source = read('scripts/start.mjs');
  const outbox = source.indexOf("'/shared/easter-egg-recovery-outbox.js'");
  const blackHole = source.indexOf("'/shared/black-hole-easter-egg.js'");
  assert.ok(outbox >= 0);
  assert.ok(blackHole > outbox);
  assert.match(source, /public\/signal\/index\.html/);
  assert.match(source, /easter-egg-recovery-outbox\.js/);
});
