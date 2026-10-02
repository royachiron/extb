// Cloudflare Turnstile partials. One home for the script tag + widget markup
// previously copy-pasted into questions.ts, topic.ts and feed.ts (all emitted
// byte-identical output; layout.ts initTurnstile uses the explicit-render
// loader and is intentionally separate).
import { esc } from './layout-utils';

export function turnstileScript(siteKey?: string): string {
  if (!siteKey) return '';
  return `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
}

/** Bare widget div (questions form). */
export function turnstileWidget(siteKey?: string): string {
  if (!siteKey) return '';
  return `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}"></div>`;
}

/** Widget wrapped in the composer's margin block (topic + feed reply forms). */
export function turnstileWidgetBlock(siteKey?: string): string {
  if (!siteKey) return '';
  return `<div style="margin-top:16px;"><div class="cf-turnstile" data-sitekey="${esc(siteKey)}"></div></div>`;
}
