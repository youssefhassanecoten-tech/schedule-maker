/* Headless browser test: opens the app in Chrome, loads the real source file,
 * walks every tab, performs a live room edit, generates the ZIP and reports
 * any console error or page exception.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC = require('./paths').resolve('Raspisanie_versia_6.docx', process.argv[2]);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const errors = [];
  const logs = [];
  const report = e => { errors.push(e); console.log('!! ' + e); };
  page.on('console', m => {
    const txt = m.text();
    logs.push(m.type() + ': ' + txt);
    if (m.type() === 'error') report('console.error: ' + txt);
  });
  page.on('pageerror', e => report('pageerror: ' + (e.stack || e.message)));
  page.on('requestfailed', r => report('requestfailed: ' + r.url()));

  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));

  console.log('title:', await page.title());
  console.log('JSZip present:', await page.evaluate(() => typeof JSZip));
  console.log('SM present   :', await page.evaluate(() => typeof SM));

  // upload the real file through the hidden input
  await page.setInputFiles('#fileInput', SRC);
  await page.waitForSelector('#workSection:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(400);

  console.log('\nstats:', (await page.textContent('#stats')).replace(/\s+/g, ' ').trim());

  const tabs = await page.$$eval('#tabs .tab', els => els.map(e => e.textContent.trim()));
  console.log('tabs:', tabs.join(' | '));

// Resolve tabs by their visible label so the test does not break when a tab is
  // added, removed or reordered.
  const LABELS = {
    calendar: ['Календарь', 'Calendar'],
    rooms: ['Аудитории', 'Rooms'],
    counters: ['Счётчик занятий', 'Lesson counters'],
    requests: ['Переполнение', 'Overflow'],
    warnings: ['Предупреждения', 'Warnings'],
    files: ['Файлы', 'Files'],
    memory: ['Память', 'Memory'],
    settings: ['Настройки', 'Settings']
  };
  async function clickTab(id) {
    const want = LABELS[id];
    const idx = await page.$$eval('#tabs .tab', (els, want) =>
      els.findIndex(e => want.some(w => e.textContent.includes(w))), want);
    if (idx < 0) throw new Error('tab not found: ' + id);
    await page.click(`#tabs .tab:nth-child(${idx + 1})`);
    await page.waitForTimeout(280);
    return idx + 1;
  }

  for (const id of ['calendar', 'rooms', 'counters', 'requests', 'warnings', 'files', 'memory', 'settings']) {
    if (!(await page.$('#tabs .tab'))) break;
    let ok = true;
    try { await clickTab(id); } catch (e) { ok = false; console.log('  (no ' + id + ' tab)'); }
    if (!ok) continue;
    const active = await page.$eval('.panel.is-active', e => e.id).catch(() => '(none)');
    const chars = (await page.textContent('#panel-' + id).catch(() => '') || '').replace(/\s+/g, ' ').trim();
    console.log(`  tab ${id.padEnd(9)} active=${active.padEnd(16)} content=${chars.length} chars  ::  ${chars.slice(0, 100)}`);
  }

  // ---- live edit: pin a room and confirm it survives ----
  console.log('\n=== LIVE EDIT TEST ===');
  await clickTab('calendar');
  const before = await page.$$eval('.room-edit', els => els.map(e => e.value));
  const occupied = await page.$$eval('.cellbox', els => els.length);
  console.log('cells with lessons:', occupied, ' room selects:', before.length);

  const targetIdx = before.findIndex(v => v === '');
  if (targetIdx >= 0) {
    const sel = (await page.$$('.room-edit'))[targetIdx];
    const opts = await sel.$$eval('option', o => o.map(x => x.value));
    const pick = opts.find(o => o === '34') || opts[1];
    await sel.selectOption(pick);
    await page.waitForTimeout(500);
    const after = await page.$$eval('.room-edit', els => els.map(e => e.value));
    console.log('  pinned one lesson to room', pick);
    console.log('  pinned count now:', after.filter(v => v === pick).length, '(was', before.filter(v => v === pick).length + ')');
    const cell = await page.$$eval('.cellbox.is-locked', e => e.length);
    console.log('  cells marked as pinned:', cell);
  }

  // ---- counters table ----
  console.log('\n=== COUNTERS ===');
  await clickTab('counters');
  const counters = await page.$$eval('#countersTable tbody tr', rows =>
    rows.slice(0, 6).map(r => Array.from(r.children).map(c => c.textContent.trim()).join(' | ')));
  counters.forEach(c => console.log('  ' + c));
  console.log('  total group rows:', (await page.$$('#countersTable tbody tr')).length);

  // ---- rooms tab: block summary ----
  console.log('\n=== ROOMS TAB ===');
  await clickTab('rooms');
  console.log('  summary:', await page.textContent('#roomsSummary'));
  const blocks = await page.$$eval('.blockrow', els => els.slice(0, 4).map(e =>
    e.textContent.replace(/\s+/g, ' ').trim().slice(0, 130)));
  blocks.forEach(b => console.log('  ' + b));

  // ---- settings round trip ----
  console.log('\n=== SETTINGS ===');
  await clickTab('settings');
  await page.fill('#semWeeks', '20');
  await page.click('#applySem');
  await page.waitForTimeout(700);
  const weeks = await page.$$eval('#weekSel option', o => o.length);
  console.log('  after setting weeks=20, week selector has', weeks, 'options');
  await page.click('#resetSem');
  await page.waitForTimeout(700);
  console.log('  after reset, week selector has', (await page.$$eval('#weekSel option', o => o.length)), 'options');

  // ---- generate the ZIP ----
  console.log('\n=== GENERATE ===');
  await clickTab('files');
  console.log('  tree head:', (await page.textContent('#fileTree')).split('\n').slice(0, 4).join(' / '));
  const dl = page.waitForEvent('download', { timeout: 120000 });
  await page.click('#generateBtn');
  const download = await dl;
  const out = path.join(ROOT, 'browser-out.zip');
  await download.saveAs(out);
  console.log('  downloaded:', download.suggestedFilename(), fs.statSync(out).size, 'bytes');

  // ---- language switch ----
  console.log('\n=== LANGUAGE ===');
  await page.click('.lang-switch [data-lang="en"]');
  await page.waitForTimeout(400);
  console.log('  brand:', await page.textContent('#brandTitle'));
  const tabsEn = await page.$$eval('#tabs .tab', els => els.map(e => e.textContent.trim()));
  console.log('  tabs:', tabsEn.join(' | '));
  await clickTab('calendar');
  const headers = await page.$$eval('#weekGrid thead th', e => e.map(x => x.textContent.trim()).slice(0, 6));
  console.log('  week grid headers:', headers.join(' | '));
  await page.screenshot({ path: path.join(ROOT, 'screenshot-en.png'), fullPage: false });
  await page.click('.lang-switch [data-lang="ru"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-ru.png'), fullPage: false });

  // ---- dark mode shot ----
  await page.click('#themeBtn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ROOT, 'screenshot-dark.png') });
  console.log('  screenshots written');

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  errors.forEach(e => console.log('  ' + e));
  const warns = logs.filter(l => l.startsWith('warning'));
  if (warns.length) { console.log('warnings:'); warns.slice(0, 10).forEach(w => console.log('  ' + w)); }

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
