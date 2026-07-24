# SPMT SDK 0.1.4

This is the public `@spmt/sdk` partner SDK and `spmt` developer CLI. It is published on npm and mirrored directly by SPMT.

## One-command project setup

```powershell
npm exec --yes --package=@spmt/sdk -- spmt install
```

If npm is unavailable or you need the SPMT-hosted mirror, use the versioned package URL:

```powershell
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk-0.1.4.tgz -- spmt install
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

## Publishing an existing server-status JSON shape

SPMT wraps app data in a platform event, but the nested `payload` object can keep the app's original field names. For example, a Vintage Story server can write this to `status.json`:

```json
{
  "PlayerCount": 0,
  "LastUpdated": "2026-07-13T21:22:42.3245966+00:00",
  "Year": 3,
  "DayOfYear": 11,
  "Season": "Winter",
  "IsTemporalStormActive": false,
  "RiftActivity": "Unknown",
  "ServerVersion": "1.22.3.0"
}
```

Then publish it without renaming the fields:

```bash
npx spmt event server.status --data-file status.json
```

Hosted mirror fallback:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk-0.1.4.tgz -- spmt event server.status --data-file status.json
```

The stored event type becomes `game.server.status`, the source app comes from `spmt.app.json`, and the payload keeps the exact JSON shape above.

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
