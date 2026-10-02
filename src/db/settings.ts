import type { Env, Setting } from '../types';

export async function getSetting(env: Env, key: string): Promise<Setting | null> {
  const row = await env.DB.prepare('SELECT * FROM settings WHERE key = ?')
    .bind(key)
    .first<Setting>();
  return row ?? null;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
    .bind(key, value)
    .run();
}

export async function getAllSettings(env: Env): Promise<Setting[]> {
  const res = await env.DB.prepare('SELECT * FROM settings ORDER BY key ASC').all<Setting>();
  return res.results ?? [];
}
