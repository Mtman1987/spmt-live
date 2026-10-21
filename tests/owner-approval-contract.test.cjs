const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.ts'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'db.ts'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'owner-approvals.html'), 'utf8');

test('owner approval requests are restricted to the first read-only log scope', () => {
  assert.match(server, /body\.scope !== 'logs:read:last24h'/);
  assert.match(server, /scope TEXT NOT NULL CHECK\(scope = 'logs:read:last24h'\)/);
  assert.match(server, /status TEXT NOT NULL CHECK\(status IN \('pending','approved','rejected','consumed','expired'\)\)/);
});

test('internal request and grant delivery require a configured service secret', () => {
  assert.match(server, /SPMT_OWNER_APPROVAL_SERVICE_SECRET/);
  assert.match(server, /timingSafeEqual\(a, b\)/);
  assert.match(server, /app\.get\('\/api\/internal\/owner-approvals\/:id'/);
});

test('approval actions require an authenticated platform administrator and same-origin request', () => {
  assert.match(server, /app\.post\('\/api\/owner-approvals\/:id\/decision', authenticate, requirePlatformAdmin/);
  assert.match(server, /ownerApprovalSameOrigin\(req\)/);
  assert.match(server, /x-spmt-owner-approval-action/);
  assert.match(server, /WHERE id = \? AND status = 'pending'/);
});

test('the owner-facing page never renders a grant token', () => {
  assert.match(server, /function ownerApprovalPublic\(row: any\)/);
  assert.doesNotMatch(server.slice(server.indexOf('function ownerApprovalPublic'), server.indexOf("app.post('/api/internal/owner-approvals'")), /grant_token|grantToken/);
  assert.match(page, /Approve scoped access/);
  assert.match(page, /Reject/);
  assert.match(page, /Current blocker/);
  assert.match(page, /Proposed fix/);
});
