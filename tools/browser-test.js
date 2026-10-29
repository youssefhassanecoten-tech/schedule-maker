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

  // ---- editable room list ----
  console.log('\n=== ROOM LIST ===');
  await clickTab('settings');
  const roomsBefore = await page.$$eval('#roomList .room-row', els => els.length);
  await page.fill('#roomAddInput', '107');
  await page.click('#roomAddBtn');
  await page.waitForTimeout(500);
  const roomsAfter = await page.$$eval('#roomList .room-row', els => els.length);
  const roomState = await page.evaluate(() => SM.ui.state.rooms.indexOf('107') >= 0);
  const roomModel = await page.evaluate(() => SM.ui.state.model.rooms.indexOf('107') >= 0);
  console.log('  rooms:', roomsBefore, '->', roomsAfter, '| state:', roomState, '| model:', roomModel);
  if (roomsAfter !== roomsBefore + 1 || !roomState || !roomModel) {
    throw new Error('adding a room did not update the list and the model');
  }

  await page.fill('#roomList .room-row[data-room="107"] input', '108');
  await page.press('#roomList .room-row[data-room="107"] input', 'Tab');
  await page.waitForTimeout(500);
  const renamed = await page.evaluate(() => ({
    has108: SM.ui.state.rooms.indexOf('108') >= 0,
    has107: SM.ui.state.rooms.indexOf('107') >= 0
  }));
  console.log('  rename 107 -> 108:', JSON.stringify(renamed));
  if (!renamed.has108 || renamed.has107) throw new Error('renaming a room failed');

  await page.click('#roomList .room-row[data-room="108"] button');
  await page.waitForTimeout(500);
  const roomsEnd = await page.$$eval('#roomList .room-row', els => els.length);
  const roomGone = await page.evaluate(() => SM.ui.state.rooms.indexOf('108') < 0);
  console.log('  after remove:', roomsEnd, '| removed from state:', roomGone);
  if (roomsEnd !== roomsBefore || !roomGone) throw new Error('removing a room failed');

  // ---- add / remove a teacher in the locked-room list ----
  console.log('\n=== LOCKED ROOMS ===');
  await clickTab('settings');
  const beforeFixed = await page.$$eval('#fixedRooms .fixed-row', els => els.length);
  const addedTeacher = await page.evaluate(() => {
    const sel = document.querySelector('#fixedAddSel');
    const opt = [...sel.options].find(o => o.value);
    return opt ? opt.value : null;
  });
  console.log('  rows before:', beforeFixed, '| adding:', addedTeacher);
  if (!addedTeacher) throw new Error('no teacher available to add');

  await page.selectOption('#fixedAddSel', addedTeacher);
  await page.waitForTimeout(300);
  const afterAdd = await page.$$eval('#fixedRooms .fixed-row', els =>
    els.map(e => e.getAttribute('data-teacher')));
  if (afterAdd.length !== beforeFixed + 1 || afterAdd.indexOf(addedTeacher) < 0) {
    throw new Error('adding a teacher did not add a row');
  }

  await page.selectOption(`#fixedRooms .fixed-row[data-teacher="${addedTeacher}"] select`, '34');
  await page.waitForTimeout(500);
  const fixedRoom = await page.evaluate(n => SM.config.FIXED_ROOMS[n], addedTeacher);
  console.log('  locked room for', addedTeacher, '->', fixedRoom);
  if (fixedRoom !== '34') throw new Error('the chosen locked room was not stored');

  await page.click(`#fixedRooms .fixed-row[data-teacher="${addedTeacher}"] .fixed-remove`);
  await page.waitForTimeout(500);
  const afterRemove = await page.$$eval('#fixedRooms .fixed-row', els => els.length);
  const stillMapped = await page.evaluate(n => n in SM.config.FIXED_ROOMS, addedTeacher);
  console.log('  rows after remove:', afterRemove, '| still mapped:', stillMapped);
  if (afterRemove !== beforeFixed || stillMapped) {
    throw new Error('removing the teacher did not restore the list');
  }

  // ---- separate monthly schedules ----
  console.log('\n=== MONTHLY SPLITS ===');
  await clickTab('settings');
  const splitGroups = await page.evaluate(() => {
    const m = SM.ui.state.model;
    return SM.model.allGroups(m).filter(g => /^\d{3,4}$/.test(g)).slice(0, 2);
  });
  await page.click('#addSplit');
  await page.waitForTimeout(250);
  let splitInputs = await page.$$('#monthlySplits .split-row input');
  await splitInputs[0].fill('Бакалавры');
  await splitInputs[1].fill(splitGroups.join(', '));
  await page.waitForTimeout(500);
  console.log('  groups:', splitGroups.join(', '));
  console.log('  summary:', (await page.textContent('#splitsSummary')).trim());
  await clickTab('files');
  const treeText = await page.textContent('#fileTree');
  const monthlyLines = treeText.split('\n').filter(l => /Raspisanie_M_/.test(l));
  const splitLines = monthlyLines.filter(l => /Бакалавры/.test(l));
  console.log('  monthly files:', monthlyLines.length, '| with flow suffix:', splitLines.length);
  if (!splitLines.length) throw new Error('the split monthly is not listed in the Files tab');

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

  // the generated archive must actually contain the split documents
  const zip = await require('jszip').loadAsync(fs.readFileSync(out));
  const zipDocs = Object.keys(zip.files).filter(n => /\.docx$/.test(n));
  const zipSplit = zipDocs.filter(n => /Бакалавры/.test(n));
  const zipYears = [...new Set(zipDocs.map(n => (n.match(/\/(\d{4})\//) || [])[1]).filter(Boolean))];
  console.log('  year folders in zip:', zipYears.join(', '));
  if (!zipDocs.every(n => /\/(\d{4})\/[^/]+\//.test(n))) {
    throw new Error('a document is not inside <year>/<month>/');
  }
  console.log('  split documents in zip:', zipSplit.length, zipSplit[0] ? '(' + zipSplit[0] + ')' : '');
  if (!zipSplit.length) throw new Error('the generated zip has no split monthly document');

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

  // ---- ПО / -ДО rendering (synthetic grid: the sample has neither) ----
  console.log('\n=== PREP / ONLINE UI ===');
  const uiInfo = await page.evaluate(() => {
    const mk = (name, slot, text) => {
      const cells = new Array(SM.config.SLOT_COUNT).fill('');
      cells[slot] = text;
      return { name: name, cells: cells };
    };
    const teachers = [];
    for (let i = 0; i < 7; i++) teachers.push(mk('Тест' + (i + 1) + ' Т.Т.', 0, (300 + i) + ' (1-8)'));
    teachers.push(mk('Петрова П.П.', 0, 'ПО-2 (1-8)'));
    teachers.push(mk('Орлова О.О.', 0, 'ПО-2-ДО (1-8)'));
    SM.ui.state.model = SM.model.createModel({ title: 'test', teachers: teachers, warnings: [] }, {});
    /* ПО week 1 is main week 10 (02.11), not week 1. */
    SM.ui.state.week = 10;
    SM.ui.state.tab = 'calendar';
    SM.ui.renderAll();
    const boxes = [...document.querySelectorAll('#weekGrid .cellbox')];
    const online = boxes.find(b => b.textContent.indexOf('ПО-2-ДО') >= 0);
    const offline = boxes.find(b => /ПО-2\b(?!-ДО)/.test(b.textContent));
    return {
      boxes: boxes.length,
      onlineText: online ? online.textContent.replace(/\s+/g, ' ').trim() : '(missing)',
      onlineSelects: online ? online.querySelectorAll('select').length : -1,
      offlineSelects: offline ? offline.querySelectorAll('select').length : -1
    };
  });
  console.log('  lesson boxes:', uiInfo.boxes);
  console.log('  online cell :', uiInfo.onlineText, '| room selectors:', uiInfo.onlineSelects);
  console.log('  in-person   : room selectors:', uiInfo.offlineSelects);
  if (uiInfo.onlineSelects !== 0) throw new Error('online lesson still shows a room selector');
  if (uiInfo.offlineSelects !== 1) throw new Error('in-person lesson lost its room selector');

  // ---- holidays: double-click a day header, demo upload must be inert ----
  console.log('\n=== HOLIDAYS ===');
  await clickTab('calendar');
  let heads = await page.$$('#weekGrid thead th.day-head');
  await heads[0].dblclick();
  await page.waitForTimeout(600);
  const h1 = await page.evaluate(() => ({
    count: SM.ui.state.holidays.length,
    iso: SM.ui.state.holidays[0] || null,
    cls: (document.querySelector('#weekGrid th.day-head') || {}).className || '',
    chips: document.querySelectorAll('#holidaysList .holiday-chip').length,
    highlighted: document.querySelectorAll('#weekGrid .cellbox.is-holiday').length
  }));
  console.log('  after dblclick:', JSON.stringify(h1));
  if (h1.count !== 1) throw new Error('double-click did not mark a holiday');
  if (h1.cls.indexOf('is-holiday') < 0) throw new Error('day header is not marked red');
  if (h1.chips !== 1) throw new Error('the holiday chip is missing in Settings');
  if (!h1.highlighted) throw new Error('holiday lessons are not highlighted');

  const inert = await page.evaluate(() => {
    const box = document.querySelector('#holidayUpload');
    return {
      pointer: getComputedStyle(box).pointerEvents,
      grayscale: getComputedStyle(box).filter,
      disabled: document.querySelector('#holidayFile').disabled,
      tag: document.querySelector('#holidayDemo').textContent.trim(),
      glow: getComputedStyle(document.querySelector('#holidayDemo')).animationName
    };
  });
  console.log('  demo upload :', JSON.stringify(inert));
  if (inert.pointer !== 'none' || !inert.disabled) throw new Error('the holiday upload is still interactive');
  if (!inert.tag || inert.glow === 'none') throw new Error('the DEMO tag is missing or not glowing');

  await clickTab('calendar');
  heads = await page.$$('#weekGrid thead th.day-head');
  await heads[0].dblclick();
  await page.waitForTimeout(500);
  const h2 = await page.evaluate(() => SM.ui.state.holidays.length);
  console.log('  after second dblclick, holidays:', h2);
  if (h2 !== 0) throw new Error('double-click did not clear the holiday');

  // double-clicking any cell of a day works as well as its header
  const cell = await page.$('#weekGrid tbody tr:nth-child(1) td.cell:nth-child(2)');
  await cell.dblclick();
  await page.waitForTimeout(500);
  const h3 = await page.evaluate(() => ({
    n: SM.ui.state.holidays.length,
    iso: SM.ui.state.holidays[0] || null,
    hint: document.querySelector('#liveNote').textContent
  }));
  console.log('  cell dblclick   :', JSON.stringify(h3));
  if (h3.n !== 1) throw new Error('double-clicking a day cell did not mark a holiday');
  if (!/праздник/i.test(h3.hint)) throw new Error('the calendar hint does not explain the holiday double-click');
  /* The grid is rebuilt after a toggle, so the old handle is detached: query again. */
  const cell2 = await page.$('#weekGrid tbody tr:nth-child(1) td.cell:nth-child(2)');
  await cell2.dblclick();
  await page.waitForTimeout(400);
  if ((await page.evaluate(() => SM.ui.state.holidays.length)) !== 0) {
    throw new Error('double-clicking the cell again did not clear the holiday');
  }

  // ---- footer legal links and the user-facing pages ----
  console.log('\n=== LEGAL ===');
  const legal = await page.evaluate(() => ({
    privacy: document.querySelector('#footerPrivacy').getAttribute('href'),
    terms: document.querySelector('#footerTerms').getAttribute('href'),
    versionHref: document.querySelector('#footerVersion').getAttribute('href'),
    consent: document.querySelector('#footerConsent').textContent.trim(),
    rights: document.querySelector('#footerRights').textContent.trim(),
    version: document.querySelector('#footerVersion').textContent.trim(),
    configVersion: 'v' + SM.config.VERSION
  }));
  console.log('  footer:', JSON.stringify(legal));
  if (legal.privacy !== 'privacy.html' || legal.terms !== 'terms.html') {
    throw new Error('the footer legal links are wrong in Russian');
  }
  if (legal.versionHref !== 'changelog.html') {
    throw new Error('the version pill does not open the Russian changelog');
  }
  if (!/соглашаетесь|agree/i.test(legal.consent)) throw new Error('the footer consent line is missing');
  if (!/Youssef Hassan/.test(legal.rights)) throw new Error('the footer rights line is missing');
  if (!/^v\d+\.\d+\.\d+$/.test(legal.version) || legal.version !== legal.configVersion) {
    throw new Error('the footer version is missing or does not match config.VERSION');
  }

  /* The English UI must point at the English legal pages. */
  await page.click('.lang-switch [data-lang="en"]');
  await page.waitForTimeout(450);
  const legalEn = await page.evaluate(() => ({
    privacy: document.querySelector('#footerPrivacy').getAttribute('href'),
    terms: document.querySelector('#footerTerms').getAttribute('href'),
    versionHref: document.querySelector('#footerVersion').getAttribute('href')
  }));
  console.log('  footer EN:', JSON.stringify(legalEn));
  if (legalEn.privacy !== 'privacy.en.html' || legalEn.terms !== 'terms.en.html') {
    throw new Error('the English footer links do not point at the English pages');
  }
  if (legalEn.versionHref !== 'changelog.en.html') {
    throw new Error('the version pill does not open the English changelog');
  }

  /* What's new page: rendered from src/changelog.js in the page language. */
  for (const [file, title, latest] of [
    ['changelog.html', 'Что нового', 'Изменения этой версии'],
    ['changelog.en.html', "What's new", 'Changes in this version']
  ]) {
    await page.goto('file:///' + path.join(ROOT, file).replace(/\\/g, '/'));
    const info = await page.evaluate(() => ({
      h1: (document.querySelector('h1') || {}).textContent || '',
      version: (document.querySelector('#clVersion') || {}).textContent || '',
      configVersion: 'v' + ((window.SM && SM.config) ? SM.config.VERSION : '?'),
      latestTitle: (document.querySelector('#clLatestTitle') || {}).textContent || '',
      latestCount: document.querySelectorAll('#clLatest .cl-item').length,
      latestVersion: ((document.querySelector('#clLatest .cl-version') || {}).textContent || '').trim(),
      groups: document.querySelectorAll('#clAll .cl-group').length,
      total: document.querySelectorAll('#clAll .cl-item').length,
      pdfDisabled: document.querySelector('#clPdf').disabled,
      pdfMatted: document.querySelector('#clPdf').className.indexOf('is-matted') >= 0
    }));
    console.log('  ' + file + ':', JSON.stringify(info));
    if (info.h1.trim() !== title) throw new Error(file + ' headline is wrong');
    if (info.latestTitle.trim() !== latest) throw new Error(file + ' is not in its language');
    if (info.latestCount !== 1) throw new Error(file + ' does not isolate the current version');
    if (info.latestVersion !== info.configVersion) {
      throw new Error(file + ' latest entry is not the running version');
    }
    if (!info.groups || !info.total) throw new Error(file + ' rendered no history');
    if (info.version.indexOf(info.configVersion) < 0) {
      throw new Error(file + ' does not show the running version');
    }
    if (!info.pdfDisabled || !info.pdfMatted) throw new Error(file + ' PDF button is not matted yet');
  }

  for (const [file, needle] of [
    ['privacy.html', 'Политика конфиденциальности'],
    ['terms.html', 'Условия использования'],
    ['privacy.en.html', 'Privacy Policy'],
    ['terms.en.html', 'Terms of Use']
  ]) {
    await page.goto('file:///' + path.join(ROOT, file).replace(/\\/g, '/'));
    const h1 = (await page.textContent('h1') || '').trim();
    const other = file.endsWith('.en.html') ? ['Политика конфиденциальности', 'Условия использования'] : ['Privacy Policy', 'Terms of Use'];
    const body = (await page.textContent('body') || '');
    console.log('  ' + file + ':', h1, '| leaks other language:', other.some(x => body.includes(x)));
    if (!h1.includes(needle)) throw new Error(file + ' heading is missing');
    if (other.some(x => body.includes(x))) throw new Error(file + ' still contains the other language');
  }

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  errors.forEach(e => console.log('  ' + e));
  const warns = logs.filter(l => l.startsWith('warning'));
  if (warns.length) { console.log('warnings:'); warns.slice(0, 10).forEach(w => console.log('  ' + w)); }

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
