# Web installer

The primary installation flow is designed for [extb.achiron.fyi](https://extb.achiron.fyi): continue with Cloudflare, choose a name/purpose/preset/language, review starter content, deploy, and create the owner account directly on the forum. GitHub is optional and comes afterward. Existing manual setup remains available.

## Operator launch

From the EXTB repository root run `npm ci` and `npm run verify`. The separate Worker uses `installer/wrangler.toml`; it has its own Installation Durable Object and no community database. Use `npx wrangler deploy --config installer/wrangler.toml --dry-run` before publishing it.

1. Register a Cloudflare OAuth client using authorization code, PKCE S256, authentication method `none`, and redirect `https://extb.achiron.fyi/oauth/callback`. Grant the dashboard scopes Workers **Admin** and **Edit**, D1 **Edit**, Account Settings **Read** and User Details **Read**; set `OAUTH_SCOPE` to `workers-scripts.admin workers-scripts.edit d1.write account-settings.read user-details.read`. Workers Edit alone is refused (HTTP 403) by `assets-upload-session`, which accepts only Workers Scripts Write; the dashboard does not offer that scope, so Admin covers it. The authenticated user's selected account must permit these operations. Initial installation does not require GitHub or Builds access.
2. Complete publisher domain verification, set the client name/logo/URL/scopes, and make the client public. Add the `extb.achiron.fyi` custom domain. The current operator authorization cannot manage OAuth clients or DNS records (HTTP 403), so these steps require operator credentials with those permissions.
3. Set `OAUTH_CLIENT_ID` and `OAUTH_SCOPE` as installer variables. Set `ENCRYPTION_KEY` as a secret using `npx wrangler secret put ENCRYPTION_KEY --config installer/wrangler.toml`; generate 32 cryptographically random bytes encoded as base64. Do not commit keys or authorization tokens.
4. Publish a verified tagged EXTB release with the release workflow. Set `RELEASE_MANIFEST_URL` to that release's `extb-manifest.json` and `RELEASE_MANIFEST_SHA256` to its published digest. The installer rejects files outside the pinned EXTB release and rejects checksum mismatches. The release workflow re-pins the installer to each new release when the repository has a `CLOUDFLARE_API_TOKEN` secret (Edit Cloudflare Workers template, limited to the installer account and the `achiron.fyi` zone) and a `CLOUDFLARE_ACCOUNT_ID` variable; without them it warns and leaves the previous pin. Release bundles contain Worker modules, static assets and ordered migrations; installation performs no npm/GitHub build.
5. Optional GitHub connection requires a separate GitHub OAuth client and `https://extb.achiron.fyi/github/callback`. Set `GITHUB_CLIENT_ID`, store `GITHUB_CLIENT_SECRET` with Wrangler, and configure `GITHUB_CF_SCOPE` with the additional Builds permissions; never store the secret in a repository. The user must also grant Cloudflare's GitHub App access and select a production deployment token in Cloudflare. Later Cloudflare operations require fresh authorization.
6. Exercise the complete public flow with a separate Cloudflare Free-plan user, including owner login, invitation/posting/chat/private-room isolation and a GitHub redeployment preserving data. Record elapsed time and dashboard steps before claiming an installation time.

Cloudflare references: [OAuth registration](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/), [OAuth integration](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/), [direct asset uploads](https://developers.cloudflare.com/workers/static-assets/direct-upload/), [Builds prerequisites](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).

## Ownership and retries

Provisioning records stage completion and resource identifiers in a Durable Object. Refreshing the browser resumes status; retry preserves existing resources. Authenticated sessions expire after one hour. A nonsecret installation locator and resource/build identifiers remain available for fresh authorization; credentials do not. Temporary Cloudflare credentials are encrypted and revoked/deleted after deployment or expiry.

The generated ownership credential is delivered only to the authenticated installer session in `/setup#ownership=…`. The forum immediately clears the fragment and exchanges it for a secure HttpOnly setup cookie with CSRF protection. Final setup verifies the exact approved draft and atomically creates the owner, six public-reading spaces, five owner-authored topics, branding and setup lock. No additional members or activity are invented. Invitations are required to participate; announcements require staff posting. Upgrades do not reapply starter content.

The installer finishes setup itself in a final "owner account" stage. It mints a fresh single-use ownership token, then calls the forum's own `/setup/claim` and `/setup` endpoints server-side. Those calls create the user `admin` with a random password such as `EXTB2026-k7Qm-x3Lp-9fRw`, using the approved draft. The password is encrypted in the installer session and shown once on the finished screen. It is deleted when the owner hides it or when the session expires. The owner should change it after the first login. A shared default password is never used, because anyone who found a new forum's address before its owner could take it over.

The forum's `/healthz` returns readiness without credentials or community content and works before setup redirects. After deployment, Cloudflare can take a few minutes to publish a new `workers.dev` address. The installer polls `/healthz` every 5 seconds for up to 10 minutes before reporting a failure. Cloudflare 5xx/429 responses, timeouts and dropped connections are retried automatically up to 6 times with backoff. Meanwhile, the wizard shows a calm "publishing" or "retrying" note, not an error. Provisioning errors that remain expose sanitized stage information and a relevant Cloudflare dashboard link.

## Updating a forum

Forums never update themselves: replacing a Worker needs Cloudflare credentials a forum must not hold. Once a day, a forum's admin panel asks the installer's `/api/latest` which release it installs. When that release is newer than the forum's `BUILD_ID`, admins see an "Update now" banner. The check is cached in the `update_check` setting, and failures also wait a day.

The banner links to `/update?forum=<origin>[&worker=<name>]`. That page opens a separate installer session, so updating never disturbs an install still in progress, and asks for Cloudflare authorization. It then runs four stages:

1. **Locate forum:** find the account, Worker and D1 database. A `workers.dev` address identifies its subdomain and Worker; on a custom domain the forum supplies its Worker name from the `EXTB_WORKER` binding. Refuse Workers that are not EXTB forums, and refuse downgrades. Finish immediately when the forum is already current.
2. **Migrations:** apply only migrations missing from `d1_migrations`.
3. **Worker deployment:** upload the release with `keep_bindings`. Secrets survive uploads on their own. Other bindings the owner added, such as an R2 media bucket or KV, would otherwise be dropped (verified against the API).
4. **Readiness:** wait for `/healthz`.

No resources are created. Ownership, users and content are never touched, and the Cloudflare token is revoked when the update finishes. Forums installed before v0.5.0 have no banner; their owners can open the `/update?forum=…` link directly.

## Starter content with your own AI

Starter content begins from a ready-made template in the forum's language. To personalize it, the wizard preview (and the forum's setup page) offers a ready-made prompt (`src/community/prompt.ts`). The prompt holds the current draft, an editable preferences section and the format's hard rules. The owner runs it in any assistant and pastes the reply into "Edit content". The reply may include code fences or surrounding prose. It is validated against the same strict schema as a manual edit, so it cannot change room slugs, permissions or roles.

EXTB does not call a model itself. Workers AI personalization was removed after a measured comparison on 2026-10-17. Among `qwen3-30b-a3b-fp8`, `gemma-4-26b-a4b-it`, `glm-5.3-flash`, `deepseek-v4-flash`, `qwen3.8-27b` and `gpt-oss-120b`, only the old Qwen and gpt-oss-120b produced valid drafts in both languages. Qwen's Hebrew was unusable. Forums are deployed without an `AI` binding.

## Independent downstream projects

Private downstream projects live outside EXTB and use their own repositories, bindings, branding and operational files. Potentially universal improvements enter the [review queue](UPSTREAM_QUEUE.md); Roy must explicitly approve each port. EXTB changes reach downstream projects through reviewed upstream merges.
