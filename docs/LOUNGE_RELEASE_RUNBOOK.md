# Lounge release runbook

This is the production deployment path for the SpaceMountain 24/7 Lounge.

**ApolloStation is not part of this release path.** Apollo is future integration work. Do not put a same-day Lounge fix in Apollo unless the production owner below also receives the fix.

## Production owners

| Lounge responsibility | Source repository | Fly app | Production surface |
| --- | --- | --- | --- |
| Lounge scene, frame, layout, saved widget URLs | `Mtman1987/spmt-live` | `spmt-live` | `https://spmt.live/tenant/mtman1987/lounge` |
| Twitch/Discord chat commands, Stella, TTS, social alerts, translations, Pokemon overlays | `Mtman1987/streamweaver` | `streamweaver-new` | `https://streamweaver-new.fly.dev` |
| Nebula Arcade, Chat Tag, Bingo, Mosaic, game overlays/controllers | `Mtman1987/chat-tag` | `chat-tag-new` | `https://chat-tag-new.fly.dev` |
| Music/movie playback and the passive Lounge video player | `Mtman1987/hearmeout-main` | `hearmeout-main` | `https://hearmeout-main.fly.dev` |
| Community spotlight, Discord operations and DSH leaderboard surfaces | `Mtman1987/DiscordStreamHub` | `discord-stream-hub-new` | `https://discord-stream-hub-new.fly.dev` |

If a bug is visible inside one of these embedded surfaces, fix the owning app first. Do not patch the Lounge shell to imitate the app unless the bug is specifically composition/layout.

## Normal release path

Use one path every time:

1. **Choose the owner from the table above.**
2. Make the smallest change in that live repository.
3. Open a PR to `main`.
4. Let the repository checks finish. Fix failures in that same PR.
5. Squash-merge to `main`.
6. The push to `main` deploys the owning Fly app.
7. Verify the owning app's health endpoint and the exact Lounge surface that changed.
8. Only deploy `spmt-live` when its saved scene, renderer, frame, or widget URL changed.

Do not create cross-repository hooks just to force this sequence. Each live app owns its deployment.

## Manual deploy button

The live app workflows support `workflow_dispatch` so an operator can rerun a deployment from GitHub Actions without making a fake commit.

Use the repository's **Actions → Fly/Deploy workflow → Run workflow → main** when a merge completed but a deploy did not start or needs to be retried.

Never make a no-op code change just to wake a deploy.

## Multi-app Lounge release order

When one feature changes more than one live app, deploy dependencies first and the Lounge shell last:

1. `hearmeout-main` if media/player behavior changed.
2. `DiscordStreamHub` if spotlight/community/Discord data changed.
3. `chat-tag` if a Nebula game or game overlay changed.
4. `streamweaver` if commands/Stella/TTS/social/cards/translation changed.
5. `spmt-live` **last** if the Lounge scene or embedded URL changed.

If only one owner changed, deploy only that owner.

## Five-minute smoke check

Health:

- SPMT: `https://spmt.live/api/health/ready`
- StreamWeaver: `https://streamweaver-new.fly.dev/api/health`
- ChatTag: `https://chat-tag-new.fly.dev/api/health`
- HearMeOut: `https://hearmeout-main.fly.dev/api/health`
- Discord Stream Hub: `https://discord-stream-hub-new.fly.dev/api/health`

Critical Lounge surfaces:

- Lounge: `https://spmt.live/tenant/mtman1987/lounge`
- HMO video-only player: `https://hearmeout-main.fly.dev/lounge-media/player?v=release-smoke`
- Social alert overlay: `https://streamweaver-new.fly.dev/overlay/social?tenant=spacemountainlive`
- Stella translation subtitles: `https://streamweaver-new.fly.dev/overlay/translation?tenant=spacemountainlive`
- Nebula activity stage: `https://chat-tag-new.fly.dev/overlay/game-hub/system-spacemountainlive-activity`
- Nebula main stage: `https://chat-tag-new.fly.dev/overlay/game-hub/system-spacemountainlive-main`

A release is not done because GitHub says green. It is done when the production URL that owns the feature shows the change.

## Lounge command smoke set

For a StreamWeaver change, use a short representative set rather than testing every command again:

- Social: `!boop @user` and `!highfive @user`
- Translation: `!t es hello`, `!t @user en`, then `!t @user off`
- Media routing: `!sr <known song>` or `!wr <known video>`
- Card reveal: one known Pokemon/Quackverse pack command

For a ChatTag change:

- `spmt join`
- one active game action
- the affected game's Controller
- its OBS/Lounge overlay

Run the full command-family test only when command routing itself changed.

## Fast failure triage

When something is wrong after merge:

1. **Does the owning app health endpoint fail?**  
   Treat it as that app's deploy/runtime problem. Do not edit SPMT or another app.

2. **Owning app is healthy, but its direct surface is wrong?**  
   Fix the owner repository. Do not touch the Lounge shell.

3. **Direct surface is correct, but the Lounge shows the wrong page/size/layer?**  
   Fix `spmt-live` scene/rendering only.

4. **GitHub `main` has the fix but production does not?**  
   Rerun the owning repository's deployment workflow from `main`. Do not copy the fix into another repo.

5. **A dependency deploy is still running?**  
   Wait for that dependency only. Do not redeploy every app.

## Rollback

Preferred rollback is a GitHub revert because it leaves source and production aligned:

1. Revert the bad merged PR in the owning repository.
2. Merge the revert to `main`.
3. Let that repository deploy.
4. Re-run the direct surface smoke check.
5. If `spmt-live` was also changed, revert/deploy it **after** the dependency has been restored.

Do not delete volumes, reset databases, rotate tokens, or rebuild unrelated services to roll back a UI/command change.

## Rules that prevent ten-hour releases

- Production fixes go in the production owner, never Apollo-first.
- One feature has one owner.
- A green build is not proof of a live release; check the live surface.
- Do not deploy all five apps for a one-app change.
- Do not create new auth hooks or proxy layers to work around a stale deployment.
- Do not replace a working direct app surface with a copied implementation in SPMT.
- Keep browser-source URLs passive and shell-free.
- Use `spmt-live` only for composition; use HMO/StreamWeaver/ChatTag/DSH for their own functionality.
- If a merge did not deploy, rerun the existing workflow from `main` before changing code.

## Current Lounge media contract

The HMO Lounge widget is always the passive video player:

`https://hearmeout-main.fly.dev/lounge-media/player?v=live-lounge-1`

The SPMT renderer forces that URL for `community-lounge-hmo-media`, even if an old saved scene contains a room/watch URL. The Lounge should never embed the full HearMeOut room shell in that slot.
