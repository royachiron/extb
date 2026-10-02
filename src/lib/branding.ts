import type { Env, Setting } from '../types';
export interface Branding { name: string; description: string; logo_url: string; accent_color: string; homepage_copy: string; rules: string; contact_email: string; default_locale: string; }
export const DEFAULT_BRANDING: Branding = { name: 'EXTB', description: 'A place for your community to talk, share, and connect.', logo_url: '', accent_color: '#1d4ed8', homepage_copy: 'Your community. Your conversations. Your place.', rules: 'Be respectful. Protect private information. No harassment, spam, or illegal content. Follow moderator instructions.', contact_email: '', default_locale: 'en' };
export const BRANDING_KEYS = Object.keys(DEFAULT_BRANDING) as (keyof Branding)[];
export function brandingFromSettings(settings: Setting[]): Branding {
  const values = { ...DEFAULT_BRANDING };
  for (const key of BRANDING_KEYS) { const value = settings.find(s => s.key === `branding_${key}`)?.value; if (value !== undefined) values[key] = value; }
  try { return validateBranding(values); } catch { return { ...DEFAULT_BRANDING }; }
}
export function validateBranding(input: Record<string, unknown>): Branding {
  const result = {} as Branding;
  const limits: Record<keyof Branding, number> = { name: 80, description: 300, logo_url: 2048, accent_color: 7, homepage_copy: 2000, rules: 10000, contact_email: 254, default_locale: 2 };
  for (const key of BRANDING_KEYS) { const value = String(input[key] ?? DEFAULT_BRANDING[key]).trim(); if (value.length > limits[key]) throw new Error(`${key} is too long`); result[key] = value; }
  if (!['en', 'he'].includes(result.default_locale)) throw new Error('Default locale must be en or he');
  if (!result.name) throw new Error('Community name is required');
  if (!/^#[0-9a-f]{6}$/i.test(result.accent_color)) throw new Error('Accent color must be a six-digit hex color');
  if (result.logo_url) { const url = new URL(result.logo_url); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Logo must use a public HTTPS URL'); }
  if (result.contact_email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result.contact_email)) throw new Error('Invalid contact email');
  return result;
}
export async function loadBranding(env: Env): Promise<Branding> { const rows = await env.DB.prepare("SELECT key, value FROM settings WHERE key LIKE 'branding_%'").all<Setting>(); return brandingFromSettings(rows.results ?? []); }
export async function saveBranding(env: Env, input: Record<string, unknown>): Promise<Branding> { const values = validateBranding(input.default_locale === undefined ? { ...input, default_locale: (await loadBranding(env)).default_locale } : input); await env.DB.batch(BRANDING_KEYS.map(key => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(`branding_${key}`, values[key]))); return values; }
