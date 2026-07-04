# MountainView

## Purpose

Future device/app layer for QR scanning, camera capture, voice commands, and AR-style routing.

## Owns

This app owns its specific product behavior and app-specific state.

## Publishes

- `device.paired`
- `qr.scanned`
- `voice.command.received`

## Consumes

- SPMT identity
- Shipyard launch metadata
- Commlink notification surfaces
- Athena context where useful

## Integration Goal

The app should feel like a module of the wider SpaceMountain ecosystem, not a disconnected website.
