# ChatTag

## Purpose

Live community games, overlays, rewards, leaderboards, and arena state.

## Owns

This app owns its specific product behavior and app-specific state.

## Publishes

- `game.started`
- `reward.earned`
- `leaderboard.updated`

## Consumes

- SPMT identity
- Shipyard launch metadata
- Commlink notification surfaces
- Athena context where useful

## Integration Goal

The app should feel like a module of the wider SpaceMountain ecosystem, not a disconnected website.
