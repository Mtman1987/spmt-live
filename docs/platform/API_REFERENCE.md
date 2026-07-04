# API Reference

This is the human-readable docs overview. The exact implementation may evolve.

## Identity

- `GET /api/me`
- `POST /api/auth/refresh`

## Apps

- `GET /api/apps`
- `GET /api/apps/:appId`
- `GET /api/apps/:appId/versions`
- `POST /api/apps/:appId/install`
- `POST /api/apps/:appId/disable`

## Commlink

- `GET /api/conversations`
- `GET /api/notifications`
- `GET /api/search`

## Athena

- `GET /api/athena/os`
- `GET /api/athena/context`
- `POST /api/athena/commands`

## Events

- `POST /api/events`
- `POST /api/platform/events`
- `GET /api/platform/events`

## Platform

- `GET /api/platform`
- `GET /api/platform/docs`
- `GET /api/platform/plugins`
- `POST /api/platform/apps`
