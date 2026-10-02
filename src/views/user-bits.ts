// Shared user-presentation helpers (avatar, access badge, timezones). Canonical
// home extracted from profile.ts; profile.ts re-exports so old import sites keep
// working.
import { esc, initials } from './layout';

export const AVATAR_PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

export function avatarHtml(displayName: string, color: string, size = 64, url?: string | null): string {
  if (url) {
    return `<img src="${esc(url)}" alt="${esc(displayName)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,0.15); border: 2px solid #fff;">`;
  }
  const text = esc(initials(displayName));
  const fontSize = Math.round(size * 0.42);
  return `<span class="avatar" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${esc(color)};color:#fff;font-weight:700;font-size:${fontSize}px;line-height:1;box-shadow:inset 0 2px 4px rgba(0,0,0,0.1);">${text}</span>`;
}

export function badgeHtml(level: string): string {
  const colors: Record<string, string> = {
    member: '#6b7280', full: '#10b981', mod: '#3b82f6', admin: '#ef4444',
  };
  const bg = colors[level] ?? '#6b7280';
  return `<span class="badge" style="background:${bg};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.02em;">${['member','full','mod','admin'].includes(level) ? '<!--extb-ui-->' + esc(level === 'full' ? 'Trusted member' : level) + '<!--/extb-ui-->' : esc(level)}</span>`;
}

export const TIMEZONES = [
  'UTC', 'US/Pacific', 'US/Mountain', 'US/Central', 'US/Eastern', 'Europe/London',
  'Europe/Berlin', 'Europe/Paris', 'Asia/Jerusalem', 'Asia/Tokyo', 'Australia/Sydney'
];

export function timezoneOptions(selected?: string): string {
  return TIMEZONES.map(tz => `<option value="${tz}"${selected === tz ? ' selected' : ''}>${tz}</option>`).join('');
}
