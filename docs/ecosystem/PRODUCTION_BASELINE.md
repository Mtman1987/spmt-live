# Ecosystem Production Baseline

Captured: 2026-07-13

Purpose: provide a reproducible starting point for the production roadmap. This is a capture of the parent commits used for the cleanup pass, not a promise that runtime state will remain unchanged. Re-run the capture at the start of every production slice.

## Repository Baseline

All eight repositories were on `main`, clean, and exactly aligned with `origin/main` before this documentation and compiler-cache cleanup began.

| Workspace repository | GitHub repository | Starting commit | Latest workflow at capture |
|---|---|---:|---|
| `chat-tag` | `Mtman1987/chat-tag` | `284a7c2` | Fly Deploy: success |
| `DiscordStreamHub` | `Mtman1987/DiscordStreamHub` | `ab05436` | Fly Deploy: success |
| `fly-machine-rotator` | `Mtman1987/fly-machine-rotator` | `4f370e6` | Fly Deploy: success |
| `hearmeout-main` | `Mtman1987/hearmeout-main` | `ee3c9e1` | Deploy to Fly.io: success |
| `space-mountain-dashboard` | `Mtman1987/space-mountain-dashboard` | `19cd80b` | no workflow run found |
| `spmt-live` | `Mtman1987/spmt-live` | `522343f` | Deploy to Fly.io: success |
| `streamweaver` | `Mtman1987/streamweaver` | `1bd5cbb` | Fly Deploy: success |
| `web` | `Mtman1987/spacemountain-live` | `598eea3` | Deploy to Fly.io: success |

The workflow results above were queried from GitHub on 2026-07-13. They prove only that the latest workflow completed successfully; each roadmap slice still requires a fresh live smoke test of its actual behavior.

## Hygiene Baseline

- 2,738 tracked files were inventoried across the eight repositories.
- 322 tracked Markdown files were inventoried.
- 78 exact-content Markdown duplicate groups contain 156 tracked files.
- The duplicate groups are concentrated in SpaceMountain `docs/`/`public/docs/` and `spec/`/`public/spec/` mirrors.
- Those SpaceMountain mirrors are currently runtime inputs: `public/docs.html` fetches `/docs/docs-nav.json` and individual `/docs/...` paths, while no docs synchronization step exists in `package.json`. They must remain until a tested build-time copy or docs endpoint replaces them.
- HearMeOut tracked a 399,295-byte `tsconfig.tsbuildinfo` compiler cache. The cleanup removes it and adds the correct ignore rule.
- No other tracked filename-pattern hit was safe to remove automatically. `copy-button.tsx`, `BACKUP_SETUP.md`, and `legacy_gltf.py` are real source or operational documentation despite names that resemble cleanup candidates.
- `_reference/social_stream`, `_reference/ssn_app`, and the two Social Stream Ninja installers at workspace root are intentional reference assets and are not app source or disposable build output.

## Baseline Capture Commands

Run from the workspace root before each slice:

```powershell
$repos = 'chat-tag','DiscordStreamHub','fly-machine-rotator','hearmeout-main','space-mountain-dashboard','spmt-live','streamweaver','web'
$repos | ForEach-Object {
  git -C $_ status --short --branch
  git -C $_ rev-parse HEAD
  git -C $_ remote get-url origin
}
```

Then capture the latest GitHub workflow for each remote, check the real Fly machine and volume state for affected apps, call the affected health and contract endpoints, and exercise the user-visible flow. Save evidence in the relevant app document or release record rather than editing this historical capture.

## Gate 0 Starting Actions

1. Keep all repositories clean and aligned.
2. Extend `production-manifest.json` with verified volume, database, smoke-test, backup, and state-owner details during each app slice.
3. Replace static-success health endpoints with dependency-aware checks.
4. Inventory secret fallbacks and classify all runtime configuration under the workspace policy.
5. Prove backup and restore for every database and volume before state migrations.
6. Make experimental and unavailable UI truthful.
7. Begin Gate 1 only after the safety evidence is recorded.
