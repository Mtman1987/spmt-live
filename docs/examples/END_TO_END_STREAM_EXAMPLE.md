# End-To-End Example: Stream Night

## Scenario

The creator starts a stream.

## Flow

1. StreamWeaver publishes `stream.started`.
2. Discord Stream Hub publishes `discord.shoutout.created` for live partners.
3. ChatTag publishes `game.started`.
4. HearMeOut publishes `voice.room.created`.
5. SPMT routes events to Commlink, Athena, and notifications.
6. SpaceMountain.live shows a workspace summary.
7. Athena explains what is happening.

## Athena Summary

> Stream is live. StreamWeaver has automations ready, Discord Stream Hub found two partners live, ChatTag started a reward game, and HearMeOut has a voice room open.

## Why This Matters

No individual app can provide that summary alone. The ecosystem can.
