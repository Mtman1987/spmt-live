# SpaceMountain SDK

This is the first shared client for ecosystem apps. It is intentionally local to this repo until the package is promoted.

## Server-side usage

```ts
import { SpaceMountainClient } from "./sdk";

const spmt = new SpaceMountainClient({
  apiKey: process.env.SPMT_API_KEY,
});

await spmt.events.publish({
  type: "automation.completed",
  sourceApp: "streamweaver",
  payload: {
    automationId: "intro",
    summary: "Intro scene workflow completed.",
  },
});
```

## Browser/user-session usage

```ts
const spmt = new SpaceMountainClient({
  token: () => localStorage.getItem("spmt_token") || undefined,
});

const me = await spmt.identity.me();
const apps = await spmt.apps.list();
```

## Modules

- `identity`
- `apps`
- `events`
- `commlink`
- `athena`
- `webhooks`

Use the SDK instead of hand-writing these same calls in every ecosystem app.
