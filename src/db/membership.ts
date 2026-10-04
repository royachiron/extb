import type { Env } from '../types';

export interface MembershipApplication {
  id: number; user_id: number; introduction_topic_id: number | null; application_text: string;
  status: 'pending' | 'approved' | 'declined'; staff_notes: string; decision_reason: string;
  created_at: string; decided_at: string | null; display_name?: string; introduction_short_id?: string | null; decision_actor?: string | null; decision_notes?: string | null;
}
export async function latestApplication(env: Env, userId: number): Promise<MembershipApplication | null> {
  return env.DB.prepare('SELECT * FROM membership_applications WHERE user_id=? ORDER BY id DESC LIMIT 1').bind(userId).first<MembershipApplication>();
}
export async function submitApplication(env: Env, userId: number, text: string, topicId: number | null): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO membership_applications(user_id,application_text,introduction_topic_id)
      SELECT id,?,? FROM users WHERE id=? AND intake_status IN ('applicant','declined')`).bind(text,topicId,userId),
    env.DB.prepare(`UPDATE users SET intake_status='pending' WHERE id=? AND intake_status IN ('applicant','declined')
      AND EXISTS(SELECT 1 FROM membership_applications WHERE user_id=? AND status='pending')`).bind(userId,userId),
  ]);
}
/** A unique decision claim makes all three statements one compare-and-set transaction. */
export async function decideApplication(env: Env, id: number, actorId: number, status: 'approved' | 'declined', reason: string, notes: string): Promise<boolean> {
  const token=crypto.randomUUID();
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO membership_decisions(application_id,actor_id,status,reason,staff_notes,claim_token)
      SELECT id,?,?,?,?,? FROM membership_applications WHERE id=? AND status='pending'`).bind(actorId,status,reason,notes,token,id),
    env.DB.prepare(`UPDATE membership_applications SET status=?,decision_reason=?,staff_notes=?,decided_at=datetime('now')
      WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM membership_decisions WHERE application_id=? AND claim_token=?)`).bind(status,reason,notes,id,id,token),
    env.DB.prepare(`UPDATE users SET intake_status=?,access_level=CASE WHEN ?='approved' AND access_level='member' THEN 'full' ELSE access_level END
      WHERE intake_status IN ('applicant','pending','declined') AND id=(SELECT user_id FROM membership_applications WHERE id=?) AND EXISTS(SELECT 1 FROM membership_decisions WHERE application_id=? AND claim_token=?)`).bind(status,status,id,id,token),
  ]);
  return (results[0]?.meta.changes ?? 0)===1;
}
export async function listApplications(env: Env, page = 0): Promise<MembershipApplication[]> {
  return (await env.DB.prepare(`SELECT a.*,u.display_name,t.short_id AS introduction_short_id,actor.display_name AS decision_actor,d.staff_notes AS decision_notes FROM membership_applications a JOIN users u ON u.id=a.user_id LEFT JOIN topics t ON t.id=a.introduction_topic_id LEFT JOIN membership_decisions d ON d.application_id=a.id LEFT JOIN users actor ON actor.id=d.actor_id
    ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END,a.id DESC LIMIT 100 OFFSET ?`).bind(page * 100).all<MembershipApplication>()).results ?? [];
}
export async function applicationHistory(env: Env,userId: number) {
  return (await env.DB.prepare(`SELECT d.status,d.reason,d.created_at FROM membership_decisions d JOIN membership_applications a ON a.id=d.application_id
    WHERE a.user_id=? ORDER BY d.application_id DESC`).bind(userId).all<{status:string;reason:string;created_at:string}>()).results ?? [];
}
export async function saveStaffNotes(env: Env,id: number,notes: string): Promise<void> {
  await env.DB.prepare('UPDATE membership_applications SET staff_notes=? WHERE id=?').bind(notes,id).run();
}
export async function removeApprovedIntroduction(env: Env,userId: number): Promise<boolean> {
  const result=await env.DB.prepare(`UPDATE topics SET deleted_at=datetime('now'),deleted_by=?,delete_reason='Introduction removed by author after approval'
    WHERE user_id=? AND deleted_at IS NULL AND id IN (SELECT introduction_topic_id FROM membership_applications WHERE user_id=? AND status='approved')`).bind(userId,userId,userId).run();
  return (result.meta.changes ?? 0)>0;
}
/** Claim, message, and both inbox pointers commit together; a retry cannot duplicate delivery. */
export async function deliverWelcome(env: Env,applicationId: number,senderId: number,userId: number,content: string): Promise<void> {
  const key=`welcome:${userId}`; const token=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO membership_deliveries(delivery_key,user_id,claim_token)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM membership_applications WHERE id=? AND user_id=? AND status='approved')
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND is_banned=0 AND is_approved=1 AND display_name IS NOT NULL AND trim(display_name)<>'' AND posting_restricted_at IS NULL AND intake_status NOT IN ('applicant','pending','declined'))`).bind(key,userId,token,applicationId,userId,senderId),
    env.DB.prepare(`INSERT INTO dms(sender_id,recipient_id,content,membership_delivery_key)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM membership_deliveries WHERE delivery_key=? AND claim_token=?)`).bind(senderId,userId,content,key,key,token),
    env.DB.prepare(`INSERT INTO dm_threads(user_id,other_id,last_dm_id)
      SELECT sender_id,recipient_id,id FROM dms WHERE membership_delivery_key=? AND EXISTS(SELECT 1 FROM membership_deliveries WHERE delivery_key=? AND claim_token=?)
      UNION ALL SELECT recipient_id,sender_id,id FROM dms WHERE membership_delivery_key=? AND EXISTS(SELECT 1 FROM membership_deliveries WHERE delivery_key=? AND claim_token=?)
      ON CONFLICT(user_id,other_id) DO UPDATE SET last_dm_id=MAX(dm_threads.last_dm_id,excluded.last_dm_id)`).bind(key,key,token,key,key,token),
    env.DB.prepare("UPDATE membership_deliveries SET state='sent' WHERE delivery_key=? AND claim_token=?").bind(key,token),
  ]);
}

/** Submitted introductions never confer room visibility or bypass per-user permissions. */
export async function submitIntroductionApplication(env: Env,userId: number,topicId: number): Promise<boolean> {
  const [{ loadMembershipConfig }, { getUserById }, { getRoomById }, { canRead }] = await Promise.all([
    import('../lib/membership-config'), import('./users'), import('./rooms'), import('../access'),
  ]);
  const config=await loadMembershipConfig(env);
  if (!config.enabled || !config.applicationRoomId) return false;
  const user=await getUserById(env,userId);
  if (!user || user.is_banned || !user.is_approved || !['applicant','declined'].includes(user.intake_status ?? 'none')) return false;
  const topic=await env.DB.prepare('SELECT room_id,user_id FROM topics WHERE id=? AND deleted_at IS NULL AND removed_at IS NULL').bind(topicId).first<{room_id:number;user_id:number}>();
  if (!topic || topic.user_id!==userId || topic.room_id!==config.applicationRoomId) return false;
  const room=await getRoomById(env,topic.room_id,userId);
  if (!room || (room as typeof room & {is_archived?:number}).is_archived || !canRead(user,room)) return false;
  await submitApplication(env,userId,'',topicId);
  return true;
}
