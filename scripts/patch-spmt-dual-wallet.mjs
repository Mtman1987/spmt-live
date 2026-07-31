import fs from 'node:fs';

const file = 'server.ts';
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `app.get('/api/xp', authenticate, (req: any, res) => {
  const balance = db.prepare('SELECT COALESCE(SUM(delta), 0) AS xp FROM xp_ledger WHERE user_id = ?').get(req.user.id) as any;
  const entries = db.prepare('SELECT id, source_app, event_type, delta, metadata_json, created_at FROM xp_ledger WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 100').all(req.user.id) as any[];
  const xp = Number(balance?.xp || 0);
  res.json({ xp, level: Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1, entries: entries.map((entry) => ({ id: entry.id, sourceApp: entry.source_app, eventType: entry.event_type, delta: entry.delta, metadata: JSON.parse(entry.metadata_json), createdAt: entry.created_at })) });
});`;

const newBlock = `function getSpmtXpWallet(userId: string) {
  const totals = db.prepare(\`
    SELECT
      COALESCE(SUM(delta), 0) AS spendable_xp,
      COALESCE(SUM(CASE
        WHEN delta > 0
          AND COALESCE(CAST(json_extract(metadata_json, '$.lifetimeEligible') AS INTEGER), 1) != 0
        THEN delta ELSE 0 END), 0) AS lifetime_xp
    FROM xp_ledger
    WHERE user_id = ?
  \`).get(userId) as any;
  const spendableXp = Math.max(0, Number(totals?.spendable_xp || 0));
  const lifetimeXp = Math.max(0, Number(totals?.lifetime_xp || 0));
  const rankRow = db.prepare(\`
    WITH ranked AS (
      SELECT user_id, COALESCE(SUM(CASE
        WHEN delta > 0
          AND COALESCE(CAST(json_extract(metadata_json, '$.lifetimeEligible') AS INTEGER), 1) != 0
        THEN delta ELSE 0 END), 0) AS lifetime_xp
      FROM xp_ledger
      GROUP BY user_id
    )
    SELECT 1 + COUNT(*) AS rank
    FROM ranked
    WHERE lifetime_xp > ?
  \`).get(lifetimeXp) as any;
  return {
    spendableXp,
    currentXp: spendableXp,
    lifetimeXp,
    totalXp: lifetimeXp,
    rank: Number(rankRow?.rank || 1),
    level: Math.floor(Math.sqrt(lifetimeXp / 100)) + 1,
  };
}

function serializeXpEntry(entry: any) {
  return {
    id: entry.id,
    sourceApp: entry.source_app,
    eventType: entry.event_type,
    delta: entry.delta,
    metadata: JSON.parse(entry.metadata_json || '{}'),
    createdAt: entry.created_at,
  };
}

app.get('/api/xp', authenticate, (req: any, res) => {
  const wallet = getSpmtXpWallet(req.user.id);
  const entries = db.prepare('SELECT id, source_app, event_type, delta, metadata_json, created_at FROM xp_ledger WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 100').all(req.user.id) as any[];
  res.json({ xp: wallet.spendableXp, ...wallet, entries: entries.map(serializeXpEntry) });
});

app.post('/api/platform/xp/balance', authenticatePlatformKey('xp:write'), (req: any, res) => {
  const userId = String(req.body?.userId || '').trim();
  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: serializeUser(user), ...getSpmtXpWallet(userId) });
});

app.post('/api/platform/xp/spend', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (req.platformKey.appId && sourceApp !== req.platformKey.appId) return res.status(403).json({ error: \`This key may only spend XP for \${req.platformKey.appId}\` });
    const userId = String(req.body?.userId || '').trim();
    const eventType = validateRecordSlug(req.body?.eventType || 'wallet-spend', 'eventType');
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const amount = Number(req.body?.amount);
    if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
    if (!idempotencyKey || idempotencyKey.length > 200 || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      return res.status(400).json({ error: 'userId, positive bounded amount, and idempotencyKey are required' });
    }
    const existing = db.prepare('SELECT id FROM xp_ledger WHERE source_app = ? AND idempotency_key = ?').get(sourceApp, idempotencyKey);
    if (existing) return res.json({ spent: false, duplicate: true, ...getSpmtXpWallet(userId) });
    const wallet = getSpmtXpWallet(userId);
    if (wallet.spendableXp < amount) return res.status(409).json({ error: 'Insufficient spendable XP', ...wallet });
    const metadata = { ...(req.body?.metadata || {}), lifetimeEligible: false, walletAction: 'spend' };
    assertPublicAppState(metadata, 'metadata');
    db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), userId, sourceApp, eventType, idempotencyKey, -amount, JSON.stringify(metadata), new Date().toISOString());
    res.status(201).json({ spent: true, duplicate: false, amount, ...getSpmtXpWallet(userId) });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'XP could not be spent' });
  }
});

app.post('/api/platform/xp/transfer', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (req.platformKey.appId && sourceApp !== req.platformKey.appId) return res.status(403).json({ error: \`This key may only transfer XP for \${req.platformKey.appId}\` });
    const fromUserId = String(req.body?.fromUserId || '').trim();
    const toUserId = String(req.body?.toUserId || '').trim();
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const amount = Number(req.body?.amount);
    const eventType = validateRecordSlug(req.body?.eventType || 'wallet-transfer', 'eventType');
    if (!fromUserId || !toUserId || fromUserId === toUserId || !getUserById(fromUserId) || !getUserById(toUserId)) {
      return res.status(400).json({ error: 'Two different valid users are required' });
    }
    if (!idempotencyKey || idempotencyKey.length > 180 || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      return res.status(400).json({ error: 'Positive bounded amount and idempotencyKey are required' });
    }
    const debitKey = \`\${idempotencyKey}:debit\`;
    const creditKey = \`\${idempotencyKey}:credit\`;
    const existing = db.prepare('SELECT id FROM xp_ledger WHERE source_app = ? AND idempotency_key IN (?, ?) LIMIT 1').get(sourceApp, debitKey, creditKey);
    if (existing) return res.json({ transferred: false, duplicate: true, from: getSpmtXpWallet(fromUserId), to: getSpmtXpWallet(toUserId) });
    if (getSpmtXpWallet(fromUserId).spendableXp < amount) return res.status(409).json({ error: 'Insufficient spendable XP', from: getSpmtXpWallet(fromUserId) });
    const now = new Date().toISOString();
    const metadata = { ...(req.body?.metadata || {}), lifetimeEligible: false, walletAction: 'transfer' };
    assertPublicAppState(metadata, 'metadata');
    db.transaction(() => {
      db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), fromUserId, sourceApp, eventType, debitKey, -amount, JSON.stringify({ ...metadata, direction: 'debit', otherUserId: toUserId }), now);
      db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), toUserId, sourceApp, eventType, creditKey, amount, JSON.stringify({ ...metadata, direction: 'credit', otherUserId: fromUserId }), now);
    })();
    res.status(201).json({ transferred: true, duplicate: false, amount, from: getSpmtXpWallet(fromUserId), to: getSpmtXpWallet(toUserId) });
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ error: error.message || 'XP could not be transferred' });
  }
});

app.post('/api/platform/xp/leaderboard', authenticatePlatformKey('xp:write'), (req: any, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit || 10) || 10));
  const rows = db.prepare(\`
    SELECT u.id, u.username, u.display_name, u.avatar_url,
      MAX(0, COALESCE(SUM(x.delta), 0)) AS spendable_xp,
      COALESCE(SUM(CASE
        WHEN x.delta > 0
          AND COALESCE(CAST(json_extract(x.metadata_json, '$.lifetimeEligible') AS INTEGER), 1) != 0
        THEN x.delta ELSE 0 END), 0) AS lifetime_xp
    FROM users u
    LEFT JOIN xp_ledger x ON x.user_id = u.id
    GROUP BY u.id
    ORDER BY lifetime_xp DESC, u.username ASC
    LIMIT ?
  \`).all(limit) as any[];
  res.json({ entries: rows.map((row, index) => ({ rank: index + 1, userId: row.id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, spendableXp: Number(row.spendable_xp || 0), lifetimeXp: Number(row.lifetime_xp || 0) })) });
});`;

if (!source.includes(oldBlock)) throw new Error('Could not find the existing /api/xp block');
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source);
