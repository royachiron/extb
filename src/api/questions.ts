import type { Env, AppContext, Room } from '../types';
import {
  getRoomBySlug,
  listRooms,
  getTopicById,
  createTopic,
  createPost,
  setTopicStatus,
  setPostStatus,
  listFeedTopics,
  listFeedTopicsForMod,
} from '../db';
import { isMod, canRead, canPost } from '../access';
import { renderQuestionsIndex } from '../views/questions';
import { renderLayout } from '../views/layout';

import { verifyTurnstile } from '../lib/turnstile';

// ---- Helpers ------------------------------------------------------------

async function loadQuestionsRoom(env: Env, userId?: number): Promise<Room> {
  const room = await getRoomBySlug(env, 'questions', userId);
  if (!room) throw new Error('questions room not seeded');
  return room;
}

import { html, redirect } from '../lib/http';

// ---- Index --------------------------------------------------------------

export async function getQuestionsIndex(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const url = new URL(req.url);
  const submitted = url.searchParams.get('submitted') === '1';
  const room = await loadQuestionsRoom(ctx.env, ctx.user?.id);
  if (!canRead(ctx.user, room)) return html('forbidden', 403);
  const rooms = await listRooms(ctx.env, ctx.user?.id);
  const mod = isMod(ctx.user);
  const topics = mod
    ? await listFeedTopicsForMod(ctx.env, room.id, 100, 0)
    : await listFeedTopics(ctx.env, room.id, 100, 0);
  const body = renderQuestionsIndex({
    user: ctx.user,
    rooms,
    questionsRoom: room,
    topics,
    submitted,
    siteKey: ctx.env.TURNSTILE_SITE_KEY,
    csrfToken: ctx.csrfToken,
  });

  if (req.headers.get('hx-request') === 'true') {
    return html(body);
  }

  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user: ctx.user,
      rooms,
      activeRoomSlug: 'questions',
      title: 'Questions & Answers',
      description: 'Ask questions and share answers with your community.',
      body,
      csrfToken: ctx.csrfToken,
      canonicalUrl: '/questions',
    }),
  );
}

// ---- Thread -------------------------------------------------------------

export async function getQuestionThread(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const room = await loadQuestionsRoom(ctx.env, ctx.user?.id);
  if (!canRead(ctx.user, room)) return html('forbidden', 403);
  const topicId = Number(params.id);
  if (!Number.isFinite(topicId)) return new Response('not found', { status: 404 });
  const topic = await getTopicById(ctx.env, topicId);
  if (!topic || topic.room_id !== room.id || topic.deleted_at) {
    return new Response('not found', { status: 404 });
  }
  return redirect(`/t/${topic.short_id}`, 301);
}

// ---- Anon submit (new question) ----------------------------------------

export async function postQuestion(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>
): Promise<Response> {
  const form = await req.formData();
  const title = String(form.get('title') ?? '').trim();
  const content = String(form.get('content') ?? '').trim();
  const anonName = String(form.get('anon_name') ?? '').trim() || 'anonymous';
  const token = String(form.get('cf-turnstile-response') ?? '');
  const ip = req.headers.get('cf-connecting-ip');

  if (!title || !content) {
    return new Response('title and content required', { status: 400 });
  }
  if (title.length > 200 || content.length > 10_000) {
    return new Response('too long', { status: 400 });
  }
  if (!(await verifyTurnstile(ctx.env, token, ip))) {
    return new Response('turnstile failed', { status: 403 });
  }

  const room = await loadQuestionsRoom(ctx.env, ctx.user?.id);
  if (!canPost(ctx.user, room)) return html('forbidden', 403);
  await createTopic(
    ctx.env,
    room.id,
    ctx.user?.id ?? null,
    ctx.user ? null : anonName,
    title,
    content,
    null,
    'pending'
  );

  return redirect('/questions?submitted=1');
}

// ---- Anon reply --------------------------------------------------------

export async function postQuestionReply(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const room = await loadQuestionsRoom(ctx.env, ctx.user?.id);
  if (!canRead(ctx.user, room)) return html('forbidden', 403);
  const topicId = Number(params.id);
  if (!Number.isFinite(topicId)) return new Response('not found', { status: 404 });
  const topic = await getTopicById(ctx.env, topicId);
  if (!topic || topic.room_id !== room.id || topic.deleted_at) {
    return new Response('not found', { status: 404 });
  }
  const mod = isMod(ctx.user);
  if (topic.status !== 'approved' && !mod) {
    return new Response('not found', { status: 404 });
  }
  if (topic.is_locked) return new Response('locked', { status: 403 });

  const form = await req.formData();
  const content = String(form.get('content') ?? '').trim();
  const anonName = String(form.get('anon_name') ?? '').trim() || 'anonymous';
  const token = String(form.get('cf-turnstile-response') ?? '');
  const ip = req.headers.get('cf-connecting-ip');

  if (!content) return new Response('content required', { status: 400 });
  if (content.length > 10_000) return new Response('too long', { status: 400 });
  if (!(await verifyTurnstile(ctx.env, token, ip))) {
    return new Response('turnstile failed', { status: 403 });
  }

  if (!canPost(ctx.user, room)) return html('forbidden', 403);
  await createPost(
    ctx.env,
    topicId,
    ctx.user?.id ?? null,
    ctx.user ? null : anonName,
    content,
    'pending'
  );

  return redirect(`/questions/${topicId}?submitted=1`);
}

// ---- Mod approve / reject ----------------------------------------------

export async function postQuestionApprove(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  if (!isMod(ctx.user)) return new Response('forbidden', { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return new Response('not found', { status: 404 });
  await setTopicStatus(ctx.env, id, 'approved');
  return redirect('/mod');
}

export async function postQuestionReject(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  if (!isMod(ctx.user)) return new Response('forbidden', { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return new Response('not found', { status: 404 });
  await setTopicStatus(ctx.env, id, 'rejected');
  return redirect('/mod');
}

export async function postQuestionPostApprove(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  if (!isMod(ctx.user)) return new Response('forbidden', { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return new Response('not found', { status: 404 });
  await setPostStatus(ctx.env, id, 'approved');
  return redirect('/mod');
}

export async function postQuestionPostReject(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  if (!isMod(ctx.user)) return new Response('forbidden', { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id)) return new Response('not found', { status: 404 });
  await setPostStatus(ctx.env, id, 'rejected');
  return redirect('/mod');
}
