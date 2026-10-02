import { describe,it,expect,vi } from 'vitest';
import { authenticateMcp,authorize,hashSecret,newSecret,type AdminActor } from '../src/mcp/auth';
import { handleMcp } from '../src/mcp';
import type { Env } from '../src/types';
function fixture() {
 let enabled=true;let role='admin';let banned=0;
 const actor:AdminActor={id:1,tokenId:2,scopes:['read']};
 const statements:string[]=[];
 const prepare=vi.fn((sql:string)=>{statements.push(sql);return {bind:vi.fn().mockReturnThis(),run:vi.fn().mockResolvedValue({meta:{changes:1}}),all:vi.fn().mockResolvedValue({results:[]}),first:vi.fn().mockImplementation(async()=>{
 if(sql.includes('JOIN users')) return enabled&&role==='admin'&&!banned?{id:2,owner_id:1,scopes:'["read"]'}:null;
 if(sql.includes('FROM users')) return {access_level:role,is_banned:banned};
 if(sql.includes('FROM admin_api_tokens')) return enabled?{scopes:'["read"]'}:null;
 return {};
 })};});
 const env={DB:{prepare}} as unknown as Env;
 return {env,actor,prepare,statements,revoke:()=>enabled=false,demote:()=>role='member',ban:()=>banned=1};
}
const context={waitUntil:vi.fn(),passThroughOnException:vi.fn()} as unknown as ExecutionContext;
const headers={Host:'test.example',Authorization:`Bearer ${'extb_'+'a'.repeat(64)}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
async function payload(response:Response) {const body=await response.text();return JSON.parse(body.startsWith('event:')?body.split('\n').find(line=>line.startsWith('data:'))!.slice(5):body);}
describe('Admin MCP boundary',()=>{
 it('uses random secrets and stores stable SHA256 digests',async()=>{
 const a=newSecret(),b=newSecret();expect(a).toMatch(/^extb_[a-f0-9]{64}$/);expect(a).not.toBe(b);expect(await hashSecret(a)).toHaveLength(64);expect(await hashSecret(a)).not.toBe(a);
 });
 it('requires bearer authentication and never uses a browser cookie',async()=>{
 const f=fixture();expect(await authenticateMcp(new Request('https://test.example/mcp',{headers:{Cookie:'session=secret'}}),f.env)).toBeNull();expect(f.prepare).not.toHaveBeenCalled();
 expect((await handleMcp(new Request('https://test.example/mcp'),f.env,context)).status).toBe(401);
 });
 it('validates browser origins before data access',async()=>{
 const f=fixture();for(const origin of ['null','https://evil.example','https://test.example/path']) expect((await handleMcp(new Request('https://test.example/mcp',{headers:{...headers,Origin:origin}}),f.env,context)).status).toBe(403);
 expect(f.prepare).not.toHaveBeenCalled();
 });
 it('updates last-use metadata and immediately rejects revoked, demoted and banned owners',async()=>{
 const f=fixture();const req=new Request('https://test.example/mcp',{headers});expect(await authenticateMcp(req,f.env)).toEqual(f.actor);expect(f.statements.some(s=>s.includes('last_used_at'))).toBe(true);
 f.revoke();expect(await authenticateMcp(req,f.env)).toBeNull();const d=fixture();d.demote();expect(await authenticateMcp(req,d.env)).toBeNull();const b=fixture();b.ban();expect(await authenticateMcp(req,b.env)).toBeNull();
 });
 it('rechecks owner and token authorization for every tool invocation',async()=>{
 const f=fixture();await authorize(f.env,f.actor,'read');f.revoke();await expect(authorize(f.env,f.actor,'read')).rejects.toThrow('Token revoked');const d=fixture();d.demote();await expect(authorize(d.env,d.actor,'read')).rejects.toThrow('Administrator access');
 });
 it('serves standard legacy initialization and tools/list without a stored session',async()=>{
 const f=fixture();const request=(method:string,params:unknown)=>new Request('https://test.example/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 const init=await handleMcp(request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}),f.env,context);expect(init.status).toBe(200);const initialized=await payload(init);expect(initialized.result.serverInfo.name).toBe('extb-admin');
 const response=await handleMcp(request('tools/list',{}),f.env,context);expect(response.status).toBe(200);const body=await payload(response);const names=body.result.tools.map((t:any)=>t.name);expect(names).toContain('community_stats');expect(names).not.toContain('confirm_delete');expect(names).not.toContain('list_reports');expect(names).not.toContain('list_dms');
 const called=await handleMcp(request('tools/call',{name:'community_stats',arguments:{}}),f.env,context);expect(called.status).toBe(200);expect((await payload(called)).result.content[0].type).toBe('text');
 const forbidden=await handleMcp(request('tools/call',{name:'create_room',arguments:{name:'Private',slug:'private'}}),f.env,context);const failure=await payload(forbidden);expect(Boolean(failure.error||failure.result?.isError)).toBe(true);
 });
});
