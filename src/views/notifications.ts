import { esc, loadMoreButton } from './layout';
import type { Notification } from '../types';

/** Typed icon; falls back to the generic bell for legacy/unknown rows. */
export function notificationIcon(type: string | null | undefined): string {
  switch (type) {
    case 'mention': return '💬';
    case 'reply': return '↩️';
    case 'warning': return '⚠️';
    default: return '🔔';
  }
}

export function renderNotificationItem(n: Notification): string {
  const link = n.url || '#';
  const isUnread = !n.read_at;
  const icon = notificationIcon((n as any).type);

  return `
    <a href="${esc(link)}" hx-get="${esc(link)}" hx-target=".main" hx-push-url="true" onclick="if(document.activeElement)document.activeElement.blur()" class="notification-item ${isUnread ? 'unread' : ''}" style="text-decoration:none;display:block;">
      <div style="display:flex;gap:10px;align-items:flex-start;">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">${icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:var(--text-main);line-height:1.4;">${esc(n.content)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px;">${new Date(n.created_at.includes('T') ? n.created_at : n.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</div>
        </div>
        ${isUnread ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:4px;"></div>' : ''}
      </div>
    </a>
  `;
}

export function renderNotificationInbox(notifications: Notification[]): string {
  const footer = `<a href="/notifications" hx-get="/notifications" hx-target=".main" hx-push-url="true" style="display:block;padding:10px;text-align:center;font-size:13px;color:var(--primary);border-top:1px solid var(--border-color);text-decoration:none;">View all</a>`;
  if (notifications.length === 0) {
    return `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:14px;">No notifications yet.</div>${footer}`;
  }
  return `<div style="max-height:400px;overflow-y:auto;">${notifications.map(renderNotificationItem).join('')}</div>${footer}`;
}

/**
 * Full /notifications page: 30/page id-cursor load-more (OOB beforeend into
 * #notif-list) + mark-all-read. Unread styling is display-only; the page never
 * auto-marks.
 */
export function renderNotificationsPage(opts: {
  notifications: Notification[];
  nextBeforeId: number | null;
  csrfToken?: string;
}): string {
  const { notifications, nextBeforeId, csrfToken } = opts;
  const items = notifications.length === 0
    ? `<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:14px;">No notifications yet.</div>`
    : notifications.map(renderNotificationItem).join('');
  return `
    <section class="page-head" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <h1 style="font-size:24px;font-weight:700;margin:0;">Notifications</h1>
      <form method="POST" action="/api/notifications/read-all" hx-post="/api/notifications/read-all" hx-target=".main" style="margin:0;">
        ${csrfToken ? `<input type="hidden" name="csrf" value="${esc(csrfToken)}">` : ''}
        <button type="submit" class="btn btn-secondary" style="font-size:13px;">Mark all read</button>
      </form>
    </section>
    <div id="notif-list" class="card" style="padding:0;overflow:hidden;">${items}</div>
    ${renderNotificationsMore(nextBeforeId)}
  `;
}

export function renderNotificationsMore(nextBeforeId: number | null): string {
  return loadMoreButton({
    id: 'notif-more',
    href: nextBeforeId ? `/notifications/page?before=${nextBeforeId}` : null,
    label: 'Load more',
  });
}

export function renderNotificationBadge(count: number): string {
  if (count <= 0) return '';
  return `<span class="unread-badge">${count > 9 ? '9+' : count}</span>`;
}
