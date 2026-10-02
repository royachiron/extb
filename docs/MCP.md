# Admin MCP

EXTB serves a stateless Streamable HTTP MCP endpoint at `/mcp`. Use a client that supports a remote HTTP endpoint and a custom Authorization header.

## Connect

1. Sign in as an administrator and open `/admin/tokens`.
2. Give the token a descriptive name and select permissions.
3. Copy the secret immediately. It is shown once; only its hash is stored.
4. Add your community's HTTPS `/mcp` URL and `Authorization: Bearer YOUR_TOKEN` to your client's remote-server configuration.

A typical configuration shape is shown below. Exact keys vary by client; consult its remote MCP documentation.

```json
{
  "mcpServers": {
    "extb": {
      "url": "https://YOUR-COMMUNITY.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_PRIVATE_TOKEN"
      }
    }
  }
}
```

Keep the token in the client's private configuration. Do not commit it or share a screenshot containing it. OAuth discovery is not provided; configure the bearer header directly. Browser clients that send an Origin header must use the installation's own origin. Native or server-side clients can omit Origin.

## Permissions

| Scope | Capabilities |
| --- | --- |
| `read` | Branding, rooms, member names and roles, badges, topics, replies, totals, and API audit history |
| `configuration` | Branding, rooms, room permissions, and badge definitions |
| `members` | Roles, bans, and badge assignments |
| `content` | Create and edit topics and replies as the token owner |
| `moderation` | Reports, warnings, appeals, and content moderation |
| `delete` | Prepare and confirm permanent deletion; requires explicit selection |

Only tools authorized by the token's scopes are advertised. Every operation checks the current owner role and token state. Revocation, banning the owner, or removing their admin role ends access. Tokens are managed from their owner's token page.

## Examples

Ask your connected assistant to list rooms before changing them so it has the actual IDs.

```text
List the current rooms, then create a forum named Projects with slug projects.
```

```text
Read the branding, then change the accent to #7c3aed while retaining the other values.
```

```text
List pending reports and summarize them. Wait for my instructions before resolving them.
```

Deletion uses `prepare_delete` with a target type and ID. The result identifies the target and impact and supplies a confirmation token valid for five minutes. Review it, then call `confirm_delete` with the same type, ID, and token. The confirmation is single-use and bound to the admin and operation. Take a backup before permanently deleting important content.

The endpoint does not provide private-message browsing, impersonation, passwords, arbitrary SQL, or infrastructure management. Admin API actions are recorded with actor and token identities.
