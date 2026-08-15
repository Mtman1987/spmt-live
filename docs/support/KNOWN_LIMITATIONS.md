# Known Limitations

SpaceMountain is evolving quickly. Public documentation should distinguish implemented contracts, production-verified behavior, and planned work.

## Current Areas To Label Clearly

- First-party apps have SPMT identity/OAuth paths, but the full two-account live matrix for direct/embedded login, logout, refresh, account switching, disconnect/export/deletion remains production verification work.
- Some app integrations still have app-specific adapters or compatibility paths while canonical SPMT identity, XP, shared chat, and workspace contracts converge.
- Athena exposes real shared memory/context and configured platform surfaces, but several assistant/automation/voice capabilities remain unavailable or planned and must not be presented as executed behavior.
- The SDK is a real repository implementation with generated package output and versioned contracts; consumers should still verify the specific exported helper/contract they depend on rather than assuming every platform idea has an SDK method.
- The docs UI is intentionally lightweight. It renders common Markdown constructs itself rather than using a full documentation framework.
- Mermaid source is preserved in documentation/code blocks, but the lightweight docs page does not yet provide a full Mermaid diagram renderer.
- The complete `SPMT-DOCS.md` download is generated from the public navigation manifest during the production image build. It contains the public documentation set, not internal production/archive material.
- Some production gates remain open even when a route, UI, build, or test exists. Production readiness requires the live evidence and failure/recovery behavior defined by the authoritative production roadmap.

## Rule

Do not hide limitations or turn roadmap intent into present-tense capability. Update this page when a limitation is actually removed, and keep detailed engineering status in the authoritative production roadmap rather than duplicating the active backlog here.
