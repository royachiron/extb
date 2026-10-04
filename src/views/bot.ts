import type { Room } from '../types';
import { esc } from './layout';
import { getBotBranch, deriveTitle, type BotBranch, type HelperConfig } from '../lib/bot-copy';

export interface BotPanelOpts {
  /** 'chat' = ephemeral panel inserted into #chat-messages; 'page' = /bot page. */
  variant: 'chat' | 'page';
  botName: string;
  guidance?: HelperConfig;
  locale?: string;
  rooms?: Room[];
  applicationRoomSlug?: string;
}

/** Shared .bot-panel shell (header, title, body, option buttons) - the part
 *  every branch shares. */
function botPanelShell(opts: BotPanelOpts & { title: string; optionsHtml: string }, innerHtml: string): string {
  const close = opts.variant === 'chat'
    ? `<button type="button" class="bot-close" data-bot-close title="${opts.locale === 'he' ? 'סגירה' : 'Close'}" aria-label="${opts.locale === 'he' ? 'סגירת העוזר' : 'Close helper'}">✕</button>`
    : '';
  return `
    <div class="bot-panel" data-variant="${opts.variant}">
      <div class="bot-hd">
        <span class="bot-name">🤝 ${esc(opts.botName)}</span>
        <span class="bot-only-you">${opts.locale === 'he' ? 'גלוי רק לך' : 'only visible to you'}</span>
        ${close}
      </div>
      <p class="bot-title">${esc(opts.title)}</p>
      ${innerHtml}
      <div class="bot-opts">${opts.optionsHtml}</div>
    </div>`;
}

function optionsHtml(options: BotBranch['options']): string {
  return options
    .map(o => `<button type="button" class="bot-opt" data-bot-branch="${esc(o.branch)}">${esc(o.label)}</button>`)
    .join('');
}

/**
 * One dialogue node. Same markup on both surfaces so the layout.ts delegated
 * handler ([data-bot-branch] click -> fetch /bot/panel -> replace closest
 * .bot-panel) works everywhere. No <script>, no <style> - HTMX/insert safe.
 */
export function renderBotPanel(branchId: string, opts: BotPanelOpts): string {
  const branch: BotBranch = getBotBranch(branchId, opts.guidance, opts.locale);
  if (branch.id === 'intro') branch.templatePostRoom = opts.applicationRoomSlug;

  const paragraphs = branch.paragraphs
    .map(p => `<p class="bot-p">${esc(p)}</p>`)
    .join('');

  const roomLinks = branch.id === 'room' ? (opts.rooms ?? []).map(room =>
    `<p class="bot-p"><a href="/r/${encodeURIComponent(room.slug)}">${esc(room.name)}</a></p>`).join('') : '';

  // Templates in a branch with `templatePostRoom` open a prefilled composer
  // (title derived from the template's own first sentence) instead of Copy -
  // these are topic posts, not chat/DM lines. Branches without it (reply
  // helpers, chat-only lobby lines) keep the plain Copy button.
  const templates = (branch.templates ?? [])
    .map(t => {
      const action = branch.templatePostRoom
        ? (() => {
            const href = `/post?room=${encodeURIComponent(branch.templatePostRoom!)}&title=${encodeURIComponent(deriveTitle(t))}&body=${encodeURIComponent(t)}`;
            // /post's dual-render path only wraps in renderLayout when reached
            // via htmx (hx-get + hx-target=".main"), matching the FAB "new
            // topic" link in layout.ts - a plain <a href> full navigation
            // renders the raw unstyled form fragment (no CSS, no shell).
            return `<a class="bot-copy-btn" href="${href}" hx-get="${href}" hx-target=".main" hx-push-url="true">${opts.locale === 'he' ? 'פתיחת נושא' : 'Start a post'}</a>`;
          })()
        : `<button type="button" class="bot-copy-btn" data-bot-copy>${opts.locale === 'he' ? 'העתקה' : 'Copy'}</button>`;
      return `
      <div class="bot-template-wrap">
        <pre class="bot-template">${esc(t)}</pre>
        ${action}
      </div>`;
    })
    .join('');

  return botPanelShell(
    { ...opts, title: branch.title, optionsHtml: optionsHtml(branch.options) },
    paragraphs + roomLinks + templates,
  );
}

/** Full /bot helper page body (dual render path handled by the API handler). */
export function renderBotPage(opts: Omit<BotPanelOpts, 'variant'> & { branchId: string }): string {
  return `
    <div class="bot-page">
      <h1 style="font-size:22px;margin:0 0 6px;">${opts.locale === 'he' ? 'צעדים ראשונים' : 'Getting started'}</h1>
      <p style="color:var(--text-muted);font-size:14px;margin:0 0 16px;">
        ${opts.locale === 'he' ? 'הצעות להשתתפות בקהילה. אפשר לקרוא, להעתיק ולערוך. אפשר גם להקליד' : 'Suggestions for participating. Read, copy, or edit them. You can also type'} <code>/bot</code>.
      </p>
      ${renderBotPanel(opts.branchId, { ...opts, variant: 'page' })}
    </div>`;
}
