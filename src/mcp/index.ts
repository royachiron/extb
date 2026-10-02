import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import type { Env } from '../types';
import { authenticateMcp, authorize, auditStatement, hashSecret, type AdminActor } from './auth';
import { z } from 'zod/v4';
import { communityInputSchema, communityDraftSchema, makeCommunityDraft, renderCommunityPreview } from '../community/draft';
import { adminOperations, runAdminOperation } from '../lib/admin-operations';

export function createAdminMcpServer(env:Env,actor:AdminActor):McpServer {
 const server=new McpServer({name:'extb-admin',version:'1.0.0'});
 for (const [name,operation] of Object.entries(adminOperations)) {
 if (!actor.scopes.includes(operation.scope)) continue;
 server.registerTool(name,{description:operation.description,inputSchema:operation.schema,annotations:{readOnlyHint:operation.scope==='read'||name.startsWith('list_'),destructiveHint:name==='confirm_delete',openWorldHint:false}},async input=>{
 try {
 const result=await runAdminOperation(env,actor,name,input);
 return {content:[{type:'text' as const,text:JSON.stringify(result)}]};
 } catch(error) {
 const message=error instanceof Error?error.message:'Operation failed';
 // Database errors can contain schema or request details; return only controlled validation/auth errors.
 const controlled=/^(Permission denied|Administrator access required|Token revoked|Target not found|Cannot delete|Invalid|Unknown operation)/.test(message);
 return {isError:true,content:[{type:'text' as const,text:controlled?message:'Operation failed. Check inputs, target existence and confirmation validity.'}]};
 }
 });
 }
 if(actor.scopes.includes('configuration')) {
 server.registerTool('preview_starter_content',{description:'Preview ready-made starter copy without publishing it.',inputSchema:communityInputSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async input=>{
 await authorize(env,actor,'configuration');
 const draft=makeCommunityDraft(input);
 return {content:[{type:'text' as const,text:JSON.stringify({draft,html:renderCommunityPreview(draft)})}]};
 });
 server.registerTool('apply_starter_content',{description:'Append an explicitly owner-approved draft. Does not overwrite rooms, branding or existing discussions. Repeating the same draft is idempotent.',inputSchema:z.object({draft:communityDraftSchema,approved:z.literal(true)}).strict(),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},async input=>{
 await authorize(env,actor,'configuration');
 const draft=communityDraftSchema.parse(input.draft);
 const key='starter_applied_'+await hashSecret(JSON.stringify(draft));
 const statements=draft.rooms.map((r,n)=>env.DB.prepare('INSERT OR IGNORE INTO rooms(name,slug,description,kind,min_read,min_post,sort_order,is_page) VALUES(?,?,?,?,?,?,?,?)').bind(r.name,r.slug,r.description,r.slug==='chat'?'chat':r.slug==='announcements'?'news':r.slug==='questions'?'questions':'forum','anon',r.slug==='announcements'?'mod':'member',(n+1)*10,Number(r.slug==='chat')));
 const topics=[{...draft.welcome,roomSlug:'announcements',pinned:1},{...draft.joiningGuide,roomSlug:'introductions',pinned:1},...draft.discussions.map(t=>({...t,pinned:0}))];
 for(const t of topics) statements.push(env.DB.prepare("INSERT INTO topics(room_id,user_id,title,content,status,is_pinned,short_id) SELECT id,?,?,?,'approved',?,? FROM rooms WHERE slug=? AND NOT EXISTS(SELECT 1 FROM settings WHERE key=?)").bind(actor.id,t.title,t.content,t.pinned,crypto.randomUUID().replaceAll('-','').slice(0,12),t.roomSlug,key));
 statements.push(env.DB.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,'true')").bind(key),auditStatement(env,actor,'apply_starter_content',key));
 const result=await env.DB.batch(statements);
 return {content:[{type:'text' as const,text:JSON.stringify({appended:result.slice(draft.rooms.length,draft.rooms.length+topics.length).reduce((sum,r)=>sum+r.meta.changes,0)})}]};
 });
 }
 return server;
}
export async function handleMcp(req:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
 const url=new URL(req.url);
 const origin=req.headers.get('origin');
 if(origin) {
 try { const parsed=new URL(origin);if(parsed.origin!==origin||parsed.origin!==url.origin) return new Response('Invalid origin',{status:403}); }
 catch {return new Response('Invalid origin',{status:403});}
 }
 const actor=await authenticateMcp(req,env);
 if(!actor) return new Response('Valid administrator bearer token required',{status:401,headers:{'WWW-Authenticate':'Bearer realm="extb-admin"','Cache-Control':'no-store'}});
 const handler=createMcpHandler(()=>createAdminMcpServer(env,actor),{route:'/mcp',responseMode:'json',corsOptions:false,allowedHostnames:[url.hostname],allowedOriginHostnames:[url.hostname]});
 const response=await handler(req,env,ctx);
 response.headers.set('Cache-Control','no-store');
 return response;
}
