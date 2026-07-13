#!/usr/bin/env bash
set -euo pipefail

: "${SPMT_API_KEY:?Set SPMT_API_KEY in the server environment before publishing.}"
SPMT_BASE_URL="${SPMT_BASE_URL:-https://spmt.live}"

curl --fail-with-body --silent --show-error \
  --request POST \
  --url "${SPMT_BASE_URL%/}/api/platform/events" \
  --header "Authorization: Bearer ${SPMT_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data '{
    "type": "game.session.started",
    "sourceApp": "atherrea",
    "visibility": "creator",
    "payload": {
      "sessionId": "atherrea-proof-001",
      "playerCount": 1,
      "summary": "Atherrea Linux proof session started"
    }
  }'

printf '\n'
