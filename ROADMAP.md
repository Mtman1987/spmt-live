# SpaceMountain Roadmap

Last updated: 2026-07-04

The old phase checklists are complete as MVP surfaces. Current work is production hardening and app alignment, tracked in `ECOSYSTEM_TODO.md`.

## Current Status

- Phase 1 Identity Core: MVP complete, production stability still being verified app by app.
- Phase 2 Commlink: MVP complete, app ingestion still needs expansion.
- Phase 3 Shipyard: MVP complete, app health and launch metadata still need cleanup.
- Phase 4 Command Bridge: MVP complete, UI component split and polish still needed.
- Phase 5 Athena OS: MVP complete, app activity/memory ingestion still needs real producers.
- Phase 6 Platform: MVP complete, API key scopes, SDK packaging, and webhook/event hardening still needed.

## Active Release Track

1. Fix production correctness bugs from the ecosystem audit.
2. Make DSH the live-community authority for SpaceMountain spotlight and live counts.
3. Configure app platform API keys and publish real app events into SPMT.
4. Standardize health, launch, identity, and notification contracts across every app.
5. Clean up app-local auth/session duplication.
6. Componentize and polish SpaceMountain UI after behavior is stable.

## Source Of Truth

- Active unfinished work: `ECOSYSTEM_TODO.md`
- Developer handoff: `ECOSYSTEM_HANDOFF.md`
- Platform docs: `docs/`
- Public platform spec: `spec/`

## Non-Negotiable Rules

- SPMT owns identity.
- SpaceMountain.live owns the UI.
- Apps own only their own features.
- Never duplicate authentication.
- Never duplicate user profiles.
- Never duplicate messaging.
- Every app registers with SPMT.
- Every commit must move the platform forward.
- Keep commits small and deployable.
- Push to `main` after each completed milestone.
- Test after every deployment.
