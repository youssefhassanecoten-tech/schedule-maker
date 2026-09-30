/* Verifies the live GitHub Pages deployment: assets, manifest content type,
 * icons, service worker, and a full upload + generate cycle.
 *   node tools/live-test.js
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright-core');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || 'https://youssefhassanecoten-tech.github.io/schedule-maker/';
const SRC = require('./paths').resolve('Raspisanie_versia_6.docx', process.argv[3]);

(async () => {
  console.log('testing', URL, '\n');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push('pageerror: ' + e.message); console.log('!! ' + e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push('console: ' + m.text()); console.log('!! ' + m.text()); } });
  page.on('requestfailed', r => { errors.push('requestfailed: ' + r.url()); console.log('!! failed ' + r.url()); });

  const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('http status  :', resp.status());
  console.log('title        :', await page.title());
  console.log('JSZip        :', await page.evaluate(() => typeof JSZip));
  console.log('SM           :', await page.evaluate(() => typeof SM));

  const mf = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href;
    const r = await fetch(href);
    return { status: r.status, type: r.headers.get('content-type'), body: await r.json() };
  });
  console.log('manifest     :', mf.status, '|', mf.type, '| display=' + mf.body.display);

  for (const icon of mf.body.icons.slice(0, 2)) {
    const r = await page.evaluate(async u => {
      const res = await fetch(u);
      return res.status + ' ' + res.headers.get('content-type');
    }, icon.src);
    console.log('  icon ' + icon.src.padEnd(22), r);
  }

  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return reg ? reg.scope : null;
  });
  console.log('service worker:', sw || 'NOT REGISTERED');

  await page.setInputFiles('#fileInput', SRC);
  await page.waitForSelector('#workSection:not([hidden])', { timeout: 60000 });
  await page.waitForTimeout(600);
  console.log('stats        :', (await page.textContent('#stats')).replace(/\s+/g, ' ').trim().slice(0, 100));

  const dl = page.waitForEvent('download', { timeout: 180000 });
  await page.click('#tabs .tab:nth-child(6)');
  await page.waitForTimeout(400);
  await page.click('#generateBtn');
  const d = await dl;
  const out = path.join(require('os').tmpdir(), 'live-out.zip');
  await d.saveAs(out);
  console.log('download     :', d.suggestedFilename(), require('fs').statSync(out).size, 'bytes');

  console.log('\nERRORS (' + errors.length + ')');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
