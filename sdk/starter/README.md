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

## Non-Node projects

- C# / Unity-style HTTP: `csharp/SpmtClient.cs`
- Linux Bash/curl proof: `bash/publish-event.sh`
- PowerShell proof: `powershell/publish-event.ps1`

The API key is a server secret. Do not ship it in a browser bundle, public game client, source-control commit, or `spmt.app.json`. A game client should send its data to the game’s trusted backend, and that backend should publish to SPMT.
