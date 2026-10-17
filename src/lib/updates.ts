import type { AppContext } from '../types';
import { getSetting, setSetting } from '../db/settings';
import { esc } from '../views/layout-utils';

// Updates are offered, never applied by the forum itself: replacing a Worker needs Cloudflare
// credentials the forum must not hold. The installer runs the update after the owner approves it.
export const DEFAULT_INSTALLER = 'https://extb.achiron.fyi';
const CHECK_INTERVAL = 24 * 3600 * 1000;

export interface AvailableUpdate { current: string; latest: string; url: string }

function versionParts(version: string | null | undefined): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = versionParts(latest), b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** Asks the installer which release it installs, at most once a day; failures wait for the next day. */
export async function availableUpdate(ctx: AppContext, now = Date.now()): Promise<AvailableUpdate | null> {
  const current = ctx.env.BUILD_ID;
  if (!versionParts(current)) return null;
  const installer = (ctx.env.EXTB_INSTALLER_URL || DEFAULT_INSTALLER).replace(/\/+$/, '');
  let cached: { at?: number; latest?: string | null } | null = null;
  try { cached = JSON.parse((await getSetting(ctx.env, 'update_check'))?.value || 'null'); } catch {}
  let latest = cached?.latest ?? null;
  if (!cached || typeof cached.at !== 'number' || now - cached.at > CHECK_INTERVAL) {
    try {
      const response = await fetch(installer + '/api/latest', { signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } });
      if (response.ok) latest = ((await response.json()) as { version?: string | null }).version ?? null;
    } catch {}
    await setSetting(ctx.env, 'update_check', JSON.stringify({ at: now, latest }));
  }
  if (!latest || !isNewerVersion(latest, current) || !ctx.origin) return null;
  const url = new URL(installer + '/update');
  url.searchParams.set('forum', ctx.origin);
  if (ctx.env.EXTB_WORKER) url.searchParams.set('worker', ctx.env.EXTB_WORKER);
  return { current, latest, url: url.toString() };
}

export function renderUpdateNotice(update: AvailableUpdate | null): string {
  if (!update) return '';
  return `<div class="admin-update" role="status">
    <p><strong><!--extb-ui-->Update available<!--/extb-ui--></strong> <span dir="ltr">${esc(update.current)} → ${esc(update.latest)}</span></p>
    <p class="admin-update-note"><!--extb-ui-->You confirm it with Cloudflare. Content, members and settings are kept.<!--/extb-ui--></p>
    <a class="btn" href="${esc(update.url)}"><!--extb-ui-->Update now<!--/extb-ui--></a>
  </div>`;
}
