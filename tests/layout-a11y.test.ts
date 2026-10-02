import { localizeHtml } from '../src/lib/localization';
import { describe, it, expect } from 'vitest';
import { renderLayout as renderLayoutRaw } from '../src/views/layout';
import { renderReactions } from '../src/views/post';
import { renderPoll } from '../src/views/topic';
const renderLayout = (...args: Parameters<typeof renderLayoutRaw>) => localizeHtml(renderLayoutRaw(...args), 'en');

const page = renderLayout({ user: null, rooms: [], title: 'Test', body: '<p>x</p>' });

describe('layout accessibility', () => {
  it('renders a skip link targeting main content', () => {
    expect(page).toContain('class="skip-link" href="#main-content"');
    expect(page).toContain('id="main-content" tabindex="-1"');
  });

  it('includes a prefers-reduced-motion override block', () => {
    expect(page).toContain('@media (prefers-reduced-motion: reduce)');
    expect(page).toContain('animation-duration: 0.01ms !important');
  });

  it('labels the primary nav and sidebar landmarks', () => {
    expect(page).toContain('<nav aria-label="Primary">');
    expect(page).toContain('id="sidebar-drawer" aria-label="Rooms and pages"');
  });

  it('labels the dark-mode toggle', () => {
    expect(page).toContain('id="dark-mode-toggle" class="icon-btn" title="Toggle Theme" aria-label="Toggle dark mode"');
  });

  it('ships the font-size toggle with init from localStorage', () => {
    expect(page).toContain('id="font-size-toggle"');
    expect(page).toContain("localStorage.getItem('fontSize')");
    expect(page).toContain('body.font-s { --base-font-size: 13.5px; }');
    expect(page).toContain('body.font-l { --base-font-size: 17px; }');
  });

  it('defaults theme from prefers-color-scheme without persisting', () => {
    expect(page).toContain("window.matchMedia('(prefers-color-scheme: dark)')");
    const init = page.slice(page.indexOf("window.matchMedia('(prefers-color-scheme: dark)')"));
    const osBranch = init.slice(0, init.indexOf('} catch(e) {}'));
    expect(osBranch).not.toContain('localStorage.setItem');
  });

  it('submits reply on Ctrl+Enter only (plain Enter inserts newline)', () => {
    const handler = page.slice(page.indexOf("matches('#reply-content')"));
    const block = handler.slice(0, handler.indexOf('});'));
    expect(block).toContain('(e.ctrlKey || e.metaKey)');
    expect(block).not.toContain("e.key === 'Enter' && !e.ctrlKey");
  });
});

describe('reactions accessibility', () => {
  it('labels active reaction chips and picker buttons', () => {
    const html = renderReactions(1, [{ emoji: '❤️', count: 3, users: 'a, b, c' }]);
    expect(html).toContain('aria-label="❤️ reaction, 3 - toggle"');
    expect(html).toContain('aria-label="React with 👍"');
  });

  it('uses CSS vars for the picker divider (no hardcoded hex)', () => {
    const html = renderReactions(1, []);
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe('poll dark-mode safety', () => {
  it('renders poll results without hardcoded hex colors', () => {
    const poll = { id: 1, multi_select: 0, ends_at: null, options: [{ id: 1, text: 'A', votes: 2 }, { id: 2, text: 'B', votes: 1 }] };
    const voted = renderPoll(poll, { id: 9 }, [1], { id: 1, short_id: 'abc123' });
    const voteForm = renderPoll(poll, { id: 9 }, [], { id: 1, short_id: 'abc123' });
    expect(voted).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(voteForm).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
