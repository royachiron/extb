# Web installer

The primary installation flow is designed for [extb.achiron.fyi](https://extb.achiron.fyi): continue with Cloudflare, choose a name/purpose/preset/language, review starter content, deploy, and create the owner account directly on the forum. GitHub is optional and comes afterward. Existing manual setup remains available.

## Operator launch

From the EXTB repository root run `npm ci` and `npm run verify`. The separate Worker uses `installer/wrangler.toml`; it has its own Installation Durable Object and no community database. Use `npx wrangler deploy --config installer/wrangler.toml --dry-run` before publishing it.

1. Register a Cloudflare OAuth client using authorization code, PKCE S256, authentication method `none`, and redirect `https://extb.achiron.fyi/oauth/callback`. Obtain the least-privilege account/user identity, Worker script/assets/DO and D1 scopes from Cloudflare's current scope registry. The authenticated user's selected account must permit these operations. Initial installation does not require GitHub or Builds access.
2. Complete publisher domain verification, set the client name/logo/URL/scopes, and make the client public. Add the `extb.achiron.fyi` custom domain. The current operator authorization cannot manage OAuth clients or DNS records (HTTP 403), so these steps require operator credentials with those permissions.
3. Set `OAUTH_CLIENT_ID` and `OAUTH_SCOPE` as installer variables. Set `ENCRYPTION_KEY` as a secret using `npx wrangler secret put ENCRYPTION_KEY --config installer/wrangler.toml`; generate 32 cryptographically random bytes encoded as base64. Do not commit keys or authorization tokens.
4. Publish a verified tagged EXTB release with the release workflow. Set `RELEASE_MANIFEST_URL` to that release's `extb-manifest.json` and `RELEASE_MANIFEST_SHA256` to its published digest. The installer rejects files outside the pinned EXTB release and rejects checksum mismatches. Release bundles contain Worker modules, static assets and ordered migrations; installation performs no npm/GitHub build.
5. Optional GitHub connection requires a separate GitHub OAuth client and `https://extb.achiron.fyi/github/callback`. Set `GITHUB_CLIENT_ID`, store `GITHUB_CLIENT_SECRET` with Wrangler, and configure `GITHUB_CF_SCOPE` with the additional Builds permissions; never store the secret in a repository. The user must also grant Cloudflare's GitHub App access and select a production deployment token in Cloudflare. Later Cloudflare operations require fresh authorization.
6. Exercise the complete public flow with a separate Cloudflare Free-plan user, including owner login, invitation/posting/chat/private-room isolation and a GitHub redeployment preserving data. Record elapsed time and dashboard steps before claiming an installation time.

Cloudflare references: [OAuth registration](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/), [OAuth integration](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/), [direct asset uploads](https://developers.cloudflare.com/workers/static-assets/direct-upload/), [Builds prerequisites](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).

## Ownership and retries

Provisioning records stage completion and resource identifiers in a Durable Object. Refreshing the browser resumes status; retry preserves existing resources. Authenticated sessions expire after one hour. A nonsecret installation locator and resource/build identifiers remain available for fresh authorization; credentials do not. Temporary Cloudflare credentials are encrypted and revoked/deleted after deployment or expiry.

The generated ownership credential is delivered only to the authenticated installer session in `/setup#ownership=…`. The forum immediately clears the fragment and exchanges it for a secure HttpOnly setup cookie with CSRF protection. Final setup verifies the exact approved draft and atomically creates the owner, six public-reading spaces, five owner-authored topics, branding and setup lock. No additional members or activity are invented. Invitations are required to participate; announcements require staff posting. Upgrades do not reapply starter content.

The forum's `/healthz` returns readiness without credentials or community content and works before setup redirects. Provisioning errors expose sanitized stage information and a relevant Cloudflare dashboard link.

## Optional personalization

The installed forum uses its optional `AI` binding. Only the community name, purpose, preset and language are sent to Qwen. Copy is strictly validated; model output cannot control permissions. One generation and two explicit regenerations are allowed. Missing access, quota, invalid output and a 45-second timeout retain ready-made content.

Cloudflare provides [10,000 free neurons daily across the account](https://developers.cloudflare.com/workers-ai/platform/pricing/), shared with other applications. No paid upgrade is enabled automatically.

## Independent downstream projects

Private downstream projects live outside EXTB and use their own repositories, bindings, branding and operational files. Potentially universal improvements enter the [review queue](UPSTREAM_QUEUE.md); Roy must explicitly approve each port. EXTB changes reach downstream projects through reviewed upstream merges.
