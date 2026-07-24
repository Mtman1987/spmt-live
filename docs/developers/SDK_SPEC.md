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

### Shared live chat

Gate 3 begins with the exported `SharedChatEventV1` contract and validator. StreamWeaver remains the high-volume chat owner, but apps should normalize live Twitch, Discord, Kick, YouTube, Social Stream bridge, and app chat into this shape before SPMT indexes or displays it.

```ts
import { validateSharedChatEventV1 } from "@spmt/sdk";

const result = validateSharedChatEventV1({
  schemaVersion: 1,
  eventId: "evt_...",
  upstreamId: "twitch:message:...",
  tenantId: "tenant_...",
  platform: "twitch",
  sourceId: "stream_...",
  channelId: "channel_...",
  type: "message",
  sender: { id: "viewer_...", displayName: "Viewer" },
  text: "hello chat",
  originalTimestamp: new Date().toISOString(),
  receivedTimestamp: new Date().toISOString()
});
```

Required ownership boundaries:

- `tenantId`, `sourceId`, and `channelId` are routing identifiers, not display names.
- `eventId` is the SPMT/StreamWeaver stable ID; `upstreamId` is the provider message/event ID.
- `routing.canReply`, `routing.botReadable`, and `routing.botCanReply` must be explicit before UI or bots expose reply controls.
- Mail/direct messages and live chat remain different data types even when shown in the same Commlink workspace.

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
