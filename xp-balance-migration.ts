import type Database from 'better-sqlite3';

export type XpBalanceMigrationResult = {
  migrated: boolean;
  sourceApp: string;
  observedBalance: number;
  previousSourceBalance: number;
  adjustment: number;
  migrationVersion: number;
  totalXp: number;
  migratedAt: string;
};

export function migrateLegacyXpBalance(
  database: Database.Database,
  input: {
    userId: string;
    sourceApp: string;
    observedBalance: number;
    migrationVersion: number;
    entryId: string;
    idempotencyKey: string;
    migratedAt: string;
    metadata: Record<string, unknown>;
  },
): XpBalanceMigrationResult {
  return database.transaction(() => {
    const existing = database.prepare(`
      SELECT observed_balance, previous_source_balance, adjustment, migration_version, migrated_at
      FROM xp_balance_migrations
      WHERE user_id = ? AND source_app = ?
    `).get(input.userId, input.sourceApp) as any;
    const total = () => Number((database.prepare(
      'SELECT COALESCE(SUM(delta), 0) AS xp FROM xp_ledger WHERE user_id = ?'
    ).get(input.userId) as any)?.xp || 0);

    if (existing && Number(existing.migration_version) >= input.migrationVersion) {
      return {
        migrated: false,
        sourceApp: input.sourceApp,
        observedBalance: Number(existing.observed_balance),
        previousSourceBalance: Number(existing.previous_source_balance),
        adjustment: Number(existing.adjustment),
        migrationVersion: Number(existing.migration_version),
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
        (user_id, source_app, observed_balance, previous_source_balance, adjustment, migration_version, migrated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, source_app) DO UPDATE SET
        observed_balance = excluded.observed_balance,
        previous_source_balance = excluded.previous_source_balance,
        adjustment = xp_balance_migrations.adjustment + excluded.adjustment,
        migration_version = excluded.migration_version,
        migrated_at = excluded.migrated_at
    `).run(
      input.userId,
      input.sourceApp,
      input.observedBalance,
      previousSourceBalance,
      adjustment,
      input.migrationVersion,
      input.migratedAt,
    );

    return {
      migrated: true,
      sourceApp: input.sourceApp,
      observedBalance: input.observedBalance,
      previousSourceBalance,
      adjustment,
      migrationVersion: input.migrationVersion,
      totalXp: total(),
      migratedAt: input.migratedAt,
    };
  })();
}
