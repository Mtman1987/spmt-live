import type Database from 'better-sqlite3';

type ReconciliationCandidate = {
  imported_user_id: string;
  canonical_user_id: string;
};

export type IdentityReconciliationResult = {
  identitiesReconciled: number;
  xpRowsMoved: number;
  xpDeltaMoved: number;
};

export function reconcileMisroutedProviderXp(
  database: Database.Database,
): IdentityReconciliationResult {
  const candidates = database.prepare(`
    SELECT
      imported.id AS imported_user_id,
      canonical.id AS canonical_user_id
    FROM users imported
    JOIN users canonical
      ON canonical.discord_id = imported.twitch_id
      AND canonical.id <> imported.id
    WHERE imported.password_hash = 'SYSTEM_NO_LOGIN'
      AND imported.discord_id IS NULL
      AND canonical.twitch_id IS NOT NULL
      AND lower(COALESCE(imported.twitch_username, '')) IN (
        lower(COALESCE(canonical.username, '')),
        lower(COALESCE(canonical.twitch_username, '')),
        lower(COALESCE(canonical.discord_username, ''))
      )
    ORDER BY datetime(imported.created_at) ASC
  `).all() as ReconciliationCandidate[];

  const totals: IdentityReconciliationResult = {
    identitiesReconciled: 0,
    xpRowsMoved: 0,
    xpDeltaMoved: 0,
  };
  if (!candidates.length) return totals;

  const xpSummary = database.prepare(`
    SELECT COUNT(*) AS rows, COALESCE(SUM(delta), 0) AS delta
    FROM xp_ledger
    WHERE user_id = ?
  `);
  const moveXp = database.prepare(`
    UPDATE xp_ledger
    SET user_id = ?
    WHERE user_id = ?
  `);

  database.transaction(() => {
    for (const candidate of candidates) {
      const summary = xpSummary.get(candidate.imported_user_id) as { rows: number; delta: number };
      if (summary.rows <= 0) continue;

      moveXp.run(candidate.canonical_user_id, candidate.imported_user_id);
      totals.identitiesReconciled += 1;
      totals.xpRowsMoved += summary.rows;
      totals.xpDeltaMoved += summary.delta;
    }
  })();

  return totals;
}
