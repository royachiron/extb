export interface BotOption {
  label: string;
  branch: string;
}

export interface BotBranch {
  id: string;
  title: string;
  /** Plain-text paragraphs. Escaped at render time. */
  paragraphs: string[];
  /**
   * Fixed outbound links (e.g. "open r/biid on Reddit"). `url` MUST be a
   * build-time constant from this file, never user/request input - it is
   * rendered directly into an href.
   */
  externalLinks?: { label: string; url: string }[];
  /** Copy-paste blocks, rendered as <pre> with a copy button. */
  templates?: string[];
  /**
   * When set, each template also renders a "Start a post" link into
   * `/post?room=<slug>&title=...&body=<template>` instead of only Copy.
   * Omitted for branches whose templates are chat/DM lines, not topic posts
   * (reply helpers, the chat-only lobby prompts) - those stay Copy-only.
   */
  templatePostRoom?: string;
  options: BotOption[];
}

/**
 * A short, deterministic title for the "Start a post" link - never
 * generated text, just the template's own first sentence (or a word-boundary
 * truncation). Kept under the composer's 140-char title cap.
 */
export function deriveTitle(template: string): string {
  const oneLine = template.replace(/\s+/g, ' ').trim();
  const sentenceEnd = oneLine.slice(0, 100).match(/^(.{8,97}?[.!?])(\s|$)/);
  const cut = sentenceEnd ? sentenceEnd[1]! : oneLine.slice(0, 80).replace(/\s+\S*$/, '');
  return cut.length > 0 ? cut : oneLine.slice(0, 80);
}

const BACK: BotOption = { label: '← Back to menu', branch: 'menu' };

const BRANCHES: BotBranch[] = [
  { id: 'menu', title: 'Community helper', paragraphs: ['Choose a starting point. Nothing is posted for you.'], options: [{ label: 'Introduce yourself', branch: 'intro' }, { label: 'Start a discussion', branch: 'topic' }, { label: 'Reply to someone', branch: 'reply' }] },
  { id: 'intro', title: 'Say hello', paragraphs: ['A short introduction is enough.'], templates: ['Hi everyone! I am new here. Looking forward to meeting you.'], templatePostRoom: 'introductions', options: [BACK] },
  { id: 'topic', title: 'Start a discussion', paragraphs: ['Ask a question or share something you learned.'], templates: ['What have you been working on lately?'], templatePostRoom: 'general', options: [BACK] },
  { id: 'reply', title: 'Join a conversation', paragraphs: ['Be curious and respectful.'], templates: ['Thanks for sharing. How did you get started?'], options: [BACK] },
];

const BRANCH_MAP = new Map<string, BotBranch>(BRANCHES.map(b => [b.id, b]));

export function getBotBranch(id: string): BotBranch {
  return BRANCH_MAP.get(id) ?? BRANCH_MAP.get('menu')!;
}

export function listBotBranchIds(): string[] {
  return BRANCHES.map(b => b.id);
}

/** True when a chat message is addressed to the bot (never persisted). */
export function isBotCommand(content: string): boolean {
  const c = content.trim().toLowerCase();
  return c === '/bot' || c.startsWith('/bot ');
}

/** Map a `/bot ...` chat command to a branch id. Unknown args -> help. */
export function botCommandBranch(content: string): string {
  const arg = content.trim().toLowerCase().replace(/^\/bot\b/, '').trim();
  if (!arg) return 'menu';
  const direct: Record<string, string> = {
    help: 'help',
    intro: 'intro',
    reply: 'reply',
    topic: 'topic',
    quiet: 'quiet',
  };
  return direct[arg] ?? 'help';
}
