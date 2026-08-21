const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = fs.readFileSync('account-recovery-bootstrap.cjs', 'utf8');
const adminRuntime = fs.readFileSync('admin-recovery-bootstrap.cjs', 'utf8');
const commlinkRichRuntime = fs.readFileSync('commlink-rich-chat-bootstrap.cjs', 'utf8');
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
  assert.match(start, /installOauthAuthorizeRecoveryBootstrap\(\);[\s\S]*installAccountRecoveryBootstrap\(\);[\s\S]*installAdminRecoveryBootstrap\(\);[\s\S]*require\('\.\/dist\/server\.cjs'\)/);
  assert.match(start, /\/shared\/account-recovery-ui\.js/);
  assert.match(dockerfile, /COPY account-recovery-bootstrap\.cjs \.\/account-recovery-bootstrap\.cjs/);
  assert.match(dockerfile, /COPY admin-recovery-bootstrap\.cjs \.\/admin-recovery-bootstrap\.cjs/);
});

test('canonical Commlink rich chat renderer is installed before serving and shipped in production', () => {
  assert.match(start, /installCommlinkRichChatBootstrap\(\);[\s\S]*installPresenceBootstrap\(\)/);
  assert.match(dockerfile, /COPY commlink-rich-chat-bootstrap\.cjs \.\/commlink-rich-chat-bootstrap\.cjs/);
  assert.match(commlinkRichRuntime, /friendlyChannelName/);
  assert.match(commlinkRichRuntime, /inline-chat-emote/);
  assert.match(commlinkRichRuntime, /discord-embed-card/);
  assert.match(commlinkRichRuntime, /discord: item\.meta\?\.discord/);
});

test('canonical Commlink rich chat renderer is idempotent on real Commlink assets', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-commlink-rich-'));
  const tempJs = path.join(tempRoot, 'commlink.js');
  const tempCss = path.join(tempRoot, 'commlink.css');
  fs.copyFileSync('public/commlink/commlink.js', tempJs);
  fs.copyFileSync('public/commlink/commlink.css', tempCss);

  const previousJs = process.env.SPMT_COMMLINK_JS_PATH;
  const previousCss = process.env.SPMT_COMMLINK_CSS_PATH;
  process.env.SPMT_COMMLINK_JS_PATH = tempJs;
  process.env.SPMT_COMMLINK_CSS_PATH = tempCss;
  try {
    const { installCommlinkRichChatBootstrap } = require('../commlink-rich-chat-bootstrap.cjs');
    installCommlinkRichChatBootstrap();
    const onceJs = fs.readFileSync(tempJs, 'utf8');
    const onceCss = fs.readFileSync(tempCss, 'utf8');
    installCommlinkRichChatBootstrap();
    const twiceJs = fs.readFileSync(tempJs, 'utf8');
    const twiceCss = fs.readFileSync(tempCss, 'utf8');

    assert.equal(twiceJs, onceJs);
    assert.equal(twiceCss, onceCss);
    assert.equal((onceJs.match(/function renderProviderChatText\(/g) || []).length, 1);
    assert.equal((onceCss.match(/\.inline-chat-emote\s*\{/g) || []).length, 1);
    assert.match(onceJs, /(?:friendlyChannelName|humanChannelLabel)\(provider, channel\.channelName/);
    assert.match(onceJs, /message\.discord\?\.embeds/);
  } finally {
    if (previousJs === undefined) delete process.env.SPMT_COMMLINK_JS_PATH;
    else process.env.SPMT_COMMLINK_JS_PATH = previousJs;
    if (previousCss === undefined) delete process.env.SPMT_COMMLINK_CSS_PATH;
    else process.env.SPMT_COMMLINK_CSS_PATH = previousCss;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('recovery UI enhances the static form once without a self-triggering observer', () => {
  assert.match(ui, /spmtRecoveryEnhanced/);
  assert.doesNotMatch(ui, /MutationObserver/);
  assert.match(ui, /DOMContentLoaded/);
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

test('owner recovery shortcut only issues existing one-time codes and never installs a default password', () => {
  assert.match(adminRuntime, /\/api\/internal\/auth\/admin-recovery-code/);
  assert.match(adminRuntime, /SYSTEM_API_KEY/);
  assert.match(adminRuntime, /x-spmt-key/);
  assert.match(adminRuntime, /WHERE discord_id = \? AND is_admin = 1/);
  assert.match(adminRuntime, /WHERE discord_id = \?/);
  assert.match(adminRuntime, /INSERT INTO account_recovery_codes/);
  assert.match(adminRuntime, /ON CONFLICT\(user_id\) DO UPDATE/);
  assert.match(adminRuntime, /recoveryCode/);
  assert.doesNotMatch(adminRuntime, /UPDATE users SET password_hash/);
  assert.doesNotMatch(adminRuntime, /spmtpassword['"`]/i);
});

test('owner recovery shortcut verifies the requesting Discord admin before looking up the target account', () => {
  const block = blockBetween(adminRuntime, 'function issueOwnerRecoveryCode', '\nfunction installRoutes');
  const requesterIndex = block.indexOf('WHERE discord_id = ? AND is_admin = 1');
  const targetIndex = block.lastIndexOf('WHERE discord_id = ?');
  assert.ok(requesterIndex >= 0, 'requester admin lookup should be present');
  assert.ok(targetIndex > requesterIndex, 'target account lookup must happen only after requester admin verification');
  assert.match(block, /status\(403\)/);
  assert.match(block, /targets\.length !== 1/);
});
