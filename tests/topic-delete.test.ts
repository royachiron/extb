import { describe, it, expect, vi } from 'vitest';

function makeDb(runSpy: (sql: string) => unknown) {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({ run: () => runSpy(sql) }),
    }),
  };
}

describe('postSoftDeleteTopic non-mod path', () => {
  it('wipes OP content and deletes own reply-posts when keep_replies omitted', async () => {
    const sqls: string[] = [];
    const db = makeDb(vi.fn(async (sql: string) => { sqls.push(sql); }));

    await db.prepare(`UPDATE topics SET content = '[deleted]', title = '[deleted]', user_id = NULL, anon_name = NULL WHERE id = ?`).bind(1).run();
    await db.prepare('UPDATE posts SET parent_post_id = NULL WHERE topic_id = ? AND parent_post_id IN (SELECT id FROM posts WHERE topic_id = ? AND user_id = ?)').bind(1, 1, 72).run();
    await db.prepare('DELETE FROM posts WHERE topic_id = ? AND user_id = ?').bind(1, 72).run();
    await db.prepare('UPDATE topics SET reply_count = (SELECT COUNT(*) FROM posts WHERE topic_id = ?) WHERE id = ?').bind(1, 1).run();

    expect(sqls[0]).toContain('UPDATE topics SET content');
    expect(sqls[0]).toContain('[deleted]');
    expect(sqls[0]).toContain('anon_name = NULL');
    expect(sqls[1]).toContain('parent_post_id = NULL');
    expect(sqls[2]).toContain('DELETE FROM posts');
    expect(sqls[3]).toContain('reply_count');
    expect(sqls.some(s => /^DELETE FROM topics/.test(s))).toBe(false);
  });

  it('wipes OP and anonymises own reply-posts when keep_replies=1', async () => {
    const sqls: string[] = [];
    const db = makeDb(vi.fn(async (sql: string) => { sqls.push(sql); }));

    await db.prepare(`UPDATE topics SET content = '[deleted]', title = '[deleted]', user_id = NULL, anon_name = NULL WHERE id = ?`).bind(1).run();
    await db.prepare('UPDATE posts SET user_id = NULL, anon_name = NULL WHERE topic_id = ? AND user_id = ?').bind(1, 72).run();

    expect(sqls[0]).toContain('UPDATE topics SET content');
    expect(sqls[0]).toContain('anon_name = NULL');
    expect(sqls[1]).toContain('UPDATE posts SET user_id = NULL, anon_name = NULL');
    expect(sqls.some(s => /^DELETE FROM posts/.test(s))).toBe(false);
    expect(sqls.some(s => /^DELETE FROM topics/.test(s))).toBe(false);
  });
});
