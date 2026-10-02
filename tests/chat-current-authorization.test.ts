import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ChatRoom } from '../src/durable/chat-room';
import type { Env, User, Room } from '../src/types';

beforeAll(() => {
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
});

function fixture() {
  let user = { id: 1, display_name: 'Member', access_level: 'mod', is_banned: 0, is_approved: 1, posting_restricted_at: null } as User;
  let recipient = { ...user, id: 2, access_level: 'member', allow_dms: 1 } as User;
  let room = { id: 1, slug: 'chat', kind: 'chat', min_read: 'anon', min_post: 'member', is_locked: 0, is_exclusive: 0, user_permission: null } as Room;
  let blocked = false;
  const writes = vi.fn(async () => ({ meta: { changes: 1, last_row_id: 1 }, results: [] }));
  const DB = { prepare: (sql: string) => {
    let binds: unknown[] = [];
    const statement = {
      bind: (...args: unknown[]) => { binds = args; return statement; },
      first: async () => {
        if (sql.includes('SELECT * FROM users')) return binds[0] === 1 ? user : recipient;
        if (sql.includes('FROM rooms')) return room;
        if (sql.includes('FROM user_blocks')) return blocked ? { x: 1 } : null;
        if (sql.includes('SELECT scope FROM chat_messages')) return { scope: 'room:chat' };
        if (sql.includes('COUNT(*) as c FROM chat_reactions')) return { c: 1 };
        return null;
      },
      all: async () => ({ results: [user, recipient].map(value => ({ ...value, user_permission: room.user_permission })) }),
      run: writes,
    };
    return statement;
  } };
  let attachment = { name: 'Old moderator', authorId: 1, scope: 'room:chat', canPost: true, isMod: true, ip: null, dmOtherId: null, dmOtherName: null };
  const send = vi.fn();
  const close = vi.fn();
  const ws = { deserializeAttachment: () => attachment, serializeAttachment: (meta: typeof attachment) => { attachment = { ...meta }; }, send, close } as unknown as WebSocket;
  const recipientSend = vi.fn();
  const recipientClose = vi.fn();
  const recipientSocket = { deserializeAttachment: () => ({ ...attachment, authorId: 2, name: 'Recipient' }), send: recipientSend, close: recipientClose } as unknown as WebSocket;
  let sockets = [ws];
  const ctx = { setWebSocketAutoResponse: vi.fn(), getWebSockets: () => sockets, waitUntil: vi.fn() } as unknown as DurableObjectState;
  const chat = new ChatRoom(ctx, { DB } as unknown as Env);
  return { chat, ws, send, close, writes, recipientSend, recipientClose, connectRecipient: () => { sockets = [ws, recipientSocket]; }, setUser: (partial: Partial<User>) => { user = { ...user, ...partial }; }, setRoom: (partial: Partial<Room>) => { room = { ...room, ...partial }; }, setRecipient: (partial: Partial<User>) => { recipient = { ...recipient, ...partial }; }, setBlocked: (value: boolean) => { blocked = value; }, setDm: () => { attachment = { ...attachment, scope: 'dm:1:2' }; }, meta: () => attachment };
}

describe('current WebSocket authorization', () => {
  it('a banned connected moderator cannot send, delete or react', async () => {
    const f = fixture(); f.setUser({ is_banned: 1 });
    for (const message of [{ type: 'send', content: 'stale authorization' }, { type: 'delete', id: 1 }, { type: 'react', id: 1, emoji: '👍' }]) {
      await f.chat.webSocketMessage(f.ws, JSON.stringify(message));
    }
    expect(f.writes).not.toHaveBeenCalled();
    expect(f.meta()).toMatchObject({ isMod: false, canPost: false });
  });

  it('a demoted moderator cannot delete through an already connected socket', async () => {
    const f = fixture(); f.setUser({ access_level: 'member' });
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'delete', id: 1 }));
    expect(f.writes).not.toHaveBeenCalled();
    expect(f.meta()).toMatchObject({ isMod: false, canPost: true });
  });

  it('revoked room permissions prevent both messages and reactions', async () => {
    const f = fixture(); f.setUser({ access_level: 'member' }); f.setRoom({ user_permission: 'blocked' });
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'send', content: 'blocked' }));
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'react', id: 1, emoji: '👍' }));
    expect(f.writes).not.toHaveBeenCalled();
  });

  it('current room posting requirements override stale canPost', async () => {
    const f = fixture(); f.setUser({ access_level: 'member' }); f.setRoom({ min_post: 'mod' });
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'send', content: 'read only' }));
    expect(f.writes).not.toHaveBeenCalled();
    expect(f.meta().canPost).toBe(false);
  });

  it('an approved current moderator can still delete', async () => {
    const f = fixture();
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'delete', id: 1 }));
    expect(f.writes).toHaveBeenCalledOnce();
    expect(f.meta()).toMatchObject({ name: 'Member', isMod: true });
  });

  it('unapproved accounts cannot persist socket writes', async () => {
    const f = fixture(); f.setUser({ is_approved: 0 });
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'send', content: 'not admitted' }));
    expect(f.writes).not.toHaveBeenCalled();
  });

  it('banned passive recipients are closed before outbound broadcasts', async () => {
    const f = fixture(); f.connectRecipient(); f.setRecipient({ is_banned: 1 });
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'delete', id: 1 }));
    expect(f.recipientSend).not.toHaveBeenCalled();
    expect(f.recipientClose).toHaveBeenCalledWith(1008, 'Access revoked');
    expect(f.send).toHaveBeenCalledWith(JSON.stringify({ type: 'delete', id: 1 }));
  });

  it('passive users lose private-room delivery after moderator demotion', async () => {
    const f = fixture(); f.connectRecipient(); f.setRecipient({ access_level: 'member' }); f.setRoom({ is_exclusive: 1, user_permission: null });
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'delete', id: 1 }));
    expect(f.recipientSend).not.toHaveBeenCalled();
    expect(f.recipientClose).toHaveBeenCalledWith(1008, 'Access revoked');
  });

  it('current recipient DM settings and blocks apply to existing channels', async () => {
    const f = fixture(); f.setDm(); f.setUser({ access_level: 'member' }); f.setRecipient({ allow_dms: 0 });
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'send', content: 'disabled' }));
    expect(f.writes).not.toHaveBeenCalled();
    f.setRecipient({ allow_dms: 1 }); f.setBlocked(true);
    await f.chat.webSocketMessage(f.ws, JSON.stringify({ type: 'send', content: 'blocked' }));
    expect(f.writes).not.toHaveBeenCalled();
  });
});
