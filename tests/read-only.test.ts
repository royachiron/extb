import { describe, it, expect } from 'vitest';
import { isWriteRequest, readOnlyResponse, READ_ONLY_MESSAGE } from '../src/lib/read-only';
import { isReadOnly } from '../src/db/settings';

const req = (method: string, htmx = false) =>
  new Request('https://community.example/posts', { method, headers: htmx ? { 'hx-request': 'true' } : {} });

describe('maintenance write freeze', () => {
  it('only state-changing methods count as writes', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) expect(isWriteRequest(req(m))).toBe(false);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(isWriteRequest(req(m))).toBe(true);
  });

  it('HTMX writes get a 503 with an error toast and an empty body (form keeps its text)', async () => {
    const r = readOnlyResponse(req('POST', true));
    expect(r.status).toBe(503);
    expect(JSON.parse(r.headers.get('HX-Trigger')!)).toEqual({ toast: { type: 'error', message: READ_ONLY_MESSAGE } });
    expect(await r.text()).toBe('');
  });

  it('plain writes get a 503 HTML page', async () => {
    const r = readOnlyResponse(req('POST'));
    expect(r.status).toBe(503);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(await r.text()).toContain('Back in a few minutes');
  });

  it('reads read_only from settings', async () => {
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ value: '1' }) }) }) } } as any;
    expect(await isReadOnly(env)).toBe(true);
  });

  it('missing row means not frozen', async () => {
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } } as any;
    expect(await isReadOnly(env)).toBe(false);
  });
});
