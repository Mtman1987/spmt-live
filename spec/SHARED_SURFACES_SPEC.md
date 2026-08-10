# SPMT Shared Surfaces v1

SPMT is the single source of truth for ecosystem-wide account surfaces. Apps embed these surfaces instead of copying their settings, messaging, notification, profile, or overlay implementations.

## Canonical surfaces

| ID | Route | Primary data |
| --- | --- | --- |
| `commlink` | `/embed/commlink` | Commlink feed, conversations, messages |
| `settings` | `/embed/settings` | Workspace profile and saved themes |
| `worktray` | `/embed/worktray` | Shared surfaces and app component registry |
| `notifications` | `/embed/notifications` | Account notifications |
| `profile` | `/embed/profile` | SPMT identity and linked providers |
| `overlays` | `/embed/overlays` | Overlay scenes and workspace |

Every surface accepts a non-sensitive `mode` (`full`, `panel`, `dock`, `compact`, or `overlay`) and an optional public `app` identifier. Tokens, API keys, authorization codes, passwords, and secrets are forbidden in surface and component URLs.

## Authentication

- Same-origin SPMT pages use the HttpOnly SPMT session cookie.
- Native and trusted clients may send `Authorization: Bearer <SPMT token>`.
- External apps use `POST /api/embed/launch` and exchange the short-lived, one-time code server-to-server.
- Developer writes use an app-bound SPMT API key in the `Authorization` header. Query-string keys are not supported.

## External components

An app-bound key with `apps:write` can upsert a component through `POST /api/platform/components`. Supported kinds are `card`, `panel`, `dock`, `overlay`, `action`, and `settings`.

The same manifest is available through:

- SDK: `spmt.developer.registerComponent(manifest)`
- CLI: `spmt component add <id> --url <https-url>`
- MCP: `spmt.components.register` at `/api/mcp`
- REST: `POST /api/platform/components`

The Worktray reads `GET /api/platform/components`, so a registered component becomes available without adding per-app synchronization code.

## Host behavior

Hosts should size the iframe for the selected mode and listen for `spmt.surface.updated` messages. The update event is only an invalidation signal; hosts must re-read authoritative data from SPMT and must not trust profile data supplied through `postMessage`.
