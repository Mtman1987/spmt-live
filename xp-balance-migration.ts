import type Database from 'better-sqlite3';

export type XpBalanceMigrationResult = {
  migrated: boolean;
  sourceApp: string;
  observedBalance: number;
  previousSourceBalance: number;
  adjustment: number;
  totalXp: number;
  migratedAt: string;
};

export function migrateLegacyXpBalance(
  database: Database.Database,
  input: {
    userId: string;
    sourceApp: string;
    observedBalance: number;
    entryId: string;
    idempotencyKey: string;
    migratedAt: string;
    metadata: Record<string, unknown>;
  },
): XpBalanceMigrationResult {
  return database.transaction(() => {
    const existing = database.prepare(`
      SELECT observed_balance, previous_source_balance, adjustment, migrated_at
      FROM xp_balance_migrations
      WHERE user_id = ? AND source_app = ?
    `).get(input.userId, input.sourceApp) as any;
    const total = () => Number((database.prepare(
      'SELECT COALESCE(SUM(delta), 0) AS xp FROM xp_ledger WHERE user_id = ?'
    ).get(input.userId) as any)?.xp || 0);

    if (existing) {
      return {
        migrated: false,
        sourceApp: input.sourceApp,
        observedBalance: Number(existing.observed_balance),
        previousSourceBalance: Number(existing.previous_source_balance),
        adjustment: Number(existing.adjustment),
        totalXp: total(),
        migratedAt: String(existing.migrated_at),
      };
    }

    const previousSourceBalance = Number((database.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS xp
      FROM xp_ledger
      WHERE user_id = ? AND source_app = ?
    `).get(input.userId, input.sourceApp) as any)?.xp || 0);
    if (input.observedBalance < previousSourceBalance) {
      throw Object.assign(new Error('Observed legacy balance is below the existing source ledger balance'), {
        statusCode: 409,
        previousSourceBalance,
      });
    }

    const adjustment = input.observedBalance - previousSourceBalance;
    if (adjustment > 0) {
      database.prepare(`
        INSERT INTO xp_ledger
          (id, user_id, source_app, event_type, idempotency_key, delta, metadata_json, created_at)
        VALUES (?, ?, ?, 'legacy-balance-migration', ?, ?, ?, ?)
      `).run(
        input.entryId,
        input.userId,
        input.sourceApp,
        input.idempotencyKey,
        adjustment,
        JSON.stringify(input.metadata),
        input.migratedAt,
      );
    }
    database.prepare(`
      INSERT INTO xp_balance_migrations
        (user_id, source_app, observed_balance, previous_source_balance, adjustment, migrated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.userId,
      input.sourceApp,
      input.observedBalance,
      previousSourceBalance,
      adjustment,
      input.migratedAt,
    );

    return {
      migrated: true,
      sourceApp: input.sourceApp,
      observedBalance: input.observedBalance,
      previousSourceBalance,
      adjustment,
      totalXp: total(),
      migratedAt: input.migratedAt,
    };
  })();
}
