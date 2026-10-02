// HMAC-signed short-lived token proving the Worker (not a client) built the
// ChatRoom DO request. The DO binding has no independent auth of its own -
// it fully trusts the meta fields on the incoming request. Today that's safe
// only because the single caller (handleChatWebSocket) always recomputes
// author_id/scope/mod/post server-side before forwarding. This token makes
// that guarantee independently enforceable at the DO, so a future mistaken
// call site can't silently reopen it.

const TOKEN_TTL_MS = 60_000;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = '';
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const str = atob(b64);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

function payloadFor(authorId: number | null, scope: string, isMod: boolean, canPost: boolean, exp: number): string {
  return `${authorId ?? ''}|${scope}|${isMod ? '1' : '0'}|${canPost ? '1' : '0'}|${exp}`;
}

export async function signChatAuth(
  secret: string,
  authorId: number | null,
  scope: string,
  isMod: boolean,
  canPost: boolean,
): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = payloadFor(authorId, scope, isMod, canPost, exp);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${b64url(new TextEncoder().encode(payload).buffer as ArrayBuffer)}.${b64url(sig)}`;
}

export async function verifyChatAuth(
  secret: string,
  token: string,
  authorId: number | null,
  scope: string,
  isMod: boolean,
  canPost: boolean,
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts as [string, string];

  let payload: string;
  let sig: Uint8Array;
  try {
    payload = new TextDecoder().decode(b64urlDecode(payloadB64));
    sig = b64urlDecode(sigB64);
  } catch {
    return false;
  }

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payload));
  if (!valid) return false;

  const fields = payload.split('|');
  if (fields.length !== 5) return false;
  const [pAuthorId, pScope, pMod, pPost, pExp] = fields;
  if (Date.now() > Number(pExp)) return false;
  if (pScope !== scope) return false;
  if (pMod !== (isMod ? '1' : '0')) return false;
  if (pPost !== (canPost ? '1' : '0')) return false;
  if (pAuthorId !== (authorId == null ? '' : String(authorId))) return false;
  return true;
}
