# Partner SDK Quickstart

This is the minimum production-shaped path for connecting a partner app such as Atherrea to SPMT.

## Linux, macOS, or Windows

Install Node.js 18 or newer, open a terminal inside the app folder, and run:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt install
```

If npm reuses an old cached tarball, use the versioned package URL:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk-0.1.1.tgz -- spmt install
```

The command creates a public `spmt.app.json`, a working `spmt/publish-event.mjs`, `.env.example`, and a `.gitignore` entry for `.env`. In Node projects it also installs `@spmt/sdk` from the SPMT-hosted package.

## Create the app key

1. Sign into `https://spmt.live/?view=developers`.
2. Enter the manifest app ID, such as `atherrea`.
3. Create the scoped key.
4. Copy the one-time value into the app server's local `.env`:

```dotenv
SPMT_API_KEY=spmt_replace_me
SPMT_BASE_URL=https://spmt.live
```

The key is a secret. Never put it in `spmt.app.json`, source control, a browser bundle, or a shipped game client. Client games should send data to their trusted backend, which publishes it to SPMT.

## Verify, submit, and publish

```bash
npx spmt doctor
npx spmt submit
node --env-file=.env spmt/publish-event.mjs
```

- `doctor` verifies the manifest, platform, key scopes, and app-ID binding.
- `submit` creates or updates the app's private review record.
- owner approval promotes that record into the public installable app list.
- the proof script publishes a persistent `game.session.started` event.

Publish arbitrary game data with:

```bash
npx spmt event game.player.progressed --data '{"playerId":"safe-reference","level":2,"summary":"Reached level 2"}'
```

If the SDK was not installed locally yet, use the hosted package form:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt event player.progressed --data '{"playerId":"safe-reference","level":2,"summary":"Reached level 2"}'
```

For an existing server-status JSON file, keep the app's original shape and publish it as the event payload:

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

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt event server.status --data-file status.json
```

Cache-proof version:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk-0.1.1.tgz -- spmt event server.status --data-file status.json
```

Do not publish passwords, tokens, private player records, or raw personal data in event payloads.

## Non-Node fallback

Download `https://spmt.live/sdk/atherrea-spmt-starter.zip`. It contains Bash/curl, PowerShell, C#, and JavaScript examples using the same API contract.
