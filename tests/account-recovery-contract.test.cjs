const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = fs.readFileSync('account-recovery-bootstrap.cjs', 'utf8');
const start = fs.readFileSync('start.cjs', 'utf8');
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
const ui = fs.readFileSync('public/shared/account-recovery-ui.js', 'utf8');

function blockBetween(source, from, to) {
  const startIndex = source.indexOf(from);
  const endIndex = source.indexOf(to, startIndex + from.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `${from} source block should be present`);
  return source.slice(startIndex, endIndex);
}

test('recovery runtime is installed before the bundled server and shipped in the production image', () => {
  assert.match(start, /installOauthAuthorizeRecoveryBootstrap\(\);[\s\S]*installAccountRecoveryBootstrap\(\);[\s\S]*require\('\.\/dist\/server\.cjs'\)/);
  assert.match(start, /\/shared\/account-recovery-ui\.js/);
  assert.match(dockerfile, /COPY account-recovery-bootstrap\.cjs \.\/account-recovery-bootstrap\.cjs/);
});

test('Discord recovery trusts immutable Discord ID and tolerates username changes', () => {
  const block = blockBetween(runtime, 'async function sendRecoveryCodeToDiscord', '\nfunction canonicalRecoveryOrigin');
  assert.match(block, /discord_id/);
  assert.match(block, /identityResponse[\s\S]*discordUser\.id/);
  assert.match(block, /UPDATE users SET discord_username/);
  assert.doesNotMatch(block, /discordUser\?\.username[^\n]+!==[^\n]+linkedUsername/);
});

test('provider-owned identities can request and consume Discord recovery codes', () => {
  const requestBlock = blockBetween(runtime, 'async function requestRecoveryCode', '\nasync function resetPassword');
  const resetBlock = blockBetween(runtime, 'async function resetPassword', '\nfunction recoveryFailureRedirect');
  assert.match(requestBlock, /FROM users[\s\S]*WHERE username = \?/);
  assert.doesNotMatch(requestBlock, /password_hash != 'SYSTEM_NO_LOGIN'/);
  assert.match(resetBlock, /SELECT id, password_hash FROM users WHERE username = \?/);
  assert.doesNotMatch(resetBlock, /password_hash != 'SYSTEM_NO_LOGIN'/);
  assert.match(resetBlock, /claimedProviderOwnedIdentity/);
});

test('failed Discord delivery never replaces the saved code and always offers SPMT Twitch fallback', () => {
  const requestBlock = blockBetween(runtime, 'async function requestRecoveryCode', '\nasync function resetPassword');
  assert.match(requestBlock, /if \(delivered\) \{[\s\S]*saveRecoveryCode/);
  assert.match(requestBlock, /fallbackUrl: '\/api\/auth\/recover\/twitch'/);
  assert.match(ui, /No DM\? Verify with Twitch/);
});

test('Twitch recovery callback is canonical to spmt.live in production and ignores stale redirect overrides', () => {
  const originBlock = blockBetween(runtime, 'function canonicalRecoveryOrigin', '\nfunction issueProviderIdentityTicket');
  const twitchBlock = blockBetween(runtime, 'function startTwitchRecovery', '\nasync function finishTwitchRecovery');
  const callbackBlock = blockBetween(runtime, 'async function finishTwitchRecovery', '\nfunction installRoutes');
  assert.match(originBlock, /if \(production\) return 'https:\/\/spmt\.live'/);
  assert.match(twitchBlock, /\/api\/auth\/recover\/twitch\/callback/);
  assert.match(callbackBlock, /\/api\/auth\/provider-claim/);
  assert.doesNotMatch(runtime, /SPMT_TWITCH_RECOVERY_REDIRECT_URI/);
  assert.doesNotMatch(runtime, /discord-stream-hub-new\.fly\.dev/);
});
