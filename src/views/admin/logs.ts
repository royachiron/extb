import { esc } from '../layout';

export function renderLogs(opts: { logs?: any[]; actionFilter?: string }): string {
  const logs = opts.logs || [];
  const actionFilter = opts.actionFilter;

  const actions = [
    { label: 'All', value: '' },
    { label: 'User Deletions', value: 'delete_user' },
    { label: 'Access Updates', value: 'set_user_access' },
    { label: 'Room Updates', value: 'update_room' },
    { label: 'Bans', value: 'ban_user' },
  ];

  const tabs = `
    <nav class="user-status-pills" style="margin-bottom:24px;">
      ${actions.map(a => `
        <a href="/admin?section=logs${a.value ? `&action=${a.value}` : ''}" 
           hx-get="/admin?section=logs${a.value ? `&action=${a.value}` : ''}" 
           hx-target=".main" hx-push-url="true" 
           class="${(actionFilter || '') === a.value ? 'active' : ''}">${esc(a.label)}</a>
      `).join('')}
    </nav>
  `;

  const rows = logs.map(l => {
    let details = esc(l.details || '');
    if (l.target_id) {
      const name = l.target_name || `user${l.target_id}`;
      const link = `<a href="/u/${encodeURIComponent(name)}" hx-get="/u/${encodeURIComponent(name)}" hx-target=".main" hx-push-url="true" style="color:var(--primary); font-weight:700;">${esc(name)}</a>`;
      details = details.replace(`user=${l.target_id}`, `user=${link}`);
    }

    return `
      <tr class="log-row">
        <td class="col-time" title="${l.created_at}">${new Date(l.created_at).toLocaleString()}</td>
        <td class="col-admin"><strong>${esc(l.user_name || 'System')}</strong></td>
        <td class="col-action"><span class="badge action-badge">${esc(l.action.replace(/_/g, ' '))}</span></td>
        <td class="col-details">${details}</td>
      </tr>
    `;
  }).join('');

  return `
    <h1 class="page-title">Audit Trail</h1>
    ${tabs}
    <div class="card log-table-card">
      <div class="table-scroll-wrapper">
        <table class="admin-table">
          <thead>
            <tr>
              <th style="width:200px;">Time</th>
              <th style="width:150px;">Admin</th>
              <th style="width:150px;">Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="4" class="empty-state">No audit logs found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
