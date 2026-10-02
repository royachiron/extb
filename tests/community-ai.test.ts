import {it,expect,vi} from 'vitest';
import {personalizeCommunity} from '../src/community/ai';
const input={name:'Test',purpose:'Share',language:'en' as const,preset:'general' as const};
it('missing binding retains template without database access',async()=>{const DB={prepare:vi.fn()} as any;const result=await personalizeCommunity({DB},input,false);expect(result.source).toBe('template');expect(DB.prepare).not.toHaveBeenCalled();});
it('invalid AI output falls back and request contains only public details',async()=>{const run=vi.fn().mockResolvedValue({response:'{"permissions": "admin"}'});const first=vi.fn().mockResolvedValue({value:'1'});const DB={prepare:vi.fn(()=>({bind:()=>({first}),first}))} as any;const result=await personalizeCommunity({DB,AI:{run}},input,false);expect(result.source).toBe('template');const params=run.mock.calls[0]![1];expect(params.max_tokens).toBe(4096);expect(JSON.parse(params.messages[1].content)).toEqual(input);});
it('exhausted atomic budget never calls AI',async()=>{const run=vi.fn();const DB={prepare:()=>({bind:()=>({first:async()=>null})})} as any;const result=await personalizeCommunity({DB,AI:{run}},input,true);expect(result.reason).toBe('generation-limit');expect(run).not.toHaveBeenCalled();});
it('real database reserves one initial generation and only two explicit regenerations',async()=>{
 const {database}=await import('./helpers/sqlite');const db=database();try{
 const run=vi.fn().mockResolvedValue({response:'invalid'});const env={...db.env,AI:{run}};
 await personalizeCommunity(env,input,false);await personalizeCommunity(env,input,false);
 await personalizeCommunity(env,input,true);await personalizeCommunity(env,input,true);const final=await personalizeCommunity(env,input,true);
 expect(run).toHaveBeenCalledTimes(3);expect(final.reason).toBe('generation-limit');
 }finally{db.close();}
});
it('accepts Qwen chat completion choices with valid structured draft',async()=>{
 const {database}=await import('./helpers/sqlite');const {makeCommunityDraft}=await import('../src/community/draft');const db=database();try{
 const draft=makeCommunityDraft(input);draft.homepageCopy='Personalized community homepage';
 const run=vi.fn().mockResolvedValue({choices:[{message:{content:JSON.stringify(draft)}}]});
 const result=await personalizeCommunity({...db.env,AI:{run}},input);expect(result.source).toBe('ai');expect(result.draft.homepageCopy).toBe(draft.homepageCopy);
 }finally{db.close();}
});
it('times out generation and leaves a valid ready-made draft',async()=>{
 vi.useFakeTimers();try{
 const DB={prepare:()=>({bind:()=>({first:async()=>({value:'1'})})})} as any;
 const operation=personalizeCommunity({DB,AI:{run:()=>new Promise(()=>{})}},input);
 await vi.advanceTimersByTimeAsync(45000);const result=await operation;expect(result.source).toBe('template');expect(result.draft.name).toBe('Test');expect(vi.getTimerCount()).toBe(0);
 }finally{vi.useRealTimers();}
});
it('concurrent initial requests do not spend regeneration allowance',async()=>{
 const {database}=await import('./helpers/sqlite');const db=database();try{
 const run=vi.fn().mockResolvedValue({response:'invalid'});const env={...db.env,AI:{run}};
 await Promise.all([personalizeCommunity(env,input,false),personalizeCommunity(env,input,false)]);
 expect(run).toHaveBeenCalledTimes(1);expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='setup_ai_attempts'").first()).toEqual({value:'1'});
 }finally{db.close();}
});
