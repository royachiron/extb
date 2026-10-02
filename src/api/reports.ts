import type { AppContext } from '../types';
import { requireMember } from '../middleware';
import { checkRateLimit } from '../lib/rate-limit';
import {
  createReport,
  countReportsByUserToday,
  getPostById,
  getTopicById,
  getUserById,
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
} from '../db';
import type { ReportReason, ReportTargetType } from '../db/reports';
import { renderReportForm, renderReportDone, renderReportNotice } from '../views/report';

const HTML = { 'content-type': 'text/html; charset=utf-8' };
const DAILY_REPORT_LIMIT = 10;

function isTargetType(v: string): v is ReportTargetType {
  return (REPORT_TARGET_TYPES as readonly string[]).includes(v);
}
function isReason(v: string): v is ReportReason {
  return (REPORT_REASONS as readonly string[]).includes(v);
}

/** GET /report/form?type=&id= - the inline form partial. */
export async function getReportForm(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  requireMember(ctx);
  const url = new URL(req.url);
  const type = url.searchParams.get('type') ?? '';
  const id = Number(url.searchParams.get('id') || 0);
  if (!isTargetType(type) || !id) return new Response('bad target', { status: 400 });
  return new Response(renderReportForm(type, id, ctx.csrfToken), { headers: HTML });
}

/** POST /report - validate, rate-limit, insert; respond with a swap partial. */
export async function postReport(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const form = await req.formData();
  const type = String(form.get('type') || '');
  const id = Number(form.get('id') || 0);
  const reason = String(form.get('reason') || '');
  const detail = String(form.get('detail') || '').trim().slice(0, 500) || null;

  if (!isTargetType(type) || !id) return new Response('bad target', { status: 400 });
  if (!isReason(reason)) return new Response('bad reason', { status: 400 });

  // Target must exist and must not be the reporter's own content/profile.
  let ownerId: number | null | undefined;
  if (type === 'post') {
    const post = await getPostById(ctx.env, id);
    if (!post) return new Response('not found', { status: 404 });
    ownerId = post.user_id;
  } else if (type === 'topic') {
    const topic = await getTopicById(ctx.env, id);
    if (!topic) return new Response('not found', { status: 404 });
    ownerId = topic.user_id;
  } else {
    const target = await getUserById(ctx.env, id);
    if (!target) return new Response('not found', { status: 404 });
    ownerId = target.id;
  }
  if (ownerId === user.id) {
    return new Response("You can't report your own content.", { status: 400 });
  }

  // Cheap per-isolate gate first, then the authoritative DB count.
  if (!checkRateLimit(`report:${user.id}`, DAILY_REPORT_LIMIT, 60_000).ok
    || (await countReportsByUserToday(ctx.env, user.id)) >= DAILY_REPORT_LIMIT) {
    return new Response(
      renderReportNotice("You've hit the daily report limit - if something urgent is happening, DM a moderator."),
      { headers: HTML },
    );
  }

  const outcome = await createReport(ctx.env, user.id, type, id, reason, detail);
  if (outcome === 'duplicate') {
    return new Response(
      renderReportNotice("You've already reported this - a moderator will review it."),
      { headers: HTML },
    );
  }
  return new Response(
    renderReportDone('Thanks. A moderator will review this.'),
    { headers: HTML },
  );
}
