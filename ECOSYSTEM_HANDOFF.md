# SpaceMountain Ecosystem Handoff

Last updated: 2026-07-08

## Current Source Of Truth

SPMT owns identity, API, Commlink, Athena, and platform services. SpaceMountain.live owns the user-facing Command Bridge and launcher UI. Ecosystem apps own their app-specific features only.

Active unfinished work lives in `ECOSYSTEM_TODO.md`. Do not use old completed milestone trackers as the current queue.

Keep these rules strict:

- Do not duplicate authentication.
- Do not duplicate user profiles.
- Do not duplicate messaging.
- Every ecosystem app should register with SPMT.
- Every app should consume SPMT identity before adding local account logic.
- App-specific state can live in each app, but user identity and cross-app context belong to SPMT.

## Active Repositories

- `C:\Users\mtman\Desktop\spmt-live`
- `C:\Users\mtman\Desktop\web`
- `C:\Users\mtman\Desktop\finished\codex-environment\DiscordStreamHub`
- `C:\Users\mtman\Desktop\finished\codex-environment\streamweaver`
- `C:\Users\mtman\Desktop\finished\codex-environment\hearmeout-main`
- `C:\Users\mtman\Desktop\finished\codex-environment\chat-tag`

## Production URLs

- SPMT: `https://spmt.live`
- SpaceMountain: `https://spacemountain.live`
- Discord Stream Hub: `https://discord-stream-hub-new.fly.dev/dashboard`
- StreamWeaver: `https://streamweaver-new.fly.dev/login?next=%2Fcommands`
- ChatTag: `https://chat-tag-new.fly.dev`
- HearMeOut: `https://hearmeout-main.fly.dev`

## Latest Known Pushed State

- `spmt-live`: `0e723bd Create notifications from platform events`
- `spacemountain-live`: `a6087a6 Polish Command Bridge landing defaults`
- `DiscordStreamHub`: `1d37fba Add SPMT event bridge helper`
- `HearMeOut`: `fcc76a1 Revert music playback to HLS proxy strategy (fix broken media/music)`
- `ChatTag`: `386d7cf Add SPMT event bridge helper`

The latest verified pass confirmed:

- `npm run build` passed in `spmt-live`.
- `npm run build` passed in `spacemountain-live`.
- GitHub Actions deployed both apps through Fly.
- `https://spmt.live/api/platform/docs` returned 200 with platform docs.
- `https://spmt.live/api/apps` returned 200 with app registry data.
- `https://spacemountain.live/` returned 200.
- `https://spacemountain.live/docs/DOCS_HOME.md` returned real markdown.
- `https://spacemountain.live/spec/README.md` returned real markdown.

## SPMT Capabilities Now Available

### Identity

- `/api/me`
- `/api/auth/refresh`
- `/api/session/bridge`
- OAuth authorize/callback flows
- linked accounts
- sessions
- account/profile settings

Use these instead of adding standalone auth inside ecosystem apps.

### App Registry And Shipyard

- `/api/apps`
- `/api/apps/:appId`
- `/api/apps/:appId/versions`
- install state
- disable/enable state
- permissions
- health metadata
- launch URLs

Every app should expose usable launch targets and health/version metadata here.

### Commlink

- `/api/messages`
- `/api/conversations`
- `/api/notifications`
- `/api/search`
- forum routes
- voice message routes
- system/app message surfaces

Notifications should appear in the SpaceMountain bell. Important app events should create SPMT notifications instead of only local app banners.

### Athena OS

- `/api/athena/os`
- `/api/athena/context`
- `/api/athena/memory`
- `/api/athena/skills`
- `/api/athena/crew`
- `/api/athena/automations`
- `/api/athena/commands`

Apps should send activity, command results, and useful context to Athena with a `sourceApp` field so Command Bridge can explain what is happening across the ecosystem.

### Platform And Developer Surfaces

- `/api/platform`
- `/api/platform/docs`
- `/api/platform/sdk`
- `/api/platform/api-keys`
- `/api/platform/api-keys/verify`
- `/api/platform/api-keys/revoke`
- `/api/platform/me`
- `/api/platform/apps/public`
- `/api/platform/plugins`
- plugin install/disable routes
- webhook routes
- app submission routes

The Platform phase is MVP-complete at the surface level. Continue hardening scope enforcement, developer portal UX, plugin lifecycle, and webhook delivery guarantees.

## Integration Contract For Ecosystem Apps

### Identity And Session

Each app should:

- Launch from the SPMT registry launch URL where possible.
- Accept OAuth callbacks from SPMT.
- Store SPMT session/token data server-side where practical.
- Call `/api/me` for current user identity.
- Call `/api/auth/refresh` for session refresh.
- Listen for embedded `SPACEMOUNTAIN_AUTH` messages when running inside SpaceMountain.
- Remove localStorage-only fake identity once SPMT auth is wired.

### App Registry

Each app should:

- Be represented in SPMT app metadata.
- Include launch URLs for primary views.
- Include app health, version, and required permissions.
- Use install/disable state to drive launcher visibility.
- Avoid hardcoded launcher assumptions in SpaceMountain where SPMT registry data can drive the UI.

### Commlink

Each app should:

- Create SPMT notifications for important user-facing events.
- Route cross-app messages through SPMT instead of one-off local messaging.
- Mirror forum-worthy Discord/community events into SPMT forums.
- Include `sourceApp`, `sourceUrl`, and relevant entity IDs in message metadata.

### Athena

Each app should:

- Write relevant app activity into Athena memory.
- Route high-level commands through Athena command routing.
- Include `sourceApp` and stable object IDs.
- Avoid making app-specific AI memory stores that SPMT cannot see.

### Platform API

Each app should:

- Use scoped platform API keys for server-to-server writes.
- Verify scopes before privileged actions.
- Use webhooks for app events that other apps need to consume.
- Prefer documented SDK/client helpers once the SDK is promoted from docs to package.

## App Alignment Plan

### Discord Stream Hub

Observed direction:

- It still has local login/session simulation paths and localStorage identity flows.
- It has Discord/Twitch points, leaderboards, shoutouts, calendar, moderation, and server review workflows.
- Some user resolution is currently based on Discord IDs or runtime config rather than SPMT identity.

Recommended changes:

- Replace local login/session simulation with SPMT OAuth and `/api/me` restore.
- Use SPMT linked Discord/Twitch accounts for user matching wherever possible.
- Replace rank-page manual Discord ID entry with SPMT identity lookup.
- Add embedded `SPACEMOUNTAIN_AUTH` handling for SpaceMountain iframe launches.
- Register dashboard, leaderboard, review, calendar, and shoutout tools as SPMT launch targets.
- Send shoutouts, scheduled events, moderation review items, and leaderboard milestones to Commlink notifications.
- Store useful event summaries in Athena memory with `sourceApp: "discord-stream-hub"`.
- Move server-to-server writes behind scoped platform API keys.
- Keep Discord-specific features in DSH, but let SPMT own identity and cross-app visibility.

### StreamWeaver

Observed direction:

- It owns stream automation, commands, overlays, TTS, AI generation, and Streamer.bot workflows.
- It has public listener/overlay behavior that should remain easy to use.

Recommended changes:

- Add SPMT OAuth login and `/api/me` restore for command, integration, and admin surfaces.
- Keep public listener/overlay links public where intended, but attach owner/admin controls to SPMT identity.
- Register commands, overlays, integrations, workflow tools, and listener views as SPMT launch targets.
- Send command executions, automation failures, TTS broadcast events, and generated media completions to Commlink notifications when user-facing.
- Write stream events and command results into Athena memory.
- Let Athena commands trigger StreamWeaver actions through a scoped API key.
- Expose health and version metadata to SPMT.
- Prefer platform webhooks for automation events that other apps need.

### HearMeOut

Observed direction:

- It owns voice rooms, music, watch parties, shared listening, room overlays, and scoped media sessions.

Recommended changes:

- Add SPMT identity for rooms, watch parties, listening state, and ownership.
- Link watch-room and Discord-channel sessions to SPMT user context.
- Use Commlink for room invites, room notifications, queue changes, and watch party updates.
- Write room/session activity into Athena memory.
- Register room, overlay, watch, and music launch targets with SPMT.
- Use platform webhooks for room started, room ended, queue changed, and watch party events.
- Keep media/session state in HearMeOut, but expose cross-app context through SPMT.

### ChatTag

Observed direction:

- It owns community games, live overlays, leaderboards, arena, rewards, and game state.

Recommended changes:

- Use SPMT identity for player profiles, rewards, and leaderboard display.
- Link Twitch/Discord game participants through SPMT linked accounts.
- Send game invites, tag events, reward events, and leaderboard changes to Commlink notifications.
- Write game state and turn history into Athena memory so Command Bridge can summarize active games.
- Register game, overlay, arena, leaderboard, and reward launch targets.
- Use scoped platform API keys for app writes instead of broad shared secrets.
- Keep game mechanics local to ChatTag while making identity and notifications cross-app.

### MountainView

Future shape:

- Treat MountainView glasses as a SPMT-authenticated first-class app.
- Use the SPMT SDK/client for identity, platform events, notifications, app launch, and registry metadata.
- Pair each device to a SPMT user with a simple QR/code flow.
- Send QR scans, camera captures, voice commands, AR navigation context, device health, and permission changes into platform events and Athena memory.
- Use Athena Search so streamers can recall scan history, captured notes, moments, and linked platform context.
- Use Athena OS command routing so glasses voice commands can launch apps, search context, trigger StreamWeaver automations, open HearMeOut rooms, inspect ChatTag status, and ask for live stream help.
- Add a SpaceMountain setup dashboard for device pairing, camera/mic tests, overlay choices, privacy controls, and connection health.
- Keep device-specific camera/AR features inside MountainView, but never duplicate identity, cross-app search, notifications, or AI memory outside SPMT.

### SpaceMountain.live

Recommended changes:

- Continue splitting the large Command Bridge UI into smaller components.
- Keep UI ownership here, but keep identity/data ownership in SPMT.
- Move more SPMT calls server-side where secrets or tokens are involved.
- Expand Developer Portal UI from read-only panels into full forms for API keys, webhooks, plugin lifecycle, and app submissions.
- Keep the notification bell wired to SPMT notifications.
- Continue driving app launchers from SPMT registry/install state.

## Prioritized Next Developer Queue

Use `ECOSYSTEM_TODO.md` as the single active queue. Highest priority items:

1. Deploy the DSH community spotlight/status endpoint and SpaceMountain DSH reconciliation.
2. Configure `SPMT_API_KEY` on apps that should publish platform events.
3. Add missing health endpoints and verify registry health metadata.
4. Finish app identity adapters so apps consume SPMT sessions instead of local/fake auth.
5. Unify XP/level source of truth across dashboard, arena, DSH, and ChatTag.
6. Expand Commlink ingestion for Discord/app/bot messages.
7. Componentize SpaceMountain Command Bridge once behavior is stable.

## Known Cautions

- The SPMT platform surfaces are usable MVPs, not a finished third-party ecosystem.
- Do not mark future hardening as done just because routes exist.
- `spacemountain-live` still has a large Vite bundle warning; it is not currently blocking deploy.
- SPMT production requires `JWT_SECRET` to remain configured on Fly.
- SpaceMountain has used `DSH_POINTS_TOKEN`; rotate it later if it was ever exposed.
- Some ecosystem apps still have local auth assumptions. Remove them app by app, not with a broad rewrite.
- Keep commits small and deployable.
- Push to `main` so GitHub Actions/Fly deploy the live apps.

## Verification Commands

Run these before handoff after code changes:

```powershell
git status --short --branch
npm run build
```

Useful live checks:

```powershell
Invoke-WebRequest -Uri https://spmt.live/api/health -UseBasicParsing
Invoke-WebRequest -Uri https://spmt.live/api/platform/docs -UseBasicParsing
Invoke-WebRequest -Uri https://spmt.live/api/platform/plugins -UseBasicParsing
Invoke-WebRequest -Uri https://spacemountain.live/ -UseBasicParsing
```

Useful GitHub checks:

```powershell
gh run list --limit 5
gh run view <run_id> --json status,conclusion,updatedAt
```

## Handoff Checklist

- Pull `main` in `spmt-live` and `spacemountain-live`.
- Read `ECOSYSTEM_TODO.md`, `ROADMAP.md`, and this handoff before coding.
- Confirm live route behavior before changing contracts.
- Keep SPMT as identity and API source of truth.
- Keep SpaceMountain as Command Bridge UI.
- Align one ecosystem app at a time.
- Update this handoff when a major integration contract changes.
- Leave the worktree clean after each push.
