'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bootstrap = fs.readFileSync(path.join(root, 'commlink-identity-routing-bootstrap.cjs'), 'utf8');
const start = fs.readFileSync(path.join(root, 'start.cjs'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

test('Commlink identity bootstrap makes SPMT ownership and signed-in identity explicit', () => {
  assert.match(bootstrap, /SPMT-owned Commlink workspace/);
  assert.match(bootstrap, /Signed into SPMT as/);
  assert.match(bootstrap, /Twitch channel:/);
  assert.match(bootstrap, /bot send identity is separate/);
  assert.match(bootstrap, /\/api\/me/);
  assert.match(bootstrap, /credentials: 'include'/);
  assert.match(bootstrap, /account-avatar-image/);
});

test('Commlink identity bootstrap preserves selected destinations across live source refreshes', () => {
  assert.match(bootstrap, /selectedBeforeRefresh/);
  assert.match(bootstrap, /previousSources\.get\(id\)/);
  assert.match(bootstrap, /sourceByProviderChannel\.get\(key\)/);
  assert.match(bootstrap, /rememberSpaceDestinations\(\)/);
});

test('Commlink identity bootstrap keeps Discord channels specific and distinct', () => {
  assert.match(bootstrap, /function humanChannelLabel/);
  assert.match(bootstrap, /function canonicalCommlinkSourceId/);
  assert.match(bootstrap, /replace\(\/\^discord:\/i, ''\)/);
  assert.match(bootstrap, /canonicalCommlinkSourceId\(provider, channel\)/);
  assert.match(bootstrap, /canonicalCommlinkSourceId\(provider, item\)/);
  assert.doesNotMatch(bootstrap, /return 'Discord channel'/);
  assert.match(bootstrap, /channel\.channelName/);
});

test('identity routing transforms the real post-source-controls Commlink assets and remains idempotent', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-commlink-identity-'));
  const tempJs = path.join(tempRoot, 'commlink.js');
  const tempCss = path.join(tempRoot, 'commlink.css');
  const tempHtml = path.join(tempRoot, 'index.html');
  fs.copyFileSync(path.join(root, 'public/commlink/commlink.js'), tempJs);
  fs.copyFileSync(path.join(root, 'public/commlink/commlink.css'), tempCss);
  fs.copyFileSync(path.join(root, 'public/commlink/index.html'), tempHtml);

  const previousJs = process.env.SPMT_COMMLINK_JS_PATH;
  const previousCss = process.env.SPMT_COMMLINK_CSS_PATH;
  const previousHtml = process.env.SPMT_COMMLINK_INDEX_PATH;
  process.env.SPMT_COMMLINK_JS_PATH = tempJs;
  process.env.SPMT_COMMLINK_CSS_PATH = tempCss;
  process.env.SPMT_COMMLINK_INDEX_PATH = tempHtml;

  try {
    const { installCommlinkRichChatBootstrap } = require('../commlink-rich-chat-bootstrap.cjs');
    const { installCommlinkSourceControlsBootstrap } = require('../commlink-source-controls-bootstrap.cjs');
    const { installCommlinkIdentityRoutingBootstrap } = require('../commlink-identity-routing-bootstrap.cjs');
    installCommlinkRichChatBootstrap();
    installCommlinkSourceControlsBootstrap();
    installCommlinkIdentityRoutingBootstrap();

    const onceJs = fs.readFileSync(tempJs, 'utf8');
    const onceCss = fs.readFileSync(tempCss, 'utf8');
    const onceHtml = fs.readFileSync(tempHtml, 'utf8');
    installCommlinkIdentityRoutingBootstrap();

    assert.equal(fs.readFileSync(tempJs, 'utf8'), onceJs);
    assert.equal(fs.readFileSync(tempCss, 'utf8'), onceCss);
    assert.equal(fs.readFileSync(tempHtml, 'utf8'), onceHtml);
    assert.match(onceHtml, /SPMT-owned Commlink workspace/);
    assert.match(onceHtml, /account-auth-status/);
    assert.match(onceJs, /loadCommlinkIdentity\(\)/);
    assert.match(onceJs, /sourceId: canonicalCommlinkSourceId\(provider, item\)/);
    assert.match(onceJs, /id: canonicalCommlinkSourceId\(provider, channel\)/);
    assert.match(onceJs, /const sourceId = canonicalCommlinkSourceId\(provider, item\)/);
    assert.doesNotMatch(onceJs, /return 'Discord channel'/);
    assert.doesNotMatch(onceJs, /account-title'\)\.textContent = complete \? `Mountain Crew/);
    assert.doesNotThrow(() => new Function(onceJs), 'final Commlink JavaScript should parse');
  } finally {
    if (previousJs === undefined) delete process.env.SPMT_COMMLINK_JS_PATH;
    else process.env.SPMT_COMMLINK_JS_PATH = previousJs;
    if (previousCss === undefined) delete process.env.SPMT_COMMLINK_CSS_PATH;
    else process.env.SPMT_COMMLINK_CSS_PATH = previousCss;
    if (previousHtml === undefined) delete process.env.SPMT_COMMLINK_INDEX_PATH;
    else process.env.SPMT_COMMLINK_INDEX_PATH = previousHtml;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('production startup installs and packages the Commlink identity routing bootstrap', () => {
  assert.match(start, /commlink-identity-routing-bootstrap\.cjs/);
  assert.match(start, /installCommlinkIdentityRoutingBootstrap/);
  assert.match(dockerfile, /COPY commlink-identity-routing-bootstrap\.cjs/);
});
