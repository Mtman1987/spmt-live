# API Contract

## Principle

All APIs should feel consistent.

## Success Shape

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

## Error Shape

```json
{
  "success": false,
  "error": {
    "code": "not_authenticated",
    "message": "Not authenticated"
  }
}
```

## Rules

- Use predictable response shapes.
- Use stable error codes.
- Include pagination metadata where needed.
- Do not leak internal stack traces.
- Keep snake_case and camelCase compatibility only where migration requires it.
- Document every public endpoint.
