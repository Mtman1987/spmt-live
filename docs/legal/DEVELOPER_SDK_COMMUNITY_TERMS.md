# SpaceMountain.Live Developer and SDK Community Terms

Status: **Owner-approved final draft - effective only after publication and acceptance**  
Version: `1.0`  
Prepared: 2026-08-02  
Administrative home and governing law: Illinois, United States

These Developer and SDK Community Terms (the **Terms**) govern approval-only
access to SPMT developer services, APIs, `@spmt/sdk`, the `spmt` CLI, app review,
hosting, events, webhooks, and ecosystem integration. They become effective for
a Developer only after owner approval, publication, assignment of an effective
date, and affirmative acceptance under the
[Electronic Acceptance Schedule](ELECTRONIC_ACCEPTANCE_SCHEDULE.md).

## 1. Parties and relationship

**SpaceMountain.Live** is the owner-operated project and ecosystem also known as
SpaceMountain, SPMT, or spmt.live. `mtman1987` is Owner and `akhiteddy` is
Co-Owner.

**Developer** means the individual SPMT account holder approved to build,
operate, contribute to, or integrate an application, plugin, bot, workflow,
service, or other project. A Developer may also be a Partner, Staff,
Moderator, or Administrator under separately accepted terms.

Developer participation is optional, non-exclusive, and unpaid unless a
separate written commercial or paid-work agreement applies. These Terms create
no employment, agency, legal partnership, joint venture, franchise, fiduciary
relationship, guaranteed support, or authority to bind SPMT.

Nothing waives compensation, worker-status, IP, privacy, or other rights that
cannot lawfully be waived. Required paid work must use a separate written
arrangement.

## 2. Ecosystem and ownership map

The owner-owned and operated first-party ecosystem includes SPMT/Creator Cloud,
SpaceMountain, Shipyard, Commlink, Athena OS, StreamWeaver, Discord Stream Hub,
HearMeOut and its DJ Worker, ChatTag, Quackverse while offered, Fly Machine
Rotator, MountainView, SpaceMountain Companion, platform APIs, `@spmt/sdk`, and
the `spmt` CLI. The retired Space Mountain dashboard is owner-owned but not an
active service.

AETHERRA is separately owned and operated by Co-Owner `akhiteddy` as an
external partner application. Unless a signed addendum reallocates a specific
responsibility, AETHERRA owns and controls its code, product data, feature
state, billing, deployment, backups, operations, and product support. SPMT owns
its identity/platform contracts and only receives authorized integration data.

The same boundary applies to another external Developer application: the
Developer owns the application and its app-specific data and operations; SPMT
owns SPMT identity, shared permissions, app registry/install state, Commlink
platform records, shared events, shared XP, and SPMT platform services.

## 3. Definitions

- **Developer Services**: SPMT APIs, OAuth/session paths, SDK, CLI, app registry,
  Shipyard review/listing, events, webhooks, Commlink, test tools, documentation,
  and approved credentials.
- **Developer Project**: code, assets, configuration, documentation, data, or a
  service supplied or operated by the Developer.
- **Hosted Project**: a Developer Project or approved copy that SPMT stores,
  builds, deploys, operates, tests, displays, demonstrates, maintains, or backs
  up.
- **External App**: a Developer-operated application whose product runtime and
  app-specific data remain outside SPMT ownership.
- **Platform Key**: a server-only, scoped, revocable, app-bound SPMT credential.
- **Manifest**: the public `spmt.app.json` app description, owner, version,
  launch/auth/health URLs, status, and requested scopes.
- **Event**: a bounded, versioned ecosystem record with stable identifiers,
  timestamps, source app, actor/tenant context, and a safe payload.
- **Community Rules**: the current acceptable-use, privacy, security, content,
  app-review, and platform rules incorporated by versioned acceptance.

## 4. Approval-only access and app review

Developer Services remain approval-only unless ownership later publishes a
different program. Access may require an application, accurate Manifest,
technical review, owner approval, separate credentials for each app/environment,
testing, and ongoing compliance.

The standard production-shaped path currently expects Node.js 18 or newer for
the JavaScript package, `@spmt/sdk`, the `spmt` CLI, a public `spmt.app.json`, a
server-side `SPMT_API_KEY`, doctor/submit checks, and an app-bound key. Non-Node
clients may use an approved HTTP client while preserving the same security and
contract rules.

An accepted application does not guarantee public listing, certification,
promotion, continued API access, support, or production approval. Ownership may
label an integration development, experimental, degraded, unavailable,
approved, suspended, or retired according to current evidence.

## 5. Limited SDK and documentation license

The SDK repository metadata currently says `UNLICENSED`. It must not be
described as open source or generally licensed to the public.

While these Terms remain active, SPMT grants the approved Developer a limited,
personal, non-exclusive, non-transferable, revocable license to download, use,
execute, and make the minimum internal modifications to approved SDK samples
and tooling needed to build and operate the approved integration.

This license does not permit the Developer to:

- resell, sublicense, publish, mirror, or redistribute the SDK as a competing
  package;
- remove ownership, attribution, security, or license notices;
- offer SPMT credentials or platform access to another person;
- claim that the SDK is open source;
- reverse engineer or circumvent authentication, authorization, rate limits,
  tenant boundaries, audit, or security controls; or
- use SPMT names or marks beyond approved integration identification.

Interoperability work and security research must stay within applicable law and
the private vulnerability-reporting process. A later published SDK license may
replace this section only after notice and affirmative acceptance when the
change is material.

## 6. Identity and account requirements

An ecosystem app must use SPMT as the shared identity source rather than
creating a competing global identity. The app may keep a separate product
account where necessary, but linking must use immutable provider/account IDs
and explicit authorization; display names are never ownership proof.

OAuth authenticates and authorizes access but is not acceptance of these Terms.
Browser and game clients must not contain a Platform Key. Privileged operations
run through a trusted backend with a scoped server credential.

Official and developer activity must use named accounts. Shared accounts,
credential sharing, session-cookie sharing, generic authentication, and
unattributed administrative changes are prohibited. SPMT may monitor official
Developer Services after notice for security, support, compliance, metering,
and audit.

## 7. Minimum permissions and credentials

The Developer must:

- request only the scopes needed for the approved feature;
- keep Platform Keys, OAuth secrets, webhook secrets, tokens, recovery codes,
  private logs, and payment details server-side or in an approved secret store;
- never commit or transmit secrets through source control, events, tickets,
  chat, client bundles, screenshots, or public logs;
- use separate app-bound credentials for each approved app and environment;
- rotate and revoke credentials promptly after compromise, personnel change,
  suspension, or termination;
- reject missing tenant, actor, app, destination, or authorization context when
  the operation requires it; and
- honor disconnect and grant revocation without corrupting the Developer's
  independent product account or app-specific data.

SPMT may immediately suspend a key, scope, webhook, listing, or Developer
Service for suspected abuse, compromise, cross-tenant access, excessive load,
legal risk, or provider requirements while the matter is reviewed.

## 8. Manifest, health, and truthful status

The Developer must keep accurate:

- stable app ID, name, description, owner, and support route;
- launch, OAuth callback, top-level, health, and version URLs;
- current version and status;
- requested permissions and user explanation;
- data, billing, external-provider, and app-ownership boundaries; and
- material limitations, outages, migration state, and retirement notices.

The app must support a top-level launch and not assume iframe embedding always
works. Health/version metadata must be truthful. A successful build, existing
page, `200` response, or container does not prove that every feature works.

## 9. Events, webhooks, and cross-app behavior

Events and webhook messages must use stable immutable IDs, timestamps,
source-app identity, tenant/actor context, bounded payloads, and idempotency
keys. Retries must not duplicate a payment, reward, XP award, moderation act,
message, workflow, or other side effect.

The Developer must not place passwords, tokens, recovery codes, raw private
records, unnecessary personal data, payment details, unrestricted logs, or
private media into events. Webhook consumers must verify authenticity and
handle duplicate delivery, retry, timeout, out-of-order arrival, malformed
payloads, revocation, and unavailable dependencies.

No app may manipulate points, XP, game state, rewards, rankings, installs,
votes, tickets, or acceptance records, or replay events to receive duplicate
benefits.

## 10. Data ownership and privacy

SPMT owns and controls SPMT identity/session records, linked-account references,
app registry and install state, shared permissions, SPMT Commlink platform
records, ecosystem-event records, shared XP, and Athena context summaries,
subject to applicable user and privacy rights.

The Developer owns and controls the Developer Project, app-specific settings,
feature state, game state, rooms, automation, app database, billing, deployment,
backups, and app support unless a signed addendum says otherwise.

The Developer is responsible for a clear privacy notice, lawful collection and
use, consent/authorization, data minimization, security, retention/deletion,
user requests, subprocessors, and incident response for Developer-controlled
data. The Developer must not imply that SPMT is responsible for independently
collected product data. A separate data-processing agreement is required when
the actual relationship needs one.

Each side may use integration data only for the documented purpose and must
support lawful access, correction, export, deletion, disconnect, and revocation
rights. Neither side may silently use the other's data to train an unrelated
model, sell profiles, or create an undisclosed competing identity graph.

## 11. Security and incident reporting

The Developer must use reasonable safeguards appropriate to the data and risk,
including access control, encryption in transit, safe secret storage, dependency
review, backups, restore/rollback capability, logging without raw secrets, and
least privilege.

The Developer must privately report a suspected critical vulnerability,
credential exposure, cross-tenant access, unauthorized acceptance, material
personal-data incident, or active exploitation as soon as practical and within
24 hours of discovery. Public disclosure must wait for coordinated remediation
or a lawful disclosure requirement.

The Developer must cooperate reasonably in containment, evidence preservation,
credential rotation, user/provider notice, remediation, and a truthful
post-incident record. SPMT may require a focused security review before access
is restored.

## 12. Testing, deployment, and changes

Before a production claim, the integration must pass applicable contract,
authorization, tenant-isolation, app-binding, event/webhook, migration,
rollback, restart/restore, failure, and smoke tests.

Shared-contract work follows owner first: freeze and verify the SPMT contract,
migrate one consumer, observe telemetry, preserve compatibility where approved,
and remove the old path only after evidence and rollback readiness.

The Developer must not deploy a material breaking change without notice,
testing, rollback, and updated documentation. SPMT may require correction,
degradation labels, delisting, or suspension when a release is unsafe or
misrepresents capability.

## 13. API use, limits, and prohibited conduct

The Developer must follow published rate, payload, retention, automation,
webhook, and concurrency limits. If no numeric limit is published, use
reasonable bounded traffic, caching, exponential backoff, and a request pattern
that does not impair other users.

The Developer may not:

- scrape private or access-controlled data;
- bypass scopes, tenant boundaries, rate limits, app review, payment controls,
  moderation, audit, or acceptance systems;
- probe another tenant or user's data without written authorization;
- distribute malware or deliberately vulnerable code;
- use hidden fallbacks, default credentials, fabricated success states, or
  misleading health/status output;
- impersonate SPMT, another app, user, Partner, or Crew participant;
- send spam, harassment, unlawful content, deceptive promotions, or fraudulent
  payments;
- overload, disrupt, resell, or provide unauthorized access to Developer
  Services; or
- use SPMT data or services contrary to law, provider terms, or Community Rules.

Good-faith private security reporting is not prohibited. Testing that could
affect production, another user, or data requires prior written authorization.

## 14. Developer ownership and SPMT hosting license

The Developer retains ownership of the Developer Project and pre-existing IP.
No transfer to SPMT occurs unless a separate signed assignment expressly says
so.

For an approved Hosted Project, the Developer grants SPMT a worldwide,
non-exclusive, royalty-free license during the hosting term to receive, copy,
store, back up, build, test, scan, format, adapt for compatibility/security/
deployment/accessibility, deploy, operate, display, demonstrate, maintain, and
support the approved Hosted Project solely for the ecosystem and agreed
promotion.

SPMT may use hosting, build, security, monitoring, backup, contractor, and
infrastructure providers that are subject to appropriate access and
confidentiality restrictions.

Operational changes by SPMT do not transfer the Developer's underlying
ownership. A change authored solely by an SPMT contributor remains owned by its
author unless assigned, but the Developer receives a non-exclusive,
royalty-free license to use that change with the Hosted Project; SPMT receives
the corresponding license needed to continue operating it. Material feature or
ownership changes should use a separate contribution or statement-of-work
record.

The Developer may revoke ordinary hosting permission on 30 days' written
notice. SPMT may use the notice period for export and orderly shutdown. Immediate
removal may be required for rights violations, security, provider demand, or
law. Disaster-recovery and security backups may remain for up to 30 days after
removal, inaccessible to ordinary use and then deleted or overwritten through
normal rotation, subject to lawful holds and required records.

## 15. Commercial applications and payments

Commercial applications and independent monetization of Developer-owned work
are allowed subject to app review, accurate disclosure, applicable law,
provider/payment rules, and a separate commercial addendum for any SPMT fee,
revenue share, referral, sponsorship, paid development, marketplace sale, or
payment-processing responsibility.

The Developer remains responsible for the Developer Project's prices, taxes,
refunds, chargebacks, fraud, customer support, and billing unless an addendum
says otherwise.

When verified and available, SPMT may expose an embedded interface that routes
approved payment instructions to a linked account through PayPal. PayPal, not
SPMT, operates the payment rails and may impose eligibility, identity, tax,
sanctions, fraud, and account rules. No embedded payment capability is promised
until verified live.

## 16. Third-party code and services

The Developer must identify material third-party code, data, models, assets,
APIs, dependencies, and licenses and comply with their terms. The Developer
must not submit content or code without the rights needed for hosting,
operation, distribution, display, and promotion.

Twitch, Discord, YouTube/media providers, LiveKit, PayPal, Fly.io, GitHub,
OBS/local companion software, AI/model providers, package registries, hosting
providers, and other services operate independently. Their outages, policy
changes, rate limits, bans, content actions, or discontinued APIs may disable an
integration. SPMT may substitute or discontinue a dependency and does not
guarantee third-party availability.

## 17. Branding and promotion

Each party keeps ownership of its names, marks, branding, content, and
pre-existing materials. The Developer confirms authority to submit every
project name, logo, avatar, screenshot, demo, description, testimonial, clip,
and other promotional asset.

The Developer grants SPMT a non-exclusive, worldwide, royalty-free license
during participation to host, reproduce, format, display, demonstrate,
distribute, and promote approved project names, descriptions, screenshots,
demos, branding, attribution, and related materials for Shipyard, documentation,
events, directories, announcements, and ecosystem promotion.

The Developer may revoke future promotional use by written notice. SPMT will
stop new use within a reasonable operational period but may retain lawful
historical credits, archived announcements, event records, documentation of
prior versions, backups pending rotation, and materials that cannot reasonably
be recalled. Disputed material may be hidden pending review.

The Developer receives a narrow, revocable license to use approved SPMT names
and marks only to truthfully identify the active integration. No confusing
domains, altered marks, unauthorized merchandise, endorsement claims, or
authority to speak for SPMT are granted.

## 18. Availability, support, and changes

Developer Services are provided on an as-available, evolving basis. No uptime,
response time, support level, compatibility, data preservation, continued API,
continued SDK version, listing, certification, or future feature is guaranteed
unless a signed service-level or commercial addendum says otherwise.

SPMT will use reasonable efforts to announce a material breaking change or
retirement through the developer documentation and account notice. Security,
legal, provider, abuse, and urgent reliability changes may occur immediately.
The Developer must design for retries, degradation, revocation, export, and
orderly shutdown.

## 19. Abandoned projects

A project may be treated as abandoned when its owner is unreachable, required
credentials or dependencies remain broken, security issues are unaddressed, or
the project has no functioning support/maintenance path after reasonable
notice.

SPMT may mark it degraded, disable installs, revoke credentials, delist it,
preserve an evidence/archive copy, provide a reasonable export opportunity,
and shut down owner-operated hosting. SPMT does not acquire ownership merely
because a project is abandoned.

## 20. Confidentiality

Nonpublic credentials, source, vulnerabilities, personal data, business plans,
private reports, security information, unreleased features, test data, logs,
and information marked or reasonably understood as confidential may be used
only for the approved purpose and shared only with authorized people.

Confidentiality does not cover information lawfully public without breach,
already known without duty, independently developed, or lawfully received from
another source. Required legal disclosure should be limited and, where lawful,
promptly reported so protective steps may be considered.

## 21. Suspension, termination, and offboarding

The Developer or ownership may end participation at any time. Thirty days'
notice is requested for ordinary hosted-project removal; advance notice is not
required for security, abuse, legal, rights, provider, or serious reliability
reasons.

On suspension or termination:

- keys, scopes, sessions, webhooks, listings, certification, premium access,
  private channels, and SPMT brand permission may end immediately;
- the Developer must stop claiming active status and return or securely delete
  SPMT confidential material and credentials;
- SPMT will provide a reasonable export opportunity where safe and applicable;
- disconnect must not delete or corrupt the Developer's independent account or
  app data;
- lawful records, accepted documents, confidentiality, data duties, incident
  obligations, retained-backup limits, historical credits, and accrued rights
  survive; and
- reapplication may be delayed or permanently barred after serious documented
  abuse.

## 22. Changes, electronic acceptance, and notices

These Terms are accepted separately through the Electronic Acceptance
Schedule. Continued use alone is not acceptance. Material changes to SDK
rights, data use, security, payment, IP, liability, disputes, or termination
require a new version, change summary, and affirmative reacceptance.

Notices may appear in the SPMT developer account, authenticated ticket system,
documentation, official email when provisioned, or privacy-minimized Discord
DM containing a secure link. The durable SPMT record is authoritative.

## 23. General provisions

These Terms and incorporated schedules are the complete Developer community
understanding unless a signed Manifest approval, contribution record, data
agreement, service level, statement of work, or commercial addendum applies.
Invalid provisions should be narrowed or severed without rewriting the
remainder. Delay in enforcement is not a waiver.

Illinois law governs to the extent a different nonwaivable law does not apply.
Disputes should first use the private SPMT ticket and appeal process before
court proceedings when lawful and practical.

No document can eliminate nonwaivable rights or decide legal classification by
label. Before publication and acceptance, this file is only the Owner-approved
source draft and not an active agreement with any Developer.

