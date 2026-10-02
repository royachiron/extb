import type { User, Room, AccessLevel } from './types';

const RANK = { member: 1, full: 2, mod: 4, admin: 5 } as const;
const NEED = { anon: 0, member: 1, full: 2, mod: 4 } as const;

function rank(user: User | null): number {
  if (!user || user.is_banned) return 0;
  if (!user.is_approved) return 0;
  return RANK[user.access_level];
}

/** Mods+ bypass everything except ban. */
export function canRead(user: User | null, room: Room): boolean {
  if (user?.is_banned) return false;
  const r = rank(user);
  if (r >= RANK.mod) return true;

  // Per-user override (handles both old 'allow'/'deny' and new 'blocked'/'read'/'full')
  const rp = room.user_permission as string | null | undefined;
  if (rp === 'blocked' || rp === 'deny') return false;
  if ((rp === 'read' || rp === 'full' || rp === 'allow') && user?.is_approved) return true;

  // Exclusive mode: no explicit permission = blocked
  if (room.is_exclusive) return false;

  // Standard gate checks
  const need = NEED[room.min_read ?? 'anon'];
  if (room.is_locked && r < RANK.full) return false;
  return r >= need;
}

// True iff this viewer should see ZERO trace of this room anywhere
// (nav, index grid, latest-replies, search). Exclusive rooms the viewer
// can't read are fully hidden; everything else stays visible. Relies on
// canRead already returning true for mods and explicitly-granted users.
export function isHiddenRoom(user: User | null, room: Room): boolean {
  return (!!room.is_exclusive || room.min_read === 'full' || room.min_read === 'mod') && !canRead(user, room);
}

export function canPost(user: User | null, room: Room, ironGateActive?: boolean): boolean {
  if (user?.is_banned) return false;
  if (user?.posting_restricted_at) return false;
  if (room.min_post === 'anon') return true;
  if (!user || !user.display_name) return false;
  if (user.is_banned) return false;
  if (!user.is_approved) return false;
  const r = rank(user);
  if (r >= RANK.mod) return true;

  // Per-user override
  const rp = room.user_permission as string | null | undefined;
  if (rp === 'blocked' || rp === 'deny' || rp === 'read') return false;
  if (rp === 'full' || rp === 'allow') return true;

  // Exclusive mode: no explicit 'full' = blocked from posting
  if (room.is_exclusive) return false;

  // Standard gate checks
  const need = NEED[(room.min_post ?? 'member') as keyof typeof NEED];
  if (room.is_locked && r < RANK.full) return false;
  return r >= need;
}

export function isAdmin(user: User | null): boolean {
  if (!user || user.is_banned) return false;
  return RANK[user.access_level] === RANK.admin;
}

export function isMod(user: User | null): boolean {
  if (!user || user.is_banned) return false;
  return RANK[user.access_level] >= RANK.mod;
}

// Re-export to keep AccessLevel type used here (silences unused import warnings).
export type { AccessLevel };
