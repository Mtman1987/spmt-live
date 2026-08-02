# Shared Electronic Acceptance Schedule

Status: **Owner-approved final draft - effective with the adopted role terms**  
Schedule version: `1.0`  
Prepared: 2026-08-02

This schedule applies to the Partner, Crew and Administrator, and Developer and
SDK Community Terms. It defines the acceptance evidence the SPMT system must
create before any role document is treated as accepted.

## 1. Separate acceptance by role

Each role document is accepted separately. A multi-role participant receives a
separate acceptance record for every applicable document.

- Partner accepts the Partner Community Terms.
- Staff, Moderator, and Administrator accept the Crew and Administrator
  Community Terms and their current role/permission assignment.
- Developer or SDK user accepts the Developer and SDK Community Terms.

Partner and Administrator may not be simultaneous primary roles. Partner plus
Staff or Moderator requires a separate written Crew appointment. Any Partner,
Crew member, or Administrator may separately participate as a Developer.

## 2. Application and review record

Before presenting terms, SPMT should preserve:

- applicant's stable SPMT account ID and current display handle;
- requested role and, for a Partner liaison, the represented outside community;
- submitted answers and attachments;
- submission time and time in each application state;
- eligible reviewers, each blind advisory vote and timestamp, abstentions, and
  recusals;
- decision-maker, decision, reason, and time;
- acknowledgment, approval, or denial notices and delivery result; and
- the exact role document offered after approval.

The applicant should receive a private acknowledgment with the current rules,
responsibilities, discretionary benefits, review process, privacy notice, and
expected next step. Approval and denial notices remain private. Approval does
not activate the role until every required document is accepted.

## 3. Presentation requirements

The acceptance page must:

1. Require a current authenticated SPMT session.
2. Display the participant's account and proposed role.
3. Display the complete document or a readable embedded copy.
4. Provide stable links to download and print the exact offered document.
5. Show the document title, version, effective date, and SHA-256 hash.
6. Link the applicable privacy notice, community rules, security requirements,
   and any incorporated schedule.
7. Explain that the transaction is electronic and offer a reasonable
  alternative acceptance method for accessibility needs.
8. Provide a way to cancel, report the wrong account/role, or correct an input
   before acceptance.
9. Require an unchecked acknowledgment confirming that the participant has
   reviewed the document and intends to accept it electronically.
10. Require the affirmative button **Accept Community Terms**.

SPMT OAuth authenticates the account but is not acceptance by itself. Silence,
prechecked boxes, a login, use of another app, or continued participation alone
does not replace the affirmative acceptance action.

## 4. Server-side acceptance record

On acceptance, the server creates a unique, append-only acceptance ID and
stores at least:

- stable SPMT account ID;
- current display handle and immutable linked-provider IDs used for
  authentication, when relevant and lawfully retained;
- accepted role and any role-assignment version;
- document title, version, effective date, canonical URL, and SHA-256 hash;
- incorporated schedule/policy versions and hashes;
- exact acceptance-button label;
- UTC presentation and acceptance timestamps;
- authentication method, session ID or non-secret session fingerprint, and
  recent-authentication state;
- application/approval record ID, if applicable;
- client/user-agent and network attribution only to the extent disclosed by the
  published privacy notice;
- consent to electronic records and acknowledgment state;
- delivery method and result for the accepted copy; and
- superseding, revocation, correction, or termination references added later.

Never store an OAuth token, password, recovery code, API key, session cookie,
or other reusable secret in the acceptance record.

## 5. Receipt and participant access

Immediately after acceptance, SPMT should:

- show a success page with the acceptance ID, role, version, timestamp, and
  hash;
- provide a downloadable accepted copy and receipt;
- retain the same copy in the participant's account dashboard;
- send a privacy-minimized notification or DM containing a secure link when
  that route is available; and
- provide the correction/support route if the wrong account, role, or document
  was accepted.

The durable SPMT record is the system of record. A Discord DM, email, or other
notification is a delivery aid and not the authoritative copy.

## 6. Versioning and reacceptance

- Nonmaterial formatting, typo, link, or contact corrections may be announced
  without reacceptance when they do not alter meaning.
- A material change to duties, authority, discipline, evidence use, retention,
  benefits, payment, data use, IP rights, SDK rights, liability, dispute terms,
  or termination requires a new version and affirmative reacceptance.
- SPMT must show a readable change summary before reacceptance.
- The former version remains available in the participant's acceptance history.
- A role may be paused if required reacceptance is not completed by the stated
  deadline, but access needed to review, download, correct, appeal, or retrieve
  prior records must remain reasonably available.

## 7. Integrity and retention

- Store the exact accepted bytes in a versioned, access-controlled archive.
- Hash the document before presentation and verify the same hash at acceptance
  and receipt generation.
- Log creation, viewing, download, correction, supersession, and administrative
  access with named SPMT identities.
- Back up the authoritative copy and test restoration.
- Retain the accepted document and evidence for the maximum period permitted
  by applicable law and the published retention schedule.
- A system migration must preserve record content, attribution, timestamps,
  hashes, version relationships, and participant access.

## 8. Error, dispute, and correction path

The participant may promptly report an automated error, wrong identity, wrong
role, inaccessible record, or suspected unauthorized acceptance. SPMT must
freeze activation when appropriate, preserve the evidence, investigate the
attribution, record any correction, and never silently overwrite the original
record. A corrected acceptance receives a new record linked to the superseded
one.

## 9. Activation tests

Before launch, verify:

- wrong-account and expired-session rejection;
- separate multi-role acceptance;
- no acceptance from login alone;
- exact offered/accepted/downloaded hash parity;
- keyboard, screen-reader, mobile, print, and download access;
- cancel and correction behavior;
- retry and duplicate-click idempotency;
- immutable audit and role activation only after success;
- nonmaterial notice versus material reacceptance;
- prior-version retrieval;
- owner/admin inability to forge participant acceptance;
- secret redaction; and
- backup and isolated restore of acceptance records.
