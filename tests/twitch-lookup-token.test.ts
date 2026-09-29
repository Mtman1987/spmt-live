import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTwitchLookupAccessToken } from '../twitch-lookup-token.js';

test('uses the deployed client credentials to fetch and reuse a Twitch app token', async () => {
  let calls = 0;
  const fetcher = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls++;
    assert.equal(init?.method, 'POST');
    const body = init?.body as URLSearchParams;
    assert.equal(body.get('grant_type'), 'client_credentials');
    assert.equal(body.get('client_id'), 'test-client');
    assert.equal(body.get('client_secret'), 'test-secret');
    return Response.json({ access_token: 'token-for-test', expires_in: 3600 });
  };
  const options = { clientId: 'test-client', clientSecret: 'test-secret', fetcher: fetcher as typeof fetch, now: () => 1000 };
  assert.equal(await getTwitchLookupAccessToken(options), 'token-for-test');
  assert.equal(await getTwitchLookupAccessToken(options), 'token-for-test');
  assert.equal(calls, 1);
});
