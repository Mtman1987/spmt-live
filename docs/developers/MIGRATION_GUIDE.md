# Migrating An Existing App Into SpaceMountain

## Step 1: Identify duplicated platform logic

Look for:

- local login
- fake identity
- local notifications
- local app launch assumptions
- user profiles not tied to SPMT
- platform account matching

## Step 2: Keep app-specific logic

Do not move the app's core feature into SPMT.

Examples:
- game state stays in ChatTag
- room state stays in HearMeOut
- automation config stays in StreamWeaver
- Discord-specific workflows stay in Discord Stream Hub

## Step 3: Add SPMT identity

Use SPMT for current user identity and linked accounts.

## Step 4: Add event publishing

Convert important app moments into ecosystem events.

## Step 5: Add Commlink outputs

Only user-facing updates should appear in Commlink.

## Step 6: Add Athena summaries

Summarize useful context. Do not dump raw logs.
