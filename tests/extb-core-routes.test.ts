import { describe, it, expect } from 'vitest';
import { postUpload, getMedia } from '../src/api/media';
import { getManifest, getRobotsTxt } from '../src/api/static';
import { DEFAULT_BRANDING } from '../src/lib/branding';
import type { AppContext } from '../src/types';
const ctx = { env: {}, user: { id: 1, is_banned: 0, is_approved: 1 }, branding: { ...DEFAULT_BRANDING, name: 'Garden Club', accent_color: '#123456' }, origin: 'https://garden.example' } as unknown as AppContext;
describe('portable core installation', () => {
 it('reports unavailable uploads without accessing absent storage', async () => {
  const response = await postUpload(new Request('https://garden.example/api/upload', {method:'POST'}), ctx);
  expect(response.status).toBe(503);
 });
 it('returns missing media without R2', async () => {
  expect((await getMedia(new Request('https://garden.example/media/x'),ctx,{id:'x'})).status).toBe(404);
 });
 it('uses community branding in the app manifest', async () => {
  const manifest = await (await getManifest(new Request('https://garden.example/manifest.json'),ctx)).json() as any;
  expect(manifest.name).toBe('Garden Club'); expect(manifest.theme_color).toBe('#123456');
 });
 it('uses the installation origin in robots', async () => {
  const text = await (await getRobotsTxt(new Request('https://garden.example/robots.txt'),ctx,{})).text();
  expect(text).toContain('https://garden.example/sitemap.xml'); expect(text).not.toContain('extb.test');
 });
});
