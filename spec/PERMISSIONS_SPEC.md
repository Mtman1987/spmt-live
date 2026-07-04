# Permissions Specification

## Principle

Permissions define what apps, plugins, API keys, and AI crew members may do.

## Permission Format

Use colon-separated scopes:

- `identity:read`
- `apps:read`
- `apps:write`
- `messages:read`
- `messages:write`
- `events:write`
- `athena:read`
- `athena:write`
- `webhooks:write`
- `plugins:install`

## Rules

- Apps request minimum necessary permissions.
- Users should eventually be able to review permissions.
- API keys must be scoped.
- Plugin actions must be scoped.
- AI crew actions must be scoped.
- Privileged actions must be checked server-side.
