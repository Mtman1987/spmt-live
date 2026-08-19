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

type ProviderIdentity = {
  id: string;
  password_hash: string;
  discord_id: string | null;
  twitch_id: string | null;
  twitch_username: string | null;
  avatar_url?: string | null;
};

export type VerifiedProviderSplitResult = {
  merged: boolean;
  canonicalUserId?: string;
  duplicateUserId?: string;
  xpRowsMoved: number;
  xpDeltaMoved: number;
  reason?: string;
};

function hasTable(database: Database.Database, tableName: string) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

/**
 * Consolidates the safe form of a verified provider split created by the
 * historical one-provider import path. The caller must have independently
 * verified both immutable provider IDs and must run this inside its onboarding
 * transaction. Accounts that have ever had a password or already contain a
 * cross-provider link still require manual crew review.
 */
export function reconcileVerifiedProviderSplit(
  database: Database.Database,
  discordUser: ProviderIdentity,
  twitchUser: ProviderIdentity,
): VerifiedProviderSplitResult {
  if (discordUser.id === twitchUser.id) {
    return { merged: false, canonicalUserId: discordUser.id, xpRowsMoved: 0, xpDeltaMoved: 0, reason: 'already-unified' };
  }

  const safeProviderOwnedSplit = discordUser.password_hash === 'SYSTEM_NO_LOGIN'
    && twitchUser.password_hash === 'SYSTEM_NO_LOGIN'
    && Boolean(discordUser.discord_id)
    && !discordUser.twitch_id
    && Boolean(twitchUser.twitch_id)
    && !twitchUser.discord_id;
  if (!safeProviderOwnedSplit) {
    return { merged: false, xpRowsMoved: 0, xpDeltaMoved: 0, reason: 'manual-review-required' };
  }

  let xpRowsMoved = 0;
  let xpDeltaMoved = 0;
  if (hasTable(database, 'xp_ledger')) {
    const summary = database.prepare(`
      SELECT COUNT(*) AS rows, COALESCE(SUM(delta), 0) AS delta
      FROM xp_ledger
      WHERE user_id = ?
    `).get(twitchUser.id) as { rows: number; delta: number };
    xpRowsMoved = summary.rows;
    xpDeltaMoved = summary.delta;
    database.prepare('UPDATE xp_ledger SET user_id = ? WHERE user_id = ?')
      .run(discordUser.id, twitchUser.id);
  }

  // Release the immutable Twitch identity before attaching it to the
  // Discord-canonical row. The unused provider-owned row remains as a harmless
  // historical shell so unrelated foreign-key data is never deleted.
  database.prepare('UPDATE users SET twitch_username = NULL, twitch_id = NULL WHERE id = ?')
    .run(twitchUser.id);
  database.prepare(`
    UPDATE users
    SET twitch_username = ?, twitch_id = ?, avatar_url = COALESCE(avatar_url, ?)
    WHERE id = ?
  `).run(twitchUser.twitch_username, twitchUser.twitch_id, twitchUser.avatar_url || null, discordUser.id);

  if (hasTable(database, 'account_recovery_codes')) {
    database.prepare('DELETE FROM account_recovery_codes WHERE user_id = ?').run(twitchUser.id);
  }
  if (hasTable(database, 'provider_identity_tickets')) {
    database.prepare('DELETE FROM provider_identity_tickets WHERE user_id IN (?, ?)')
      .run(discordUser.id, twitchUser.id);
  }

  return {
    merged: true,
    canonicalUserId: discordUser.id,
    duplicateUserId: twitchUser.id,
    xpRowsMoved,
    xpDeltaMoved,
  };
}

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
