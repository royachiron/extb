import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/views/post';
import { renderDmContent } from '../src/views/dms';

describe('GIF / image URL auto-embed', () => {
  it('embeds a bare .gif URL on its own line', () => {
    const html = renderMarkdown('https://media.tenor.com/abc123/reaction.gif');
    expect(html).toContain('<img');
    expect(html).toContain('media.tenor.com');
  });

  it('embeds a bare .gif URL with query string', () => {
    const html = renderMarkdown('https://media.giphy.com/media/abc/giphy.gif?cid=xyz&rid=abc');
    expect(html).toContain('<img');
    expect(html).toContain('giphy.com');
  });

  it('does NOT embed a GIF URL mid-sentence', () => {
    const html = renderMarkdown('Check this out https://media.tenor.com/abc.gif it is funny');
    expect(html).not.toContain('<img');
    expect(html).toContain('https://media.tenor.com/abc.gif');
  });

  it('embeds a bare .jpg URL on its own line', () => {
    const html = renderMarkdown('https://example.com/photo.jpg');
    expect(html).toContain('<img');
    expect(html).toContain('example.com/photo.jpg');
  });

  it('embeds a bare GIF URL on its own line within multiline content', () => {
    const input = 'Look at this:\nhttps://media.tenor.com/abc.gif\nCool right?';
    const html = renderMarkdown(input);
    expect(html).toContain('<img');
  });

  it('existing markdown image syntax still works', () => {
    const html = renderMarkdown('![cool gif](https://media.tenor.com/abc.gif)');
    expect(html).toContain('<img');
  });

  it('embeds the exact standalone YouTube URL from thread 900093', () => {
    const html = renderMarkdown('https://www.youtube.com/watch?v=q6EoRBvdVPQ');
    expect(html).toContain('youtube.com/embed/q6EoRBvdVPQ');
    expect(html).toContain('Open on YouTube');
    expect(html).toContain('youtube.com/watch?v=q6EoRBvdVPQ');
  });

  it.each([
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
  ])('embeds supported standalone YouTube variant %s', (url) => {
    expect(renderMarkdown(url)).toContain('youtube.com/embed/dQw4w9WgXcQ');
  });

  it('shows an actionable mirror notice for an unsupported video host', () => {
    const html = renderMarkdown('https://vimeo.com/123456789');
    expect(html).toContain('video-embed-notice');
    expect(html).toContain('cannot be embedded here');
    expect(html).toContain('YouTube mirror');
    expect(html).toContain('href="https://vimeo.com/123456789"');
  });

  it('shows the mirror notice for a standalone dai.ly link', () => {
    expect(renderMarkdown('https://dai.ly/x9abcde')).toContain('video-embed-notice');
  });

  it('leaves normal and inline video links unchanged', () => {
    expect(renderMarkdown('https://example.com/page')).not.toContain('video-embed-notice');
    expect(renderMarkdown('See https://vimeo.com/123456789 for context')).not.toContain('video-embed-notice');
  });

  it('uses the same YouTube embedding behavior in DMs', () => {
    const html = renderDmContent('https://www.youtube.com/watch?v=q6EoRBvdVPQ');
    expect(html).toContain('youtube.com/embed/q6EoRBvdVPQ');
    expect(html).toContain('Open on YouTube');
  });
});
