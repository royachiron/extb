import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { wizardScript } from '../installer/src/wizard.ts';
import { draftPrompt, makeCommunityDraft, parseDraftText, renderCommunityPreview } from '../src/community/draft.ts';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const locale of ['en-US', 'he-IL']) {
    const context = await browser.newContext({ locale, viewport: { width: 390, height: 844 } });
    let installed; const errors = [];
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await context.route('https://extb.achiron.fyi/**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (path === '/wizard') return route.fulfill({ contentType: 'text/html', body: (locale.startsWith('he') ? '<html lang="he" dir="rtl">' : '<html lang="en" dir="ltr">') + '<body><main id="app"></main><script type="module" src="/wizard.js"></script></body></html>' });
      if (path === '/wizard.js') return route.fulfill({ contentType: 'application/javascript', body: wizardScript });
      if (path === '/api/session') return route.fulfill({ json: { csrf: 'csrf', accounts: [{ id: 'a'.repeat(32), name: 'Account' }] } });
      if (path === '/api/preview') {
        const body = request.postDataJSON(); const draft = body.draftText ? parseDraftText(body.draftText) : body.draft || makeCommunityDraft(body.input);
        return route.fulfill({ json: { draft, html: renderCommunityPreview(draft), prompt: draftPrompt(draft) } });
      }
      if (path === '/api/install') { installed = request.postDataJSON().draft; return route.fulfill({ status: 202, json: { stage: 'account checks', completed: [] } }); }
      if (path === '/api/status') return route.fulfill({ json: { stage: 'complete', completed: ['account checks', 'database creation', 'migrations', 'ownership authorization', 'Worker deployment', 'readiness', 'owner account'], dashboard: 'https://dash.cloudflare.com', url: 'https://example.workers.dev', admin: { username: 'admin', password: 'EXTB2026-abcd-efgh-jkmn' } } });
      return route.fulfill({ status: 404, body: 'Not found' });
    });
    await page.goto('https://extb.achiron.fyi/wizard'); await page.waitForLoadState('networkidle');
    await page.locator('#community-name').fill('My <script>community</script>');
    await page.locator('#community-purpose').fill('Share ideas');
    await page.locator('#community-type').selectOption('club');
    await page.locator('#community-language').selectOption(locale.startsWith('he') ? 'he' : 'en');
    await page.locator('form button').click(); await page.locator('.community-preview').waitFor();
    assert.equal(await page.locator('.community-preview script').count(), 0);
    assert.equal(await page.locator('.community-preview').getAttribute('dir'), locale.startsWith('he') ? 'rtl' : 'ltr');
    const approve = page.getByRole('button', { name: locale.startsWith('he') ? 'אישור ויצירת הקהילה' : 'Approve and create community', exact: true });
    await page.locator('#draft-ai summary').click();
    const prompt = await page.locator('#draft-prompt').inputValue();
    assert.match(prompt, /"slug": "announcements"/); assert.match(prompt, locale.startsWith('he') ? /ההעדפות שלי/ : /My preferences/);
    await page.locator('#draft-edit summary').click();
    const editor = page.locator('#draft-editor'); const draft = JSON.parse(await editor.inputValue());
    // Paste an assistant-style reply: prose and a code fence around the JSON.
    draft.homepageCopy = 'Owner edited starter copy'; await editor.fill('Here is your JSON:\n```json\n' + JSON.stringify(draft) + '\n```');
    assert.equal(await approve.isDisabled(), true);
    await page.locator('#draft-update').click();
    await page.getByText('Owner edited starter copy', { exact: true }).waitFor();
    assert.equal(await approve.isEnabled(), true);
    await approve.click(); await page.getByText(locale.startsWith('he') ? 'הפורום שלך באוויר!' : 'Your forum is live!', { exact: true }).waitFor();
    assert.equal(await page.locator('.wizard-creds code').nth(1).textContent(), 'EXTB2026-abcd-efgh-jkmn');
    assert.equal(await page.locator('.wizard-creds a').getAttribute('href'), 'https://example.workers.dev/login');
    assert.equal(installed.homepageCopy, 'Owner edited starter copy');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: English/Hebrew mobile wizard, escaped preview, explicit edits, approval of rendered draft and stage UI.');
} finally { await browser.close(); }
