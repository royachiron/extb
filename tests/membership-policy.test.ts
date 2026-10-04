import { describe, it, expect } from 'vitest';
import { database } from './helpers/sqlite';
import { createUser, getUserById, setUserAccess, anonymizeUser } from '../src/db/users';
import { submitApplication, decideApplication, latestApplication } from '../src/db/membership';
import { createInvite, createInvitedUser } from '../src/lib/invites';
import { decorateMembershipUser, canSendMemberDm } from '../src/lib/membership-policy';
import { canPost, canRead } from '../src/access';
import { createDm } from '../src/db/dms';
import { getRoomById } from '../src/db/rooms';
import { postReact } from '../src/api/posts';
import { postPollVote, postUpdateTopic } from '../src/api/topics';
import { postQuestion, postQuestionReply } from '../src/api/questions';
import { postChatMessageApi } from '../src/api/chat';
import { postDm } from '../src/api/dms';
import type { AppContext } from '../src/types';

async function fixture() {
 const db=database();
 await db.env.DB.prepare("INSERT INTO users(id,password_hash,display_name,is_approved,access_level,intake_status) VALUES(1,'x','Applicant',1,'member','pending'),(2,'x','Staff',1,'mod','none'),(3,'x','Other',1,'member','none')").run();
 await db.env.DB.prepare("INSERT INTO rooms(id,name,slug,kind,min_read,min_post,is_exclusive) VALUES(1,'Applications','applications','forum','member','member',0),(2,'Chat','chat','chat','member','member',0),(3,'Private','private','forum','member','anon',1),(4,'Questions','questions','questions','anon','anon',0)").run();
 await db.env.DB.prepare("INSERT INTO topics(id,short_id,room_id,user_id,title,content) VALUES(1,'test',2,1,'Topic','Hi'),(2,'question',4,3,'Question','Hi')").run();
 await db.env.DB.prepare("INSERT INTO settings(key,value) VALUES('membership_config',?)").bind(JSON.stringify({enabled:true, applicationRoomId:1, staffUserId:2})).run();
 const user=await decorateMembershipUser(db.env,await getUserById(db.env,1));
 const ctx={env:db.env,user,cookies:[],csrfToken:'csrf'} as AppContext;
 return {...db,ctx};
}
function request(path:string, data: Record<string,string>) { return new Request('https://example.test'+path,{method:'POST',body:new URLSearchParams(data)}); }

describe('membership cohort, roles and transport authorization', { timeout: 30000 }, ()=>{
 it('enrolls registration and invitations only while enabled, preserving older accounts',async()=>{
 const f=await fixture();try{
 const normal=await createUser(f.env,'new@example.test','hash',0,null,'salt','New');
 const invited=await createInvitedUser(f.env,await createInvite(f.env,2),'Invited','hash','salt',1);
 expect(normal.intake_status).toBe('applicant');expect(invited?.intake_status).toBe('applicant');
 expect((await getUserById(f.env,3))?.intake_status).toBe('none');
 await f.env.DB.prepare("UPDATE settings SET value='{}' WHERE key='membership_config'").run();
 expect((await createUser(f.env,null,'hash',0,null,null,'Ungated')).intake_status).toBe('none');
 expect((await createInvitedUser(f.env,await createInvite(f.env,2),'UngatedInvite','hash','salt',1))?.intake_status).toBe('none');
 }finally{f.close();}
 });
 it('role promotion clears intake and later demotion never reenrolls',async()=>{
 const f=await fixture();try{
 await setUserAccess(f.env,1,'full');expect((await getUserById(f.env,1))?.intake_status).toBe('approved');
 await setUserAccess(f.env,1,'member');expect((await getUserById(f.env,1))?.intake_status).toBe('approved');
 expect(canPost(await decorateMembershipUser(f.env,await getUserById(f.env,1)),(await getRoomById(f.env,2,1))!)).toBe(true);
 }finally{f.close();}
 });
 it('intake never grants private access even when anonymous posting is allowed',async()=>{
 const f=await fixture();try{
 const privateRoom=(await getRoomById(f.env,3,1))!;
 expect(canRead(f.ctx.user,privateRoom)).toBe(false);expect(canPost(f.ctx.user,privateRoom)).toBe(false);
 expect(canPost(f.ctx.user,(await getRoomById(f.env,1,1))!)).toBe(true);
 }finally{f.close();}
 });
 it('enforces configured staff in DM persistence and fails closed when staff becomes inactive',async()=>{
 const f=await fixture();try{
 await expect(createDm(f.env,1,3,'No')).rejects.toThrow('restricted');
 await createDm(f.env,1,2,'Hello staff');
 await f.env.DB.prepare('UPDATE users SET is_banned=1 WHERE id=2').run();
 await expect(createDm(f.env,1,2,'Inactive')).rejects.toThrow('restricted');
 }finally{f.close();}
 });
 it('retains separate moderator suspension after approval and gate disabling',async()=>{
 const f=await fixture();try{
 await f.env.DB.prepare("UPDATE users SET posting_restricted_at='now', intake_status='approved' WHERE id=1").run();
 const sender=(await decorateMembershipUser(f.env,await getUserById(f.env,1)))!;
 expect(canSendMemberDm(sender,(await getUserById(f.env,2))!)).toBe(false);
 expect(canPost(sender,(await getRoomById(f.env,1,1))!)).toBe(false);
 }finally{f.close();}
 });
 it('account erasure removes private intake content and preserves other decision history', async()=>{
 const f=await fixture();try{
 await f.env.DB.prepare("UPDATE users SET intake_status='applicant' WHERE id=1").run();
 await submitApplication(f.env,1,'Private application',null);
 const app=(await latestApplication(f.env,1))!;
 await decideApplication(f.env,app.id,2,'declined','Applicant reason','Staff note');
 await anonymizeUser(f.env,2,false);
 expect((await f.env.DB.prepare('SELECT actor_id FROM membership_decisions').first())).toEqual({actor_id:null});
 await anonymizeUser(f.env,1,false);
 expect((await f.env.DB.prepare('SELECT * FROM membership_applications').all()).results).toHaveLength(0);
 expect((await f.env.DB.prepare('SELECT * FROM membership_decisions').all()).results).toHaveLength(0);
 }finally{f.close();}
 });
 it.each([
 ['reaction',postReact,'/p/1/react',{emoji:'👍',isTopic:'true'},{id:'1'}],
 ['poll',postPollVote,'/t/test/vote',{option:'1'},{id:'test'}],
 ['edit',postUpdateTopic,'/t/test/edit',{title:'Edit',content:'Edit'},{id:'test'}],
 ['question',postQuestion,'/questions',{title:'Test',content:'Hello'},{}],
 ['question reply',postQuestionReply,'/questions/2',{content:'Hello'},{id:'2'}],
 ['chat',postChatMessageApi,'/chat/messages',{room:'chat',content:'Hello'},{}],
 ['DM',postDm,'/dms',{to_id:'3',content:'Hello'},{}],
 ] as const)('blocks gated %s mutations before persistence',async(_label,handler,path,body,params)=>{
 const f=await fixture();try{
 const response=await handler(request(path,body),f.ctx,params);
 expect(response.status).toBe(403);
 expect((await f.env.DB.prepare('SELECT * FROM dms').all()).results).toHaveLength(0);
 expect((await f.env.DB.prepare('SELECT * FROM posts').all()).results).toHaveLength(0);
 expect((await f.env.DB.prepare('SELECT content FROM topics WHERE id=1').first())).toEqual({content:'Hi'});
 }finally{f.close();}
 });
});
