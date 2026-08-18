'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'signal', 'index.html'), 'utf8');
const bootstrap = fs.readFileSync(path.join(__dirname, '..', 'lost-signal-transmission-bootstrap.cjs'), 'utf8');

test('Lost Signal game is a five-minute transmitter puzzle with three carrier locks', () => {
  assert.match(source, /The Lost Signal/);
  assert.match(source, /DURATION=300000/);
  assert.match(source, /baseTargets=\[27,63,84\]/);
  assert.match(source, /CARRIER/);
  assert.match(source, /HOLD_MS=1800/);
  assert.match(source, /SIGNAL STABILIZED/);
  assert.match(source, /SIGNAL LOST/);
  assert.match(source, /Three carrier bands are out of phase/);
  assert.doesNotMatch(source, /carrier bands are drifting out of phase/i);
});

test('Lost Signal replays add win-gated carrier drift without changing the first-run prize', () => {
  assert.match(source, /previousWins>0/);
  assert.match(source, /driftSpeed=/);
  assert.match(source, /moveTargets\(dt\)/);
  assert.match(source, /Math\.max\(2\.5,4-/);
  assert.match(source, /wins:Math\.max\(1,oldWins\+1\)/);
  assert.match(source, /old\.completed===true\?1:0/);
  assert.match(source, /Command: !signal/);
});

test('Lost Signal uses generated transmissions with a warranty fallback and atmospheric audio', () => {
  assert.match(source, /\/api\/signal\/transmission/);
  assert.match(source, /packet\.fragments/);
  assert.match(source, /packet\.message/);
  assert.match(source, /spacecraft's extended warranty/);
  assert.match(source, /SpeechSynthesisUtterance/);
  assert.match(source, /createBufferSource/);
  assert.match(source, /bandpass/);
  assert.match(source, /AUDIO OFF/);
  assert.match(source, /@keyframes signalReturn/);
  assert.match(source, /successReturn/);
  assert.match(source, /setTimeout\(async\(\)=>/);
});

test('Lost Signal only claims retained authorization after bounded canonical persistence confirmation', () => {
  assert.match(source, /function showSuccessResult\(persisted\)/);
  assert.match(source, /const persistence=Promise\.race\(\[/);
  assert.match(source, /persistSignal\(\)\.then\(\(\)=>true\)\.catch\(\(\)=>false\)/);
  assert.match(source, /new Promise\(resolve=>setTimeout\(\(\)=>resolve\(false\),6000\)\)/);
  assert.match(source, /const persisted=await persistence/);
  assert.match(source, /showSuccessResult\(persisted\)/);
  assert.match(source, /persisted[\s\S]*TRANSMITTER AUTHORIZATION RETAINED/);
  assert.match(source, /TRANSMITTER AUTHORIZATION NOT RETAINED/);
  assert.doesNotMatch(source, /persistSignal\(\)\.catch\(\(\)=>\{loginWarning\.style\.display='block'\}\); setTimeout\(showSuccessResult,1900\)/);
});

test('Lost Signal transmission proxy keeps the model key server-side and falls back safely', () => {
  assert.match(bootstrap, /\/api\/signal\/transmission/);
  assert.match(bootstrap, /spmt_token/);
  assert.match(bootstrap, /jwt\.verify/);
  assert.match(bootstrap, /\/api\/internal\/lost-signal\/transmission/);
  assert.match(bootstrap, /x-spmt-key/);
  assert.match(bootstrap, /fallbackPacket/);
  assert.match(bootstrap, /completed === true \? 1 : 0/);
});

test('Lost Signal completion joins the shared canonical egg record without message wiring', () => {
  assert.match(source, /APP_ID='spacemountain-live'/);
  assert.match(source, /NAMESPACE='easter-eggs'/);
  assert.match(source, /EGG='signal'/);
  assert.match(source, /\.\.\.eggs,\[EGG\]:/);
  assert.match(source, /completed:true/);
  assert.match(source, /If-Match/);
  assert.match(source, /r\.status===409/);
  assert.doesNotMatch(source, /discord\.com\/api\/webhooks|sendWebhookMessage|manual-shoutout|eligible channels/i);
});
