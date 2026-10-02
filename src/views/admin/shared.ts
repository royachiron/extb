// Shared helpers for the admin section views (split from views/admin.ts).
export // Relative "3d ago" style; full timestamp goes in a title attribute at the call site.
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60); if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24); if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30); if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
