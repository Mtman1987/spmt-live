# Security Model

## Identity

SPMT owns canonical ecosystem identity and session validation.

Apps should attach app-owned data to the immutable SPMT user ID. Twitch/Discord display names are not identity proof; provider reconciliation must use verified immutable provider IDs.

## Authentication Boundaries

Use the credential that matches the actor:

- signed-in user session or bearer token for user actions;
- OAuth access token for an app acting with the user's authorized SPMT identity;
- scoped, app-bound platform credential for trusted server-to-server operations.

A server credential must not be used to bypass a user authorization decision.

## OAuth

- Register exact callback URLs.
- Validate application `state`.
- Exchange authorization codes on the backend.
- Treat authorization codes as one-time credentials.
- Keep OAuth client secrets server-side.
- Re-authorize or refresh instead of creating a replacement identity when tokens expire.

## Secrets

Secrets belong in server-side environment/secret stores, not browser bundles, public repositories, logs, event payloads, or generated documentation.

Do not print full service keys, OAuth client secrets, refresh tokens, session tokens, or provider credentials in diagnostics.

## Platform API Keys

Platform API keys should be:

- scoped;
- app/environment bound where supported;
- revocable and rotatable;
- hashed or otherwise protected at rest;
- checked for the required capability before privileged actions;
- isolated from public/browser code.

## Tenant and Account Isolation

Shared platform features must keep tenant/user ownership explicit. Missing tenant context should fail closed when the operation would otherwise read or write tenant-owned state.

Cross-app migration and reconciliation must not merge accounts from loose aliases or matching display names.

## Event and XP Safety

Events should use stable IDs and bounded payloads without raw secrets or private logs.

Canonical XP awards require a stable SPMT user ID plus an upstream/idempotency identifier. Retries reuse that identifier so a repeated delivery cannot award points twice.

## Companion / Device Control

Paired Companion devices receive explicit capabilities. Device commands are constrained to supported action/capability mappings; higher-impact commands may require confirmation and expire if they are not completed in time.

## Failure Behavior

Security-sensitive failures should be visible and recoverable, not silently converted into a fake account, broad credential fallback, or simulated success.
