export interface Env {
  DB: D1Database;
  AI?: Ai;
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  IMAGES?: ImagesBinding;
  CHAT_ROOM: DurableObjectNamespace;
  PASSWORD_HASHER?: DurableObjectNamespace<import('./password-hasher').PasswordHasher>;
  BREVO_API_KEY?: string;
  PASSWORD_SALT: string;
  CHAT_DO_SECRET: string;
  SETUP_PASSPHRASE?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  EMAIL_FROM_ADDRESS?: string;
  COMMUNITY_ORIGIN?: string;
  CANONICAL_ORIGIN?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  BUILD_ID: string;
}

export type AccessLevel = 'member' | 'full' | 'mod' | 'admin';
export type UserCapability = 'club';
export type RoomKind = 'forum' | 'blog' | 'news' | 'questions' | 'chat';
export type MinReadGate = 'anon' | 'member' | 'full' | 'mod';
export type MinPostGate = 'anon' | 'member' | 'full' | 'mod';
export type ContentStatus = 'approved' | 'pending' | 'rejected';
export type UpgradeStatus = 'pending' | 'approved' | 'declined';
export type EmailTokenKind = 'verify' | 'reset';

export interface User {
  id: number;
  email: string | null;
  display_name: string | null;
  password_hash: string;
  bio: string | null;
  avatar_color: string;
  avatar_url?: string | null;
  allow_dms?: 0 | 1;
  access_level: AccessLevel;
  email_verified: 0 | 1;
  is_approved: 0 | 1;
  is_adult: 0 | 1;
  show_nsfw: 0 | 1;
  is_banned: 0 | 1;
  mod_note: string | null;
  timezone: string;
  pronouns: string | null;
  twitter_url: string | null;
  website_url: string | null;
  signature: string | null;
  cover_image: string | null;
  hide_activity: 0 | 1;
  hide_bio: 0 | 1;
  chat_icon: string | null;
  last_icon_change: string | null;
  created_at: string;
  threads_read_before?: string | null;
  intake_status?: 'none' | 'applicant' | 'pending' | 'declined' | 'approved';
  intake_gate_active?: boolean;
  intake_application_room_id?: number | null;
  intake_staff_user_id?: number | null;
  posting_restricted_at?: string | null;
  posting_restriction_reason?: string | null;
  monthly_upload_bytes?: number;
  monthly_upload_month?: string | null;
  tos_version?: number | null;
  password_salt?: string | null;
  review_notes?: string;
  require_review: number; delete_on_approve: number;
  last_visit_at?: string | null;
  has_club?: 0 | 1;
}

export interface Room {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  kind: RoomKind;
  min_read: MinReadGate;
  min_post: MinPostGate;
  sort_order: number;
  is_locked: 0 | 1;
  is_exclusive: 0 | 1;
  is_page: 0 | 1;
  user_permission?: 'blocked' | 'read' | 'full' | null;
  unread_count?: number;
  total_topics?: number;
  total_posts?: number;
  total_posts_all?: number;
}

export interface RoomPermissionRow {
  id: number;
  room_id: number;
  user_id: number;
  access_type: 'blocked' | 'read' | 'full';
  created_at: string;
  display_name?: string;
}

export interface ProfileTopicRow {
  id: number;
  short_id: string;
  title: string;
  created_at: string;
  room_id: number;
  room_name: string;
  room_slug: string;
}

export interface ProfilePostRow {
  id: number;
  topic_id: number;
  topic_short_id: string;
  content: string;
  created_at: string;
  topic_title: string;
  room_name: string;
  room_slug: string;
}

export interface Topic {
  id: number;
  short_id: string;
  room_id: number;
  user_id: number | null;
  anon_name: string | null;
  title: string;
  content: string;
  tags: string | null;
  status: ContentStatus;
  is_pinned: 0 | 1;
  is_locked: 0 | 1;
  reply_count: number;
  active_reply_count?: number;
  is_unread?: number;
  last_reply_at: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  deleted_by: number | null;
  removed_at: string | null;
  removed_by: number | null;
  author_display_name?: string | null;
  pronouns?: string | null;
  access_level?: AccessLevel;
  require_review: number; delete_on_approve: number;
  cw_tags?: CwTag[];
}
export interface Post {
  id: number;
  topic_id: number;
  topic_short_id?: string;
  user_id: number | null;
  anon_name: string | null;
  content: string;
  status: ContentStatus;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
  deleted_by: number | null;
  removed_at: string | null;
  removed_by: number | null;
  archived_at: string | null;
  archived_by: number | null;
  author_display_name?: string | null;
  pronouns?: string | null;
  access_level?: AccessLevel;
  badges_json?: string | null;
  cw_tags?: CwTag[];
  parent_post_id?: number | null;
  depth?: number;
}

export interface BadgePill {
  id: number;
  name: string;
  icon: string;
  color: string;
  shape: string;
}

export interface Session {
  token: string;
  user_id: number;
  expires_at: string;
}

export interface EmailToken {
  token: string;
  user_id: number;
  kind: EmailTokenKind;
  expires_at: string;
}

export interface DM {
  id: number;
  sender_id: number;
  recipient_id: number;
  content: string;
  read_at: string | null;
  created_at: string;
}

export interface UpgradeRequest {
  id: number;
  user_id: number;
  note: string | null;
  status: UpgradeStatus;
  handled_by: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Setting {
  key: string;
  value: string;
}

export interface ChatMessage {
  id: number;
  author_name: string;
  content: string;
  created_at: string;
  scope?: string;
  author_id?: number | null;
  deleted_at?: string | null;
  reply_to_id?: number | null;
  reply_to_author?: string | null;
  reply_to_excerpt?: string | null;
}

export interface Notification {
  id: number;
  user_id: number;
  content: string;
  url: string;
  read_at: string | null;
  created_at: string;
  // runtime-only fields (not in DB - kept for view compat)
  actor_name?: string;
  topic_title?: string;
  topic_id?: number;
  post_id?: number;
  type?: string;
  is_read?: boolean;
  actor_id?: number;
}

export interface Badge {
  id: number | string;
  name: string;
  icon: string;
  color: string;
  text_color?: string;
  shape: string;
  description: string;
  status?: 'have' | 'need';
}

export interface PostReaction {
  id: number;
  post_id: number;
  user_id: number;
  emoji: string;
  created_at: string;
}

export interface ModLog {
  id: number;
  mod_id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  details: string | null;
  created_at: string;
  mod_display_name?: string;
}

export interface BanAppeal {
  id: number;
  user_id: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  mod_id: number | null;
  mod_note: string | null;
  created_at: string;
  resolved_at: string | null;
  user_display_name?: string;
}

export interface Warning {
  id: number;
  user_id: number;
  mod_id: number | null;
  target_type: string;
  target_id: number | null;
  target_content: string | null;
  internal_memo: string | null;
  resolved_at: string | null;
  resolved_by: number | null;
  resolve_memo: string | null;
  created_at: string;
}

export interface WarningReply {
  id: number;
  warning_id: number;
  user_id: number;
  content: string;
  created_at: string;
  hide_author: 0 | 1;
}

export interface WarningWithReplies extends Warning {
  replies: WarningReply[];
  mod_display_name: string | null;
}

export interface WarningReplyWithAuthor extends WarningReply {
  author_display_name: string | null;
}

export interface ModWarningThread extends Warning {
  user_display_name: string | null;
  mod_display_name: string | null;
  replies: WarningReplyWithAuthor[];
}

export interface AppContext {
  locale?: import('./lib/localization').Locale;
  env: Env;
  user: User | null;
  cookies: string[];
  csrfToken?: string;
  ironGateActive?: boolean;
  branding?: import('./lib/branding').Branding;
  origin?: string;
}

export interface CwTag {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: string;
  is_spoiler: 0 | 1;
  is_nsfw: 0 | 1;
  sort_order: number;
  is_archived: 0 | 1;
  created_at: number;
}

export interface CwTagSeed {
  slug: string;
  name: string;
  description: string;
  color: string;
  is_spoiler: 0 | 1;
  is_nsfw: 0 | 1;
  sort_order: number;
}

export const CW_TAG_SEEDS: CwTagSeed[] = [];
