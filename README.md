# SPMT.live

SPMT.live is the identity, data, messaging, app registry, and platform backend for the SpaceMountain creator ecosystem.

It is designed around one simple idea:

> One creator identity should unlock every connected tool.

A creator should be able to make one `@spmt.live` account and use that identity across SpaceMountain.live, Discord Stream Hub, StreamWeaver, HearMeOut, ChatTag, MountainView, Athena OS, plugins, future apps, and community tools.

## What SPMT Owns

SPMT is the source of truth for shared ecosystem services:

- user identity
- login and account state
- linked creator accounts
- app registry metadata
- app install state
- app permissions
- Commlink messages
- conversations
- notifications
- forums
- Athena context
- developer API surfaces
- plugins
- webhooks
- app submissions

Individual apps should own their app-specific behavior, but shared identity, communication, and cross-app context belong in SPMT.

## How It Fits With SpaceMountain.live

SPMT and SpaceMountain.live are intentionally different layers.

### SPMT.live

The backend and identity layer.

It answers:

- Who is this user?
- What apps can they access?
- What messages and notifications belong to them?
- What app events should be visible across the ecosystem?
- What context should Athena know?

### SpaceMountain.live

The user-facing Command Bridge.

It presents:

- dashboard
- launcher
- Shipyard
- Commlink
- notifications
- forums
- dockable app slots
- Athena panel
- app controls
- creator workspace

## Core Ecosystem Apps

SPMT currently tracks the first-party ecosystem apps:

- SpaceMountain.live - command bridge, launcher, dashboard, and frontend shell
- Discord Stream Hub - Discord community tools, shoutouts, calendar, leaderboard, and bridge workflows
- StreamWeaver - stream automation, commands, overlays, TTS, AI, and Streamer.bot workflows
- HearMeOut - voice rooms, watch parties, shared listening, and media surfaces
- ChatTag + Quackverse - community games, overlays, rewards, cards, and live play
- MountainView - future device/app layer for QR, voice, camera, and AR-style workflows

## Main Platform Areas

### Identity Core

One `@spmt.live` account should become the creator passport for every app.

Apps should consume SPMT identity instead of creating local account systems.

### Shipyard

Shipyard is the ecosystem app manager.

It handles:

- available apps
- installed apps
- launch URLs
- permissions
- versions
- updates
- enabled or disabled state

The long-term goal is that adding a new app means registering it with SPMT, not rebuilding identity and messaging from scratch.

### Commlink

Commlink is the communication layer.

It brings together:

- direct messages
- group conversations
- app messages
- bot messages
- notifications
- forum activity
- voice message metadata
- AI conversation routing

Apps should send important user-facing events into Commlink instead of hiding them inside separate dashboards.

### Athena OS

Athena is the operating intelligence layer for the ecosystem.

Athena should understand:

- the signed-in user
- installed apps
- user preferences
- recent messages
- app events
- creator context
- command routing targets

Athena should eventually feel like the ship intelligence for the whole SpaceMountain ecosystem, not a chatbot bolted onto one page.

### Platform And Developers

SPMT includes early platform surfaces for:

- public API discovery
- app submissions
- plugin marketplace
- API keys
- webhooks
- SDK direction
- developer portal concepts

The MVP surface exists, but the ecosystem still needs hardening before it should be treated as a mature third-party developer platform.

## Integration Rule

Before adding identity, messaging, notification, or app install logic to another app, ask:

> Should this be shared by every SpaceMountain app?

If yes, it belongs in SPMT.

If it is a user-facing command or dashboard experience, it probably belongs in SpaceMountain.live.

If it is specific to one tool, it belongs inside that app.

## App Integration Checklist

Every ecosystem app should work toward this contract:

- register in SPMT app metadata
- launch from SpaceMountain Shipyard
- use SPMT identity for account context
- use linked Twitch/Discord accounts where needed
- expose health and version status
- send important events to Commlink
- write useful context to Athena when appropriate
- use scoped platform keys for server-to-server writes
- avoid duplicating user profiles, auth, and messaging

## Current Project State

See:

- `ROADMAP.md` for phase status
- `ECOSYSTEM_HANDOFF.md` for detailed integration guidance
- `PHASE_ONE.md` for the identity-core checklist

## Why This Exists

Most creator tools solve one narrow problem and then make streamers manage another account, another dashboard, another notification system, and another disconnected workflow.

SpaceMountain is aiming for a different model:

> A connected creator ecosystem where identity, communication, AI, app launch, and community tools benefit from being part of the same system.

That is the reason to adopt SPMT: it reduces repeated work for developers and gives creators one connected home for their tools.
