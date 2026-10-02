import { localizeHtml } from '../src/lib/localization';
import { describe, expect, it } from 'vitest';
import { renderSidebar as renderSidebarRaw } from '../src/views/layout-shell';
import { renderLayout } from '../src/views/layout';
const renderSidebar = (...args: Parameters<typeof renderSidebarRaw>) => localizeHtml(renderSidebarRaw(...args), 'en');

const authenticatedUser = { id: 7, email_verified: 1, is_approved: 1 } as any;

function sidebarWithUnread(unreadCount: number, user: any = authenticatedUser): string {
  const rooms = [{
    id: 1,
    name: 'General',
    slug: 'general',
    unread_count: unreadCount,
  }] as any;

  return renderSidebar({
    user,
    verified: !!user && user.email_verified === 1,
    rooms,
    memberRooms: rooms,
    lockedRooms: [],
    csrfToken: 'csrf-token',
  });
}

function balancedBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Missing CSS marker: ${marker}`);

  const openingBrace = source.indexOf('{', markerIndex);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  throw new Error(`Unclosed CSS block: ${marker}`);
}

function cssRule(source: string, selector: string): string {
  return balancedBlock(source, `${selector} {`);
}

describe('sidebar mark-all-read action', () => {
  it('renders one semantic HTMX form inside Main when a room is unread', () => {
    const sidebar = sidebarWithUnread(2);
    const mainNav = sidebar.slice(
      sidebar.indexOf('<h3>Main</h3>'),
      sidebar.indexOf('<div class="sep"></div>'),
    );
    const formCount = sidebar.match(/<form\b/g)?.length ?? 0;
    const formTag = mainNav.match(/<form\b[^>]*>/)?.[0] ?? '';

    expect(formCount).toBe(1);
    expect(mainNav).toMatch(/<ul>[\s\S]*<li>[\s\S]*<form[^>]*>[\s\S]*<\/form>[\s\S]*<\/li>[\s\S]*<\/ul>/);
    expect(formTag).toContain('method="POST"');
    expect(formTag).toContain('action="/threads/mark-read"');
    expect(formTag).toContain('hx-post="/threads/mark-read"');
    expect(formTag).toContain('hx-swap="none"');
    expect(mainNav).toContain('<input type="hidden" name="csrf" value="csrf-token">');
    expect(mainNav).toContain('class="sidebar-read-all-btn"');
    expect(mainNav).toContain('title="Mark all threads read" aria-label="Mark all threads read"');
    expect(mainNav).toMatch(/<svg[^>]*aria-hidden="true"[^>]*fill="none"[^>]*stroke="currentColor"[^>]*>[\s\S]*<path[^>]*>[\s\S]*<path[^>]*>[\s\S]*<\/svg>/);
    expect(mainNav).toContain('<span class="room-icon">');
    expect(mainNav).toContain('<span class="room-label">Mark all read</span>');
  });

  it('omits the form when no room is unread', () => {
    const sidebar = sidebarWithUnread(0);

    expect(sidebar).not.toContain('<form');
    expect(sidebar).not.toContain('sidebar-read-all-btn');
    expect(sidebar).not.toContain('/threads/mark-read');
  });

  it('omits the control for a signed-out user even when a room is unread', () => {
    const sidebar = sidebarWithUnread(3, null);

    expect(sidebar).not.toContain('<form');
    expect(sidebar).not.toContain('sidebar-read-all-btn');
    expect(sidebar).not.toContain('/threads/mark-read');
  });

  it('ships compact, expanded desktop, and mobile drawer styles', () => {
    const page = renderLayout({
      user: null,
      rooms: [],
      title: 'Test',
      body: '',
    });
    const css = page.slice(page.indexOf('<style>') + '<style>'.length, page.indexOf('</style>'));
    const compactButton = cssRule(css, '.sidebar-read-all-btn');
    const compactLabel = cssRule(css, '.sidebar-read-all-btn .room-label');
    const expandedButton = cssRule(css, 'body:not(.sidebar-collapsed) .sidebar .sidebar-read-all-btn');
    const expandedLabel = cssRule(css, 'body:not(.sidebar-collapsed) .sidebar .sidebar-read-all-btn .room-label');
    const focusState = cssRule(css, '.sidebar-read-all-btn:focus-visible');

    expect(compactButton).toContain('min-width: 44px;');
    expect(compactButton).toContain('height: 44px;');
    expect(compactButton).toContain('justify-content: center;');
    expect(compactButton).toContain('background: transparent;');
    expect(compactButton).toContain('color: var(--text-muted);');
    expect(compactLabel).toContain('display: none;');
    expect(expandedButton).toContain('width: 100%;');
    expect(expandedButton).toContain('justify-content: flex-start;');
    expect(expandedButton).toContain('gap: 12px;');
    expect(expandedLabel).toContain('display: block;');
    expect(focusState).toContain('outline: 2px solid var(--primary);');

    const mobileDrawer = balancedBlock(
      css,
      '@media (max-width: 768px) {\n    .hamburger { display: flex; }',
    );
    const mobileForm = cssRule(mobileDrawer, '.sidebar .sidebar-read-all-form');
    const mobileButton = cssRule(mobileDrawer, '.sidebar .sidebar-read-all-btn');
    const mobileLabel = cssRule(mobileDrawer, '.sidebar .sidebar-read-all-btn .room-label');

    expect(mobileForm).toContain('width: 100%;');
    expect(mobileButton).toContain('width: 100%;');
    expect(mobileButton).toContain('justify-content: flex-start;');
    expect(mobileButton).toContain('gap: 12px;');
    expect(mobileLabel).toContain('display: block;');
  });
});
