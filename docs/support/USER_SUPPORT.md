# User Support

## Common Issues

### I signed in but an app does not know who I am

Try:
1. Refresh SpaceMountain.live.
2. Open the app from Shipyard.
3. Sign into SPMT again.
4. Report which app failed.

### An app says it is installed but will not launch

Check:
- launch URL
- app health
- whether the app is enabled
- whether the app is still in adapter-needed status

### Notifications are missing

Check:
- whether the app publishes Commlink events
- whether the notification is user-facing
- whether the user is signed into SPMT

## Reporting Bugs

Include:

- app name
- page URL
- what you expected
- what happened
- whether you were signed into SPMT
- screenshot if possible

## Planned Unified Ticket Intake

The unified SPMT ticket system is roadmap work and must not be described as live
until production verification is complete. The target is one intake path for
general help, app/technical issues, staff reports, warnings/infractions,
disputes/appeals, account/billing questions, and security/privacy/safety issues.

The provisional `!ticket` command will remove the public command where the
provider permits it, show a `Ticket` interaction button, and open an ephemeral
chooser and structured modal. Existing SPMT support concepts and `!mtfixit` will
route into the same ticket record rather than creating separate queues.

Each submitted ticket will receive an ID, a private status view, and a bounded,
redacted evidence snapshot from relevant registered apps. Staff can escalate to
moderators, moderators to administrators, and administrators to the owner or
co-owner. Sensitive evidence will remain in the authenticated ticket record;
DMs and other notifications will contain only a safe summary and secure link.

Implementation requirements, privacy limits, role authority, retention,
appeals, and production proof are owned by
[`docs/ecosystem/PRODUCTION_ROADMAP.md`](../ecosystem/PRODUCTION_ROADMAP.md#step-36--unify-support-staff-reports-disputes-and-technical-tickets).
