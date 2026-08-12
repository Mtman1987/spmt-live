'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const router = fs.readFileSync(path.join(root, 'athena-command-bootstrap.cjs'), 'utf8');
const start = fs.readFileSync(path.join(root, 'start.cjs'), 'utf8');
const alternateStart = fs.readFileSync(path.join(root, 'scripts', 'start.mjs'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

test('generic bot command router is installed in every SPMT production boot path', () => {
  assert.match(router, /app\.post\('\/api\/bot\/commands'/);
  assert.match(router, /app\.post\('\/api\/athena\/commands'/);
  assert.match(start, /installAthenaCommandBootstrap/);
  assert.match(alternateStart, /installAthenaCommandBootstrap/);
  assert.match(dockerfile, /COPY athena-command-bootstrap\.cjs/);
});

test('bot runtime routing uses SPMT session or OAuth bearer only', () => {
  assert.match(router, /cookies\.spmt_token \|\| bearer/);
  assert.match(router, /jwt\.verify\(token, secret\)/);
  assert.match(router, /Authorization: `Bearer \$\{auth\.token\}`/);

  for (const deprecated of [
    'SYSTEM_API_KEY',
    'SPMT_API_KEY',
    'x-spmt-key',
    'x-bot-secret',
    'MOUNTAINVIEW_STREAMWEAVER_SECRET',
    'SPMT_CODEX_SERVICE_SECRET',
  ]) {
    assert.equal(router.includes(deprecated), false, `runtime bot router must not use ${deprecated}`);
  }
});

test('caller identity determines the source app when OAuth provides client_id', () => {
  assert.match(router, /auth\.payload\.client_id/);
  assert.match(router, /source: sourceApp/);
});

test('generic StreamWeaver bot endpoint is canonical and Athena URL is compatibility-only', () => {
  assert.match(router, /DEFAULT_STREAMWEAVER_BOT_URL = 'https:\/\/streamweaver-new\.fly\.dev\/api\/spmt\/bot\/commands'/);
  assert.match(router, /process\.env\.STREAMWEAVER_BOT_URL/);
  assert.match(router, /process\.env\.STREAMWEAVER_ATHENA_URL/);
  assert.match(router, /There is no Athena-specific/);
});
