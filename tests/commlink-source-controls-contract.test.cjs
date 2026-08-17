const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = fs.readFileSync('commlink-source-controls-bootstrap.cjs', 'utf8');
const start = fs.readFileSync('start.cjs', 'utf8');
const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

test('source controls ship after the rich renderer and before the server', () => {
  assert.match(start, /installCommlinkRichChatBootstrap\(\);[\s\S]*installCommlinkSourceControlsBootstrap\(\);[\s\S]*installPresenceBootstrap\(\)/);
  assert.match(dockerfile, /COPY commlink-source-controls-bootstrap\.cjs \.\/commlink-source-controls-bootstrap\.cjs/);
  assert.match(runtime, /DEFAULT_PRESENTATION_CATEGORIES/);
  assert.match(runtime, /sourceMode/);
  assert.match(runtime, /schemaVersion: 4/);
  assert.match(runtime, /guildName/);
  assert.match(runtime, /Diagnostics/);
});

test('source controls transform the real Commlink assets idempotently', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spmt-commlink-controls-'));
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
    const { installCommlinkSourceControlsBootstrap } = require('../commlink-source-controls-bootstrap.cjs');
    installCommlinkRichChatBootstrap();
    installCommlinkSourceControlsBootstrap();
    const onceJs = fs.readFileSync(tempJs, 'utf8');
    const onceCss = fs.readFileSync(tempCss, 'utf8');
    installCommlinkSourceControlsBootstrap();
    assert.equal(fs.readFileSync(tempJs, 'utf8'), onceJs);
    assert.equal(fs.readFileSync(tempCss, 'utf8'), onceCss);
    assert.doesNotMatch(onceJs, /\|\| message\.provider === 'spmt'/);
    assert.match(onceJs, /sourceMode === 'all'/);
    assert.match(onceJs, /String\(item\.sourceId \|\|/);
    assert.doesNotMatch(onceJs, /item\.channelName \|\| item\.sourceName \|\| item\.channelId \|\| 'unknown'/);
    assert.match(onceJs, /presentationCategory/);
    assert.match(onceJs, /params\.set\('categories'/);
    assert.match(onceJs, /schemaVersion: 4/);
    assert.match(onceJs, /Everything from every connected source/);
    assert.match(onceJs, /Internal delivery\/debug events \(off by default\)/);
    assert.match(onceCss, /\.workspace-source-mode/);
    assert.doesNotThrow(() => new Function(onceJs), 'transformed Commlink JavaScript should parse');
  } finally {
    if (previousJs === undefined) delete process.env.SPMT_COMMLINK_JS_PATH;
    else process.env.SPMT_COMMLINK_JS_PATH = previousJs;
    if (previousCss === undefined) delete process.env.SPMT_COMMLINK_CSS_PATH;
    else process.env.SPMT_COMMLINK_CSS_PATH = previousCss;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
