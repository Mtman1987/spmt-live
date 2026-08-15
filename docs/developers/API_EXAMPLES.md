# API Examples

These examples show current SPMT integration patterns. Prefer `@spmt/sdk` in application code and use raw HTTP mainly for debugging or integrations that cannot use the SDK.

Current SPMT public base: `{{apps.spmt.urls.public}}`  
Current snapshot: `{{generatedAt}}`

## Get Current User

```bash
curl {{apps.spmt.urls.public}}/api/me \
  -H "Authorization: Bearer $SPMT_TOKEN"
```

## OAuth Userinfo

After an app exchanges its authorization code for an access token:

```bash
curl {{apps.spmt.urls.public}}/api/oauth/userinfo \
  -H "Authorization: Bearer $SPMT_OAUTH_ACCESS_TOKEN"
```

## List Apps

```bash
curl {{apps.spmt.urls.public}}/api/apps \
  -H "Authorization: Bearer $SPMT_TOKEN"
```

## Install App

```bash
curl -X POST {{apps.spmt.urls.public}}/api/apps/chat-tag/install \
  -H "Authorization: Bearer $SPMT_TOKEN"
```

## Read Workspace Profile

```ts
const { profile } = await spmt.workspace.profile();
console.log(profile.revision, profile.appearance.themeId);
```

Workspace writes are revision-aware; use the SDK patch/replace helpers rather than blind overwrites.

## Publish A User Event

```ts
await spmt.events.publish({
  type: 'automation.completed',
  sourceApp: 'streamweaver',
  payload: {
    automationId: 'auto_123',
    summary: 'Scene switch automation completed.'
  }
});
```

## Award Canonical XP From A Trusted Server

```ts
import { mappedXpAwardV1, SpaceMountainClient } from '@spmt/sdk';

const serverSpmt = new SpaceMountainClient({
  baseUrl: '{{apps.spmt.urls.public}}',
  appId: 'discord-stream-hub',
  apiKey: process.env.SPMT_API_KEY,
});

await serverSpmt.experience.award(mappedXpAwardV1({
  userId: 'spmt-user-id',
  mappedEventType: 'dsh.discord.message',
  upstreamEventId: 'discord:message:123',
  metadata: { tenantId: 'creator-tenant', channelId: 'discord-channel-id' },
}));
```

The platform credential stays server-side. Retries must reuse the same stable upstream event ID.

## Send A Commlink Notification

```ts
await spmt.commlink.notify({
  title: 'Automation completed',
  body: 'StreamWeaver completed your intro scene workflow.',
  sourceApp: 'streamweaver'
});
```

## Write Athena Context

```ts
await spmt.athena.remember({
  topic: 'Stream automation',
  content: 'Intro scene automation completed successfully.',
  sourceApp: 'streamweaver'
});
```

## Register A Webhook

```ts
await spmt.webhooks.create({
  url: 'https://example.com/spmt-webhook',
  events: ['automation.completed']
});
```

Webhook URLs must use HTTPS.
