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

### Shared XP ledger

Gate 1 uses SPMT as the canonical XP/level/reward ledger. Apps should publish bounded, idempotent awards through `client.experience.award(...)` or build a known award with `mappedXpAwardV1(...)`.

```ts
import { mappedXpAwardV1, validateXpAwardV1 } from "@spmt/sdk";

const award = mappedXpAwardV1({
  userId: "spmt_user_id",
  mappedEventType: "chat-tag.tag",
  upstreamEventId: "twitch:message:123",
  metadata: { tenantId: "creator_tenant", channelId: "twitch_channel" },
});

if (validateXpAwardV1(award).ok) {
  await client.experience.award(award);
}
```

Current canonical mappings:

- `chat-tag.tag` -> `chat-tag`, +100 XP
- `chat-tag.pass` -> `chat-tag`, +200 XP
- `chat-tag.bingo.square` -> `chat-tag`, +10 XP
- `chat-tag.bingo.win` -> `chat-tag`, +250 XP
- `dsh.discord.message` -> `discord-stream-hub`, +1 XP
- `dsh.twitch.follow` -> `discord-stream-hub`, +25 XP
- `dsh.twitch.raid` -> `discord-stream-hub`, +50 XP
- `dsh.twitch.sub` -> `discord-stream-hub`, +100 XP
- `spacemountain.tool.trigger` -> `spacemountain`, +5 XP
- `spacemountain.arena.kill` -> `spacemountain`, +1 XP

Every producer must supply the immutable SPMT `userId`, a stable upstream event/message ID, and metadata that identifies tenant/source/channel without storing secrets. Retries must reuse the same idempotency key so points cannot be awarded twice.

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
