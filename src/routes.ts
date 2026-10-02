import { showAdminTokens, createAdminToken, revokeAdminToken } from './api/admin-tokens';
import { getInvitations, createInvitationPage, createResetPage } from './api/invitations';
import { renderLayout, htmlResponse } from './views/layout';
import { listRooms } from './db';
import { getSetup, postSetup, postCreateInvite, postCreateResetLink } from './api/setup';
import { postBranding } from './api/admin/settings';
import type { Route } from './router';
import {
  getAdminPanel,
  postSetting,
  postCreateRoom,
  postUpdateRoom,
  postDeleteRoom,
  postSetUserAccess,
  postSetUserBanned,
  postDeleteUser,
  getAdminUserEdit,
  postUpdateUser,
  postEditModNote,
  postCreateBadge,
  postUpdateBadge,
  postDeleteBadge,
  postAssignBadge,
  postAdminBadgeAssign,
  postAdminBadgeRemove,
  postSetUserReview,
  postSaltMigrationBlast,
  postCreateCwTag,
  postUpdateCwTag,
  postDeleteCwTag,
  postSetContentCwTags,
  postReviewerNotes,
} from './api/admin';
import {
  postRegister,
  postResendVerification,
  getVerify,
  postLogin,
  postLogout,
  postResetRequest,
  postReset,
  getOnboarding,
  postProfileSetup,
  getAppeal,
  postAppeal,
  postAcceptTos,
  isRegistrationOpen,
} from './api/auth';
import {
  renderRegister,
  renderRegistrationClosed,
  renderLogin,
  renderVerifySent,
  renderResetRequest,
  renderResetForm,
  renderProfileSetup,
  renderAppeal,
} from './views/auth';
import { getSearch } from './api/search';
import { getChat, getChatMessagesApi, postChatMessageApi, postDeleteChatMessageApi, handleChatWebSocket, getChatUserMenu } from './api/chat';
import { getBotPage, getBotPanel } from './api/bot';
import { getHeartbeat } from './api/heartbeat';
import {
  getStaticPage, getRobotsTxt, getSitemapXml,
  getManifest, getServiceWorker, getFavicon,
  getTos,
} from './api/static';
import { 
  getRoomsList, getRoomAccess, postRoomAccessToggle, 
  postRoomUserAccess, deleteRoomUserAccess 
} from './api/rooms';
import { postRenderMd } from './api/utils';
import { getUnfurl } from './api/unfurls';
import { postUpload, getMedia } from './api/media';
import {
  getFeed,
  getForumIndex,
  getNeedsYou,
  getTopic,
  getTopicPosts,
  postTopic,
  getEditTopicForm,
  postUpdateTopic,
  getNewTopic,
  getNewTopicForm,
  postFollowTopic,
  postUnfollowTopic,
  postPollVote,
  markRead,
} from './api/topics';
import {
  postSoftDeleteTopic,
  postRestoreTopic,
  postRemoveTopic,
  postPinTopic,
  postLockTopic,
  postToggleTopicReview,
  postMoveTopic,
  postWarnTopic,
} from './api/topics-mod';
import { postPost, getEditPostForm, postUpdatePost, postSoftDeletePost, postRestorePost, postRemovePost, getReplyPostForm, postReactApi, postBatchDeletePosts, postArchivePost, postUnarchivePost, postWarnPost } from './api/posts';
import {
  getQuestionThread,
  postQuestion,
  postQuestionReply,
  postQuestionApprove,
  postQuestionReject,
  postQuestionPostApprove,
  postQuestionPostReject,
} from './api/questions';
import {
  getProfile,
  getProfileEdit,
  postProfileUpdate,
  postProfileBlock,
  getUsers,
  getSettingsWarnings,
  postWarningReply,
  postWarningResolve,
  getBadgeSearch,
  postAddBadge,
  postRemoveBadge,
} from './api/users';
import {
  getConversations,
  getConversationsPage,
  getNewDm,
  getThread,
  getThreadMessages,
  getThreadOlder,
  postDm,
} from './api/dms';
import { postPushSubscribe } from './api/push';
import {
  getNotifications,
  getNotificationsPage,
  getNotificationsPagePartial,
  postReadAllNotifications,
} from './api/notifications';
import { renderDesignSystem } from './views/design-system';

import {
  postResolveReport,
  postModWarningReply,
  postApproveQuestion,
  postRejectQuestion,
  postAppendModNote,
  postResolveAppeal,
} from './api/mod';
import { getReportForm, postReport } from './api/reports';

const p = (pathname: string) => new URLPattern({ pathname });

export const routes: Route[] = [
  // Setup
  { method: 'GET', pattern: p('/setup'), handler: getSetup },
  { method: 'POST', pattern: p('/setup'), handler: postSetup },
  { method: 'POST', pattern: p('/admin/reset-link'), handler: createResetPage },
  { method: 'POST', pattern: p('/admin/invites'), handler: createInvitationPage },
  { method: 'POST', pattern: p('/admin/users/:id/reset-link'), handler: createResetPage },
  { method: 'POST', pattern: p('/admin/branding'), handler: postBranding },

  { method: 'GET', pattern: p('/admin/invitations'), handler: getInvitations },
  { method: 'GET', pattern: p('/admin/tokens'), handler: showAdminTokens },
  { method: 'POST', pattern: p('/admin/tokens'), handler: createAdminToken },
  { method: 'POST', pattern: p('/admin/tokens/:id/revoke'), handler: revokeAdminToken },

  // Auth
  {
    method: 'GET',
    pattern: p('/register'),
    handler: async (req, ctx) => {
      const open = await isRegistrationOpen(ctx.env);
      const invite = new URL(req.url).searchParams.get('invite') || '';
      const body = (open || invite) ? renderRegister({ csrfToken: ctx.csrfToken, siteKey: ctx.env.TURNSTILE_SITE_KEY, invite, emailEnabled: !!ctx.env.BREVO_API_KEY }) : renderRegistrationClosed();
      if (req.headers.get('hx-request') === 'true') return htmlResponse(body);
      const rooms = await listRooms(ctx.env);
      return htmlResponse(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Register', body, csrfToken: ctx.csrfToken }));
    }
  },
  { method: 'POST', pattern: p('/register'), handler: postRegister },
  {
    method: 'GET',
    pattern: p('/login'),
    handler: async (req, ctx) => {
      const body = renderLogin({ csrfToken: ctx.csrfToken, siteKey: ctx.env.TURNSTILE_SITE_KEY });
      if (req.headers.get('hx-request') === 'true') return htmlResponse(body);
      const rooms = await listRooms(ctx.env);
      return htmlResponse(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Log in', body, csrfToken: ctx.csrfToken }));
    }
  },
  { method: 'POST', pattern: p('/login'), handler: postLogin },
  { method: 'POST', pattern: p('/logout'), handler: postLogout },
  {
    method: 'GET',
    pattern: p('/verify-sent'),
    handler: async (req, ctx) => {
      const email = new URL(req.url).searchParams.get('email') ?? '';
      const body = renderVerifySent({ email, csrfToken: ctx.csrfToken, siteKey: ctx.env.TURNSTILE_SITE_KEY });
      if (req.headers.get('hx-request') === 'true') return htmlResponse(body);
      const rooms = await listRooms(ctx.env);
      return htmlResponse(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Check email', body, csrfToken: ctx.csrfToken }));
    }
  },
  { method: 'POST', pattern: p('/resend-verification'), handler: postResendVerification },
  { method: 'GET', pattern: p('/verify'), handler: getVerify },
  {
    method: 'GET',
    pattern: p('/reset'),
    handler: async (req, ctx) => {
      const body = renderResetRequest({ csrfToken: ctx.csrfToken, siteKey: ctx.env.TURNSTILE_SITE_KEY });
      if (req.headers.get('hx-request') === 'true') return htmlResponse(body);
      const rooms = await listRooms(ctx.env);
      return htmlResponse(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Reset password', body, csrfToken: ctx.csrfToken }));
    }
  },
  { method: 'GET', pattern: p('/onboarding'), handler: getOnboarding },
  { method: 'POST', pattern: p('/reset-request'), handler: postResetRequest },
  {
    method: 'GET',
    pattern: p('/reset/:token'),
    handler: async (req, ctx, params) => {
      const body = renderResetForm(params.token ?? '', undefined, ctx.csrfToken);
      if (req.headers.get('hx-request') === 'true') return htmlResponse(body);
      const rooms = await listRooms(ctx.env);
      return htmlResponse(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Choose password', body, csrfToken: ctx.csrfToken }));
    }
  },
  { method: 'POST', pattern: p('/reset'), handler: postReset },
  {
    method: 'GET',
    pattern: p('/profile-setup'),
    handler: async (req, ctx) => {
      if (!ctx.user) return new Response(null, { status: 302, headers: { Location: '/login' } });
      const { listBadgesForUser, listAllBadges } = await import('./db');
      const [userBadges, allBadges] = await Promise.all([
        listBadgesForUser(ctx.env, ctx.user.id),
        listAllBadges(ctx.env),
      ]);
      const body = renderProfileSetup({ user: ctx.user, csrfToken: ctx.csrfToken, userBadges, allBadges });
      if (req.headers.get('hx-request') === 'true') return htmlResponse(body);
      const rooms = await listRooms(ctx.env);
      return htmlResponse(renderLayout({ branding: ctx.branding, origin: ctx.origin, uploadsEnabled: !!ctx.env.MEDIA, user: ctx.user, rooms, title: 'Set up profile', body, csrfToken: ctx.csrfToken }));
    },
  },
  { method: 'POST', pattern: p('/profile-setup'), handler: postProfileSetup },
  { method: 'GET', pattern: p('/appeal'), handler: getAppeal },
  { method: 'POST', pattern: p('/appeal'), handler: postAppeal },

  // Rooms API
  { method: 'GET', pattern: p('/api/rooms'), handler: getRoomsList },
  { method: 'GET', pattern: p('/r/:slug/access'), handler: getRoomAccess },
  { method: 'POST', pattern: p('/r/:slug/access/toggle'), handler: postRoomAccessToggle },
  { method: 'POST', pattern: p('/r/:slug/access/user'), handler: postRoomUserAccess },
  { method: 'DELETE', pattern: p('/r/:slug/access/user/:id'), handler: deleteRoomUserAccess },

  // Utility
  { method: 'POST', pattern: p('/api/render'), handler: postRenderMd },
  { method: 'GET', pattern: p('/api/unfurl'), handler: getUnfurl },
  { method: 'POST', pattern: p('/api/upload'), handler: postUpload },
  { method: 'GET', pattern: p('/media/:id'), handler: getMedia },

  // Topics / posts (forum)
  { method: 'GET', pattern: p('/post'), handler: getNewTopic },
  { method: 'GET', pattern: p('/new'), handler: getNewTopicForm },
  { method: 'GET', pattern: p('/t/:id'), handler: getTopic },
  { method: 'GET', pattern: p('/t/:id/posts'), handler: getTopicPosts },
  { method: 'GET', pattern: p('/t/:id/edit'), handler: getEditTopicForm },
  { method: 'POST', pattern: p('/topics'), handler: postTopic },
  { method: 'POST', pattern: p('/t/:id/edit'), handler: postUpdateTopic },
  { method: 'POST', pattern: p('/t/:id/delete'), handler: postSoftDeleteTopic },
  { method: 'POST', pattern: p('/t/:id/restore'), handler: postRestoreTopic },
  { method: 'POST', pattern: p('/t/:id/remove'), handler: postRemoveTopic },
  { method: 'POST', pattern: p('/t/:id/pin'), handler: postPinTopic },
  { method: 'POST', pattern: p('/t/:id/lock'), handler: postLockTopic },
  { method: 'POST', pattern: p('/t/:id/review'), handler: postToggleTopicReview },
  { method: 'POST', pattern: p('/t/:id/follow'), handler: postFollowTopic },
  { method: 'POST', pattern: p('/t/:id/unfollow'), handler: postUnfollowTopic },
  { method: 'POST', pattern: p('/t/:id/poll/vote'), handler: postPollVote },
  { method: 'POST', pattern: p('/t/:id/warn'), handler: postWarnTopic },
  { method: 'POST', pattern: p('/threads/mark-read'), handler: markRead },
  { method: 'POST', pattern: p('/posts'), handler: postPost },
  { method: 'GET', pattern: p('/p/:id/edit'), handler: getEditPostForm },
  { method: 'GET', pattern: p('/p/:id/reply'), handler: getReplyPostForm },
  { method: 'POST', pattern: p('/p/:id/edit'), handler: postUpdatePost },
  { method: 'POST', pattern: p('/p/:id/delete'), handler: postSoftDeletePost },
  { method: 'POST', pattern: p('/p/:id/restore'), handler: postRestorePost },
  { method: 'POST', pattern: p('/p/:id/remove'), handler: postRemovePost },
  { method: 'POST', pattern: p('/p/:id/archive'), handler: postArchivePost },
  { method: 'POST', pattern: p('/p/:id/warn'), handler: postWarnPost },
  { method: 'POST', pattern: p('/p/:id/unarchive'), handler: postUnarchivePost },
  { method: 'POST', pattern: p('/p/:id/react'), handler: postReactApi },
  { method: 'POST', pattern: p('/t/:id/posts/batch-delete'), handler: postBatchDeletePosts },

  // Questions (legacy redirects + mod actions)
  { method: 'GET', pattern: p('/questions'), handler: (_req, _ctx, _p) => Promise.resolve(new Response(null, { status: 301, headers: { Location: '/about/community' } })) },
  { method: 'GET', pattern: p('/questions/:id'), handler: getQuestionThread },
  { method: 'POST', pattern: p('/questions/submit'), handler: postQuestion },
  { method: 'POST', pattern: p('/questions/:id/reply'), handler: postQuestionReply },
  { method: 'POST', pattern: p('/questions/:id/approve'), handler: postQuestionApprove },
  { method: 'POST', pattern: p('/questions/:id/reject'), handler: postQuestionReject },
  { method: 'POST', pattern: p('/questions/post/:id/approve'), handler: postQuestionPostApprove },
  { method: 'POST', pattern: p('/questions/post/:id/reject'), handler: postQuestionPostReject },


  // Chat
  { method: 'GET', pattern: p('/chat'), handler: getChat },
  { method: 'GET', pattern: p('/chat/messages'), handler: getChatMessagesApi },
  { method: 'POST', pattern: p('/chat/messages'), handler: postChatMessageApi },
  { method: 'POST', pattern: p('/chat/messages/:id/delete'), handler: postDeleteChatMessageApi },
  { method: 'GET', pattern: p('/chat/ws'), handler: handleChatWebSocket },
  { method: 'GET', pattern: p('/chat/user/:name'), handler: getChatUserMenu },

  // Engagement bot (deterministic dialogue tree; see engage.md)
  { method: 'GET', pattern: p('/bot'), handler: getBotPage },
  { method: 'GET', pattern: p('/bot/panel'), handler: getBotPanel },

  // Users / profile
  { method: 'GET', pattern: p('/u/:name'), handler: getProfile },
  { method: 'GET', pattern: p('/users'), handler: getUsers },
  { method: 'GET', pattern: p('/settings/profile'), handler: getProfileEdit },
  { method: 'POST', pattern: p('/settings/profile'), handler: postProfileUpdate },
  { method: 'GET', pattern: p('/settings/warnings'), handler: getSettingsWarnings },
  { method: 'GET', pattern: p('/api/badges/search'), handler: getBadgeSearch },
  { method: 'POST', pattern: p('/settings/badges/add'), handler: postAddBadge },
  { method: 'POST', pattern: p('/settings/badges/remove'), handler: postRemoveBadge },
  { method: 'POST', pattern: p('/u/:name/block'), handler: postProfileBlock },
  // Warning inbox actions
  { method: 'POST', pattern: p('/api/warnings/:id/reply'), handler: postWarningReply },
  { method: 'POST', pattern: p('/api/warnings/:id/resolve'), handler: postWarningResolve },

  // Push notifications
  { method: 'POST', pattern: p('/api/push/subscribe'), handler: postPushSubscribe },

  // DMs (specific /dms/new before /dms/:name). Paging routes live under
  // /api/dms/ so they cannot be shadowed by a member display name.
  { method: 'GET', pattern: p('/dms'), handler: getConversations },
  { method: 'GET', pattern: p('/dms/new'), handler: getNewDm },
  { method: 'GET', pattern: p('/dms/:name'), handler: getThread },
  { method: 'GET', pattern: p('/api/dms/page'), handler: getConversationsPage },
  { method: 'GET', pattern: p('/api/dms/:name/messages'), handler: getThreadMessages },
  { method: 'GET', pattern: p('/api/dms/:name/older'), handler: getThreadOlder },
  { method: 'POST', pattern: p('/dms'), handler: postDm },

  // Notifications
  { method: 'GET', pattern: p('/api/notifications'), handler: getNotifications },
  { method: 'GET', pattern: p('/notifications'), handler: getNotificationsPage },
  { method: 'GET', pattern: p('/notifications/page'), handler: getNotificationsPagePartial },
  { method: 'POST', pattern: p('/api/notifications/read-all'), handler: postReadAllNotifications },

  // Heartbeat - one visibility-gated poll feeding all nav badges + presence
  { method: 'GET', pattern: p('/api/heartbeat'), handler: getHeartbeat },

  // Search
  { method: 'GET', pattern: p('/search'), handler: getSearch },

  // Member reports
  { method: 'GET', pattern: p('/report/form'), handler: getReportForm },
  { method: 'POST', pattern: p('/report'), handler: postReport },

  // Mod (folded into cPanel/admin - GET pages redirect, POST actions unchanged)
  { method: 'GET', pattern: p('/mod'), handler: (_req, _ctx, _p) => Promise.resolve(new Response(null, { status: 302, headers: { Location: '/admin?section=moderation&tab=queue' } })) },
  { method: 'GET', pattern: p('/mod/deleted'), handler: (_req, _ctx, _p) => Promise.resolve(new Response(null, { status: 302, headers: { Location: '/admin?section=moderation&tab=deleted' } })) },
  { method: 'GET', pattern: p('/mod/reports'), handler: (_req, _ctx, _p) => Promise.resolve(new Response(null, { status: 302, headers: { Location: '/admin?section=moderation&tab=reports' } })) },
  { method: 'GET', pattern: p('/mod/warnings'), handler: (_req, _ctx, _p) => Promise.resolve(new Response(null, { status: 302, headers: { Location: '/admin?section=moderation&tab=warnings' } })) },
  { method: 'POST', pattern: p('/mod/warnings/:id/reply'), handler: postModWarningReply },
  { method: 'POST', pattern: p('/mod/reports/:id/resolve'), handler: postResolveReport },
  { method: 'POST', pattern: p('/mod/questions/approve'), handler: postApproveQuestion },
  { method: 'POST', pattern: p('/mod/questions/reject'), handler: postRejectQuestion },
  { method: 'POST', pattern: p('/mod/appeals/resolve'), handler: postResolveAppeal },
  { method: 'POST', pattern: p('/mod/note'), handler: postAppendModNote },

  // Admin
  { method: 'GET', pattern: p('/admin'), handler: getAdminPanel },
  { method: 'POST', pattern: p('/admin/setting'), handler: postSetting },
  { method: 'POST', pattern: p('/admin/user/review'), handler: postSetUserReview },
  { method: 'POST', pattern: p('/admin/room/create'), handler: postCreateRoom },
  { method: 'POST', pattern: p('/admin/room/update'), handler: postUpdateRoom },
  { method: 'POST', pattern: p('/admin/room/delete'), handler: postDeleteRoom },
  { method: 'POST', pattern: p('/admin/user/access'), handler: postSetUserAccess },
  { method: 'POST', pattern: p('/admin/user/ban'), handler: postSetUserBanned },
  { method: 'POST', pattern: p('/admin/user/delete'), handler: postDeleteUser },
  { method: 'GET', pattern: p('/admin/user/:id/edit'), handler: getAdminUserEdit },
  { method: 'POST', pattern: p('/admin/user/update'), handler: postUpdateUser },
  { method: 'POST', pattern: p('/admin/user/note'), handler: postEditModNote },
  { method: 'POST', pattern: p('/admin/user/:id/notes'), handler: postReviewerNotes },
  { method: 'POST', pattern: p('/admin/badges'), handler: postCreateBadge },
  { method: 'POST', pattern: p('/admin/badges/:id/update'), handler: postUpdateBadge },
  { method: 'POST', pattern: p('/admin/badges/:id/delete'), handler: postDeleteBadge },
  { method: 'POST', pattern: p('/admin/user/badge'), handler: postAssignBadge },
  { method: 'POST', pattern: p('/admin/user/badge/assign'), handler: postAdminBadgeAssign },
  { method: 'POST', pattern: p('/admin/user/badge/remove'), handler: postAdminBadgeRemove },
  { method: 'POST', pattern: p('/admin/salt-migration-blast'), handler: postSaltMigrationBlast },
  { method: 'POST', pattern: p('/admin/cw-tag'), handler: postCreateCwTag },
  { method: 'POST', pattern: p('/admin/cw-tag/:id'), handler: postUpdateCwTag },
  { method: 'POST', pattern: p('/admin/cw-tag/:id/delete'), handler: postDeleteCwTag },
  { method: 'POST', pattern: p('/content/cw-tags'), handler: postSetContentCwTags },
  // Static SEO & PWA
  { method: 'GET', pattern: p('/robots.txt'), handler: getRobotsTxt },
  { method: 'GET', pattern: p('/sitemap.xml'), handler: getSitemapXml },
  { method: 'GET', pattern: p('/manifest.json'), handler: getManifest },
  { method: 'GET', pattern: p('/sw.js'), handler: getServiceWorker },
  { method: 'GET', pattern: p('/favicon.svg'), handler: getFavicon },
  { method: 'GET', pattern: p('/tos'), handler: getTos },
  { method: 'GET', pattern: p('/about/tos'), handler: getTos },
  { method: 'POST', pattern: p('/tos/accept'), handler: postAcceptTos },
  { method: 'GET', pattern: p('/about'), handler: getStaticPage },
  { method: 'GET', pattern: p('/about/:page'), handler: getStaticPage },
  { method: 'GET', pattern: p('/expressions/:page'), handler: getStaticPage },
  { method: 'GET', pattern: p('/resources/:page'), handler: getStaticPage },
  { method: 'GET', pattern: p('/community/:page'), handler: getStaticPage },

  // Design system (dev-only, noindex)
  { method: 'GET', pattern: p('/design-system'), handler: renderDesignSystem },

  // Feed (LAST - catches /r/:slug and root /)
  { method: 'GET', pattern: p('/forum'), handler: getForumIndex },
  { method: 'GET', pattern: p('/needs-you'), handler: getNeedsYou },
  { method: 'GET', pattern: p('/r/:slug'), handler: getFeed },
  { method: 'GET', pattern: p('/'), handler: getFeed },
];
