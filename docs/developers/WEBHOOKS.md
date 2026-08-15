# Webhooks

Webhooks let signed-in developers register HTTPS destinations for selected SPMT ecosystem events.

## Current Developer Routes

- `GET /api/platform/webhooks` — list the current developer's registered webhooks.
- `POST /api/platform/webhooks` — create a webhook registration.

Creation requires an HTTPS URL. The SDK exposes the same create operation through `client.webhooks.create(...)`.

## Example

```ts
await spmt.webhooks.create({
  url: 'https://example.com/spmt-webhook',
  events: ['automation.completed', 'app.installed']
});
```

## Webhook Use Cases

- send an ecosystem event to an external dashboard;
- trigger an integration workflow from an SPMT event;
- notify another trusted system that an app or room changed state;
- feed analytics or operational tooling without hard-coding one app directly to another.

## Event Shape

Consumers should treat event IDs, type, source app, timestamp, actor, visibility, links, and payload as bounded platform data. Exact event contracts should come from the event catalog/spec when one exists.

Example:

```json
{
  "id": "evt_123",
  "type": "voice.room.created",
  "sourceApp": "hearmeout",
  "timestamp": "2026-07-04T12:00:00Z",
  "actor": { "userId": "user_123" },
  "payload": {
    "roomId": "room_456",
    "title": "Watch Party"
  }
}
```

## Reliability Rules

- Use HTTPS webhook destinations.
- Include and persist event IDs.
- Make consumers idempotent because delivery or upstream work may be retried.
- Never include raw secrets, credentials, or private internal logs in payloads.
- Prefer stable object/provider IDs over display names.
- Return failures visibly in operational tooling; do not silently treat failed delivery as success.
- Keep webhook-side authorization independent from any SPMT credential that created the registration.

## Scope Boundary

Webhook registration is a developer/platform integration surface. It does not make an external endpoint a trusted SPMT server credential and does not grant that receiver permission to call privileged platform APIs.
