import type { AppContext } from '../types';
import { requireAdmin, verifyCsrf } from '../middleware';
import { listRooms } from '../db';
import { renderLayout } from '../views/layout';
import { renderAdminTokens, type AdminTokenRow } from '../views/admin-tokens';
import { SCOPES, hashSecret, newSecret, auditStatement, type Scope } from '../mcp/auth';
async function page(req:Request,ctx:AppContext,secret?:string):Promise<Response> {
 const user=requireAdmin(ctx);
 const tokens=(await ctx.env.DB.prepare('SELECT id,name,scopes,created_at,last_used_at,revoked_at FROM admin_api_tokens WHERE owner_id=? ORDER BY id DESC LIMIT 100').bind(user.id).all<AdminTokenRow>()).results;
 const body=renderAdminTokens(tokens,ctx.csrfToken,secret);
 const html=req.headers.get('HX-Request')?body:renderLayout({branding:ctx.branding,origin:ctx.origin,uploadsEnabled:!!ctx.env.MEDIA,user,rooms:await listRooms(ctx.env),title:'Admin MCP tokens',body,csrfToken:ctx.csrfToken,showFab:false});
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer'}});
}
export async function showAdminTokens(req:Request,ctx:AppContext):Promise<Response> {return page(req,ctx);}
export async function createAdminToken(req:Request,ctx:AppContext):Promise<Response> {
 const user=requireAdmin(ctx);await verifyCsrf(req,ctx);
 const form=await req.formData();const name=String(form.get('name')||'').trim();
 const scopes=[...new Set(form.getAll('scopes').map(String))];
 if(!name||name.length>100||!scopes.length||scopes.some(s=>!SCOPES.includes(s as Scope))) return new Response('Invalid token name or scopes',{status:400});
 const count=await ctx.env.DB.prepare('SELECT count(*) n FROM admin_api_tokens WHERE owner_id=? AND revoked_at IS NULL').bind(user.id).first<{n:number}>();
 if((count?.n??0)>=50) return new Response('Revoke an existing token before creating another',{status:400});
 const secret=newSecret();
 await ctx.env.DB.batch([ctx.env.DB.prepare('INSERT INTO admin_api_tokens(owner_id,name,token_hash,scopes) VALUES (?,?,?,?)').bind(user.id,name,await hashSecret(secret),JSON.stringify(scopes)),auditStatement(ctx.env,{id:user.id,tokenId:null,scopes:[...SCOPES]},'create_token',name)]);
 return page(req,ctx,secret);
}
export async function revokeAdminToken(req:Request,ctx:AppContext,params:Record<string,string>):Promise<Response> {
 const user=requireAdmin(ctx);await verifyCsrf(req,ctx);
 const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1) return new Response('Invalid token ID',{status:400});
 await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE admin_api_tokens SET revoked_at=datetime('now') WHERE id=? AND owner_id=? AND revoked_at IS NULL").bind(id,user.id),auditStatement(ctx.env,{id:user.id,tokenId:null,scopes:[...SCOPES]},'revoke_token',`token:${id}`)]);
 return new Response(null,{status:303,headers:{location:'/admin/tokens'}});
}
