// Heartbeat badge fragments, moved verbatim from api/heartbeat.ts.

/** Pure: the chat-activity nav badge - a bare dot, or empty when none. */
export function renderChatBadge(hasActivity: boolean): string {
  return hasActivity ? '<span class="chat-nav-badge"></span>' : '';
}

/** Pure: open-report count badge on the Mod nav link, empty when none. */
export function renderModBadge(count: number): string {
  return count > 0 ? `<span class="unread-badge">${count > 99 ? '99+' : count}</span>` : '';
}

/**
 * Pure: assemble the heartbeat response - four out-of-band swaps, one per
 * badge family. `.js-dm-badge`, `.js-chat-badge` and `.js-mod-badge` are class
 * selectors so a single fragment updates both the desktop nav copy and the
 * mobile bottom-nav copy at once; the notification badge exists only once,
 * addressed by id.
 */
export function renderHeartbeat(dmBadge: string, chatBadge: string, notifBadge: string, modBadge: string | null = null): string {
  return (
    `<span hx-swap-oob="innerHTML:.js-dm-badge">${dmBadge}</span>` +
    `<span hx-swap-oob="innerHTML:.js-chat-badge">${chatBadge}</span>` +
    `<span hx-swap-oob="innerHTML:#notification-badge-container">${notifBadge}</span>` +
    // Null = viewer is not staff: the .js-mod-badge element does not exist in
    // their nav, so omit the OOB span instead of asking HTMX to swap into
    // a missing target. Empty string still emits, clearing a stale count.
    (modBadge === null ? '' : `<span hx-swap-oob="innerHTML:.js-mod-badge">${modBadge}</span>`)
  );
}
