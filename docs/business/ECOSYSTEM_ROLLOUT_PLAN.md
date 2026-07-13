# SpaceMountain Ecosystem Rollout Plan

Document role: product integration and adoption strategy. Engineering execution is tracked in `../ecosystem/PRODUCTION_ROADMAP.md`.

## Purpose

This document explains how SpaceMountain's apps should become one connected creator ecosystem instead of separate tools that happen to share a theme.

The goal is simple:

> Make every app better because it belongs to the same system.

SPMT is the identity, data, app registry, communication, Athena, and platform layer.

SpaceMountain.live is the user-facing Command Bridge where creators launch apps, read messages, control workflows, and see what is happening across the ecosystem.

The apps keep their special jobs, but they stop duplicating identity, messaging, notifications, and cross-app context.

## The User Promise

A creator should be able to say:

> I signed into SpaceMountain once, and now my tools know who I am, talk to each other, notify me in one place, and let Athena help me run the whole show.

That is the product promise.

## Why This Is Different

Most streamer tools are islands.

A creator usually has:

- one bot dashboard
- one Discord tool
- one music or room tool
- one overlay tool
- one game tool
- one AI tool
- one community tool
- separate logins
- separate notifications
- separate settings
- separate user lists

SpaceMountain should feel different because every app joins one ecosystem.

The unique value is not just that the apps exist. The unique value is that the apps share:

- identity
- linked Twitch and Discord accounts
- app install state
- notifications
- conversations
- forums
- Athena memory
- command routing
- app launch context
- platform APIs

That shared layer creates features that standalone apps cannot easily offer.

## Real World Integration Examples

### Example 1: Stream Starts, Everything Prepares

A creator goes live.

StreamWeaver detects the stream and starts automation.

Discord Stream Hub prepares shoutouts and community status.

ChatTag checks whether an active game or reward event should be shown.

HearMeOut checks whether a room or music session is active.

SPMT collects the important events.

SpaceMountain.live shows them in the Command Bridge.

Athena summarizes it:

> Stream is live. StreamWeaver has commands ready, Discord Stream Hub has three shoutout candidates, ChatTag has one active reward event, and HearMeOut has no active room.

Why it matters:

The creator does not need to open five dashboards just to understand what is ready.

### Example 2: One Viewer Identity Across Apps

A community member participates in Discord, Twitch, ChatTag, and HearMeOut.

SPMT links their Discord and Twitch identity to the same account.

ChatTag can show their rewards.

Discord Stream Hub can show their leaderboard position.

HearMeOut can invite them to a room.

Commlink can show relevant messages and notifications.

Why it matters:

Community identity follows the person instead of being trapped inside one app.

### Example 3: A ChatTag Reward Becomes A Whole Ecosystem Event

A viewer wins a ChatTag challenge.

ChatTag keeps the actual game state.

SPMT receives a notification event.

Commlink shows the reward.

Discord Stream Hub can announce the result.

StreamWeaver can trigger an overlay or TTS moment.

Athena can remember that the user won and mention it later.

Why it matters:

One app event becomes a shared creator moment.

### Example 4: HearMeOut Room Invites Do Not Get Lost

A creator starts a HearMeOut room.

HearMeOut owns the room and media session.

SPMT receives the room invite event.

Commlink shows the invite.

SpaceMountain.live shows it in the notification bell.

Athena can route a command like:

> Open the active room.

Why it matters:

Rooms become part of the creator workspace instead of hidden inside one app.

### Example 5: Discord Stream Hub Shoutouts Become Smarter

Discord Stream Hub sees a creator, partner, or crew member go live.

It sends the shoutout to SPMT.

SPMT connects the event to linked Twitch and Discord accounts.

SpaceMountain.live shows live community cards.

Commlink can notify the creator.

Athena can summarize who is live and why they matter.

Why it matters:

Shoutouts stop being just a Discord feature and become part of the entire creator command center.

### Example 6: StreamWeaver Automation Talks To Athena

StreamWeaver completes a generated media job, command change, overlay update, or TTS event.

It sends a platform event to SPMT.

Commlink stores the user-facing result.

Athena stores the useful context.

SpaceMountain.live can show the update in the creator workspace.

Why it matters:

Automation gains memory and visibility instead of disappearing into logs.

### Example 7: A New App Drops And Existing Users Can Use It

A new app is added to the ecosystem.

It registers with SPMT.

SPMT provides its launch URL, permissions, health, version, and install state.

SpaceMountain Shipyard shows it as available.

Existing users can install or enable it without creating another separate account.

Why it matters:

The ecosystem gets easier to expand over time instead of harder.

## App By App Integration Plan

### Discord Stream Hub

Keep inside DSH:

- Discord-specific logic
- shoutouts
- leaderboard calculations
- calendar workflows
- moderation review
- community routing

Move or connect through SPMT:

- current user identity
- linked Discord and Twitch matching
- cross-app notifications
- app launch targets
- Athena memory summaries
- platform API writes

Working integration examples:

- A shoutout creates a Commlink notification.
- A leaderboard milestone appears in SpaceMountain.
- A Discord event is summarized by Athena.
- A moderation item can be opened from Command Bridge.

### StreamWeaver

Keep inside StreamWeaver:

- stream automation
- commands
- overlays
- TTS
- Streamer.bot workflows
- AI generation jobs

Move or connect through SPMT:

- admin identity
- install and launch state
- command results worth notifying about
- generated media completion notices
- Athena memory for stream events
- platform API keys for server-to-server writes

Working integration examples:

- A command failure alerts Commlink.
- A completed AI media job appears in notifications.
- Athena can summarize which automation ran during a stream.
- SpaceMountain can launch command, overlay, and workflow views from Shipyard.

### HearMeOut

Keep inside HearMeOut:

- rooms
- music queues
- media sessions
- watch parties
- overlays
- playback state

Move or connect through SPMT:

- room ownership identity
- room invite notifications
- watch party reminders
- Athena room summaries
- launch targets for active rooms

Working integration examples:

- A new room sends a Commlink invite.
- A queue change appears as a room update.
- Athena can open the active room from a voice command.
- SpaceMountain shows active rooms as launchable workspace cards.

### ChatTag And Quackverse

Keep inside ChatTag:

- game mechanics
- cards
- rewards
- arena logic
- overlays
- live game state

Move or connect through SPMT:

- player identity
- linked Twitch and Discord resolution
- reward notifications
- leaderboard summaries
- Athena memory for game events
- Shipyard launch targets

Working integration examples:

- A reward sends a Commlink notification.
- A game event triggers an overlay through StreamWeaver.
- Athena can summarize who won last round.
- SpaceMountain can show active game state beside live tools.

### MountainView

Keep inside MountainView:

- device-specific camera behavior
- QR scanning
- AR-style navigation
- local voice capture
- device controls

Move or connect through SPMT:

- paired user identity
- command routing
- Athena context
- app launch targets
- device notifications

Working integration examples:

- A QR scan opens a SpaceMountain app.
- A glasses voice command routes through Athena.
- A camera capture can create a Commlink note.
- Device state appears in Command Bridge.

## Why Creators Should Adopt It

### One account instead of many

Creators should not need a new account for every tool.

SPMT gives them one creator identity across the ecosystem.

### One place to see what happened

Important app events should land in Commlink and notifications.

Creators should not have to check every dashboard after a stream.

### One launcher for the workspace

Shipyard turns ecosystem apps into installable and launchable modules.

Creators should be able to open the right tool from one command bridge.

### One AI that understands the whole setup

Athena becomes more useful than a normal assistant because she can see ecosystem context.

She can help with apps, messages, rooms, community, automation, and platform state.

### Apps become stronger together

The more apps connect to SPMT, the more useful every app becomes.

That is the core advantage.

## Why Developers Should Adopt It

### They do not need to rebuild accounts

SPMT handles creator identity.

### They do not need to rebuild messaging

Commlink provides a shared destination for important user-facing events.

### They do not need to build a launcher

Shipyard provides app discovery, install state, launch URLs, and permissions.

### They can reach existing users

A new app can become available to users who already have SPMT accounts.

### They can plug into Athena

Apps can provide context and actions that Athena can summarize, route, or explain.

## Marketing Positioning

### Short pitch

SpaceMountain is a connected creator operating system for streamers, communities, and live tools.

### One sentence

SpaceMountain gives creators one identity, one command bridge, one inbox, one AI, and one ecosystem for their streaming tools.

### Tagline options

- One identity. One command bridge. Every creator tool connected.
- Stop juggling dashboards. Start commanding your ecosystem.
- The creator operating system for streamers and communities.
- A connected home for streamer tools, AI, apps, and community.
- Where your creator tools become one ecosystem.

### Problem statement

Streamers use too many disconnected tools. Every bot, overlay, Discord tool, music room, game, AI assistant, and dashboard wants its own login, notifications, settings, and workflow.

### Solution statement

SpaceMountain connects those tools through SPMT identity, Commlink messaging, Shipyard app management, Athena OS, and a unified Command Bridge.

### Adoption message for streamers

If your stream setup feels scattered, SpaceMountain gives you one place to launch tools, read updates, manage community events, and let Athena help you understand what is happening.

### Adoption message for developers

If you are building creator tools, SPMT gives you identity, app registry, messaging, notifications, plugin surfaces, and Athena context so you can focus on your app instead of rebuilding platform plumbing.

## First Step For Next Developers

Before coding, every developer should read these files in order:

1. `README.md`
2. `ECOSYSTEM_TODO.md`
3. `ROADMAP.md`
4. `ECOSYSTEM_HANDOFF.md`
5. `ECOSYSTEM_ROLLOUT_PLAN.md`

Then they should answer these questions:

1. Does this feature belong in SPMT, SpaceMountain.live, or one app?
2. Does it duplicate identity, messaging, notifications, or app registry logic?
3. Should this app event create a Commlink notification?
4. Should this app event write context for Athena?
5. Should this feature appear in Shipyard?
6. Should this use scoped platform API access?

## Developer Cleanup Priority

### Step 1: Clear Public Confusion

- Replace generic or outdated README content.
- Explain what SPMT is.
- Explain what SpaceMountain.live is.
- Explain how the apps relate.
- Clearly label MVP surfaces versus future hardening.
- Add screenshots or diagrams later.

### Step 2: Make App Integration Consistent

Each app should receive the same integration checklist:

- SPMT identity restore
- linked account usage
- Shipyard launch target
- Commlink notification events
- Athena context events
- health endpoint
- version metadata
- platform API key usage where needed

### Step 3: Build A Shared Client

Create a reusable SPMT client or SDK so every app does not manually implement the same calls.

Minimum client helpers:

- get current user
- refresh current user
- list apps
- install app
- disable app
- send notification
- write Athena memory
- submit platform event

### Step 4: Market Around The Ecosystem

Do not market each app as a disconnected product.

Market the connected system.

The strongest message is:

> Every tool gets better when it belongs to the same creator ecosystem.

## What Must Stay True

- SPMT owns identity.
- SpaceMountain.live owns the command bridge UI.
- Apps own their special features.
- Shared user context belongs in SPMT.
- Important user-facing app events belong in Commlink.
- Useful cross-app context belongs in Athena.
- Apps should be discoverable and launchable through Shipyard.
- The ecosystem should get more valuable as more apps join.
