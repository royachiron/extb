import { describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { listRoomsForIndex, getLatestReplies, listFeedTopics, listUnansweredTopics, getRecentTopicsByUser, searchContent, getTopContributors, countUserActivity, listRooms, getRecentPostsByUser } from '../src/db';
import { getChat } from '../src/api/chat';
import { canRead } from '../src/access';
import { getUsers } from '../src/api/users';
import { getRoomsList } from '../src/api/rooms';
import type { Env } from '../src/types';

describe('private full-access room confidentiality', () => {
  it('hides private titles and replies from guests and ordinary members while allowing verified members', async () => {
    const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', d1Databases: ['DB'], compatibilityDate: '2026-05-01' });
    try {
      const DB = await mf.getD1Database('DB');
      const sql = readFileSync('schema.sql', 'utf8').replace(/--[^\n]*/g, '');
      const triggers: string[] = [];
      const remaining = sql.replace(/CREATE TRIGGER[\s\S]*?END;/g, t => { triggers.push(t); return ''; });
      for (const statement of [...remaining.split(';').map(s => s.trim()).filter(Boolean), ...triggers]) await DB.prepare(statement).run();
      for (const statement of [
        "INSERT INTO users(id,display_name,password_hash,access_level,is_approved) VALUES(1,'Member','hash','member',1),(2,'Verified','hash','full',1),(3,'Author','hash','full',1)",
        "INSERT INTO rooms(id,name,slug,kind,min_read,min_post,is_locked) VALUES(1,'Public','public','forum','anon','member',0),(2,'Private','private','forum','full','full',1),(3,'Private unlocked','private-unlocked','forum','full','full',0)",
        "INSERT INTO topics(id,room_id,user_id,title,content,short_id) VALUES(1,1,3,'Public title','public','000001'),(2,2,3,'Private title','private','000002'),(3,3,3,'Private unlocked title','private','000003'),(4,2,3,'Unanswered private','private','000004')",
        "INSERT INTO posts(id,topic_id,user_id,content) VALUES(1,1,3,'Public reply'),(2,2,3,'Private reply'),(3,3,3,'Private unlocked reply')",
      ]) await DB.prepare(statement).run();
      const env = { DB } as unknown as Env;
      await DB.prepare("INSERT INTO rooms(id,name,slug,kind,min_read,min_post) VALUES(4,'Member chat','chat','chat','member','member'),(5,'Public chat','playground-chat','chat','anon','anon')").run();
      const chatCtx = { env, user: null, csrfToken: 'test', origin: 'https://forum.test', branding: {} } as any;
      const publicChat = await getChat(new Request('https://forum.test/chat', { headers: { 'hx-request': 'true' } }), chatCtx, {});
      expect(publicChat.status).toBe(200);
      expect(await publicChat.text()).toContain('playground-chat');
      const privateChat = await getChat(new Request('https://forum.test/chat?room=chat'), chatCtx, {});
      expect(privateChat.status).toBe(303);
      expect(privateChat.headers.get('Location')).toBe('/login');
      await DB.prepare('DELETE FROM rooms WHERE id IN (4,5)').run();

      for (const viewer of [undefined, 1]) {
        const user = viewer ? await DB.prepare('SELECT * FROM users WHERE id = ?').bind(viewer).first() : null;
        const response = await getRoomsList(new Request('https://forum.test/api/rooms'), { env, user } as any, {});
        expect((await response.json() as any).rooms.map((r: any) => r.id)).toEqual([1]);
        expect((await getRecentPostsByUser(env, 3, 10, viewer)).map(p => p.topic_id)).toEqual([1]);
        expect(await countUserActivity(env, 3, viewer)).toEqual({ topics: 1, posts: 1 });
        expect((await listRooms(env, viewer)).find(r => r.id === 2)).toMatchObject({ total_topics: 0, total_posts: 0, total_posts_all: 0, unread_count: 0 });
        expect((await getTopContributors(env, 10, viewer)).find(u => u.id === 3)).toMatchObject({ topic_count: 1, post_count: 1 });
        expect((await listRoomsForIndex(env, viewer)).map(r => r.id)).toEqual([1]);
        expect((await getLatestReplies(env, 10, viewer)).map(p => p.topic_id)).toEqual([1]);
        expect((await listFeedTopics(env, null, 10, 0, viewer)).map(t => t.id)).toEqual([1]);
        expect((await getRecentTopicsByUser(env, 3, 10, viewer)).map(t => t.id)).toEqual([1]);
      }
      const verified = { id: 2, access_level: 'full', is_approved: 1, is_banned: 0 } as any;
      expect((await searchContent(env, verified, 'private', 20, 0)).map(t => t.topic_title)).toContain('Private title');
      expect((await listUnansweredTopics(env, 1)).map(t => t.id)).toEqual([]);
      expect((await listRoomsForIndex(env, 2)).map(r => r.id)).toEqual([1, 2, 3]);
      expect((await getLatestReplies(env, 10, 2)).map(p => p.topic_id).sort()).toEqual([1, 2, 3]);
      expect((await listFeedTopics(env, null, 10, 0, 2)).map(t => t.id).sort()).toEqual([1, 2, 3, 4]);
      await DB.prepare("INSERT INTO room_permissions(room_id,user_id,access_type) VALUES(2,2,'blocked')").run();
      expect((await listRoomsForIndex(env, 2)).map(r => r.id)).toEqual([1, 3]);
      await DB.prepare("UPDATE room_permissions SET access_type = 'full' WHERE user_id = 2").run();
      await DB.prepare('UPDATE users SET is_approved = 0 WHERE id = 2').run();
      expect(canRead({ ...verified, is_approved: 0 }, { min_read: 'full', is_locked: 1, user_permission: 'full' } as any)).toBe(false);
      const directory = await getUsers(new Request('https://forum.test/users'), { env, user: { ...verified, is_approved: 0 } } as any, {});
      expect(directory.status).toBe(302);
      expect((await listFeedTopics(env, null, 10, 0, 2)).map(t => t.id)).toEqual([1]);
      await DB.prepare("UPDATE users SET access_level = 'mod', is_approved = 1 WHERE id = 2").run();
      await DB.prepare("UPDATE room_permissions SET access_type = 'blocked' WHERE user_id = 2").run();
      await DB.prepare('UPDATE topics SET require_review = 1 WHERE id = 2').run();
      expect(canRead({ ...verified, access_level: 'mod' }, { min_read: 'full', is_locked: 1, user_permission: 'blocked' } as any)).toBe(true);
      expect((await listRoomsForIndex(env, 2)).map(r => r.id)).toEqual([1, 2, 3]);
      expect(await countUserActivity(env, 3, 2)).toEqual({ topics: 4, posts: 3 });
      expect((await getTopContributors(env, 10, 2)).find(u => u.id === 3)).toMatchObject({ topic_count: 4, post_count: 3 });
      await DB.prepare('UPDATE users SET is_banned = 1 WHERE id = 2').run();
      expect(await listRoomsForIndex(env, 2)).toEqual([]);
    } finally { await mf.dispose(); }
  }, 30000);
});
