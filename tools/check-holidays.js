/* Holidays override the lessons of their date.
 *
 *   1. every lesson on the date is flagged, none keeps a room, none overflows
 *   2. the auditorium request never counts a holiday lesson
 *   3. the weekly and monthly documents print those lessons red (fill + text)
 *   4. the topic numbering is unchanged (a holiday cancels, it does not renumber)
 *
 *   node tools/check-holidays.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = require('@xmldom/xmldom').DOMParser;
global.JSZip = require('jszip');
['config','util','spec','cellparse','docx-read','resolve','counters','rooms','docx-write','i18n','model','package','templates/weekly','templates/monthly','templates/zayavka']
  .forEach(f => require(path.join(ROOT,'src',f+'.js')));
const SM = globalThis.SM;
const P = require('./paths');

const HOLIDAY = '2026-09-28';   // Monday of week 5, 5 lessons in the sample
const WEEK = 5;

const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

async function xmlOf(doc) {
  return (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');
}

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx')));
  const plain = SM.model.createModel(grid, {});
  const hol = SM.model.createModel(grid, { holidays: [HOLIDAY] });

  const onDate = o => o.date === HOLIDAY;
  const lessons = hol.occurrences.filter(onDate);
  check(lessons.length > 0, 'the sample has no lessons on ' + HOLIDAY);
  check(lessons.every(o => o.holiday === true), 'a lesson on the holiday is not flagged');
  check(lessons.every(o => o.room === null), 'a holiday lesson kept a room');
  check(lessons.every(o => o.overflow === false), 'a holiday lesson is marked as overflow');

  // request never includes a holiday lesson
  hol.requests.forEach(r => {
    check(!r.lessons.some(o => o.holiday), 'request on ' + r.date + ' contains a holiday lesson');
  });
  check(hol.stats.extraRooms <= plain.stats.extraRooms,
    'extra rooms grew after marking a holiday');

  // numbering is stable
  check(plain.occurrences.map(o => o.group + '#' + o.topic).join(',') ===
        hol.occurrences.map(o => o.group + '#' + o.topic).join(','),
        'topic numbering changed when a holiday was marked');

  // weekly: the cells of that date are red, and only they
  const wxml = await xmlOf(SM.templateWeekly.build(hol, WEEK, { lang: 'ru' }));
  const fill = (wxml.match(/w:fill="FFE0E0"/g) || []).length;
  const colour = (wxml.match(/w:color w:val="C00000"/g) || []).length;
  check(fill === lessons.length, 'weekly red cells = ' + fill + ', want ' + lessons.length);
  check(colour === lessons.length * 3, 'weekly red runs = ' + colour + ', want ' + lessons.length * 3);

  // monthly (September), built through the package so the filtered view is used
  const manifest = SM.package.manifest(hol, { lang: 'ru' });
  const entry = manifest.root.children['2026'].children['09_sentyabr'].files
    .find(f => f.kind === 'monthly');
  check(!!entry, 'no September monthly in the package');
  const mxml = await xmlOf(await entry.doc());
  const dateCell = (mxml.match(/<w:tc><w:tcPr>[\s\S]*?w:fill="FFE0E0"[\s\S]*?<w:t[^>]*>28\.09\.<\/w:t>/g) || []).length;
  check(dateCell >= 1, 'the monthly date cell for the holiday is not red');
  check((mxml.match(/w:fill="FFE0E0"/g) || []).length >= lessons.length,
    'monthly lesson cells are not red');

  // zayavka: no request row mentions the holiday date
  const zxml = await xmlOf(SM.templateZayavka.build(hol.requests, { lang: 'ru' }));
  check(zxml.indexOf('28.09') < 0, 'the Zayavka still lists the holiday date');

  console.log('=== HOLIDAYS ===');
  console.log('date            :', HOLIDAY);
  console.log('lessons affected:', lessons.length);
  console.log('weekly red cells:', fill, ' monthly red cells:',
    (mxml.match(/w:fill="FFE0E0"/g) || []).length);
  console.log('extra rooms     : plain ' + plain.stats.extraRooms + ' -> holiday ' + hol.stats.extraRooms);
  console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
  if (fail.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
