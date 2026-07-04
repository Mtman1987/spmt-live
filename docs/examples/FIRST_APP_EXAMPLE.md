# Example: First Ecosystem App

Imagine an app called `ClipForge`.

## What ClipForge Does

ClipForge turns stream moments into shareable clips.

## App Metadata

```json
{
  "id": "clipforge",
  "name": "ClipForge",
  "description": "Turn stream moments into shareable clips.",
  "launchUrl": "https://clipforge.example.com",
  "version": "0.1.0",
  "scopes": ["identity:read", "events:write", "messages:write"]
}
```

## Events

ClipForge publishes:

- `clip.created`
- `clip.ready`
- `clip.failed`

## Commlink Example

When a clip finishes:

> ClipForge finished your stream highlight and it is ready to share.

## Athena Example

Athena can later say:

> ClipForge created three clips during your last stream.
