# Build Your First SpaceMountain App

This guide shows the ideal app integration path.

## Goal

Create an app that:

- uses SPMT identity
- appears in Shipyard
- publishes ecosystem events
- sends useful messages to Commlink
- provides Athena with helpful context

## Step 1: Define the app

Every app needs:

```json
{
  "id": "my-creator-app",
  "name": "My Creator App",
  "description": "A useful creator workflow.",
  "launchUrl": "https://example.com",
  "healthUrl": "https://example.com/health",
  "version": "0.1.0",
  "scopes": ["identity:read", "events:write"]
}
```

## Step 2: Use SPMT identity

The app should ask SPMT who the current user is.

```http
GET /api/me
Authorization: Bearer <token>
```

## Step 3: Publish an event

```json
{
  "type": "my_app.action.completed",
  "sourceApp": "my-creator-app",
  "actor": "user_123",
  "payload": {
    "summary": "The app completed a creator workflow."
  }
}
```

## Step 4: Send user-facing output to Commlink

Only important user-facing updates should appear in Commlink.

Good examples:

- task completed
- room invite
- automation failed
- reward earned
- app requires attention

Bad examples:

- noisy debug logs
- repeated heartbeat pings
- internal database events

## Step 5: Add Athena context

Athena should receive summaries that help the creator understand what happened.

Example:

> My Creator App completed the scheduled overlay update for tonight's stream.

## Step 6: Test the app journey

A healthy app should pass this test:

1. User launches SpaceMountain.live.
2. User opens Shipyard.
3. User installs or launches the app.
4. App knows the SPMT user.
5. App publishes an event.
6. Commlink shows the important result.
7. Athena can summarize the activity.
