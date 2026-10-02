import { describe, it, expect } from 'vitest';
import { vapidKeypairValid } from './webpush';

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function fromB64url(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
async function genPair() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;
  const x = fromB64url(jwk.x!), y = fromB64url(jwk.y!), d = fromB64url(jwk.d!);
  const pub = new Uint8Array(65); pub[0] = 0x04; pub.set(x, 1); pub.set(y, 33);
  return { pub: b64url(pub), priv: b64url(d) };
}

describe('vapidKeypairValid', () => {
  it('returns true for a matched P-256 keypair', async () => {
    const { pub, priv } = await genPair();
    expect(await vapidKeypairValid(pub, priv)).toBe(true);
  });
  it('returns false for mismatched keys', async () => {
    const a = await genPair(), b = await genPair();
    expect(await vapidKeypairValid(a.pub, b.priv)).toBe(false);
  });
});
