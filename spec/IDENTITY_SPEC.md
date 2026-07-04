# Identity Specification

## Principle

Every user has one primary SPMT identity.

Apps may keep app-specific preferences or state, but they must not become the source of truth for creator identity.

## Required User Model

```ts
type SpmtUser = {
  id: string;
  username: string;
  handle: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  linkedAccounts: LinkedAccount[];
  createdAt: string;
};
```

## Linked Account Model

```ts
type LinkedAccount = {
  provider: "twitch" | "discord" | "youtube" | "kick" | "github" | "google" | "steam" | string;
  providerUserId: string;
  username?: string;
  displayName?: string;
  connectedAt: string;
};
```

## Rules

- Apps must request the current user from SPMT.
- Apps must not create fake standalone identities when SPMT identity is required.
- App-local profiles must reference an SPMT user ID.
- Linked accounts should be matched through SPMT.
- User-facing profile changes should eventually sync through SPMT.
- Identity checks must be server-side for privileged actions.

## Required App Behavior

When an app launches:

1. Check for a valid SPMT session or app token.
2. Request current user.
3. Load app-specific state by SPMT user ID.
4. If identity is missing, redirect to SPMT or show a clear connect action.
