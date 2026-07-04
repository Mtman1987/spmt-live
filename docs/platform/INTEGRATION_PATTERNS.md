# Integration Patterns

## Pattern 1: App Event To Commlink

An app completes something important.

1. App publishes event.
2. SPMT stores event.
3. SPMT creates a notification if user-facing.
4. SpaceMountain.live shows it in Commlink.

## Pattern 2: App Event To Athena

An app creates useful context.

1. App publishes event.
2. SPMT summarizes or stores relevant details.
3. Athena can use it later for command routing or summaries.

## Pattern 3: Shipyard Launch

1. User opens SpaceMountain.live.
2. User opens Shipyard.
3. Shipyard loads apps from SPMT.
4. User launches app.
5. App restores SPMT identity.

## Pattern 4: Cross-App Benefit

ChatTag publishes `reward.earned`.

- Commlink notifies the creator.
- Athena remembers the win.
- StreamWeaver may trigger an overlay.
- Discord Stream Hub may announce it.
