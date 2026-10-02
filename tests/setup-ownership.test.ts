import 'urlpattern-polyfill';
import { describe, it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
import { database } from './helpers/sqlite';
import { claimOwnership, setupAuthorization } from '../src/community/ownership';
import { tokenHash } from '../src/lib/invites';
import type { AppContext } from '../src/types';
import { postSetup } from '../src/api/setup';
import { makeCommunityDraft } from '../src/community/draft';
import worker from '../src/index';

const token = 'a'.repeat(64);
function context(env: AppContext['env']): AppContext { return { env, user: null, cookies: [], csrfToken: 'csrf-test' }; }
function request(value = token, csrf = 'csrf-test') { return new Request('https://forum.example/setup/claim', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ token: value }) }); }
async function provision(env: AppContext['env'], expires = Date.now() + 3600000) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?)').bind('setup_ownership_hash', await tokenHash(token)),
    env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?)').bind('setup_ownership_expires_at', String(expires)),
  ]);
}
describe('installer ownership handoff', { timeout: 40000 }, () => {
  it('exchanges only once, stores only hashes, and binds setup to the secure cookie', async () => {
    const db = database(); try {
      await provision(db.env); const ctx = context(db.env);
      expect((await claimOwnership(request(), ctx)).status).toBe(200);
      expect(ctx.cookies[0]).toContain('HttpOnly; Secure; SameSite=Strict');
      const cookie = ctx.cookies[0]!.split(';')[0]!;
      const auth = await setupAuthorization(new Request('https://forum.example/setup', { headers: { Cookie: cookie } }), context(db.env));
      expect(auth?.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='setup_ownership_hash'").first()).toBe(null);
      expect((await claimOwnership(request(), context(db.env))).status).toBe(403);
      expect(await setupAuthorization(new Request('https://forum.example/setup'), context(db.env))).toBe(null);
    } finally { db.close(); }
  });
  it.each(['wrong', 'expired', 'csrf'])('rejects %s claims without creating a setup session', async (failure) => {
    const db = database(); try {
      await provision(db.env, failure === 'expired' ? Date.now() - 1 : Date.now() + 3600000);
      if (failure === 'csrf') await expect(claimOwnership(request(token, 'wrong'), context(db.env))).rejects.toMatchObject({ status: 403 });
      else expect((await claimOwnership(request(failure === 'wrong' ? 'b'.repeat(64) : token), context(db.env))).status).toBe(403);
      expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='setup_session_hash'").first()).toBe(null);
    } finally { db.close(); }
  });
  it('concurrent exchanges produce one session', async () => {
    const db = database(); try {
      await provision(db.env);
      const responses = await Promise.all([claimOwnership(request(), context(db.env)), claimOwnership(request(), context(db.env))]);
      expect(responses.map(r => r.status).sort()).toEqual([200, 403]);
    } finally { db.close(); }
  });
  it('creates the approved draft and owner together, then closes ownership and replay', async () => {
    const db = database(); try {
      await provision(db.env);
      const draft = makeCommunityDraft({ name: 'Our forum', purpose: 'Discuss projects', preset: 'project', language: 'he' });
      await db.env.DB.prepare("INSERT INTO settings (key,value) VALUES ('setup_draft',?)").bind(JSON.stringify(draft)).run();
      const ctx = context(db.env); await claimOwnership(request(), ctx);
      const cookie = ctx.cookies[0]!.split(';')[0]!;
      const form = new FormData();
      for (const [key,value] of Object.entries({ csrf:'csrf-test',username:'Owner',password:'long-secret-password',approve_draft:'1',approved_draft:JSON.stringify(draft) })) form.set(key,value);
      const req = () => new Request('https://forum.example/setup', { method:'POST',headers:{Cookie:cookie},body:form });
      expect((await postSetup(req(), context(db.env))).status).toBe(303);
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM rooms').first()).toEqual({n:6});
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM topics').first()).toEqual({n:5});
      expect(await db.env.DB.prepare('SELECT DISTINCT user_id FROM topics').first()).toEqual({user_id:1});
      expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='signups_open'").first()).toEqual({value:'0'});
      expect(await db.env.DB.prepare("SELECT value FROM settings WHERE key='branding_default_locale'").first()).toEqual({value:'he'});
      expect((await postSetup(req(), context(db.env))).status).toBe(409);
    } finally { db.close(); }
  });
  it('rejects stale approval and passphrase takeover of an installer-owned forum', async () => {
    const db = database(); try {
      await provision(db.env);
      const draft = makeCommunityDraft({name:'Forum',purpose:'Talk',preset:'general',language:'en'});
      await db.env.DB.prepare("INSERT INTO settings(key,value) VALUES ('setup_draft',?)").bind(JSON.stringify(draft)).run();
      const ctx = context(db.env); await claimOwnership(request(),ctx);
      const form = new FormData();
      for (const [key,value] of Object.entries({csrf:'csrf-test',username:'Owner',password:'owner-secret-password',passphrase:db.env.SETUP_PASSPHRASE!,approve_draft:'1',approved_draft:'{}'}))form.set(key,value);
      expect((await postSetup(new Request('https://forum.example/setup',{method:'POST',body:form}),context(db.env))).status).toBe(403);
      expect((await postSetup(new Request('https://forum.example/setup',{method:'POST',headers:{Cookie:ctx.cookies[0]!.split(';')[0]!},body:form}),context(db.env))).status).toBe(400);
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).toEqual({n:0});
    }finally{db.close();}
  });
  it('healthz works before setup and exposes no content or credentials', async () => {
    const db=database();try {
      const response=await worker.fetch(new Request('https://forum.example/healthz'),db.env,{} as ExecutionContext);
      expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true});
      const unavailable={...db.env,DB:{prepare(){throw new Error('private error');}}} as unknown as AppContext['env'];
      const failure=await worker.fetch(new Request('https://forum.example/healthz'),unavailable,{} as ExecutionContext);
      expect(failure.status).toBe(503);expect(await failure.json()).toEqual({ok:false});
    }finally{db.close();}
  });
  it('two concurrent owner submissions create exactly one owner and one starter set', async () => {
    const db=database();try {
      await provision(db.env);const draft=makeCommunityDraft({name:'Concurrent',purpose:'Talk',preset:'general',language:'en'});
      await db.env.DB.prepare("INSERT INTO settings(key,value) VALUES('setup_draft',?)").bind(JSON.stringify(draft)).run();
      const ctx=context(db.env);await claimOwnership(request(),ctx);
      const makeRequest=(username:string)=>{const form=new FormData();for(const [key,value] of Object.entries({csrf:'csrf-test',username,password:'owner-password-test',approve_draft:'1',approved_draft:JSON.stringify(draft)}))form.set(key,value);return new Request('https://forum.example/setup',{method:'POST',headers:{Cookie:ctx.cookies[0]!.split(';')[0]!},body:form});};
      const responses=await Promise.all([postSetup(makeRequest('FirstOwner'),context(db.env)),postSetup(makeRequest('SecondOwner'),context(db.env))]);
      expect(responses.map(r=>r.status).sort()).toEqual([303,409]);
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).toEqual({n:1});
      expect(await db.env.DB.prepare('SELECT COUNT(*) AS n FROM topics').first()).toEqual({n:5});
    }finally{db.close();}
  });
});
