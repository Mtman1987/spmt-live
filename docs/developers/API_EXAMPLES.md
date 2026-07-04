# API Examples

These examples describe intended platform usage. Exact endpoint details may evolve.

## Get Current User

```bash
curl https://spmt.live/api/me \
  -H "Authorization: Bearer $SPMT_TOKEN"
```

## List Apps

```bash
curl https://spmt.live/api/apps \
  -H "Authorization: Bearer $SPMT_TOKEN"
```

## Install App

```bash
curl -X POST https://spmt.live/api/apps/chat-tag/install \
  -H "Authorization: Bearer $SPMT_TOKEN"
```

## Publish A Platform Event

Future SDK-style example:

```ts
await client.events.publish({
  type: "automation.completed",
  sourceApp: "streamweaver",
  payload: {
    automationId: "auto_123",
    summary: "Scene switch automation completed."
  }
});
```

## Send A Commlink Notification

```ts
await client.commlink.notify({
  title: "Automation completed",
  body: "StreamWeaver completed your intro scene workflow.",
  sourceApp: "streamweaver"
});
```

## Write Athena Context

```ts
await client.athena.remember({
  topic: "Stream automation",
  content: "Intro scene automation completed successfully.",
  sourceApp: "streamweaver"
});
```
