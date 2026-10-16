// Maintenance write freeze. When settings.read_only = '1' every state-changing
// request is refused before it reaches a handler (and the chat Durable Object
// refuses sends - see durable/chat-room.ts). Used during database maintenance
// without losing writes. Flip with SQL; no deploy needed:
//   UPDATE settings SET value = '1' WHERE key = 'read_only';

export const READ_ONLY_MESSAGE =
  "Maintenance is in progress - posting is paused for a few minutes. Nothing you typed was lost; try again shortly.";

export function isWriteRequest(req: Request): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
}

/**
 * 503 for a refused write. HTMX requests get a toast via HX-Trigger (htmx
 * processes it before checking the status, and does not swap a 503, so the
 * form keeps what the user typed); plain requests get a short HTML page.
 */
export function readOnlyResponse(req: Request): Response {
  const headers = new Headers({ 'Retry-After': '300', 'Cache-Control': 'no-store' });
  if (req.headers.get('hx-request') === 'true') {
    headers.set('HX-Trigger', JSON.stringify({ toast: { type: 'error', message: READ_ONLY_MESSAGE } }));
    return new Response('', { status: 503, headers });
  }
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back in a few minutes</title>` +
    `<body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;line-height:1.5">` +
    `<h1 style="font-size:20px">Back in a few minutes</h1><p>${READ_ONLY_MESSAGE}</p><p><a href="javascript:history.back()">Go back</a></p></body>`,
    { status: 503, headers },
  );
}
