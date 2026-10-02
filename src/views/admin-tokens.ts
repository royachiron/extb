import { esc, csrfField } from './layout-utils';
import { SCOPES } from '../mcp/auth';
export interface AdminTokenRow {id:number;name:string;scopes:string;created_at:string;last_used_at:string|null;revoked_at:string|null;}
export function renderAdminTokens(tokens:AdminTokenRow[],csrfToken?:string,secret?:string):string {
 return `<section class="card" style="padding:24px"><h1>Admin MCP tokens</h1><p>Connect an MCP client to <code>/mcp</code> with a bearer token. Each token acts as your administrator account. Keep it private.</p><p><a href="/admin">Back to admin</a></p>
 ${secret?`<div role="status"><h2>Copy your token now</h2><p>This is the only time it is shown.</p><code style="overflow-wrap:anywhere">${esc(secret)}</code></div>`:''}
 <form method="post" action="/admin/tokens">${csrfField({csrfToken})}<label>Token name <input name="name" required maxlength="100" autocomplete="off"></label><fieldset><legend>Permissions</legend>${SCOPES.map(s=>`<label style="display:block"><input type="checkbox" name="scopes" value="${s}" ${s==='read'?'checked':''}> ${s==='delete'?'Permanent deletion (explicit permission)':s}</label>`).join('')}</fieldset><button class="btn btn-primary">Create token</button></form>
 <h2>Your tokens</h2>${tokens.length?tokens.map(t=>`<article style="border-top:1px solid var(--border-color);padding:16px 0"><strong>${esc(t.name)}</strong><p>${esc(t.scopes)}<br>Created ${esc(t.created_at)}. Last used ${esc(t.last_used_at||'Never')}. ${t.revoked_at?'Revoked.':''}</p>${t.revoked_at?'':`<form method="post" action="/admin/tokens/${t.id}/revoke">${csrfField({csrfToken})}<button class="btn btn-danger">Revoke token</button></form>`}</article>`).join(''):'<p>No tokens yet.</p>'}</section>`;
}
