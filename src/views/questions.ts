import type { User, Room, Topic } from '../types';
import { esc, csrfField } from './layout';
import { turnstileScript, turnstileWidget } from './turnstile';

export function renderQuestionsIndex(opts: {
  user: User | null;
  rooms: Room[];
  questionsRoom: Room;
  topics: Topic[];
  submitted?: boolean;
  siteKey?: string;
  canonicalUrl?: string;
  csrfToken?: string;
}): string {
  const { user, topics, submitted, siteKey, csrfToken } = opts;

  const flashHtml = submitted
    ? `<div class="flash flash-success">
         Thanks - your question has been submitted and is awaiting moderator review.
       </div>`
    : '';

  const submitForm = `
    <section class="card" style="margin-bottom:32px;">
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">Ask a question</h2>
      <p style="margin:0 0 20px;color:var(--text-muted);font-size:14px;">Anyone can ask. Posts go to a moderator queue before appearing.</p>
      <form method="post" action="/questions/submit">
        ${csrfField({ csrfToken })}
        <label style="display:block;font-weight:600;margin-bottom:8px;color:var(--text-main)">Name <span style="font-weight:400;color:var(--text-muted)">(optional)</span>
          <input type="text" name="anon_name" maxlength="40" placeholder="anonymous" style="width:100%;padding:10px 12px;font-size:15px;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;background:var(--card-bg);color:var(--text-main);">
        </label>
        <label style="display:block;font-weight:600;margin:16px 0 8px;color:var(--text-main)">Title
          <input type="text" name="title" required maxlength="200" style="width:100%;padding:10px 12px;font-size:15px;border:1px solid var(--border-color);border-radius:6px;margin-top:4px;background:var(--card-bg);color:var(--text-main);">
        </label>
        <label style="display:block;font-weight:600;margin:16px 0 8px;color:var(--text-main)">Question
          <textarea name="content" required maxlength="10000" rows="6" style="width:100%;font:15px/1.6 inherit;padding:12px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box;margin-top:4px;resize:vertical;background:var(--card-bg);color:var(--text-main);"></textarea>
        </label>
        <div style="margin-top:16px;">${turnstileWidget(siteKey)}</div>
        <button type="submit" class="btn" style="margin-top:20px;padding:10px 20px;font-size:15px;">Submit for review</button>
      </form>
    </section>`;

  const topicList = topics.length === 0
    ? `<div class="empty-state">No questions yet.</div>`
    : `<div class="topic-list">${topics.map((t) => {
        const href = user ? `/t/${t.short_id}` : `/register?return=${encodeURIComponent('/t/' + t.short_id)}`;
        const hxAttrs = user
          ? `hx-get="/t/${t.short_id}" hx-target=".main" hx-push-url="true"`
          : `hx-get="/register" hx-target=".main" hx-push-url="true"`;
        return `
        <article class="post-card" style="padding: 16px; margin-bottom: 12px; flex-direction: column;">
          <h3 style="margin: 0 0 8px; font-size: 18px;">
            <a href="${href}" ${hxAttrs} style="color: var(--text-main);">${esc(t.title)}</a>
            ${t.status !== 'approved' ? `<span class="badge badge-warn" style="margin-left:8px;vertical-align:middle;">${esc(t.status)}</span>` : ''}
          </h3>
          <p class="meta" style="margin: 0; color: var(--text-muted); font-size: 13px;">
            <span style="font-weight: 600; color: var(--text-main);">${esc(t.author_display_name || t.anon_name || 'member')}</span> ·
            ${t.reply_count} ${t.reply_count === 1 ? 'reply' : 'replies'} ·
            ${new Date(t.created_at).toLocaleString()}
          </p>
        </article>`;
      }).join('')}</div>`;

  return `
    <header class="page-head" style="margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Q&amp;A</h1>
      <p style="margin:8px 0 0;color:var(--text-muted);font-size:14px;">Ask questions, share what you know, and learn from your community.</p>
    </header>
    ${flashHtml}
    ${submitForm}
    <section>
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;">Recent questions</h2>
      ${topicList}
    </section>
    ${!user ? `<div style="margin-top:24px;padding:24px;background:var(--card-bg);border-radius:12px;border:1px solid var(--border-color);text-align:center;">
      <p style="margin:0 0 12px;font-weight:600;color:var(--text-main);">Want to read and participate in discussions?</p>
      <a href="/register" hx-get="/register" hx-target=".main" hx-push-url="true" class="btn">Create an account</a>
    </div>` : ''}
    ${turnstileScript(siteKey)}`;
}

