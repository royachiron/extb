# Verification status

This page distinguishes implementation checks from the public installation experience. Do not infer a clean-account deployment result from a local build or a deployment into an existing developer account.

## Local application

A neutral local development installation was exercised through the browser. Confirmed outcomes:

- Owner setup completed.
- A single-use invitation registered a member with a username and password, without email.
- The approved member created a forum topic, and a logged-out visitor could read it.
- Unauthenticated admin access redirected to login.
- No browser script errors were observed in that flow.
- MCP initialization and scoped tool discovery succeeded; unauthorized MCP access returned HTTP 401.

The README screenshot comes from that neutral fixture, not a production community or seeded installation content. Optional email delivery and R2 uploads have not been exercised against external services.

The release checks passed TypeScript, 538 tests across 64 test files, a Wrangler deployment dry run, and `npm audit` with zero vulnerabilities.

`npm run verify` runs TypeScript checks and the automated suite. The suite includes fresh schema and seeding, setup and invitation safeguards, core forum/chat behavior, branding escaping, and MCP authorization and deletion confirmation checks. Run it again on the final release revision; development snapshots can have different results.

Additional local browser checks passed real WebSocket chat delivery, direct messages, poll creation with choices, and admin branding changes reflected for guests.

## Cloudflare deployment

A separate Worker and fresh D1 database were deployed on the maintainer's existing Cloudflare account, with both SQLite Durable Object classes. Live browser checks passed protected setup, owner login through password hashing RPC, invitation creation, username-only member registration, member reading, forum posting, authenticated WebSocket chat delivery, setup closure, and standard MCP initialization.

This did not use a newly created Cloudflare account. It does not establish the README button onboarding path or measured free-plan CPU usage.

## Public deploy button

The README uses Cloudflare's official deploy-button URL. A complete click-through using a clean Cloudflare account has not been verified. No measured installation time is claimed here. Account creation, GitHub connection, resource provisioning, and build duration depend on those services.

The release acceptance target is a fresh community ready within a few minutes after account prerequisites. Confirm that experience using the published repository button before treating it as a measured result.
