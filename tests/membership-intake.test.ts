import { describe, it, expect } from 'vitest';
import { database } from './helpers/sqlite';
import { submitApplication, decideApplication, latestApplication, deliverWelcome, removeApprovedIntroduction } from '../src/db/membership';

async function fixture() {
  const db = database();
  await db.env.DB.prepare("INSERT INTO users(id,password_hash,display_name,is_approved,email_verified,access_level,intake_status) VALUES(1,'x','Applicant',1,1,'member','applicant'),(2,'x','Staff',1,1,'admin','none')").run();
  await db.env.DB.prepare("INSERT INTO rooms(id,name,slug,kind) VALUES(1,'Introductions','introductions','forum')").run();
  await db.env.DB.prepare("INSERT INTO topics(id,room_id,user_id,title,content) VALUES(1,1,1,'Hello','Hi')").run();
  return db;
}
describe('membership intake transactions', {timeout:30000}, () => {
  it('retains declined attempts and makes duplicate submissions and decisions harmless', async () => {
    const db = await fixture(); try {
      await submitApplication(db.env, 1, 'hello', 1);
      await submitApplication(db.env, 1, 'duplicate', 1);
      const first = (await latestApplication(db.env,1))!;
      expect(await decideApplication(db.env,first.id,2,'declined','Try again','private note')).toBe(true);
      expect(await decideApplication(db.env,first.id,2,'approved','','')).toBe(false);
      await submitApplication(db.env,1,'again',null);
      const next = (await latestApplication(db.env,1))!;
      expect(next.id).not.toBe(first.id);
      expect(await decideApplication(db.env,next.id,2,'approved','','')).toBe(true);
      const user = await db.env.DB.prepare('SELECT access_level,intake_status FROM users WHERE id=1').first();
      expect(user).toEqual({access_level:'full',intake_status:'approved'});
      expect((await db.env.DB.prepare('SELECT * FROM membership_decisions').all()).results).toHaveLength(2);
    } finally { db.close(); }
  });
  it('delivers one configured welcome and only removes an owned approved linked introduction', async () => {
    const db = await fixture(); try {
      await submitApplication(db.env,1,'hello',1);
      const app=(await latestApplication(db.env,1))!;
      expect(await removeApprovedIntroduction(db.env,1)).toBe(false);
      await decideApplication(db.env,app.id,2,'approved','','');
      await deliverWelcome(db.env,app.id,2,1,'Welcome');
      await deliverWelcome(db.env,app.id,2,1,'Welcome again');
      expect((await db.env.DB.prepare('SELECT * FROM dms').all()).results).toHaveLength(1);
      expect((await db.env.DB.prepare('SELECT * FROM dm_threads').all()).results).toHaveLength(2);
      expect(await removeApprovedIntroduction(db.env,2)).toBe(false);
      expect(await removeApprovedIntroduction(db.env,1)).toBe(true);
    } finally { db.close(); }
  });
});

import { vi } from 'vitest';
import { getMembership,getIntake,postIntakeDecision,postIntakeReminders } from '../src/api/membership';
import { submitIntroductionApplication } from '../src/db/membership';
import type { AppContext,User } from '../src/types';
async function context(db: ReturnType<typeof database>,id:number):Promise<AppContext> {
 const user=await db.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first<User>();
 return {env:db.env,user,csrfToken:'csrf',cookies:[],locale:'en'};
}
async function configure(db: ReturnType<typeof database>,extras={}) {
 await db.env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('membership_config',?)").bind(JSON.stringify({enabled:true,applicationRoomId:1,staffUserId:2,welcomeEnabled:false,welcomeSenderId:null,welcomeMessage:'',remindersEnabled:false,...extras})).run();
}
describe('membership HTTP and privacy',{timeout:30000},()=>{
 it('accepts owned introductions only in an already readable configured room',async()=>{
  const db=await fixture();try {
   await configure(db);
   expect(await submitIntroductionApplication(db.env,2,1)).toBe(false);
   await db.env.DB.prepare("INSERT INTO room_permissions(room_id,user_id,access_type) VALUES(1,1,'blocked')").run();
   expect(await submitIntroductionApplication(db.env,1,1)).toBe(false);
   await db.env.DB.prepare('DELETE FROM room_permissions').run();
   expect(await submitIntroductionApplication(db.env,1,1)).toBe(true);
  }finally{db.close();}
 });
 it('authorizes staff queue and never exposes staff notes to applicant status',async()=>{
  const db=await fixture();try {
   await configure(db);await submitApplication(db.env,1,'private application',1);
   const app=(await latestApplication(db.env,1))!;
   await decideApplication(db.env,app.id,2,'declined','Public reason','SECRET STAFF NOTE');
   await db.env.DB.prepare("INSERT INTO upgrade_requests(user_id,status,mod_reason) VALUES(1,'rejected','SECRET LEGACY MOD REASON')").run();
   const ctx=await context(db,1);
   const response=await getMembership(new Request('https://community.example/membership',{headers:{'hx-request':'true'}}),ctx);
   const body=await response.text();expect(body).toContain('Public reason');expect(body).not.toContain('SECRET STAFF NOTE');expect(body).not.toContain('SECRET LEGACY MOD REASON');expect(body).toContain('Submit application');
   await expect(getIntake(new Request('https://community.example/admin/intake'),ctx)).rejects.toMatchObject({status:403});
   ctx.locale='he';expect(await (await getMembership(new Request('https://community.example/membership',{headers:{'hx-request':'true'}}),ctx)).text()).toContain('שליחת בקשה');
  }finally{db.close();}
 });
 it('approves despite unavailable welcome sender and permits configured active ordinary sender',async()=>{
  const db=await fixture();try {
   await configure(db,{welcomeEnabled:true,welcomeSenderId:99,welcomeMessage:'Welcome'});await submitApplication(db.env,1,'Hi',null);
   const app=(await latestApplication(db.env,1))!;const ctx=await context(db,2);
   const req=new Request('https://community.example/admin/intake/'+app.id+'/decision',{method:'POST',body:new URLSearchParams({decision:'approved'})});
   expect((await postIntakeDecision(req,ctx,{id:String(app.id)})).status).toBe(303);
   expect((await latestApplication(db.env,1))?.status).toBe('approved');
   await db.env.DB.prepare("INSERT INTO users(id,password_hash,display_name,is_approved,access_level) VALUES(3,'x','Welcomer',1,'member')").run();
   await deliverWelcome(db.env,app.id,3,1,'Welcome');
   expect(await db.env.DB.prepare('SELECT sender_id FROM dms').first()).toEqual({sender_id:3});
  }finally{db.close();}
 });
 it('claims reminders before sending, keeps ambiguous outcomes and releases definite rejections',async()=>{
  const db=await fixture();const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
  try {
   await configure(db,{remindersEnabled:true});
   Object.assign(db.env,{BREVO_API_KEY:'test',EMAIL_FROM_ADDRESS:'staff@example.com',COMMUNITY_ORIGIN:'https://community.example'});
   await db.env.DB.prepare("UPDATE users SET email='applicant@example.com',created_at=datetime('now','-5 days') WHERE id=1").run();
   const ctx=await context(db,2);const req=new Request('https://community.example/admin/intake/reminders',{method:'POST',headers:{'hx-request':'true'}});
   fetchMock.mockResolvedValueOnce(new Response('',{status:400}));await postIntakeReminders(req,ctx);
   expect((await db.env.DB.prepare('SELECT * FROM membership_deliveries').all()).results).toHaveLength(0);
   fetchMock.mockRejectedValueOnce(new Error('Network response lost'));await postIntakeReminders(req,ctx);
   expect(await db.env.DB.prepare('SELECT state FROM membership_deliveries').first()).toEqual({state:'uncertain'});
   await postIntakeReminders(req,ctx);expect(fetchMock).toHaveBeenCalledTimes(2);
  }finally{vi.unstubAllGlobals();db.close();}
 });
});

it('stale decisions never reenroll a promoted member',async()=>{
 const db=await fixture();try {
  await submitApplication(db.env,1,'Hello',null);const app=(await latestApplication(db.env,1))!;
  await db.env.DB.prepare("UPDATE users SET intake_status='none',access_level='full' WHERE id=1").run();
  await decideApplication(db.env,app.id,2,'declined','Outdated application','');
  expect(await db.env.DB.prepare('SELECT intake_status,access_level FROM users WHERE id=1').first()).toEqual({intake_status:'none',access_level:'full'});
 }finally{db.close();}
},30000);

it('welcome transaction failure cannot undo successful approval',async()=>{
 const db=await fixture();const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try {
  await configure(db,{welcomeEnabled:true,welcomeSenderId:2,welcomeMessage:'Welcome'});
  await submitApplication(db.env,1,'Hello',null);const app=(await latestApplication(db.env,1))!;
  const originalBatch=db.env.DB.batch.bind(db.env.DB);
  db.env.DB.batch=async statements=>{
   if(statements.some(statement=>(statement as unknown as {sql:string}).sql.includes('INSERT INTO dms')))throw new Error('DM transaction unavailable');
   return originalBatch(statements);
  };
  const response=await postIntakeDecision(new Request('https://community.example/admin/intake/1/decision',{method:'POST',body:new URLSearchParams({decision:'approved'})}),await context(db,2),{id:String(app.id)});
  expect(response.status).toBe(303);expect((await latestApplication(db.env,1))?.status).toBe('approved');
  expect(await db.env.DB.prepare('SELECT access_level,intake_status FROM users WHERE id=1').first()).toEqual({access_level:'full',intake_status:'approved'});
 }finally{warning.mockRestore();db.close();}
},30000);

it('successful reminder dispatch is delivered only once',async()=>{
 const db=await fixture();const mock=vi.fn().mockResolvedValue(new Response('{}',{status:201}));vi.stubGlobal('fetch',mock);
 try {
  await configure(db,{remindersEnabled:true});Object.assign(db.env,{BREVO_API_KEY:'test',EMAIL_FROM_ADDRESS:'staff@example.com',COMMUNITY_ORIGIN:'https://community.example'});
  await db.env.DB.prepare("UPDATE users SET email='applicant@example.com',created_at=datetime('now','-5 days') WHERE id=1").run();
  const ctx=await context(db,2);const req=new Request('https://community.example/admin/intake/reminders',{method:'POST',headers:{'hx-request':'true'}});
  await postIntakeReminders(req,ctx);await postIntakeReminders(req,ctx);
  expect(mock).toHaveBeenCalledTimes(1);expect(await db.env.DB.prepare('SELECT state FROM membership_deliveries').first()).toEqual({state:'sent'});
 }finally{vi.unstubAllGlobals();db.close();}
},30000);

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
it('additive migration preserves existing accounts and private-room permissions with no intake enrollment',()=>{
 const oldSchema=readFileSync('schema.sql','utf8').split('-- Optional membership review:')[0];
 const migration=readFileSync('migrations/0002_membership_intake.sql','utf8');
 const result=execFileSync('python3',['-c',`import sqlite3,json,sys
p=json.load(sys.stdin);c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON');c.executescript(p['schema'])
c.execute("INSERT INTO users(id,password_hash,display_name,is_approved) VALUES(10,'private-hash','Existing',1)")
c.execute("INSERT INTO rooms(id,name,slug,kind,is_exclusive) VALUES(7,'Private','private','forum',1)")
c.execute("INSERT INTO room_permissions(room_id,user_id,access_type) VALUES(7,10,'full')")
c.executescript(p['migration'])
assert c.execute('SELECT intake_status,password_hash FROM users WHERE id=10').fetchone()==('none','private-hash')
assert c.execute('SELECT access_type FROM room_permissions WHERE room_id=7 AND user_id=10').fetchone()==('full',)
c.execute("INSERT INTO topics(id,room_id,user_id,title,content) VALUES(1,7,10,'Introduction','Hello')")
c.execute("INSERT INTO membership_applications(id,user_id,introduction_topic_id) VALUES(1,10,1)")
c.execute('DELETE FROM topics WHERE id=1')
assert c.execute('SELECT introduction_topic_id FROM membership_applications WHERE id=1').fetchone()==(None,)
assert not c.execute('PRAGMA foreign_key_check').fetchall()
print('ok')`],{input:JSON.stringify({schema:oldSchema,migration}),encoding:'utf8'});
 expect(result.trim()).toBe('ok');
});
