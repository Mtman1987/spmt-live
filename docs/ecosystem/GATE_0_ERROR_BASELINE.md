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

## 2026-07-21–22 observation result

The required observation window completed with 61 stored post-baseline records and 40 review proposals. No proposal was automatically applied, none passed the `ready` or `verified` quality gate, and the three proposals that included file changes were unsafe cross-component guesses. This is positive safety evidence but also proved that exact deterministic routing still needed another learning pass.

| Incident family | Classification | Disposition |
| --- | --- | --- |
| Successful StreamWeaver pack-send line containing the card name `Computer Error` | Expected/success echo | Exact outbound-success signature is no longer eligible for error review |
| Generic Twitch IRC ping timeout and reconnect lines | Transient external | Group as Twitch chat transport; verify reconnect instead of guessing Discord or TTS source code |
| Twitch IRC `Login authentication failed` | Auth/config | Refresh the affected account grant; never invent or suppress credentials |
| ChatTag `channel:bot` rejection | Auth/config | Broadcaster must authorize the scope or make the bot a moderator; recurring events remain actionable |
| Blacklisted ChatTag channel rejoin | Expected user state | Exact `400` and bot result echoes are controlled rejections |
| StreamWeaver shared-chat `msg_banned` | Auth/config | Target channel must unban the bot or remove the mapping |
| Discord cleanup `404 Unknown Message` | Expected lifecycle | Cleanup target was already absent; exact idempotent result is filtered |
| Next.js Server Action from older/newer deployment | Transient lifecycle | Refresh stale clients and observe recurrence |
| Fly proxy reset, broken pipe, and completed-request EOF | Transient external | Keep bounded retry/recovery evidence; do not patch unrelated app code |
| LiveKit signalling/VoiceBridge `429` | Transient external | Back off and retry only after the provider accepts a new connection |
| HearMeOut Discord voice `Unknown Channel` | Auth/config | Replace the invalid/inaccessible stored voice-channel mapping |
| HearMeOut Gemini `API key not valid` | Auth/config | Rotate the deployed provider credential |
| HearMeOut YouTube bot challenge/unresolved stream | Auth/config/external dependency | Refresh the authorized extraction path or use the browser upload/cache handoff |
| Twitch EventSub `4002 failed ping pong` | Transient external | Reconnect with bounded backoff and group the websocket lifecycle event |

Rotator commit `0da1206` adds these exact lessons and passed 109 tests, typecheck, build, GitHub Actions, and Fly health. The ignore list remains exactly 25 narrow rules. StreamWeaver commit `9fe7036` also repairs the independently discovered failed GitHub build by declaring `@google/genai`; its 58-test isolation/persistence suite passed. ChatTag `e0bd6ba` and DiscordStreamHub `ee22a26` passed full typecheck and production builds before their coordinated deployments.

All coordinated GitHub deployments completed successfully, followed by a passing ten-app `npm run smoke:suite` at `2026-07-22T14:34:33.618Z` with exact local/GitHub/Fly SHA parity. The protected reset archived 70 final events and 40 proposals at `/data/error-archives/2026-07-22T14-34-42-143Z`, wrote `startedAt=2026-07-22T14:34:42.174Z`, and remained at zero events and zero proposals through the delayed replay check. The ignore list remained 25 and unauthenticated raw-log export remained `401`.

The capture/classification requirement is complete and the new zero baseline is active, but Gate 0 remains open for the non-SPMT restore/RPO/RTO drills and the operator-owned auth/config items above. Do not add ignore rules for recurring credential, permission, or provider failures; they must reappear if unresolved.

## 2026-07-23 first post-reset slice

The current protected baseline is `startedAt=2026-07-22T14:41:22.444Z`. At the audit, `/data/error-history.json` held 145 records and `/data/fix-proposals.json` remained empty. The ignore list remained exactly 25 rules.

| Classification | Records | Evidence and disposition |
| --- | ---: | --- |
| Exact handled/context echoes | 27 | JSON quota children, shared-chat walk-on recovery cascades, and optional metadata fallback lines; filtered only by exact signatures in source, not new volume ignore rules |
| Auth/config | 68 | Gemini leaked/revoked key and quota, OpenAI quota, ChatTag `channel:bot`, shared-chat broadcaster `401`, bot ban, missing broadcaster grant, and Discord history mapping; credentials and permissions remain visible |
| Real code fix | 31 | 27 legacy TTS fallback `401` records plus four malformed Twitch-login echoes; repaired in StreamWeaver `b3a53d8` |
| Transient/external | 19 | Fly health transitions, Twitch transport/rate limit, upstream `5xx`, and two recovered DSH leaderboard renderer timeouts |
| Unknown | 0 | Every stored record routes deterministically after Rotator `8f0af4f` |

StreamWeaver passed all 61 isolation/persistence tests. Rotator passed 116 tests, typecheck, and build, including MountainView SQLite response-lifecycle coverage. DSH produced a later successful leaderboard update, so its renderer timeouts are recovery evidence rather than a speculative code patch.

GitHub contains the two repair batches, but both Fly Actions failed before image creation: the remote builder returned `403` for overdue invoices on the `mtman-new` organization. The production images therefore remain on their prior healthy SHAs. Do not clear this queue or start a new zero baseline until billing is repaired, both current commits deploy, Actions/Fly feature routes and full SHA parity pass, and the unresolved credential/permission items are retained as actionable evidence.

The post-failure suite smoke at `2026-07-23T14:07:36.214Z` still returned `200` for every health and feature route across all ten app/worker entries. Eight entries had exact SHA parity; only StreamWeaver (`b3a53d8` expected, `9fe7036` deployed) and Rotator (`8f0af4f` expected, `8a23c65` deployed) failed parity because the builder never created their images.

The evidence commit itself passed SPMT production-contract validation but encountered the same Fly billing `403`, leaving docs-only SPMT commit `6e4e92e` ahead of deployed `652d105`. A final smoke at `2026-07-23T14:11:11.817Z` again found every route healthy and three expected parity blockers: SPMT docs, StreamWeaver, and Rotator. The final evidence correction is committed with CI skipped to avoid repeating a deployment known to be impossible until billing is repaired.

## 2026-07-24 recovered deployment and protected reset

Billing recovery allowed every queued hardening release to deploy. The final pre-reset suite smoke at `2026-07-24T14:24:12.887Z` returned `200` from all ten health and feature routes and proved exact local, GitHub, and Fly SHA parity. The authoritative queue then contained 148 records, zero proposals, and the unchanged 25-rule ignore list.

| Classification | Records | Evidence and disposition |
| --- | ---: | --- |
| Exact handled/context echoes | 77 | Exact Twitch reconnect/join lifecycle fragments, Undici child frames, and the obsolete multiline XP log header; filtered in source by exact signatures, not added to the volume ignore list |
| Transient/external | 58 | One recovered Twitch/outbound connection interruption, bounded upstream `5xx`, DSH-to-SpaceMountain abort, and completed-request Fly EOF; recovery plus current feature health rules out speculative app patches |
| Auth/config | 12 | Eight Twitch IRC login rejections, two missing StreamWeaver broadcaster grants, and two pre-repair DSH `xp:write` rejections; credentials/grants remain visible, while the DSH key was repaired narrowly in place |
| Real code fix | 1 | DSH sent dotted XP event types after authorization succeeded; `bde2142` now sends stable lowercase-hyphen slugs |
| Unknown | 0 | Rotator `828bb9a` deterministically routes every archived record |

The outbound cluster ran approximately from `2026-07-24T10:57Z` through `11:58Z` and included Twitch IRC reconnects plus Undici connection timeouts across StreamWeaver, ChatTag, DSH, and the clip worker. These records are grouped as one recovered transport window. No broad network, provider, status-code, authentication, or exception ignore was added.

The existing DSH app-bound key received only `xp:write` and verified live with `events:write`, `identity:write`, and `xp:write`. The pre-change SPMT database and WAL were copied off-platform; `PRAGMA quick_check` returned `ok`, with database SHA-256 `7D6EE2427C8E9DB9A5F9B424CFDB082332608B0F7497F15A4D2F1998A40EA96C` and WAL SHA-256 `4A38A291FC2E134B9C49BB6E42BE43CFA73DB7C354ABCCB0DE31C51ED94B28B6`. Attempted online volume backups exceeded the bounded SSH window and their incomplete files were removed. This does not close the isolated restore/RPO/RTO requirement.

The initial reset archived the 148-record state at `/data/error-archives/2026-07-24T14-25-30-497Z`. Fresh traffic then exposed a DSH forum-forward caller abort and a recurring StreamWeaver-to-DSH admin-role timeout. The former completed its Discord side effect before an optional legacy SPMT mirror consumed the remaining caller deadline; DSH `a817251` bounds that mirror to 1.5 seconds. The admin endpoint exceeded both its eight-second application deadline and a direct 15-second production probe because it made unbounded live Discord calls despite having synchronized member and role state. DSH `49c2cd1` now uses the durable role cache first and bounds its external fallback to 3.5 seconds. The same live service-authenticated probe then returned `200` in 160 ms with `isAdmin=true`, `isMod=true`, and `matchedBy=role`.

Rotator `828bb9a` passed 130 tests, typecheck, build, Actions, and Fly deployment. It classifies the recurring admin timeout as a real code defect, the bounded forum abort as transient/external, and the later recovered DSH/Discord `5xx` responses as upstream transient failures. DSH passed typecheck plus every web and clip-worker deployment job. The correction slices were archived at `/data/error-archives/2026-07-24T14-38-50-978Z` and `/data/error-archives/2026-07-24T14-45-26-466Z`. The final protected baseline is `startedAt=2026-07-24T14:45:26.473Z`; it remained at zero events and zero proposals with the same 25 ignore rules through the delayed replay check at `2026-07-24T14:46:54Z`.

The error-capture/classification requirement remains complete. Gate 0 remains open for the isolated restore/RPO/RTO/operator/rollback drills. Twitch login and missing-broadcaster grants remain operator-owned auth/config work and must re-enter the fresh queue if they recur.
