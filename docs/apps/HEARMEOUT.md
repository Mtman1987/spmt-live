# HearMeOut

## Purpose

Voice rooms, music queues, watch parties, shared listening, and room overlays.

## Owns

This app owns its specific product behavior and app-specific state.

## Publishes

- `voice.room.created`
- `voice.room.closed`
- `music.track.changed`

## Consumes

- SPMT identity
- Shipyard launch metadata
- Commlink notification surfaces
- Athena context where useful

## Integration Goal

The app should feel like a module of the wider SpaceMountain ecosystem, not a disconnected website.
