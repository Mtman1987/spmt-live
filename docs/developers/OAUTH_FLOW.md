# OAuth Flow

SPMT should be the identity provider for first-party and future ecosystem apps.

## Flow

```mermaid
sequenceDiagram
  participant User
  participant App
  participant SPMT
  participant SpaceMountain

  User->>App: Open app from Shipyard
  App->>SPMT: Redirect to authorize
  SPMT->>User: Confirm identity/session
  SPMT->>App: Return authorization result
  App->>SPMT: Request current user
  SPMT->>App: Return SPMT identity
  App->>SpaceMountain: User appears connected
```

## App Requirements

- Do not create a fake user when SPMT identity is missing.
- Redirect to SPMT when identity is required.
- Store sensitive tokens server-side where practical.
- Use linked account fields for Twitch/Discord matching.
- Keep app-specific profiles optional and tied to SPMT identity.
