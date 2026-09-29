'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'restream-auth-test-secret';
const { authUser } = require('../cloud-xbox-bootstrap.cjs');

test('valid Bearer session works when the old cookie has expired', () => {
  const bearer = jwt.sign({ id: 'owner-123' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = { headers: { cookie: 'spmt_token=expired-token', authorization: 'Bearer ' + bearer } };
  assert.equal(authUser(req)?.id, 'owner-123');
});

test('invalid Bearer token may fall back to a valid cookie', () => {
  const cookie = jwt.sign({ id: 'owner-123' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = { headers: { cookie: 'spmt_token=' + cookie, authorization: 'Bearer expired-token' } };
  assert.equal(authUser(req)?.id, 'owner-123');
});

test('invalid sessions are rejected', () => {
  const req = { headers: { cookie: 'spmt_token=expired-token', authorization: 'Bearer expired-token' } };
  assert.equal(authUser(req), null);
});
