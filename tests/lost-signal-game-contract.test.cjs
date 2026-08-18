'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'signal', 'index.html'), 'utf8');

test('Lost Signal game is a five-minute transmitter puzzle with three carrier locks', () => {
  assert.match(source, /The Lost Signal/);
  assert.match(source, /DURATION=300000/);
  assert.match(source, /targets=\[27,63,84\]/);
  assert.match(source, /CARRIER/);
  assert.match(source, /HOLD_MS=1800/);
  assert.match(source, /SIGNAL STABILIZED/);
  assert.match(source, /SIGNAL LOST/);
  assert.match(source, /Three carrier bands are out of phase/);
  assert.doesNotMatch(source, /carrier bands are drifting out of phase/i);
});

test('Lost Signal grows the black-hole pressure and keeps the warranty reveal', () => {
  assert.match(source, /Math\.pow\(progress,2\.2\)\*5\.8/);
  assert.match(source, /urgent matter/);
  assert.match(source, /your vessel/);
  assert.match(source, /coverage may expire/);
  assert.match(source, /spacecraft\\'s extended warranty/);
  assert.match(source, /TRANSMISSION TERMINATED/);
  assert.match(source, /@keyframes signalReturn/);
  assert.match(source, /successReturn/);
  assert.match(source, /setTimeout\(showSuccessResult,1900\)/);
});

test('Lost Signal completion joins the shared canonical egg record without message wiring', () => {
  assert.match(source, /APP_ID='spacemountain-live'/);
  assert.match(source, /NAMESPACE='easter-eggs'/);
  assert.match(source, /EGG='signal'/);
  assert.match(source, /\.\.\.eggs,\[EGG\]:/);
  assert.match(source, /completed:true/);
  assert.match(source, /If-Match/);
  assert.match(source, /r\.status===409/);
  assert.match(source, /Command: !signal/);
  assert.doesNotMatch(source, /discord\.com\/api\/webhooks|sendWebhookMessage|manual-shoutout|eligible channels/i);
});
