from pathlib import Path

path = Path('server.ts')
text = path.read_text()

old = """  'chat-tag': ['identity:read', 'game:control'],
  'spacemountain-live': ['identity:read', 'xp:write'],
};"""
new = """  'chat-tag': ['identity:read', 'game:control'],
  'spacemountain-live': ['identity:read'],
};

const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {
  'spacemountain-live': ['xp:write'],
};"""
if old not in text:
    raise SystemExit('SpaceMountain OAuth scope block not found')
text = text.replace(old, new, 1)

old = """function issueOauthAccessToken(user: any, clientId: string, scopes: string[]) {
  return jwt.sign({
    id: user.id,
    username: user.username,
    email: user.email,
    client_id: clientId,
    scopes,
    is_admin: Boolean(user.is_admin),
  }, JWT_SECRET, { expiresIn: OAUTH_ACCESS_TOKEN_SECONDS });
}
"""
new = old + """
function issueOauthClientAccessToken(clientId: string, scopes: string[]) {
  return jwt.sign({
    client_id: clientId,
    scopes,
    token_use: 'client_credentials',
  }, JWT_SECRET, { expiresIn: OAUTH_ACCESS_TOKEN_SECONDS });
}
"""
if old not in text:
    raise SystemExit('issueOauthAccessToken block not found')
text = text.replace(old, new, 1)

old = """    // First-party and user-facing apps authenticate with normal SPMT OAuth
    // access tokens. Only accept OAuth JWTs that are app-bound and explicitly
    // carry the requested platform scope.
    if (bearer) {
      try {
        const payload = jwt.verify(bearer, JWT_SECRET) as any;
        const appId = String(payload?.client_id || '').trim();
        const userId = String(payload?.id || '').trim();
        const scopes = Array.isArray(payload?.scopes) ? payload.scopes.map(String) : [];
        if (appId && userId) {
          if (!scopes.includes(requiredScope)) {
            return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
          }
          req.user = payload;
          req.platformKey = {
            id: null,
            userId,
            appId,
            name: `OAuth ${appId}`,
            keyPrefix: null,
            scopes,
            oauth: true,
          };
          return next();
        }
      } catch {
        // Authorization bearer may still be a legacy developer API key.
      }
    }
"""
new = """    // OAuth platform writes are server-to-server operations. Accept only
    // client-credentials tokens here; user/session OAuth tokens never become
    // platform write credentials, even if an older token still carries a
    // historical xp:write scope.
    if (bearer) {
      try {
        const payload = jwt.verify(bearer, JWT_SECRET) as any;
        const appId = String(payload?.client_id || '').trim();
        const tokenUse = String(payload?.token_use || '').trim();
        const scopes = Array.isArray(payload?.scopes) ? payload.scopes.map(String) : [];
        if (appId && tokenUse === 'client_credentials') {
          if (!scopes.includes(requiredScope)) {
            return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
          }
          req.platformKey = {
            id: null,
            userId: null,
            appId,
            name: `OAuth client ${appId}`,
            keyPrefix: null,
            scopes,
            oauth: true,
            service: true,
          };
          return next();
        }
      } catch {
        // Authorization bearer may still be a legacy developer API key.
      }
    }
"""
if old not in text:
    raise SystemExit('OAuth platform auth block not found')
text = text.replace(old, new, 1)

old = """app.post('/api/oauth/token', (req, res) => {
  const { code, client_id, client_secret, redirect_uri, refresh_token, grant_type } = req.body;
  if (!client_id || !client_secret) return res.status(400).json({ error: 'Missing client credentials' });

  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ? AND client_secret = ?').get(client_id, client_secret) as any;
  if (!client) return res.status(401).json({ error: 'Invalid client credentials' });

  if (grant_type === 'refresh_token' || refresh_token) {"""
new = """app.post('/api/oauth/token', (req, res) => {
  const { code, client_id, client_secret, redirect_uri, refresh_token, grant_type, scope } = req.body;
  if (!client_id || !client_secret) return res.status(400).json({ error: 'Missing client credentials' });

  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ? AND client_secret = ?').get(client_id, client_secret) as any;
  if (!client) return res.status(401).json({ error: 'Invalid client credentials' });

  if (grant_type === 'client_credentials') {
    const allowedScopes = OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT[String(client_id)] || [];
    const requestedScopes = String(scope || '').split(/\\s+/).map((value) => value.trim()).filter(Boolean);
    const scopes = requestedScopes.length ? Array.from(new Set(requestedScopes)) : allowedScopes;
    if (!scopes.length || scopes.some((value) => !allowedScopes.includes(value))) {
      return res.status(403).json({ error: 'Requested client-credentials scope is not allowed for this app' });
    }
    return res.json({
      access_token: issueOauthClientAccessToken(String(client_id), scopes),
      token_type: 'Bearer',
      expires_in: OAUTH_ACCESS_TOKEN_SECONDS,
      scopes,
    });
  }

  if (grant_type === 'refresh_token' || refresh_token) {"""
if old not in text:
    raise SystemExit('OAuth token route header not found')
text = text.replace(old, new, 1)

old = """    const scopes = JSON.parse(stored.scopes || '[]') as string[];
    const rotatedRefreshToken = issueOauthRefreshToken(user.id, client_id, scopes);"""
new = """    const storedScopes = JSON.parse(stored.scopes || '[]') as string[];
    const scopes = String(client_id) === 'spacemountain-live'
      ? storedScopes.filter((value) => value !== 'xp:write')
      : storedScopes;
    const rotatedRefreshToken = issueOauthRefreshToken(user.id, client_id, scopes);"""
if old not in text:
    raise SystemExit('OAuth refresh scopes block not found')
text = text.replace(old, new, 1)

path.write_text(text)
