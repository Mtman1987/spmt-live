# Testing Guide

## Manual Smoke Test

1. Open SpaceMountain.live.
2. Open Docs.
3. Open Shipyard.
4. Open Commlink.
5. Confirm app list loads.
6. Launch a registered app.
7. Confirm SPMT identity is restored where supported.
8. Trigger or fake an app event.
9. Confirm notification or Commlink output appears.

## App Integration Test

For each app:

- Can it launch from Shipyard?
- Does it know the SPMT user?
- Does it publish at least one event?
- Does it avoid duplicate identity?
- Does it expose health/version metadata?

## Docs Test

- Docs nav loads.
- Docs search filters.
- Markdown content renders.
- Diagrams remain readable.
- Links point to existing files.
