# SpaceMountain Ecosystem Handoff

Last updated: 2026-07-04

## Current Source Of Truth

SPMT owns identity, API, Commlink, Athena, and platform services. SpaceMountain.live owns the user-facing Command Bridge and launcher UI. Ecosystem apps own their app-specific features only.

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

- `spmt-live`: `1a8dc7e Finish platform polish hardening`
- `spacemountain-live`: `aaeaea4 Enable platform plugin installs`

The final polish pass verified:

- `npm run build` passed in `spmt-live`.
- `npm run build` passed in `spacemountain-live`.
- GitHub Actions deployed both apps through Fly.
- `https://spmt.live/api/platform/plugins` returned 200 with plugin data.
- `https://spmt.live/api/platform/docs` returned 200 with platform docs.
- `https://spacemountain.live/` returned 200.
- Both main worktrees were clean before this handoff update.

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

- Treat MountainView as a SPMT-authenticated device/app.
- Pair device state to a SPMT user.
- Send QR, camera, voice command, and AR navigation context into Athena memory.
- Route voice commands through SpaceMountain Command Bridge and Athena.
- Keep device-specific camera/AR features inside MountainView.

### SpaceMountain.live

Recommended changes:

- Continue splitting the large Command Bridge UI into smaller components.
- Keep UI ownership here, but keep identity/data ownership in SPMT.
- Move more SPMT calls server-side where secrets or tokens are involved.
- Expand Developer Portal UI from read-only panels into full forms for API keys, webhooks, plugin lifecycle, and app submissions.
- Keep the notification bell wired to SPMT notifications.
- Continue driving app launchers from SPMT registry/install state.

## Prioritized Next Developer Queue

1. Create a reusable SPMT client/helper for ecosystem apps.
2. Wire Discord Stream Hub to SPMT OAuth, `/api/me`, and embedded auth restore.
3. Remove DSH localStorage identity prompts from rank/session flows.
4. Wire StreamWeaver to SPMT identity and Athena memory.
5. Wire HearMeOut rooms/watch parties to SPMT identity and Commlink invites.
6. Wire ChatTag player identity and reward notifications to SPMT.
7. Promote SDK docs into a real package or shared client module.
8. Expand platform scope enforcement across all platform endpoints.
9. Build full Developer Portal forms for API keys, webhooks, app submissions, and plugins.
10. Componentize SpaceMountain Command Bridge after behavior is stable.

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
- Read `ROADMAP.md` and this handoff before coding.
- Confirm live route behavior before changing contracts.
- Keep SPMT as identity and API source of truth.
- Keep SpaceMountain as Command Bridge UI.
- Align one ecosystem app at a time.
- Update this handoff when a major integration contract changes.
- Leave the worktree clean after each push.
