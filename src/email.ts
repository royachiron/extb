import type { Env } from './types';
import { loadBranding } from './lib/branding';
import { esc } from './views/layout-utils';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
export class EmailDefinitelyNotSentError extends Error { constructor(message: string) { super(message); this.name = 'EmailDefinitelyNotSentError'; } }
async function sendBrevo(env: Env, to: string, subject: string, htmlContent: string): Promise<void> {
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM_ADDRESS) throw new EmailDefinitelyNotSentError('Email is not configured');
  const branding = await loadBranding(env);
  const res = await fetch(BREVO_ENDPOINT, { method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ sender: { name: env.EMAIL_FROM_NAME || branding.name, email: env.EMAIL_FROM_ADDRESS }, to: [{ email: to }], subject, htmlContent }) });
  if (!res.ok) { if (res.status >= 400 && res.status < 500 && ![408,425].includes(res.status)) throw new EmailDefinitelyNotSentError(`Email provider rejected request (${res.status})`); throw new Error(`Email delivery outcome uncertain (${res.status})`); }
}
function origin(env: Env): string { if (!env.COMMUNITY_ORIGIN) throw new EmailDefinitelyNotSentError('Installation origin is required'); return new URL(env.COMMUNITY_ORIGIN).origin; }
export async function sendVerifyEmail(env: Env, to: string, token: string): Promise<void> { const branding = await loadBranding(env); const link = `${origin(env)}/verify?token=${encodeURIComponent(token)}`; await sendBrevo(env, to, `Verify your ${branding.name} account`, `<p>Welcome to ${esc(branding.name)}.</p><p><a href="${esc(link)}">Verify your email address</a></p><p>If you did not sign up, ignore this email.</p>`); }
export async function sendResetEmail(env: Env, to: string, token: string): Promise<void> { const branding = await loadBranding(env); const link = `${origin(env)}/reset/${encodeURIComponent(token)}`; await sendBrevo(env, to, `Reset your ${branding.name} password`, `<p>A password reset was requested for your ${esc(branding.name)} account.</p><p><a href="${esc(link)}">Set a new password</a></p><p>If you did not request this, ignore this email.</p>`); }
export async function sendBanEmail(env: Env, to: string, reason: string): Promise<void> { const branding = await loadBranding(env); await sendBrevo(env, to, `Account status update - ${branding.name}`, `<p>Your account on ${esc(branding.name)} has been banned.</p><p><strong>Reason:</strong> ${esc(reason)}</p>${branding.contact_email ? `<p>Contact <a href="mailto:${esc(branding.contact_email)}">${esc(branding.contact_email)}</a> with questions.</p>` : '<p>Contact your community administrators with questions.</p>'}`); }
export async function sendSaltUpgradeEmail(env: Env, to: string): Promise<void> { const branding = await loadBranding(env); await sendBrevo(env, to, `Account security update - ${branding.name}`, `<p>Please <a href="${esc(origin(env))}/login">log in</a> to complete your account security update.</p>`); }

export async function sendIntakeReminderEmail(env: Env, to: string): Promise<void> {
  const branding=await loadBranding(env);
  const link=`${origin(env)}/membership`;
  await sendBrevo(env,to,`Complete your application - ${branding.name}`,`<p>You can introduce yourself or contact staff privately to apply to ${esc(branding.name)}.</p><p><a href="${esc(link)}">View your membership status and next steps</a></p>`);
}
