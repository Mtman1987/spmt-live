'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bootstrap = fs.readFileSync(path.join(root, 'commlink-production-bootstrap.cjs'), 'utf8');
const start = fs.readFileSync(path.join(root, 'start.cjs'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

test('production Commlink removes demo fixtures and uses only authenticated dispatch', () => {
  assert.match(bootstrap, /Reset unsaved changes/);
  assert.match(bootstrap, /Changes are local until saved to your SPMT account/);
  assert.match(bootstrap, /handleAccountSessionAction/);
  assert.match(bootstrap, /\/api\/auth\/logout/);
  assert.match(bootstrap, /return dispatchComposer\(\)/);
  assert.match(bootstrap, /PixelRanger/); // forbidden-list guard proves this fixture is checked at startup
  assert.match(bootstrap, /Synthetic preview mode/); // forbidden-list guard proves preview copy is checked at startup
});

test('production Commlink transformation is idempotent on the real post-routing assets', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-commlink-production-'));
  const tempJs = path.join(tempRoot, 'commlink.js');
  const tempCss = path.join(tempRoot, 'commlink.css');
  const tempHtml = path.join(tempRoot, 'index.html');
  fs.copyFileSync(path.join(root, 'public/commlink/commlink.js'), tempJs);
  fs.copyFileSync(path.join(root, 'public/commlink/commlink.css'), tempCss);
  fs.copyFileSync(path.join(root, 'public/commlink/index.html'), tempHtml);

  const prior = {
    js: process.env.SPMT_COMMLINK_JS_PATH,
    css: process.env.SPMT_COMMLINK_CSS_PATH,
    html: process.env.SPMT_COMMLINK_INDEX_PATH,
  };
  process.env.SPMT_COMMLINK_JS_PATH = tempJs;
  process.env.SPMT_COMMLINK_CSS_PATH = tempCss;
  process.env.SPMT_COMMLINK_INDEX_PATH = tempHtml;

  try {
    const { installCommlinkRichChatBootstrap } = require('../commlink-rich-chat-bootstrap.cjs');
    const { installCommlinkSourceControlsBootstrap } = require('../commlink-source-controls-bootstrap.cjs');
    const { installCommlinkIdentityRoutingBootstrap } = require('../commlink-identity-routing-bootstrap.cjs');
    const { installCommlinkProductionBootstrap } = require('../commlink-production-bootstrap.cjs');

    installCommlinkRichChatBootstrap();
    installCommlinkSourceControlsBootstrap();
    installCommlinkIdentityRoutingBootstrap();
    installCommlinkProductionBootstrap();

    const onceJs = fs.readFileSync(tempJs, 'utf8');
    const onceCss = fs.readFileSync(tempCss, 'utf8');
    const onceHtml = fs.readFileSync(tempHtml, 'utf8');
    installCommlinkProductionBootstrap();

    assert.equal(fs.readFileSync(tempJs, 'utf8'), onceJs);
    assert.equal(fs.readFileSync(tempCss, 'utf8'), onceCss);
    assert.equal(fs.readFileSync(tempHtml, 'utf8'), onceHtml);

    assert.match(onceHtml, /SPMT-owned Commlink workspace/);
    assert.match(onceHtml, /Reset unsaved changes/);
    assert.match(onceHtml, /id="account-session-action"/);
    assert.match(onceHtml, /All messages/);
    assert.match(onceJs, /async function simulateSend\(\) \{\n  return dispatchComposer\(\);\n\}/);
    assert.match(onceJs, /\/api\/auth\/logout/);
    assert.match(onceJs, /Signed into SPMT as/);
    assert.doesNotMatch(onceJs, /const demoMode/);
    assert.doesNotMatch(onceJs, /const defaultSources/);
    assert.doesNotMatch(onceJs, /PixelRanger/);
    assert.doesNotMatch(onceJs, /creatorA/);
    assert.doesNotMatch(onceJs, /Synthetic preview mode/);
    assert.doesNotMatch(onceJs, /Synthetic message added/);
    assert.doesNotMatch(onceJs, /name: 'Mountain Crew'/);
    assert.doesNotMatch(onceHtml, /Reset preview/);
    assert.doesNotThrow(() => new Function(onceJs), 'production Commlink JavaScript should parse');
  } finally {
    if (prior.js === undefined) delete process.env.SPMT_COMMLINK_JS_PATH; else process.env.SPMT_COMMLINK_JS_PATH = prior.js;
    if (prior.css === undefined) delete process.env.SPMT_COMMLINK_CSS_PATH; else process.env.SPMT_COMMLINK_CSS_PATH = prior.css;
    if (prior.html === undefined) delete process.env.SPMT_COMMLINK_INDEX_PATH; else process.env.SPMT_COMMLINK_INDEX_PATH = prior.html;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('production startup installs and packages the production Commlink bootstrap', () => {
  assert.match(start, /commlink-production-bootstrap\.cjs/);
  assert.match(start, /installCommlinkProductionBootstrap/);
  assert.match(dockerfile, /COPY commlink-production-bootstrap\.cjs/);
});
