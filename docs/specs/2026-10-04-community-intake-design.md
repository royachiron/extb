# Community membership restoration

Restore selective general community behavior from Discamp 83cf92647cdac0996865a81060dd6366c1acfe2e against EXTB extraction 7a1df2e and current code. Never port private community content or specialized fields. Source inspection found hardcoded application room, staff and bot identity; replace those with installation settings. Preserve existing accounts, permission rules, deployment and DO identities, migration history, and unrelated installer edits.

## Design
Use explicit users.intake_status with safe default 'none' for existing accounts. New accounts (including invitations) get 'applicant' only while configured Iron Gate is enabled. Runtime membership policy loads one atomic JSON setting membership_config. Applicants, pending and declined users remain able to read their already permitted rooms; cannot participate outside configured application forum or message anyone except configured active staff. No grant of private-room read access. Existing posting_restricted_at remains a separate moderation suspension.

Applications are explicit records with pending/approved/declined state, private staff notes, applicant-facing decision reason, introduction topic reference and immutable decision history across reapplications. An introduction in the configured forum can submit the application; private intake can use the application page and DM staff. Approval atomically changes application state and grants full (Trusted) access while clearing intake status. Promotion to full/mod/admin also clears intake restriction; demotion does not enroll existing members into intake. Disabling the gate suspends intake restrictions and retains all queue/history records; reenabling resumes outstanding intake. Application forum must be readable and writable by ordinary approved members; configured staff must be active mod/admin.

Applicant may choose to remove their linked introduction after approval, with ownership checked and soft removal. Optional welcome DM uses configurable active sender and text; durable unique delivery claim prevents repeats and approval survives messaging failure. Optional manually dispatched reminder emails target applicants without submission, claim before sending, never retry ambiguous delivery automatically.

Standalone intake configuration and review pages use existing layout and HTMX fragments, CSRF browser writes, escaped text, parameterized SQL, and admin/mod authorization before loading private applications. Applicant status page explains next steps in English/Hebrew, contains introduction and private-contact actions without community-specific names.

Helper remains deterministic and optional. Editable generic guidance covers introductions, topics, replies, room choice and uncertainty; routes respect bot_enabled. Remove ineffective Club controls, leaving historical schema/data intact. Audit other removed routes and feature seams, restoring only demonstrably reusable behavior.

## Tests
Real SQLite additive migration and application lifecycle tests; queue authorization, private-room isolation, CSRF and full/HTMX rendering; permission checks on forum posts/replies/polls/reactions, HTTP chat/DM and mutable live sockets, gate enable/disable, invitation handling, promotions/demotions, duplicate approval/welcome/reminders. Final npm run verify.

## Architecture Decisions
Keep membership configuration, policy and persistence as focused boundaries because enforcement and transactional transitions serve multiple transports. Reuse existing SQL, layout, DM and email utilities. No capability framework; Club has no meaningful enforced purpose and its misleading UI is removed. No deployment changes or publication during this task.
