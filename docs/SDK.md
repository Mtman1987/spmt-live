# SDK

Current package: `@spmt/sdk` version `0.1.1`, distributed from `https://spmt.live/sdk/spmt-sdk.tgz` until npm publication.

Cross-platform setup:

```bash
npm exec --yes --package=https://spmt.live/sdk/spmt-sdk.tgz -- spmt install
```

Suggested modules:
- auth
- api
- events
- commlink
- shipyard
- athena
- ui
- hooks
- types

Apps should consume the SDK instead of duplicating API logic.

See `docs/developers/PARTNER_SDK_QUICKSTART.md` for app submission, app-bound keys, Linux usage, and game-event publishing.
