# SPMT / SpaceMountain Operator Context

This file is the canonical bootstrap reference for ChatGPT conversations, Athena Coder, local Qwen repair attempts, Codex-style agents, and human operators working on the SPMT ecosystem.

Keep it concise and current. If current code or live evidence conflicts with this document, report the conflict and trust verified current evidence.

## Fresh-chat / fresh-agent bootstrap

For SPMT engineering or operations work:

1. Read this file first.
2. Read the target repository's `AGENTS.md` when present.
3. Fetch current `main` before changing code. Do not work from stale ZIPs or remembered file contents.
4. Keep source-control facts separate from live-runtime facts.
5. Add regression coverage with code changes.
6. Validate before merging.
7. Treat `merged`, `deploy workflow passed`, and `live verified` as three different states.

## Live Fly checks from ChatGPT without MCP

A GitHub-to-Rotator bridge exists so a ChatGPT environment with the GitHub connector can inspect or operate the Fly fleet without installing the Rotator MCP or a local Fly CLI.

Control repository: `Mtman1987/fly-machine-rotator`

Persistent control issue: `#72` (`GitHub Rotator Control`)

The workflow only accepts bounded `/rotator ...` comments on issue #72 authored by GitHub user `Mtman1987`, uses the repository's Fly credential, sanitizes output, and posts JSON results back to the same issue.

Supported core commands:

```text
/rotator states
/rotator states <app>
/rotator logs <app> [limit] [errors]
/rotator signal [limit]
/rotator rotate
/rotator repair <app> <problem>
/rotator chatqueue
/rotator chatjob <job-id>
```

ChatGPT workflow:

1. Post the bounded command to issue #72 with the GitHub connector.
2. Read issue #72 comments until `github-actions[bot]` posts `### Rotator result: <command>`.
3. Treat the returned JSON as live evidence.
4. Prefer read-only checks (`states`, `logs`, `signal`) before mutation.
5. Run `rotate` only when explicitly requested.
6. Use `chatqueue` / `chatjob` to pick up failed local-coder jobs for normal ChatGPT repair work.

Current managed Fly allowlist for direct fleet operations:

- `chat-tag-bot-new`
- `chat-tag-new`
- `discord-stream-hub-new`
- `dsh-clip-worker`
- `hearmeout-main`
- `hmo-dj-worker`
- `streamweaver-new`

Do not assume other apps are part of that rotation set unless current Rotator config says so.

## Athena Coder provider strategy

Preferred repair flow:

1. Local Qwen attempts the narrow repair first.
2. Qwen and every fallback receive this ecosystem context plus target-repository context.
3. If Qwen cannot produce a valid patch, do **not** silently spend Codex workspace credits as the default fallback.
4. Persist an `awaiting-chatgpt` handoff containing the job ID, app/repo, problem, baseline checks, repository context summary, Qwen failure, and instructions for a normal ChatGPT conversation.
5. A ChatGPT Business conversation can pull that handoff through `/rotator chatqueue` and `/rotator chatjob <id>`, inspect current source through GitHub, implement the fix, add regression tests, validate, PR/merge, and live-verify.

Important product boundary: a server/API call cannot consume the user's ChatGPT Business chat allowance. ChatGPT subscription usage and API billing are separate. The `awaiting-chatgpt` handoff therefore bridges into a normal interactive ChatGPT conversation rather than impersonating one from the Rotator service.

## PR -> merge -> deploy pattern

Production repositories generally deploy on a `push` to `main`. A normal PR merge is therefore the reliable deploy trigger when direct `workflow_dispatch` is unavailable.

Normal release sequence:

1. Start from current `main`.
2. Create a narrow branch.
3. Make the smallest justified change.
4. Add/update tests.
5. Run repository validation.
6. Open a PR to `main`.
7. Fix real CI failures; never weaken tests just to turn CI green.
8. Merge after approval/validation.
9. Confirm the merge actually triggered the deploy workflow. Check path filters: docs-only or ignored files may not deploy.
10. Confirm the deploy workflow succeeded.
11. Verify live state/health/logs through the Rotator bridge when available.

Never report a merge as proof of deployment. Use precise states: `changed`, `validated`, `PR opened`, `merged`, `deploy succeeded`, `live verified`.

## Branch cleanup / rollback retention

Use the established one-generation cleanup policy at the beginning of deployment runs:

1. Never delete the default branch.
2. Compare candidate branches with `main`.
3. Only classify a branch as deletable when its work is fully contained in `main`.
4. Sort fully merged branches by tip commit date.
5. Keep the newest fully merged branch as one rollback generation.
6. Delete older fully merged branches.
7. Retain every unmerged, diverged, protected, or uncertain branch.
8. Do not delete the newest merged backup until a newer merged branch exists.

Do not delete branches based only on name or age.

## Regression testing policy

Testing is part of the implementation.

For every bug fix:

- add or update a focused regression test that represents the original failure;
- make the fix;
- prove the regression test passes;
- run the relevant broader typecheck/test/build gates.

For every new feature/path:

- add tests in the same PR;
- cover the happy path;
- cover meaningful failure/edge behavior;
- cover authorization, tenant isolation, bounds, and redaction when relevant;
- protect nearby existing behavior likely to regress.

Never make CI green by deleting, skipping, or weakening a legitimate test. If a baseline check already fails before a repair, compare the failure signature before and after; a different failure must be treated as a regression.

Current default validation map (verify current scripts before running):

- `spmt-live`: `npm run typecheck`, `npm run build`, plus targeted tests.
- `fly-machine-rotator`: `npm run typecheck`, `npm test`, `npm run build`.
- `streamweaver`: `npm run typecheck`, `npm run test:isolation`, plus targeted tests.
- `DiscordStreamHub`: `npm run typecheck`, plus targeted tests.
- `chat-tag`: `npm run typecheck`, plus targeted tests.
- `hearmeout-main`: `npm run typecheck`, plus targeted tests.

Use stronger current CI gates when present.

## Ecosystem map

### `Mtman1987/spmt-live`

SPMT Live / Athena OS shared control plane. Owns shared identity/platform contracts, OAuth/sessions, provider grants, app installs, shared platform/workspace state, notifications/messaging, and Athena memory/control-plane responsibilities. Public surface: `https://spmt.live`.

### `Mtman1987/spacemountain-live`

Public SpaceMountain suite shell, launcher, and user-facing command/workspace consumer. Public surface: `https://spacemountain.live`.

### `Mtman1987/streamweaver`

Fly app `streamweaver-new`. Twitch/Discord automation runtime, tenant bot dispatch, AI/personality routing, overlays, TTS, community bot behavior, Signal, and streaming integrations. Keep tenant behavior generic unless a path is intentionally owner-only.

### `Mtman1987/DiscordStreamHub`

Fly apps `discord-stream-hub-new` and `dsh-clip-worker`. Discord/community integration owner: live/community tracking, shoutouts, support/points flows, Discord ingress such as `!mtfixit`, plus clip/media worker tasks.

### `Mtman1987/chat-tag`

Fly apps `chat-tag-new` and `chat-tag-bot-new`. Games, rewards, arena/competitive features, chat tagging, leaderboards, and bot worker.

### `Mtman1987/hearmeout-main`

Fly apps `hearmeout-main` and `hmo-dj-worker`. Rooms, LiveKit/media sessions, music/DJ functions, watch parties, search/playback/control. `hmo-dj-worker` belongs inside this product/repo rather than being treated as a standalone repository.

### `Mtman1987/fly-machine-rotator`

Fly app `mtman-machine-rotator`. Fleet diagnostics and rotation, error/log observation, Athena Coder repair jobs, repair audit, owner control, GitHub bridge, MCP/API/CLI surfaces, and MountainView-related operational functions.

### SpaceMountain Companion

Local/Android companion surfaces for work that benefits from the user's machine/phone: local relay/compute, overlays, diagnostics, and future media/encoding assistance. Resolve its current repository before editing; do not invent a repo name from memory.

### SPMT local LLM / Qwen

Lower-cost local-friendly inference path. Prefer it first where appropriate, but do not sacrifice correctness. Failed coding jobs hand off to normal ChatGPT rather than defaulting to Codex workspace usage.

### Aetherra

Partner/co-owned ecosystem component / SDK adopter. Verify ownership before changing source, deployment, data, or billing.

### Retired duplicate dashboard

`Mtman1987/space-mountain-dashboard` is retired/archived. Do not deploy or revive it accidentally; SpaceMountain is the canonical suite shell unless architecture is explicitly changed.

## Cross-ecosystem engineering conventions

- Shared identity/settings/contracts should have one authority rather than duplicate implementations.
- Keep local workspace, GitHub `main`, and Fly production conceptually separate and identify which layer is stale.
- Do not reintroduce Firebase unless explicitly requested and justified.
- Secrets stay in secret/environment stores, never committed files or public JSON.
- Public runtime config belongs in the appropriate shared/volume-backed config; app state belongs in the database/state store.
- Do not turn Athena-specific behavior into a global tenant default.
- Never expose arbitrary shell, arbitrary filesystem reads, arbitrary Fly mutation, or secret-value reads through owner automation; expose bounded named operations.
- Incident flow: observe -> isolate -> reproduce -> fix -> regression test -> broader validation -> PR -> merge -> deploy verification -> live verification.

## Maintenance rule

Update this file when repository/app ownership, managed Fly apps, control commands, deployment triggers, branch policy, validation requirements, shared authority boundaries, or major app responsibilities change.