/* Captures a screenshot of every tab, in both languages, for visual review. */
'use strict';
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC = require('./paths').resolve('Raspisanie_versia_6.docx', process.argv[2]);
const OUT = path.join(ROOT, 'shots');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
  page.on('pageerror', e => console.log('!! ' + e.message));
  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));
  await page.setInputFiles('#fileInput', SRC);
  await page.waitForSelector('#workSection:not([hidden])');
  await page.waitForTimeout(600);

  const tabs = ['calendar', 'rooms', 'counters', 'requests', 'warnings', 'files', 'settings'];
  for (const lang of ['ru', 'en']) {
    await page.click(`.lang-switch [data-lang="${lang}"]`);
    await page.waitForTimeout(300);
    for (let i = 0; i < tabs.length; i++) {
      await page.click(`#tabs .tab:nth-child(${i + 1})`);
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(OUT, `${lang}-${i + 1}-${tabs[i]}.png`) });
    }
  }
  console.log('screenshots written to', OUT);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
