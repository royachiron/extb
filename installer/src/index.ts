import { randomToken, digest, hexDigest, equal, seal, unseal } from './security';
import { githubAuthorizeUrl, exchangeGithubCode, createPrivateForumRepository, connectWorkerBuilds, getWorkerBuildStatus, startWorkerBuild, GithubConnectionError, type GithubProgress, type InstalledForum, type BuildConnection } from './github';
import { wizardScript } from './wizard';
import { communityDraftSchema, makeCommunityDraft, renderCommunityPreview } from '../../src/community/draft';
import { cf, loadRelease, upload, checkedFile, type Release } from './cloudflare';
interface Env { INSTALLATIONS: DurableObjectNamespace; ENCRYPTION_KEY:string; INSTALLER_ORIGIN:string; OAUTH_CLIENT_ID:string; OAUTH_SCOPE:string; RELEASE_MANIFEST_URL:string; RELEASE_MANIFEST_SHA256:string; GITHUB_CLIENT_ID?:string; GITHUB_CLIENT_SECRET?:string; GITHUB_CF_SCOPE?:string }
interface Session { expires:number; csrf:string; state?:string; verifier?:string; subject?:string; encryptedToken?:string; accounts?:{id:string;name:string}[]; job?:Job; github?:{state?:string;verifier?:string;encryptedToken?:string;progress:GithubProgress;connection?:BuildConnection;lastBuild?:{id:string;startedAt:number}} }
interface Job { account:string; worker:string; databaseName:string; database?:string; databaseCreationAttempted?:boolean; release?:Release; stage:string; done:string[]; ownership?:string; ownershipExpires?:number; url?:string; draft:unknown; error?:string }
const stages=['account checks','database creation','migrations','ownership authorization','Worker deployment','readiness'];
const advance=Symbol('next provisioning stage');
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
function cookie(req:Request):string|undefined {return req.headers.get('Cookie')?.match(/(?:^|; )__Host-extb_install=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];}
function sessionCookie(id:string):string{return `__Host-extb_install=${id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`;}
async function handle(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url); if(url.origin!==env.INSTALLER_ORIGIN)return json({error:'Wrong installer origin'},400);
 if(url.pathname==='/start')return json({error:'Not found'},404);
 if(url.pathname==='/wizard.css')return new Response(styles,{headers:{'Content-Type':'text/css','Cache-Control':'no-store'}});
 if(url.pathname==='/healthz')return json({ok:true});
 if(url.pathname==='/wizard.js')return new Response(wizardScript,{headers:{'Content-Type':'application/javascript','Cache-Control':'no-store'}});
 if(url.pathname==='/')return new Response('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/wizard.css"><title>EXTB setup</title><body><h1>Create your community / יצירת קהילה</h1><p>Your forum runs in your Cloudflare account.</p><a href="/oauth/start">Continue with Cloudflare / המשך עם Cloudflare</a></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});
 if(!env.OAUTH_CLIENT_ID || !env.OAUTH_SCOPE || !env.ENCRYPTION_KEY)return json({error:'Installer registration is not configured'},503);
 if(url.pathname==='/oauth/start'){
  const id=url.searchParams.get('new')==='1'?randomToken():cookie(request)||randomToken();const stub=env.INSTALLATIONS.get(env.INSTALLATIONS.idFromName(id));
  const response=await stub.fetch(new Request(env.INSTALLER_ORIGIN+'/start'));const headers=new Headers(response.headers);headers.set('Set-Cookie',sessionCookie(id));return new Response(response.body,{status:response.status,headers});
 }
 const id=cookie(request);if(!id)return json({error:'Session expired; continue with Cloudflare again'},401);
 return env.INSTALLATIONS.get(env.INSTALLATIONS.idFromName(id)).fetch(request);
}
export default {async fetch(request:Request,env:Env):Promise<Response>{const response=await handle(request,env);const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('X-Frame-Options','DENY');headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");return new Response(response.body,{status:response.status,headers});}};
export class Installation implements DurableObject {
 private tail:Promise<unknown>=Promise.resolve();
 private provisioning?:Promise<void>;
 constructor(private state:DurableObjectState,private env:Env){}
 private async save(session:Session){await this.state.storage.put('session',session);if(session.github)await this.state.storage.put('github_connection',{progress:session.github.progress,connection:session.github.connection,lastBuild:session.github.lastBuild});await this.state.storage.setAlarm(session.job && session.job.stage!=='complete' && !session.job.error ? Math.min(Date.now()+30000,session.expires):session.expires);}
 async alarm(){const next=this.tail.then(()=>this.runAlarm());this.tail=next.catch(()=>{});return next;}
 private async runAlarm(){await this.provisioning;const session=await this.state.storage.get<Session>('session');if(!session)return;if(session.expires>Date.now()){if(session.job && session.job.stage!=='complete' && !session.job.error){this.provisioning=this.run(session).finally(()=>{this.provisioning=undefined;});await this.provisioning;}else await this.state.storage.setAlarm(session.expires);return;}await this.revoke(session);await this.revokeGithub(session);await this.state.storage.delete('session');}
 private async revoke(session:Session){
  if(!session.encryptedToken)return;
  try{const token=await unseal<string>(session.encryptedToken!,this.env.ENCRYPTION_KEY);await fetch('https://dash.cloudflare.com/oauth2/revoke',{method:'POST',body:new URLSearchParams({token,client_id:this.env.OAUTH_CLIENT_ID}),signal:AbortSignal.timeout(10000)});}catch{}delete session.encryptedToken;
 }
 private githubConfig(){if(!this.env.GITHUB_CLIENT_ID || !this.env.GITHUB_CLIENT_SECRET)throw new GithubConnectionError('configuration','GitHub connection is not configured');return {clientId:this.env.GITHUB_CLIENT_ID,clientSecret:this.env.GITHUB_CLIENT_SECRET,redirectUri:this.env.INSTALLER_ORIGIN+'/github/callback'};}
 private async revokeGithub(session:Session){if(!session.github?.encryptedToken)return;try{const config=this.githubConfig();const token=await unseal<string>(session.github.encryptedToken,this.env.ENCRYPTION_KEY);await fetch(`https://api.github.com/applications/${config.clientId}/token`,{method:'DELETE',headers:{Authorization:'Basic '+btoa(config.clientId+':'+config.clientSecret),'Content-Type':'application/json','User-Agent':'EXTB-installer',Accept:'application/vnd.github+json'},body:JSON.stringify({access_token:token}),signal:AbortSignal.timeout(10000)});}catch{}delete session.github.encryptedToken;}
 async fetch(request:Request):Promise<Response>{
  try{if(request.method==='GET' && !new URL(request.url).pathname.startsWith('/oauth/') && new URL(request.url).pathname!=='/start' && new URL(request.url).pathname!=='/github/callback')return await this.route(request);const next=this.tail.then(()=>this.route(request));this.tail=next.catch(()=>{});return await next;}catch(error){return json({error:error instanceof GithubConnectionError?error.message:error instanceof Error && /^(Cloudflare request failed|Release |Invalid |Untrusted )/.test(error.message)?error.message:'Installer request failed; retry or authorize again'},400);}
 }
 private async route(request:Request):Promise<Response>{
 const url=new URL(request.url);let session=await this.state.storage.get<Session>('session');
 if(url.pathname==='/start'){
  if(session?.job && session.job.stage!=='complete')return json({error:'An installation is already in progress; retry its current stage'},409);
  let previous=session;if(!previous){const installed=await this.state.storage.get<{subject:string;account:string;worker:string;database:string;databaseName:string;url:string;release:string}>('installation');if(installed)previous={expires:0,csrf:'',subject:installed.subject,job:{account:installed.account,worker:installed.worker,database:installed.database,databaseName:installed.databaseName,url:installed.url,stage:'complete',done:['account checks','database creation','migrations','ownership authorization','Worker deployment','readiness'],draft:null,release:{version:installed.release} as Release}};}if(previous && !previous.github)previous.github=await this.state.storage.get<{progress:GithubProgress;connection?:BuildConnection}>('github_connection');if(previous){await this.revoke(previous);await this.revokeGithub(previous);}const state=randomToken(),verifier=randomToken();session={expires:Date.now()+3600000,csrf:randomToken(),state:await digest(state),verifier,subject:previous?.subject,job:previous?.job,github:previous?.github};await this.save(session);
  const auth=new URL('https://dash.cloudflare.com/oauth2/auth');auth.search=new URLSearchParams({client_id:this.env.OAUTH_CLIENT_ID,redirect_uri:this.env.INSTALLER_ORIGIN+'/oauth/callback',response_type:'code',scope:session.job?.stage==='complete'?(this.env.GITHUB_CF_SCOPE||this.env.OAUTH_SCOPE):this.env.OAUTH_SCOPE,state,code_challenge:await digest(verifier),code_challenge_method:'S256'}).toString();return Response.redirect(auth.toString(),302);
 }
 if(!session || session.expires<=Date.now())return json({error:'Session expired; authorize again'},401);
 if(url.pathname==='/oauth/callback'){
  const received=url.searchParams.get('state')||'';if(!session.state || !equal(session.state,await digest(received)))return json({error:'Invalid OAuth state'},403);
  const verifier=session.verifier;delete session.state;delete session.verifier;await this.save(session);
  if(url.searchParams.has('error'))return json({error:'Cloudflare authorization cancelled; start again'},400);
  const code=url.searchParams.get('code');if(!code || !verifier)return json({error:'Missing authorization code'},400);
  const response=await fetch('https://dash.cloudflare.com/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:this.env.OAUTH_CLIENT_ID,redirect_uri:this.env.INSTALLER_ORIGIN+'/oauth/callback',grant_type:'authorization_code',code,code_verifier:verifier}),signal:AbortSignal.timeout(45000)});
  const tokens=await response.json() as {access_token?:string;token_type?:string;expires_in?:number};if(!response.ok || !tokens.access_token || tokens.token_type?.toLowerCase()!=='bearer')throw new Error('Invalid OAuth token response');
  try {
  session.encryptedToken=await seal(tokens.access_token,this.env.ENCRYPTION_KEY);if(typeof tokens.expires_in==='number'){if(tokens.expires_in<=0)throw new Error('Invalid expired OAuth token');session.expires=Math.min(session.expires,Date.now()+tokens.expires_in*1000);}await this.save(session);
  const identityResponse=await fetch('https://dash.cloudflare.com/oauth2/userinfo',{headers:{Authorization:`Bearer ${tokens.access_token}`},signal:AbortSignal.timeout(45000)});
  const identity=await identityResponse.json() as {sub?:string};if(!identityResponse.ok || !identity.sub || session.subject && session.subject!==identity.sub)throw new Error('Invalid OAuth identity');
  session.subject=identity.sub;await this.save(session);
  session.accounts=await cf<{id:string;name:string}[]>(tokens.access_token,'/accounts?per_page=50');if(session.job && !session.accounts.some(a=>a.id===session.job!.account)){await this.revoke(session);await this.save(session);throw new Error('Invalid account authorization');}await this.save(session);return Response.redirect(this.env.INSTALLER_ORIGIN+'/wizard',303);
  }catch(error){await this.revoke(session);await this.save(session);throw error;}
 }
 if(!session.subject || !session.encryptedToken && session.job?.stage!=='complete')return json({error:'Cloudflare authorization required'},401);
 if(request.method!=='GET' && (request.headers.get('Origin')!==this.env.INSTALLER_ORIGIN || !equal(request.headers.get('x-csrf-token')||'',session.csrf)))return json({error:'Invalid CSRF authorization'},403);
 if(url.pathname==='/api/session')return json({csrf:session.csrf,accounts:session.accounts,githubConfigured:!!(this.env.GITHUB_CLIENT_ID&&this.env.GITHUB_CLIENT_SECRET&&this.env.GITHUB_CF_SCOPE),cloudflareAuthorized:!!session.encryptedToken,github:session.github?{authorized:!!session.github.encryptedToken,progress:session.github.progress,connection:session.github.connection,lastBuild:session.github.lastBuild}:undefined,job:session.job?this.publicJob(session.job):undefined});
 if(url.pathname==='/wizard')return wizard();
 if(url.pathname==='/api/preview' && request.method==='POST'){const body=await request.json() as {draft?:unknown;input?:Parameters<typeof makeCommunityDraft>[0]};const draft=body.draft ? communityDraftSchema.parse(body.draft) : makeCommunityDraft(body.input!);return json({draft,html:renderCommunityPreview(draft)});}
 if(url.pathname==='/api/install' && request.method==='POST'){
  if(session.job)return json({error:'Installation already started; use retry'},409);
  const body=await request.json() as {account:string;draft:unknown};if(!session.accounts?.some(a=>a.id===body.account) || !/^[a-f0-9]{32}$/.test(body.account))return json({error:'Account mismatch'},403);
  // Validated against the same schema used by forum setup before any resource is created.
  const draft=communityDraftSchema.parse(body.draft);
  const suffix=(await hexDigest(new TextEncoder().encode(randomToken()).buffer as ArrayBuffer)).slice(0,24);session.job={account:body.account,worker:'extb-'+suffix,databaseName:'extb-'+suffix,stage:'account checks',done:[],draft};await this.save(session);
 }
 if((url.pathname==='/api/install'||url.pathname==='/api/retry') && request.method==='POST'){
  if(!session.job)return json({error:'No installation'},404);if(!this.provisioning && session.job.stage!=='complete'){delete session.job.error;await this.save(session);await this.state.storage.setAlarm(Math.min(Date.now()+100,session.expires));}return json(this.publicJob(session.job),202);
 }
 if(url.pathname==='/api/status')return json(session.job?this.publicJob(session.job):null);
 if(url.pathname==='/api/github/start' && request.method==='POST'){
  if(session.job?.stage!=='complete' || !session.encryptedToken)return json({error:'Fresh Cloudflare authorization is required to connect GitHub',authorize:this.env.INSTALLER_ORIGIN+'/oauth/start'},409);
  const state=randomToken(),verifier=randomToken();session.github={...session.github,progress:session.github?.progress||{},state:await digest(state),verifier};await this.save(session);return json({url:await githubAuthorizeUrl(this.githubConfig(),state,verifier)});
 }
 if(url.pathname==='/github/callback'){
  const state=url.searchParams.get('state')||'';if(!session.github?.state || !equal(session.github.state,await digest(state)))return json({error:'Invalid GitHub OAuth state'},403);
  const verifier=session.github.verifier;delete session.github.state;delete session.github.verifier;await this.save(session);
  if(url.searchParams.has('error') || !verifier)return json({error:'GitHub authorization cancelled; try again'},400);
  const token=await exchangeGithubCode(this.githubConfig(),url.searchParams.get('code')||'',verifier);session.github.encryptedToken=await seal(token,this.env.ENCRYPTION_KEY);await this.save(session);return Response.redirect(this.env.INSTALLER_ORIGIN+'/wizard',303);
 }
 if(url.pathname==='/api/github/connect' && request.method==='POST'){
  if(session.job?.stage!=='complete' || !session.encryptedToken || !session.github?.encryptedToken)return json({error:'Fresh Cloudflare and GitHub authorization required'},409);
  const body=await request.json() as {repositoryName:string;buildTokenId?:string};const forum=session.job as InstalledForum;
  const githubToken=await unseal<string>(session.github.encryptedToken,this.env.ENCRYPTION_KEY),cfToken=await unseal<string>(session.encryptedToken,this.env.ENCRYPTION_KEY);
  const save=async(progress:GithubProgress)=>{session.github!.progress=progress;await this.save(session);};
  const repository=await createPrivateForumRepository(githubToken,forum,body.repositoryName,session.github.progress,save);
  if(!body.buildTokenId)return json({repository:repository.html_url,progress:session.github.progress,dashboard:this.publicJob(session.job).dashboard,action:'Authorize the Cloudflare GitHub App for this private repository in Worker Settings → Builds, select a deployment token, then enter its ID to connect.'});
  session.github.connection=await connectWorkerBuilds(cfToken,forum,repository,body.buildTokenId,session.github.progress,save);await this.revokeGithub(session);await this.revoke(session);await this.save(session);return json({connection:session.github.connection});
 }
 if(url.pathname==='/api/github/build' && request.method==='POST'){
  if(session.job?.stage!=='complete' || !session.encryptedToken || !session.github?.connection)return json({error:'Fresh Cloudflare authorization required to start a build'},409);
  try{const result=await startWorkerBuild(await unseal<string>(session.encryptedToken,this.env.ENCRYPTION_KEY),session.job as InstalledForum,session.github.connection,session.github.progress);session.github.lastBuild={id:result.build_uuid,startedAt:Date.now()};return json(result);}finally{await this.revoke(session);await this.save(session);}
 }
 if(url.pathname==='/api/github/status' && request.method==='POST'){
  if(session.job?.stage!=='complete' || !session.encryptedToken || !session.github?.connection)return json({error:'Fresh Cloudflare authorization required to read build logs'},409);
  try{return json(await getWorkerBuildStatus(await unseal<string>(session.encryptedToken,this.env.ENCRYPTION_KEY),session.job as InstalledForum,session.github.connection.workerTag));}finally{await this.revoke(session);await this.save(session);}
 }
 if(url.pathname==='/api/handoff' && request.method==='POST'){
  if(session.job?.stage!=='complete' || !session.job.url)return json({error:'Forum is not ready'},409);
  const job=session.job;
  if(!session.encryptedToken && job.ownership && (job.ownershipExpires||0)>Date.now())return json({url:job.url+'/setup#ownership='+await unseal<string>(job.ownership,this.env.ENCRYPTION_KEY)});
  if(!session.encryptedToken)return json({error:'Fresh Cloudflare authorization required to reopen owner setup',authorize:this.env.INSTALLER_ORIGIN+'/oauth/start'},409);
  const token=await unseal<string>(session.encryptedToken,this.env.ENCRYPTION_KEY),path=`/accounts/${job.account}/d1/database/${job.database}/query`;
  const complete=async()=>{const rows=await cf<{success:boolean;results:{complete:number}[]}[]>(token,path,{method:'POST',body:JSON.stringify({sql:"SELECT (EXISTS (SELECT 1 FROM settings WHERE key='setup_complete') OR EXISTS (SELECT 1 FROM users WHERE access_level='admin')) AS complete"})});if(rows.some(r=>!r.success))throw new Error('Cloudflare request failed (setup readiness)');return !!rows[0]?.results[0]?.complete;};
  try{
   if(await complete()){delete job.ownership;delete job.ownershipExpires;return json({url:job.url+'/'});}
   if(job.ownership && (job.ownershipExpires||0)>Date.now())return json({url:job.url+'/setup#ownership='+await unseal<string>(job.ownership,this.env.ENCRYPTION_KEY)});
   const ownership=await hexDigest(new TextEncoder().encode(randomToken()).buffer as ArrayBuffer),expires=session.expires;
   try{
    const rows=await cf<{success:boolean}[]>(token,path,{method:'POST',body:JSON.stringify({batch:[
     {sql:"INSERT INTO settings(key,value) VALUES ('setup_ownership_hash', CASE WHEN NOT EXISTS (SELECT 1 FROM settings WHERE key='setup_complete') AND NOT EXISTS (SELECT 1 FROM users WHERE access_level='admin') THEN ? ELSE NULL END) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params:[await hexDigest(new TextEncoder().encode(ownership).buffer as ArrayBuffer)]},
     {sql:"INSERT INTO settings(key,value) VALUES ('setup_ownership_expires_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params:[String(expires)]},
     {sql:"DELETE FROM settings WHERE key IN ('setup_session_hash','setup_session_expires_at')"}
    ]})});if(rows.some(r=>!r.success))throw new Error('Cloudflare request failed (setup renewal)');
   }catch(error){if(await complete()){delete job.ownership;delete job.ownershipExpires;return json({url:job.url+'/'});}throw error;}
   job.ownership=await seal(ownership,this.env.ENCRYPTION_KEY);job.ownershipExpires=expires;return json({url:job.url+'/setup#ownership='+ownership});
  }finally{await this.revoke(session);await this.save(session);}

 }
 return json({error:'Not found'},404);
 }
 private publicJob(job:Job){return {stage:job.stage,completed:job.done,error:job.error,url:job.url,worker:job.worker,database:job.database,dashboard:`https://dash.cloudflare.com/${job.account}/workers/services/view/${job.worker}/production`};}
 private async run(session:Session){
  const job=session.job!;if(job.stage==='complete')return;
  const token=await unseal<string>(session.encryptedToken!,this.env.ENCRYPTION_KEY);
  const checkpoint=async(stage:string,fn:()=>Promise<void>)=>{if(session.expires<=Date.now())throw new Error('Invalid expired installation authorization');if(job.done.includes(stage))return;job.stage=stage;delete job.error;await this.save(session);await fn();job.done.push(stage);job.stage=stages[stages.indexOf(stage)+1]||stage;await this.save(session);if(stage!=='readiness')throw advance;};
  try{
   await checkpoint('account checks',async()=>{
    const workers=await cf<{id:string}[]>(token,`/accounts/${job.account}/workers/scripts`);if(workers.some(w=>w.id===job.worker))throw new Error('Invalid Worker name collision; start a new installation');await cf(token,`/accounts/${job.account}/d1/database?per_page=1`);
    const domain=await cf<{subdomain:string}>(token,`/accounts/${job.account}/workers/subdomain`);if(!domain.subdomain)throw new Error('Invalid workers.dev subdomain; enable it in Cloudflare first');job.url=`https://${job.worker}.${domain.subdomain}.workers.dev`;
    job.release=await loadRelease(this.env.RELEASE_MANIFEST_URL,this.env.RELEASE_MANIFEST_SHA256);
   });
   await checkpoint('database creation',async()=>{
    const existing=await cf<{uuid:string;name:string}[]>(token,`/accounts/${job.account}/d1/database?name=${job.databaseName}`);
    if(existing.length>1 || existing.some(db=>db.name===job.databaseName) && !job.databaseCreationAttempted)throw new Error('Invalid database name collision; start a new installation');
    // The random name is persisted before creation, so lost responses recover the same database.
    const recovered=existing.find(db=>db.name===job.databaseName);if(recovered)job.database=recovered.uuid;else{job.databaseCreationAttempted=true;await this.save(session);job.database=(await cf<{uuid:string}>(token,`/accounts/${job.account}/d1/database`,{method:'POST',body:JSON.stringify({name:job.databaseName})})).uuid;}
   });
   const query=async(sql:string,params:string[]=[])=>{const results=await cf<{success:boolean;results:Record<string,unknown>[]}[]>(token,`/accounts/${job.account}/d1/database/${job.database}/query`,{method:'POST',body:JSON.stringify({sql,params})});if(results.some(r=>!r.success))throw new Error('Cloudflare request failed (database query)');return results;};
   await checkpoint('migrations',async()=>{
    await query("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    for(const migration of job.release!.migrations){const applied=await query('SELECT name FROM d1_migrations WHERE name=?',[migration.name]);if(applied[0]?.results.length)continue;
     const sql=new TextDecoder().decode(await checkedFile(migration.url,migration.sha256,job.release!.version));
     // D1's multi-statement query executes as one transactional batch, including its migration marker.
     const results=await cf<{success:boolean}[]>(token,`/accounts/${job.account}/d1/database/${job.database}/query`,{method:'POST',body:JSON.stringify({batch:[{sql},{sql:'INSERT INTO d1_migrations(name) VALUES (?)',params:[migration.name]}]})});if(results.some(r=>!r.success))throw new Error('Cloudflare request failed (migration batch)');
    }
   });
   await checkpoint('ownership authorization',async()=>{const ownership=await hexDigest(new TextEncoder().encode(randomToken()).buffer as ArrayBuffer);job.ownership=await seal(ownership,this.env.ENCRYPTION_KEY);job.ownershipExpires=session.expires;await this.save(session);await query("INSERT INTO settings(key,value) VALUES ('setup_ownership_hash',?),('setup_ownership_expires_at',?),('setup_draft',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[await hexDigest(new TextEncoder().encode(ownership).buffer as ArrayBuffer),String(session.expires),JSON.stringify(job.draft)]);});
   await checkpoint('Worker deployment',async()=>{await upload(token,job.account,job.worker,job.database!,job.release!);});
   await checkpoint('readiness',async()=>{const response=await fetch(job.url+'/healthz',{signal:AbortSignal.timeout(10000)});if(!response.ok || (await response.json() as {ok?:boolean}).ok!==true)throw new Error('Cloudflare request failed (forum readiness; retry shortly)');});
   job.stage='complete';await this.state.storage.put('installation',{subject:session.subject,account:job.account,worker:job.worker,database:job.database,databaseName:job.databaseName,url:job.url,release:job.release!.version});await this.revoke(session);await this.save(session);
  }catch(error){if(error===advance){await this.state.storage.setAlarm(Math.min(Date.now()+100,session.expires));return;}job.error=error instanceof Error && /^(Cloudflare request failed|Invalid |Release |Untrusted )/.test(error.message)?error.message:'Provisioning failed at this stage; retry. Existing resources are preserved.';await this.save(session);}
 }
}
function wizard():Response {return new Response(`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/wizard.css"><title>EXTB setup</title><body><h1>Community setup / הקמת קהילה</h1><main id="app">Loading…</main><script type="module" src="/wizard.js"></script></body></html>`,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});}

const styles=String.raw`:root{--bg-color:#f9fafb;--card-bg:#ffffff;--text-main:#111827;--text-muted:#4b5563;--border-color:#d1d5db;--primary:#6366f1}*{box-sizing:border-box}body{margin:0 auto;padding:2rem 1rem;max-width:58rem;background:var(--bg-color);color:var(--text-main);font:1rem/1.6 system-ui,sans-serif}main,section,details{padding:1rem;margin-block:1rem;border:1px solid var(--border-color);border-radius:1rem;background:var(--card-bg)}form{display:grid;gap:.75rem}input,select,textarea,button{font:inherit;padding:.7rem;border:1px solid var(--border-color);border-radius:.5rem;max-width:100%;color:var(--text-main);background:var(--card-bg)}textarea{width:100%;direction:ltr}button{cursor:pointer;min-height:44px;margin:.5rem;background:var(--primary);color:var(--card-bg)}button:disabled{opacity:.5;cursor:default}a{color:var(--primary)}:focus-visible{outline:3px solid var(--primary);outline-offset:3px}label{display:block}.community-preview p{white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere}`;
