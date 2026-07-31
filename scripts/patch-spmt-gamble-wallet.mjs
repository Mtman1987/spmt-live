import fs from 'node:fs';

const file = 'server.ts';
let source = fs.readFileSync(file, 'utf8');

const anchor = "app.post('/api/platform/xp/transfer', authenticatePlatformKey('xp:write'), (req: any, res) => {";
if (!source.includes(anchor)) throw new Error('Could not find XP transfer endpoint anchor');

const block = `app.post('/api/platform/xp/gamble-settle', authenticatePlatformKey('xp:write'), (req: any, res) => {
  try {
    const sourceApp = validateRecordSlug(req.body?.sourceApp || req.platformKey.appId, 'sourceApp');
    if (req.platformKey.appId && sourceApp !== req.platformKey.appId) {
      return res.status(403).json({ error: \`This key may only settle gambling XP for \${req.platformKey.appId}\` });
    }
    const userId = String(req.body?.userId || '').trim();
    const eventType = validateRecordSlug(req.body?.eventType || 'gamble-settle', 'eventType');
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const wager = Number(req.body?.wager);
    const payout = Number(req.body?.payout);
    if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
    if (!idempotencyKey || idempotencyKey.length > 180
      || !Number.isInteger(wager) || wager < 0 || wager > 1_000_000
      || !Number.isInteger(payout) || payout < 0 || payout > 100_000_000) {
      return res.status(400).json({ error: 'userId, bounded wager and payout, and idempotencyKey are required' });
    }

    const debitKey = \`\${idempotencyKey}:wager\`;
    const refillKey = \`\${idempotencyKey}:refill\`;
    const growthKey = \`\${idempotencyKey}:growth\`;
    const existing = db.prepare(
      'SELECT id FROM xp_ledger WHERE source_app = ? AND idempotency_key IN (?, ?, ?) LIMIT 1'
    ).get(sourceApp, debitKey, refillKey, growthKey);
    if (existing) {
      return res.json({ settled: false, duplicate: true, ...getSpmtXpWallet(userId) });
    }

    const before = getSpmtXpWallet(userId);
    if (before.spendableXp < wager) {
      return res.status(409).json({ error: 'Insufficient spendable XP', ...before });
    }

    const afterWager = before.spendableXp - wager;
    const missingToLifetime = Math.max(0, before.lifetimeXp - afterWager);
    const refill = Math.min(payout, missingToLifetime);
    const overflow = Math.max(0, payout - refill);
    const compressed = Math.floor(overflow / 10);
    const matchedGrowth = Math.floor(compressed / 2);
    const discardedOverflow = overflow - (matchedGrowth * 2);
    const metadata = req.body?.metadata ?? {};
    assertPublicAppState(metadata, 'metadata');
    const now = new Date().toISOString();

    db.transaction(() => {
      if (wager > 0) {
        db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), userId, sourceApp, eventType, debitKey, -wager, JSON.stringify({ ...metadata, lifetimeEligible: false, walletAction: 'gamble-wager', wager, payout }), now);
      }
      if (refill > 0) {
        db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), userId, sourceApp, eventType, refillKey, refill, JSON.stringify({ ...metadata, lifetimeEligible: false, walletAction: 'gamble-refill', wager, payout, refill }), now);
      }
      if (matchedGrowth > 0) {
        db.prepare('INSERT INTO xp_ledger (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), userId, sourceApp, eventType, growthKey, matchedGrowth, JSON.stringify({ ...metadata, lifetimeEligible: true, walletAction: 'gamble-growth', wager, payout, overflow, compressed, matchedGrowth }), now);
      }
    })();

    const wallet = getSpmtXpWallet(userId);
    return res.status(201).json({
      settled: true,
      duplicate: false,
      wager,
      payout,
      refill,
      overflow,
      compressed,
      matchedGrowth,
      discardedOverflow,
      before,
      ...wallet,
    });
  } catch (error: any) {
    return res.status(error.statusCode || 400).json({ error: error.message || 'Gambling XP could not be settled' });
  }
});

`;

source = source.replace(anchor, block + anchor);
fs.writeFileSync(file, source);
