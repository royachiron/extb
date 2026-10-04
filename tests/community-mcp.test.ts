import {it,expect,vi} from 'vitest';
import {createAdminMcpServer} from '../src/mcp/index';
vi.mock('@modelcontextprotocol/server',()=>({McpServer:class {tools:any={};registerTool(name:string,config:any,handler:any){this.tools[name]={config,handler};}}}));
it('starter tools require configuration scope',()=>{const server=createAdminMcpServer({} as any,{id:1,tokenId:null,scopes:['read']}) as any;expect(server.tools.preview_starter_content).toBeUndefined();expect(server.tools.apply_starter_content).toBeUndefined();});
it('configuration exposes preview and explicit approved apply',()=>{const server=createAdminMcpServer({} as any,{id:1,tokenId:null,scopes:['configuration']}) as any;expect(server.tools.preview_starter_content).toBeDefined();expect(server.tools.apply_starter_content.config.inputSchema.safeParse({approved:false,draft:{}}).success).toBe(false);});
it('approved draft appends once while preserving existing private rooms and discussions',async()=>{
 const {database}=await import('./helpers/sqlite');const {makeCommunityDraft}=await import('../src/community/draft');const db=database();try{
 await db.env.DB.prepare("INSERT INTO users(id,display_name,password_hash,access_level,is_approved) VALUES(1,'Owner','hash','admin',1)").run();
 await db.env.DB.prepare("INSERT INTO rooms(name,slug,kind,min_read,min_post) VALUES('Private','general','forum','mod','mod')").run();
 await db.env.DB.prepare("INSERT INTO topics(room_id,user_id,title,content) VALUES(1,1,'Existing','Keep this')").run();
 const server=createAdminMcpServer(db.env,{id:1,tokenId:null,scopes:['configuration']}) as any;
 const draft=makeCommunityDraft({name:'Test',purpose:'Share',language:'en',preset:'general'});
 await server.tools.apply_starter_content.handler({approved:true,draft});await server.tools.apply_starter_content.handler({approved:true,draft});
 expect(await db.env.DB.prepare('SELECT count(*) AS count FROM topics').first()).toEqual({count:6});
 expect(await db.env.DB.prepare("SELECT name,min_read,min_post FROM rooms WHERE slug='general'").first()).toEqual({name:'Private',min_read:'mod',min_post:'mod'});
 expect(await db.env.DB.prepare("SELECT content FROM topics WHERE title='Existing'").first()).toEqual({content:'Keep this'});
 }finally{db.close();}
}, 20000);
