# Ampy → EXTB review queue

Ampy lives independently at `/home/user/Projects/ampy`. Propose universal features and fixes here before porting. Roy alone approves each proposal explicitly; Ampy implementation or a general request to improve EXTB is not approval of a queued item. Never import personal assets, operational files, credentials or community configuration.

Append one entry per proposal using this format:

```
## AMP-YYYYMMDD-short-name
Status: pending
Purpose: User problem and why this is useful to any EXTB community.
Source: Ampy repository commit SHA and relevant source paths.
Evidence: Verification command and result; behavior demonstrated.
Privacy: Community-specific files and behavior excluded from the proposed port.
Approval: None. Record Roy's explicit instruction and date only when provided.
EXTB port: None. After approval, record reviewed port commit and verification.
```

Statuses: pending, approved, rejected, ported. An agent may create pending entries or implement a proposal Roy explicitly approved. An agent must never grant approval. Rejected proposals stay documented. Ported proposals retain their approval evidence. Fixes to the original Ampy implementation are separate work and do not authorize an EXTB port.

## AMP-20261016-email-notifications-digest
Status: pending
Purpose: Active members miss replies to their threads or weekly community activity when away from the site. Adds opt-out reply email notifications, opt-in weekly digest emails, signed HMAC one-click unsubscribe links, a 15-minute cron dispatcher, daily send cap, and `off`/`dry`/`test`/`live` delivery modes.
Source: Discamp commit `180fe5d` (`migration_email_notifications.sql`, `src/lib/email-jobs.ts`, `src/lib/email-links.ts`, `src/db/email-prefs.ts`, `src/api/email.ts`, `src/email.ts`, `src/views/profile-edit.ts`, `src/views/feed.ts`, `tests/email-jobs.test.ts`).
Evidence: `npm test -- tests/email-jobs.test.ts` passes; dry/test/live modes, daily budget gate, and HMAC unsubscribe verification tested.
Privacy: Exclude any community-specific sender domain or copy; use installation branding settings (`site_name`, configured sender address, and base URL).
Approval: None. Record Roy's explicit instruction and date only when provided.
EXTB port: None. After approval, record reviewed port commit and verification.

## AMP-20261016-richer-feed-cards
Status: ported
Purpose: Standard feed cards only showed title, author, room, and reply count, making it hard to gauge thread activity at a glance. Adds plain-text opening excerpts (automatically suppressed when Content Warning tags are present), view counts (excluding author/bots/HTMX re-renders), total reaction counts, up to 3 recent replier avatars, last replier name + relative timestamp, `Active` / `New` labels, `"N new"` unread reply badges, and a `"Be the first to reply →"` nudge on unanswered threads.
Source: Discamp commits `3cfe828`, `50f3551`, `353fc14` (`migration_topic_view_count.sql`, `src/db/feed-extras.ts`, `src/db/rooms.ts`, `src/db/topics.ts`, `src/api/topics.ts`, `src/views/feed.ts`, `src/views/layout-scripts/ui.ts`, `tests/feed-card-extras.test.ts`).
Evidence: `npm test -- tests/feed-card-extras.test.ts` passes; fail-soft extras loading, CW excerpt suppression, and view counting verified.
Privacy: Purely generic forum feed metadata and UI; no private community fields involved.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`migrations/0003_feed_extras_and_indexes.sql`, `src/db/feed-extras.ts`, `src/db/rooms.ts`, `src/db/topics.ts`, `src/api/topics.ts`, `src/views/feed.ts`, `src/views/layout.ts`, `src/views/layout-scripts/ui.ts`, `tests/feed-card-extras.test.ts`); `npm run verify` passes.

## AMP-20261016-duplicate-topic-guard
Status: ported
Purpose: Users double-tapping the submit button on slow mobile connections create duplicate threads. Adds client-side submit button locking on form submit plus a 5-minute server-side deduplication check (`findRecentDuplicateTopic`) that redirects repeat submissions to the first created topic.
Source: Discamp commit `d9a1d5f` (`src/db/topics.ts`, `src/api/topics.ts`, `src/views/post.ts`, `src/views/layout-scripts/ui.ts`, `tests/duplicate-topic.test.ts`).
Evidence: `npm test -- tests/duplicate-topic.test.ts` passes; duplicate POST within window redirects cleanly to existing topic `short_id`.
Privacy: Universal form/API guard; no community-specific data or copy.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`src/db/topics.ts`, `src/api/topics.ts`, `src/views/post.ts`, `src/views/layout-scripts/ui.ts`, `tests/duplicate-topic.test.ts`); `npm run verify` passes.

## AMP-20261016-read-only-maintenance-switch
Status: ported
Purpose: Operators need a fast way to pause database writes and live chat mutations during maintenance or migrations without taking the site offline. Adds a `read_only` setting check in request handling and the chat Durable Object.
Source: Discamp commit `72d11ac` (`src/lib/read-only.ts`, `src/db/settings.ts`, `src/middleware.ts`, `src/durable/chat-room.ts`, `tests/read-only.test.ts`).
Evidence: `npm test -- tests/read-only.test.ts` passes; GET requests succeed while POST/write and chat socket sends are rejected gracefully when enabled.
Privacy: Exclude `wrangler.toml` account-specific placement/DB bindings; port only the `read_only` runtime switch.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`src/lib/read-only.ts`, `src/db/settings.ts`, `src/index.ts`, `src/durable/chat-room.ts`, `tests/read-only.test.ts`); `npm run verify` passes.

## AMP-20261016-mod-feed-index-and-midwidth-topnav
Status: ported
Purpose: Moderator feed queries scanned ~5k rows without a composite index on `(deleted_at, is_pinned, last_reply_at)`, and the desktop topnav overflowed between `769px` and `942px`. Adds `idx_topics_live_pinned_lastreply` / `idx_topics_room_live_pinned_lastreply` (reducing scanned rows ~10x) and tightens topnav spacing at intermediate tablet/laptop widths.
Source: Discamp commit `959094d` (`migration_topics_mod_feed_index.sql`, `src/views/layout.ts`, `docs/LAYOUT.md`, `tests/feature-manifest.test.ts`).
Evidence: `npm test` and layout verification pass; D1 query row scan drops from ~5,000 to ~550 rows.
Privacy: Universal SQL index and responsive CSS breakpoint fix.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`migrations/0003_feed_extras_and_indexes.sql`, `schema.sql`, `src/views/layout.ts`, `docs/LAYOUT.md`, `tests/feature-manifest.test.ts`); `npm run verify` passes.

## AMP-20261016-heartbeat-hash-scroll-fix
Status: ported
Purpose: When a user opened a thread via a `#post-123` anchor and began typing a reply, the background heartbeat re-triggered hash scrolling and yanked the viewport away from the reply textarea. Tracks `dataset.hashScrolled` so the browser only scrolls once per hash target.
Source: Discamp commit `4d1b25c` (`src/views/layout-scripts/boot.ts`, `tests/hash-scroll.test.ts`).
Evidence: `npm test -- tests/hash-scroll.test.ts` passes; hash scroll fires on initial navigation and hash change, never on background heartbeat ticks.
Privacy: Universal client-side navigation fix.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`src/views/layout-scripts/boot.ts`, `tests/hash-scroll.test.ts`); `npm run verify` passes.

## AMP-20261015-poll-undo-and-peek
Status: ported
Purpose: Members could not view poll results without voting first, nor change a vote cast by mistake. Adds a `?view=results` peek toggle before voting and an `Undo vote` action while the poll remains open.
Source: Discamp commit `978a15f` (`src/db/polls.ts`, `src/api/topics.ts`, `src/routes.ts`, `src/views/topic.ts`, `tests/poll-render.test.ts`).
Evidence: `npm test -- tests/poll-render.test.ts` passes; peek results, vote submission, and vote removal verified.
Privacy: Universal poll mechanics; no community-specific content.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`src/db/polls.ts`, `src/api/topics.ts`, `src/routes.ts`, `src/views/topic.ts`, `tests/poll-render.test.ts`); `npm run verify` passes.

## AMP-20261015-intake-shortcut-approve-and-welcome-emails
Status: pending
Purpose: Moderators had to switch out of the mod tab or click through confirmation dialogs to approve gated members, and welcome emails did not distinguish between members who already posted an intro vs. those approved via shortcut. Adds one-click shortcut approval in the mod tab, tailored welcome email copy for both paths, and includes the moderator's note in the email and intake history.
Source: Discamp commits `54d71a7`, `94e2028`, `67dceb2`, `c3dfd26` (`src/api/mod.ts`, `src/db/topics.ts`, `src/email.ts`, `src/views/admin/intake.ts`, `src/views/mod.ts`, `tests/intake-approve-email.test.ts`, `tests/intake-shortcut.test.ts`).
Evidence: `npm test -- tests/intake-approve-email.test.ts tests/intake-shortcut.test.ts` passes.
Privacy: Replace any hardcoded room slug (`introductions`) or community-specific email phrasing with EXTB's configurable `application_room_slug` and `site_name` settings.
Approval: None. Record Roy's explicit instruction and date only when provided.
EXTB port: None. After approval, record reviewed port commit and verification.

## AMP-20261010-dm-bubble-hug-and-avatar-remove-fix
Status: ported
Purpose: Short Direct Message bubbles stretched wider than their text content, and clicking "Remove photo" in profile settings leaked raw avatar HTML into the preview container. Fixes `.dm-bubble` padding and `white-space: pre-wrap` placement and uses a `<template id="avatar-fallback">` on avatar removal.
Source: Discamp commits `eabf5b2`, `96b937c` (`src/views/dms.ts`, `src/views/profile-edit.ts`, `tests/profile-avatar-remove.test.ts`).
Evidence: `npm test -- tests/profile-avatar-remove.test.ts` and `scripts/check-dm-widths.mjs` pass.
Privacy: Universal UI/CSS fixes.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`src/views/dms.ts`, `src/views/profile-edit.ts`, `tests/profile-avatar-remove.test.ts`); `npm run verify` passes.

## AMP-20261002-feed-idle-pause-and-204-stamp
Status: ported
Purpose: Auto-refreshing the feed every 60 seconds wasted D1 reads and bandwidth when the tab was idle or when no new posts had arrived. Pauses feed polling when the user is idle/hidden and returns `204 No Content` when the feed stamp (`getFeedStamp`) matches the client's `?v=` stamp parameter.
Source: Discamp commit `64c3b43` (`src/db/feed-stamp.ts`, `src/api/topics.ts`, `src/views/feed.ts`, `src/views/layout-scripts/activity.ts`, `tests/feed-pagination.test.ts`).
Evidence: `npm test -- tests/feed-pagination.test.ts` passes; unchanged feed returns 204 without re-rendering DOM cards.
Privacy: Universal performance optimization.
Approval: Approved by Roy on 2026-10-16 ("Port the new universal features/fixes into EXTB now, bump version to v0.4.0, and push to royachiron/extb").
EXTB port: Ported in v0.4.0 (`src/db/feed-stamp.ts`, `src/api/topics.ts`, `src/views/feed.ts`, `src/views/layout-scripts/activity.ts`, `src/views/layout-scripts/index.ts`, `tests/feed-pagination.test.ts`); `npm run verify` passes.
