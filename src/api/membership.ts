import type { AppContext } from '../types';
import { requireAdmin, requireMember, requireMod } from '../middleware';
import { getRoomById,listRooms } from '../db/rooms';
import { getUserById } from '../db/users';
import { canRead } from '../access';
import { loadMembershipConfig } from '../lib/membership-config';
import { latestApplication,submitApplication,submitIntroductionApplication,decideApplication,listApplications,applicationHistory,saveStaffNotes,removeApprovedIntroduction,deliverWelcome } from '../db/membership';
import { renderMembership,renderIntake } from '../views/membership';
import { renderLayout } from '../views/layout';
import { html,redirect } from '../lib/http';
import { EmailDefinitelyNotSentError,sendIntakeReminderEmail } from '../email';

async function page(req:Request,ctx:AppContext,title:string,body:string):Promise<Response> {
 if(req.headers.get('hx-request')==='true') return html(body);
 const rooms=await listRooms(ctx.env,ctx.user?.id);
 return html(renderLayout({branding:ctx.branding,origin:ctx.origin,uploadsEnabled:!!ctx.env.MEDIA,user:ctx.user,rooms,title,body,csrfToken:ctx.csrfToken}));
}
export async function getMembership(req:Request,ctx:AppContext):Promise<Response> {
 const user=requireMember(ctx); const config=await loadMembershipConfig(ctx.env);
 const [app,history,room,staff]=await Promise.all([
  latestApplication(ctx.env,user.id),applicationHistory(ctx.env,user.id),
  config.applicationRoomId?getRoomById(ctx.env,config.applicationRoomId,user.id):null,
  config.staffUserId?getUserById(ctx.env,config.staffUserId):null,
 ]);
 // Legacy upgrade request history stays in place and is presented read-only.
 const legacy=(await ctx.env.DB.prepare(`SELECT status,'' AS reason,COALESCE(resolved_at,created_at) AS created_at FROM upgrade_requests WHERE user_id=? ORDER BY id DESC`).bind(user.id).all<{status:string;reason:string;created_at:string}>()).results ?? [];
 const visibleRoom=room&&!(room as typeof room & {is_archived?:number}).is_archived&&canRead(user,room)?room:null;
 const activeStaff=staff&&!staff.is_banned&&staff.is_approved&&staff.allow_dms!==0&&['mod','admin'].includes(staff.access_level)?staff:null;
 return page(req,ctx,ctx.locale==='he'?'מצב החברות':'Membership status',renderMembership(ctx,config,app,visibleRoom,activeStaff,[...history,...legacy]));
}
export async function postMembershipApply(req:Request,ctx:AppContext):Promise<Response> {
 const user=requireMember(ctx); const config=await loadMembershipConfig(ctx.env);
 if (!config.enabled||!['applicant','declined','pending'].includes(user.intake_status??'none')) return html('Membership application unavailable',409);
 const fd=await req.formData(); const topicId=Number(fd.get('introduction_topic_id'));
 if(topicId) { if(!Number.isSafeInteger(topicId)||topicId<1||!await submitIntroductionApplication(ctx.env,user.id,topicId)) return html('Introduction unavailable',403); }
 else { const text=String(fd.get('application_text')??'').trim(); if(!text||text.length>10000) return html('Application must contain 1–10000 characters',400); await submitApplication(ctx.env,user.id,text,null); }
 return redirect('/membership');
}
export async function postRemoveIntroduction(_req:Request,ctx:AppContext):Promise<Response> {
 const user=requireMember(ctx); await removeApprovedIntroduction(ctx.env,user.id); return redirect('/membership');
}
export async function getIntake(req:Request,ctx:AppContext):Promise<Response> {
 requireMod(ctx); const pageNumber=Math.max(0,Math.min(100000,Math.floor(Number(new URL(req.url).searchParams.get('page'))||0))); const [apps,config]=await Promise.all([listApplications(ctx.env,pageNumber),loadMembershipConfig(ctx.env)]);
 return page(req,ctx,ctx.locale==='he'?'בקשות חברות':'Membership applications',renderIntake(ctx,apps,config,pageNumber));
}
function appId(params:Record<string,string>):number { const id=Number(params.id); if(!Number.isSafeInteger(id)||id<1) throw html('Invalid application',400); return id; }
export async function postIntakeNotes(req:Request,ctx:AppContext,params:Record<string,string>):Promise<Response> {
 requireMod(ctx); const fd=await req.formData(); const notes=String(fd.get('staff_notes')??''); if(notes.length>10000) return html('Notes too long',400);
 await saveStaffNotes(ctx.env,appId(params),notes); return redirect('/admin/intake');
}
export async function postIntakeDecision(req:Request,ctx:AppContext,params:Record<string,string>):Promise<Response> {
 const actor=requireMod(ctx);const id=appId(params);const fd=await req.formData();const status=fd.get('decision');
 if(status!=='approved'&&status!=='declined') return html('Invalid decision',400);
 const reason=String(fd.get('decision_reason')??'').trim();const notes=String(fd.get('staff_notes')??'');
 if(reason.length>2000||notes.length>10000) return html('Decision text too long',400);
 const changed=await decideApplication(ctx.env,id,actor.id,status,reason,notes);
 if(changed&&status==='approved') {
  // Approval has committed. Configuration or delivery failures cannot reverse it.
  try { const config=await loadMembershipConfig(ctx.env);
   if(config.welcomeEnabled&&config.welcomeSenderId&&config.welcomeMessage.trim()) {
    const app=await ctx.env.DB.prepare('SELECT user_id FROM membership_applications WHERE id=?').bind(id).first<{user_id:number}>();
    if(app) await deliverWelcome(ctx.env,id,config.welcomeSenderId,app.user_id,config.welcomeMessage);
   }
  } catch { console.warn('Membership welcome delivery failed'); }
 }
 return redirect('/admin/intake');
}
export async function postIntakeReminders(req:Request,ctx:AppContext):Promise<Response> {
 requireAdmin(ctx); const config=await loadMembershipConfig(ctx.env);
 if(!config.enabled||!config.remindersEnabled) return html('Reminder emails are disabled',409);
 const targets=(await ctx.env.DB.prepare(`SELECT id,email FROM users WHERE intake_status='applicant' AND is_banned=0 AND is_approved=1 AND email_verified=1 AND email IS NOT NULL
  AND created_at<=datetime('now','-3 days') AND NOT EXISTS(SELECT 1 FROM membership_applications a WHERE a.user_id=users.id)
  AND NOT EXISTS(SELECT 1 FROM membership_deliveries d WHERE d.delivery_key='reminder:'||users.id) LIMIT 100`).all<{id:number;email:string}>()).results??[];
 let sent=0,failed=0,uncertain=0;
 for(const target of targets) {
  const key=`reminder:${target.id}`,token=crypto.randomUUID();
  const claim=await ctx.env.DB.prepare(`INSERT OR IGNORE INTO membership_deliveries(delivery_key,user_id,claim_token)
   SELECT ?,id,? FROM users WHERE id=? AND intake_status='applicant' AND is_banned=0
   AND NOT EXISTS(SELECT 1 FROM membership_applications WHERE user_id=?)`).bind(key,token,target.id,target.id).run();
  if(!(claim.meta.changes??0))continue;
  try {await sendIntakeReminderEmail(ctx.env,target.email);sent++;
   await ctx.env.DB.prepare("UPDATE membership_deliveries SET state='sent' WHERE delivery_key=? AND claim_token=?").bind(key,token).run();
  } catch(error) {
   if(error instanceof EmailDefinitelyNotSentError) {failed++;await ctx.env.DB.prepare('DELETE FROM membership_deliveries WHERE delivery_key=? AND claim_token=?').bind(key,token).run();}
   else {uncertain++;await ctx.env.DB.prepare("UPDATE membership_deliveries SET state='uncertain' WHERE delivery_key=? AND claim_token=?").bind(key,token).run();}
  }
 }
 return page(req,ctx,ctx.locale==='he'?'תזכורות חברות':'Membership reminders',`<p>${ctx.locale==='he'?'נשלחו / נכשלו / מצב לא ידוע':'Sent / failed / uncertain'}: ${sent} / ${failed} / ${uncertain}</p><a href="/admin/intake">${ctx.locale==='he'?'חזרה לבקשות':'Back to applications'}</a>`);
}
