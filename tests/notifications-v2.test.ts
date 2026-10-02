import { describe, it, expect } from 'vitest';
import {
  notificationIcon,
  renderNotificationInbox,
  renderNotificationsPage,
  renderNotificationsMore,
} from '../src/views/notifications';
import { listNotificationsPage } from '../src/db/notifications';
import type { Env, Notification } from '../src/types';

function n(id: number, type: string, read = false): Notification {
  return {
    id, user_id: 1, content: `notif ${id}`, url: '/t/abc', type,
    read_at: read ? '2026-07-01 00:00:00' : null, created_at: '2026-07-01 00:00:00',
  } as Notification;
}

describe('notificationIcon', () => {
  it('maps types, falls back to bell', () => {
    expect(notificationIcon('mention')).toBe('💬');
    expect(notificationIcon('reply')).toBe('↩️');
    expect(notificationIcon('warning')).toBe('⚠️');
    expect(notificationIcon('other')).toBe('🔔');
    expect(notificationIcon(null)).toBe('🔔');
    expect(notificationIcon(undefined)).toBe('🔔');
  });
});

describe('dropdown inbox', () => {
  it('always shows the View all footer', () => {
    expect(renderNotificationInbox([])).toContain('href="/notifications"');
    expect(renderNotificationInbox([n(1, 'reply')])).toContain('View all');
  });
});

describe('notifications page', () => {
  it('renders mark-all form and load-more when a further page exists', () => {
    const html = renderNotificationsPage({ notifications: [n(2, 'mention'), n(1, 'reply')], nextBeforeId: 1, csrfToken: 'tok' });
    expect(html).toContain('hx-post="/api/notifications/read-all"');
    expect(html).toContain('name="csrf" value="tok"');
    expect(html).toContain('hx-get="/notifications/page?before=1"');
    expect(html).toContain('id="notif-list"');
  });
  it('renders empty slot when no more pages', () => {
    expect(renderNotificationsMore(null)).toBe('<div id="notif-more"></div>');
  });
});

describe('listNotificationsPage', () => {
  function mockEnv(rows: unknown[]): { env: Env; sqls: string[]; binds: unknown[][] } {
    const sqls: string[] = [];
    const binds: unknown[][] = [];
    const prepare = (sql: string) => {
      sqls.push(sql);
      const stmt = {
        bind(...args: unknown[]) { binds.push(args); return stmt; },
        all: async () => ({ results: rows }),
      };
      return stmt;
    };
    return { env: { DB: { prepare } } as unknown as Env, sqls, binds };
  }

  it('first page has no id predicate; cursor page filters id <', async () => {
    const first = mockEnv([]);
    await listNotificationsPage(first.env, 1, 30, null);
    expect(first.sqls[0]).not.toContain('id <');
    expect(first.binds[0]).toEqual([1, 31]);

    const paged = mockEnv([]);
    await listNotificationsPage(paged.env, 1, 30, 99);
    expect(paged.sqls[0]).toContain('id < ?');
    expect(paged.binds[0]).toEqual([1, 99, 31]);
  });

  it('detects a further page via limit+1 and returns the boundary id', async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({ id: 100 - i }));
    const { env } = mockEnv(rows);
    const page = await listNotificationsPage(env, 1, 30, null);
    expect(page.notifications).toHaveLength(30);
    expect(page.nextBeforeId).toBe(71);
  });

  it('marks nothing read (no UPDATE issued)', async () => {
    const { env, sqls } = mockEnv([]);
    await listNotificationsPage(env, 1, 30, null);
    expect(sqls.join(' ')).not.toContain('UPDATE');
  });
});
