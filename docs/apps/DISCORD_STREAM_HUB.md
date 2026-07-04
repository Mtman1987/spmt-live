# Discord Stream Hub

## Purpose

Discord community tools, shoutouts, calendar, leaderboard, moderation, and community routing.

## Owns

This app owns its specific product behavior and app-specific state.

## Publishes

- `discord.shoutout.created`
- `calendar.event.created`
- `moderation.alert`

## Consumes

- SPMT identity
- Shipyard launch metadata
- Commlink notification surfaces
- Athena context where useful

## Integration Goal

The app should feel like a module of the wider SpaceMountain ecosystem, not a disconnected website.
