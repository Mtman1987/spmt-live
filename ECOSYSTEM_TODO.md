# SpaceMountain Ecosystem TODO

Last updated: 2026-07-04

This is the single active unfinished-work list for SPMT, SpaceMountain.live, and the ecosystem apps. Completed milestone trackers and phase checklists should not be treated as current work.

## Release Goal

Ship a production-stable ecosystem where SPMT owns identity, app registry, Commlink, notifications, platform events, and Athena context; SpaceMountain.live owns the user-facing Command Bridge; apps keep only their app-specific state and features.

## P0 - Production Correctness

- [ ] Configure `SPMT_API_KEY` with `events:write` for each app that should publish platform events.
- [ ] Standardize app health endpoints and register them in SPMT:
  - [ ] Discord Stream Hub: `GET /api/health` exists and returns 200.
  - [ ] StreamWeaver: verify `GET /api/health` live and registered.
  - [ ] HearMeOut: verify `GET /api/health` live and registered.
  - [ ] ChatTag: add `GET /api/health`; current live `/api/health` was 404.
- [ ] Make DSH the live-community authority for SpaceMountain community spotlight/counts.
- [ ] Remove stale live community rows from public live sections when DSH says a user is offline.
- [ ] Use one shared level/XP source of truth so BattleArena, dashboard, ChatTag, and DSH do not show different levels.
- [ ] Verify notification bell with real app-generated events, not only local/system test data.
- [ ] Verify every launcher opens the intended app page before OAuth/login fallback.

## SPMT

- [ ] Keep `/api/me`, `/api/apps`, `/api/notifications`, `/api/messages`, `/api/forums`, `/api/platform/events`, and `/api/platform/docs` as the platform contracts.
- [ ] Add production checks for platform API key scopes on every server-to-server write.
- [ ] Add event-to-notification rules per app/event type instead of treating all events the same.
- [ ] Add a canonical profile stats endpoint for XP, level, rewards, and linked app identities.
- [ ] Promote the SDK from repo-local docs/helpers into a shared package or copied helper with versioning.
- [ ] Add event replay/retention policy for Commlink and Athena ingestion.

## SpaceMountain.live

- [ ] Keep app launch priority as direct app URL first, OAuth/auth URL second, internal route last.
- [ ] Keep docs markdown in deployable `public/docs` and `public/spec` until a better docs build pipeline exists.
- [ ] Split the large `src/App.tsx` Command Bridge into smaller owned components after behavior stabilizes.
- [ ] Keep advanced Command Bridge panels collapsed by default unless the user opens them.
- [ ] Reconcile community spotlight/counts against DSH live state, with SpaceMountain's local table as fallback only.
- [ ] Add visible empty/error states for Commlink notifications, community spotlight, Shipyard health, and embedded app failures.
- [ ] Add smoke tests for docs, app registry launch URLs, community API, bell count, and arena/dashboard level display.

## Discord Stream Hub

- [ ] Publish a public DSH community spotlight/status endpoint for SpaceMountain to consume.
- [ ] Keep `/api/community-online` as the live user list and expose the current pinned spotlight beside it.
- [ ] Replace local login/session simulation with SPMT OAuth and `/api/me` restore.
- [ ] Use SPMT linked Discord/Twitch accounts for rank, shoutout, spotlight, and leaderboard identity matching.
- [ ] Publish shoutout, spotlight rotation, calendar, moderation, and leaderboard events to SPMT platform events.
- [ ] Send user-facing DSH events to SPMT notifications/Commlink.
- [ ] Register dashboard, calendar, leaderboard, review, shoutout, and spotlight views as SPMT launch targets.
- [ ] Preserve unrelated local work in `src/app/(app)/layout.tsx` until reviewed by the next dev.

## StreamWeaver

- [ ] Sync local branch before release; current checkout is ahead of and behind `origin/main`.
- [ ] Push the SPMT event bridge helper only after the branch is rebased safely.
- [ ] Add SPMT OAuth and `/api/me` restore for commands, integrations, dashboard, and admin surfaces.
- [ ] Keep public overlay/listener URLs public where intended, while owner controls use SPMT identity.
- [ ] Publish command executions, automation failures, TTS broadcasts, media generation completions, and Streamer.bot events to SPMT.
- [ ] Register commands, overlays, integrations, workflow tools, and listener views as SPMT launch targets.
- [ ] Expose health/version metadata to SPMT.
- [ ] Keep app-specific automation state in StreamWeaver; send cross-app summaries to Commlink and Athena.

## HearMeOut

- [ ] Keep the room invite event bridge and verify it publishes once `SPMT_API_KEY` is configured.
- [ ] Add SPMT identity for rooms, watch parties, listening state, and room ownership.
- [ ] Use Commlink notifications for room invites, room lifecycle, queue changes, and watch party updates.
- [ ] Register room, overlay, watch, and music launch targets in SPMT.
- [ ] Resolve the DJ worker dependency/deploy issue before treating worker deploy as production-ready.
- [ ] Decide the canonical music player path: YouTube embed/player state, proxied audio, or existing YouTube audio routes.
- [ ] Add smoke tests for `!wr`, `!sr`, Activity state, admin chat commands, and overlay music mode.

## ChatTag

- [ ] Add `GET /api/health` so Shipyard/health dashboard can verify the app.
- [ ] Use SPMT identity for player profile, rewards, and leaderboard display.
- [ ] Link Twitch/Discord game participants through SPMT linked accounts.
- [ ] Publish game invites, tag events, reward changes, leaderboard changes, and arena activity to SPMT.
- [ ] Register game, overlay, arena, leaderboard, card/reward, and Quackverse views as SPMT launch targets.
- [ ] Resolve existing local dirty Quackverse files before the next production push.
- [ ] Keep game mechanics local to ChatTag; move identity, notifications, and cross-app summaries through SPMT.

## MountainView

- [ ] Treat MountainView glasses as a first-class SPMT app, not a standalone experiment.
- [ ] Use the shared SPMT SDK/client for identity, app registry, events, notifications, and platform API calls.
- [ ] Pair each glasses device to a SPMT user with a simple code/QR flow that any streamer can complete without developer help.
- [ ] Use SPMT linked accounts so Twitch, Discord, YouTube, Kick, and future platform context follows the streamer automatically.
- [ ] Send QR scans, camera captures, voice commands, scene/context notes, AR navigation state, battery/device health, and permission changes into SPMT platform events.
- [ ] Route user-visible MountainView events into Commlink notifications where they matter.
- [ ] Feed useful context into Athena memory with stable `sourceApp: "mountainview"` metadata.
- [ ] Use Athena Search for recall across scanned QR codes, captured notes, stream moments, app actions, and linked platform context.
- [ ] Use Athena OS command routing so glasses voice commands can launch apps, search context, trigger StreamWeaver automations, open HearMeOut rooms, inspect ChatTag status, or ask for stream help.
- [ ] Add a streamer-friendly setup dashboard in SpaceMountain: pair device, test camera, test mic, choose overlays, configure privacy, and see connection health.
- [ ] Add clear permission controls for camera, microphone, location/AR navigation, platform accounts, and Athena memory writes.
- [ ] Make default workflows useful for any streamer: scan-and-open links, “what did chat ask?”, “who is live?”, “start/stop overlay,” “mark this moment,” “open dashboard,” and “ask Athena.”
- [ ] Keep device-specific camera/AR code inside MountainView, but use SPMT for identity, search, events, notifications, app launch, and cross-app context.
- [ ] Register MountainView launch targets in SPMT: setup, device health, scan history, voice command history, Athena context, and privacy settings.
- [ ] Add health/version telemetry so Shipyard can show whether the device bridge is connected.

## Cleanup Path

1. Keep this file as the single active TODO.
2. Delete or archive completed milestone trackers instead of editing them forever.
3. Keep `ECOSYSTEM_HANDOFF.md` focused on current contracts, repo state, and verification.
4. Keep app-local TODO files only when they describe active work unique to that app.
5. Before every handoff, run builds/checks for touched apps, push to `main`, and verify GitHub Actions/Fly.
