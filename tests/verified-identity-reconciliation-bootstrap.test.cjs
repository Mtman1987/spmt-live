'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  CONFLICT_GATE,
  patchVerifiedIdentityReconciliation,
} = require('../verified-identity-reconciliation-bootstrap.cjs');

const root = path.resolve(__dirname, '..');

test('replaces the bundled crew-review stop with the safe provider-owned reconciliation', () => {
  const source = `before\n${CONFLICT_GATE}\nafter`;
  const patched = patchVerifiedIdentityReconciliation(source);

  assert.doesNotMatch(patched, /expected one conflict gate/);
  assert.match(patched, /safeProviderOwnedSplit/);
  assert.match(patched, /UPDATE xp_ledger SET user_id/);
  assert.match(patched, /UPDATE users SET twitch_username = NULL, twitch_id = NULL/);
  assert.match(patched, /account_recovery_codes/);
  assert.match(patched, /provider_identity_tickets/);
  assert.match(patched, /disposablePlaceholder/);
  assert.match(patched, /UPDATE users SET username/);
  assert.match(patched, /manual-review-required|Crew review is required/);
});

test('refuses a missing or already-patched bundle marker', () => {
  assert.throws(
    () => patchVerifiedIdentityReconciliation('no matching route'),
    /expected one conflict gate and found 0/,
  );
});

test('production entry patches reconciliation before loading the server bundle', () => {
  const start = fs.readFileSync(path.join(root, 'start.cjs'), 'utf8');
  const patchIndex = start.indexOf("require('./verified-identity-reconciliation-bootstrap.cjs').patchProductionServerBundle()");
  const serverIndex = start.indexOf("require('./dist/server.cjs')");
  assert.ok(patchIndex >= 0);
  assert.ok(serverIndex > patchIndex);
});
