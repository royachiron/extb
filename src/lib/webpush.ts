// Web Push (RFC 8291 + RFC 8188 aes128gcm) using Web Crypto API only.
// Compatible with Cloudflare Workers edge runtime.

function b64url(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64decode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let pos = 0;
  for (const a of arrs) { out.set(a, pos); pos += a.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prkBuf = await crypto.subtle.sign('HMAC', saltKey, ikm);
  const prk = await crypto.subtle.importKey('raw', prkBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = new Uint8Array(length);
  let prev = new Uint8Array(0);
  let pos = 0;
  for (let i = 1; pos < length; i++) {
    const block = concat(prev, info, new Uint8Array([i]));
    const t = new Uint8Array(await crypto.subtle.sign('HMAC', prk, block));
    const take = Math.min(t.length, length - pos);
    out.set(t.subarray(0, take), pos);
    prev = t;
    pos += take;
  }
  return out;
}

async function signVapidJwt(
  audience: string,
  subject: string,
  privateKeyB64: string,
  publicKeyB64: string,
): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject })));
  const signingInput = `${header}.${payload}`;

  const pubBytes = b64decode(publicKeyB64);
  const privBytes = b64decode(privateKeyB64);
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: b64url(pubBytes.slice(1, 33)),
    y: b64url(pubBytes.slice(33, 65)),
    d: b64url(privBytes),
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(sig)}`;
}

export async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject: string,
): Promise<number> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await signVapidJwt(audience, subject, vapidPrivateKey, vapidPublicKey);

  // Ephemeral ECDH key pair
  const serverPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const serverPubJwk = await crypto.subtle.exportKey('jwk', serverPair.publicKey) as JsonWebKey;
  const serverPub = concat(new Uint8Array([0x04]), b64decode(serverPubJwk.x!), b64decode(serverPubJwk.y!));

  // Import subscriber public key and derive ECDH shared secret
  const subPub = b64decode(p256dh);
  const subPubKey = await crypto.subtle.importKey('raw', subPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  
  // Standard Web Crypto uses 'public', some older CF types used '$public'
  const deriveParams: any = { name: 'ECDH', public: subPubKey };
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(deriveParams, serverPair.privateKey, 256));

  // RFC 8291: derive IKM from auth_secret + ECDH secret
  const authSecret = b64decode(auth);
  const keyInfo = concat(new TextEncoder().encode('WebPush: info\x00'), subPub, serverPub);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // RFC 8188 aes128gcm: random salt, derive CEK + nonce
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\x00');
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\x00');
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // AES-128-GCM encrypt: plaintext + 0x02 padding delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const plaintext = concat(new TextEncoder().encode(payload), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));

  // RFC 8188 header: salt(16) || rs(4 BE) || keylen(1) || server_pub(65)
  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = 65;
  header.set(serverPub, 21);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Authorization': `vapid t=${jwt},k=${vapidPublicKey}`,
      'TTL': '43200',
      'Urgency': 'high',
      'Priority': 'high',
      'Topic': 'chat_msg',
    },
    body: concat(header, ciphertext),
  });

  return res.status;
}

/**
 * True iff `vapidPrivateKey` (raw 32-byte scalar, base64url) matches
 * `vapidPublicKey` (uncompressed 65-byte P-256 point, base64url). A mismatched
 * pair makes every push 403 - this confirms/rules that out in one call.
 */
export async function vapidKeypairValid(vapidPublicKey: string, vapidPrivateKey: string): Promise<boolean> {
  try {
    const pub = b64decode(vapidPublicKey);
    const x = b64url(pub.slice(1, 33));
    const y = b64url(pub.slice(33, 65));
    const privKey = await crypto.subtle.importKey(
      'jwk', { kty: 'EC', crv: 'P-256', x, y, d: b64url(b64decode(vapidPrivateKey)) },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
    );
    const pubKey = await crypto.subtle.importKey(
      'jwk', { kty: 'EC', crv: 'P-256', x, y },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const msg = new TextEncoder().encode('vapid-selfcheck');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privKey, msg);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, sig, msg);
  } catch {
    return false;
  }
}
