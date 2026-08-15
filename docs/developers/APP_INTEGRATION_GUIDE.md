# App Integration Guide

Use this sequence when connecting an app to SPMT. The goal is to reuse shared platform contracts instead of rebuilding identity, permissions, events, workspace state, or communication independently in every app.

## Current Integration Target

- SPMT public URL: `{{apps.spmt.urls.public}}`
- SPMT API base: `{{apps.spmt.urls.api}}`
- SPMT repository: `{{apps.spmt.repository.name}}`
- Current observed SPMT service state: `{{apps.spmt.services.spmt-live.runtime.status}}`
- Snapshot observed: `{{generatedAt}}`

These values are resolved from `spmt.ecosystem-state/v1`; authored integration guidance below remains the durable contract.

## 1. Decide Ownership First

- If every app benefits, build the shared contract in SPMT.
- If users see it as part of the main workspace, build the user-facing shell/surface in SpaceMountain.live.
- If only one app needs the behavior, keep the implementation and app-owned data in that app.

## 2. Register the App

Provide stable app metadata:

- app ID and display name;
- launch URL;
- registered OAuth callback URL where applicable;
- health/version metadata;
- requested permissions/scopes;
- icon/category metadata where needed by Shipyard.

Use immutable app IDs in contracts and credentials. Do not use a display name as an authorization identifier.

## 3. Use SPMT Identity

For user-facing ecosystem identity, use SPMT OAuth/session restore rather than creating a duplicate account.

- Browser/user actions use the signed-in SPMT session or OAuth access token.
- Trusted server operations use a scoped, app-bound platform credential.
- Existing users may be grandfathered only after immutable provider identity has been verified server-side.

See `OAUTH_FLOW.md` and `../platform/IDENTITY.md`.

## 4. Use the SDK

Prefer `@spmt/sdk` / `SpaceMountainClient` for shared contracts and authenticated requests.

Typical modules include identity, apps, developer/shared surfaces, events, experience/XP, workspace, shared chat/Commlink, Athena, webhooks, game helpers, and Companion contracts.

Do not hand-roll a second format when a versioned SDK/spec type already exists.

## 5. Request Minimum Permissions

Ask only for capabilities the app actually uses. Keep privileged credentials server-side and test both allowed and forbidden operations.

Examples of current platform scopes include identity, apps, messages, Athena, events, webhooks, and XP capabilities. See `../platform/PERMISSIONS.md` for the current public scope guidance.

## 6. Publish Events Instead of Hard-Coding App-to-App Calls

Use the event bus when multiple consumers may care about an action. Events should have stable IDs, explicit source app, bounded payloads, and no raw secrets.

Retries must be safe. If an operation changes a durable ledger such as XP, reuse the same stable upstream/idempotency identifier.

## 7. Use Commlink for User-Facing Communication

When an app needs to surface messages, notifications, shared live-chat events, or operator actions, use Commlink contracts instead of creating another ecosystem-wide inbox.

App-private chat/media state can remain app-owned; normalize cross-app data only at the shared boundary.

## 8. Use Athena Only for Real Context or Accepted Work

Apps may write useful context or submit supported commands, but UI and API responses must distinguish configured, degraded, unavailable, and actually accepted/executed behavior.

Do not document planned AI capability as if it is live.

## 9. Integrate Workspace/Shared Surfaces Only When Needed

Apps that participate in the shared workspace should consume the versioned workspace profile/theme/surface contracts rather than copying UI preferences into unrelated schemas.

Keep app-owned state separate from portable workspace preferences.

## 10. Test the Failure Paths

Before calling an integration complete, test:

- direct and embedded login;
- logout and refresh;
- account switching;
- missing/revoked scopes;
- invalid or replayed OAuth state/codes;
- duplicate/retried events;
- unavailable SPMT dependency;
- tenant/account isolation;
- health/version reporting;
- restart/deploy persistence for app-owned durable state.

## Integration Checklist

Every integrated app should:

- use canonical SPMT identity;
- avoid duplicate ecosystem profiles;
- register app metadata and exact callbacks;
- expose launch and health/version information;
- use minimum scoped credentials;
- publish shared events through platform contracts;
- use Commlink for shared user-facing communication where appropriate;
- write only useful, truthful Athena context;
- use canonical XP/workspace/shared-surface contracts when participating in those systems;
- have automated contract coverage plus a production smoke path for its critical integration.
