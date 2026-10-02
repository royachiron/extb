import { hexDigest } from './security';
export const API = 'https://api.cloudflare.com/client/v4';
export async function cf<T>(token: string,path: string,init: RequestInit = {}): Promise<T> {
 const headers=new Headers(init.headers); headers.set('Authorization',`Bearer ${token}`);
 if(init.body && !(init.body instanceof FormData)) headers.set('Content-Type','application/json');
 const response=await fetch(API+path,{...init,headers,signal:AbortSignal.timeout(45000)});
 const body=await response.json() as {success?:boolean;result:T;errors?:{code:number}[]};
 if(!response.ok || body.success === false) throw new Error(`Cloudflare request failed (${response.status}; codes ${(body.errors||[]).map(e=>e.code).join(',')})`);
 return body.result;
}
export interface File {name:string;url:string;sha256:string;type?:string}
export interface Release {version:string;mainModule:string;modules:File[];migrations:File[];assets:{manifest:Record<string,{hash:string;size:number}>;files:{path:string;url:string;sha256:string}[]}}
export function releaseURL(url:string,version?:string): boolean {
 const parsed=new URL(url); return parsed.protocol==='https:' && parsed.hostname==='github.com' && !parsed.search && !parsed.hash && (version ? parsed.pathname.startsWith(`/royachiron/extb/releases/download/${version}/`) : /^\/royachiron\/extb\/releases\/download\/v\d+\.\d+\.\d+[^/]*\//.test(parsed.pathname));
}
export async function checkedFile(url:string,sha256:string,version?:string):Promise<ArrayBuffer> {
 if(!releaseURL(url,version) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Untrusted release');
 const response=await fetch(url,{signal:AbortSignal.timeout(45000)}); if(!response.ok) throw new Error('Release download failed');
 const bytes=await response.arrayBuffer(); if(bytes.byteLength>30*1024*1024 || await hexDigest(bytes)!==sha256) throw new Error('Release checksum mismatch'); return bytes;
}
export async function loadRelease(url:string,sha256:string):Promise<Release> {
 const release=JSON.parse(new TextDecoder().decode(await checkedFile(url,sha256))) as Release;
 if(!/^v\d+\.\d+\.\d+[^/]*$/.test(release.version) || !releaseURL(url,release.version) || !Array.isArray(release.modules) || !Array.isArray(release.migrations) || !release.modules.some(m=>m.name===release.mainModule) || !release.assets) throw new Error('Invalid release manifest');
 for(const file of [...release.modules,...release.migrations,...release.assets.files]) if(!releaseURL(file.url,release.version) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid release file');
 return release;
}
export async function upload(token:string,account:string,worker:string,database:string,release:Release):Promise<void> {
 const prefix=`/accounts/${account}/workers`;
 const session=await cf<{jwt:string;buckets:string[][]}>(token,`${prefix}/scripts/${worker}/assets-upload-session`,{method:'POST',body:JSON.stringify({manifest:release.assets.manifest})});
 let completion=session.buckets.length===0?session.jwt:'';
 for(const bucket of session.buckets){
  const form=new FormData();
  for(const hash of bucket){
   const path=Object.keys(release.assets.manifest).find(p=>release.assets.manifest[p]?.hash===hash);
   const file=release.assets.files.find(f=>f.path===path); if(!file) throw new Error('Missing release asset');
   const bytes=await checkedFile(file.url,file.sha256,release.version);
   if(bytes.byteLength !== release.assets.manifest[path!]?.size) throw new Error('Asset size mismatch');
   let binary=''; for(const byte of new Uint8Array(bytes)) binary+=String.fromCharCode(byte);
   const extension=file.path.split('.').pop()||'';const mime:Record<string,string>={css:'text/css',js:'application/javascript',html:'text/html',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',ico:'image/x-icon',json:'application/json',woff:'font/woff',woff2:'font/woff2',txt:'text/plain'};form.set(hash,new Blob([btoa(binary)],{type:mime[extension]||'application/octet-stream'}),hash);
  }
  const result=await cf<{jwt?:string}>(session.jwt,`${prefix}/assets/upload?base64=true`,{method:'POST',body:form}); if(result.jwt) completion=result.jwt;
 }
 if(!completion)throw new Error('Invalid incomplete asset upload');
 const workers=await cf<{id:string;migration_tag?:string}[]>(token,`${prefix}/scripts`);const existing=workers.find(w=>w.id===worker);if(existing?.migration_tag && existing.migration_tag!=='v1')throw new Error('Invalid existing Worker migration');
 const migrations=existing?.migration_tag==='v1'?undefined:{new_sqlite_classes:['ChatRoom','PasswordHasher'],new_tag:'v1'};
 const form=new FormData();
 form.set('metadata',JSON.stringify({main_module:release.mainModule,compatibility_date:'2026-10-02',compatibility_flags:['nodejs_compat'],bindings:[{type:'d1',name:'DB',id:database},{type:'durable_object_namespace',name:'CHAT_ROOM',class_name:'ChatRoom'},{type:'durable_object_namespace',name:'PASSWORD_HASHER',class_name:'PasswordHasher'},{type:'assets',name:'ASSETS'},{type:'ai',name:'AI'},{type:'plain_text',name:'BUILD_ID',text:release.version}],migrations,assets:{jwt:completion,config:{run_worker_first:true}}}));
 for(const module of release.modules){const mime={esm:'application/javascript+module',text:'text/plain',buffer:'application/octet-stream','compiled-wasm':'application/wasm'}[module.type||'esm'];if(!mime)throw new Error('Invalid module type');form.set(module.name,new Blob([await checkedFile(module.url,module.sha256,release.version)],{type:mime}),module.name);}
 await cf(token,`${prefix}/scripts/${worker}`,{method:'PUT',body:form});
 await cf(token,`${prefix}/scripts/${worker}/subdomain`,{method:'POST',body:JSON.stringify({enabled:true,previews_enabled:false})});
}
