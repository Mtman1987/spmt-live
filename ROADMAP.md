# SpaceMountain Roadmap

## Status

Handoff reference: `ECOSYSTEM_HANDOFF.md`

Current phase: Phase 6 - Platform
Overall progress: MVP complete, hardening in progress
Last updated: 2026-07-04

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

- [x] Unified Dashboard
- [x] Widgets
- [x] Voice Commander
- [x] AI Panel
- [x] Dockable Apps
- [x] Live Status
- [x] Activity Feed
- [x] Search Everywhere
- [x] Creator Workspace

## Phase 5 - Athena OS

Goal: Athena becomes the ecosystem AI.

- [x] Shared Memory
- [x] App Awareness
- [x] Voice Control
- [x] Automation
- [x] Multi-Agent Crew
- [x] Cross-App Context
- [x] Creator Assistant
- [x] AI Skills
- [x] AI Marketplace

## Phase 6 - Platform

Goal: open SpaceMountain to developers.

- [x] SDK
- [x] Public API
- [x] Developer Portal
- [x] Plugin Marketplace
- [x] App Submission
- [x] OAuth Apps
- [x] Webhooks
- [x] Documentation

## Hardening / Polish

- [x] Remove production JWT fallback
- [x] Move Discord Stream Hub points token out of browser calls
- [x] Hash and revoke platform API keys
- [x] Persist Athena command routing into memory/conversations
- [x] Back Search Everywhere with SPMT `/api/search`
- [x] Add full developer docs UI
- [x] Add plugin marketplace management UI
- [x] Add production-grade API key scope enforcement middleware
- [x] Split Command Bridge into cleaner collapsible sections
- [x] Add browser voice support/error guidance polish

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
