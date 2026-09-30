/* Node harness: validates the core pipeline against a real department file.
 * Usage: node tools/validate.js "C:\Users\yousef\Downloads\Raspisanie_versia_6.docx"
 */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = require('@xmldom/xmldom').DOMParser;
global.JSZip = require('jszip');

['config', 'util', 'spec', 'cellparse', 'docx-read', 'resolve', 'counters', 'rooms',
 'docx-write', 'i18n', 'model', 'package',
 'templates/weekly', 'templates/monthly', 'templates/zayavka'
].forEach(f => require(path.join(ROOT, 'src', f + '.js')));

const SM = globalThis.SM;
const P = require('./paths');
const src = P.resolve('Raspisanie_versia_6.docx', process.argv[2]);

(async () => {
  const buf = fs.readFileSync(src);
  const grid = await SM.docxRead.readDocx(buf);
  console.log('=== SOURCE ===');
  console.log('title:', grid.title);
  console.log('teacher rows:', grid.teachers.length);
  console.log('reader warnings:', grid.warnings.length, grid.warnings.slice(0, 3));

  const model = SM.model.createModel(grid, {});
  console.log('\n=== MODEL ===');
  console.log('lessons:', model.stats.lessons);
  console.log('groups :', model.stats.groups);
  console.log('max topic:', model.stats.maxTopic);
  console.log('overflow slots:', model.stats.overflowSlots, 'extra rooms:', model.stats.extraRooms);

  console.log('\n=== WARNINGS (' + model.warnings.length + ') ===');
  const byKind = {};
  model.warnings.forEach(w => {
    const k = w.replace(/\d+/g, 'N').slice(0, 80);
    byKind[k] = (byKind[k] || 0) + 1;
  });
  Object.entries(byKind).sort((a, b) => b[1] - a[1]).slice(0, 15)
    .forEach(([k, n]) => console.log('  x' + n + '  ' + k));
  console.log('--- first 8 verbatim ---');
  model.warnings.slice(0, 8).forEach(w => console.log('  ' + w));

  // ---- verify numbering against values observed in the department's own files ----
  console.log('\n=== NUMBERING CHECK (week 5, Mon 28.09.2026 - Sat 03.10.2026) ===');
  const expect = {
    // base groups working weeks 1-8 -> their 5th week is lesson 5
    '263': 5, '264': 5, '265': 5, '266': 5, '267': 5, '268': 5,
    '271': 5, '272': 5, '273': 5, '274': 5,
    // 269 / 262 work weeks 2-9 -> week 5 is their 4th lesson
    '269': 4, '262': 4,
    // 36x groups work weeks 1,3,5,7 -> week 5 is lesson 3
    '361': 3, '362': 3, '363': 3, '364': 2, '365': 3, '366': 3
  };
  const w5 = model.byWeek[5] || [];
  const firstOf = g => w5.filter(o => o.group === g).sort((a, b) => a.slot - b.slot)[0];
  let pass = 0, fail = 0;
  Object.entries(expect).forEach(([g, want]) => {
    const o = firstOf(g);
    if (!o) { console.log('  MISSING ' + g); fail++; return; }
    const got = o.topic;
    const ok = got === want;
    ok ? pass++ : fail++;
    console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '  ' + g.padEnd(6) + ' got ' + got + ' want ' + want +
                '  (' + SM.util.fmtRu(o.date) + ' ' + o.block + ')');
  });
  console.log('  pass ' + pass + ' / fail ' + fail);

  console.log('\n=== FAMILY INHERITANCE ===');
  ['263', '263А', '263Б', '262', '262А', '269', '269А', '269Б', '274', '274А', '274Б',
   '128А', '128Б', '126', '126А', '163', '163А', '163Б'].forEach(g => {
    const list = model.occurrences.filter(o => o.group === g);
    if (!list.length) { console.log('  ' + g.padEnd(7) + ' no lessons'); return; }
    const first = list[0], last = list[list.length - 1];
    console.log('  ' + g.padEnd(7) + ' n=' + String(list.length).padEnd(4) +
                ' first №' + String(first.topic).padEnd(4) +
                ' last №' + String(last.topic).padEnd(4) +
                ' (counterStart=' + first.counterStart + ')');
  });

  console.log('\n=== ROOM ALLOCATION: busiest blocks ===');
  const pools = {};
  model.occurrences.forEach(o => {
    const k = o.date + ' ' + o.block;
    (pools[k] || (pools[k] = [])).push(o);
  });
  Object.entries(pools).sort((a, b) => b[1].length - a[1].length).slice(0, 8).forEach(([k, v]) => {
    const ov = v.filter(o => o.overflow);
    console.log('  ' + k + '  n=' + v.length + '  overflow=' + ov.length +
                '  rooms=' + v.map(o => o.room).join(','));
  });

  console.log('\n=== REQUESTS (zayavka) ===');
  model.requests.forEach(r => console.log('  ' + SM.util.fmtRu(r.date) + '  ' + r.blockLabel +
                                        '  total=' + r.total + ' needed=' + r.needed));

  // ---- generate everything ----
  console.log('\n=== GENERATION ===');
  const { zip, manifest, count } = await SM.package.buildZip(model, { lang: 'ru' });
  const out = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
  fs.writeFileSync(path.join(__dirname, '..', 'out-test.zip'), out);
  console.log('files:', count, ' zip bytes:', out.length);
  const names = [];
  zip.forEach(function (rel) { names.push(rel); });
  console.log('--- archive contents ---');
  names.forEach(n => console.log('  ' + n));

  // round-trip the weekly document through the reader to prove it is valid OOXML
  const weekly = SM.templateWeekly.build(model, 5, { lang: 'ru' });
  const wblob = await weekly.toBlob(global.JSZip);
  const rt = await SM.docxRead.readDocx(wblob);
  console.log('\n=== ROUND TRIP (weekly week 5) ===');
  console.log('title:', rt.title);
  console.log('rows:', rt.teachers.length);
  const g = rt.teachers[0];
  console.log('first row:', g.name, '| non-empty cells:',
    g.cells.filter(c => c && c.trim()).length);

  const monthly = SM.templateMonthly.build(model, 2026, 10, { lang: 'ru' });
  fs.writeFileSync(path.join(__dirname, '..', 'out-test-monthly.docx'),
    Buffer.from(await monthly.toBlob(global.JSZip)));
  const z = SM.templateZayavka.build(model.requests, {});
  fs.writeFileSync(path.join(__dirname, '..', 'out-test-zayavka.docx'),
    Buffer.from(await z.toBlob(global.JSZip)));
  console.log('wrote out-test-monthly.docx, out-test-zayavka.docx');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
