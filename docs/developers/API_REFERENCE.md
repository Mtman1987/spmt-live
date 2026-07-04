# API Reference (Draft)

## Identity
GET /api/me
GET /api/auth/refresh

## Apps
GET /api/apps
POST /api/apps/{id}/install
POST /api/apps/{id}/enable

## Commlink
GET /api/conversations
GET /api/notifications

All APIs should return a consistent envelope:
{
  "success": true,
  "data": {},
  "meta": {}
}
