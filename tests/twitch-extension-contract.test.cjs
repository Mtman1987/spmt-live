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


test('Lounge Spotlight reads the assigned worker feed and recovers viewer playback', () => {
  const spotlight = fs.readFileSync('public/lounge-worker-spotlight.html', 'utf8');
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /spotlight-media\/worker-spotlight\.html\?v=worker-feed-2/);
  assert.match(spotlight, /hmo-dj-worker\.fly\.dev:4445\/spotlight\/hls\.js/);
  assert.match(spotlight, /worker\+'\/spotlight\/program'/);
  assert.match(spotlight, /\/spotlight\/hls\/.*\/index\.m3u8/);
  assert.match(spotlight, /video\.play\(\)\.catch/);
  assert.match(spotlight, /video\.muted=sourceMuted\|\|brb/);
  assert.doesNotMatch(spotlight, /enable-sound|policyMuted/);
  assert.doesNotMatch(spotlight, /new (?:window\.)?Twitch\.Player/);
});

test('Lounge rotates exactly one idle surface at a time: chat, leaderboard, command', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /applyActivityRotation/);
  assert.match(output, /\['chat', chat\]/);
  assert.match(output, /\['leaderboard', leaderboard\]/);
  assert.match(output, /\['command', command\]/);
  assert.match(output, /Math\.floor\(elapsed \/ 30000\) % surfaces\.length/);
  assert.match(output, /element\.style\.display = visible \? 'block' : 'none'/);
  assert.match(output, /element\.style\.visibility = visible \? 'visible' : 'hidden'/);
  assert.match(output, /element\.style\.opacity = visible \? '1' : '0'/);
});

test('active Nebula activity games suppress the idle leaderboard and chat layers', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  const bootstrap = fs.readFileSync('tenant-overlay-bootstrap.cjs', 'utf8');
  assert.match(output, /nebulaActivityActive: false/);
  assert.match(output, /data\.type === 'nebula\.activity-state'/);
  assert.match(output, /state\.nebulaActivityActive \|\| !surfaces\.length/);
  assert.match(output, /activeIndex = state\.nebulaActivityActive/);
  assert.match(bootstrap, /widget\.id === 'community-lounge-nebula-stage'[\s\S]*zIndex: 340/);
});

test('Lounge media restart remounts only the HearMeOut player iframe', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /\/api\/lounge\/media-player-restart/);
  assert.match(output, /community-lounge-hmo-media/);
  assert.match(output, /player-restart/);
  const start = output.indexOf('async function refreshLoungeMediaPlayer');
  const end = output.indexOf('// Stella\'s chat action requests one reload', start);
  const body = output.slice(start, end);
  assert.doesNotMatch(body, /location\.reload\(/);
  assert.doesNotMatch(body, /community-lounge-live-spotlight/);
});

test('Lounge renderer forces the HMO slot to the passive player even if saved state is stale', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /widget\.id === 'community-lounge-hmo-media'/);
  assert.match(output, /https:\/\/hearmeout-main\.fly\.dev\/lounge-media\/worker-media\.html\?v=worker-feed-2/);
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
  assert.match(bootstrap, /https:\/\/hearmeout-main\.fly\.dev\/lounge-media\/worker-media\.html\?v=worker-feed-2/);
  assert.match(bootstrap, /https:\/\/hearmeout-main\.fly\.dev\/spotlight-media\/worker-spotlight\.html\?v=worker-feed-2/);
  assert.doesNotMatch(bootstrap, /watch\?consumer=1&embed=1&appRoomId=system-spacemountainlive-lounge/);
});


test('interactive Lounge viewers get one local audio unlock control without changing the broadcast mix', () => {
  const output = fs.readFileSync('public/tenant-output.html', 'utf8');
  assert.match(output, /Enable Audio/);
  assert.match(output, /loungeAudioUnlockEligible/);
  assert.match(output, /spmt-lounge-unmute-pulse/);
  assert.match(output, /viewerGesture: true/);
  assert.match(output, /pointer: coarse/);
  assert.match(output, /loungeAudioUnlock.addEventListener\('click'/);
  assert.match(output, /loungeAudioUnlock.hidden = true/);
});
