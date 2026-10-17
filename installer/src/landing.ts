export type PortalLang = 'en' | 'he';

export function resolvePortalLang(url: URL, acceptLanguage?: string | null): PortalLang {
  const param = url.searchParams.get('lang')?.toLowerCase();
  if (param === 'he' || param === 'en') return param;
  return /^\s*he\b/i.test(acceptLanguage ?? '') ? 'he' : 'en';
}

export function renderLandingPage(lang: PortalLang = 'en'): string {
  return lang === 'he' ? landingPageHe : landingPageEn;
}

// The landing page remembers an explicit language choice so the setup wizard can follow it.
export const LANG_COOKIE = '__Host-extb_lang';
export function langCookie(lang: PortalLang): string {
  return `${LANG_COOKIE}=${lang}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
}
export function resolveWizardLang(request: Request): PortalLang {
  const chosen = request.headers.get('Cookie')?.match(/(?:^|; )__Host-extb_lang=(he|en)(?:;|$)/)?.[1];
  return chosen === 'he' || chosen === 'en' ? chosen : resolvePortalLang(new URL(request.url), request.headers.get('Accept-Language'));
}

export function renderWizardPage(lang: PortalLang): string {
  const t = lang === 'he' ? he : en;
  const w = lang === 'he'
    ? { title: 'הקמת קהילה', loading: 'טוען…', steps: 'השלבים', back: 'חזרה לדף הבית' }
    : { title: 'Community setup', loading: 'Loading…', steps: 'The steps', back: 'Back to home' };
  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/wizard.css">
<title>EXTB · ${w.title}</title>
</head>
<body class="portal-body">
<div class="portal-shell">
  <div class="portal-eyebrow">
    <span><span class="portal-dot" aria-hidden="true"></span>${t.portal}</span>
    <a class="portal-eyebrow-link" href="/?lang=${t.lang}">${w.back}</a>
  </div>
  <header class="portal-masthead">
    <div class="portal-logo" aria-hidden="true"><span>EXTB</span></div>
    <div>
      <div class="portal-name">EXTra Board <span class="portal-chip">${t.tagline}</span></div>
      <div class="portal-tagline">${t.motto}</div>
    </div>
  </header>
  <div class="portal-layout">
    <div class="portal-col-main">
      <div class="portal-panel portal-wizard">
        <h1 class="portal-h2">${w.title}</h1>
        <main id="app">${w.loading}</main>
      </div>
    </div>
    <aside class="portal-col-side">
      ${box(w.steps, `<ol class="portal-wizard-steps">${t.steps.map(s => `<li><strong>${s.title}</strong><span>${s.text}</span></li>`).join('')}</ol>`, 'portal-box-gold')}
      ${box(t.safeTitle, `<p>${t.safeText}</p>`)}
      ${box(t.freeTitle, `<p>${t.freeText}</p>`)}
    </aside>
  </div>
  <footer class="portal-footer"><p>${t.footer}</p></footer>
</div>
<script type="module" src="/wizard.js"></script>
</body>
</html>`;
}

const REPO = 'https://github.com/royachiron/extb';

interface Item { title: string; text: string }
interface Topic { title: string; examples: string }
interface Shot { file: string; title: string; caption: string; alt: string }

interface Copy {
  lang: PortalLang;
  dir: 'ltr' | 'rtl';
  title: string;
  description: string;
  portal: string;
  otherLang: { label: string; href: string; lang: PortalLang };
  tagline: string;
  motto: string;
  tabs: [string, string][];
  newLabel: string;
  newItems: string;
  eyebrow: string;
  h1: string;
  heroLead: string;
  cta: string;
  ctaNote: string;
  windowTitle: string;
  topicsTitle: string;
  topicsLead: string;
  topics: Topic[];
  topicsNote: string;
  featuresTitle: string;
  features: Item[];
  addons: string;
  shotsTitle: string;
  shotsHint: string;
  shots: Shot[];
  stepsTitle: string;
  steps: Item[];
  sideCtaTitle: string;
  sideChecks: string[];
  freeTitle: string;
  freeText: string;
  ownTitle: string;
  ownText: string;
  safeTitle: string;
  safeText: string;
  hoodTitle: string;
  hood: [string, string][];
  linksTitle: string;
  links: [string, string][];
  finalTitle: string;
  finalText: string;
  finalCta: string;
  manual: string;
  footer: string;
}

const en: Copy = {
  lang: 'en',
  dir: 'ltr',
  title: 'EXTB · Your own forum, about anything, free',
  description: 'Create a real forum with live chat, polls and private messages, free, in your own Cloudflare account.',
  portal: 'EXTB Network · Free forums for everyone',
  otherLang: { label: 'עברית', href: '/?lang=he', lang: 'he' },
  tagline: 'Community engine',
  motto: 'Forums, live chat and polls for every community',
  tabs: [['#top', 'Home'], ['#topics', 'Ideas'], ['#features', 'Features'], ['#inside', 'Screenshots'], ['#how', 'How it works'], ['#free', 'Free & yours']],
  newLabel: 'New in v0.4.0',
  newItems: 'Richer feed cards · Poll peek &amp; undo · Duplicate topic guard · Read-only freeze mode',
  eyebrow: 'The forum you always wanted',
  h1: 'Your own forum.<br>About anything. Free.',
  heroLead: 'Remember wanting a forum of your own, for your band, your guild, your street, your favorite show? EXTB builds it for you: real rooms and threads, a live chat room, polls and private messages. It runs free in your own Cloudflare account.',
  cta: 'Create my forum, free',
  ctaNote: 'A few clicks · Cloudflare free plan · No server to rent',
  windowTitle: 'my-forum.workers.dev - EXTB',
  topicsTitle: 'What will yours be about?',
  topicsLead: 'Every great forum started with one topic someone cared about. Pick yours.',
  topics: [
    { title: 'Games &amp; Guilds', examples: 'D&amp;D nights, Minecraft servers, speedrunners' },
    { title: 'Music &amp; Bands', examples: 'Your band, fan clubs, gear talk' },
    { title: 'Fandoms', examples: 'Anime, sci-fi, that one show' },
    { title: 'Neighborhood', examples: 'Your building, your street, local events' },
    { title: 'School &amp; Study', examples: 'Classes, study groups, alumni' },
    { title: 'Clubs &amp; Hobbies', examples: 'Photography, cars, gardening' },
    { title: 'Creators', examples: 'Your audience, behind the scenes' },
    { title: 'Projects', examples: 'Open source, makers, side projects' },
    { title: 'Support Circles', examples: 'Parents, recovery, peer help' },
  ],
  topicsNote: 'Choose a starter style (community, club, creator, project or support) and EXTB writes your first rooms, rules and welcome threads. You review all of it before anything is created.',
  featuresTitle: 'Everything you wished your old forum had',
  features: [
    { title: 'Rooms &amp; threads that last', text: 'Topics, replies, Markdown, reactions and search. Conversations that are still there next year.' },
    { title: 'Live chat, built in', text: 'A real-time chat room that stays docked while you browse. Quiet rooms go to sleep, so idle chat costs nothing.' },
    { title: 'Polls', text: 'Single or multiple choice. Vote right from the feed, peek at results, change your mind.' },
    { title: 'Private messages', text: 'DMs, @mentions and member profiles.' },
    { title: 'Your look', text: 'Your name, logo, accent color, homepage text and rules. Light and dark themes.' },
    { title: 'Your doors', text: 'Public reading, single-use invites, private rooms and member roles.' },
    { title: 'Moderation that works', text: 'Reports, warnings, bans, appeals and a full audit log. Freeze the board read-only any time.' },
    { title: 'Hebrew &amp; English', text: 'Full right-to-left and left-to-right, on phone and desktop.' },
    { title: 'AI helper (optional)', text: 'A built-in MCP server lets Claude or another agent help you manage rooms and reports, with a scoped token you can revoke.' },
  ],
  addons: '<strong>Optional add-ons:</strong> image uploads (Cloudflare R2), email sign-up and recovery, push notifications, your own domain.',
  shotsTitle: 'Take a look inside',
  shotsHint: 'Real screens, click to enlarge',
  shots: [
    { file: 'feed-chat', title: 'Home feed + live chat', caption: 'Who is active, what is new, and the chat room docked on the side.', alt: 'EXTB home feed with activity cards and a docked live chat' },
    { file: 'topic-poll', title: 'A thread with a poll', caption: 'Vote, peek at results, undo. Replies link straight to the message.', alt: 'EXTB discussion thread with an interactive poll' },
    { file: 'admin-cpanel', title: 'Your control panel', caption: 'Members, rooms, invites, moderation and AI tokens in one place.', alt: 'EXTB admin control panel' },
    { file: 'hebrew-rtl', title: 'Hebrew, dark theme', caption: 'Every screen works right-to-left, in light or dark.', alt: 'EXTB in Hebrew with the dark theme' },
  ],
  stepsTitle: 'How you get it',
  steps: [
    { title: 'Connect Cloudflare', text: 'Sign in or create a free Cloudflare account. Your forum lives there, not on our servers.' },
    { title: 'Describe your forum', text: 'Name, what it is about, language and starter style. Preview the rooms and first threads.' },
    { title: 'Open the doors', text: 'Create your admin account on your new forum and invite your first members.' },
  ],
  sideCtaTitle: 'Get your forum',
  sideChecks: ['Free to run', 'Yours to keep', 'Open source (MIT)'],
  freeTitle: 'Really free?',
  freeText: 'Yes. EXTB runs on Cloudflare\'s free plan, which currently includes 100,000 requests a day and a 500 MB database. That is plenty for a small community. Keep an eye on your dashboard as you grow.',
  ownTitle: '100% yours',
  ownText: 'No EXTB account and no central database. Your forum, your data, your Cloudflare account. Change anything you like: it is MIT-licensed.',
  safeTitle: 'Safe setup',
  safeText: 'The installer never sees your password. It uses temporary, encrypted Cloudflare access that is revoked once your forum is live, and it installs only checksum-verified releases.',
  hoodTitle: 'Under the hood',
  hood: [['Runs on', 'Cloudflare Workers'], ['Database', 'D1 (SQLite)'], ['Live chat', 'Durable Objects'], ['Pages', 'Server HTML + HTMX'], ['License', 'MIT']],
  linksTitle: 'Links',
  links: [[REPO, 'Source code'], [`${REPO}/releases/tag/v0.4.0`, 'Release notes'], [`${REPO}/blob/main/docs/INSTALLATION.md`, 'Manual install'], [`${REPO}/blob/main/docs/MCP.md`, 'MCP guide']],
  finalTitle: 'Your forum is waiting.',
  finalText: 'Name it, open the doors, and invite the people who care about the same thing you do.',
  finalCta: 'Continue with Cloudflare',
  manual: 'Prefer the command line? <a href="' + REPO + '/blob/main/docs/INSTALLATION.md">Manual install guide</a>',
  footer: 'EXTB · EXTra Board, open-source community software by Roy Achiron. Every forum is independent and belongs to whoever runs it.',
};

const he: Copy = {
  lang: 'he',
  dir: 'rtl',
  title: 'EXTB · פורום משלכם, על כל נושא, בחינם',
  description: 'הקימו פורום אמיתי עם צ׳אט חי, סקרים והודעות פרטיות, בחינם, בחשבון Cloudflare שלכם.',
  portal: 'רשת EXTB · פורומים בחינם לכולם',
  otherLang: { label: 'English', href: '/?lang=en', lang: 'en' },
  tagline: 'מנוע קהילות',
  motto: 'פורומים, צ׳אט חי וסקרים לכל קהילה',
  tabs: [['#top', 'ראשי'], ['#topics', 'רעיונות'], ['#features', 'יכולות'], ['#inside', 'צילומי מסך'], ['#how', 'איך זה עובד'], ['#free', 'חינם ושלכם']],
  newLabel: 'חדש בגרסה 0.4.0',
  newItems: 'כרטיסי פיד עשירים · הצצה וביטול בסקרים · מניעת נושאים כפולים · מצב קריאה בלבד',
  eyebrow: 'הפורום שתמיד רציתם',
  h1: 'פורום משלכם.<br>על כל נושא. בחינם.',
  heroLead: 'זוכרים שרציתם פורום משלכם? ללהקה, לגילדה, לשכונה, לסדרה האהובה? EXTB בונה אותו בשבילכם: חדרים ושרשורים אמיתיים, חדר צ׳אט חי, סקרים והודעות פרטיות. הכול רץ בחינם בחשבון Cloudflare שלכם.',
  cta: 'הקימו לי פורום, בחינם',
  ctaNote: 'כמה קליקים · התוכנית החינמית של Cloudflare · בלי לשכור שרת',
  windowTitle: 'my-forum.workers.dev - EXTB',
  topicsTitle: 'על מה יהיה הפורום שלכם?',
  topicsLead: 'כל פורום גדול התחיל מנושא אחד שמישהו אהב. בחרו את שלכם.',
  topics: [
    { title: 'משחקים וגילדות', examples: 'ערבי D&amp;D, שרתי מיינקראפט, ספידראנרים' },
    { title: 'מוזיקה ולהקות', examples: 'הלהקה שלכם, מועדוני מעריצים, ציוד' },
    { title: 'פאנדומים', examples: 'אנימה, מדע בדיוני, הסדרה ההיא' },
    { title: 'שכונה', examples: 'הבניין, הרחוב, אירועים מקומיים' },
    { title: 'לימודים', examples: 'כיתות, קבוצות למידה, בוגרים' },
    { title: 'מועדונים ותחביבים', examples: 'צילום, רכבים, גינון' },
    { title: 'יוצרים', examples: 'הקהל שלכם, מאחורי הקלעים' },
    { title: 'פרויקטים', examples: 'קוד פתוח, מייקרים, פרויקטים צדדיים' },
    { title: 'מעגלי תמיכה', examples: 'הורים, החלמה, עזרה הדדית' },
  ],
  topicsNote: 'בחרו סגנון פתיחה (קהילה, מועדון, יוצרים, פרויקט או תמיכה) ו-EXTB יכתוב בשבילכם את החדרים, הכללים ושרשורי הפתיחה. אתם רואים ומאשרים הכול לפני שמשהו נוצר.',
  featuresTitle: 'כל מה שרציתם שיהיה לפורום הישן',
  features: [
    { title: 'חדרים ושרשורים שנשארים', text: 'נושאים, תגובות, Markdown, תגובות אימוג׳י וחיפוש. שיחות שעוד יהיו שם בשנה הבאה.' },
    { title: 'צ׳אט חי מובנה', text: 'חדר צ׳אט בזמן אמת שנשאר פתוח בצד בזמן הגלישה. חדר שקט נרדם, כך שצ׳אט ריק לא עולה כלום.' },
    { title: 'סקרים', text: 'בחירה יחידה או מרובה. מצביעים ישר מהפיד, מציצים בתוצאות ומשנים דעה.' },
    { title: 'הודעות פרטיות', text: 'הודעות ישירות, תיוגים עם @ ופרופילים לחברים.' },
    { title: 'המראה שלכם', text: 'שם, לוגו, צבע, טקסט לדף הבית וכללים. מצב בהיר ומצב כהה.' },
    { title: 'הדלתות שלכם', text: 'קריאה פתוחה לכולם, הזמנות חד־פעמיות, חדרים פרטיים ותפקידים.' },
    { title: 'ניהול שעובד', text: 'דיווחים, אזהרות, הרחקות, ערעורים ויומן פעולות מלא. אפשר להקפיא את הפורום לקריאה בלבד בכל רגע.' },
    { title: 'עברית ואנגלית', text: 'תמיכה מלאה מימין לשמאל ומשמאל לימין, בטלפון ובמחשב.' },
    { title: 'עוזר AI (לא חובה)', text: 'שרת MCP מובנה מאפשר ל-Claude או לסוכן אחר לעזור לכם לנהל חדרים ודיווחים, עם טוקן מוגבל שאפשר לבטל.' },
  ],
  addons: '<strong>תוספות לבחירה:</strong> העלאת תמונות (Cloudflare R2), הרשמה ושחזור במייל, התראות פוש, דומיין משלכם.',
  shotsTitle: 'הציצו פנימה',
  shotsHint: 'מסכים אמיתיים, לחצו להגדלה',
  shots: [
    { file: 'feed-chat', title: 'פיד הבית + צ׳אט חי', caption: 'מי פעיל, מה חדש, וחדר הצ׳אט פתוח בצד.', alt: 'פיד הבית של EXTB עם כרטיסי פעילות וצ׳אט חי' },
    { file: 'topic-poll', title: 'שרשור עם סקר', caption: 'מצביעים, מציצים, מבטלים. קישור לתגובה מוביל ישר להודעה.', alt: 'שרשור דיון ב-EXTB עם סקר אינטראקטיבי' },
    { file: 'admin-cpanel', title: 'לוח הבקרה שלכם', caption: 'חברים, חדרים, הזמנות, ניהול וטוקנים ל-AI במקום אחד.', alt: 'לוח הבקרה של EXTB' },
    { file: 'hebrew-rtl', title: 'עברית, מצב כהה', caption: 'כל מסך עובד מימין לשמאל, בבהיר או בכהה.', alt: 'EXTB בעברית במצב כהה' },
  ],
  stepsTitle: 'איך מקבלים אותו',
  steps: [
    { title: 'מתחברים ל-Cloudflare', text: 'נכנסים לחשבון Cloudflare או פותחים אחד בחינם. הפורום שלכם יושב שם, לא אצלנו.' },
    { title: 'מתארים את הפורום', text: 'שם, נושא, שפה וסגנון פתיחה. רואים מראש את החדרים ואת השרשורים הראשונים.' },
    { title: 'פותחים את הדלתות', text: 'יוצרים חשבון מנהל בפורום החדש ומזמינים את החברים הראשונים.' },
  ],
  sideCtaTitle: 'קבלו פורום',
  sideChecks: ['חינם להפעלה', 'שלכם לתמיד', 'קוד פתוח (MIT)'],
  freeTitle: 'באמת בחינם?',
  freeText: 'כן. EXTB רץ על התוכנית החינמית של Cloudflare, שכוללת כיום 100,000 בקשות ביום ומסד נתונים של 500MB. זה מספיק לקהילה קטנה. כדאי לעקוב אחרי לוח הבקרה ככל שהקהילה גדלה.',
  ownTitle: '100% שלכם',
  ownText: 'אין חשבון EXTB ואין מסד נתונים מרכזי. הפורום, המידע והחשבון ב-Cloudflare שייכים לכם. אפשר לשנות הכול: הרישיון הוא MIT.',
  safeTitle: 'התקנה בטוחה',
  safeText: 'המתקין לא רואה את הסיסמה שלכם. הוא משתמש בגישה זמנית ומוצפנת ל-Cloudflare שמבוטלת ברגע שהפורום עולה, ומתקין רק גרסאות עם checksum מאומת.',
  hoodTitle: 'מתחת למכסה',
  hood: [['רץ על', 'Cloudflare Workers'], ['מסד נתונים', 'D1 (SQLite)'], ['צ׳אט חי', 'Durable Objects'], ['עמודים', 'HTML מהשרת + HTMX'], ['רישיון', 'MIT']],
  linksTitle: 'קישורים',
  links: [[REPO, 'קוד המקור'], [`${REPO}/releases/tag/v0.4.0`, 'הערות גרסה'], [`${REPO}/blob/main/docs/INSTALLATION.md`, 'התקנה ידנית'], [`${REPO}/blob/main/docs/MCP.md`, 'מדריך MCP']],
  finalTitle: 'הפורום שלכם מחכה.',
  finalText: 'תנו לו שם, פתחו את הדלתות והזמינו את מי שאכפת לו מאותו דבר כמוכם.',
  finalCta: 'המשך עם Cloudflare',
  manual: 'מעדיפים שורת פקודה? <a href="' + REPO + '/blob/main/docs/INSTALLATION.md">מדריך התקנה ידנית</a>',
  footer: 'EXTB · EXTra Board, תוכנת קהילות בקוד פתוח מאת Roy Achiron. כל פורום עצמאי ושייך למי שמפעיל אותו.',
};

function box(title: string, body: string, extraClass = ''): string {
  return `<div class="portal-box${extraClass ? ' ' + extraClass : ''}"><h2 class="portal-box-title">${title}</h2><div class="portal-box-body">${body}</div></div>`;
}

function render(t: Copy): string {
  const cta = (label: string, cls = '') => `<a class="portal-btn${cls ? ' ' + cls : ''}" href="/oauth/start">${label} <span aria-hidden="true">&raquo;</span></a>`;
  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${t.description}">
<link rel="stylesheet" href="/wizard.css">
<title>${t.title}</title>
</head>
<body class="portal-body">
<div class="portal-shell" id="top">
  <div class="portal-eyebrow">
    <span><span class="portal-dot" aria-hidden="true"></span>${t.portal}</span>
    <a class="portal-lang" href="${t.otherLang.href}" lang="${t.otherLang.lang}" hreflang="${t.otherLang.lang}">${t.otherLang.label}</a>
  </div>

  <header class="portal-masthead">
    <div class="portal-logo" aria-hidden="true"><span>EXTB</span></div>
    <div>
      <div class="portal-name">EXTra Board <span class="portal-chip">${t.tagline}</span></div>
      <div class="portal-tagline">${t.motto}</div>
    </div>
  </header>

  <nav class="portal-tabs" aria-label="${t.lang === 'he' ? 'ניווט' : 'Sections'}">
    ${t.tabs.map(([href, label], i) => `<a class="portal-tab${i === 0 ? ' portal-tab-active' : ''}" href="${href}">${label}</a>`).join('')}
  </nav>
  <div class="portal-ticker"><span class="portal-new">${t.newLabel}</span> ${t.newItems}</div>

  <div class="portal-layout">
    <div class="portal-col-main">
      <div class="portal-hero">
        <p class="portal-kicker">${t.eyebrow}</p>
        <h1>${t.h1}</h1>
        <p class="portal-lead">${t.heroLead}</p>
        ${cta(t.cta, 'portal-btn-big')}
        <p class="portal-note">${t.ctaNote}</p>
        <div class="portal-window">
          <div class="portal-winbar"><span class="portal-winbtns" aria-hidden="true"><i></i><i></i><i></i></span><span dir="ltr">${t.windowTitle}</span></div>
          <img class="portal-shot-img" src="/screenshots/feed-chat.png" alt="${t.shots[0]?.alt ?? ''}" width="1280" height="760">
        </div>
      </div>

      <section class="portal-panel" id="topics">
        <h2 class="portal-h2">${t.topicsTitle}</h2>
        <p class="portal-sub">${t.topicsLead}</p>
        <ul class="portal-directory">
          ${t.topics.map(x => `<li><a href="/oauth/start">${x.title}</a><span>${x.examples}</span></li>`).join('')}
        </ul>
        <p class="portal-fine">${t.topicsNote}</p>
      </section>

      <section class="portal-panel" id="features">
        <h2 class="portal-h2">${t.featuresTitle}</h2>
        <ul class="portal-features">
          ${t.features.map(x => `<li><h3>${x.title}</h3><p>${x.text}</p></li>`).join('')}
        </ul>
        <p class="portal-fine">${t.addons}</p>
      </section>

      <section class="portal-panel" id="inside">
        <h2 class="portal-h2">${t.shotsTitle} <small>${t.shotsHint}</small></h2>
        <div class="portal-shots">
          ${t.shots.map(s => `<figure class="portal-shot">
            <a href="/screenshots/${s.file}.png" target="_blank" rel="noopener">
              <span class="portal-winbar"><span class="portal-winbtns" aria-hidden="true"><i></i><i></i><i></i></span><span>${s.title}</span></span>
              <img class="portal-shot-img" src="/screenshots/${s.file}.png" alt="${s.alt}" loading="lazy" width="1280" height="760">
            </a>
            <figcaption>${s.caption}</figcaption>
          </figure>`).join('')}
        </div>
      </section>

      <section class="portal-panel" id="how">
        <h2 class="portal-h2">${t.stepsTitle}</h2>
        <ol class="portal-steps">
          ${t.steps.map(s => `<li><h3>${s.title}</h3><p>${s.text}</p></li>`).join('')}
        </ol>
      </section>

      <div class="portal-final">
        <h2>${t.finalTitle}</h2>
        <p>${t.finalText}</p>
        ${cta(t.finalCta, 'portal-btn-big')}
        <p class="portal-note">${t.manual}</p>
      </div>
    </div>

    <aside class="portal-col-side" id="free">
      ${box(t.sideCtaTitle, `${cta(t.cta)}<ul class="portal-checks">${t.sideChecks.map(c => `<li>${c}</li>`).join('')}</ul>`, 'portal-box-gold')}
      ${box(t.freeTitle, `<p>${t.freeText}</p>`)}
      ${box(t.ownTitle, `<p>${t.ownText}</p>`)}
      ${box(t.safeTitle, `<p>${t.safeText}</p>`)}
      ${box(t.hoodTitle, `<dl class="portal-specs">${t.hood.map(([k, v]) => `<dt>${k}</dt><dd dir="ltr">${v}</dd>`).join('')}</dl>`)}
      ${box(t.linksTitle, `<ul class="portal-links">${t.links.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ul>`)}
    </aside>
  </div>

  <footer class="portal-footer">
    <div class="portal-badges" aria-hidden="true" dir="ltr"><span>CLOUDFLARE<b>WORKERS</b></span><span>OPEN<b>SOURCE</b></span><span>HTML<b>+HTMX</b></span><span>RTL<b>READY</b></span><span>LICENSE<b>MIT</b></span></div>
    <p>${t.footer}</p>
  </footer>
</div>
</body>
</html>`;
}

const landingPageEn = render(en);
const landingPageHe = render(he);

export const landingPage = landingPageEn;

export const landingStyles = String.raw`
/* EXTB portal: 2002 web portal layout, modern type and spacing. */
body.portal-body {
  --pt-page: #d9e1ec;
  --pt-paper: #ffffff;
  --pt-ink: #12203a;
  --pt-muted: #4b5a74;
  --pt-line: #b7c5da;
  --pt-soft: #eef3fa;
  --pt-navy: #0b2a5b;
  --pt-navy-2: #1a4d9e;
  --pt-link: #1747a6;
  --pt-gold: #ffcf3f;
  --pt-gold-2: #f2a20c;
  --pt-gold-ink: #2a1c00;
  --pt-red: #c41e3a;
  --pt-glow: #5fe3ff;
  --pt-ok: #1f9d55;
  max-width: none;
  margin: 0;
  padding: 24px 16px 40px;
  color: var(--pt-ink);
  background-color: var(--pt-page);
  background-image: radial-gradient(rgba(11, 42, 91, .09) 1px, transparent 1px);
  background-size: 14px 14px;
  font: 15px/1.6 "Segoe UI", Tahoma, Verdana, system-ui, -apple-system, "Helvetica Neue", Arial, "Noto Sans Hebrew", "Noto Sans", sans-serif;
}
.portal-body main, .portal-body section, .portal-body details { padding: 0; margin: 0; border: 0; border-radius: 0; background: none; }
.portal-body a { color: var(--pt-link); }
.portal-body h1, .portal-body h2, .portal-body h3 { font-family: inherit; margin: 0; line-height: 1.25; }
.portal-body img { max-width: 100%; height: auto; display: block; }

.portal-shell {
  max-width: 1080px;
  margin: 0 auto;
  background: var(--pt-paper);
  border: 1px solid var(--pt-navy);
  box-shadow: 0 10px 40px rgba(11, 42, 91, .18);
}

.portal-eyebrow {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 6px 16px;
  font-size: 12px; letter-spacing: .02em;
  color: #c9d7ef; background: #071a3b;
}
.portal-dot { display: inline-block; width: 8px; height: 8px; margin-inline-end: 8px; background: var(--pt-ok); box-shadow: 0 0 6px var(--pt-ok); vertical-align: 1px; }
.portal-body .portal-lang {
  color: var(--pt-gold-ink); background: var(--pt-gold);
  padding: 2px 12px; font-weight: 700; text-decoration: none;
  border: 1px solid var(--pt-gold-2);
}
.portal-body .portal-lang:hover { background: #ffe07a; }

.portal-masthead {
  display: flex; align-items: center; gap: 18px;
  padding: 22px 24px;
  color: #fff;
  background:
    repeating-linear-gradient(90deg, rgba(95, 227, 255, .07) 0 1px, transparent 1px 48px),
    linear-gradient(180deg, var(--pt-navy-2), var(--pt-navy));
  border-bottom: 3px solid var(--pt-gold);
}
.portal-logo {
  flex: none; display: grid; place-items: center;
  width: 64px; height: 64px;
  background: linear-gradient(180deg, #ffe17a, var(--pt-gold-2));
  border: 2px solid #fff; outline: 1px solid var(--pt-gold-ink);
  color: var(--pt-gold-ink); font-weight: 900; font-size: 18px; letter-spacing: .04em;
}
.portal-name { font-size: 28px; font-weight: 800; letter-spacing: -.01em; }
.portal-chip {
  display: inline-block; vertical-align: middle;
  margin-inline-start: 8px; padding: 1px 8px;
  font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: var(--pt-glow); border: 1px solid var(--pt-glow);
}
.portal-tagline { color: #c9d7ef; font-size: 14px; }

.portal-tabs {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 8px 12px 0;
  background: linear-gradient(180deg, #c9d6ea, #aebfdb);
  border-bottom: 1px solid var(--pt-navy);
}
.portal-body .portal-tab {
  padding: 6px 14px;
  font-size: 13px; font-weight: 700; text-decoration: none;
  color: var(--pt-navy);
  background: linear-gradient(180deg, #fff, #e3eaf5);
  border: 1px solid #7f94b8; border-bottom: 0;
}
.portal-body .portal-tab:hover { background: #fff; }
.portal-body .portal-tab-active { background: var(--pt-paper); border-top: 3px solid var(--pt-gold-2); }

.portal-ticker { padding: 8px 16px; font-size: 13px; color: var(--pt-muted); background: #fffbea; border-bottom: 1px solid #f0dfa0; }
.portal-new { display: inline-block; margin-inline-end: 8px; padding: 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #fff; background: var(--pt-red); }

.portal-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 20px;
  padding: 20px;
}
.portal-col-main, .portal-col-side { min-width: 0; display: grid; gap: 20px; align-content: start; }

.portal-hero {
  padding: 28px 28px 24px;
  background: linear-gradient(180deg, var(--pt-soft), #fff 70%);
  border: 1px solid var(--pt-line);
  border-top: 4px solid var(--pt-navy-2);
}
.portal-kicker { margin: 0 0 6px; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--pt-navy-2); }
.portal-hero h1 { font-size: clamp(30px, 5vw, 46px); font-weight: 800; letter-spacing: -.02em; color: var(--pt-navy); }
.portal-lead { max-width: 60ch; margin: 14px 0 20px; font-size: 17px; color: #26334d; }
.portal-note { margin: 10px 0 0; font-size: 13px; color: var(--pt-muted); }

.portal-body .portal-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 10px 20px;
  font-weight: 800; text-decoration: none;
  color: var(--pt-gold-ink);
  background: linear-gradient(180deg, #ffe48a, var(--pt-gold) 45%, var(--pt-gold-2));
  border: 1px solid #b77a00;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7), 0 2px 0 #9a6600;
}
.portal-body .portal-btn:hover { filter: brightness(1.05); }
.portal-body .portal-btn:active { transform: translateY(1px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7); }
.portal-body .portal-btn:focus-visible, .portal-body a:focus-visible { outline: 3px solid var(--pt-navy-2); outline-offset: 2px; }
.portal-btn-big { font-size: 18px; padding: 14px 28px; }

.portal-window { margin-top: 24px; border: 1px solid var(--pt-navy); background: #fff; box-shadow: 0 0 0 4px rgba(95, 227, 255, .18), 0 12px 30px rgba(11, 42, 91, .2); }
.portal-winbar {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px;
  font-size: 12px; font-weight: 700; color: #fff;
  background: linear-gradient(90deg, var(--pt-navy), var(--pt-navy-2));
}
.portal-winbtns { display: inline-flex; gap: 4px; }
.portal-winbtns i { width: 10px; height: 10px; background: #dbe4f3; border: 1px solid #6c83ab; }

.portal-panel { padding: 22px 24px; border: 1px solid var(--pt-line); }
.portal-h2 { font-size: 22px; font-weight: 800; color: var(--pt-navy); padding-bottom: 8px; border-bottom: 2px solid var(--pt-gold); }
.portal-h2 small { font-size: 13px; font-weight: 400; color: var(--pt-muted); margin-inline-start: 8px; }
.portal-sub { margin: 10px 0 0; color: var(--pt-muted); }
.portal-fine { margin: 16px 0 0; font-size: 13px; color: var(--pt-muted); }

.portal-directory { list-style: none; margin: 16px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 20px; }
.portal-directory li { padding-inline-start: 12px; border-inline-start: 3px solid var(--pt-gold); }
.portal-directory a { font-weight: 800; font-size: 16px; }
.portal-directory span { display: block; font-size: 13px; color: var(--pt-muted); }

.portal-features { list-style: none; margin: 16px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.portal-features li { padding: 14px; background: var(--pt-soft); border: 1px solid #d6e0ef; }
.portal-features h3 { font-size: 15px; font-weight: 800; color: var(--pt-navy); }
.portal-features h3::before { content: ""; display: inline-block; width: 9px; height: 9px; margin-inline-end: 8px; background: var(--pt-gold-2); vertical-align: 1px; }
.portal-features p { margin: 6px 0 0; font-size: 14px; color: #33415c; }

.portal-shots { margin-top: 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.portal-shot { margin: 0; min-width: 0; }
.portal-shot a { display: block; text-decoration: none; border: 1px solid var(--pt-navy); }
.portal-shot a:hover { box-shadow: 0 0 0 3px rgba(95, 227, 255, .35); }
.portal-shot figcaption { margin-top: 6px; font-size: 13px; color: var(--pt-muted); }

.portal-steps { list-style: none; counter-reset: step; margin: 16px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.portal-steps li { counter-increment: step; }
.portal-steps li::before {
  content: counter(step);
  display: grid; place-items: center;
  width: 36px; height: 36px; margin-bottom: 8px;
  font-weight: 900; color: var(--pt-gold-ink);
  background: var(--pt-gold); border: 1px solid var(--pt-gold-2);
}
.portal-steps h3 { font-size: 16px; font-weight: 800; color: var(--pt-navy); }
.portal-steps p { margin: 4px 0 0; font-size: 14px; color: #33415c; }

.portal-final {
  padding: 32px 24px; text-align: center; color: #fff;
  background:
    repeating-linear-gradient(90deg, rgba(95, 227, 255, .07) 0 1px, transparent 1px 48px),
    linear-gradient(180deg, var(--pt-navy-2), var(--pt-navy));
}
.portal-final h2 { font-size: 30px; font-weight: 800; }
.portal-final p { margin: 8px auto 18px; max-width: 52ch; color: #d5e0f3; }
.portal-final .portal-note { margin: 14px 0 0; color: #b8c8e6; }
.portal-body .portal-final .portal-note a { color: var(--pt-glow); }

.portal-box { border: 1px solid var(--pt-line); background: #fff; }
.portal-box-title { padding: 7px 12px; font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #fff; background: linear-gradient(180deg, var(--pt-navy-2), var(--pt-navy)); }
.portal-box-body { padding: 12px; font-size: 14px; color: #33415c; }
.portal-box-body p { margin: 0; }
.portal-box-gold { border-color: var(--pt-gold-2); }
.portal-box-gold .portal-box-title { color: var(--pt-gold-ink); background: linear-gradient(180deg, #ffe48a, var(--pt-gold)); }
.portal-box-gold .portal-btn { width: 100%; }
.portal-checks { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 4px; font-weight: 700; color: var(--pt-ink); }
.portal-checks li::before { content: "\2713"; margin-inline-end: 8px; color: var(--pt-ok); font-weight: 900; }
.portal-specs { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 13px; }
.portal-specs dt { font-weight: 700; color: var(--pt-ink); }
.portal-specs dd { margin: 0; text-align: start; }
.portal-links { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.portal-links li::before { content: "\00BB"; margin-inline-end: 6px; color: var(--pt-gold-2); font-weight: 900; }

.portal-footer { padding: 16px 20px 20px; border-top: 1px solid var(--pt-line); background: var(--pt-soft); text-align: center; font-size: 13px; color: var(--pt-muted); }
.portal-footer p { margin: 10px 0 0; }
.portal-badges { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.portal-badges span {
  display: inline-flex; flex-direction: column; justify-content: center;
  width: 88px; height: 31px;
  font: 700 9px/1.1 Verdana, Tahoma, sans-serif; letter-spacing: .04em;
  color: #fff; background: linear-gradient(180deg, var(--pt-navy-2), var(--pt-navy));
  border: 1px solid #071a3b;
}
.portal-badges b { color: var(--pt-gold); font-size: 10px; }

.portal-body .portal-eyebrow-link { color: var(--pt-gold); }
.portal-wizard-steps { margin: 0; padding-inline-start: 20px; display: grid; gap: 10px; }
.portal-wizard-steps strong { display: block; color: var(--pt-ink); }
.portal-wizard-steps span { font-size: 13px; }

/* Setup wizard: wizard.js builds plain elements inside #app. */
.portal-body .portal-wizard #app { display: block; padding: 0; margin: 14px 0 0; border: 0; background: none; }
.portal-body .portal-wizard p { margin: 8px 0; }
.portal-body .portal-wizard form { display: grid; gap: 8px; }
.portal-body .portal-wizard label { display: block; margin-top: 8px; font-weight: 700; color: var(--pt-navy); }
.portal-body .portal-wizard input,
.portal-body .portal-wizard select,
.portal-body .portal-wizard textarea {
  width: 100%; padding: 10px 12px;
  font: inherit; color: var(--pt-ink);
  background: var(--pt-paper);
  border: 1px solid #7f94b8; border-radius: 0;
  box-shadow: inset 1px 1px 2px rgba(11, 42, 91, .12);
}
.portal-body .portal-wizard input:focus,
.portal-body .portal-wizard select:focus,
.portal-body .portal-wizard textarea:focus { outline: 3px solid rgba(95, 227, 255, .55); outline-offset: 0; border-color: var(--pt-navy-2); }
.portal-body .portal-wizard button {
  min-height: 44px; margin: 10px 0 0; margin-inline-end: 10px; padding: 10px 20px;
  font: inherit; font-weight: 800; color: var(--pt-gold-ink); cursor: pointer;
  background: linear-gradient(180deg, #ffe48a, var(--pt-gold) 45%, var(--pt-gold-2));
  border: 1px solid #b77a00; border-radius: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7), 0 2px 0 #9a6600;
}
.portal-body .portal-wizard button:hover { filter: brightness(1.05); }
.portal-body .portal-wizard button:disabled { opacity: .55; cursor: default; filter: none; }
.portal-body .portal-wizard a { display: inline-block; margin: 10px 0 0; margin-inline-end: 10px; font-weight: 700; }
.portal-body .portal-wizard section,
.portal-body .portal-wizard details { display: block; margin: 14px 0; padding: 14px; background: var(--pt-soft); border: 1px solid #d6e0ef; border-radius: 0; }
.portal-body .portal-wizard summary { font-weight: 800; color: var(--pt-navy); cursor: pointer; }
.portal-body .portal-wizard pre { padding: 12px; font-size: 13px; color: #d5e6ff; background: #0b1730; overflow: auto; }

@media (max-width: 960px) {
  .portal-layout { grid-template-columns: minmax(0, 1fr); }
  .portal-col-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .portal-features, .portal-directory { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  body.portal-body { padding: 0; }
  .portal-shell { border: 0; }
  .portal-masthead { padding: 16px; gap: 12px; }
  .portal-logo { width: 48px; height: 48px; font-size: 14px; }
  .portal-name { font-size: 22px; }
  .portal-chip { display: none; }
  .portal-tabs { flex-wrap: nowrap; overflow-x: auto; }
  .portal-body .portal-tab { flex: none; }
  .portal-layout { padding: 12px; gap: 14px; }
  .portal-col-main, .portal-col-side { gap: 14px; }
  .portal-hero { padding: 20px 16px; }
  .portal-lead { font-size: 16px; }
  .portal-body .portal-btn-big { width: 100%; font-size: 17px; }
  .portal-panel { padding: 16px; }
  .portal-col-side, .portal-features, .portal-directory, .portal-shots, .portal-steps { grid-template-columns: minmax(0, 1fr); }
  .portal-final h2 { font-size: 24px; }
}
`;
