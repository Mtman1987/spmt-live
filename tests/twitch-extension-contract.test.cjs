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


test('Lounge Twitch player preserves one viewer unlock across polling and channel changes', () => {
  const spotlight = fs.readFileSync('public/lounge-live-spotlight.html', 'utf8');
  assert.match(spotlight, /let userUnlocked = false/);
  assert.match(spotlight, /playFallback\.addEventListener\('click'/);
  assert.match(spotlight, /Enable sound/);
  assert.match(spotlight, /function unlockAudioFromGesture\(\)/);
  assert.match(spotlight, /unlockAudioFromGesture\(\)/);
  assert.match(spotlight, /if \(userUnlocked\) \{\s*clearFallback\(\)/);
  assert.match(spotlight, /playFallback\.classList\.add\('show'\)/);
  assert.match(spotlight, /forcePlay\(!userUnlocked\)/);
  assert.match(spotlight, /if \(userUnlocked\) restoreAudio\(\)/);
  assert.match(spotlight, /controls: true/);
  assert.match(spotlight, /setVolume\(effectiveVolume\(\)\)/);
  assert.match(spotlight, /setMuted\(!userUnlocked \|\| brbMuted \|\| sourceMuted \|\| effectiveVolume\(\) === 0\)/);
  assert.match(spotlight, /masterLevel = all \/ 100/);
  assert.match(spotlight, /type !== 'spmt\.obspmt\.audio'/);
  assert.match(spotlight, /Twitch volume controls/);
  assert.match(spotlight, /player\.setChannel\(clean\)/);
  assert.match(spotlight, /switchingChannel = true/);
  assert.match(spotlight, /if \(clean === currentLogin && player\) return/);
  assert.match(spotlight, /forcePlay\(true\)/);
  assert.match(spotlight, /userUnlocked = true/);
  assert.doesNotMatch(spotlight, /inset:0;display:none;place-items:center/);
  assert.doesNotMatch(spotlight, /player\.destroy\(\)/);
});

test('Lounge rotates idle leaderboard and featured chat without removing event layers', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /applyActivityRotation/);
  assert.match(output, /community-lounge-leaderboard-v2/);
  assert.match(output, /sw-featured-chat/);
  assert.match(output, /30000/);
});

test('active Nebula activity games suppress the idle leaderboard and chat layers', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  const bootstrap = fs.readFileSync('tenant-overlay-bootstrap.cjs', 'utf8');
  assert.match(output, /nebulaActivityActive: false/);
  assert.match(output, /data\.type === 'nebula\.activity-state'/);
  assert.match(output, /state\.nebulaActivityActive \|\| !showLeaderboard/);
  assert.match(output, /state\.nebulaActivityActive \|\| showLeaderboard/);
  assert.match(bootstrap, /widget\.id === 'community-lounge-nebula-stage'[\s\S]*zIndex: 340/);
});

test('Lounge renderer forces the HMO slot to the passive player even if saved state is stale', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /widget\.id === 'community-lounge-hmo-media'/);
  assert.match(output, /https:\/\/hearmeout-main\.fly\.dev\/lounge-media\/player\?v=live-lounge-1/);
});

test('Lounge can smoothly swap HearMeOut and the live stream between main and media slots', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /api\/lounge\/media-layout/);
  assert.match(output, /community-lounge-live-spotlight/);
  assert.match(output, /community-lounge-hmo-media/);
  assert.match(output, /mediaIsMain \? 'media' : 'main'/);
  assert.match(output, /mediaIsMain \? 'main' : 'media'/);
  assert.match(output, /lounge-program-swap/);
  assert.match(output, /media: \{ left: 75\.5, top: 14\.5, width: 211, height: 130 \}/);
});

test('tenant output passes clicks only to explicitly interactive layers', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /\.tenant-widget\.is-interactive,\.tenant-widget\.is-interactive iframe\{pointer-events:auto\}/);
  assert.match(output, /widget\.interactive === true \|\| widget\.interactionMode === 'interactive'/);
});

test('Lounge saved media sources use passive canonical viewers only', () => {
  const bootstrap = fs.readFileSync('tenant-overlay-bootstrap.cjs', 'utf8');
  assert.match(bootstrap, /https:\/\/hearmeout-main\.fly\.dev\/lounge-media\/player\?v=live-lounge-1/);
  assert.match(bootstrap, /https:\/\/spmt\.live\/lounge-live-spotlight\.html\?v=direct-twitch-1/);
  assert.doesNotMatch(bootstrap, /watch\?consumer=1&embed=1&appRoomId=system-spacemountainlive-lounge/);
});
