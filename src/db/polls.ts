// Poll persistence: polls, poll_options, poll_votes. Self-contained domain
// extracted from db.ts behind the db.ts re-export barrel (zero caller changes).
import type { Env } from '../types';

export async function createPoll(env: Env, topicId: number, question: string, multiSelect: boolean, endsAt: string | null, options: string[]): Promise<void> {
  const res = await env.DB.prepare(
    'INSERT INTO polls (topic_id, question, multi_select, ends_at) VALUES (?, ?, ?, ?) RETURNING id'
  ).bind(topicId, question, multiSelect ? 1 : 0, endsAt).first<{ id: number }>();

  if (res) {
    for (const opt of options) {
      await env.DB.prepare('INSERT INTO poll_options (poll_id, text) VALUES (?, ?)').bind(res.id, opt).run();
    }
  }
}

export async function getPollByTopicId(env: Env, topicId: number): Promise<any | null> {
  const poll = await env.DB.prepare('SELECT * FROM polls WHERE topic_id = ?').bind(topicId).first();
  if (!poll) return null;

  const options = await env.DB.prepare(
    `SELECT o.*, (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) as votes
     FROM poll_options o WHERE o.poll_id = ?`
  ).bind(poll.id).all();

  return { ...poll, options: options.results ?? [] };
}

export async function voteInPoll(env: Env, pollId: number, optionIds: number[], userId: number): Promise<void> {
  const poll = await env.DB.prepare('SELECT multi_select FROM polls WHERE id = ?').bind(pollId).first<{ multi_select: number }>();
  if (poll) {
    await env.DB.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').bind(pollId, userId).run();
    for (const oid of optionIds) {
      await env.DB.prepare('INSERT OR IGNORE INTO poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)').bind(pollId, oid, userId).run();
    }
  }
}

export async function getPollVotesByUser(env: Env, poll_id: number, user_id: number): Promise<number[]> {
  const res = await env.DB.prepare('SELECT option_id FROM poll_votes WHERE poll_id = ? AND user_id = ?').bind(poll_id, user_id).all<{ option_id: number }>();
  return (res.results ?? []).map(r => r.option_id);
}
