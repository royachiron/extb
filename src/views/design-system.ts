import { renderLayout, esc } from './layout';
import type { AppContext } from '../types';
import { listRooms } from '../db';

export async function renderDesignSystem(req: Request, ctx: AppContext): Promise<Response> {
  const rooms = await listRooms(ctx.env);

  const body = `
<meta name="robots" content="noindex">
<style>
  .ds-section { margin-bottom: 56px; }
  .ds-label { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color); }
  .ds-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .ds-col { display: flex; flex-direction: column; gap: 12px; }
  .ds-swatch { width: 80px; height: 80px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding: 8px; font-size: 10px; font-weight: 700; color: #fff; }
  .ds-swatch-dark { color: #111827; }
  .ds-preview-box { background: #f3f4f6; border-radius: 12px; padding: 24px; margin-top: 8px; }
  .ds-logo-mark { width: 64px; height: 64px; border-radius: 50%; background: #1d4ed8; display: flex; align-items: center; justify-content: center; font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 24px; color: #fff; letter-spacing: -1px; }
  .ds-logo-mark-lg { width: 120px; height: 120px; font-size: 44px; letter-spacing: -2px; }
  .ds-logo-mark-sm { width: 32px; height: 32px; font-size: 12px; }
  .ds-logo-reversed { background: #fff; border: 2px solid #e5e7eb; color: #111827; }
  .ds-page-title { font-size: 32px; font-weight: 900; letter-spacing: -0.03em; color: var(--text-main); margin: 0 0 8px; }
  .ds-page-sub { color: var(--text-muted); font-size: 15px; margin: 0 0 48px; }
</style>

<h1 class="ds-page-title">Design System</h1>
<p class="ds-page-sub">EXTB component library &mdash; all interactive states live</p>

<!-- LOGO -->
<div class="ds-section">
  <div class="ds-label">Logo Mark &mdash; EXTB Bold Sans</div>
  <div class="ds-row" style="align-items:flex-end; gap:20px;">
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div class="ds-logo-mark ds-logo-mark-sm">EXTB</div>
      <span style="font-size:11px;color:var(--text-muted)">32px</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div class="ds-logo-mark">EXTB</div>
      <span style="font-size:11px;color:var(--text-muted)">64px</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div class="ds-logo-mark ds-logo-mark-lg">EXTB</div>
      <span style="font-size:11px;color:var(--text-muted)">120px</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
      <div class="ds-logo-mark ds-logo-reversed" style="width:120px;height:120px;font-size:44px;letter-spacing:-2px;">EXTB</div>
      <span style="font-size:11px;color:var(--text-muted)">Reversed White</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;justify-content:center;">
      <a href="/" class="brand" style="font-size:40px;">EXTB</a>
      <span style="font-size:11px;color:var(--text-muted)">Nav brand</span>
    </div>
  </div>
</div>

<!-- COLOR TOKENS -->
<div class="ds-section">
  <div class="ds-label">Color Tokens</div>
  <div class="ds-row">
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch" style="background:#1d4ed8;">--primary</div>
      <span style="font-size:11px;color:var(--text-muted)">#1d4ed8</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch" style="background:#1e40af;">--primary-hover</div>
      <span style="font-size:11px;color:var(--text-muted)">#1e40af</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch" style="background:#dc2626;">--danger</div>
      <span style="font-size:11px;color:var(--text-muted)">#dc2626</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch ds-swatch-dark" style="background:#f9fafb;border:1px solid #e5e7eb;">--bg-color</div>
      <span style="font-size:11px;color:var(--text-muted)">#f9fafb</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch ds-swatch-dark" style="background:#ffffff;border:1px solid #e5e7eb;">--card-bg</div>
      <span style="font-size:11px;color:var(--text-muted)">#ffffff</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch ds-swatch-dark" style="background:#111827;">--text-main</div>
      <span style="font-size:11px;color:var(--text-muted)">#111827</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch" style="background:#4b5563;">--text-muted</div>
      <span style="font-size:11px;color:var(--text-muted)">#4b5563</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div class="ds-swatch ds-swatch-dark" style="background:#d1d5db;">--border-color</div>
      <span style="font-size:11px;color:var(--text-muted)">#d1d5db</span>
    </div>
  </div>
</div>

<!-- TYPOGRAPHY -->
<div class="ds-section">
  <div class="ds-label">Typography</div>
  <div style="display:flex;flex-direction:column;gap:12px;">
    <div style="font-size:32px;font-weight:900;letter-spacing:-0.03em;color:var(--text-main);">Page Title - 32px/900</div>
    <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;color:var(--text-main);">Section Heading - 24px/800</div>
    <div style="font-size:18px;font-weight:700;color:var(--text-main);">Card Title - 18px/700</div>
    <div style="font-size:15px;line-height:1.6;color:var(--text-main);">Body text - 15px/1.6. Used for post content and descriptions. Readable at all sizes with good line height.</div>
    <div style="font-size:14px;font-weight:600;color:var(--text-main);">Label / Nav - 14px/600</div>
    <div style="font-size:13px;color:var(--text-muted);">Meta / hint text - 13px muted. Used for timestamps, hints, secondary info.</div>
    <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);">Eyebrow label - 12px/700 uppercase</div>
    <a href="#">Link text - primary color, 500 weight</a>
  </div>
</div>

<!-- BUTTONS -->
<div class="ds-section">
  <div class="ds-label">Buttons</div>
  <div class="ds-row">
    <button class="btn">Primary</button>
    <button class="btn btn-sm">Primary SM</button>
    <button class="btn btn-secondary">Secondary</button>
    <button class="btn btn-secondary btn-sm">Secondary SM</button>
    <button class="btn btn-danger">Danger</button>
    <button class="btn btn-danger btn-sm">Danger SM</button>
    <button class="btn btn-ghost">Ghost</button>
    <button class="btn" disabled>Disabled</button>
  </div>
</div>

<!-- BADGES -->
<div class="ds-section">
  <div class="ds-label">Badges</div>
  <div class="ds-row">
    <span class="badge badge-primary">Primary</span>
    <span class="badge badge-success">Success</span>
    <span class="badge badge-danger">Danger</span>
    <span class="badge badge-warn">Warning</span>
    <span class="badge badge-neutral">Neutral</span>
  </div>
</div>

<!-- FORM INPUTS -->
<div class="ds-section">
  <div class="ds-label">Form Inputs</div>
  <div style="max-width:480px;display:flex;flex-direction:column;gap:20px;">
    <div class="form-group">
      <label class="form-label">Display name</label>
      <input type="text" placeholder="e.g. Alex M.">
      <div class="form-hint">Shown publicly on all your posts.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input type="email" placeholder="you@example.com">
    </div>
    <div class="form-group">
      <label class="form-label">Password - error state</label>
      <input type="password" class="error" value="short">
      <div class="form-error">Password must be at least 8 characters.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Disabled input</label>
      <input type="text" value="Cannot edit this" disabled>
    </div>
    <div class="form-group">
      <label class="form-label">Message</label>
      <textarea rows="4" placeholder="Write something..."></textarea>
      <div class="form-hint">Markdown supported.</div>
    </div>
    <div class="form-group">
      <label class="form-label">Room</label>
      <select>
        <option>General</option>
        <option>Amputation</option>
        <option>Coping</option>
      </select>
    </div>
  </div>
</div>

<!-- CARDS -->
<div class="ds-section">
  <div class="ds-label">Cards</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;">
    <div class="card">
      <div class="card-title">Card Title</div>
      <div class="card-meta">Subtitle or meta text</div>
      <p style="margin:12px 0 0;font-size:14px;color:var(--text-muted);">Card body content. Hover to see the border highlight effect.</p>
    </div>
    <div class="card">
      <div class="card-title">With action</div>
      <div class="card-meta">Posted 2h ago</div>
      <p style="margin:12px 0 16px;font-size:14px;color:var(--text-muted);">Another card with a button inside.</p>
      <button class="btn btn-sm">View thread</button>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div class="card-title">With badge</div>
        <span class="badge badge-primary">New</span>
      </div>
      <div class="card-meta">Community · 14 replies</div>
    </div>
  </div>
</div>

<!-- BREADCRUMB -->
<div class="ds-section">
  <div class="ds-label">Breadcrumb</div>
  <nav class="breadcrumb">
    <a href="/">Home</a>
    <span class="breadcrumb-sep">›</span>
    <a href="/r/general">General</a>
    <span class="breadcrumb-sep">›</span>
    <span>My thread title</span>
  </nav>
</div>

<!-- PAGINATION -->
<div class="ds-section">
  <div class="ds-label">Pagination</div>
  <div class="pagination">
    <button class="disabled">‹</button>
    <a href="#" class="active">1</a>
    <a href="#">2</a>
    <a href="#">3</a>
    <span style="padding:0 8px;color:var(--text-muted);font-size:14px;">…</span>
    <a href="#">12</a>
    <button>›</button>
  </div>
</div>

<!-- FLASH BANNERS -->
<div class="ds-section">
  <div class="ds-label">Flash Banners</div>
  <div style="display:flex;flex-direction:column;gap:12px;">
    <div class="flash">Default notice - action completed or general info.</div>
    <div class="flash flash-warn">Warning - email not verified. Some features restricted.</div>
    <div class="flash flash-success">Success - your changes have been saved.</div>
  </div>
</div>

<!-- TOASTS -->
<div class="ds-section">
  <div class="ds-label">Toasts (static preview)</div>
  <div style="display:flex;flex-direction:column;gap:12px;max-width:320px;">
    <div class="toast toast-success" style="position:static;animation:none;">
      <span>Post saved successfully</span>
      <button class="toast-close">×</button>
    </div>
    <div class="toast toast-error" style="position:static;animation:none;">
      <span>Something went wrong. Try again.</span>
      <button class="toast-close">×</button>
    </div>
  </div>
</div>

<!-- SKELETON -->
<div class="ds-section">
  <div class="ds-label">Skeleton Loaders</div>
  <div style="display:flex;flex-direction:column;gap:16px;max-width:480px;">
    <div class="skeleton skeleton-card"></div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div class="skeleton skeleton-text" style="width:60%"></div>
      <div class="skeleton skeleton-text" style="width:100%"></div>
      <div class="skeleton skeleton-text-sm" style="width:40%"></div>
    </div>
  </div>
</div>

<!-- EMPTY STATE -->
<div class="ds-section">
  <div class="ds-label">Empty State</div>
  <div class="empty-state" style="max-width:480px;">
    <h3>No posts yet</h3>
    <p>Be the first to start a conversation in this room.</p>
    <button class="btn">New thread</button>
  </div>
</div>

<!-- POST CARD EXAMPLE -->
<div class="ds-section">
  <div class="ds-label">Post Card</div>
  <div class="post-card">
    <div class="post-sidebar">
      <div class="post-avatar">AM</div>
    </div>
    <div class="post-main">
      <div class="post-header">
        <span class="post-author">Alex M.</span>
        <span class="post-time">2 hours ago</span>
        <span class="badge badge-primary" style="margin-left:auto;">Member</span>
      </div>
      <div class="post-body">
        <p>This is what a forum post looks like with the design system applied. Body text is 16px with 1.7 line-height for comfortable reading.</p>
        <blockquote>Quoted content appears like this, with a left border in the primary color.</blockquote>
        <p>And <code>inline code</code> renders with a subtle background.</p>
      </div>
      <div class="post-actions">
        <button class="action-btn">👍 12</button>
        <button class="action-btn">💬 Reply</button>
        <button class="action-btn">🔗 Share</button>
      </div>
    </div>
  </div>
</div>
`;

  return new Response(
    renderLayout({
      user: ctx.user,
      rooms,
      title: 'Design System',
      body,
      csrfToken: ctx.csrfToken,
    }),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
