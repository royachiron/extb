import 'urlpattern-polyfill';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/password-hasher', () => ({ PasswordHasher: class {} }));
import worker from '../src/index';
import { database } from './helpers/sqlite';
const execution = { waitUntil() {} } as unknown as ExecutionContext;
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
 const db = database();
 vi.stubGlobal('caches', { default: {} });
 await db.env.DB.batch([
  db.env.DB.prepare("INSERT INTO settings(key,value) VALUES('setup_complete','1')"),
  db.env.DB.prepare("INSERT INTO users(id,display_name,password_hash,access_level,is_approved,intake_status) VALUES(1,'Owner','hash','admin',1,'none'),(2,'Applicant','hash','member',1,'applicant'),(3,'Existing','hash','member',1,'none')"),
  db.env.DB.prepare("INSERT INTO rooms(id,name,slug,kind,min_read,min_post) VALUES(1,'Applications','applications','forum','member','member'),(2,'Private secret room','secret-room','forum','full','full'),(3,'Chat','chat','chat','member','member')"),
  db.env.DB.prepare("INSERT INTO topics(id,short_id,room_id,user_id,title,content) VALUES(1,'private123',2,1,'Private secret title','Private secret body')"),
  db.env.DB.prepare("INSERT INTO settings(key,value) VALUES('membership_config',?)").bind(JSON.stringify({enabled:true,applicationRoomId:1,staffUserId:1})),
  ...[1,2,3].map(id => db.env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+1 day'))").bind(`session${id}`,id)),
 ]);
 return db;
}
function request(path: string, userId: number, form?: Record<string,string>, htmx=false) {
 const headers: Record<string,string> = {Cookie:`session=session${userId}; csrf=test`};
 if(htmx) headers['HX-Request']='true';
 return new Request(`https://community.example${path}`, {headers, method:form?'POST':'GET',body:form?new URLSearchParams(form):undefined});
}
describe('membership workflow through Worker routes', {timeout:30000}, () => {
 it('renders localized next steps as full pages and HTMX fragments without private room traces', async () => {
  const db=await fixture();try {
   const full=await worker.fetch(request('/membership',2),db.env,execution);
   expect(full.status).toBe(200);
   const body=await full.text(); expect(body.includes('<!doctype html>')).toBe(true);
   expect(body.includes('/membership/apply')).toBe(true);expect(body.includes('/r/applications')).toBe(true);
   expect(body.includes('Private secret')).toBe(false);expect(body.includes('secret-room')).toBe(false);
   const partial=await worker.fetch(request('/membership?lang=he',2,undefined,true),db.env,execution);
   expect(partial.status).toBe(200);expect(partial.headers.get('Content-Language')).toBe('he');
   const fragment=await partial.text();expect(fragment.includes('<!doctype html>')).toBe(false);expect(/[א-ת]/.test(fragment)).toBe(true);
  }finally{db.close();}
 });
 it('requires CSRF and staff authorization before browser writes and queue access',async()=>{
  const db=await fixture();try {
   expect((await worker.fetch(request('/membership/apply',2,{application_text:'Please let me join.'}),db.env,execution)).status).toBe(403);
   expect(await db.env.DB.prepare('SELECT count(*) AS n FROM membership_applications').first()).toEqual({n:0});
   expect((await worker.fetch(request('/admin/intake',2),db.env,execution)).status).toBe(403);
   expect((await worker.fetch(request('/admin/membership-settings',2),db.env,execution)).status).toBe(403);
   expect((await worker.fetch(request('/admin/intake/1/decision',2,{csrf:'test',decision:'approved'}),db.env,execution)).status).toBe(403);
  }finally{db.close();}
 });
 it('routes private application and approval with refreshed account permissions',async()=>{
  const db=await fixture();try {
   const submit=await worker.fetch(request('/membership/apply',2,{csrf:'test',application_text:'I would like to participate.'},true),db.env,execution);
   expect(submit.headers.get('HX-Redirect')).toBe('/membership');
   const row=await db.env.DB.prepare('SELECT id,status FROM membership_applications').first<{id:number;status:string}>();expect(row?.status).toBe('pending');
   const approval=await worker.fetch(request(`/admin/intake/${row!.id}/decision`,1,{csrf:'test',decision:'approved',decision_reason:'Welcome',staff_notes:'Private staff note'}),db.env,execution);
   expect(approval.status).toBe(303);
   expect(await db.env.DB.prepare('SELECT access_level,intake_status FROM users WHERE id=2').first()).toEqual({access_level:'full',intake_status:'approved'});
   const status=await worker.fetch(request('/membership',2),db.env,execution);
   expect((await status.text()).includes('Private staff note')).toBe(false);
   const privateTopic=await worker.fetch(request('/t/private123',2),db.env,execution);
   expect(privateTopic.status).toBe(200);
  }finally{db.close();}
 });
});

it('keeps configured helper commands private for read-only applicants', async () => {
 const db=await fixture();try {
  await db.env.DB.prepare("INSERT INTO settings(key,value) VALUES('helper_config',?)").bind(JSON.stringify({name:'Garden helper',quiet:'Try a short hello.'})).run();
  const helper=await worker.fetch(request('/chat/messages',2,{csrf:'test',content:'/bot quiet',room:'chat'}),db.env,execution);
  expect(helper.status).toBe(200);const body=await helper.text();expect(body.includes('Garden helper')).toBe(true);expect(body.includes('Try a short hello.')).toBe(true);
  expect(await db.env.DB.prepare('SELECT count(*) AS n FROM chat_messages').first()).toEqual({n:0});
  await db.env.DB.prepare("INSERT INTO settings(key,value) VALUES('bot_enabled','0')").run();
  const disabled=await worker.fetch(request('/chat/messages',1,{csrf:'test',content:'/bot quiet',room:'chat'}),db.env,execution);
  expect(disabled.status).toBe(404);expect(await db.env.DB.prepare('SELECT count(*) AS n FROM chat_messages').first()).toEqual({n:0});
 }finally{db.close();}
},30000);
it('uses configured membership next steps from directory and onboarding', async () => {
 const db=await fixture();try {
  const applicant=await worker.fetch(request('/users',2,undefined,true),db.env,execution);
  expect(applicant.headers.get('HX-Redirect')).toBe('/membership');
  const existing=await worker.fetch(request('/users',3,undefined,true),db.env,execution);
  const page=await existing.text();expect(page.includes('Trusted membership is required to view the member directory.')).toBe(true);
  expect(page.includes('/r/introductions')).toBe(false);
  const onboarding=await worker.fetch(request('/onboarding',3),db.env,execution);
  expect((await onboarding.text()).includes('/r/introductions')).toBe(false);
 }finally{db.close();}
},30000);
it('submits a configured introduction from the forum and removes it after approval', async () => {
 const db=await fixture();try {
  const introduction=await worker.fetch(request('/topics',2,{csrf:'test',room_id:'1',title:'Hello community',content:'I enjoy learning with others.'}),db.env,execution);
  expect(introduction.headers.get('Location')).toBe('/membership');
  const application=await db.env.DB.prepare('SELECT id,introduction_topic_id FROM membership_applications').first<{id:number;introduction_topic_id:number}>();
  expect(application?.introduction_topic_id).toBeTruthy();
  await worker.fetch(request(`/admin/intake/${application!.id}/decision`,1,{csrf:'test',decision:'approved'}),db.env,execution);
  const approved=await worker.fetch(request('/membership',2,undefined,true),db.env,execution);
  expect((await approved.text()).includes('/membership/introduction/remove')).toBe(true);
  expect((await worker.fetch(request('/membership/introduction/remove',2,{csrf:'test'}),db.env,execution)).status).toBe(303);
  const topic=await db.env.DB.prepare('SELECT deleted_at,deleted_by FROM topics WHERE id=?').bind(application!.introduction_topic_id).first<{deleted_at:string|null;deleted_by:number}>();
  expect(topic?.deleted_at).toBeTruthy();expect(topic?.deleted_by).toBe(2);
  expect(await db.env.DB.prepare('SELECT count(*) AS n FROM membership_decisions').first()).toEqual({n:1});
 }finally{db.close();}
},30000);
