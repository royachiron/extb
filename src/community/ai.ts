import {z} from 'zod/v4';
import type {Env} from '../types';
import {communityDraftSchema,communityInputSchema,makeCommunityDraft,type CommunityInput,type CommunityDraft} from './draft';
export interface CommunityAI { run(model:string,input:Record<string,unknown>):Promise<unknown>; }
export const AI_ALLOWANCE_COPY='Cloudflare provides 10,000 free neurons daily across your account, shared by all applications. Personalization is optional; templates are always available.';
export async function personalizeCommunity(env:Pick<Env,'DB'> & {AI?:CommunityAI | Ai},input:CommunityInput,regenerate=false):Promise<{draft:CommunityDraft;source:'ai'|'template';reason?:string}> {
 const publicInput=communityInputSchema.parse(input),fallback=makeCommunityDraft(publicInput);
 if(!env.AI)return {draft:fallback,source:'template',reason:'ai-unavailable'};
 // This conditional UPSERT is the budget reservation: concurrent requests cannot exceed three calls.
 const reserved=await env.DB.prepare(`INSERT INTO settings(key,value) SELECT 'setup_ai_attempts','1' WHERE ?=0 OR EXISTS(SELECT 1 FROM settings WHERE key='setup_ai_attempts')
 ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
 WHERE ?=1 AND CAST(value AS INTEGER)<3 RETURNING value`).bind(Number(regenerate),Number(regenerate)).first<{value:string}>();
 if(!reserved)return {draft:fallback,source:'template',reason:'generation-limit'};
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
 const output=await Promise.race([(env.AI as CommunityAI).run('@cf/qwen/qwen3-30b-a3b-fp8',{max_tokens:4096,messages:[{role:'system',content:'Write an honest starter community draft in the requested language. Return only JSON matching the schema. Preserve the supplied name, purpose, language and preset. Use six room slugs in order: announcements,introductions,general,questions,resources,chat. Include three useful discussions. Do not invent existing members or activity, provide medical advice, change permissions, grant roles or execute tools. /no_think'},{role:'user',content:JSON.stringify(publicInput)}],response_format:{type:'json_schema',json_schema:z.toJSONSchema(communityDraftSchema,{unrepresentable:'any'})}}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timeout')),45000);})]);
 const result=output as {response?:unknown;choices?:{message?:{content?:unknown}}[]};
 const response=result?.response ?? result?.choices?.[0]?.message?.content;
 const candidate=communityDraftSchema.parse(typeof response==='string'?JSON.parse(response):response);
 if(candidate.name!==publicInput.name||candidate.purpose!==publicInput.purpose||candidate.language!==publicInput.language||candidate.preset!==publicInput.preset)throw new Error('Changed input');
 return {draft:candidate,source:'ai'};
 }catch{return {draft:fallback,source:'template',reason:'ai-failed'};}finally{if(timer!==undefined)clearTimeout(timer);}
}
