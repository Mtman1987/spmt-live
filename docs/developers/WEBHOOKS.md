# Webhooks

Webhooks let apps and external services subscribe to ecosystem events.

## Webhook Use Cases

- send `reward.earned` to Discord
- trigger StreamWeaver automation from an app event
- notify an external dashboard when a room starts
- sync platform events to analytics
- connect plugin workflows

## Webhook Event Shape

```json
{
  "id": "evt_123",
  "type": "voice.room.created",
  "sourceApp": "hearmeout",
  "timestamp": "2026-07-04T12:00:00Z",
  "actor": "user_123",
  "payload": {
    "roomId": "room_456",
    "title": "Watch Party"
  }
}
```

## Reliability Rules

- Include event IDs.
- Make webhook consumers idempotent.
- Retry delivery later when possible.
- Never include raw secrets in payloads.
- Prefer stable object IDs over display names.
