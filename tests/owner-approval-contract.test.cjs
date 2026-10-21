const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.ts'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'db.ts'), 'utf8');

test('Rotator log access uses the narrow existing MountainView service scope', () => {
  assert.match(server, /mountainview: \['logs:read:last24h'\]/);
  assert.match(server, /app\.get\('\/api\/oauth\/serviceinfo'/);
});

test('retired owner-approval delegation endpoints and shared secrets are absent', () => {
  assert.doesNotMatch(server, /ownerApproval|owner_approval_requests|SPMT_DELEGATION_SIGNING_SECRET|SPMT_OWNER_APPROVAL_CALLBACK_SECRET|SPMT_OWNER_APPROVAL_SERVICE_SECRET/);
  assert.match(schema, /DROP TABLE IF EXISTS owner_approval_requests/);
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS owner_approval_requests/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'owner-approvals.html')), false);
});
