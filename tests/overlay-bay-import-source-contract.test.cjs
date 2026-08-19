const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Overlay Bay can stage a generic imported Web source without auto-saving', () => {
  const source = read('public/shared/overlay-bay-import-source.js');
  const html = read('public/shared/index.html');

  assert.match(html, /overlay-bay-import-source\.js/);
  assert.match(source, /surfaceId !== 'overlays'/);
  assert.match(source, /params\.get\('sourceUrl'\)/);
  assert.match(source, /params\.get\('sourceTitle'\)/);
  assert.match(source, /params\.get\('sourceKey'\)/);
  assert.match(source, /kind: 'embed'/);
  assert.match(source, /state\.overlay\.widgets/);
  assert.match(source, /sourceKey/);
  assert.match(source, /sourceUrl/);
  assert.match(source, /state\.overlayDirty = true/);
  assert.match(source, /renderOverlays\(\)/);
  assert.match(source, /existing Save overlay control/);
  assert.doesNotMatch(source, /saveOverlayWorkspace\s*\(/);
  assert.doesNotMatch(source, /api\([^\n]*overlay-workspace/);
});

test('Overlay Bay import rejects non-web protocols and dedupes saved sources', () => {
  const source = read('public/shared/overlay-bay-import-source.js');
  assert.match(source, /parsedUrl\.protocol !== 'https:'/);
  assert.match(source, /localhost/);
  assert.match(source, /widget\?\.sourceKey/);
  assert.match(source, /widget\?\.url/);
  assert.match(source, /already in Overlay Bay/);
});
