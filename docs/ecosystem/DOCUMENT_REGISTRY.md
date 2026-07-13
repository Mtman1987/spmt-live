# Ecosystem Document Registry

Updated: 2026-07-13

This registry prevents old plans, generated mirrors, and public copy from becoming competing engineering sources of truth.

## Authoritative Documents

| Concern | Authoritative path | Rule |
|---|---|---|
| Internal production execution | `docs/ecosystem/PRODUCTION_ROADMAP.md` | Ordered gates and active engineering tickets |
| Starting evidence and capture process | `docs/ecosystem/PRODUCTION_BASELINE.md` | Refresh evidence before every slice |
| Machine-readable repo/deploy inventory | `docs/ecosystem/production-manifest.json` | Documentation inventory only; never a runtime secret/config store |
| SPMT Gate 0 runtime evidence | `docs/ecosystem/SPMT_PRODUCTION_INVENTORY.md` | Refresh from live Fly, database, workflow, backup, and smoke evidence |
| Portable workspace contract | `docs/ecosystem/WORKSPACE_PROFILE_V1.md` | Versioned SPMT owner contract, SpaceMountain migration, failure behavior, and rollback |
| Cross-app implementation method | `docs/ecosystem/WORKING_METHOD.md` | Plan ecosystem-wide; implement and verify one owner/consumer at a time |
| Public docs entry | `docs/DOCS_HOME.md` | Creator and developer documentation navigation |
| Public roadmap | `PUBLIC_ROADMAP.md` | Short, truthful, non-technical status only |
| Product integration/adoption | `docs/business/ECOSYSTEM_ROLLOUT_PLAN.md` | Product narrative, not an engineering queue |
| Platform contracts | `docs/platform/` and `spec/` | Update beside contract-changing code |
| App-specific implementation | Each app repository's `docs/` and tests | App owner is authoritative for its feature internals |

## Mirrored Documents

SpaceMountain's `web/docs` to `web/public/docs` and `web/spec` to `web/public/spec` copies are exact tracked mirrors. They are deploy inputs, not independent authoring locations.

Until a synchronization step is added:

1. edit the source tree;
2. update its public mirror in the same commit;
3. verify hashes match;
4. build;
5. request the live Markdown URL.

Production Gate 10 should replace this manual rule with one authored source and an automated build copy or server route. Only then should the tracked mirrors be removed.

## Archived Documents

`docs/archive/2026-07-13-pre-production-baseline/` preserves the former root roadmap, TODO, handoff, and platform-manual pointer. They are historical snapshots and must not be revived as task queues. The archive index explains each file.

## Cleanup Rules

- Do not delete a document merely because its title resembles another document.
- Compare content, links, runtime readers, ownership, and current claims first.
- Move superseded evidence into a dated archive and add an archive banner.
- Delete generated files only after the generator or ignore rule is known.
- Do not label source as dead code solely because a text search finds no import; routes, reflection, build scripts, plugins, and deployment entry points require dedicated checks.
- Record ambiguous candidates and resolve them in the owning app's production slice.
