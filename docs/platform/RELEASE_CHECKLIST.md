# Release Checklist

Before shipping an ecosystem change:

## Build

- Run local build.
- Verify no obvious TypeScript or bundling errors.
- Confirm docs still match behavior.

## Platform Contract

- Did an endpoint change?
- Did an event shape change?
- Did an app metadata field change?
- Did an auth/session behavior change?

If yes, update docs.

## App Impact

Check:

- SpaceMountain.live
- SPMT
- Discord Stream Hub
- StreamWeaver
- HearMeOut
- ChatTag
- Quackverse
- MountainView

## Live Verification

Check:

- app loads
- identity restores
- apps list appears
- Commlink opens
- Docs page opens
- critical APIs return expected status
