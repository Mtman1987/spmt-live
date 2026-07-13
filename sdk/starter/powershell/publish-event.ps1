if (-not $env:SPMT_API_KEY) {
  throw 'Set SPMT_API_KEY in the server environment before publishing.'
}

$baseUrl = if ($env:SPMT_BASE_URL) { $env:SPMT_BASE_URL.TrimEnd('/') } else { 'https://spmt.live' }
$headers = @{ Authorization = "Bearer $env:SPMT_API_KEY" }
$body = @{
  type = 'game.session.started'
  sourceApp = 'atherrea'
  visibility = 'creator'
  payload = @{
    sessionId = 'atherrea-proof-001'
    playerCount = 1
    summary = 'Atherrea PowerShell proof session started'
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "$baseUrl/api/platform/events" -Headers $headers -ContentType 'application/json' -Body $body
