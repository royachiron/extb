import { CHAT_SCRIPT_BOOT } from '../src/views/chat-scripts';
import { renderIndexPanels, renderTopicCards, renderForumIndex } from '../src/views/feed';
import { renderTosPage } from '../src/views/tos';
import { STATIC_PAGES } from '../src/views/static-pages';
import { chatAddBtn, chatReplyBtn } from '../src/views/chat-message';
import { renderChat, renderChatParticipants } from '../src/views/chat';
import { renderOnboarding } from '../src/views/auth';
import { renderLayout } from '../src/views/layout';
import { renderLogin } from '../src/views/auth';
import { describe, it, expect } from 'vitest';
import { resolveLocale, localizeHtml, localizeResponse } from '../src/lib/localization';
import { validateBranding, DEFAULT_BRANDING, saveBranding } from '../src/lib/branding';
describe('interface localization', () => {
 it('selects valid query, then cookie, then configured default', () => {
 expect(resolveLocale(new Request('https://example.test/?lang=en',{headers:{cookie:'extb_locale=he'}}),'he')).toBe('en');
 expect(resolveLocale(new Request('https://example.test/?lang=evil',{headers:{cookie:'extb_locale=he'}}),'en')).toBe('he');
 expect(resolveLocale(new Request('https://example.test/'),'he')).toBe('he');
 expect(resolveLocale(new Request('https://example.test/'),'en')).toBe('en');
 });
 it('translates explicit UI only and preserves authored content, values and code', () => {
 const html='<html lang="en"><body><button><!--extb-ui-->Login<!--/extb-ui--></button><p>Login</p><input value="Login"><textarea>Login</textarea><script>const label="Login";</script><code>Login</code></body></html>';
 const he=localizeHtml(html,'he');
 expect(he).toContain('<html lang="he" dir="rtl">');
 expect(he).toContain('<button>כניסה</button>');
 expect(he).toContain('<p>Login</p><input value="Login"><textarea>Login</textarea><script>const label="Login";</script><code>Login</code>');
 expect(localizeHtml(html,'en')).toContain('<button>Login</button>');
 });
 it('preserves room and search parameters in language links', async () => {
 const response = new Response('<a class="language-switch" href="?lang=en" data-language="en">English</a>',{headers:{'Content-Type':'text/html'}});
 const translated = await localizeResponse(response,'he','https://example.test/chat?room=playground-chat&q=a%26b');
 expect(await translated.text()).toContain('href="/chat?room=playground-chat&amp;q=a%26b&amp;lang=en"');
 });
 it('renders Hebrew visitor navigation and auth while leaving branded and authored text unchanged', () => {
 const markup = renderLayout({branding:{...DEFAULT_BRANDING,name:'Login'},user:null,rooms:[{id:1,name:'Login',slug:'login-room',kind:'forum',min_read:'anon',is_page:0,is_locked:0} as any],title:'Login',body:renderLogin({csrfToken:'token'})});
 const hebrew = localizeHtml(markup,'he');
 expect(hebrew).toContain('>כניסה</a>');
 expect(hebrew).toContain('>הרשמה</a>');
 expect(hebrew).toContain('>סיסמה</label>');
 expect(hebrew).toContain('class="room-label">Login</span>');
 expect(hebrew).toContain(' - Login</title>');
 expect(hebrew).not.toContain('EXTB_UI:');
 expect(hebrew).not.toContain('<!--extb-ui-->');
 });
 it('preserves configured Hebrew when a legacy branding client omits locale', async () => {
 const recorded: unknown[][] = [];
 const env = { DB: { prepare: () => ({all:async()=>({results:[{key:'branding_default_locale',value:'he'}]}),bind:(...values:unknown[])=>{recorded.push(values);return{};}}),batch:async()=>[] }} as any;
 const {default_locale:_locale,...legacy} = DEFAULT_BRANDING;
 const saved = await saveBranding(env,legacy);
 expect(saved.default_locale).toBe('he');
 expect(recorded).toContainEqual(['branding_default_locale','he']);
 });
 it('preserves authored language-like links and badge attributes', async () => {
 const html = '<a href="?lang=en">authored</a><span class="badge" title="EXTB_UI:Login">Login</span><button title="Login" data-extb-i18n-title="Login">x</button><a class="language-switch" data-language="en" href="?lang=en">English</a>';
 const response = await localizeResponse(new Response(html,{headers:{'Content-Type':'text/html'}}),'he','https://example.test/chat?room=public');
 const body = await response.text();
 expect(body).toContain('<a href="?lang=en">authored</a>');
 expect(body).toContain('title="EXTB_UI:Login">Login</span>');
 expect(body).toContain('<button title="כניסה">x</button>');
 expect(body).toContain('href="/chat?room=public&amp;lang=en"');
 });
 it('localizes onboarding, chat participants, and dock controls while preserving authored notes', () => {
 expect(localizeHtml(renderOnboarding(),'he')).toContain('הקהילה שלך מוכנה');
 expect(localizeHtml(renderOnboarding({note:'Your community is ready. Join a conversation or introduce yourself.'}),'he')).toContain('Your community is ready.');
 const participants = localizeHtml(renderChatParticipants([]),'he');
 expect(participants).toContain('מחוברים');
 expect(participants).toContain('עדיין אין משתתפים');
 const dock = localizeHtml(renderChat({user:{id:1,display_name:'Online',is_approved:1,access_level:'member'} as any,dock:true,rooms:[]}),'he');
 for (const label of ['הסתרת צ׳אט','הגדלת הצ׳אט','ביטול תגובה']) expect(dock).toContain(label);
 const actions = localizeHtml(chatAddBtn(1)+chatReplyBtn(1,'Online'),'he');
 expect(actions).toContain('title="הוספת תגובה רגשית"');
 expect(actions).toContain('title="תגובה"');
 expect(actions).toContain('data-reply-author="Online"');
 });
 it('localizes public information and contributor counts while preserving community-authored rules', () => {
 const about=localizeHtml(STATIC_PAGES['/about']!.content,'he');
 expect(about).toContain('ברוכים הבאים לקהילה שלנו');
 expect(about).toContain('קריאת כללי הקהילה');
 const terms=localizeHtml(renderTosPage({...DEFAULT_BRANDING,rules:'Community rules'}),'he');
 expect(terms).toContain('כללי הקהילה ותנאי השימוש');
 expect(terms).toContain('white-space:pre-wrap">Community rules</p>');
 const panels=localizeHtml(renderIndexPanels(null,[],[],[{display_name:'Posts:',topic_count:3,post_count:4}]),'he');
 expect(panels).toContain('פרסומים: 3, תגובות: 4');
 expect(panels).toContain('Posts:');
 const live=chatAddBtn(1,'הוספת תגובה רגשית',false)+chatReplyBtn(1,'Online','תגובה',false);
 expect(live).toContain('title="תגובה"');
 expect(live).not.toContain('data-extb-i18n');
 });
 it('renders Hebrew live empty-chat guidance and suppresses unavailable bot hints', () => {
 const document = {documentElement:{lang:'he'},getElementById:()=>null};
 const helper = CHAT_SCRIPT_BOOT.slice(CHAT_SCRIPT_BOOT.indexOf('function chatUi'),CHAT_SCRIPT_BOOT.indexOf('(function()'));
 const chatUi = new Function('document',helper+';return chatUi;')(document);
 const chat=renderChat({user:null});
 const source=chat.slice(chat.indexOf('function maybeShowEmptyHints()'),chat.indexOf('function sendMessage('));
 let html='';
 const box={querySelector:()=>null,insertAdjacentHTML:(_position:string,value:string)=>{html=value;}};
 new Function('box','document','botDisplayName','chatUi',source+';maybeShowEmptyHints();')(box,document,'',chatUi);
 expect(html).toContain('שקט כאן כרגע');
 expect(html).not.toContain('/bot');
 expect(html).not.toContain('Quiet in here');
 });
 it('localizes feed count labels without translating titles or room names', () => {
 const topic={id:1,short_id:'a',room_id:1,title:'replies',tags:'',user_id:1,reply_count:1,last_reply_at:'2026-10-02T00:00:00Z'} as any;
 const cards=localizeHtml(renderTopicCards([topic,{...topic,reply_count:2}],null,[]),'he');
 expect(cards).toContain('class="tc-label">תגובה</span>');
 expect(cards).toContain('class="tc-label">תגובות</span>');
 expect(cards).toContain('replies</a>');
 const forum=localizeHtml(renderForumIndex({user:null,rooms:[{name:'topics',slug:'public',total_topics:3,total_replies:4}],topTopics:[],latestReplies:[],topContributors:[]}),'he');
 expect(forum).toContain('<small>דיונים</small>');
 expect(forum).toContain('<small>תגובות</small>');
 expect(forum).toContain('topics</a>');
 });
 it('keeps live chat presence Hebrew without translating participant names', () => {
 const document={documentElement:{lang:'he'}};
 const helper=CHAT_SCRIPT_BOOT.slice(CHAT_SCRIPT_BOOT.indexOf('function chatUi'),CHAT_SCRIPT_BOOT.indexOf('(function()'));
 const chatUi=new Function('document',helper+';return chatUi;')(document);
 const source=renderChat({user:null});
 const presence=source.slice(source.indexOf('function renderPresence(users)'),source.indexOf('function markRead()'));
 const participants={innerHTML:''};
 new Function('participants','botDisplayName','chatBotItem','esc','chatUi',presence+';renderPresence(["Online"]);')(participants,'',()=>'',(text:string)=>text,chatUi);
 expect(participants.innerHTML).toContain('chat-users-label">מחוברים</p>');
 expect(participants.innerHTML).toContain('data-nick="Online"');
 });
 it('validates the branding default locale', () => {
 expect(validateBranding({...DEFAULT_BRANDING,default_locale:'he'}).default_locale).toBe('he');
 expect(()=>validateBranding({...DEFAULT_BRANDING,default_locale:'ar'})).toThrow();
 });
});
