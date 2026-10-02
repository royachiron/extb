import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import type { Env } from '../types';
import { authenticateMcp, type AdminActor } from './auth';
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
