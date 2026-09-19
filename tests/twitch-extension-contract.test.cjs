'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const backend = fs.readFileSync('twitch-extension-bootstrap.cjs', 'utf8');
const overlay = fs.readFileSync('public/twitch-extension/video-overlay.html', 'utf8');
const start = fs.readFileSync('start.cjs', 'utf8');

test('Twitch Extension verifies Twitch viewer JWTs before actions', () => {
  assert.match(backend, /TWITCH_EXTENSION_SECRET/);
  assert.match(backend, /jwt\.verify/);
  assert.match(backend, /x-extension-jwt/);
  assert.match(backend, /identity_required/);
  assert.match(backend, /rateAllowed/);
});

test('Twitch Extension exposes spotlight, follow, requests, help and TTS prompt controls', () => {
  assert.match(overlay, /Watch \+ Lurk/);
  assert.match(overlay, /Follow streamer/);
  assert.match(overlay, /Media request/);
  assert.match(overlay, /Join SpaceMountain/);
  assert.match(overlay, /Need help/);
  assert.match(overlay, /prompt_response/);
  assert.match(overlay, /followChannel/);
  assert.match(overlay, /requestIdShare/);
});

test('Twitch Extension backend is installed at process startup', () => {
  assert.match(start, /installTwitchExtensionBootstrap/);
});
