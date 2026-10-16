import { describe, it, expect } from 'vitest';
import { renderPoll } from '../src/views/topic';

const topic = { short_id: 'B1' };
const user = { id: 7 };
const poll = (ends_at: string | null = null) => ({
  question: 'Q?',
  multi_select: 0,
  ends_at,
  options: [{ id: 1, text: 'A', votes: 2 }, { id: 2, text: 'B', votes: 1 }],
});

describe('renderPoll', () => {
  it('member who has not voted sees the form with a View results button', () => {
    const h = renderPoll(poll(), user, [], topic);
    expect(h).toContain('Cast Vote');
    expect(h).toContain('hx-get="/t/B1/poll?view=results"');
    expect(h).not.toContain('Undo vote');
  });

  it('peek shows results with Back to vote, no Undo', () => {
    const h = renderPoll(poll(), user, [], topic, true);
    expect(h).toContain('poll-results');
    expect(h).toContain('hx-get="/t/B1/poll"');
    expect(h).toContain('Back to vote');
    expect(h).not.toContain('Undo vote');
    expect(h).not.toContain('Cast Vote');
  });

  it('voter sees results with Undo vote', () => {
    const h = renderPoll(poll(), user, [1], topic);
    expect(h).toContain('hx-post="/t/B1/poll/unvote"');
    expect(h).toContain('✓ Your vote');
    expect(h).not.toContain('Back to vote');
  });

  it('ended poll shows no undo/back/peek controls', () => {
    const h = renderPoll(poll('2000-01-01 00:00:00'), user, [1], topic);
    expect(h).not.toContain('Undo vote');
    expect(h).not.toContain('Back to vote');
    expect(h).not.toContain('View results');
  });

  it('guest sees results only, no controls', () => {
    const h = renderPoll(poll(), null, [], topic);
    expect(h).toContain('Log in');
    expect(h).not.toContain('Undo vote');
    expect(h).not.toContain('Back to vote');
  });

  it('poll box carries the id the buttons target', () => {
    expect(renderPoll(poll(), user, [], topic)).toContain('id="poll-box"');
  });
});
