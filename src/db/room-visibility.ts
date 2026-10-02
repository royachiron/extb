/** SQL equivalent of canRead(), with room alias r and a database-current viewer. */
export function roomReadVisibility(viewerId?: number): { sql: string; params: number[] } {
  const uid = viewerId ?? 0;
  return {
    sql: `NOT EXISTS (SELECT 1 FROM users v WHERE v.id = ? AND v.is_banned = 1)
      AND (
        EXISTS (SELECT 1 FROM users v WHERE v.id = ? AND v.is_approved = 1 AND v.access_level IN ('mod','admin'))
        OR (
          NOT EXISTS (SELECT 1 FROM room_permissions rp WHERE rp.room_id = r.id AND rp.user_id = ? AND rp.access_type IN ('blocked','deny'))
          AND (
            EXISTS (SELECT 1 FROM room_permissions rp JOIN users v ON v.id = rp.user_id WHERE rp.room_id = r.id AND rp.user_id = ? AND rp.access_type IN ('read','full','allow') AND v.is_approved = 1)
            OR (r.is_exclusive = 0 AND
              CASE r.min_read WHEN 'anon' THEN 0 WHEN 'member' THEN 1 WHEN 'full' THEN 2 WHEN 'mod' THEN 4 ELSE 99 END
                <= COALESCE((SELECT CASE v.access_level WHEN 'member' THEN 1 WHEN 'full' THEN 2 WHEN 'mod' THEN 4 WHEN 'admin' THEN 5 ELSE 0 END FROM users v WHERE v.id = ? AND v.is_approved = 1), 0)
              AND (r.is_locked = 0 OR EXISTS (SELECT 1 FROM users v WHERE v.id = ? AND v.is_approved = 1 AND v.access_level IN ('full','mod','admin'))))
          )
        )
      )`,
    params: Array(6).fill(uid),
  };
}
