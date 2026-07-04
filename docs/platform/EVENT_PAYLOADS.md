# Event Payloads

This document defines example event payloads for common ecosystem events.

## `stream.started`

```json
{
  "type": "stream.started",
  "sourceApp": "streamweaver",
  "actor": "user_123",
  "payload": {
    "platform": "twitch",
    "channel": "mtman1987",
    "title": "Late night creator lab"
  }
}
```

## `discord.shoutout.created`

```json
{
  "type": "discord.shoutout.created",
  "sourceApp": "discord-stream-hub",
  "actor": "user_123",
  "payload": {
    "creator": "PartnerName",
    "platform": "twitch",
    "reason": "Went live"
  }
}
```

## `reward.earned`

```json
{
  "type": "reward.earned",
  "sourceApp": "chat-tag",
  "actor": "user_456",
  "payload": {
    "rewardId": "reward_789",
    "rewardName": "Tag Champion",
    "points": 500
  }
}
```

## `voice.room.created`

```json
{
  "type": "voice.room.created",
  "sourceApp": "hearmeout",
  "actor": "user_123",
  "payload": {
    "roomId": "room_123",
    "title": "Community Watch Party"
  }
}
```

## `athena.command.executed`

```json
{
  "type": "athena.command.executed",
  "sourceApp": "athena",
  "actor": "user_123",
  "payload": {
    "command": "open active room",
    "target": "hearmeout"
  }
}
```
