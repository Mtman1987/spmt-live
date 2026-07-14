# SPMT SDK Specification

Current package name: `@spmt/sdk` (with the `spmt` executable).

## Purpose

The SDK should prevent every app from hand-rolling the same platform calls.

## Modules

### Identity

```ts
client.identity.me()
client.identity.refresh()
```

### Apps

```ts
client.apps.list()
client.apps.get(appId)
client.apps.install(appId)
client.apps.disable(appId)
```

### Events

```ts
client.events.publish({
  type: "reward.earned",
  sourceApp: "chat-tag",
  payload: {}
})
```

Backed by:

- `POST /api/events` for user-session publishing
- `POST /api/platform/events` for scoped platform API key publishing
- `GET /api/platform/events` for server-side event history

### Commlink

```ts
client.commlink.notify({
  title: "Reward earned",
  body: "A viewer earned a reward.",
  sourceApp: "chat-tag"
})
```

### Athena

```ts
client.athena.remember({
  topic: "Stream summary",
  content: "StreamWeaver completed 3 automations."
})
```

### Webhooks

```ts
client.webhooks.create({
  url: "https://example.com/webhook",
  events: ["reward.earned"]
})
```

## SDK Principles

- Make the safe path easy.
- Hide token/header details where possible.
- Keep app-specific logic out of the SDK.
- Keep response shapes predictable.
- Provide browser and server usage modes separately.
