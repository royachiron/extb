/**
 * Barrel for the db layer. Every query function lives in a domain module
 * under src/db/ - this file only re-exports so the 28 existing
 * `from '../db'` import sites keep working. Add new queries to the domain
 * module, never here.
 */

export * from './db/users';
export * from './db/sessions';
export * from './db/blocks';
export * from './db/rooms';
export * from './db/topics';
export * from './db/posts';
export * from './db/deleted-content';
export * from './db/settings';
export * from './db/admin';
export * from './db/chat';
export * from './db/media';
export * from './db/search';

// ---------- dms (moved to ./db/dms.ts) ----------
export * from './db/dms';

// ---------- push subscriptions (moved to ./db/push-subscriptions.ts) ----------
export * from './db/push-subscriptions';

// ---------- upgrade requests (moved to ./db/upgrade-requests.ts) ----------
export * from './db/upgrade-requests';

// ---------- follows & mentions (moved to ./db/follows-mentions.ts) ----------
export * from './db/follows-mentions';

// ---------- notifications (moved to ./db/notifications.ts) ----------
export * from './db/notifications';

// ---------- post reactions (moved to ./db/post-reactions.ts) ----------
export * from './db/post-reactions';

// ---------- chat reactions (moved to ./db/chat-reactions.ts) ----------
export * from './db/chat-reactions';

// ---------- badges (moved to ./db/badges.ts) ----------
export * from './db/badges';

// ---------- user capabilities ----------
export * from './db/user-capabilities';

// ---------- polls (moved to ./db/polls.ts) ----------
export * from './db/polls';

// ---------- mod logs & appeals (moved to ./db/mod-logs.ts) ----------
export * from './db/mod-logs';

// ---------- room permissions (moved to ./db/room-permissions.ts) ----------
export * from './db/room-permissions';

// ---------- warnings (moved to ./db/warnings.ts) ----------
export * from './db/warnings';

// ---------- Content-Warning Tags (moved to ./db/cw-tags.ts) ----------
export * from './db/cw-tags';

// ---------- Member reports ----------
export * from './db/reports';

export * from './db/post-pages';
