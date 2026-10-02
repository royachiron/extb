import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { wizardScript } from '../installer/src/wizard.ts';
import { makeCommunityDraft, renderCommunityPreview } from '../src/community/draft.ts';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const locale of ['en-US', 'he-IL']) {
    const context = await browser.newContext({ locale, viewport: { width: 390, height: 844 } });
    let installed; const errors = [];
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await context.route('https://extb.achiron.fyi/**', async route => {
      const request = route.request(); const path = new URL(request.url()).pathname;
      if (path === '/wizard') return route.fulfill({ contentType: 'text/html', body: '<html><body><main id="app"></main><script type="module" src="/wizard.js"></script></body></html>' });
      if (path === '/wizard.js') return route.fulfill({ contentType: 'application/javascript', body: wizardScript });
      if (path === '/api/session') return route.fulfill({ json: { csrf: 'csrf', accounts: [{ id: 'a'.repeat(32), name: 'Account' }] } });
      if (path === '/api/preview') {
        const body = request.postDataJSON(); const draft = body.draft || makeCommunityDraft(body.input);
        return route.fulfill({ json: { draft, html: renderCommunityPreview(draft) } });
      }
      if (path === '/api/install') { installed = request.postDataJSON().draft; return route.fulfill({ status: 202, json: { stage: 'account checks', completed: [] } }); }
      if (path === '/api/status') return route.fulfill({ json: { stage: 'complete', completed: ['account checks', 'database creation', 'migrations', 'Worker deployment', 'readiness'], dashboard: 'https://dash.cloudflare.com', url: 'https://example.workers.dev' } });
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
    await page.locator('details summary').click();
    const editor = page.locator('textarea'); const draft = JSON.parse(await editor.inputValue());
    draft.homepageCopy = 'Owner edited starter copy'; await editor.fill(JSON.stringify(draft));
    assert.equal(await approve.isDisabled(), true);
    await page.locator('details button').click();
    await page.getByText('Owner edited starter copy', { exact: true }).waitFor();
    assert.equal(await approve.isEnabled(), true);
    await approve.click(); await page.getByText('complete', { exact: true }).waitFor();
    assert.equal(installed.homepageCopy, 'Owner edited starter copy');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: English/Hebrew mobile wizard, escaped preview, explicit edits, approval of rendered draft and stage UI.');
} finally { await browser.close(); }
