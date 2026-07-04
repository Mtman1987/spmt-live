# Ecosystem Event Bus

Every app publishes events instead of directly calling every other app.

Examples:

- stream.started
- stream.ended
- reward.earned
- discord.shoutout.created
- voice.room.created
- automation.completed
- plugin.installed

Consumers include Athena, Commlink, Notifications, Analytics, and future apps.
