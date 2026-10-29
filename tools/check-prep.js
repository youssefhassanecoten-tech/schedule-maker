/* Preparatory-course (ПО) and distance (-ДО) lessons.
 *
 * The sample .docx has neither, so this builds a grid in memory and checks:
 *   1. ПО groups count their weeks from the ПО start date (2026-11-02), while
 *      regular groups count from the semester start (2026-08-31)
 *   2. the weekly document lists ПО and online lessons, online as "Nн-ДО"
 *   3. the auditorium request counts every in-person lesson and NO online one
 *   4. no ПО group appears in the monthly document
 *   5. online and in-person lessons of one group share one topic counter
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
async function docRows(doc) {
  const xml = await (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');
  return (xml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || []).map(rowCells);
}
function datesOf(model, group) {
  return model.occurrences.filter(o => o.group === group)
    .map(o => o.date).sort();
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

  /* Regular week 1 is 31.08; ПО week 1 is 02.11 (main week 10). "(1-8)" must
   * therefore land in different months for the two kinds of group. */
  const teachers = [
    { name: 'Регуляр Р.Р.', cells: cells([[0, '263 (1-8)']]) },
    { name: 'Петрова П.П.', cells: cells([[0, 'ПО-2 (1-8)']]) },
    { name: 'Орлова О.О.', cells: cells([[0, 'ПО-2-ДО (1-8)']]) }
  ];
  /* Seven more in-person groups meeting on main week 10 (= ПО week 1) so the
   * block overflows exactly once and the online lesson must not add to it. */
  for (let i = 0; i < 7; i++) {
    teachers.push({ name: 'Тест' + (i + 1) + ' Т.Т.', cells: cells([[0, (300 + i) + ' (10)']]) });
  }

  const model = SM.model.createModel({ title: 'test', teachers: teachers, warnings: [] }, {});

  // ---- 2. separate week anchors ---------------------------------------
  const regular = datesOf(model, '263');
  check(regular[0] === '2026-08-31', 'regular week 1 starts ' + regular[0] + ', want 2026-08-31');
  check(regular[regular.length - 1] === '2026-10-19',
    'regular week 8 ends ' + regular[regular.length - 1] + ', want 2026-10-19');

  const prep = datesOf(model, 'ПО-2');
  check(prep[0] === '2026-11-02', 'ПО week 1 starts ' + prep[0] + ', want 2026-11-02');
  check(prep[prep.length - 1] === '2026-12-21',
    'ПО week 8 ends ' + prep[prep.length - 1] + ', want 2026-12-21');
  check(prep.length === 8, 'expected 8 ПО lessons, got ' + prep.length);

  // ---- 3. online lesson ------------------------------------------------
  const online = model.occurrences.find(o => o.group === 'ПО-2-ДО');
  check(!!online, 'online lesson was not parsed');
  check(online && online.room === null, 'online lesson got a room: ' + (online && online.room));
  check(online && online.overflow === false, 'online lesson is marked as overflow');

  const block = model.occurrences.filter(o => o.date === '2026-11-02' && o.block === 'M');
  check(block.length === 9, 'expected 9 lessons in the 02.11 morning block, got ' + block.length);

  // ---- 4. request: 8 in-person lessons, online excluded ----------------
  const req = model.requests.find(r => r.date === '2026-11-02' && r.block === 'M');
  check(!!req, 'no request for the overflowing 02.11 block');
  if (req) {
    check(req.total === 8, 'request.total = ' + req.total + ', want 8 (online excluded, ПО counted)');
    check(req.needed === 1, 'request.needed = ' + req.needed + ', want 1');
  }

  // ---- 5. weekly: ПО appears in ITS week, with Nн-ДО ------------------
  const week1 = (await docRows(SM.templateWeekly.build(model, 1, { lang: 'ru' })))
    .map(cells => cells.join(' | ')).join('\n');
  check(week1.indexOf('263 (1-8)') >= 0, 'weekly week 1 is missing the regular group');
  check(week1.indexOf('ПО-2') < 0, 'ПО appears in main week 1 - the anchor is not applied');

  const week10Rows = await docRows(SM.templateWeekly.build(model, 10, { lang: 'ru' }));
  const week10 = week10Rows.map(cells => cells.join(' | ')).join('\n');
  check(week10.indexOf('ПО-2 (1-8)') >= 0, 'weekly week 10 is missing the ПО group');
  check(week10.indexOf('ПО-2-ДО (1-8)') >= 0, 'weekly week 10 is missing the online lesson');

  const onlineCell = week10Rows.reduce((acc, cells2) => {
    const hit = cells2.find(c => c.indexOf('ПО-2-ДО') >= 0);
    return hit || acc;
  }, '');
  check(onlineCell.split('\n')[1] === '10н-ДО',
    'online room line is "' + onlineCell.split('\n')[1] + '", want "10н-ДО"');

  // ---- 6. monthly excludes every ПО group ------------------------------
  const manifest = SM.package.manifest(model, { lang: 'ru' });
  const y2026 = manifest.root.children['2026'];
  for (const folder of ['09_sentyabr', '11_noyabr']) {
    const monthly = y2026.children[folder].files.filter(f => f.kind === 'monthly');
    check(monthly.length === 1, 'expected one main monthly in ' + folder);
    const rows = await docRows(await monthly[0].doc());
    const G = SM.templateMonthly.GRID;
    const groups = [];
    rows.forEach(cells2 => {
      if (cells2.length !== G.columns) return;
      for (let d = 0; d < 6; d++) {
        const g = (cells2[G.dayBase + d * G.dayStride + G.groupOffset] || '').trim();
        if (g) groups.push(g);
      }
    });
    check(groups.length > 0, folder + ' monthly is empty');
    check(!groups.some(g => U.isPrep(g)), folder + ' monthly contains a ПО group: ' + [...new Set(groups)].join(', '));
    if (folder === '09_sentyabr') check(groups.indexOf('263') >= 0, 'September monthly is missing 263');
  }

  // ---- 7. online and in-person share one topic sequence ----------------
  const family = model.occurrences
    .filter(o => U.counterGroup(o.group) === 'ПО-2')
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot)
    .map(o => o.topic);
  check(family.length === 16, 'expected 16 lessons in the ПО-2 family, got ' + family.length);
  check(U.unique(family).length === 16 && Math.max.apply(null, family) === 16,
    'ПО-2 topics are not a single 1..16 sequence: ' + family.join(','));

  console.log('=== PREP / ONLINE ===');
  console.log('regular week 1  :', regular[0], '->', regular[regular.length - 1]);
  console.log('ПО week 1       :', prep[0], '->', prep[prep.length - 1]);
  console.log('02.11 block     :', block.length, 'lessons,', req && req.total, 'in person,',
    req && req.needed, 'extra room(s)');
  console.log('ПО-2 topics     :', family.length, '(1..' + Math.max.apply(null, family) + ')');
  console.log('online room line:', onlineCell.split('\n')[1]);
  console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
  if (fail.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
