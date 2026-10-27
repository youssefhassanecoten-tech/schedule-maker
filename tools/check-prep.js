/* Preparatory-course (ПО) and distance (-ДО) lessons.
 *
 * The sample .docx has neither, so this builds a grid in memory and checks the
 * three rules:
 *   1. the weekly document lists ПО and online lessons, online without a room
 *   2. the auditorium request counts every in-person lesson and NO online one
 *   3. no ПО group appears in the monthly document
 * plus the group grammar (ПО-2, ПО-орд.2, optional -ДО) and the shared topic
 * counter for the online and in-person lessons of one group.
 *
 *   node tools/check-prep.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = require('@xmldom/xmldom').DOMParser;
global.JSZip = require('jszip');
['config','util','spec','cellparse','docx-read','resolve','counters','rooms','docx-write','i18n','model','package','templates/weekly','templates/monthly','templates/zayavka']
  .forEach(f => require(path.join(ROOT,'src',f+'.js')));
const SM = globalThis.SM;
const U = SM.util;

const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

function cells(pairs) {
  const a = new Array(SM.config.SLOT_COUNT).fill('');
  pairs.forEach(([i, text]) => { a[i] = text; });
  return a;
}

function rowCells(rowXml) {
  return (rowXml.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
    (tc.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || []).map(p =>
      (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
        .map(s => s.replace(/<[^>]+>/g, '')).join('')).join('\n'));
}
async function docText(doc) {
  const xml = await (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');
  return (xml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || []).map(rowCells);
}

(async () => {
  // ---- 1. grammar ------------------------------------------------------
  const cases = [
    ['ПО-2', 'ПО-2', true, false],
    ['ПО-орд.2', 'ПО-орд.2', true, false],
    ['ПО-2-ДО', 'ПО-2-ДО', true, true],
    ['ПО-орд.2-ДО', 'ПО-орд.2-ДО', true, true],
    ['ПО 2', 'ПО-2', true, false],
    ['ПО - орд. 3', 'ПО-орд.3', true, false],
    ['263', '263', false, false],
    ['263А', '263А', false, false]
  ];
  cases.forEach(([input, want, prep, online]) => {
    const g = U.normalizeGroup(input);
    check(g === want, 'normalizeGroup(' + input + ') = ' + g + ', want ' + want);
    check(U.isPrep(g) === prep, 'isPrep(' + input + ') wrong');
    check(U.isOnline(g) === online, 'isOnline(' + input + ') wrong');
  });

  // ---- grid: 7 regular + 1 ПО + 1 online in the Monday morning block ---
  const teachers = [];
  for (let i = 0; i < 7; i++) {
    teachers.push({ name: 'Тест' + (i + 1) + ' Т.Т.', cells: cells([[0, (300 + i) + ' (1-8)']]) });
  }
  teachers.push({ name: 'Петрова П.П.', cells: cells([[0, 'ПО-2 (1-8)']]) });
  teachers.push({ name: 'Орлова О.О.', cells: cells([[0, 'ПО-2-ДО (1-8)']]) });
  teachers.push({ name: 'Сидорова С.С.', cells: cells([[2, '263 (1-8)']]) });

  const model = SM.model.createModel({ title: 'test', teachers: teachers, warnings: [] }, {});

  const monday = model.occurrences.filter(o => o.date === '2026-08-31' && o.block === 'M');
  check(monday.length === 9, 'expected 9 lessons on Monday morning, got ' + monday.length);

  const online = model.occurrences.find(o => o.group === 'ПО-2-ДО');
  check(!!online, 'online lesson was not parsed');
  check(online && online.room === null, 'online lesson got a room: ' + (online && online.room));
  check(online && online.overflow === false, 'online lesson is marked as overflow');

  // ---- 2. request: 8 in-person lessons, online excluded ----------------
  const req = model.requests.find(r => r.date === '2026-08-31' && r.block === 'M');
  check(!!req, 'no request for the overflowing Monday block');
  if (req) {
    check(req.total === 8, 'request.total = ' + req.total + ', want 8 (online excluded, ПО counted)');
    check(req.needed === 1, 'request.needed = ' + req.needed + ', want 1');
  }

  // ---- 3. weekly document lists ПО and leaves the online room blank ----
  const week = SM.templateWeekly.build(model, 1, { lang: 'ru' });
  const rows = await docText(week);
  const flat = rows.map(cells => cells.join(' | ')).join('\n');
  check(flat.indexOf('ПО-2 (1-8)') >= 0, 'weekly is missing the ПО group');
  check(flat.indexOf('ПО-2-ДО (1-8)') >= 0, 'weekly is missing the online lesson');

  const onlineCell = rows.reduce((acc, cells) => {
    const hit = cells.find(c => c.indexOf('ПО-2-ДО') >= 0);
    return hit || acc;
  }, '');
  const onlineLines = onlineCell.split('\n');
  check(onlineLines[1] === '1н', 'online room line is "' + onlineLines[1] + '", want "1н" (no room, no dash)');

  // ---- 4. monthly excludes every ПО group ------------------------------
  const manifest = SM.package.manifest(model, { lang: 'ru' });
  const monthly = manifest.root.children['2026'].children['09_sentyabr'].files
    .filter(f => f.kind === 'monthly');
  check(monthly.length === 1, 'expected one main monthly for September');
  const mRows = await docText(await monthly[0].doc());
  const groups = [];
  mRows.forEach(cells => {
    if (cells.length !== 26) return;
    for (let d = 0; d < 6; d++) {
      const g = (cells[2 + d * 4] || '').trim();
      if (g) groups.push(g);
    }
  });
  check(groups.length > 0, 'the September monthly is empty');
  check(!groups.some(g => U.isPrep(g)), 'monthly still contains a ПО group: ' + groups.join(', '));
  check(groups.some(g => g === '263'), 'monthly is missing the regular group 263');

  // ---- 5. online and in-person share one topic sequence ----------------
  const family = model.occurrences
    .filter(o => U.counterGroup(o.group) === 'ПО-2')
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot)
    .map(o => o.topic);
  /* ПО-2 (1-8) and ПО-2-ДО (1-8) are one group: 16 lessons, one 1..16 run. */
  check(family.length === 16, 'expected 16 lessons in the ПО-2 family, got ' + family.length);
  check(U.unique(family).length === 16 && Math.max.apply(null, family) === 16,
    'ПО-2 topics are not a single 1..16 sequence: ' + family.join(','));

  const monthlyGroupNames = [...new Set(groups)];
  console.log('=== PREP / ONLINE ===');
  console.log('monday block    :', monday.length, 'lessons,', req && req.total, 'in person,',
    req && req.needed, 'extra room(s)');
  console.log('monthly groups  :', monthlyGroupNames.length, '(no ПО:', !groups.some(g => U.isPrep(g)) + ')');
  console.log('ПО-2 topics     :', family.length, '(1..' + Math.max.apply(null, family) + ')');
  console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
  if (fail.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
