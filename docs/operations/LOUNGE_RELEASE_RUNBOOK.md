# SpaceMountain Lounge production release runbook

This is the production path for the 24/7 SpaceMountain Lounge.

## Rule zero: Apollo is not the live Lounge

Do not wait for, deploy, or patch ApolloStation to ship today's Lounge.

The live Lounge is composed from these production repositories and Fly apps:

| Responsibility | Repository | Production app | Canonical surface |
| --- | --- | --- | --- |
| Lounge composition, saved scene, browser-source renderer | `Mtman1987/spmt-live` | `spmt-live` | `https://spmt.live/tenant/mtman1987/lounge` |
| Chat commands, Stella/TTS, social alerts, translation, shoutouts, status overlays | `Mtman1987/streamweaver` | `streamweaver-new` | `https://streamweaver-new.fly.dev` |
| Nebula Arcade games/controllers/overlays | `Mtman1987/chat-tag` | `chat-tag-new` + `chat-tag-bot-new` | `https://chat-tag-new.fly.dev` |
| HearMeOut playback and passive Lounge media viewer | `Mtman1987/hearmeout-main` | `hearmeout-main` | `https://hearmeout-main.fly.dev/lounge-media/player` |
| Discord community spotlight/leaderboard/community operations | `Mtman1987/DiscordStreamHub` | `discord-stream-hub-new` | `https://discord-stream-hub-new.fly.dev` |

If a feature exists only in ApolloStation, it is not live until its useful delta has been ported into the owning production repository above.

## The release rule: deploy only what changed

Do not redeploy the entire suite for a one-widget fix.

Before starting, write a tiny release manifest:

```text
Release:
- streamweaver: <sha or NOT TOUCHED>
- chat-tag: <sha or NOT TOUCHED>
- hearmeout-main: <sha or NOT TOUCHED>
- DiscordStreamHub: <sha or NOT TOUCHED>
- spmt-live: <sha or NOT TOUCHED>
```

Record the currently deployed SHA for every app you will change. Those SHAs are the rollback targets.

## Normal order

### 1. Deploy changed provider apps first

These apps own the actual content that the Lounge consumes.

They can be released independently when touched:

- HearMeOut for media/player changes.
- ChatTag for Nebula/game changes.
- DiscordStreamHub for spotlight/leaderboard/Discord changes.

Do not touch an app that has no change in the release manifest.

**ChatTag:** merging to `main` runs tests, then deploys `chat-tag-new`, verifies it, and then deploys `chat-tag-bot-new`.

**DiscordStreamHub:** merging to `main` selects affected services, validates the web app, then deploys `discord-stream-hub-new` when web code changed.

**HearMeOut exception:** the current `.github/workflows/fly-deploy.yml` is named **Build HearMeOut image** and uses `--build-only`. A green run means an image built; it does **not** mean `hearmeout-main` was released. When HearMeOut changed, the operator must perform the explicit production release after validation:

```sh
flyctl deploy . --remote-only --config fly.toml --yes
```

Run that through the authorized Fly operations path (SPMTFly/Sprite ops terminal or another approved Fly operator), not by changing the Lounge to a fallback URL.

### 2. Deploy StreamWeaver next

StreamWeaver owns Lounge commands and orchestration.

Merging to `main` triggers **Fly Deploy** for `streamweaver-new`. The workflow also supports `workflow_dispatch` if a clean manual rerun is needed.

Before continuing, verify:

- `https://streamweaver-new.fly.dev/api/health`
- `https://streamweaver-new.fly.dev/overlay/social?tenant=spacemountainlive`
- `https://streamweaver-new.fly.dev/overlay/translation?tenant=spacemountainlive`

Overlay pages should be transparent/empty when idle. They must never show the StreamWeaver dashboard or login chrome.

### 3. Deploy spmt-live LAST

`spmt-live` is the composition layer. It should only point at downstream surfaces that are already healthy.

A merge to `main` runs the production contract suite and then deploys the `spmt-live` Fly app.

After the deploy, open:

`https://spmt.live/tenant/mtman1987/lounge`

Do not manually rewrite the saved Lounge JSON to force a release. Persistent layout changes belong in the versioned migration in `tenant-overlay-bootstrap.cjs`; bump `LOUNGE_24X7_VERSION` when the saved scene must change.

## Five-minute Lounge smoke test

Run only the checks relevant to the release, plus the final Lounge check.

1. **Composition:** the Lounge loads with no login page or full app shell inside an embed.
2. **HearMeOut:** the HMO panel is the passive video player. It must never display `Room watch-room-...` or the full HearMeOut surface.
3. **Social:** run `!boop @user` or `!highfive @user`. The social alert appears, Stella uses the same reaction line, and repeating the action does not reuse the exact prior line.
4. **Translation one-shot:** `!t es hello` returns a Spanish translation.
5. **Translation auto:** `!t @self en`, send a non-English public message, confirm the translated chat line and lower-third subtitle, then run `!t @self off`.
6. **Nebula:** the active/idle game surfaces render without replacing the whole Lounge.
7. **Media command:** `!sr` or `!wr` changes the canonical HearMeOut session without creating a second player.
8. **Final cross-suite smoke:** from `spmt-live`, run `npm run smoke:suite` when an operations environment with the required credentials is available.

## Fast failure routing

Do not debug the whole ecosystem when one layer is wrong.

| Symptom | Owner to inspect first |
| --- | --- |
| HMO panel shows room/full app instead of video | `spmt-live` renderer URL, then `hearmeout-main /lounge-media/player` |
| `!sr`, `!wr`, social, Stella, TTS, or `!t` wrong | `streamweaver` |
| Bingo/Mosaic/Word Chain/Quackverse/game overlay wrong | `chat-tag` |
| Discord spotlight/leaderboard/community data wrong | `DiscordStreamHub` |
| Correct child surface works directly but Lounge shows the wrong thing | `spmt-live` composition/migration |
| GitHub is green but live app is old | deployment freshness; compare deployed SHA to repository `main` before changing code |

### Stop conditions

Stop the release before `spmt-live` if a changed downstream surface returns 4xx/5xx or renders its authenticated app shell instead of its headless surface.

If the code is correct but the deployed SHA is stale, fix the deployment. Do not add another route, proxy, token, iframe, hook, or fallback to work around a stale machine.

## Rollback

Rollback the owning app, not the whole Lounge.

1. Identify the first failing app from the table above.
2. Revert that repository's release commit/PR to the recorded pre-release SHA.
3. Let that repository redeploy; for HearMeOut, perform its explicit Fly release.
4. Re-run only that app's direct smoke check.
5. If the child app is healthy but composition is wrong, revert only `spmt-live`.

Never use ApolloStation as an emergency production fallback.

## What a normal Lounge release should look like

For a typical command/overlay change:

```text
StreamWeaver PR -> merge -> streamweaver-new healthy
spmt-live PR (only if scene wiring changed) -> merge -> spmt-live healthy
five-minute smoke -> done
```

For a game change:

```text
ChatTag PR -> tests -> chat-tag-new + bot deploy
spmt-live only if a new/changed browser-source layer is required
five-minute smoke -> done
```

For media:

```text
HearMeOut change -> validate -> explicit hearmeout-main Fly release
StreamWeaver only if command/orchestration changed
spmt-live only if the player/source URL or composition changed
five-minute smoke -> done
```

The goal is one owning repo per problem, provider first, composition last, and no hidden production dependency on Apollo.
