# Gate 0 error baseline

## 2026-07-17 post-persistence baseline

- Rotator review station: zero actionable errors in the current 24-hour list.
- Ignore rules: 25 retained rules limited to expected lifecycle or user-state noise; 48 unsafe historical rules were removed with a recoverable pre-prune copy.
- Credential audit: literal production service-password fallbacks in DSH, its clip worker, and SpaceMountain were classified as code/config defects and fixed; they were not added to the ignore list.
- StreamWeaver private `!gif`: classified as an unsupported capability, not an infrastructure error. DMs now report that animation generation is unavailable and direct users to `!img` for still images.
- SPMT backup verification initially exceeded the SSH wrapper timeout while hashing a large backup in memory. The backup itself passed isolated `quick_check`; the runbook now hashes with a stream to avoid recurrence.

The required 24–48-hour observation window starts after the coordinated deployment in this release. It cannot be marked complete from a same-session snapshot. New incidents must be classified as code, auth/config, external retry, expected lifecycle, or user action before any ignore rule is proposed.
