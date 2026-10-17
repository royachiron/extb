import { describe, it, expect, vi, afterEach } from 'vitest';
import { database } from './helpers/sqlite';
import { availableUpdate, isNewerVersion, renderUpdateNotice } from '../src/lib/updates';

afterEach(() => vi.unstubAllGlobals());
const context = (env: any, build: string, extra: Record<string, string> = {}) => ({ env: { ...env, BUILD_ID: build, ...extra }, origin: 'https://extb-x.owner.workers.dev' }) as any;

describe('forum update offer', { timeout: 40000 }, () => {
  it('asks the installer at most once a day and links an update for this forum', async () => {
    const db = database(); try {
      const fetch = vi.fn(async () => Response.json({ version: 'v0.4.3' })); vi.stubGlobal('fetch', fetch);
      const ctx = context(db.env, 'v0.4.2', { EXTB_WORKER: 'extb-x' });
      const update = await availableUpdate(ctx, 1_000_000);
      expect(fetch).toHaveBeenCalledWith('https://extb.achiron.fyi/api/latest', expect.anything());
      expect(update).toEqual({ current: 'v0.4.2', latest: 'v0.4.3', url: 'https://extb.achiron.fyi/update?forum=https%3A%2F%2Fextb-x.owner.workers.dev&worker=extb-x' });
      await availableUpdate(ctx, 1_000_000 + 3600_000);
      expect(fetch).toHaveBeenCalledTimes(1);
      await availableUpdate(ctx, 1_000_000 + 25 * 3600_000);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { db.close(); }
  });

  it('offers nothing when current, on development builds, or when the installer is unreachable', async () => {
    const db = database(); try {
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ version: 'v0.4.3' })));
      expect(await availableUpdate(context(db.env, 'v0.4.3'))).toBeNull();
      expect(await availableUpdate(context(db.env, 'installer-browser-test'))).toBeNull();
    } finally { db.close(); }
    const offline = database(); try {
      const fetch = vi.fn(async () => { throw new TypeError('network down'); }); vi.stubGlobal('fetch', fetch);
      expect(await availableUpdate(context(offline.env, 'v0.4.2'), 5)).toBeNull();
      // A failed check still waits a day, so a dead installer never slows every admin page.
      await availableUpdate(context(offline.env, 'v0.4.2'), 10);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { offline.close(); }
  });

  it('compares release versions numerically and escapes the banner', () => {
    expect(isNewerVersion('v0.4.10', 'v0.4.9')).toBe(true);
    expect(isNewerVersion('v0.4.3', 'v0.4.3')).toBe(false);
    expect(isNewerVersion('garbage', 'v0.4.3')).toBe(false);
    const html = renderUpdateNotice({ current: 'v0.4.2', latest: 'v0.4.3', url: 'https://extb.achiron.fyi/update?forum=a&b="x"' });
    expect(html).toContain('href="https://extb.achiron.fyi/update?forum=a&amp;b=&quot;x&quot;"');
    expect(renderUpdateNotice(null)).toBe('');
  });
});
