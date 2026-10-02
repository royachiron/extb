import type { Env } from '../types';
import { auditStatement, hashSecret, newSecret, type AdminActor } from './auth';
const targets = { user:'users',room:'rooms',topic:'topics',post:'posts',badge:'badges' } as const;
type TargetType = keyof typeof targets;
function identifier(value: string): string {
 if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Unsupported schema identifier');
 return `"${value}"`;
}
interface ForeignKey { name:string; table:string; from:string; to:string; notnull:number; has_id:number; on_delete:string; }
async function deletionStatements(env:Env, table:string, selector:string, id:number, metadata:ForeignKey[], seen=new Set<string>()):Promise<D1PreparedStatement[]> {
 if (seen.has(table)) return [];
 const next=new Set(seen); next.add(table);
 const statements:D1PreparedStatement[]=[];
 for (const fk of metadata.filter(f=>f.table===table && f.to==='id')) {
 const name=fk.name;
 const predicate=`${identifier(fk.from)} IN (${selector})`;
 if ((!fk.notnull && fk.on_delete!=='CASCADE') || name===table) {
 statements.push(env.DB.prepare(`UPDATE ${identifier(name)} SET ${identifier(fk.from)}=NULL WHERE ${predicate}`).bind(id));
 } else {
 // Mandatory dependants are erased; nullable authorship and moderation references are detached.
 if (fk.has_id) statements.push(...await deletionStatements(env,name,`SELECT id FROM ${identifier(name)} WHERE ${predicate}`,id,metadata,next));
 statements.push(env.DB.prepare(`DELETE FROM ${identifier(name)} WHERE ${predicate}`).bind(id));
 }
 }
 return statements;
}
export async function prepareDeletion(env:Env,actor:AdminActor,type:TargetType,id:number) {
 if(type==='user'&&id===actor.id) throw new Error('Cannot delete your own administrator account');
 const table=targets[type];
 const labelColumn=type==='user'?'display_name':type==='topic'?'title':type==='post'?"substr(content,1,120)":'name';
 const target=await env.DB.prepare(`SELECT id,${labelColumn} AS label FROM ${table} WHERE id=?`).bind(id).first<{id:number;label:string|null}>();
 if (!target) throw new Error('Target not found');
 if(type==='user') {
 const user=await env.DB.prepare('SELECT access_level,is_banned FROM users WHERE id=?').bind(id).first<{access_level:string;is_banned:number}>();
 const count=await env.DB.prepare("SELECT count(*) n FROM users WHERE access_level='admin' AND is_banned=0").first<{n:number}>();
 if(user?.access_level==='admin'&&!user.is_banned&&(count?.n??0)<2) throw new Error('Cannot delete the last active administrator');
 }
 const confirmation=newSecret();
 const expires=Math.floor(Date.now()/1000)+300;
 await env.DB.prepare('INSERT INTO admin_delete_confirmations(token_hash,actor_id,api_token_id,target_type,target_id,expires_at) VALUES (?,?,?,?,?,?)').bind(await hashSecret(confirmation),actor.id,actor.tokenId,type,id,expires).run();
 return {target:{type,id,label:target.label},confirmation,expires_at:new Date(expires*1000).toISOString(),impact:type==='user'?'Permanently erase the account and mandatory dependent records, including its private conversations. Public content remains with detached authorship.':'Permanently erase the target and all mandatory dependent records. Nullable references are detached.',irreversible:true};
}
export async function confirmDeletion(env:Env,actor:AdminActor,type:TargetType,id:number,confirmation:string) {
 if(type==='user'&&id===actor.id) throw new Error('Cannot delete your own administrator account');
 const table=targets[type]; const hash=await hashSecret(confirmation);
 const postTopic=type==='post'?await env.DB.prepare('SELECT topic_id FROM posts WHERE id=?').bind(id).first<{topic_id:number}>():null;
 const metadata=(await env.DB.prepare(`SELECT m.name,f."table",f."from",f."to",f.on_delete,c."notnull",EXISTS(SELECT 1 FROM pragma_table_info(m.name) pk WHERE pk.name='id') has_id FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f JOIN pragma_table_info(m.name) c ON c.name=f."from" WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT GLOB '_cf_*' AND m.name NOT LIKE '%_fts%'`).all<ForeignKey>()).results;
 const statements=await deletionStatements(env,table,`SELECT id FROM ${table} WHERE id=?`,id,metadata);
 const guard=type==='user'?"AND NOT EXISTS(SELECT 1 FROM users WHERE id=? AND access_level='admin' AND is_banned=0 AND (SELECT count(*) FROM users WHERE access_level='admin' AND is_banned=0)<2)":'';
 // D1 batch is transactional. The CHECK constraint aborts the whole batch if consumption failed.
 // This makes concurrent confirms and replay fail before any deletion, and rolls back consumption on failure.
 const consume=env.DB.prepare(`UPDATE admin_delete_confirmations SET consumed=1 WHERE token_hash=? AND actor_id=? AND api_token_id IS ? AND target_type=? AND target_id=? AND consumed=0 AND expires_at>unixepoch() AND EXISTS(SELECT 1 FROM ${table} WHERE id=?) AND EXISTS(SELECT 1 FROM users WHERE id=? AND access_level='admin' AND is_banned=0) AND (? IS NULL OR EXISTS(SELECT 1 FROM admin_api_tokens t,json_each(t.scopes) s WHERE t.id=? AND t.owner_id=? AND t.revoked_at IS NULL AND s.value='delete')) ${guard}`).bind(hash,actor.id,actor.tokenId,type,id,id,actor.id,actor.tokenId,actor.tokenId,actor.id,...(type==='user'?[id]:[]));
 const recount=postTopic?[env.DB.prepare("UPDATE topics SET reply_count=(SELECT count(*) FROM posts WHERE posts.topic_id=topics.id AND status='approved' AND deleted_at IS NULL AND removed_at IS NULL) WHERE id=?").bind(postTopic.topic_id)]:[];
 await env.DB.batch([consume,env.DB.prepare('INSERT INTO admin_delete_guards(token_hash,valid) VALUES (?,CASE WHEN changes()=1 THEN 1 ELSE 0 END)').bind(hash),...statements,env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id),...recount,auditStatement(env,actor,'permanent_delete',`${type}:${id}`),env.DB.prepare('DELETE FROM admin_delete_guards WHERE token_hash=?').bind(hash)]);
 return {deleted:{type,id}};
}
