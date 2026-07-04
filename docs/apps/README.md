# Ecosystem Apps

Apps are modules connected by SPMT.

Each app should own its specialty and share identity, events, notifications, and context through the platform.

## App Contract

Every app should:

- use SPMT identity
- register with Shipyard
- publish events
- send important notices to Commlink
- write useful context for Athena
- expose health/version metadata
