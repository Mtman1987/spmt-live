# SDK Guide

Current package: `@spmt/sdk` with the `spmt` command.

The source implementation lives at `sdk/index.ts`. The SDK is no longer only a suggested direction: it contains the shared client, validators, versioned contracts, and helpers used by current integration work.

## Create a Client

```ts
import { SpaceMountainClient } from '@spmt/sdk';

const spmt = new SpaceMountainClient({
  baseUrl: 'https://spmt.live',
  appId: 'your-app-id',
  token: () => currentUserToken,
});
```

Use `token` for user/session calls. For trusted server-to-server operations, create the client with an app-bound `apiKey` and keep that credential on the server.

## Current Areas

The SDK currently exposes contracts/helpers across these areas:

- identity and imported-account migration;
- apps / Shipyard;
- developer components and shared surfaces;
- events;
- game event helpers;
- canonical experience / XP;
- workspace profiles, theme tokens, and overlay workspace data;
- shared live-chat normalization;
- Commlink dispatch/operator/integration contracts;
- Athena context/commands;
- webhooks;
- Companion devices, capabilities, and commands;
- shared versioned types and validators.

Not every conceptual platform feature has a mature helper yet. Check `SDK_SPEC.md`, the exported types in `sdk/index.ts`, and the relevant platform spec before depending on a contract.

## Identity

```ts
const me = await spmt.identity.me();
```

Server integrations can use scoped identity operations such as verified grandfathering when they hold the correct app-bound permission.

## Workspace

```ts
const { profile } = await spmt.workspace.profile();
```

Workspace writes are revision-aware. Use SDK helpers instead of writing a second preference schema.

## Experience / XP

```ts
const balance = await spmt.experience.balance();
```

Trusted producers award XP through the scoped server client and an idempotent `XpAwardV1` payload.

## Events

```ts
await spmt.events.publish({
  type: 'automation.completed',
  sourceApp: 'your-app-id',
  payload: { automationId: 'auto_123' },
});
```

Choose the user-session or server credential client based on who owns the action.

## Goal

Apps should not hand-roll SPMT API calls or invent competing versions of shared contracts. The SDK should make the safe, versioned path the easiest path while keeping app-specific logic in the owning app.
