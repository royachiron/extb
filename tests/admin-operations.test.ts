import {describe,it,expect,vi} from 'vitest';
import {adminOperations,runAdminOperation} from '../src/lib/admin-operations';
import {prepareDeletion,confirmDeletion} from '../src/mcp/deletion';
import {SCOPES,type AdminActor} from '../src/mcp/auth';
import {renderAdminTokens} from '../src/views/admin-tokens';
import type {Env} from '../src/types';
describe('Shared administrator operations',()=>{
 it('rejects administrator self-deletion before data access',async()=>{
 const prepare=vi.fn();const env={DB:{prepare}} as unknown as Env;const actor:AdminActor={id:1,tokenId:null,scopes:[...SCOPES]};
 await expect(prepareDeletion(env,actor,'user',1)).rejects.toThrow('Cannot delete your own administrator account');
 await expect(confirmDeletion(env,actor,'user',1,'extb_'+'a'.repeat(64))).rejects.toThrow('Cannot delete your own administrator account');
 expect(prepare).not.toHaveBeenCalled();
 });
 it('denies a missing scope before database access',async()=>{
 const prepare=vi.fn();const env={DB:{prepare}} as unknown as Env;await expect(runAdminOperation(env,{id:1,tokenId:2,scopes:['read']},'create_room',{name:'Room'})).rejects.toThrow('Permission denied');expect(prepare).not.toHaveBeenCalled();
 });
 it('rejects unknown input keys, invalid IDs and invalid enum values',()=>{
 expect(adminOperations.create_room!.schema.safeParse({name:'Test',slug:'test',kind:'sql'}).success).toBe(false);
 expect(adminOperations.set_member_access!.schema.safeParse({id:-1,access:'admin'}).success).toBe(false);
 expect(adminOperations.set_member_access!.schema.safeParse({id:1,access:'admin',password_hash:'secret'}).success).toBe(false);
 expect(adminOperations.confirm_delete!.schema.safeParse({type:'dms',id:1,confirmation:'extb_'+'a'.repeat(64)}).success).toBe(false);
 });
 it('escapes names and CSRF tokens and does not select deletion by default',()=>{
 const html=renderAdminTokens([{id:1,name:'<script>',scopes:'["read"]',created_at:'now',last_used_at:null,revoked_at:null}],'"bad');expect(html).toContain('&lt;script&gt;');expect(html).toContain('&quot;bad');expect(html).not.toMatch(/value="delete"\s+checked/);expect(html).toContain('method="post"');
 });
 it('guards expiry, replay, owner/token/target binding and the last admin in the transactional delete batch',async()=>{
 const queries:string[]=[];const batch=vi.fn().mockResolvedValue([]);
 const env={DB:{prepare:vi.fn((sql:string)=>{queries.push(sql);return {bind:vi.fn().mockReturnThis(),all:vi.fn().mockResolvedValue({results:[]}),run:vi.fn()};}),batch}} as unknown as Env;
 const actor:AdminActor={id:1,tokenId:2,scopes:[...SCOPES]};await confirmDeletion(env,actor,'user',3,'extb_'+'a'.repeat(64));
 expect(batch).toHaveBeenCalledOnce();const consume=queries.find(s=>s.startsWith('UPDATE admin_delete_confirmations'))!;
 for(const expected of ['actor_id=?','api_token_id IS ?','target_type=?','target_id=?','consumed=0','expires_at>unixepoch()',"access_level='admin'","s.value='delete'",'count(*)']) expect(consume).toContain(expected);
 expect(queries.some(s=>s.includes('CASE WHEN changes()=1 THEN 1 ELSE 0 END'))).toBe(true);expect(queries).toContain('DELETE FROM users WHERE id=?');
 });
});
