# Ecosystem Production Control

This directory is the versioned engineering control center for taking the SpaceMountain ecosystem to production. It belongs in the SPMT repository because SPMT owns the shared identity and platform contracts that every app consumes.

## Read In This Order

1. `PRODUCTION_BASELINE.md` — what repositories and evidence form the starting point.
2. `production-manifest.json` — machine-readable repository, deployment, health, and ownership inventory.
3. `PRODUCTION_ROADMAP.md` — the ordered production gates and engineering tickets.
4. `WORKING_METHOD.md` — how to change one app without losing cross-app implications.
5. `DOCUMENT_REGISTRY.md` — which documents are authoritative, supporting, mirrored, or archived.

## Authority Rules

- This directory owns internal ecosystem execution planning.
- `../DOCS_HOME.md` owns the public documentation entry point.
- `../../PUBLIC_ROADMAP.md` owns the short public-facing roadmap.
- Each app owns its feature-specific implementation docs and tests.
- A dated archive is evidence, never an active task queue.
- Live source, GitHub Actions, deployed health, runtime state, and a smoke test outrank status prose in old documents.

## Current Working Decision

Work in integration slices, but implement one owning app at a time. Freeze a shared contract in SPMT, finish and verify its owner, migrate one consumer, run the cross-app test, and only then move to the next consumer.
