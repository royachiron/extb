import { describe, it, expect } from 'vitest';
import {
  chatBubble,
  chatHeader,
  chatReactionPill,
  chatAddBtn,
  chatReplyBtn,
} from '../src/views/chat-message';

describe('chatBubble', () => {
  const base = {
    id: 7,
    isMe: false,
    headerHtml: '<hd>',
    quoteHtml: '<q>',
    bodyHtml: '<b>',
    reactionsHtml: '<pills>',
  };
  it('emits the shell with id, data-id, reactions wrapper', () => {
    const h = chatBubble(base);
    expect(h).toContain('id="chat-msg-7"');
    expect(h).toContain('data-id="7"');
    expect(h).toContain('class="chat-message"');
    expect(h).toContain('<div class="chat-msg-hd"><hd></div>');
    expect(h).toContain('<div class="chat-msg-body"><b></div>');
    expect(h).toContain('<div class="chat-reactions" data-react-row="7"><pills></div>');
    // quote sits between header and body, no wrapper
    expect(h).toContain('</div><q><div class="chat-msg-body">');
  });
  it('adds is-me only when isMe', () => {
    expect(chatBubble({ ...base, isMe: true })).toContain('class="chat-message is-me"');
    expect(chatBubble(base)).not.toContain('is-me');
  });
});

describe('chatHeader', () => {
  it('orders author, time, add, reply, del and carries data-utc', () => {
    const h = chatHeader({
      authorHtml: 'Ada',
      timeHtml: '12:00',
      utc: '2026-01-01T00:00:00Z',
      addBtnHtml: '<ADD>',
      replyBtnHtml: '<REPLY>',
      delBtnHtml: '<DEL>',
    });
    expect(h).toBe(
      '<span class="chat-msg-author">Ada</span>' +
        '<span class="chat-time" data-utc="2026-01-01T00:00:00Z">12:00</span>' +
        '<ADD><REPLY><DEL>',
    );
  });
});

describe('chatReactionPill', () => {
  it('renders emoji + count, is-mine only when mine, preserves the space', () => {
    const mine = chatReactionPill(7, '❤️', 2, true);
    expect(mine).toContain('class="chat-react-pill is-mine"');
    expect(mine).toContain('data-react="7"');
    expect(mine).toContain('data-emoji="❤️"');
    expect(mine).toContain('❤️ <span class="chat-react-n">2</span>');
    expect(chatReactionPill(7, '❤️', 2, false)).toContain('class="chat-react-pill"');
  });
});

describe('chatAddBtn / chatReplyBtn', () => {
  it('add button has margin-left:auto and data-react-add', () => {
    const a = chatAddBtn(9);
    expect(a).toContain('data-react-add="9"');
    expect(a).toContain('margin-left:auto;');
  });
  it('reply button carries id + pre-escaped author', () => {
    const r = chatReplyBtn(9, 'Bob');
    expect(r).toContain('data-reply="9"');
    expect(r).toContain('data-reply-author="Bob"');
  });
});

// The load-bearing test for Phase B: the client path does NOT import these
// builders - it embeds their SOURCE into an inline <script> via .toString().
// This proves that source, eval'd into fresh bindings, produces byte-identical
// output to the imported functions for the same inputs. If esbuild ever emits a
// form that breaks the embed, this fails here (deterministically, no browser).
describe('embedded-source round-trip (.toString)', () => {
  const SRC =
    'const chatBubble = ' + chatBubble.toString() + ';\n' +
    'const chatHeader = ' + chatHeader.toString() + ';\n' +
    'const chatReactionPill = ' + chatReactionPill.toString() + ';\n' +
    'const chatAddBtn = ' + chatAddBtn.toString() + ';\n' +
    'const chatReplyBtn = ' + chatReplyBtn.toString() + ';\n' +
    'return { chatBubble, chatHeader, chatReactionPill, chatAddBtn, chatReplyBtn };';
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const embedded = new Function(SRC)() as {
    chatBubble: typeof chatBubble;
    chatHeader: typeof chatHeader;
    chatReactionPill: typeof chatReactionPill;
    chatAddBtn: typeof chatAddBtn;
    chatReplyBtn: typeof chatReplyBtn;
  };

  it('eval(source) === imported for a full bubble', () => {
    const header = (B: typeof embedded) =>
      B.chatHeader({
        authorHtml: 'Ada',
        timeHtml: '12:00',
        utc: 'u',
        addBtnHtml: B.chatAddBtn(7),
        replyBtnHtml: B.chatReplyBtn(7, 'Ada'),
        delBtnHtml: '<DEL>',
      });
    const bubble = (B: typeof embedded) =>
      B.chatBubble({
        id: 7,
        isMe: true,
        headerHtml: header(B),
        quoteHtml: '<q>',
        bodyHtml: 'hi',
        reactionsHtml: B.chatReactionPill(7, '❤️', 3, true),
      });
    const imported = { chatBubble, chatHeader, chatReactionPill, chatAddBtn, chatReplyBtn };
    expect(bubble(embedded)).toBe(bubble(imported));
  });
});
