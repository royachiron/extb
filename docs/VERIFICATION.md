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

The release checks passed TypeScript, 547 tests across 65 test files, a Wrangler deployment dry run, and `npm audit` with zero vulnerabilities.

`npm run verify` runs TypeScript checks and the automated suite. The suite includes fresh schema and seeding, setup and invitation safeguards, core forum/chat behavior, branding escaping, and MCP authorization and deletion confirmation checks. Run it again on the final release revision; development snapshots can have different results.

Additional local browser checks passed real WebSocket chat delivery, direct messages, poll creation with choices, and admin branding changes reflected for guests.

## Cloudflare deployment

A separate Worker and fresh D1 database were deployed on the maintainer's existing Cloudflare account, with both SQLite Durable Object classes. Live browser checks passed protected setup, owner login through password hashing RPC, invitation creation, username-only member registration, member reading, forum posting, authenticated WebSocket chat delivery, setup closure, and standard MCP initialization.

This did not use a newly created Cloudflare account. It does not establish the README button onboarding path or measured free-plan CPU usage.

## Public deploy button

The README uses Cloudflare's official deploy-button URL. Automated navigation reached the Cloudflare dashboard, which required a human security check. A complete click-through using a clean Cloudflare account has not been verified. No measured installation time is claimed here. Account creation, GitHub connection, resource provisioning, and build duration depend on those services.

The release acceptance target is a fresh community ready within a few minutes after account prerequisites. Confirm that experience using the published repository button before treating it as a measured result.

## Web installer implementation (2026-10-02)

The v0.2 implementation passed root and installer TypeScript checks and 635 tests across 74 test files. Security coverage includes OAuth cancellation/state replay/identity mismatch, expired sessions, account mismatch, CSRF, ownership replay/takeover, concurrent owner claims, every provisioning-stage failure, resource collisions, lost create/deploy responses, alarm cleanup racing reauthorization, and credential encryption.

Both languages and all five presets are validated. AI tests cover missing access, malformed output, quota failures, timeout and concurrent generation limits. Configuration-scoped MCP tests preserve existing private permissions and discussions, and repeated content application is idempotent.

The local Playwright wizard checks passed English/Hebrew mobile previews, escaped content, editing and explicit approval. The built forum Worker was exercised with ephemeral Miniflare/D1 and real password-hashing and chat Durable Objects: fragment removal/exchange, approved content and owner creation, invitation registration, member posting, real WebSocket message delivery, private-room isolation, owner login and configuration-scoped MCP discovery passed. This runtime test also catches bundle initialization failures that source-only unit tests cannot. The pinned local runtime supports compatibility date 2026-08-06; production configurations retain 2026-10-02. No screenshots from these tests are published.

Release packaging verifies the suite and browsers before producing only Worker modules, static assets, migrations and a checksum manifest. Credentials, downstream community assets and private operational files are excluded and scanned.

**Public web installation remains unverified.** The available operator credentials return HTTP 403 for OAuth-client registration, DNS records and Workers Builds token access. Optional GitHub API behavior is tested with controlled responses; an actual native Builds redeployment preserving data still needs verification. A separate Cloudflare Free-plan user has not completed the OAuth installation flow, and no installation-time claim is made. Operator steps are in [WEB_INSTALLER.md](WEB_INSTALLER.md).
