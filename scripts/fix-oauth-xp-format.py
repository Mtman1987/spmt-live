from pathlib import Path

path = Path('server.ts')
text = path.read_text()
old = """        if (appId && userId) {
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
        }"""
new = """        if (appId && userId) {
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
        }"""
if old not in text:
    raise SystemExit('malformed generated OAuth block not found')
path.write_text(text.replace(old, new, 1))
