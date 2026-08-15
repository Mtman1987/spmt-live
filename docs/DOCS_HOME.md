# SpaceMountain Documentation

Welcome to the SpaceMountain documentation hub.

SpaceMountain is a connected creator operating system. It combines a creator identity layer, a command bridge, app management, unified communication, AI orchestration, and specialized creator apps.

## Start Here

| Audience | Start With | Goal |
|---|---|---|
| Creators | `creator/GETTING_STARTED.md` | Learn how to use the ecosystem |
| Developers | `developers/QUICKSTART.md` | Learn how to build or integrate apps |
| Partners and Crew | `legal/README.md` | Review the owner-approved Community Terms package |
| Contributors | `CONTRIBUTING.md` | Learn where features belong |
| Product/Marketing | `business/POSITIONING.md` | Learn how to describe the platform |

## Raw / Offline Documentation

The docs site reads the Markdown sources listed in `docs/docs-nav.json` directly.

- Open `/docs/all.md` to view the complete public documentation as one Markdown document.
- Use **Download All (.md)** on the docs page to save the same bundle as `SPMT-DOCS.md`.
- The bundle is generated automatically during the application image build from the navigation manifest, so it should never be edited as a separate source of truth.
- Archived and internal-only documents are not included unless they are deliberately added to the public navigation manifest.

## Core Concepts

- **SPMT / Creator Cloud** — identity, platform APIs, event bus, app registry, Commlink data, Athena context.
- **SpaceMountain.live / Command Bridge** — the user-facing workspace and launcher.
- **Shipyard** — app discovery, install state, permissions, health, and launch flow.
- **Commlink** — unified messages, app events, notifications, forums, and AI conversations.
- **Athena** — operating intelligence for the ecosystem.
- **Event Bus** — how apps publish events without hard-coding direct integrations.

## Read Next

1. `VISION.md`
2. `ARCHITECTURE.md`
3. `creator/GETTING_STARTED.md`
4. `platform/EVENT_BUS.md`
5. `developers/APP_INTEGRATION_GUIDE.md`
6. `legal/README.md`
