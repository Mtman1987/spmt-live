let cachedToken: string | null = null;
let validUntil = 0;
let cachedClientId: string | null = null;
let pending: Promise<string | null> | null = null;

export async function getTwitchLookupAccessToken(
  options: {
    clientId?: string;
    clientSecret?: string;
    staticToken?: string;
    fetcher?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<string | null> {
  const clientId = options.clientId ?? process.env.TWITCH_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.TWITCH_CLIENT_SECRET;
  const staticToken = options.staticToken ?? process.env.TWITCH_ACCESS_TOKEN;
  if (!clientId) return null;
  if (!clientSecret) return staticToken || null;

  const now = options.now ?? Date.now;
  if (cachedToken && cachedClientId === clientId && now() < validUntil) return cachedToken;
  if (pending) return pending;

  pending = (async () => {
    try {
      const response = await (options.fetcher ?? fetch)('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        console.warn('Twitch app token request failed:', response.status);
        return null;
      }
      const body = await response.json() as { access_token?: string; expires_in?: number };
      if (!body.access_token) return null;
      cachedToken = body.access_token;
      cachedClientId = clientId;
      validUntil = now() + Math.max(0, (Number(body.expires_in) || 0) - 300) * 1_000;
      return cachedToken;
    } catch (error) {
      console.warn('Twitch app token request failed:', error instanceof Error ? error.name : 'unknown');
      return null;
    }
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
