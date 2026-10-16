import { describe, it, expect } from 'vitest';
import { renderNewTopicComposer, renderRoomTopicComposer } from '../src/views/post';
import { LAYOUT_SCRIPT } from '../src/views/layout-scripts';
import { findRecentDuplicateTopic } from '../src/db/topics';

describe('duplicate thread guard', () => {
  it('both new-topic composers are submit-once forms', () => {
    const room = { id: 1, slug: 'r', name: 'R' } as any;
    expect(renderNewTopicComposer({ preselected: null, postRooms: [room], prefillTitle: '', prefillBody: '', showAutoDelete: false, allCwTags: [] }))
      .toContain('action="/topics" data-submit-once');
    expect(renderRoomTopicComposer({ room, showAutoDelete: false, allCwTags: [] })).toContain('action="/topics" data-submit-once');
  });

  it('the layout script locks submit-once forms and still parses', () => {
    expect(LAYOUT_SCRIPT).toContain("hasAttribute('data-submit-once')");
    expect(LAYOUT_SCRIPT).toContain("addEventListener('pageshow'");
    expect(() => new Function(LAYOUT_SCRIPT)).not.toThrow();
  });

  it('server lookup matches user + room + title inside the window', async () => {
    let bound: unknown[] = [];
    let sql = '';
    const env = { DB: { prepare: (s: string) => { sql = s; return { bind: (...a: unknown[]) => { bound = a; return { first: async () => ({ short_id: 'ABC', status: 'approved' }) }; } }; } } } as any;
    expect(await findRecentDuplicateTopic(env, 7, 3, 'Hello')).toEqual({ short_id: 'ABC', status: 'approved' });
    expect(bound).toEqual([7, 3, 'Hello', '-5 minutes']);
    expect(sql).toContain('deleted_at IS NULL');
  });
});
