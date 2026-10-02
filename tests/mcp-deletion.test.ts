import {describe,it,expect} from 'vitest';
import {Miniflare} from 'miniflare';
import {readFileSync} from 'node:fs';
import {prepareDeletion,confirmDeletion} from '../src/mcp/deletion';
import {SCOPES,type AdminActor} from '../src/mcp/auth';
import type {Env} from '../src/types';
describe('D1 permanent deletion transactions',()=>{
 it('cleans full installation room, topic, poll, reaction and member dependencies without foreign-key or CHECK failures',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-01'});
 try {
 const DB=await mf.getD1Database('DB');
 const sql=readFileSync('schema.sql','utf8').replace(/--[^\n]*/g,'');
 const triggers:string[]=[];
 const remaining=sql.replace(/CREATE TRIGGER[\s\S]*?END;/g,t=>{triggers.push(t);return '';});
 for(const statement of remaining.split(';').map(s=>s.trim()).filter(Boolean)) await DB.prepare(statement).run();
 for(const trigger of triggers) await DB.prepare(trigger).run();
 const fixtures=[
 "INSERT INTO users(id,display_name,password_hash,access_level,is_approved) VALUES(1,'Owner','hash','admin',1),(2,'Admin','hash','admin',1),(3,'Member','hash','member',1)",
 "INSERT INTO rooms(id,name,slug,kind) VALUES(1,'Delete room','delete-room','forum'),(2,'Keep room','keep-room','forum')",
 "INSERT INTO topics(id,room_id,user_id,title,content) VALUES(1,1,3,'Delete topic','content'),(2,2,3,'Keep topic','content')",
 "INSERT INTO posts(id,topic_id,user_id,content,parent_post_id) VALUES(1,1,3,'delete',NULL),(2,1,1,'child',1),(3,2,3,'keep',NULL)",
 "INSERT INTO polls(id,topic_id,question) VALUES(1,1,'Question')",
 "INSERT INTO poll_options(id,poll_id,text) VALUES(1,1,'Option')",
 "INSERT INTO poll_votes(poll_id,option_id,user_id) VALUES(1,1,3)",
 "INSERT INTO post_reactions(post_id,user_id,emoji) VALUES(1,1,'heart')",
 "INSERT INTO post_reactions(topic_id,user_id,emoji) VALUES(1,3,'heart')",
 "INSERT INTO topic_follows(topic_id,user_id) VALUES(1,3)",
 "INSERT INTO room_permissions(room_id,user_id,access_type) VALUES(1,3,'read')",
 "INSERT INTO badges(id,name,icon,color,text_color,shape,description) VALUES(1,'Test','*','#123456','#ffffff','pill','description')",
 "INSERT INTO user_badges(user_id,badge_id,status) VALUES(3,1,'have')",
 "INSERT INTO warnings(id,user_id,mod_id,target_type) VALUES(1,3,1,'user')",
 "INSERT INTO warning_replies(warning_id,user_id,content) VALUES(1,3,'reply')",
 "INSERT INTO dms(sender_id,recipient_id,content) VALUES(1,3,'private')",
 "INSERT INTO dm_threads(user_id,other_id,last_dm_id) VALUES(1,3,1),(3,1,1)",
 "INSERT INTO sessions(token,user_id,expires_at) VALUES('session',3,'2099-01-01')",
 "INSERT INTO chat_messages(id,author_id,author_name,content) VALUES(1,3,'Member','chat')",
 "INSERT INTO chat_reactions(message_id,user_id,emoji) VALUES(1,3,'heart')",
 ];
 for(const statement of fixtures) await DB.prepare(statement).run();
 const env={DB} as unknown as Env;const actor:AdminActor={id:1,tokenId:null,scopes:[...SCOPES]};
 const reply=await prepareDeletion(env,actor,'post',1);await confirmDeletion(env,actor,'post',1,reply.confirmation);
 expect(await DB.prepare('SELECT parent_post_id FROM posts WHERE id=2').first()).toEqual({parent_post_id:null});
 expect(await DB.prepare('SELECT reply_count FROM topics WHERE id=1').first()).toEqual({reply_count:1});
 const room=await prepareDeletion(env,actor,'room',1);await confirmDeletion(env,actor,'room',1,room.confirmation);
 for(const table of ['polls','poll_options','poll_votes','post_reactions','topic_follows','room_permissions']) expect(await DB.prepare(`SELECT count(*) n FROM ${table}`).first()).toEqual({n:0});
 expect(await DB.prepare('SELECT id FROM topics').all()).toMatchObject({results:[{id:2}]});
 const member=await prepareDeletion(env,actor,'user',3);await confirmDeletion(env,actor,'user',3,member.confirmation);
 for(const table of ['user_badges','warnings','warning_replies','dms','dm_threads','sessions','chat_reactions']) expect(await DB.prepare(`SELECT count(*) n FROM ${table}`).first()).toEqual({n:0});
 expect(await DB.prepare('SELECT user_id FROM posts WHERE id=3').first()).toEqual({user_id:null});
 await DB.prepare("INSERT INTO user_badges(user_id,badge_id,status) VALUES(1,1,'have')").run();
 const badge=await prepareDeletion(env,actor,'badge',1);await confirmDeletion(env,actor,'badge',1,badge.confirmation);
 expect(await DB.prepare('SELECT id FROM badges').first()).toBeNull();expect(await DB.prepare('SELECT user_id FROM user_badges').first()).toBeNull();
 expect(await DB.prepare('PRAGMA foreign_key_check').all()).toMatchObject({results:[]});
 } finally {await mf.dispose();}
 },30000);
 it('erases dependent records, detaches nullable references and rejects replay/expired/mismatched confirmations',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-01'});
 try {
 const DB=await mf.getD1Database('DB');
 const schema=`CREATE TABLE users(id INTEGER PRIMARY KEY,display_name TEXT,access_level TEXT,is_banned INTEGER DEFAULT 0);
 CREATE TABLE topics(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),room_id INTEGER,title TEXT);
 CREATE TABLE posts(id INTEGER PRIMARY KEY,topic_id INTEGER NOT NULL REFERENCES topics(id),user_id INTEGER REFERENCES users(id),parent_post_id INTEGER REFERENCES posts(id),status TEXT DEFAULT 'approved',deleted_at TEXT,removed_at TEXT);
 CREATE TABLE post_reactions(id INTEGER PRIMARY KEY,post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id), CHECK((post_id IS NOT NULL)!=(topic_id IS NOT NULL)));
 CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id));
 INSERT INTO users(id,access_level) VALUES(1,'admin'),(2,'admin'),(3,'member');
 INSERT INTO topics(id,user_id,title) VALUES(1,3,'Hello'),(2,1,'Other');
 INSERT INTO posts(id,topic_id,user_id) VALUES(1,1,3),(2,1,1),(3,2,3);
 INSERT INTO post_reactions(id,post_id,user_id) VALUES(1,1,1);
 INSERT INTO post_reactions(id,topic_id,user_id) VALUES(2,1,1);
 INSERT INTO sessions VALUES('session',3);`;
 // D1 exec handles one statement per line; migration fragment contains multiline statements.
 const statements=(schema+readFileSync('src/mcp/schema.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean);
 for(const statement of statements) await DB.prepare(statement).run();
 const env={DB} as unknown as Env;const actor:AdminActor={id:1,tokenId:null,scopes:[...SCOPES]};
 const prepared=await prepareDeletion(env,actor,'topic',1);
 await expect(confirmDeletion(env,actor,'topic',2,prepared.confirmation)).rejects.toThrow();
 expect(await DB.prepare('SELECT id FROM topics WHERE id=1').first()).not.toBeNull();
 await confirmDeletion(env,actor,'topic',1,prepared.confirmation);
 expect(await DB.prepare('SELECT id FROM topics WHERE id=1').first()).toBeNull();expect(await DB.prepare('SELECT id FROM posts WHERE topic_id=1').first()).toBeNull();expect(await DB.prepare('SELECT id FROM post_reactions').first()).toBeNull();
 await expect(confirmDeletion(env,actor,'topic',1,prepared.confirmation)).rejects.toThrow();
 const expired=await prepareDeletion(env,actor,'user',3);await DB.prepare('UPDATE admin_delete_confirmations SET expires_at=0').run();await expect(confirmDeletion(env,actor,'user',3,expired.confirmation)).rejects.toThrow();
 const valid=await prepareDeletion(env,actor,'user',3);await confirmDeletion(env,actor,'user',3,valid.confirmation);
 expect(await DB.prepare('SELECT id FROM users WHERE id=3').first()).toBeNull();expect(await DB.prepare('SELECT user_id FROM posts WHERE id=3').first()).toEqual({user_id:null});expect(await DB.prepare('SELECT token FROM sessions').first()).toBeNull();
 const admin=await prepareDeletion(env,actor,'user',2);await confirmDeletion(env,actor,'user',2,admin.confirmation);await expect(prepareDeletion(env,actor,'user',1)).rejects.toThrow('own administrator account');
 } finally {await mf.dispose();}
 },30000);
});
