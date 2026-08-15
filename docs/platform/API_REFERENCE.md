# API Reference

This page summarizes the supported SPMT integration surfaces. The SDK should be preferred for application code because it applies the expected authentication mode and shared contracts.

## Current Ecosystem Snapshot

- Public SPMT URL: `{{apps.spmt.urls.public}}`
- API base URL: `{{apps.spmt.urls.api}}`
- Repository: `{{apps.spmt.repository.name}}`
- Current Fly service state: `{{apps.spmt.services.spmt-live.runtime.status}}`
- Snapshot observed: `{{generatedAt}}`

These values come from the public `spmt.ecosystem-state/v1` snapshot produced by MTMan Machine Rotator. Lifecycle/capability declarations remain separate from observed runtime health.

## Authentication Modes

### User session / bearer token

Use for actions performed as the signed-in SPMT user. Browser/session SDK calls use the user's SPMT session or bearer token.

### OAuth access token

First-party and third-party apps use the authorization-code flow to obtain an access token representing the same canonical SPMT identity.

### Scoped platform API key

Use for trusted server-to-server operations such as publishing platform events, grandfathering verified identities, or awarding canonical XP. Keys are app-bound, scoped, and should never be shipped to browser code.

## Identity and OAuth

- `GET /api/me` — current signed-in SPMT user.
- `POST /api/auth/refresh` — refresh the current SPMT user session.
- `POST /api/auth/claim-imported` — claim credentials for an eligible imported/provider-owned identity.
- `GET /api/oauth/authorize` — begin OAuth authorization-code flow.
- `POST /api/oauth/token` — exchange a one-time authorization code or other supported OAuth grant.
- `GET /api/oauth/userinfo` — read the canonical SPMT identity for an OAuth access token.
- `POST /api/platform/identity/grandfather` — trusted app-bound migration of a verified provider identity.

See `developers/OAUTH_FLOW.md` for the application flow and migration rules.

## Apps / Shipyard

- `GET /api/apps`
- `GET /api/apps/:appId`
- `GET /api/apps/:appId/versions`
- `POST /api/apps/:appId/install`
- `POST /api/apps/:appId/disable`
- `POST /api/platform/apps` — developer/app submission surface.

## Workspace and Overlays

- `GET /api/workspace-profile`
- `PATCH /api/workspace-profile`
- `PUT /api/workspace-profile`
- `POST /api/workspace-profile/reset`
- `GET /api/overlay-workspace`

Workspace writes use revision-aware `WorkspaceProfileV1` contracts. Apps should use SDK helpers instead of independently inventing workspace preference formats.

## Commlink

- `GET /api/conversations`
- `GET /api/notifications`
- `GET /api/search`
- `GET /api/messages`

Commlink also has SDK-owned shared-chat, dispatch, operator, and integration contracts. Use the SDK/spec documentation for those versioned payload shapes instead of inferring them from UI responses.

## Events

- `POST /api/events` — publish as the authenticated user/session where allowed.
- `POST /api/platform/events` — publish with a scoped platform credential.
- `GET /api/platform/events` — server-side event history for authorized integrations.

Event producers should send stable IDs and retry idempotently.

## Experience / XP

- `GET /api/xp` — current user's canonical XP and derived level.
- `POST /api/platform/xp` — app-bound, scoped canonical XP award endpoint.

XP producers must use the canonical SPMT user ID and a stable upstream event/message ID so retries cannot double-award points.

## Athena

- `GET /api/athena/os`
- `GET /api/athena/context`
- `POST /api/athena/commands`

Athena surfaces must report configured, degraded, unavailable, or accepted-job state truthfully rather than presenting planned capability as completed behavior.

## Developer Webhooks

- `GET /api/platform/webhooks` — list the signed-in developer's registered webhooks.
- `POST /api/platform/webhooks` — register an HTTPS webhook and event selection.

See `developers/WEBHOOKS.md` for delivery guidance and event-shape rules.

## Companion

Authenticated Companion control currently includes device pairing/revocation and command submission/status under `/api/companion/...`, with a WebSocket relay at `/api/companion/relay` for the paired desktop runtime.

Use the SDK `Companion*V1` contracts and capability mapping instead of sending arbitrary device actions.

## Platform Discovery

- `GET /api/platform`
- `GET /api/platform/docs`
- `GET /api/platform/plugins`

These discovery routes describe public platform capabilities; they are not a substitute for versioned SDK/spec contracts when an operation has one.
