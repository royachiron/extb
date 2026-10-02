/**
 * Shared HTTP response helpers. Every api/ handler used to re-declare these
 * locally; this is the single home. Header names are case-insensitive per
 * HTTP - the Workers runtime lowercases them on the wire either way.
 */

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * 303 See Other by default (correct for POST-redirect-GET). auth/users
 * historically reply 302 Found - they pass it explicitly.
 */
export function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location } });
}
