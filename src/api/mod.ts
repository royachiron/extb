import type { AppContext } from '../types';
import { requireMod } from '../middleware';
import {
  setTopicStatus,
  setPostStatus,
  getTopicById,
  moveTopic,
  getUserById,
  removeTopic,
  setUserAccess,
  appendModNote,
  createModLog,
  getBanAppealById,
  resolveBanAppeal,
  setUserBanned,
  getWarningById,
  addWarningReply,
  resolveReport,
  insertWarningReplyNotification,
} from '../db';
const redirect = (loc: string): Response =>
  new Response(null, { status: 303, headers: { Location: loc } });

export async function postApproveQuestion(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const form = await req.formData();
  const kind = String(form.get('kind') || '');
  const id = Number(form.get('id') || 0);
  if (!id) return new Response('bad id', { status: 400 });
  if (kind === 'topic') {
    const t = await (await import('../db')).getTopicById(ctx.env, id); if (t && t.delete_on_approve === 1) { await (await import('../db')).removeTopic(ctx.env, id, user.id); } else { await setTopicStatus(ctx.env, id, 'approved'); }
    await createModLog(ctx.env, user.id, 'approve_question_topic', 'topic', id, null);
  } else if (kind === 'post') {
    await setPostStatus(ctx.env, id, 'approved');
    await createModLog(ctx.env, user.id, 'approve_question_post', 'post', id, null);
  } else return new Response('bad kind', { status: 400 });
  return redirect('/admin?section=moderation&tab=queue');
}

export async function postRejectQuestion(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const user = requireMod(ctx);
  const form = await req.formData();
  const kind = String(form.get('kind') || '');
  const id = Number(form.get('id') || 0);
  if (!id) return new Response('bad id', { status: 400 });
  if (kind === 'topic') {
    await setTopicStatus(ctx.env, id, 'rejected');
    await createModLog(ctx.env, user.id, 'reject_question_topic', 'topic', id, null);
  } else if (kind === 'post') {
    await setPostStatus(ctx.env, id, 'rejected');
    await createModLog(ctx.env, user.id, 'reject_question_post', 'post', id, null);
  } else return new Response('bad kind', { status: 400 });
  return redirect('/admin?section=moderation&tab=queue');
}

export async function postResolveAppeal(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const mod = requireMod(ctx);
  const form = await req.formData();
  const id = Number(form.get('id') || 0);
  const action = String(form.get('action') || '');
  const modNote = String(form.get('mod_note') || '').trim();

  if (!id) return new Response('bad id', { status: 400 });
  const appeal = await getBanAppealById(ctx.env, id);
  if (!appeal || appeal.status !== 'pending') return redirect('/admin?section=moderation&tab=queue');

  if (action === 'approve') {
    await resolveBanAppeal(ctx.env, id, 'approved', mod.id, modNote);
    await setUserBanned(ctx.env, appeal.user_id, 0);
    await createModLog(ctx.env, mod.id, 'approve_appeal', 'user', appeal.user_id, `Appeal #${id}. Note: ${modNote}`);
  } else if (action === 'reject') {
    await resolveBanAppeal(ctx.env, id, 'rejected', mod.id, modNote);
    await createModLog(ctx.env, mod.id, 'reject_appeal', 'user', appeal.user_id, `Appeal #${id}. Note: ${modNote}`);
  } else {
    return new Response('bad action', { status: 400 });
  }

  return redirect('/admin?section=moderation&tab=queue');
}

export async function postAppendModNote(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  requireMod(ctx);
  const form = await req.formData();
  const user_id = Number(form.get('user_id') || 0);
  const addition = String(form.get('note_addition') || '').trim();
  if (!user_id || !addition) return new Response('bad input', { status: 400 });

  await appendModNote(ctx.env, user_id, addition);

  const back = req.headers.get('referer') || '/admin?section=moderation&tab=queue';
  return redirect(back);
}

export async function postModWarningReply(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const mod = requireMod(ctx);
  const warningId = parseInt(params.id ?? '', 10);
  if (!warningId) return new Response('bad id', { status: 400 });

  const warning = await getWarningById(ctx.env, warningId);
  if (!warning) return new Response('not found', { status: 404 });
  if (warning.resolved_at) return new Response('warning resolved', { status: 400 });

  const form = await req.formData();
  const content = String(form.get('content') || '').trim().slice(0, 1000);
  if (!content) return new Response('reply content required', { status: 400 });
  const hideAuthor: 0 | 1 = form.get('hide_author') === '1' ? 1 : 0;

  await addWarningReply(ctx.env, warningId, mod.id, content, hideAuthor);
  try {
    await insertWarningReplyNotification(ctx.env, warning.user_id, 'A moderator replied to your warning.', '/settings/warnings');
  } catch (_) {}

  return redirect('/admin?section=moderation&tab=warnings');
}

export async function postResolveReport(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const mod = requireMod(ctx);
  const reportId = parseInt(params.id ?? '', 10);
  if (!reportId) return new Response('bad id', { status: 400 });

  const form = await req.formData();
  const action = String(form.get('action') || '');
  if (action !== 'resolve' && action !== 'dismiss') return new Response('bad action', { status: 400 });
  const note = String(form.get('note') || '').trim().slice(0, 500) || null;

  await resolveReport(ctx.env, reportId, mod.id, action === 'resolve' ? 'resolved' : 'dismissed', note);
  try {
    await createModLog(ctx.env, mod.id, `${action}_report`, 'report', reportId, note);
  } catch (_) {}

  // HTMX targets the report card with outerHTML swap - empty body removes it.
  if (req.headers.get('hx-request') === 'true') return new Response('', { status: 200 });
  return redirect('/admin?section=moderation&tab=reports');
}

export async function postMoveTopic(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const mod = requireMod(ctx);
  const form = await req.formData();
  const topicId = Number(form.get('topic_id') || 0);
  const newRoomId = Number(form.get('room_id') || 0);
  if (!topicId || !newRoomId) return new Response('bad params', { status: 400 });

  const topic = await getTopicById(ctx.env, topicId);
  if (!topic) return new Response('topic not found', { status: 404 });

  await moveTopic(ctx.env, topicId, newRoomId);
  await createModLog(ctx.env, mod.id, 'move_topic', 'topic', topicId, `Moved from room ${topic.room_id} to ${newRoomId}`);

  return new Response(null, { status: 204, headers: { 'HX-Refresh': 'true' } });
}
