# Athena Specification

## Principle

Athena is the operating intelligence of the Creator Cloud.

Athena should not be a disconnected chatbot. She should understand the creator's ecosystem.

## Athena Context

Athena may use:

- current user
- installed apps
- permissions
- recent events
- unread messages
- active rooms
- game state summaries
- app health
- notifications
- automation history
- community status
- memory
- user goals

## Memory Shape

```ts
type AthenaMemory = {
  id: string;
  userId: string;
  scope: "user" | "app" | "command" | "community" | "system";
  topic: string;
  content: string;
  sourceApp?: string;
  createdAt: string;
  updatedAt: string;
};
```

## Command Routing

Athena may route commands to:

- Shipyard
- Commlink
- StreamWeaver
- HearMeOut
- ChatTag
- Discord Stream Hub
- MountainView
- platform plugins
- other AI crew members

## Rules

- Athena should receive summaries, not raw noisy logs.
- Athena should respect app permissions.
- Athena should identify source apps clearly.
- Athena should explain what she knows and where it came from.
- Athena should route specialized work to specialized apps or AI crew.
