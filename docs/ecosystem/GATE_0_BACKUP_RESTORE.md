# Gate 0 backup and restore runbook

Captured 2026-07-17; live volume inventory refreshed 2026-07-24. The owner/operator is the `mtman-new` Fly organization and the `Mtman1987` repository owner. Secrets are never part of volume JSON and must be restored separately from Fly secrets.

| Runtime | Authority | Backup | RPO | Target RTO | Restore evidence |
| --- | --- | --- | --- | --- | --- |
| SPMT | `/data/spmt.db` SQLite on `vol_vde2p30e6xo8d0k4` (`spmt_data`, lax, 1GB) | online SQLite backup plus encrypted Fly snapshots | 24 hours; take an on-demand backup before identity/schema work | 60 minutes | Latest isolated read-only backup passed `quick_check`, 503 users, and 59 schema objects; Fly snapshot restore to a separate volume still needs timed proof |
| SpaceMountain | `/data` SQLite/app state on `vol_42kmdp560dmgwl94` (`spacemountain_data`, lax, 1GB) | encrypted Fly snapshot | 24 hours; snapshot before schema work | 60 minutes | Live volume identified; isolated data-level restore remains required |
| StreamWeaver | `/data` tenant runtime JSON/media on `vol_4ojp7z8jy1mwjoxr` (`streamweaver_data`, iad, 1GB) | encrypted Fly snapshot | 24 hours; snapshot before tenant-store migration | 2 hours | Live volume identified; isolated tenant fixture restore remains required |
| DiscordStreamHub | SQLite/runtime media on `vol_vz8ey6wpj0nl7zqv` (`discord_stream_data`, iad, 15GB) plus any configured external Firebase/Firestore authority | encrypted Fly snapshot plus external export policy where still configured | 24 hours for app state; generated media may be regenerated | 4 hours | Live volume identified; external export and isolated restore remain required |
| HearMeOut | `/data` watch/room/media state on `vol_vlypz052m7d3x1d4` (`data`, iad, 10GB) | encrypted Fly snapshot plus atomic last-known-good watch-state file | 24 hours | 2 hours | Live volume identified; isolated room/watch restore remains required |
| HMO DJ worker | `/data` media/cache state on active `vol_rkgne6q1ooml5524` (`data`, iad, 10GB); detached historical volumes `vol_vlyw1nmy2w7pk3o4` and `vol_4ojp7nl276l6ke2r` need keep/delete decision | encrypted Fly snapshot; generated caches may be regenerated | 24 hours for operator-maintained cache/config; generated media may be rebuilt | 2 hours | Active and detached volumes identified; isolated restore/cleanup decision remains required |
| ChatTag | attached `/data` game state on `vol_vwn2529mw5w0wq8v` (`chat_tag_data`, iad, 1GB); detached historical `vol_rk19n1poymqe3lk4` needs keep/delete decision | encrypted Fly snapshot plus Firebase/export policy if still configured | 24 hours | 2 hours | Active and detached volumes identified; Firebase/game-state restore remains required |
| ChatTag bot | no attached Fly volume | source deploy plus Fly secrets | app state lives in ChatTag app/StreamWeaver, not the bot machine | 60 minutes | No volume restore required; verify bot can reconnect after app restore |
| DSH clip worker | no attached Fly volume | source deploy plus upstream DSH volume/media authority | generated clips read/write through DSH app authority | 60 minutes | No separate volume restore required; verify worker can process against restored DSH state |
| Rotator/MountainView | `/data` diagnostics, review state, and MountainView records on `vol_v8ee73j6wglewp7v` (`rotator_data`, ord, 1GB) | encrypted Fly snapshot | 24 hours | 60 minutes | Live volume identified; isolated database/state restore remains required |

## Recovery procedure

1. Stop writes or put the affected app into maintenance mode.
2. Record the current release and volume ID; do not overwrite the original volume.
3. Create a new encrypted volume from the chosen snapshot in the app's region.
4. Attach it only to an isolated recovery machine or local fixture.
5. Validate SQLite with `PRAGMA quick_check`; parse JSON; verify tenant/account counts and representative app records without exposing secrets.
6. Promote the restored volume only after validation. Keep the original volume and prior release available for rollback.
7. Run the app smoke test and `npm run smoke:suite`, then record the recovery release and evidence here.

The large DSH and HearMeOut snapshots can take materially longer than the one-GB volumes. A scheduled snapshot is backup evidence, not restore proof; those rows stay open until a separately mounted copy passes validation.

## Offline restored-volume validator

Use the SPMT operations verifier against a copied or separately mounted restored volume root. It validates shape, SQLite integrity, JSON parseability, and media/cache counts without printing secrets or user records.

```powershell
npm run backup:verify-restore -- --profile spmt --root <restored-volume-root>
npm run backup:verify-restore -- --profile spacemountain --root <restored-volume-root>
npm run backup:verify-restore -- --profile streamweaver --root <restored-volume-root>
npm run backup:verify-restore -- --profile dsh --root <restored-volume-root>
npm run backup:verify-restore -- --profile hearmeout --root <restored-volume-root>
npm run backup:verify-restore -- --profile hmo-dj-worker --root <restored-volume-root>
npm run backup:verify-restore -- --profile chattag --root <restored-volume-root>
npm run backup:verify-restore -- --profile rotator --root <restored-volume-root>
```

The command is intentionally offline. Creating a new Fly volume from a snapshot, attaching it to an isolated recovery machine, or deleting detached historical volumes is an external state change and must be approved before execution.
