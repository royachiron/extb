import type { Room, User } from '../../types';
import type { MembershipConfig } from '../../lib/membership-config';
import { esc, csrfField } from '../layout';

export function renderMembershipSettings(opts: { config: MembershipConfig; rooms: Room[]; staff: User[]; senders: User[]; csrfToken?: string; locale?: string }): string {
  const { config } = opts;
  const he = opts.locale === 'he';
  const t = (en: string, hebrew: string) => he ? hebrew : en;
  const select = (key: string, label: string, entries: { id: number; label: string }[], selected: number | null) => `<label>${esc(label)}<select name="${key}"><option value="">${t('Select…', 'בחרו…')}</option>${entries.map(entry => `<option value="${entry.id}"${entry.id === selected ? ' selected' : ''}>${esc(entry.label)}</option>`).join('')}</select></label>`;
  const check = (key: string, label: string, checked: boolean) => `<label><input type="checkbox" name="${key}" value="1"${checked ? ' checked' : ''}> ${esc(label)}</label>`;
  const accounts = (users: User[]) => users.map(user => ({ id: user.id, label: user.display_name! }));
  return `<section class="card"${he ? ' dir="rtl"' : ''}><h1>${t('Membership review settings', 'הגדרות בדיקת חברות')}</h1>
  <p>${t('Membership review is optional and disabled by default. Existing members keep their access when it is enabled. Future registrations, including invited members, enter intake.', 'בדיקת חברות היא אפשרות כבויה כברירת מחדל. הפעלתה אינה משנה גישה של חברים קיימים. הרשמות עתידיות, כולל דרך הזמנות, נכנסות לתהליך הקבלה.')}</p>
  <p>${t('Applicants can read their permitted rooms, introduce themselves in the application forum, and privately contact the selected staff account. Other participation awaits approval.', 'מועמדים יכולים לקרוא בחדרים המורשים להם, להציג את עצמם בחדר הבקשות ולפנות בפרטי לאיש הצוות שנבחר. השתתפות אחרת ממתינה לאישור.')}</p>
  <p>${t('Disabling review suspends intake restrictions and keeps applications and history. Reenabling resumes outstanding intake. Approval or promotion to Trusted member, moderator, or administrator clears intake restrictions. Demotion never enrolls an existing member.', 'כיבוי הבדיקה משהה מגבלות קבלה ושומר בקשות והיסטוריה. הפעלה מחדש מחזירה מגבלות על בקשות פתוחות. אישור או קידום לחבר מהימן, מנחה או מנהל מסירים מגבלות קבלה. הורדת דרגה אינה מכניסה חבר קיים לתהליך.')}</p>
  <form method="POST" action="/admin/membership-settings" hx-post="/admin/membership-settings" hx-swap="none">${csrfField(opts)}
  <fieldset><legend>${t('Optional Iron Gate', 'בדיקת חברות אופציונלית')}</legend>
  ${check('enabled', t('Enable membership review', 'הפעלת בדיקת חברות'), config.enabled)}
  ${select('applicationRoomId', t('Application forum', 'חדר בקשות'), opts.rooms.map(room => ({ id: room.id, label: room.name })), config.applicationRoomId)}
  ${select('staffUserId', t('Private staff contact', 'איש צוות לפנייה בפרטי'), accounts(opts.staff), config.staffUserId)}</fieldset>
  <fieldset><legend>${t('Optional welcome messages', 'הודעות קבלת פנים אופציונליות')}</legend>
  ${check('welcomeEnabled', t('Send a welcome DM after approval', 'שליחת הודעה פרטית לאחר אישור'), config.welcomeEnabled)}
  ${select('welcomeSenderId', t('Welcome sender', 'שולח הודעת קבלת פנים'), accounts(opts.senders), config.welcomeSenderId)}
  <label>${t('Welcome message', 'הודעת קבלת פנים')}<textarea name="welcomeMessage" rows="5" maxlength="4000">${esc(config.welcomeMessage)}</textarea></label>
  <p>${t('Each approved applicant receives one delivered welcome message. A messaging failure does not reverse approval.', 'לכל מועמד שאושר נמסרת הודעת קבלת פנים אחת. כשל בשליחה אינו מבטל את האישור.')}</p></fieldset>
  <fieldset><legend>${t('Optional reminders', 'תזכורות אופציונליות')}</legend>${check('remindersEnabled', t('Allow staff to send application reminder emails', 'אפשרות לצוות לשלוח תזכורות בדוא״ל להגשת בקשה'), config.remindersEnabled)}
  <p>${t('Staff dispatch reminders from the application queue. Duplicate delivery is prevented.', 'הצוות שולח תזכורות מתור הבקשות. המערכת מונעת שליחה כפולה.')}</p></fieldset>
  <button type="submit" class="btn">${t('Save membership settings', 'שמירת הגדרות חברות')}</button></form>
  <p><a href="/admin/intake">${t('Review applications', 'בדיקת בקשות')}</a> · <a href="/admin?section=system&amp;tab=settings">${t('Helper and community settings', 'הגדרות עוזר וקהילה')}</a></p></section>`;
}
