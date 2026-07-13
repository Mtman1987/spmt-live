# Atherrea SPMT proof of concept

This folder is the framework-neutral fallback for integrating Atherrea with SPMT.

## What the proof establishes

1. Atherrea has a stable `atherrea` app ID and public manifest.
2. A scoped API key is bound to that app ID.
3. The app can submit its metadata for SPMT registry review.
4. The app can publish `game.*` events without exposing its key to players or browsers.
5. SPMT persists those events and makes them available to the owner’s platform context.

## Fast path for a Node project

```powershell
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt install --app-id atherrea --name Atherrea
```

Sign into `https://spmt.live/?view=developers`, generate an app-bound key with `apps:read`, `apps:write`, and `events:write`, then copy `.env.example` to `.env` and paste the key there.

```powershell
npx spmt doctor
npx spmt submit
node --env-file=.env javascript/publish-event.mjs
```

## Existing server status JSON

If your game already writes status JSON, keep that shape and publish it as the event payload. For example:

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

Save it as `status.json`, then run:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt event server.status --data-file status.json
```

If npm reuses an old cached SDK, use the versioned package URL:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk-0.1.1.tgz -- spmt event server.status --data-file status.json
```

SPMT stores that object unchanged under the event `payload`; it does not require camelCase field names.

## Non-Node projects

- C# / Unity-style HTTP: `csharp/SpmtClient.cs`
- Linux Bash/curl proof: `bash/publish-event.sh`
- PowerShell proof: `powershell/publish-event.ps1`

The API key is a server secret. Do not ship it in a browser bundle, public game client, source-control commit, or `spmt.app.json`. A game client should send its data to the game’s trusted backend, and that backend should publish to SPMT.
