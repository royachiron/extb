# Community membership restoration implementation plan

> Use /ship for delegated tasks and review, preserving the dedicated branch and unrelated working changes. Do not publish or merge.

Goal: restore neutral, optional community intake and helper functionality with safe upgrades.
Architecture: explicit intake state separate from moderation restrictions; one installation configuration; transactionally resolved application records and durable side-effect claims.
Tech stack: TypeScript Workers, D1 SQLite, existing HTML/HTMX renderer, Vitest.

## Wave Plan
| Wave | Tasks | Files touched | Safe to parallelize? |
|---|---|---|---|
| 1 | policy; intake; helper/config | Separate owned files described below | Yes, shared contract specified |
| 2 | wiring and integration | routes.ts, index.ts, admin navigation, docs | Depends on wave 1 |
| 3 | review and verification | tests and fixes | Sequential |

- [x] Policy: src/access.ts, src/types.ts, src/api/auth.ts, src/lib/invites.ts, src/db/users.ts, src/lib/admin-operations.ts, src/api/dms.ts, src/db/dms.ts, src/api/chat.ts, src/durable/chat-room.ts, relevant forum mutations. New src/lib/membership-policy.ts. Tests first for opt-in cohort, application room, privacy, HTTP/live enforcement, role transitions. Preserve moderation suspension semantics.
- [x] Intake: migration 0002 + schema snapshot; new src/db/membership.ts, src/api/membership.ts, src/views/membership.ts, src/email.ts addition, lifecycle tests. Implement application submission, queue, notes, history, conditional approval/decline, removal, claimed optional welcome/reminders. Test real SQLite transactions and duplicates.
- [x] Helper/config: src/api/admin/settings.ts and src/views/admin/settings.ts, new dedicated config UI/API if needed, bot copy/render/API and tests. Validate application forum and active staff/sender. Editable generic guidance and five useful branches. Remove Club controls in src/views/admin/users.ts, src/api/admin/users.ts, src/views/chat-user-menu.ts; preserve historical schema.
- [x] Wiring: load gate in index, connect membership/status/config/review routes and discoverable navigation; ordinary intro submission uses membership submission helper. Add upgrade/configuration and source audit docs.
- [x] Review requirement coverage and security, run targeted tests then npm run verify. Check diff/status for preserved installer edits and forbidden imports/artifacts.

Final validation: `npm run verify` passed (81 test files, 687 tests), including TypeScript checks for the application and installer. Independent review findings on onboarding, helper configuration and read-only anonymous room permissions were corrected and regression-tested.
