# 24-Hour Lounge media

The Lounge music/movie widget consumes `https://hearmeout-main.fly.dev/lounge-media/player`. The Spotlight widget consumes `https://hearmeout-main.fly.dev/spotlight-media/player`.

Do not route either Lounge widget through ApolloStation or a `sprites.app` URL. Do not restore the old `/lounge-media/player` or `/spotlight-media/player` Sprite links during migrations or layout normalization. StreamWeaver handles Twitch chat commands; HearMeOut owns the media queues and persistent source; the overlay is only a viewer.
