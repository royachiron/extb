import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.LANDING_ORIGIN || 'http://localhost:8791';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const lang of ['en', 'he']) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/?lang=${lang}`, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('html').getAttribute('lang'), lang);
      assert.equal(await page.locator('html').getAttribute('dir'), lang === 'he' ? 'rtl' : 'ltr');
      const layout = await page.evaluate(() => {
        const main = document.querySelector('.portal-col-main').getBoundingClientRect();
        return {
          width: document.documentElement.scrollWidth,
          imagesFit: [...document.images].every(image => {
            const box = image.getBoundingClientRect();
            return box.left >= main.left - 1 && box.right <= main.right + 1;
          }),
        };
      });
      assert.ok(layout.width <= width, `${lang} ${width}px: page overflows to ${layout.width}px`);
      assert.ok(layout.imagesFit, `${lang} ${width}px: screenshots overflow the content column`);
      for (const image of await page.locator('.portal-shot-img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(img => img.decode());
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${lang} ${width}px: layout and screenshots`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
