# Event Specification

## Principle

Apps publish events instead of directly coupling to each other.

The Event Bus lets SPMT route events to Commlink, Athena, notifications, analytics, webhooks, plugins, and future apps.

## Required Event Shape

```ts
type EcosystemEvent = {
  id: string;
  type: string;
  version: number;
  timestamp: string;
  sourceApp: string;
  actor?: {
    userId?: string;
    username?: string;
    displayName?: string;
  };
  visibility: "private" | "creator" | "community" | "public" | "system";
  payload: Record<string, unknown>;
  links?: EventLink[];
};
```

## Event Link Shape

```ts
type EventLink = {
  label: string;
  url: string;
  kind: "launch" | "details" | "manage" | "external";
};
```

## Naming Convention

Use dotted names:

- `stream.started`
- `stream.ended`
- `reward.earned`
- `voice.room.created`
- `discord.shoutout.created`
- `automation.completed`
- `plugin.installed`
- `athena.command.executed`

## Rules

- Events must include `type`, `sourceApp`, `timestamp`, and `payload`.
- Events should include stable IDs when possible.
- Do not include secrets or raw tokens.
- Prefer summaries and stable references over noisy raw logs.
- User-facing events may create Commlink notifications.
- Useful operational events may write Athena context.
