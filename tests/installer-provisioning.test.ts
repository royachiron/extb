import {describe,it,expect,vi,afterEach} from 'vitest';
import {Installation} from '../installer/src/index';
import {seal,hexDigest} from '../installer/src/security';
import {makeCommunityDraft} from '../src/community/draft';
const origin='https://extb.achiron.fyi',account='a'.repeat(32),secret='a'.repeat(43),version='v1.2.3',base=`https://github.com/royachiron/extb/releases/download/${version}/`;
afterEach(()=>vi.unstubAllGlobals());
async function harness(failedStage:string, lostWorker=false, options:{collision?:boolean;badChecksum?:boolean}={}){
 const migration='CREATE TABLE example(id INTEGER PRIMARY KEY);';
 const checksum=await hexDigest(new TextEncoder().encode(migration).buffer as ArrayBuffer);
 const release={version,mainModule:'index.js',modules:[{name:'index.js',url:base+'index.js',sha256:await hexDigest(new TextEncoder().encode('export default {}').buffer as ArrayBuffer)}],migrations:[{name:'0001.sql',url:base+'0001.sql',sha256:checksum}],assets:{manifest:{},files:[]}};
 const releaseBytes=JSON.stringify(release),releaseHash=await hexDigest(new TextEncoder().encode(releaseBytes).buffer as ArrayBuffer);
 const sessions=new Map<string,unknown>();let failed=false,database=false,worker=!!options.collision,migrated=false,creates=0,deploys=0;
 sessions.set('session',{expires:Date.now()+60000,csrf:'csrf',subject:'owner',encryptedToken:await seal('token',secret),accounts:[{id:account,name:'Account'}],job:{account,worker:'extb-stage',databaseName:'extb-stage',stage:'account checks',done:[],draft:makeCommunityDraft({name:'Example',purpose:'Help each other',preset:'general',language:'en'})}});
 const storage={get:async(k:string)=>structuredClone(sessions.get(k)),put:async(k:string,v:unknown)=>{sessions.set(k,structuredClone(v));},setAlarm:async()=>{},delete:async(k:string)=>sessions.delete(k)};
 const env={INSTALLER_ORIGIN:origin,ENCRYPTION_KEY:secret,OAUTH_CLIENT_ID:'client',INSTALLATIONS:{} as DurableObjectNamespace,OAUTH_SCOPE:'openid',RELEASE_MANIFEST_URL:base+'manifest.json',RELEASE_MANIFEST_SHA256:releaseHash};
 const installation=new Installation({storage} as unknown as DurableObjectState,env);
 const success=(result:unknown)=>Response.json({success:true,result});
 const reject=(stage:string)=>{if(stage===failedStage&&!failed){failed=true;return Response.json({success:false,errors:[{code:1000}]},{status:403});}return undefined;};
 const fetcher=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
 const path=String(url);
 if(path===base+'manifest.json')return new Response(options.badChecksum?'modified manifest':releaseBytes);
 if(path===base+'0001.sql')return new Response(migration);
 if(path===base+'index.js')return new Response('export default {}');
 if(path.endsWith('/oauth2/revoke'))return new Response(null,{status:200});
 if(path.endsWith('/workers/scripts')&&!init?.method)return reject('account checks')||success(worker?[{id:'extb-stage',migration_tag:'v1'}]:[]);
 if(path.endsWith('/workers/subdomain'))return success({subdomain:'owner'});
 if(path.includes('/d1/database?'))return success(database?[{uuid:'db-id',name:'extb-stage'}]:[]);
 if(path.endsWith('/d1/database')&&init?.method==='POST'){const error=reject('database creation');if(error)return error;database=true;creates++;return success({uuid:'db-id'});}
 if(path.endsWith('/query')){
 const body=JSON.parse(String(init?.body));if(Array.isArray(body.batch)){if(body.batch.some((statement:{sql:string})=>statement.sql.includes('CREATE TABLE example')))migrated=true;return success(body.batch.map(()=>({success:true,results:[]})));}const sql=body.sql as string;
 if(sql.startsWith('CREATE TABLE IF NOT EXISTS d1_migrations'))return reject('migrations')||success([{success:true,results:[]}]);
 if(sql.startsWith('SELECT name FROM d1_migrations'))return success([{success:true,results:migrated?[{name:'0001.sql'}]:[]}]);
 if(sql.startsWith('INSERT INTO settings'))return reject('ownership authorization')||success([{success:true,results:[]}]);
 if(sql.includes('CREATE TABLE example'))migrated=true;
 return success([{success:true,results:[]}]);
 }
 if(path.endsWith('/assets-upload-session'))return reject('Worker deployment')||success({jwt:'asset-jwt',buckets:[]});
 if(path.endsWith('/workers/scripts/extb-stage')&&init?.method==='PUT'){worker=true;deploys++;if(lostWorker&&deploys===1)throw Error('lost deployment response');return success({});}
 if(path.endsWith('/subdomain'))return success({});
 if(path.endsWith('/healthz'))return reject('readiness')||Response.json({ok:true});
 throw Error('Unexpected test API '+path);
 });
 vi.stubGlobal('fetch',fetcher);
 return {retry:async()=>{const response=await installation.fetch(new Request(origin+'/api/retry',{method:'POST',headers:{Origin:origin,'x-csrf-token':'csrf'},body:'{}'}));expect(response.status).toBe(202);for(let stage=0;stage<7;stage++){await installation.alarm();const current=sessions.get('session') as any;if(current.job.error||current.job.stage==='complete')return current;}throw new Error('Provisioning did not reach failure or completion within seven alarms');},counts:()=>({creates,deploys}),fetcher};
}
describe('resumable provisioning',()=>{
 for(const stage of ['account checks','database creation','migrations','ownership authorization','Worker deployment','readiness'])it(`recovers failure at ${stage} without duplicate resources`,async()=>{
 const h=await harness(stage);let session=await h.retry();expect(session.job.stage).toBe(stage);expect(session.job.error).toBeTruthy();session=await h.retry();expect(session.job.stage).toBe('complete');expect(session.encryptedToken).toBeUndefined();expect(h.counts().creates).toBe(1);expect(h.counts().deploys).toBe(1);
 });
 it('lost Worker upload response retries using the existing Durable Object migration',async()=>{
 const h=await harness('none',true);let session=await h.retry();expect(session.job.stage).toBe('Worker deployment');session=await h.retry();expect(session.job.stage).toBe('complete');expect(h.counts().creates).toBe(1);
 const puts=h.fetcher.mock.calls.filter(([url,init])=>String(url).endsWith('/workers/scripts/extb-stage')&&init?.method==='PUT');
 const first=JSON.parse((puts[0]![1]!.body as FormData).get('metadata') as string),second=JSON.parse((puts[1]![1]!.body as FormData).get('metadata') as string);
 expect(first.migrations.new_tag).toBe('v1');expect(second.migrations).toBeUndefined();
 });
});

it('Worker name collision refuses to replace a live Worker or create a database',async()=>{
 const h=await harness('none',false,{collision:true});const session=await h.retry();expect(session.job.stage).toBe('account checks');expect(session.job.error).toContain('collision');expect(h.counts()).toEqual({creates:0,deploys:0});
});
it('release checksum mismatch fails before creating resources',async()=>{
 const h=await harness('none',false,{badChecksum:true});const session=await h.retry();expect(session.job.stage).toBe('account checks');expect(session.job.error).toContain('checksum');expect(h.counts()).toEqual({creates:0,deploys:0});
});
