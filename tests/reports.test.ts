import { describe, it, expect } from 'vitest';
import {
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
  REPORT_REASON_LABELS,
  createReport,
  listOpenReports,
} from '../src/db/reports';
import { renderReportForm, renderReportDone, renderReportNotice, renderReportButton, renderReportSlot } from '../src/views/report';
import { renderModReports } from '../src/views/mod';
import { renderHeartbeat, renderModBadge } from '../src/api/heartbeat';
import type { Env } from '../src/types';

function mockEnv(run: (sql: string, binds: unknown[]) => unknown): Env {
  const prepare = (sql: string) => {
    const stmt = {
      binds: [] as unknown[],
      bind(...args: unknown[]) { stmt.binds = args; return stmt; },
      run: async () => run(sql, stmt.binds),
      first: async () => run(sql, stmt.binds),
      all: async () => ({ results: run(sql, stmt.binds) }),
    };
    return stmt;
  };
  return { DB: { prepare } } as unknown as Env;
}

describe('report enums', () => {
  it('every reason has a human label', () => {
    for (const r of REPORT_REASONS) expect(REPORT_REASON_LABELS[r]).toBeTruthy();
  });
  it('target types cover topic/post/user', () => {
    expect([...REPORT_TARGET_TYPES]).toEqual(['topic', 'post', 'user']);
  });
});

describe('createReport', () => {
  it('returns created on clean insert', async () => {
    const env = mockEnv(() => ({ success: true }));
    await expect(createReport(env, 1, 'post', 5, 'spam', null)).resolves.toBe('created');
  });
  it('maps UNIQUE violation to duplicate', async () => {
    const env = mockEnv(() => { throw new Error('UNIQUE constraint failed: reports.reporter_id'); });
    await expect(createReport(env, 1, 'post', 5, 'spam', null)).resolves.toBe('duplicate');
  });
  it('rethrows non-UNIQUE errors', async () => {
    const env = mockEnv(() => { throw new Error('no such table: reports'); });
    await expect(createReport(env, 1, 'post', 5, 'spam', null)).rejects.toThrow('no such table');
  });
});

describe('listOpenReports SQL', () => {
  it('sorts self-harm-risk first, then oldest', async () => {
    let captured = '';
    const env = mockEnv((sql) => { captured = sql; return []; });
    await listOpenReports(env);
    expect(captured).toContain("CASE WHEN rep.reason = 'self-harm-risk' THEN 0 ELSE 1 END");
    expect(captured).toContain('rep.created_at ASC');
    expect(captured).toContain("rep.status = 'pending'");
  });
});

describe('report views', () => {
  it('form escapes nothing user-provided but wires hx-post to /report', () => {
    const html = renderReportForm('post', 42, 'tok');
    expect(html).toContain('hx-post="/report"');
    expect(html).toContain('name="type" value="post"');
    expect(html).toContain('name="id" value="42"');
    expect(html).toContain('name="csrf" value="tok"');
    for (const r of REPORT_REASONS) expect(html).toContain(`value="${r}"`);
  });
  it('confirmation and notice escape their message', () => {
    expect(renderReportDone('<b>x</b>')).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(renderReportNotice('<i>y</i>')).toContain('&lt;i&gt;y&lt;/i&gt;');
  });
  it('button and slot agree on the target id', () => {
    expect(renderReportButton('topic', 7)).toContain('hx-target="#report-slot-topic-7"');
    expect(renderReportSlot('topic', 7)).toContain('id="report-slot-topic-7"');
  });
});

describe('renderModReports', () => {
  const base = {
    id: 1, reporter_id: 2, reporter_name: 'alice', content_id: 3,
    detail: null, status: 'pending', created_at: '2026-07-01 10:00:00',
    content_preview: 'hello <script>', topic_title: 'A topic', topic_short_id: 'abc123',
    target_user_name: null,
  };
  it('escapes preview content and links the target', () => {
    const html = renderModReports({
      user: { id: 9 } as any, rooms: [], csrfToken: 't',
      reports: [{ ...base, content_type: 'post', reason: 'harassment' } as any],
    });
    expect(html).toContain('hello &lt;script&gt;');
    expect(html).toContain('/t/abc123#post-3');
    expect(html).not.toContain('hello <script>');
  });
  it('flags self-harm-risk reports visually', () => {
    const html = renderModReports({
      user: { id: 9 } as any, rooms: [], csrfToken: 't',
      reports: [{ ...base, content_type: 'topic', reason: 'self-harm-risk' } as any],
    });
    expect(html).toContain('border-left:4px solid var(--danger)');
  });
  it('renders empty state with no reports', () => {
    const html = renderModReports({ user: { id: 9 } as any, rooms: [], csrfToken: 't', reports: [] });
    expect(html).toContain('No open reports');
  });
});

describe('heartbeat mod badge', () => {
  it('renders count, caps at 99+', () => {
    expect(renderModBadge(0)).toBe('');
    expect(renderModBadge(3)).toContain('>3<');
    expect(renderModBadge(120)).toContain('99+');
  });
  it('omits the mod OOB span for non-staff (null), emits it for staff', () => {
    expect(renderHeartbeat('', '', '')).not.toContain('js-mod-badge');
    expect(renderHeartbeat('', '', '', '')).toContain('hx-swap-oob="innerHTML:.js-mod-badge"');
  });
});
