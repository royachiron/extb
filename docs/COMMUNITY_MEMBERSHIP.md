# Membership review and community helper

## Upgrade safely

Apply the normal D1 migration command (`npm run db:local` for local development, `npm run db:migrate` for a deployed database), then deploy the application. Migration `0002_membership_intake.sql` adds explicit intake state and application, decision and delivery tables. Migration `0001_initial.sql` is unchanged. The schema snapshot includes both migrations for fresh installations.

Existing accounts default to intake status `none`. No existing account is enrolled merely by enabling the gate. Existing roles, room overrides, private rooms, moderation suspensions, invitations, deployment bindings, Durable Object names and migrations remain intact. Historical `upgrade_requests` and `user_capabilities` rows remain stored. Club buttons have been removed because that flag has no permission-enforcing purpose in EXTB.

## Configure membership review

An administrator opens **cPanel → Membership settings** (`/admin/membership-settings`). Select an application forum and an active staff contact, then enable Iron Gate. The forum must allow ordinary approved members to read and post, and cannot be private, locked, or a page. The staff contact must be an approved, unbanned moderator or administrator with a display name. Changes are stored as one configuration value.

Iron Gate, welcome messages and reminders default to disabled. Open email registrations and claimed invitations both enter intake when the gate is enabled; an invitation verifies account access, but does not skip membership review. Registrations created while the gate is disabled remain outside the intake cohort if it is later enabled.

Applicants can read rooms already permitted to their account, post their introduction/application in the configured forum, and contact the configured staff privately. They cannot post, reply, vote, react, edit outside that forum, send chat messages, or DM other members while intake is enforced. This also applies to existing live sockets, which recheck current account and configuration permissions for writes. Application access never grants visibility into private rooms.

Disabling the gate suspends intake participation restrictions, while preserving application state and decision history. It does not grant Trusted access to restricted rooms or the member directory and does not remove moderation suspensions. Enabling it again resumes restrictions for the outstanding intake cohort. Approval and promotion to Trusted member (`full`), moderator or administrator clear intake restrictions. Demotion to member does not enroll an existing account into intake.

If a selected room is subsequently locked or made private, the normal room rules still apply: applicants are not granted a permission override. Choose an accessible application forum again. If staff are demoted, banned or disabled, they cease to qualify for intake contact; configure another staff member.

## Apply and review

Members can open **Membership status** (`/membership`) from their account menu. The page explains current status and links to the application forum and configured staff contact. An introduction submitted in the application forum enters the review queue. Alternatively, an applicant can submit a private application through the status page and discuss it with staff by DM. Sensitive details are optional.

Moderators and administrators use **cPanel → Membership intake** (`/admin/intake`) to read applications, add private staff notes, and approve or decline with an applicant-facing reason. Staff notes are never shown on applicant pages. Resolved attempts and decision history remain available; declined applicants can submit a new attempt.

Approval grants Trusted member access. Applicants can remove their own linked introduction after approval through the status page. Removal uses the existing soft-deletion semantics; it does not erase the staff decision history.

## Optional messages and reminders

Enable welcome messages in Membership settings, select an active approved sender, and edit the text. A durable unique delivery key permits one welcome message per approved member. The message and conversation pointers are written transactionally. A failed welcome delivery does not undo approval.

Reminder emails are optional and require the existing email provider configuration and installation origin. Enable reminders in settings, then dispatch them from the intake page. Eligible applicants have not submitted an application and have been waiting at least three days. A claim is stored before delivery to prevent concurrent or repeated sends. Definitely rejected sends may release their claim for retry; ambiguous delivery remains claimed to avoid duplicate mail. There is no scheduled bulk email job.

## Community helper

Configure the optional helper in **cPanel → System → Advanced Settings** (linked from Membership settings). Edit its name and guidance for introductions, topics, replies, choosing rooms, and participating when unsure what to say. `/bot` opens the helper; `/bot` commands in chat open a private, ephemeral panel. Guidance is prewritten and editable; nothing is posted automatically. The helper uses only rooms the viewer is permitted to see. Turning off `bot_enabled` disables helper routes.

## Selective restoration audit

Compared Discamp `83cf92647cdac0996865a81060dd6366c1acfe2e`, EXTB extraction `7a1df2e`, and the current EXTB code. The source is consulted as code only; no member records, private assets or operational files are imported. Ampy is separate and was not used as a port source.

| Removed/disconnected area | Decision |
|---|---|
| Intake queue, decisions, private contact, reminder claims | Restore with explicit enrollment, configurable room/staff and neutral copy. |
| Welcome bot DM | Restore as optional configurable staff message with durable duplicate protection. |
| Bot introduction, reply, topic, quiet participation and room guidance | Restore generic branches and editable guidance; preserve ephemeral commands. |
| Club capability buttons and badge text | Remove misleading UI/handler; retain historical storage. |
| Full/HTMX topic composition | Preserve both navigation paths; link introductions to the intake workflow. |
| Existing chat, polls, badges, warnings, room permissions and moderation | Preserve and test permission boundaries; no original application replacement. |
| Disability markers, digits, Wave, medical/history profiles, specialized badges and TBID articles/support | Exclude. |
| Historical populate/reset scripts, community assets/configuration and credentials | Exclude. |

Run `npm run verify` before publication.

Restoration validation: `npm run verify` passed with 81 test files and 687 tests, including application/decision/reapplication flows, permission and mutable socket authorization, private-room isolation, migration preservation, CSRF, localization and duplicate delivery protection.
