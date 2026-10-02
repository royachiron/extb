import type { AppContext } from './types';

export type RouteHandler = (
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
) => Promise<Response>;

export type Route = {
  method: string;
  pattern: URLPattern;
  handler: RouteHandler;
};

export async function dispatch(
  req: Request,
  ctx: AppContext,
  routes: Route[]
): Promise<Response> {
  let pathMatched = false;
  for (const route of routes) {
    const match = route.pattern.exec(req.url);
    if (!match) continue;
    pathMatched = true;
    if (route.method !== req.method) continue;
    const groups = match.pathname.groups as Record<string, string | undefined>;
    const params: Record<string, string> = {};
    for (const key in groups) {
      const v = groups[key];
      if (typeof v === 'string') params[key] = v;
    }
    return route.handler(req, ctx, params);
  }
  if (pathMatched) {
    return new Response('Method Not Allowed', { status: 405 });
  }
  return new Response('Not Found', { status: 404 });
}
