import type { Env } from './types';

// PBKDF2-SHA256, 100k iterations, 256-bit derived key, base64-encoded.
// Web Crypto only. Runs in Cloudflare Workers and Node 20 test env.

const PBKDF2_ITERATIONS = 100_000;
const DERIVED_BITS = 256;

const enc = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

async function derive(password: string, salt: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    DERIVED_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const bytes = await derive(password, salt);
  return bytesToBase64(bytes);
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  let expected: Uint8Array;
  try {
    expected = base64ToBytes(expectedHash);
  } catch {
    return false;
  }
  const actual = await derive(password, salt);
  if (actual.length !== expected.length) return false;
  // Timing-safe XOR-accumulate compare.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i]! ^ expected[i]!;
  }
  return diff === 0;
}

export function generateToken(byteLen: number = 32): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

/**
 * Generate a cryptographically random per-user password salt.
 * Base64-encoded for compact storage. 16 bytes (128 bits) is the standard
 * recommendation for password hash salts.
 */
export function generateSalt(byteLen: number = 16): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return bytesToBase64(buf);
}

export function sessionCookie(token: string, maxAgeDays: number): string {
  const maxAge = maxAgeDays * 86400;
  return `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearCookie(): string {
  return 'session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

/** Keep PBKDF2 work outside the Free plan HTTP request CPU budget. */
export async function hashPasswordForEnv(env: Env, password: string, salt: string): Promise<string> {
  if (!env.PASSWORD_HASHER) return hashPassword(password, salt);
  const stub = env.PASSWORD_HASHER.get(env.PASSWORD_HASHER.idFromName('password-hasher'));
  return stub.hashPassword(password, salt);
}

export async function verifyPasswordForEnv(env: Env, password: string, salt: string, expectedHash: string): Promise<boolean> {
  if (!env.PASSWORD_HASHER) return verifyPassword(password, salt, expectedHash);
  const stub = env.PASSWORD_HASHER.get(env.PASSWORD_HASHER.idFromName('password-hasher'));
  return stub.verifyPassword(password, salt, expectedHash);
}
