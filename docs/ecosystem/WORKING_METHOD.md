# Ecosystem Working Method

Updated: 2026-07-13

## Decision

Use a hybrid of ecosystem-wide planning and app-by-app implementation.

Changing several apps simultaneously makes regressions difficult to attribute and leaves partially compatible deployments. Working on apps in isolation without a shared contract creates duplicated auth, settings, inboxes, and event formats. An integration slice avoids both problems.

## Integration Slice

Every slice follows this order:

1. Name the user-visible outcome and the owner of the shared contract.
2. Record the request, response, event, state, authorization, and failure contracts.
3. Implement the owner first, normally SPMT for identity/platform state or StreamWeaver for automation runtime.
4. Add owner-side contract, authorization, tenant-isolation, migration, and rollback tests.
5. Deploy and smoke-test the owner before changing consumers.
6. Migrate exactly one consumer app.
7. Run the owner-consumer integration test and production smoke test.
8. Keep the compatibility path only for a documented migration window.
9. Repeat consumers one at a time.
10. Remove the compatibility path after usage evidence shows the migration is complete.

## Recommended App Order

1. SPMT identity, provider grants, workspace profile, app registry, and event contracts.
2. StreamWeaver tenant isolation, shared chat ingestion, TTS, overlay runtime, and workflow ownership.
3. SpaceMountain web as the first full consumer: session restore, inbox, workspace settings, Overlay Studio, builder links, and BattleArena entry.
4. Discord Stream Hub, HearMeOut, and ChatTag, migrated one at a time through the same contracts.
5. AETHERRA as the first partner-owned SDK canary once the SDK contract is real and versioned.
6. Athena command jobs and MountainView cloud/device relay after identity, event, and automation contracts are dependable.
7. Rotator production remediation and the dashboard keep/merge/retire decision.

## Before Editing

- Pull or fetch and confirm the current branch, local changes, remote drift, latest workflow, deployed app, and live health.
- Read the nearest `AGENTS.md`.
- Classify every configuration value before changing it:
  - secrets: environment variables or Fly secrets;
  - public runtime config: volume-backed JSON;
  - app state: database;
  - local-only debug: ignored local environment.
- Preserve unrelated user changes. Use a clean worktree if a production patch must stay isolated.
- Define the rollback and the evidence that will prove the change works.

## Commit And Deployment Unit

- Commit one app or one shared contract milestone at a time.
- Push completed milestones to `main` after relevant local checks pass.
- Do not call a change complete until its GitHub workflow and production smoke test pass.
- Documentation-only cleanup may skip a deployment when it cannot affect the built artifact; record that explicitly.
- A consumer must not depend on an owner contract that has not been deployed and verified.

## Slice Exit Gate

A slice is complete only when ownership is explicit, the contract is versioned, authorization and tenant isolation are tested, persistence and migration are proven, normal and failure UI states are visible, telemetry is useful without leaking secrets, rollback is documented, all touched repositories are clean and aligned, and the live cross-app flow passes.

