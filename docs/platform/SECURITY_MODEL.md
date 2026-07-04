# Security Model

## Identity

SPMT owns identity and session validation.

## Secrets

Secrets should stay server-side or in platform secret stores. Do not expose shared app secrets in browser code.

## API Keys

Platform API keys should be:

- scoped
- revocable
- hashed at rest
- checked before privileged actions

## Permissions

Apps should request the minimum required permissions.

## Event Safety

Events should include stable IDs and useful summaries, but should avoid leaking secrets, raw tokens, or private internal logs.
