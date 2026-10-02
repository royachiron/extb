import type { Env } from '../types';
export const SCOPES = ['read', 'configuration', 'members', 'content', 'moderation', 'delete'] as const;
export type Scope = typeof SCOPES[number];
export interface AdminActor { id: number; tokenId: number | null; scopes: Scope[]; }
export async function hashSecret(secret: string): Promise<string> {
 const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
 return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function newSecret(): string {
 return 'extb_' + Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function authenticateMcp(req: Request, env: Env): Promise<AdminActor | null> {
 const match = /^Bearer (extb_[a-f0-9]{64})$/.exec(req.headers.get('authorization') || '');
 if (!match) return null;
 const row = await env.DB.prepare(`SELECT t.id,t.owner_id,t.scopes FROM admin_api_tokens t JOIN users u ON u.id=t.owner_id WHERE t.token_hash=? AND t.revoked_at IS NULL AND u.access_level='admin' AND u.is_banned=0`).bind(await hashSecret(match[1]!)).first<{id:number;owner_id:number;scopes:string}>();
 if (!row) return null;
 let scopes: Scope[];
 try { scopes = JSON.parse(row.scopes); if (!Array.isArray(scopes) || scopes.some(s => !SCOPES.includes(s))) return null; } catch { return null; }
 await env.DB.prepare("UPDATE admin_api_tokens SET last_used_at=datetime('now') WHERE id=?").bind(row.id).run();
 return { id: row.owner_id, tokenId: row.id, scopes };
}
export async function authorize(env: Env, actor: AdminActor, scope: Scope): Promise<void> {
 if (!actor.scopes.includes(scope)) throw new Error('Permission denied');
 const user = await env.DB.prepare('SELECT access_level,is_banned FROM users WHERE id=?').bind(actor.id).first<{access_level:string;is_banned:number}>();
 if (!user || user.access_level !== 'admin' || user.is_banned) throw new Error('Administrator access required');
 if (actor.tokenId !== null) {
 const token = await env.DB.prepare('SELECT scopes FROM admin_api_tokens WHERE id=? AND owner_id=? AND revoked_at IS NULL').bind(actor.tokenId,actor.id).first<{scopes:string}>();
 if (!token || !JSON.parse(token.scopes).includes(scope)) throw new Error('Token revoked or permission denied');
 }
}
export function auditStatement(env: Env, actor: AdminActor, action: string, target: string) {
 return env.DB.prepare('INSERT INTO admin_api_audit(actor_id,token_id,action,target) VALUES (?,?,?,?)').bind(actor.id,actor.tokenId,action,target);
}
