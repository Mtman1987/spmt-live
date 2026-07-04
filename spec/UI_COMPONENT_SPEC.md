# UI Component Specification

## Principle

Shared UI components help every app feel native to SpaceMountain.

## Core Components

### ShipyardCard

Shows app metadata, status, version, permissions, and action buttons.

### CommlinkMessage

Shows sender, source app, type, body, timestamp, attachments, and read state.

### AthenaPanel

Shows current command context, suggestions, memory snippets, and routed actions.

### NotificationCard

Shows title, body, source app, timestamp, action URL, and read state.

### StatusBadge

Normalizes states such as online, live, disabled, broken, beta, needs update.

## Rules

- Components should accept platform data models.
- Components should not hard-code one app's assumptions.
- Components should be accessible and responsive.
- Components should work in SpaceMountain.live and future apps.
