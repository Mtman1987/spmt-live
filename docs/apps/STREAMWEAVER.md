# StreamWeaver

## Purpose

Stream automation, overlays, TTS, AI generation, commands, and Streamer.bot workflows.

## Owns

This app owns its specific product behavior and app-specific state.

## Publishes

- `stream.started`
- `automation.completed`
- `overlay.updated`

## Consumes

- SPMT identity
- Shipyard launch metadata
- Commlink notification surfaces
- Athena context where useful

## Integration Goal

The app should feel like a module of the wider SpaceMountain ecosystem, not a disconnected website.
