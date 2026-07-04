# Commlink Specification

## Principle

Commlink is the unified communication layer.

## Item Types

- direct message
- group conversation
- app message
- bot message
- system notice
- forum activity
- voice message metadata
- AI conversation
- notification

## Conversation Shape

```ts
type Conversation = {
  id: string;
  type: "direct" | "group" | "app" | "bot" | "system" | "forum" | "ai" | "voice";
  title?: string;
  participants: string[];
  unreadCount: number;
  updatedAt: string;
};
```

## Message Shape

```ts
type CommlinkMessage = {
  id: string;
  conversationId: string;
  fromUserId?: string;
  sourceApp?: string;
  type: string;
  subject?: string;
  body: string;
  attachments?: unknown[];
  mentions?: unknown[];
  createdAt: string;
  readAt?: string;
};
```

## Rules

- Important app events should create Commlink-visible messages or notifications.
- Commlink should filter by type.
- Commlink should support unread state.
- Commlink should support app and bot messages without pretending they are human DMs.
- Noisy internal logs do not belong in Commlink.
