# Gate 0 backup and restore runbook

Captured 2026-07-17. The owner/operator is the `mtman-new` Fly organization and the `Mtman1987` repository owner. Secrets are never part of volume JSON and must be restored separately from Fly secrets.

| Runtime | Authority | Backup | RPO | Target RTO | Restore evidence |
| --- | --- | --- | --- | --- | --- |
| SPMT | `/data/spmt.db` SQLite | online SQLite backup plus encrypted Fly snapshots | 24 hours; take an on-demand backup before identity/schema work | 60 minutes | Latest isolated read-only backup passed `quick_check`, 503 users, and 59 schema objects |
| SpaceMountain | `/data` SQLite/app state | encrypted Fly snapshot | 24 hours; snapshot before schema work | 60 minutes | Current snapshot requested; isolated data-level restore remains required |
| StreamWeaver | `/data` tenant runtime JSON/media | encrypted Fly snapshot | 24 hours; snapshot before tenant-store migration | 2 hours | Current snapshot requested; isolated tenant fixture restore remains required |
| DiscordStreamHub | Firestore plus `/data` clips/runtime | Firestore export policy plus encrypted Fly snapshot | 24 hours for app state; generated media may be regenerated | 4 hours | Current volume snapshot requested; Firestore export and isolated restore remain required |
| HearMeOut | `/data` watch/room/media state | encrypted Fly snapshot plus atomic last-known-good watch-state file | 24 hours | 2 hours | Current snapshot requested; isolated room/watch restore remains required |
| ChatTag | attached `/data` game state plus Firebase data | encrypted Fly snapshot plus Firebase export policy | 24 hours | 2 hours | Current attached-volume snapshot requested; Firebase and game-state restore remain required |
| Rotator/MountainView | `/data` diagnostics, review state, and MountainView records | encrypted Fly snapshot | 24 hours | 60 minutes | Current snapshot requested; isolated database/state restore remains required |

## Recovery procedure

1. Stop writes or put the affected app into maintenance mode.
2. Record the current release and volume ID; do not overwrite the original volume.
3. Create a new encrypted volume from the chosen snapshot in the app's region.
4. Attach it only to an isolated recovery machine or local fixture.
5. Validate SQLite with `PRAGMA quick_check`; parse JSON; verify tenant/account counts and representative app records without exposing secrets.
6. Promote the restored volume only after validation. Keep the original volume and prior release available for rollback.
7. Run the app smoke test and `npm run smoke:suite`, then record the recovery release and evidence here.

The large DSH and HearMeOut snapshots can take materially longer than the one-GB volumes. A scheduled snapshot is backup evidence, not restore proof; those rows stay open until a separately mounted copy passes validation.
