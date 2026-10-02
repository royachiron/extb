# EXTB engineering rules

Use context-mode batches or rtk for command output. Keep communication concise.
Escape user content. Use parameterized SQL, CSRF on browser writes, and authorization before data access.
Preserve full-page and HTMX rendering. CSS colors use existing tokens.
Never commit credentials, local databases, dependencies, build output, or test screenshots.
Run npm run verify before publication.

Ampy is a separate private project at `/home/user/Projects/ampy`, never a subdirectory or release component of EXTB. Review reusable Ampy features and fixes in `docs/UPSTREAM_QUEUE.md`. Only Roy can explicitly approve a proposal; agents must not approve, automatically port, or bulk-import Ampy changes. Approved ports must omit community branding, configuration, operational files and private data, and pass npm run verify before publication.
