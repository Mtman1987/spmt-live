# Architecture

## High-Level Map

```mermaid
flowchart TD
  Creator[Creator] --> Bridge[SpaceMountain.live / Command Bridge]
  Bridge --> SPMT[SPMT / Creator Cloud]
  SPMT --> Identity[Identity]
  SPMT --> Shipyard[Shipyard]
  SPMT --> Commlink[Commlink]
  SPMT --> Athena[Athena OS]
  SPMT --> EventBus[Event Bus]
  EventBus --> SW[StreamWeaver]
  EventBus --> DSH[Discord Stream Hub]
  EventBus --> HMO[HearMeOut]
  EventBus --> CT[ChatTag + Quackverse]
  EventBus --> MV[MountainView]
```

## SPMT Responsibilities

SPMT should answer:

- Who is the user?
- What apps can they access?
- What apps are installed?
- What permissions are granted?
- What messages and notifications exist?
- What events happened?
- What context should Athena know?

## SpaceMountain.live Responsibilities

SpaceMountain.live should present:

- the current creator workspace
- app launch state
- notifications
- Commlink
- Athena
- docs
- controls
- dashboards
- embedded/docked app surfaces

## App Responsibilities

Apps should focus on their specialty and publish useful ecosystem events.

They should not duplicate authentication, user profiles, global notifications, cross-app messaging, app registry state, or Athena memory.
