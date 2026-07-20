# Gate 0 error baseline

## 2026-07-17 post-persistence baseline

- Rotator review station: zero actionable errors in the current 24-hour list.
- Ignore rules: 25 retained rules limited to expected lifecycle or user-state noise; 48 unsafe historical rules were removed with a recoverable pre-prune copy.
- Credential audit: literal production service-password fallbacks in DSH, its clip worker, and SpaceMountain were classified as code/config defects and fixed; they were not added to the ignore list.
- StreamWeaver private `!gif`: classified as an unsupported capability, not an infrastructure error. DMs now report that animation generation is unavailable and direct users to `!img` for still images.
- SPMT backup verification initially exceeded the SSH wrapper timeout while hashing a large backup in memory. The backup itself passed isolated `quick_check`; the runbook now hashes with a stream to avoid recurrence.

The required 24–48-hour observation window starts after the coordinated deployment in this release. It cannot be marked complete from a same-session snapshot. New incidents must be classified as code, auth/config, external retry, expected lifecycle, or user action before any ignore rule is proposed.

## 2026-07-18 production observation

The first post-hardening day exposed a Rotator observability defect: the 24-hour history expired records, but `/data/error-fingerprints.json` permanently suppressed any fingerprint that had ever been reported. Rotator could therefore show a clear queue while the same incident was still recurring in current Fly logs. The fix replaces permanent suppression with a one-hour reporting cooldown, migrates legacy string fingerprints as expired, and keeps the review-station removal path compatible with both file formats. The history still groups duplicate events so recurring failures stay visible without alerting on every line.

The volume-backed ignore list remains exactly 25 narrow rules. No new rule was added and no broad application, status-code, authentication, media-provider, or exception pattern was accepted.

| Incident | Classification | Disposition |
| --- | --- | --- |
| StreamWeaver metrics load/update lacked tenant context | Real code fix | Fixed in the 2026-07-17 hardening deployment; no recurrence appeared in the current logs |
| DiscordStreamHub forum-forward fallback read the request body twice | Real code fix | Parse one captured body for both normal and control-character-cleaned JSON paths |
| Chat Tag bot received `401` from `/api/kick/broadcast` | Auth/config contract implemented as a code fix | Authenticate bot-to-app with `BOT_SECRET_KEY`, then use the distinct `STREAMWEAVER_SECRET` only for app-to-StreamWeaver delivery; deployed secret digests confirm both intended trust boundaries |
| StreamWeaver could not resolve the Kick chatroom for `ladyheidi` | Auth/config | Tenant must re-authorize Kick Broadcaster; keep visible and never ignore |
| HearMeOut DJ worker received YouTube bot challenges | Auth/config/external dependency | Keep visible; use or refresh the authorized extractor path and browser-resolved upload/cache handoff |
| HearMeOut DJ worker resolved no playable YouTube stream for several IDs | External retry | Keep visible until bounded source fallbacks succeed; do not ignore the whole provider or route |
| Chat Tag Twitch IRC join returned no response once | Transient external | Retry and observe; no ignore rule required |
| Fly proxy EOF/lifecycle lines around machine replacement | Expected lifecycle | Existing narrow lifecycle handling is sufficient |
| SPMT readiness repeatedly exceeded its five-second Fly timeout | Real code fix | Removed full-database `PRAGMA quick_check` and write-lock acquisition from the 30-second request path; readiness now verifies a live query, WAL mode, persistent path, and file access, while deep integrity remains in the isolated backup/restore drill |
| SpaceMountain timed out reading DSH community routes during one cluster | External retry | Current DSH health recovered; retain bounded timeout/retry behavior and observe for recurrence |
| HearMeOut Gemini returned `API_KEY_INVALID` | Auth/config | Rotate the invalid provider key; do not hide or retry an invalid credential indefinitely |
| StreamWeaver reported a missing Twitch broadcaster access/refresh token | Auth/config | Re-authorize the affected broadcaster grant; do not place tenant OAuth grants in Fly secrets |
| Fly health, lease, rate-limit, and `502` lines during the 2026-07-18 replacement deployments | Transient lifecycle/external retry | Checks recovered after replacement; observe but do not create a broad ignore rule |

Gate 0 remains open. The 2026-07-18 DSH, Chat Tag, and Rotator corrective deployments start a fresh observation slice for those components, while HearMeOut still has an unresolved external media dependency. Backup/restore closure is also independently blocked because only SPMT has isolated restore evidence; the remaining authoritative stores still require the drills listed in `GATE_0_BACKUP_RESTORE.md`.

## 2026-07-19–20 Rotator learning and reset baseline

The completed review covered 141 stored error events and 103 historical proposal records. Rotator reduced the current window to 45 grouped incident targets and completed its final live review with 45 generated classifications, zero provider failures, zero proposed file changes, and zero `ready` or `verified` automatic fixes. The volume-backed ignore list remains exactly 25 rules; no ignore rule was added during this pass.

The review was used as repair-learning evidence rather than as permission to apply model output. The first live cycle exposed proposals that mistook bounded source excerpts for incomplete application files, inferred an app fetch defect from Fly's `PU02` HTTP/2 cancellation, and blamed webhook/TTS serialization for the controlled shared Discord-chat malformed-input path. Rotator now marks excerpts explicitly, discards excerpt-based patches, classifies those exact transport and controlled-input signatures before provider invocation, uses only verified/handled repair records as model context, and requires a `ready` or `verified` quality verdict before automatic application. Bounded review concurrency reduced the live cycle from roughly twelve minutes to under four minutes without provider failures.

The actual application-owned fixes were deployed separately: StreamWeaver retries empty Eden private-chat responses across explicit model fallbacks and quiets controlled malformed-input/Kick reconnect logs; HearMeOut returns controlled Discord JSON responses, falls back from stale Activity channels, and redacts BrowserDJ media credentials; DiscordStreamHub returns a controlled `400` for malformed forum payloads; Chat Tag's null `players` guard was already present in the deployed source. Auth/config and external dependencies remain visible for operator action rather than being hidden or patched with invented credentials.

Rotator's raw error export is now operator-authenticated, no-store, and redacted. Stored history, reports, model context, and HearMeOut worker media logs redact bearer/query credentials before persistence. The first protected reset archived the 141 active events, 103 proposals, and dedupe fingerprints, but a delayed NATS monitor write exposed that the dashboard had cleared only the volume files while the running monitor still held the old history and cooldown map in memory. That old state could repopulate the files after an apparently successful zero.

The monitor now reads the observation baseline for each error candidate, rejects retained Fly log envelopes at or before the baseline, and resets its in-memory history and dedupe stores whenever the dashboard writes a new baseline timestamp. The authoritative protected reset archived the replayed evidence at `/data/error-archives/2026-07-20T10-17-44-524Z`, cleared 173 active replay events, and wrote `/data/error-baseline.json` with `startedAt=2026-07-20T10:17:44.582Z`. The protected export and stored history both remained at zero through the same delayed replay interval that had failed twice; unauthenticated export remains `401`.

This starts the valid new observation window. The error-observation checkbox must remain open until at least `2026-07-21T10:17:44.582Z` and until every genuinely post-baseline event is classified from current evidence. Gate 0 also remains independently blocked by the outstanding non-SPMT isolated restore/RPO/RTO drills.
