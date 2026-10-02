import { esc } from './layout';

/**
 * Search results page body, moved verbatim from api/search.ts getSearch.
 * `results` rows come from db searchContent (FTS5).
 */
export function renderSearchResults(opts: {
  q: string;
  results: any[];
  hasMore: boolean;
  offset: number;
  pageSize: number;
}): string {
  const { q, results, hasMore, offset } = opts;
  const PAGE = opts.pageSize;

  const resultsHtml = results.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--text-muted);background:var(--card-bg);border-radius:12px;border:1px solid var(--border-color);">No results found for "${esc(q)}".</div>`
    : results.map(r => `
      <div class="post-card" style="padding:16px; flex-direction:column; margin-bottom:12px;">
        <h3 style="margin:0 0 8px; font-size:18px;">
          <a href="/t/${esc(r.topic_short_id)}${r.type === 'post' ? `#post-${r.item_id}` : ''}" style="color:var(--text-main);">${esc(r.topic_title)}</a>
        </h3>
        <p style="margin:0; font-size:14px; color:var(--text-muted); line-height:1.5;">
          ${esc(r.content).substring(0, 300)}${r.content.length > 300 ? '...' : ''}
        </p>
      </div>`).join('');

  const count = results.length;
  return `
    <section class="page-head" style="margin-bottom: 24px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;">Search Results</h1>
      <form action="/search" method="GET" role="search" style="display:flex;gap:8px;margin:0 0 12px;max-width:480px;">
        <input name="q" value="${esc(q)}" placeholder="Search..." autocomplete="off" aria-label="Search" style="flex:1;">
        <button type="submit" class="btn">Search</button>
      </form>
      <p class="subtitle" style="color:var(--text-muted);margin:0;">${offset > 0 ? `Results ${offset + 1}-${offset + count}` : `${count}${hasMore ? '+' : ''} result${count === 1 && !hasMore ? '' : 's'}`} for: <strong>${esc(q)}</strong></p>
    </section>
    ${resultsHtml}
    ${hasMore ? `<div style="margin:16px 0;text-align:center;"><a class="btn btn-secondary" href="/search?q=${encodeURIComponent(q)}&offset=${offset + PAGE}">More results</a></div>` : ''}
  `;
}
