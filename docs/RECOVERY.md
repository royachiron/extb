# Account recovery

## Members

With configured email, members with an email address can request a reset from `/reset`.

Without email, ask an admin to create a reset link for your account under Admin → Invitations. The link expires after one hour. Send it through a private channel. Possession of the link allows a password change.

## Owner

If another active admin exists, they can issue a reset link. If you are the only admin and cannot sign in, use your Cloudflare account and the repository's recovery script.

1. Check out your installation's repository, including its actual D1 binding configuration, and run `npm ci`.
2. Authenticate with `npx wrangler login`.
3. Create a private file outside the repository containing the new password. Set its permissions so only you can read it. Passwords must have 8 to 256 characters.
4. Run:

```sh
node scripts/recover-owner.mjs YOUR_ADMIN_USERNAME --password-file /private/path/new-password.txt
```

5. Delete the password file, then sign in with the new password.

The script hashes the password with a new per-account salt, updates only a matching active admin, and revokes that account's browser sessions. It does not create an admin or unban one. A successful command does not prove the username matched, so check the username if login still fails. Add `--local` only when recovering a local development account.

If using the optional uploads configuration, copy its actual `DB` database ID into the core `wrangler.toml` before running recovery because the script uses the core configuration. Do not change the deployed database to accomplish recovery.

Protect your Cloudflare and GitHub accounts with strong authentication. They control the installation and recovery path.
