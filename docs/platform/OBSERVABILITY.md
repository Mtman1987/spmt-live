# Observability

The platform should make ecosystem health visible.

## Health Signals

SPMT should expose:

- API uptime
- database health
- app registry status
- active app count
- conversation count
- notification count
- event processing status
- platform plugin status

Apps should expose:

- health URL
- version
- latest version
- adapter status
- auth status where safe
- last successful event publish

## Command Bridge

SpaceMountain.live should summarize health in user-friendly language.

Example:

> StreamWeaver is online. HearMeOut needs attention. ChatTag has an update available.
