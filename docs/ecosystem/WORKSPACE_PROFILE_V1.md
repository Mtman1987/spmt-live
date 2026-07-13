# WorkspaceProfileV1 Production Contract

Updated: 2026-07-13

Owner: SPMT

First consumer: SpaceMountain web

## Purpose

`WorkspaceProfileV1` is the account-backed, non-secret state that should follow an SPMT user between browsers and devices. SPMT is authoritative. A consumer may keep a per-user browser cache for startup and offline visibility, but it must not treat that cache as the source of truth.

The first production consumer migrates SpaceMountain appearance controls and its three footer dock slots. Overlay scene records and executable workflow definitions remain separate contracts; they must not be added to this profile blob.

## Stored contract

The `workspace_profiles` table stores:

- `user_id`: tenant boundary and foreign key to the SPMT account;
- `schema_version`: currently `1`;
- `revision`: monotonically increasing optimistic-concurrency value;
- `profile`: validated JSON containing appearance, exactly three dock slots, active overlay-scene ID, TTS subscription IDs, and app theme mappings;
- `created_at` and `updated_at`.

Every current SpaceMountain appearance control is represented, including theme, glow, stars, glass, blur, nebula, parallax, borders, radius, density, navigation layout, chat appearance, motion, particles, and push-to-talk preference.

Dock URLs must use HTTPS. SPMT rejects URL query parameters whose names look like credentials, tokens, passwords, sessions, secrets, or API keys. The profile must never contain provider credentials.

## API

All routes require the authenticated SPMT account.

| Method and route | Behavior |
|---|---|
| `GET /api/workspace-profile` | Returns or initializes the account profile and an `ETag` such as `"workspace-3"`. |
| `PATCH /api/workspace-profile` | Merges validated sections. Requires `If-Match` or the current revision. |
| `PUT /api/workspace-profile` | Replaces the complete validated profile. Requires the current revision. |
| `GET /api/workspace-profile/export` | Exports the portable JSON contract. |
| `POST /api/workspace-profile/import` | Imports a complete contract using revision protection. |
| `POST /api/workspace-profile/reset` | Restores safe defaults and increments the revision. |

Validation errors return HTTP `400` with a `fields` object. Missing concurrency state returns `428`. A stale revision returns `409`, the current profile, and its `ETag`.

Successful writes publish a private `workspace.profile.updated` platform event containing only the new revision and changed section names. Private dock URLs are deliberately excluded from the event payload, Athena memory, and notifications.

## SpaceMountain migration

On authenticated startup SpaceMountain:

1. loads the SPMT profile;
2. if the server still has untouched defaults, migrates the legacy three-slot `spmtEmbedSlots` value once;
3. records `spmtWorkspaceProfileV1Migrated:<userId>` and removes the legacy key;
4. applies the account appearance and slots;
5. caches the complete profile under a user-specific key for fast startup and offline visibility;
6. debounces writes and serializes them by revision;
7. displays loading, unsaved, saving, saved, offline, conflict, and error states;
8. offers retry, conflict reload, and confirmed reset controls.

Changing identities clears the rendered workspace before loading the next account. A loaded-account guard prevents the prior account state from being written during that transition.

## Verification and rollback

Owner-side smoke coverage proves default creation, field validation, sensitive URL rejection, revision conflicts, two-account isolation, export, reset, event redaction, and database persistence. The SpaceMountain mapping smoke proves all appearance fields plus dock visibility, volume, and mute state round-trip through the contract.

Rollback order:

1. roll SpaceMountain back first; SPMT can retain unused version-1 rows safely;
2. do not drop `workspace_profiles` during rollback;
3. keep the legacy `overlay_workspaces` routes until Overlay Studio and builder storage receive their separate migrations;
4. restore a pre-deploy SPMT database backup only for a database integrity failure, not for a consumer UI rollback.
