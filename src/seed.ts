import type { Env } from './types';

export function starterRoomStatements(env: Env): D1PreparedStatement[] {
  const rooms = [
    ['General', 'general', 'forum', 'member'],
    ['Introductions', 'introductions', 'forum', 'member'],
    ['Announcements', 'announcements', 'news', 'mod'],
    ['Community Chat', 'chat', 'chat', 'member'],
  ];
  return rooms.map((room, i) => env.DB.prepare(
    `INSERT OR IGNORE INTO rooms (name, slug, kind, min_read, min_post, sort_order, is_page)
     VALUES (?, ?, ?, 'anon', ?, ?, ?)`
  ).bind(...room, (i + 1) * 10, room[2] === 'chat' ? 1 : 0));
}

export async function seedIfNeeded(env: Env): Promise<{ seeded: boolean; reason: string }> {
  const existing = await env.DB.prepare("SELECT value FROM settings WHERE key = 'seeded'").first();
  if (existing) return { seeded: false, reason: 'already-seeded' };
  await env.DB.batch([
    ...starterRoomStatements(env),
    env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seeded', 'true')"),
    env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('signups_open', '1')"),
    env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('bot_enabled', '0')"),
  ]);
  return { seeded: true, reason: 'ok' };
}
