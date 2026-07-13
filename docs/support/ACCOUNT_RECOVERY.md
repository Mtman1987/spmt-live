# SPMT Account Recovery

## Where the recovery code comes from

SPMT creates a one-time recovery code when an account is registered and shows it in the browser. The Account page can generate and show a replacement code. Only a hash is stored in the database, so SPMT cannot reveal an old code later.

Generating a replacement invalidates the previous code. Successfully resetting the password consumes the code so it cannot be reused.

## Discord DM recovery

The Recover tab can request a fresh code by Discord DM. Delivery happens only when all of these checks pass:

- the SPMT account has both a linked Discord username and Discord user ID;
- the SPMT bot can read that Discord user;
- the current Discord username exactly matches the username stored by SPMT;
- the bot can open a DM and send the message;
- the account is outside the request cooldown.

The new code replaces the old code only after Discord accepts the DM. Failed delivery leaves the existing recovery code unchanged.

The public endpoint always returns the same generic response whether or not the username exists or delivery succeeds. This prevents account discovery. Requests are rate-limited in memory by account input and client address.

## Username recovery

Discord or Twitch usernames can be used to find the linked SPMT handle. This does not reveal or generate a recovery code.

## If Discord delivery is unavailable

Use the code saved at signup or generated from the Account page. If neither is available, contact the SPMT owner for owner-assisted recovery. The admin recovery endpoint remains unavailable until its separate production recovery secret is configured.
