# Identity

SPMT is the canonical identity provider for the SpaceMountain ecosystem.

## Identity Goals

- One `@spmt.live` account.
- One immutable SPMT user ID for ecosystem ownership and attribution.
- Linked Twitch and Discord accounts without making provider usernames the primary identity.
- Shared account context across apps.
- OAuth and session restore paths for first-party apps.
- Existing app users can migrate without being forced to create a second account.

## Canonical Identity vs. Linked Providers

An SPMT account is the ecosystem identity. Twitch and Discord records are linked provider identities.

Apps should store and reference the immutable SPMT user ID for shared ownership. Provider IDs may be attached for provider-specific actions and attribution, but provider display names and usernames are not proof that two accounts belong to the same person.

## Provider-Owned / Imported Accounts

Trusted first-party apps can grandfather an existing user only after verifying an immutable provider ID through an app-bound server credential.

Imported identities:

- immediately receive a stable SPMT user ID;
- do not require an invented password;
- can later claim credentials from a verified session;
- must not be merged by display name alone;
- retain their SPMT identity when credentials are claimed or providers are linked.

## Sessions and OAuth

Browser/session calls use the authenticated SPMT user session. Ecosystem apps should use the SPMT OAuth authorization-code flow to obtain app-bound access to the same canonical identity.

Server-to-server privileged operations use scoped platform credentials instead of borrowing a user's browser token.

See `developers/OAUTH_FLOW.md` for the first-party OAuth sequence and migration rules.

## App Rule

Apps should ask SPMT who the user is instead of creating separate ecosystem identities.

App-owned profile fields and state may remain in the app, but they should attach to the SPMT user ID. If SPMT identity is unavailable, the app should show a recoverable authentication state rather than silently generating a fake user.
