# SPMT owner-approved scoped delegation

This feature starts with one capability: read the protected Rotator error report for the last 24 hours. It is not a general owner token or machine-control grant.

## Required Fly secrets

Configure matching values on SPMT and Rotator before enabling the flow:

- `SPMT_OWNER_APPROVAL_SERVICE_SECRET`: random secret, at least 32 characters. Set on both apps. Authenticates Rotator creating approval requests and polling request state.
- `SPMT_DELEGATION_SIGNING_SECRET`: random secret, at least 32 characters. Set identically on both apps. SPMT signs short-lived HS256 grants; Rotator validates them locally.
- `SPMT_OWNER_APPROVAL_CALLBACK_SECRET`: random secret, at least 32 characters. Set identically on both apps. Authenticates SPMT's server-to-server grant callback to Rotator.
- `ROTATOR_PUBLIC_BASE_URL=https://mtman-machine-rotator.fly.dev` on SPMT.
- `SPMT_BASE_URL=https://spmt.live` on Rotator.

Generate independent random values for the three secrets; do not reuse OAuth client secrets, `ROTATOR_DASHBOARD_ACTION_TOKEN`, `GITHUB_TOKEN`, or user session cookies. Never paste secret values into GitHub issues, PRs, logs, or chat.

## Flow

1. A request to Rotator's protected `/logs/errors.txt` without an SPMT admin session creates a pending SPMT approval request and redirects to `/owner-approvals.html`.
2. An authenticated SPMT platform administrator sees the problem, proposed fix, blocker, target, scope, and expiry. Approval/rejection is a same-origin POST, not a GET link.
3. Approval issues an HS256 grant for `iss=https://spmt.live`, `aud=mtman-machine-rotator`, `scope=logs:read:last24h`, a request ID, unique JTI, owner subject, and 120-second expiry.
4. SPMT sends the grant to Rotator over the callback secret. Rotator stores it in its private evidence directory with mode 0600.
5. The exact approval request ID is required to consume the grant. Rotator validates signature, issuer, audience, scope, expiry, and JTI replay state before serving the report once.
6. Rejection never mints or delivers a grant. Approval does not authorize machine control, deployment, or any other endpoint.

## Rollout checks

- Deploy SPMT and Rotator code.
- Set the secrets above in both Fly apps and verify they match without printing values.
- Sign in to SPMT as a platform administrator and visit `/owner-approvals.html`.
- Request `/logs/errors.txt` while signed out, approve the resulting `logs:read:last24h` request, then use the provided retrieval link.
- Verify second use of the same request ID fails and the grant never appears in browser responses, chat, or logs.
- If callback delivery fails, do not bypass authentication. Recheck the secret configuration and issue a new request after resolving it.