import type { Setting } from '../types';
export interface BotOption { label: string; branch: string }
export interface BotBranch {
  id: string; title: string; paragraphs: string[]; templates?: string[];
  templatePostRoom?: string; options: BotOption[];
}
export const HELPER_FIELDS = ['intro', 'topic', 'reply', 'room', 'quiet'] as const;
export type HelperField = typeof HELPER_FIELDS[number];
export interface HelperConfig { name: string; intro: string; topic: string; reply: string; room: string; quiet: string }
export const DEFAULT_HELPER_CONFIG: HelperConfig = {
  name: 'Community helper',
  intro: 'A short introduction is enough. Share a name, an interest, and what brought you here. Only share details you are comfortable making visible to the room.',
  topic: 'Ask a question or share something you learned. Give your topic a clear title and choose a room that fits its subject.',
  reply: 'Be curious and respectful. Mention one part of the message that interested you, then add a thought or a question.',
  room: 'Read each room description and a few recent topics. Choose the closest match; contact staff if you are unsure.',
  quiet: 'You can take your time and read first. A short thank-you, a relevant question, or a simple hello is enough to join in.',
};
const HE: HelperConfig = {
  name: 'עוזר הקהילה', intro: 'היכרות קצרה מספיקה. אפשר לשתף שם, תחום עניין ומה הביא אותך לכאן. שתפו רק פרטים שנוח לכם לחשוף בחדר.',
  topic: 'שאלו שאלה או שתפו משהו שלמדתם. בחרו כותרת ברורה וחדר שמתאים לנושא.',
  reply: 'הגיבו בסקרנות ובכבוד. התייחסו לפרט שעניין אתכם והוסיפו מחשבה או שאלה.',
  room: 'קראו את תיאור החדר וכמה דיונים אחרונים. בחרו את החדר המתאים ביותר ופנו לצוות אם אתם מתלבטים.',
  quiet: 'אפשר לקחת זמן ולקרוא קודם. תודה קצרה, שאלה עניינית או שלום פשוט מספיקים כדי להשתתף.',
};
export function helperConfigFromSettings(settings: Setting[], lang = 'en'): HelperConfig {
  const defaults = lang === 'he' ? HE : DEFAULT_HELPER_CONFIG;
  let config: Record<string, unknown> = {};
  try { const parsed = JSON.parse(settings.find(s => s.key === 'helper_config')?.value ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed; } catch { /* Safe defaults. */ }
  const result = { ...defaults };
  for (const key of ['name', ...HELPER_FIELDS] as const) {
    if (typeof config[key] === 'string' && config[key].trim()) result[key] = config[key].trim().slice(0, key === 'name' ? 80 : 4000);
  }
  const legacyName = settings.find(s => s.key === 'bot_name')?.value?.trim();
  if (!config.name && legacyName) result.name = legacyName.slice(0, 80);
  return result;
}
export function deriveTitle(template: string): string {
  const oneLine = template.replace(/\s+/g, ' ').trim();
  const sentenceEnd = oneLine.slice(0, 100).match(/^(.{8,97}?[.!?])(\s|$)/);
  const cut = sentenceEnd ? sentenceEnd[1]! : oneLine.slice(0, 80).replace(/\s+\S*$/, '');
  return cut || oneLine.slice(0, 80);
}
export function getBotBranch(id: string, guidance?: HelperConfig, lang = 'en'): BotBranch {
  const he = lang === 'he';
  const config = guidance ?? (he ? HE : DEFAULT_HELPER_CONFIG);
  const options = HELPER_FIELDS.map((branch, i) => ({ branch, label: (he ? ['הציגו את עצמכם', 'פתחו דיון', 'הגיבו להודעה', 'מצאו את החדר המתאים', 'לא בטוחים מה לומר?'] : ['Introduce yourself', 'Start a discussion', 'Reply to someone', 'Find the right room', 'Unsure what to say?'])[i]! }));
  const back = [{ label: he ? 'חזרה לתפריט' : '← Back to menu', branch: 'menu' }];
  const index = HELPER_FIELDS.indexOf(id as HelperField);
  if (index >= 0) return { id, title: options[index]!.label, paragraphs: config[id as HelperField].split(/\n\s*\n/), options: back,
    templates: id === 'intro' ? [he ? 'שלום לכולם! אני חדש כאן ואשמח להכיר אתכם.' : 'Hi everyone! I am new here. Looking forward to meeting you.'] : id === 'topic' ? [he ? 'על מה אתם עובדים לאחרונה?' : 'What have you been working on lately?'] : id === 'reply' ? [he ? 'תודה על השיתוף. איך התחלתם?' : 'Thanks for sharing. How did you get started?'] : undefined };
  if (id === 'help') return { id, title: he ? 'עזרה' : 'Helper commands', paragraphs: ['/bot · /bot intro · /bot topic · /bot reply · /bot room · /bot quiet', he ? 'העוזר מציג הצעות בלבד. שום דבר לא מתפרסם אוטומטית.' : 'The helper suggests starting points. Nothing is posted automatically.'], options: back };
  return { id: 'menu', title: config.name, paragraphs: [he ? 'בחרו נקודת התחלה. שום דבר לא מתפרסם אוטומטית.' : 'Choose a starting point. Nothing is posted for you.'], options };
}
export function listBotBranchIds(): string[] { return ['menu', ...HELPER_FIELDS, 'help']; }
export function isBotCommand(content: string): boolean { const c = content.trim().toLowerCase(); return c === '/bot' || c.startsWith('/bot '); }
export function botCommandBranch(content: string): string {
  const arg = content.trim().toLowerCase().replace(/^\/bot\b/, '').trim();
  return !arg ? 'menu' : [...HELPER_FIELDS, 'help'].includes(arg as HelperField) ? arg : 'help';
}
