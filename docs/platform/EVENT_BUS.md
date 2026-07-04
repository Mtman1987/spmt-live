# Ecosystem Event Bus

The Event Bus prevents tight coupling between apps.

Apps publish events. SPMT routes those events to subscribers such as Athena, Commlink, notifications, analytics, and future apps.

```mermaid
flowchart TD
  App[App publishes event] --> Bus[SPMT Event Bus]
  Bus --> Commlink
  Bus --> Athena
  Bus --> Notifications
  Bus --> Analytics
  Bus --> OtherApps[Other Apps]
```

## Event Shape

```json
{
  "id": "evt_123",
  "type": "reward.earned",
  "sourceApp": "chat-tag",
  "actor": "user_123",
  "timestamp": "2026-07-04T12:00:00Z",
  "payload": {}
}
```
