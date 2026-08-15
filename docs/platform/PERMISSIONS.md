# Permissions

Permissions define what an app or platform credential can do through SPMT.

## Current Public Scope Families

Current platform scope names include:

- `identity:read`
- `identity:write`
- `apps:read`
- `apps:write`
- `messages:read`
- `messages:write`
- `athena:write`
- `events:write`
- `webhooks:write`
- `xp:write`

A capability appearing in UI or documentation does not mean every client receives it automatically. The credential must be issued with the required scope and, for privileged server operations, bound to the correct app/environment.

## User Sessions vs. Platform Credentials

User sessions and OAuth access tokens represent a signed-in person. They should be used for actions the user is authorized to perform.

Platform API keys represent a trusted app/backend. They are intended for server-to-server operations and must remain off the public client.

Do not use a platform credential merely to bypass a user permission check.

## Principles

- Ask for the minimum permissions required.
- Explain user-facing permissions in understandable language.
- Keep privileged credentials server-side.
- Bind service credentials to the owning app/environment where supported.
- Make credentials revocable and rotatable.
- Test both allowed and forbidden calls.
- Do not infer authorization from an app name, display name, provider username, or unverified request metadata.
- Keep tenant/user context explicit when the operation reads or writes tenant-owned state.

## Examples

A read-only identity consumer may only need `identity:read`.

A trusted migration backend that verifies existing provider accounts may require `identity:write`.

An event producer may require `events:write`.

A canonical XP producer requires `xp:write` and must still satisfy the app-bound XP contract and idempotency rules.

Requesting a broader scope set than the app uses increases risk and should be treated as an integration defect.
