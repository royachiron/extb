import type { AppContext } from '../types';
import {
  getUserByDisplayName,
  getUserById,
  getRecentTopicsByUser,
  getRecentPostsByUser,
  updateUserProfile,
  listRooms,
  listUsers,
  isBlocked,
  blockUser,
  unblockUser,
  countUserActivity,
  listBadgesForUser,
  listAllBadges,
  searchBadges,
  removeUserBadge,
  assignBadge,
  getBadgeById,
  listWarningsWithReplies,
  addWarningReply,
  resolveWarning,
  getWarningById,
} from '../db';
import {
  renderProfile,
  renderProfileEdit,
  renderWarningsTab,
} from '../views/profile';
import {
  renderUserDirectory,
} from '../views/users';
import { renderOnboarding } from '../views/auth';
import { requireMember, requireMod } from '../middleware';
import { esc, renderLayout } from '../views/layout';
import { isMod } from '../access';

import { html, redirect as httpRedirect } from '../lib/http';

// users.ts historically replies 302 Found, not 303 - preserved exactly.
const redirect = (location: string): Response => httpRedirect(location, 302);

export async function getProfile(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const displayName = params.name ?? '';
  let profileUser = await getUserByDisplayName(ctx.env, displayName);
  
  if (!profileUser && displayName.startsWith('user')) {
    const fallbackId = parseInt(displayName.slice(4), 10);
    if (!isNaN(fallbackId)) {
      profileUser = await getUserById(ctx.env, fallbackId);
    }
  }

  if (!profileUser) return html('<h1>404</h1>', 404);

  const [rooms, topics, posts, counts, badges] = await Promise.all([
    listRooms(ctx.env),
    getRecentTopicsByUser(ctx.env, profileUser.id, 10, ctx.user?.id),
    getRecentPostsByUser(ctx.env, profileUser.id, 10, ctx.user?.id),
    countUserActivity(ctx.env, profileUser.id, ctx.user?.id),
    listBadgesForUser(ctx.env, profileUser.id),
  ]);

  let blocked = false;
  if (ctx.user) {
    blocked = await isBlocked(ctx.env, ctx.user.id, profileUser.id);
  }


  const body = renderProfile({
    user: ctx.user,
    rooms,
    profileUser: { ...profileUser, is_blocked: blocked } as any,
    recentTopics: topics,
    recentPosts: posts,
    counts,
    badges,
    csrfToken: ctx.csrfToken,
  });

  if (req.headers.get('hx-request') === 'true') {
    return html(body);
  }

  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user: ctx.user,
      rooms,
      activeRoomSlug: 'members',
      title: profileUser.display_name || 'Profile',
      body,
      csrfToken: ctx.csrfToken,
      noindex: true,
      showFab: false,
    }),
  );
}

export async function getProfileEdit(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const [rooms, userBadges, allBadges] = await Promise.all([
    listRooms(ctx.env),
    listBadgesForUser(ctx.env, user.id),
    listAllBadges(ctx.env),
  ]);
  const body = renderProfileEdit({ user, csrfToken: ctx.csrfToken, userBadges, allBadges });
  if (req.headers.get('hx-request') === 'true') return html(body);

  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user: ctx.user,
      rooms,
      activeRoomSlug: 'members',
      title: 'Edit Profile',
      body,
      csrfToken: ctx.csrfToken,
      showFab: false,
    }),
  );
}

export async function getBadgeSearch(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').slice(0, 64);
  const [results, userBadges] = await Promise.all([
    searchBadges(ctx.env, q, 12),
    listBadgesForUser(ctx.env, user.id),
  ]);
  const { renderBadgeSearchResults } = await import('../views/profile');
  return html(renderBadgeSearchResults({ results, userBadges, csrfToken: ctx.csrfToken }));
}

export async function postAddBadge(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const form = await req.formData();
  const badgeId = parseInt((form.get('badge_id') as string) || '0', 10);
  const status = (form.get('status') as string) === 'need' ? 'need' : 'have';
  if (!badgeId) return html('Bad request', 400);
  const badge = await getBadgeById(ctx.env, badgeId);
  if (!badge) return html('Badge not found', 404);
  await assignBadge(ctx.env, user.id, badgeId, status);
  const userBadges = await listBadgesForUser(ctx.env, user.id);
  const { renderAssignedBadgeList } = await import('../views/profile');
  return html(renderAssignedBadgeList({ userBadges, csrfToken: ctx.csrfToken }));
}

export async function postRemoveBadge(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const form = await req.formData();
  const badgeId = parseInt((form.get('badge_id') as string) || '0', 10);
  if (!badgeId) return html('Bad request', 400);
  await removeUserBadge(ctx.env, user.id, badgeId);
  const userBadges = await listBadgesForUser(ctx.env, user.id);
  const { renderAssignedBadgeList } = await import('../views/profile');
  return html(renderAssignedBadgeList({ userBadges, csrfToken: ctx.csrfToken }));
}

export async function postProfileUpdate(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const form = await req.formData();
  const bio = (form.get('bio') as string || '').trim().slice(0, 500) || null;
  const color = user.avatar_color || '#6366f1';
  const timezone = (form.get('timezone') as string || 'UTC').trim().slice(0, 32);
  const pronouns = (form.get('pronouns') as string || '').trim().slice(0, 20) || null;
  const twitter = (form.get('twitter_url') as string || '').trim().slice(0, 100) || null;
  const website = (form.get('website_url') as string || '').trim().slice(0, 100) || null;
  const signature = (form.get('signature') as string || '').trim().slice(0, 300) || null;
  const avatarUrl = (form.get('avatar_url') as string || '').trim() || null;
  const hideActivity = form.get('hide_activity') === '1' ? 1 : 0;
  const hideBio = form.get('hide_bio') === '1' ? 1 : 0;
  const allowDms = form.get('allow_dms') === '1' ? 1 : 0;
  const coverImage = (form.get('cover_image') as string || '').trim() || null;
  const showNsfw: 0 | 1 = form.get('show_nsfw') === '1' ? 1 : 0;

  await updateUserProfile(ctx.env, user.id, user.display_name!, bio, color, timezone, pronouns, twitter, website, signature, hideActivity, hideBio, avatarUrl, allowDms, coverImage, showNsfw);

  // Bust the cold guest-cache entry for this profile so the edit shows up
  // before the 1h COLD TTL expires. Cache key must match the scheme in
  // src/index.ts: `${req.url}#${env.BUILD_ID}`.
  const profileUrl = `${new URL(req.url).origin}/u/${encodeURIComponent(user.display_name!)}`;
  const cacheKey = new Request(`${profileUrl}#${ctx.env.BUILD_ID}`, { method: 'GET' });
  await caches.default.delete(cacheKey);

  const target = `/u/${encodeURIComponent(user.display_name!)}`;
  if (req.headers.get('hx-request') === 'true') {
    return new Response(null, {
      status: 200,
      headers: {
        'HX-Redirect': target,
        'HX-Trigger': JSON.stringify({ toast: { message: 'Profile saved.', type: 'success' } }),
      },
    });
  }
  return redirect(target);
}

export async function postProfileBlock(
  _req: Request,
  ctx: AppContext,
  params: Record<string, string>
): Promise<Response> {
  const user = requireMember(ctx);
  const targetName = params.name;
  if (!targetName) return html('Missing name', 400);

  let target = await getUserByDisplayName(ctx.env, targetName);
  if (!target && targetName.startsWith('user')) {
    const fallbackId = parseInt(targetName.slice(4), 10);
    if (!isNaN(fallbackId)) target = await getUserById(ctx.env, fallbackId);
  }

  if (!target) return html('Not found', 404);
  if (target.id === user.id) return html('Cannot block self', 400);

  const blocked = await isBlocked(ctx.env, user.id, target.id);
  if (blocked) {
    await unblockUser(ctx.env, user.id, target.id);
  } else {
    await blockUser(ctx.env, user.id, target.id);
  }

  // Return the updated button HTML
  const isNowBlocked = !blocked;
  return html(`
    <div id="profile-actions" style="display:flex; gap:12px;">
      ${(user.access_level === 'admin' || (target.allow_dms !== 0 && !isNowBlocked)) ? `<a href="/dms/new?to=${encodeURIComponent(target.display_name ?? '')}" class="btn">Message</a>` : ''}
      <button class="btn btn-secondary"
        hx-post="/u/${esc(target.display_name || `user${target.id}`)}/block"
        hx-target="#profile-actions"
        hx-swap="outerHTML">
        ${isNowBlocked ? 'Unblock' : 'Block'}
      </button>
    </div>
  `);
}

export async function getUsers(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  if (!ctx.user) return redirect("/login");
  if (ctx.user.is_banned) return redirect("/appeal");
  if (!ctx.user.is_approved) return redirect("/verify-sent");
  if (ctx.user.access_level !== "full" && ctx.user.access_level !== "mod" && ctx.user.access_level !== "admin") {
    const rooms = await listRooms(ctx.env);
    const body = renderOnboarding({ note: 'You clicked Members - that directory opens once your intro is approved.', noteIsUi: true });
    if (req.headers.get('hx-request') === 'true') return html(body);
    return html(
      renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
        user: ctx.user,
        rooms,
        activeRoomSlug: 'members',
        title: 'Members',
        body,
        csrfToken: ctx.csrfToken,
        showFab: false,
      }),
    );
  }
  const q = new URL(req.url).searchParams.get('q') || undefined;
  const [rooms, users] = await Promise.all([
    listRooms(ctx.env),
    listUsers(ctx.env, 100, 0, q),
  ]);

  const body = renderUserDirectory({ user: ctx.user, rooms, users, q, csrfToken: ctx.csrfToken });
  if (req.headers.get('hx-request') === 'true') {
    return html(body);
  }

  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user: ctx.user,
      rooms,
      activeRoomSlug: 'members',
      title: 'Member Directory',
      body,
      csrfToken: ctx.csrfToken,
      showFab: false,
    }),
  );
}

export async function getSettingsWarnings(
  req: Request,
  ctx: AppContext,
  _params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const [rooms, warnings] = await Promise.all([
    listRooms(ctx.env),
    listWarningsWithReplies(ctx.env, user.id),
  ]);
  const body = renderWarningsTab({ user, warnings, csrfToken: ctx.csrfToken });
  if (req.headers.get('hx-request') === 'true') return html(body);
  return html(
    renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA,
      user: ctx.user,
      rooms,
      activeRoomSlug: 'members',
      title: 'Warnings',
      body,
      csrfToken: ctx.csrfToken,
      showFab: false,
    }),
  );
}

export async function postWarningReply(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  const user = requireMember(ctx);
  const warningId = parseInt(params.id ?? '', 10);
  if (!warningId) return html('Bad request', 400);

  const warning = await getWarningById(ctx.env, warningId);
  if (!warning) return html('Not found', 404);
  if (warning.user_id !== user.id) return html('Forbidden', 403);
  if (warning.resolved_at) return html('Warning is resolved', 400);

  // Gate: user can only reply if no replies yet, or last reply was from mod (not the user)
  const existing = await listWarningsWithReplies(ctx.env, user.id);
  const w = existing.find(x => x.id === warningId);
  if (w && w.replies.length > 0) {
    const lastReply = w.replies[w.replies.length - 1] ?? null;
    if (lastReply && lastReply.user_id === user.id) {
      return html('Already replied - awaiting moderator response', 400);
    }
  }

  const form = await req.formData();
  const content = (form.get('content') as string || '').trim().slice(0, 1000);
  if (!content) return html('Reply content required', 400);

  await addWarningReply(ctx.env, warningId, user.id, content);
  return redirect('/settings/warnings');
}

export async function postWarningResolve(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  requireMod(ctx);
  const warningId = parseInt(params.id ?? '', 10);
  if (!warningId) return html('Bad request', 400);

  const warning = await getWarningById(ctx.env, warningId);
  if (!warning) return html('Not found', 404);

  const form = await req.formData();
  const memo = (form.get('resolve_memo') as string || '').trim().slice(0, 500);

  await resolveWarning(ctx.env, warningId, ctx.user!.id, memo);

  const isHtmx = req.headers.get('hx-request') === 'true';
  if (isHtmx) {
    return new Response(null, { status: 204, headers: { 'HX-Refresh': 'true' } });
  }
  return redirect('/mod');
}
