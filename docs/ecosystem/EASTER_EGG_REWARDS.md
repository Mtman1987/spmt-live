# Easter egg rewards

Updated 2026-09-10. This supersedes the separate Lord Puzzler reward described in the original Commlink integration plan.

`easter-egg-state.cjs` is the shared authority for the Commlink discovery panel and StreamWeaver's internal entitlement lookup. The three account-scoped completion flags are `rocket`, `blackHole`, and `signal` in `app_state_records`, app `spacemountain-live`, namespace `easter-eggs`. All three grant **Voidwalker** and expose **The Count** in the Commlink collection. The existing `count-puzzle` collection identifier remains compatible.

Existing progress is reconciled when the account's discoveries, egg state, or bot entitlement are read:

| Saved evidence | Canonical credit |
| --- | --- |
| `user_discoveries.battle-arena`, or an existing `spacemountain-live/arena` account record | `rocket` |
| `user_discoveries.cosmo-black-hole` | `blackHole` |
| `user_discoveries.commlink-constellation` | `signal` |

The original puzzle POST URLs remain compatible. No replay is needed when saved evidence exists. Accounts with no server-side discovery evidence cannot be backfilled by guessing. Reconciliation preserves timestamps, metadata and signal wins; a partial egg-state write cannot clear earned completion.

The reward notification uses a deterministic per-account ID and is inserted in the same SQLite transaction as reconciliation/rocket completion. Repeated reads or retries do not issue duplicate notifications. Commlink refreshes discoveries on focus, visibility changes and local egg completion events.

SpaceMountain records portal entry through authenticated `POST /api/easter-eggs/rocket/complete`. The request must include the same `userId` as the authenticated SPMT session. The server merges the completion atomically and returns the saved record. The client only announces success after checking `data.eggs.rocket.completed === true`.

A failed request is retried with bounded backoff and on reconnect/focus. A tab-scoped pending queue survives reload and OAuth return; receipts are bound to their original SPMT account. Guests and failures before account identification require signing in and re-entering the portal. Existing Arena state also recovers historical missing rocket receipts.

Owner test grants are disabled by default. `SPMT_EASTER_EGG_TEST_USERNAMES` explicitly enables them for matching admin accounts only; existing saved progress is not removed.

Validation: `npm test` includes real SQLite reconciliation/idempotency/isolation tests and authenticated HTTP checks. SpaceMountain's `test:rocket-easter-egg` includes lost-response recovery, account switching, false success, guest handling and unavailable browser storage.

## Discord role fulfillment

Winning also enqueues a durable `easter_egg_role_jobs` entry. DiscordStreamHub polls through its existing `identity:write` OAuth service identity, claims leased jobs, and assigns the **Voidwalker** role in the configured community guild. Only after the title is confirmed does it remove the configured clue role plus held roles named **Signal Seeker** or **Signal Hunter**. Unrelated Discord roles are preserved. Winners cannot rejoin the clue role through the existing hunt panel.

A missing title role is created with no extra permissions. Role IDs are saved in DSH's volume-backed database. Missing guild membership, bot permissions/hierarchy, rate limits and outages leave work retryable; an expired lease recovers interrupted runs. An acknowledgement is accepted only for the claimed account and its current linked Discord ID. Accounts without a linked Discord identity wait until one is linked. The first worker poll reconciles already-saved winners, so the existing tenant also receives the role without having to win again.
