# SDK Direction

Future package: `@spmt/sdk` or `@spacemountain/sdk`.

The first local implementation lives at `sdk/index.ts`.

## Suggested Modules

- auth
- identity
- apps
- shipyard
- commlink
- athena
- events
- webhooks
- ui
- hooks
- types

## Goal

Apps should not hand-roll SPMT API calls. A shared SDK should provide stable helpers for the common platform contract.

Use `SpaceMountainClient` with a user token for browser/session calls and with a scoped platform API key for server-to-server calls.
