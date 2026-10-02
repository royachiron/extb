import { describe, it, expect } from 'vitest';
import { renderFeed, renderFeedMore, FEED_PAGE_SIZE } from '../src/views/feed';

const baseOpts = {
  user: null,
  rooms: [],
  activeRoom: null,
  topics: [],
  pollUrl: '/?list=1',
};

describe('feed pagination', () => {
  it('poll trigger is gated on visibility AND unpaged list', () => {
    const html = renderFeed({ ...baseOpts });
    expect(html).toContain(
      `hx-trigger="every 60s [document.visibilityState==='visible' && !document.getElementById('topic-list').dataset.paged]"`
    );
  });

  it('renders load-more only when hasMore, pointing at the next page', () => {
    const without = renderFeed({ ...baseOpts, hasMore: false });
    expect(without).toContain('<div id="feed-more"></div>');
    expect(without).not.toContain('Load more topics');

    const withMore = renderFeed({ ...baseOpts, hasMore: true, baseUrl: '/r/lounge', page: 2 });
    expect(withMore).toContain('hx-get="/r/lounge?list=1&append=1&page=3"');
  });

  it('load-more marks the list as paged so the poll stops replacing it', () => {
    const html = renderFeedMore('/', 1);
    expect(html).toContain(`hx-on::after-request="document.getElementById('topic-list').dataset.paged='1'"`);
    expect(html).toContain('hx-target="#feed-more"');
    expect(html).toContain('hx-swap="outerHTML"');
  });

  it('page size is 30', () => {
    expect(FEED_PAGE_SIZE).toBe(30);
  });
});
