# App Integration Guide

## Integration Checklist

Every app should:

- use SPMT identity
- avoid duplicate profiles
- register app metadata
- expose launch URLs
- expose health/version metadata
- publish ecosystem events
- send user-facing updates to Commlink
- write useful context to Athena
- use scoped API keys for privileged server-to-server actions

## Placement Rule

If every app benefits, build it in SPMT.

If users see it as part of the main workspace, build it in SpaceMountain.live.

If only one app needs it, build it in that app.
