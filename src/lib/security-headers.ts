// Baseline browser-hardening headers.
//
// Applied to HTML responses only. JSON and media endpoints have their own
// content-type-specific headers (notably src/api/media.ts already sets
// nosniff + Content-Disposition).
//
// CSP is enforced (flipped from Report-Only after the soak period).
// 'unsafe-inline' on script-src means CSP does NOT block XSS from unescaped
// user content getting into inline <script> - it only blocks non-inline
// third-party script injection. Follow-up (not yet done): wire a per-response
// nonce through ctx and replace 'unsafe-inline' with 'nonce-XYZ' on
// script-src, which is the real fix for that gap.
//
// HSTS ships WITHOUT 'preload' on first deploy. Preload is a one-way door
// (browsers cache it for ~2 years and removing requires submission removal).
// Add 'preload' only after we're sure every community subdomain is HTTPS.

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Images: own origin, data: URIs (for inline SVG/icons), any HTTPS host
  // because users embed external images via markdown.
  "img-src 'self' data: https:",
  // Audio/video same rationale.
  "media-src 'self' https:",
  // Scripts: own origin + the three CDNs we actually load
  // (htmx from unpkg, Cropper.js from jsdelivr, Turnstile from CF).
  // 'unsafe-inline' covers inline <script> blocks in views; planned for
  // nonce-based replacement in a follow-up. 'unsafe-eval' added for htmx 2.0.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  // Styles: own origin + inline (extensive inline style="..." usage in views).
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // XHR/fetch/EventSource/WebSocket: own origin + Turnstile + chat WebSocket.
  // 'self' covers wss:// to the same host in modern browsers; the explicit
  // wss origins are belt-and-suspenders for the planned enforce flip.
  "connect-src 'self' https://challenges.cloudflare.com wss:",
  // Iframes we embed: Turnstile widget + YouTube embeds in posts/DMs.
  "frame-src https://challenges.cloudflare.com https://www.youtube.com",
  // Service worker.
  "worker-src 'self'",
  // Clickjacking defense. Overrides X-Frame-Options for modern browsers
  // and is stricter (no exceptions).
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const CSP = CSP_DIRECTIVES.join('; ');

function addVary(headers: Headers, name: string): void {
  const existing = headers.get('Vary');
  if (!existing) {
    headers.set('Vary', name);
    return;
  }
  const values = existing.split(',').map((v) => v.trim().toLowerCase());
  if (!values.includes(name.toLowerCase())) headers.set('Vary', `${existing}, ${name}`);
}

export function applySecurityHeaders(response: Response): Response {
  const contentType = response.headers.get('content-type') || '';
  // Skip non-HTML responses (JSON, media, redirects with no body, etc.).
  // /media/* sets its own safe headers already.
  if (!contentType.includes('text/html')) return response;

  const merged = new Response(response.body, response);
  merged.headers.set('Content-Security-Policy', CSP);
  merged.headers.set('X-Content-Type-Options', 'nosniff');
  // Legacy clickjacking guard. CSP frame-ancestors is stricter but
  // older crawlers/Lynx-likes only honor X-Frame-Options.
  merged.headers.set('X-Frame-Options', 'DENY');
  merged.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // 2-year HSTS without preload. includeSubDomains is safe because CF DNS
  // already routes every community subdomain through HTTPS.
  merged.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  // Disable powerful browser features we never use. interest-cohort=()
  // opts the site out of Topics/FLoC.
  merged.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  // Full-page navigations and HTMX partials share URLs but are different
  // representations. Without these, Android/PWA browser caches can replay a
  // partial response as the top-level document after reopening the app.
  merged.headers.set('Cache-Control', 'private, no-store, must-revalidate');
  addVary(merged.headers, 'HX-Request');
  addVary(merged.headers, 'Cookie');
  return merged;
}
