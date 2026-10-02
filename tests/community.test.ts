import { describe,it,expect } from 'vitest';
import { makeCommunityDraft,communityDraftSchema,renderCommunityPreview,ROOM_SLUGS } from '../src/community/draft';
describe('community drafts',()=>{
 for(const language of ['en','he'] as const) for(const preset of ['general','club','creator','project','support'] as const) it(`${preset} ${language} has a complete safe template`,()=>{
 const draft=makeCommunityDraft({name:'My community',purpose:'Share useful ideas',language,preset});
 expect(communityDraftSchema.safeParse(draft).success).toBe(true);expect(draft.rooms.map(r=>r.slug)).toEqual(ROOM_SLUGS);expect(draft.discussions).toHaveLength(3);
 expect(draft.rules.length).toBeGreaterThan(30);expect(draft.welcome.content).toContain('My community');
 });
 it('rejects model supplied permissions and unknown rooms',()=>{const draft=makeCommunityDraft({name:'Test',purpose:'Talk',language:'en',preset:'general'}); expect(communityDraftSchema.safeParse({...draft,permissions:{read:'admin'}}).success).toBe(false);draft.rooms[0]!.slug='evil' as any;expect(communityDraftSchema.safeParse(draft).success).toBe(false);});
 it('escapes preview user content with Hebrew direction',()=>{const draft=makeCommunityDraft({name:'<script>x</script>',purpose:'A & B',language:'he',preset:'support'});const html=renderCommunityPreview(draft);expect(html).toContain('dir="rtl"');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');});
});
it('setup SQL seeds only owner content with invitation membership and fixed permissions',async()=>{
 const {database}=await import('./helpers/sqlite');const {draftStatements}=await import('../src/community/draft');const db=database();try{
 await db.env.DB.prepare("INSERT INTO users(id,display_name,password_hash,access_level,is_approved) VALUES(1,'Owner','hash','admin',1)").run();
 await db.env.DB.batch(draftStatements(db.env,makeCommunityDraft({name:'Community',purpose:'Together',language:'he',preset:'club'}),1));
 const rooms=await db.env.DB.prepare('SELECT slug,min_read,min_post FROM rooms ORDER BY sort_order').all<any>();expect(rooms.results).toHaveLength(6);expect(rooms.results!.every(r=>r.min_read==='anon')).toBe(true);expect(rooms.results![0].min_post).toBe('mod');
 const topics=await db.env.DB.prepare('SELECT user_id,is_pinned FROM topics').all<any>();expect(topics.results).toHaveLength(5);expect(topics.results!.every(t=>t.user_id===1)).toBe(true);expect(topics.results!.filter(t=>t.is_pinned).length).toBe(2);
 expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='signups_open'").first()).toEqual({value:'0'});
 }finally{db.close();}
});
it('presets adapt names and starter discussions',()=>{
 const input={name:'Community',purpose:'Together',language:'en' as const};const general=makeCommunityDraft({...input,preset:'general'});
 for(const preset of ['club','creator','project','support'] as const){const draft=makeCommunityDraft({...input,preset});expect(draft.rooms[2]!.name).not.toBe(general.rooms[2]!.name);expect(draft.discussions[0]!.title).not.toBe(general.discussions[0]!.title);}
});
