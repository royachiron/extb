import { AppContext } from '../types';
import { embedLinks } from '../views/post';
import { renderMarkdown } from '../lib/markdown';
import { checkRateLimit } from '../lib/rate-limit';
import { requireMember } from '../middleware';

const RENDER_RATE_MAX = 60;
const RENDER_RATE_WINDOW_MS = 60_000;
const RENDER_CONTENT_MAX = 20_000;

export async function postRenderMd(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  let user: ReturnType<typeof requireMember>;
  try {
    user = requireMember(ctx);
  } catch (error) {
    if (!(error instanceof Response) || error.status !== 302) throw error;
    const signedOut = error.headers.get('Location') === '/login';
    return new Response(signedOut ? 'Authentication required' : 'Member access required', {
      status: signedOut ? 401 : 403,
    });
  }
  const limit = checkRateLimit(`render:user:${user.id}`, RENDER_RATE_MAX, RENDER_RATE_WINDOW_MS);
  if (!limit.ok) {
    return new Response('Too many preview requests. Please wait and try again.', {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (!body || typeof body !== 'object' || typeof (body as { content?: unknown }).content !== 'string') {
    return new Response('Content must be a string', { status: 400 });
  }

  const content = (body as { content: string }).content;
  if (content.length > RENDER_CONTENT_MAX) {
    return new Response('Content is too large', { status: 413 });
  }
  if (!content) return new Response('', { status: 200 });

  const cleanHtml = embedLinks(renderMarkdown(content));

  return new Response(cleanHtml, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
