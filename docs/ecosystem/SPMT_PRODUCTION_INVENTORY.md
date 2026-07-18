# SPMT Production Inventory And Gate 0 Evidence

Captured: 2026-07-13

Status: active Gate 0 app slice

## Ownership And Keep Decision

- Product role: shared identity, sessions, OAuth clients, provider grants, app registry, Commlink state, notifications, workspace state, platform events, and Athena memory/catalog surfaces.
- Source: `Mtman1987/spmt-live`, branch `main`.
- Operational owner: Fly organization `mtman-new` and the `Mtman1987` repository owner.
- Keep decision: keep and harden. SPMT is the owner of contracts consumed by the other ecosystem apps.
- Review cadence: revisit cost, ownership, backup age, health, and dependency state monthly.

## Live Runtime Capture

| Field | Captured value |
|---|---|
| Public URL | `https://spmt.live` |
| Fly app | `spmt-live` |
| Baseline deployed commit | `abb4b480bf85ff68d5acc2cb10726fa63599145a` |
| Gate 0 implementation build | `f3371a43b7ed5840ca721a95444b3d1b954d3fe0` |
| First verified consumer build | SpaceMountain `d357ff03754421a3ba41eb103ee561d43f157631` |
| Process | `app` |
| Region | `lax` |
| Machine count | 1 |
| Machine size | shared CPU, 1 CPU, 256 MB |
| Auto-start/stop | auto-start on, auto-stop off, minimum 1 running |
| Image release at capture | Fly release 54; Gate 0 implementation verified on release 55 |
| Volume | encrypted `spmt_data`, 1 GB, mounted at `/data` |
| Database | `/data/spmt.db`, SQLite WAL |
| Fly check before this slice | `GET /api/health` every 30 seconds |

The live database was 2,199,552 bytes with 22 tables. `PRAGMA quick_check` returned `ok` and journal mode returned `wal`. No account, message, token, or secret values were read for this capture.

The clean-database smoke fixture exposed and fixed a schema-ordering defect: compatibility `ALTER TABLE messages` statements previously ran before `messages` existed, while the canonical `CREATE TABLE` omitted the newer conversation and metadata columns. Fresh databases now create the complete schema first and run compatibility migrations afterward.

## State And Recovery

Authoritative app state is stored in `/data/spmt.db`. It includes identity, OAuth clients, provider grants, messages, conversations, notifications, app installs, versioned workspace profiles, legacy overlay workspace state, developer keys/events, and Athena memory.

The Fly volume reports automatic snapshots enabled with five-day retention. Five daily snapshots were present, covering 2026-07-08 through 2026-07-12 at capture time.

Recovery status:

- SQLite live integrity: proven.
- Automatic Fly snapshots: present.
- Online logical backup script: deployed at `scripts/operations/backup-and-verify.mjs`.
- Logical backup and isolated restore fixture: proven on 2026-07-13. The backup is `/data/backups/spmt-2026-07-13T17-19-57-338Z.db`, 2,408,448 bytes, SHA-256 `6c48422edc129e36fd2c0ffbc5e5d51554ab1036ad28ee07adb5753c44ee0f92`, with integrity `ok` and 22 tables. The temporary restore fixture was removed after verification.
- Fly snapshot restored to a separate volume/machine: not yet proven.
- RPO: currently at most approximately 24 hours from automatic snapshots; a manual logical backup can reduce this before migrations.
- RTO: not yet measured. Gate 0 remains open until a separate-volume restore and timed recovery are recorded.

## Configuration Classification

### Secrets

Configured Fly secret names at capture:

- `JWT_SECRET`
- `SYSTEM_API_KEY`
- `DSH_BOT_KEY`
- `DISCORD_BOT_TOKEN`
- `TWITCH_CLIENT_SECRET`

Missing secret names that block production completion:

- `SPMT_ADMIN_RECOVERY_KEY`
- `SPACEMOUNTAIN_CLIENT_SECRET`
- `DSH_CLIENT_SECRET`
- `STREAMWEAVER_CLIENT_SECRET`
- `CHAT_TAG_CLIENT_SECRET`
- `HEARMEOUT_CLIENT_SECRET`

The five OAuth clients currently have known fallback strings in `db.ts`, and the live database was originally seeded without the five dedicated Fly secrets. Removing those fallbacks requires coordinated rotation with one consumer at a time. Do not delete the current database values until the matching consumer has the new credential and its callback/token exchange passes.

### Public Runtime Configuration

- `DISCORD_GUILD_ID` and `TWITCH_CLIENT_ID` are public identifiers but currently stored as Fly secrets. They should move to volume-backed public runtime JSON.
- `CORS_ORIGINS`, app URLs, callback URLs, and app catalog operational metadata are public configuration currently embedded in environment/code/static JSON. They need one volume-backed config owner and schema before they become operator-editable.
- `BUILD_SHA` is immutable build metadata injected into the image, not a secret or runtime toggle.
- `DATABASE_PATH` is deployment wiring fixed to the mounted `/data` location, not app state.

### App State

Identity, grants, messages, installs, workspace settings, platform records, and Athena memory remain in SQLite. They must not move to environment variables or public JSON.

### Local-Only Debug

`.env` and local `*.db*` files are ignored and remain development conveniences only.

## Dependencies

| Dependency | Role | Capture state |
|---|---|---|
| Fly volume | authoritative SQLite storage | ready |
| Discord bot and guild | optional identity lookup | configured |
| Twitch identity lookup | optional identity lookup | unavailable because `TWITCH_ACCESS_TOKEN` is absent |
| Discord Stream Hub key | points lookup/system bridge | configured |
| SpaceMountain and app OAuth clients | consumer login/token exchange | legacy database secrets; rotation required |

## Health Contract Introduced By This Slice

- `GET /api/health/live`: process liveness only.
- `GET /api/health/ready`: lightweight live query, persistent-storage and file-access expectations, journal mode, required configuration, dependency detail, version, and build SHA. Full `PRAGMA quick_check` is intentionally reserved for the isolated backup/restore drill so the 30-second Fly probe cannot block the production event loop as the database grows.
- `GET /api/health`: backward-compatible readiness payload.
- Fly checks `/api/health/ready` after deployment.
- Production startup fails instead of switching to a local database when `/data/spmt.db` cannot open.
- The local smoke pack builds a fresh database, registers a user, checks liveness/readiness, verifies truthful Athena capability output, verifies command dispatch returns 501 without routing, and verifies stored AI prompts report `routed: false`.

Readiness can return `degraded` with HTTP 200 when core storage is safe but optional/recovery/OAuth configuration remains incomplete. It returns `not_ready` with HTTP 503 when core storage is unsafe.

## Athena Truthfulness Introduced By This Slice

- Shared memory is marked `ready` because it has persisted authenticated storage.
- App awareness, cross-app context, and AI skills are `configured` catalogs, not live execution.
- Voice control, automation, a live multi-agent crew, creator assistant execution, and AI marketplace execution are `unavailable`.
- Skill and automation catalog entries carry explicit readiness states; marketplace entries are not marked installable while no installer/runtime exists.
- `/api/athena/commands` returns HTTP 501 with `accepted: false` and `routed: false`; it does not create fake command messages or memory records.
- AI conversation prompts may still be stored for later display, but responses now say `stored: true`, `routed: false`, and `status: unavailable` until a real AI adapter accepts the work.
- SpaceMountain removes the fake prompt Send control and renders the returned capability states.

## Portable Workspace Contract

`WorkspaceProfileV1` is now the SPMT-owned contract for non-secret appearance, three dock slots, selected overlay-scene identity, TTS subscription identities, and per-app theme mappings. It is stored in `workspace_profiles` with a schema version, monotonically increasing revision, timestamps, field validation, and an SPMT account foreign key.

Authenticated GET/PATCH/PUT/export/import/reset routes enforce optimistic concurrency. Custom dock URLs require HTTPS and reject credential-like query parameters. Update events contain revision and changed-section names only; they do not copy custom URLs into notifications or Athena memory.

SpaceMountain is the first consumer. It migrates the old browser-local slots only while the server profile is untouched, caches by SPMT user ID, prevents state writes during account switches, and presents save/offline/conflict/retry/reset status. The full contract and rollback order are documented in `WORKSPACE_PROFILE_V1.md`.

## Error Baseline

The current Fly log buffer returned zero JSON records, so it cannot prove a 24–48 hour error baseline. Gate 0 needs a retained log drain or monitoring store before error-rate certification. No claim of “zero production errors” should be made from an empty buffer.

## Remaining SPMT Gate 0 Work

1. Restore a Fly snapshot to an isolated temporary volume/machine and measure RTO.
2. Establish retained logs and capture 24–48 hours of grouped errors.
3. Configure owner recovery with an operationally stored secret and exercise the locked-out-user flow.
4. Rotate all five OAuth client secrets with their consumer apps and remove code/database fallbacks.
5. Move public identifiers, origins, URLs, and operator flags to validated volume-backed public runtime JSON.
6. Add rate limits and audit records to recovery, login, token, webhook, and platform-trigger routes.
