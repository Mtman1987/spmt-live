# SpaceMountain Roadmap

## Status

Current phase: Phase 3 - Shipyard
Overall progress: about 63%
Last updated: 2026-07-03

## Phase 1 - Identity Core

Goal: every SpaceMountain app shares one SPMT identity.

### SPMT

- [x] Dashboard
- [x] Login
- [x] Registration
- [x] Logout endpoint
- [x] App catalog
- [x] `/api/me` endpoint
- [x] `/api/apps` endpoint
- [x] Session refresh
- [x] App install state
- [x] First-pass permission scopes
- [x] Linked account management
- [x] OAuth client cleanup
- [x] Better API error handling
- [x] Health dashboard API

### SpaceMountain.live

- [x] Account dropdown
- [x] Open SPMT button
- [x] Logout button
- [x] Consume `/api/me`
- [x] Remove fake identity restore from OAuth callback
- [x] Proper SPMT session restore
- [x] Better login flow through SPMT OAuth
- [x] Better iframe auth postMessage handling
- [x] Launch apps through SPMT app catalog/auth URLs
- [x] Shipyard page
- [x] Notification bell routes to Commlink inbox

## Phase 2 - Commlink

Goal: one communication system.

### SPMT

- [x] Direct messages
- [x] Group conversation API
- [x] Forum API
- [x] Notification API
- [x] Bot/app messages
- [x] Discord forwarding into forum threads
- [x] Search across messages, notifications, and forums
- [x] Message filters
- [x] Mentions metadata
- [x] Attachment metadata
- [x] AI conversation routing
- [x] Voice message metadata

### SpaceMountain.live

- [x] Inbox consumes SPMT conversations
- [x] Compose sends through SPMT Commlink
- [x] Notification UI in inbox
- [x] Notification bell unread count
- [x] Full thread view
- [x] Group chat creation UI
- [x] Forum thread detail/reply UI
- [x] Search UI
- [x] Filters UI
- [x] Attachment display for Commlink messages
- [x] Mention rendering for Commlink messages

## Phase 3 - Shipyard

Goal: install ecosystem apps with one click.

- [x] Installed Apps
- [x] Available Apps
- [x] Updates
- [x] Permissions
- [x] Health
- [x] Versioning
- [x] Launch
- [x] Enable
- [x] Disable

## Phase 4 - Command Bridge

Goal: SpaceMountain becomes the operating dashboard.

- [ ] Unified Dashboard
- [ ] Widgets
- [ ] Voice Commander
- [ ] AI Panel
- [ ] Dockable Apps
- [ ] Live Status
- [ ] Activity Feed
- [ ] Search Everywhere
- [ ] Creator Workspace

## Phase 5 - Athena OS

Goal: Athena becomes the ecosystem AI.

- [ ] Shared Memory
- [ ] App Awareness
- [ ] Voice Control
- [ ] Automation
- [ ] Multi-Agent Crew
- [ ] Cross-App Context
- [ ] Creator Assistant
- [ ] AI Skills
- [ ] AI Marketplace

## Phase 6 - Platform

Goal: open SpaceMountain to developers.

- [ ] SDK
- [ ] Public API
- [ ] Developer Portal
- [ ] Plugin Marketplace
- [ ] App Submission
- [ ] OAuth Apps
- [ ] Webhooks
- [ ] Documentation

## Rules

- SPMT owns identity.
- SpaceMountain.live owns the UI.
- Apps own only their own features.
- Never duplicate authentication.
- Never duplicate user profiles.
- Never duplicate messaging.
- Every app registers with SPMT.
- Every commit must move the platform forward.
- Keep commits small and deployable.
- Push to main after each completed milestone.
- Test after every deployment.
