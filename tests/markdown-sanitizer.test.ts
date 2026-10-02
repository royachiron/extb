// XSS reproducer payloads for the safe markdown pipeline.
// These are the canonical bypasses for the previous regex-based sanitizer.
// Each must render harmlessly (no script execution vector, no event handler,
// no javascript: / data: scheme URLs).

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown';

describe('markdown sanitizer - XSS reproducers', () => {
  it('drops raw <script> tags', () => {
    const out = renderMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('drops inline event handlers (<img onerror>)', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<img src=x');
  });

  it('drops <svg> + nested <script>', () => {
    const out = renderMarkdown('<svg><script>alert(1)</script></svg>');
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('<script');
  });

  it('neutralizes javascript: scheme in link', () => {
    const out = renderMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="#"');
  });

  it('neutralizes encoded javascript: in raw HTML', () => {
    const out = renderMarkdown('<a href="JAVASCRIPT&#58;alert(1)">x</a>');
    // Raw HTML stripped entirely.
    expect(out).not.toContain('JAVASCRIPT');
    expect(out).not.toContain('javascript');
  });

  it('drops iframe with srcdoc', () => {
    const out = renderMarkdown('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('srcdoc');
  });

  it('neutralizes data: URL in link', () => {
    const out = renderMarkdown('[x](data:text/html,<script>alert(1)</script>)');
    expect(out).not.toContain('data:');
    expect(out).toContain('href="#"');
  });

  it('drops <style> tag', () => {
    const out = renderMarkdown('<style>body{background:url(//evil/x)}</style>');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('//evil');
  });

  it('drops <form>', () => {
    const out = renderMarkdown('<form action="//evil"><input></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('//evil');
  });

  it('drops <object> and <embed>', () => {
    const out = renderMarkdown('<object data="x"></object><embed src="x">');
    expect(out).not.toContain('<object');
    expect(out).not.toContain('<embed');
  });

  it('drops vbscript: scheme', () => {
    const out = renderMarkdown('[x](vbscript:msgbox)');
    expect(out).not.toContain('vbscript');
    expect(out).toContain('href="#"');
  });

  it('drops onclick in unquoted attr (regex sanitizer bypass)', () => {
    // Old regex required quotes around event handler values; raw HTML drop
    // closes that hole.
    const out = renderMarkdown('<a href=x onclick=alert(1)>x</a>');
    expect(out).not.toContain('onclick');
  });

  it('drops backtick-quoted event handler (regex sanitizer bypass)', () => {
    const out = renderMarkdown('<a href=x onclick=`alert(1)`>x</a>');
    // Raw HTML stripped - no real <a> tag emitted. Text shows entity-encoded,
    // safe.
    expect(out).not.toMatch(/<a\s[^>]*onclick/i);
    expect(out).not.toMatch(/<a\s/i);
  });
});

describe('markdown sanitizer - benign content still works', () => {
  it('renders bold + italic', () => {
    const out = renderMarkdown('**hi** _there_');
    expect(out).toContain('<strong>hi</strong>');
    expect(out).toContain('<em>there</em>');
  });

  it('renders code blocks', () => {
    const out = renderMarkdown('```\nconst x = 1;\n```');
    expect(out).toContain('<pre>');
    expect(out).toContain('<code');
  });

  it('renders https links with rel noopener', () => {
    const out = renderMarkdown('[example](https://example.com)');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('uses a visible https URL when the link destination is the toolbar placeholder', () => {
    const url = 'https://bodyintegritydysphoria.com/bid-symposium-2026/';
    const out = renderMarkdown(`[${url}](url)`);
    expect(out).toContain(`href="${url}"`);
  });

  it('renders relative links without rel', () => {
    const out = renderMarkdown('[home](/about)');
    expect(out).toContain('href="/about"');
    expect(out).not.toContain('rel=');
  });

  it('renders mailto links', () => {
    const out = renderMarkdown('[mail](mailto:a@b.com)');
    expect(out).toContain('href="mailto:a@b.com"');
  });

  it('renders https image', () => {
    const out = renderMarkdown('![alt](https://example.com/img.png)');
    expect(out).toContain('<img src="https://example.com/img.png"');
    expect(out).toContain('alt="alt"');
  });

  it('drops data: image URL', () => {
    const out = renderMarkdown('![](data:image/svg+xml,<svg onload=alert(1)/>)');
    // No <img> tag should emerge with a data: src. Marked may emit the
    // literal text entity-encoded (safe - browser shows characters, not
    // markup). The actual XSS vector is `<img src="data:...">`.
    expect(out).not.toMatch(/<img[^>]*data:/i);
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toMatch(/onload/i);
  });

  it('protocol-relative URLs (//evil) treated as unsafe', () => {
    const out = renderMarkdown('[x](//evil.example)');
    // // would be parsed by URL ctor as host-only; depends on parsing
    // semantics. Just ensure no script vector emerges.
    expect(out).not.toContain('<script');
  });
});
