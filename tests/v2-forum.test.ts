import { expect, test } from 'vitest';
import { renderPost } from '../src/views/post';

test('forum rendering includes Markdown and author identity', () => {
  const post = {
    id: 1,
    user_id: 1,
    content: '# Hello world',
    author_display_name: 'testuser',
    created_at: new Date().toISOString(),
  };
  const html = renderPost(post, true);
  expect(html).toContain('<h1>Hello world</h1>');
  expect(html).toContain('testuser');
  expect(html).toContain('/u/testuser');
});
