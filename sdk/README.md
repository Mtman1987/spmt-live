# SPMT SDK 0.1

This is the installable partner SDK and `spmt` developer CLI. It is served directly by SPMT until the package is published to npm.

## One-command project setup

```powershell
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt install
```

The command creates:

- `spmt.app.json` — public app metadata; safe to commit
- `spmt/publish-event.mjs` — working game-event proof
- `.env.example` — names the required environment variables without storing a secret
- a `.gitignore` entry for `.env`

Create an app-bound platform key at `https://spmt.live/?view=developers`, save it only in `.env`, and then run:

```powershell
npx spmt doctor
npx spmt submit
node --env-file=.env spmt/publish-event.mjs
```

Submission creates or updates a review record. Owner approval promotes it into the public, installable app list.

## Server-side usage

```ts
import { SpaceMountainClient } from "./sdk";

const spmt = new SpaceMountainClient({
  apiKey: process.env.SPMT_API_KEY,
  appId: "atherrea",
});

await spmt.game.publish("session.started", {
  sessionId: "demo-123",
  playerCount: 1,
  summary: "Atherrea session started",
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
- `developer`
- `events`
- `game`
- `commlink`
- `athena`
- `webhooks`

The SDK requires Node 18 or newer. Non-Node apps can use the same HTTPS contract; the Atherrea starter ZIP includes PowerShell and C# examples.
