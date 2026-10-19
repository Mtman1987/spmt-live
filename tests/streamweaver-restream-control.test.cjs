const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { hasStreamweaverRestreamControl } = require('../cloud-xbox-bootstrap.cjs');

const source = fs.readFileSync('cloud-xbox-bootstrap.cjs', 'utf8');

function signed(payload, secret = process.env.JWT_SECRET) {
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: 60 });
}

test('go-live service authorization accepts only scoped StreamWeaver client credentials', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'spmt-golive-test-secret';
  try {
    const valid = signed({
      client_id: 'streamweaver',
      token_use: 'client_credentials',
      scopes: ['restream:control'],
    });
    const missingScope = signed({
      client_id: 'streamweaver',
      token_use: 'client_credentials',
      scopes: ['events:write'],
    });
    const wrongClient = signed({
      client_id: 'discord-stream-hub',
      token_use: 'client_credentials',
      scopes: ['restream:control'],
    });
    const userToken = signed({
      id: 'owner-1',
      client_id: 'streamweaver',
      scopes: ['restream:control'],
    });
    const expired = jwt.sign({
      client_id: 'streamweaver',
      token_use: 'client_credentials',
      scopes: ['restream:control'],
      exp: Math.floor(Date.now() / 1000) - 1,
    }, process.env.JWT_SECRET, { algorithm: 'HS256' });

    assert.equal(hasStreamweaverRestreamControl({ headers: { authorization: `Bearer ${valid}` } }), true);
    assert.equal(hasStreamweaverRestreamControl({ headers: { authorization: `Bearer ${missingScope}` } }), false);
    assert.equal(hasStreamweaverRestreamControl({ headers: { authorization: `Bearer ${wrongClient}` } }), false);
    assert.equal(hasStreamweaverRestreamControl({ headers: { authorization: `Bearer ${userToken}` } }), false);
    assert.equal(hasStreamweaverRestreamControl({ headers: { authorization: `Bearer ${expired}` } }), false);
    assert.equal(hasStreamweaverRestreamControl({ headers: {} }), false);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('go-live endpoint is scoped, pins the owner server-side, and verifies Twitch before success', () => {
  assert.match(source, /app\.post\('\/api\/internal\/stream\/golive', authenticateStreamweaverRestreamControl/);
  assert.match(source, /function ownerUserId\(\)[\s\S]*SELECT id FROM users WHERE lower\(username\) = \? LIMIT 1[\s\S]*\.get\('mtman1987'\)/);
  assert.match(source, /workerRequest\(userId, 'POST', '\/v1\/restream\/start'/);
  assert.match(source, /if \(startResponse\.status === 409\)[\s\S]*state: 'login_required'/);
  assert.match(source, /for \(let attempt = 0; attempt < 18; attempt \+= 1\)[\s\S]*const verified = await twitchLiveState\(\)[\s\S]*state: 'live'/);
  assert.match(source, /state: 'not_live'/);
  assert.doesNotMatch(source, /return safeJson\(res, 200, startBody/);
});
