import { describe, it, expect } from 'vitest';
// Node < 23 has no global URLPattern; workerd does. Test-only polyfill.
import 'urlpattern-polyfill';
import { dispatch, type Route } from '../src/router';
import type { AppContext } from '../src/types';

const ctx = { env: {} as any, user: null, cookies: [] } as AppContext;

function route(method: string, pathname: string, body: string): Route {
  return {
    method,
    pattern: new URLPattern({ pathname }),
    handler: async (_req, _ctx, params) =>
      new Response(body + ':' + JSON.stringify(params))
  };
}

describe('dispatch', () => {
  it('matches first route by method+pattern and passes params', async () => {
    const routes: Route[] = [
      route('GET', '/r/:slug', 'room'),
      route('GET', '/u/:name', 'user')
    ];
    const res = await dispatch(new Request('https://x/r/general'), ctx, routes);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('room:{"slug":"general"}');
  });

  it('returns 404 when no path matches', async () => {
    const routes: Route[] = [route('GET', '/r/:slug', 'room')];
    const res = await dispatch(new Request('https://x/nope'), ctx, routes);
    expect(res.status).toBe(404);
  });

  it('returns 405 when path matches but method does not', async () => {
    const routes: Route[] = [route('GET', '/r/:slug', 'room')];
    const res = await dispatch(
      new Request('https://x/r/general', { method: 'POST' }),
      ctx,
      routes
    );
    expect(res.status).toBe(405);
  });

  it('matches the first of multiple same-path routes', async () => {
    const routes: Route[] = [
      route('GET', '/x', 'first'),
      route('GET', '/x', 'second')
    ];
    const res = await dispatch(new Request('https://x/x'), ctx, routes);
    expect(await res.text()).toBe('first:{}');
  });
});
