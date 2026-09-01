'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const startSource = fs.readFileSync(path.join(root, 'start.cjs'), 'utf8');
const dockerSource = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

function functionBody(name) {
  const marker = `function ${name}()`;
  const start = startSource.indexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const nextFunction = startSource.indexOf('\nfunction ', start + marker.length);
  return startSource.slice(start, nextFunction === -1 ? startSource.length : nextFunction);
}

test('production image prepares code mutations before process startup', () => {
  assert.match(dockerSource, /RUN SPMT_PREPARE_RUNTIME=1 NODE_ENV=production node start\.cjs/);
  assert.match(dockerSource, /ENV SPMT_RUNTIME_PREPARED=1/);
  assert.match(startSource, /if \(prepareOnly \|\| !imagePrepared\) prepareRuntimeFiles\(\);/);
  assert.match(startSource, /if \(prepareOnly\) return;/);
});

test('process restart path does not rewrite shipped code or Commlink assets', () => {
  const prepare = functionBody('prepareRuntimeFiles');
  const runtime = functionBody('installProcessBootstraps');

  for (const mutator of [
    'verified-identity-reconciliation-bootstrap.cjs',
    'commlink-rich-chat-bootstrap.cjs',
    'commlink-source-controls-bootstrap.cjs',
    'commlink-identity-routing-bootstrap.cjs',
    'commlink-production-bootstrap.cjs',
  ]) {
    assert.match(prepare, new RegExp(mutator.replaceAll('.', '\\.')));
    assert.doesNotMatch(runtime, new RegExp(mutator.replaceAll('.', '\\.')));
  }

  for (const processBootstrap of [
    'commlink-feed-projection-bootstrap.cjs',
    'commlink-diagnostic-bootstrap.cjs',
    'presence-bootstrap.cjs',
    'oauth-authorize-recovery-bootstrap.cjs',
    'account-recovery-bootstrap.cjs',
    'admin-recovery-bootstrap.cjs',
    'cloud-xbox-bootstrap.cjs',
    'athena-command-bootstrap.cjs',
    'easter-egg-entitlement-bootstrap.cjs',
    'tenant-overlay-events-bootstrap.cjs',
    'tenant-overlay-bootstrap.cjs',
  ]) {
    assert.match(runtime, new RegExp(processBootstrap.replaceAll('.', '\\.')));
  }
});
