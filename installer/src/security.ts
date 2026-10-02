export function randomToken(): string { return encode(crypto.getRandomValues(new Uint8Array(32))); }
export function encode(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
export function decode(value: string): Uint8Array { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
export async function digest(value: string | ArrayBuffer): Promise<string> { return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))); }
export async function hexDigest(value: ArrayBuffer): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)), b => b.toString(16).padStart(2, '0')).join(''); }
export function equal(a: string, b: string): boolean { let result = a.length ^ b.length; for (let i=0; i<Math.max(a.length,b.length); i++) result |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0); return result === 0; }
export async function seal(value: unknown, secret: string): Promise<string> {
 const keyBytes = decode(secret); if(keyBytes.length !== 32) throw new Error('Invalid encryption key');
 const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));
 return encode(iv)+'.'+encode(new Uint8Array(encrypted));
}
export async function unseal<T>(value: string, secret: string): Promise<T> {
 const [iv,body]=value.split('.'); if(!iv || !body) throw new Error('Invalid ciphertext');
 const key=await crypto.subtle.importKey('raw',decode(secret),'AES-GCM',false,['decrypt']);
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv)},key,decode(body)))) as T;
}
export function escape(value: string): string {return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
