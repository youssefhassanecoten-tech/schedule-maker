/* Diagnostics for the monthly table: which (week, day, block, group) lessons does
 * the department file have that the generated document does not, and why are a
 * few rows not picking up a week label?
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = require('@xmldom/xmldom').DOMParser;
global.JSZip = require('jszip');
['config','util','spec','cellparse','docx-read','resolve','counters','rooms','docx-write','i18n','model','package','templates/weekly','templates/monthly','templates/zayavka']
  .forEach(f => require(path.join(ROOT, 'src', f + '.js')));
const SM = globalThis.SM;
const P = require('./paths');
const wkNo = s => (String(s).match(/^(\d+)/) || [, ''])[1];

(async () => {
  const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'dept-monthly.json'), 'utf8'));
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx')));
  const model = SM.model.createModel(grid, {});
  const doc = SM.templateMonthly.build(model, 2026, 9, { lang: 'ru' });
  const xml = await (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');
  const rowsXml = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];

  const my = [];
  let curWeek = '', lastTime = '';
  const shapes = {};
  rowsXml.forEach((r, ri) => {
    const tcs = r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    const cells = tcs.map(tc => (tc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(s => s.replace(/<[^>]+>/g, '')).join('').trim());
    shapes[cells.length] = (shapes[cells.length] || 0) + 1;
    if (cells.length < 3) return;
    const wk = cells[0], tm = cells[1];
    if (/^Номер недели/.test(wk)) return;
    if (cells.length === 8 && cells.slice(2).length === 6 &&
        cells.slice(2).every(c => /^\d\d\.\d\d\.?$/.test(c))) { curWeek = ''; lastTime = ''; return; }
    if (/неделя/.test(wk)) { curWeek = wk; lastTime = ''; }
    // The sub-header row is all titles; it is not lesson data.
    if (cells.slice(2).some(c => /^№ гр\.$/.test(c))) return;
    // The time cell is merged across a whole row group, so only its first row
    // carries the label. Carry it forward, the way a reader of the table does.
    if (tm && /^\d{1,2}[.:]\d\d/.test(tm)) lastTime = tm;
    const effTime = tm || lastTime;
    for (let d = 0; d < 6; d++) {
      const g = cells[2 + d * 4] || '', t = cells[3 + d * 4] || '', tp = cells[5 + d * 4] || '';
      if (g || t) my.push({ week: curWeek, day: d, time: effTime, group: g, teacher: t, topic: tp, row: ri });
    }
  });

  console.log('=== row shapes (cell count -> how many) ===');
  Object.entries(shapes).sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log('  ' + k + ' cells : ' + v));

  const orphan = my.filter(e => !e.week);
  console.log('\n=== rows with no week label: ' + orphan.length + ' ===');
  orphan.slice(0, 10).forEach(e =>
    console.log('  row ' + e.row + '  ' + e.day + ' ' + e.time + '  ' + e.group + ' ' + e.teacher + ' #' + e.topic));

  // block-level comparison, ignoring the sub-slot time text
  const blockOf = t => (/9\.00|10\.45/.test(t) ? 'M' : /13\.10|14\.55/.test(t) ? 'A' : 'E');
  const mineKey = new Set();
  my.forEach(e => mineKey.add([wkNo(e.week), e.day, blockOf(e.time), e.group].join('|')));
  const refKey = new Set();
  ref.weeks.forEach(w => w.lessons.forEach(l =>
    refKey.add([wkNo(w.week), l.day, blockOf(l.time), l.group].join('|'))));

  const missing = [...refKey].filter(k => !mineKey.has(k));
  const extra = [...mineKey].filter(k => !refKey.has(k));
  console.log('\n=== (week, day, block, group) present in department file ===');
  console.log('  department : ' + refKey.size);
  console.log('  generated  : ' + mineKey.size);
  console.log('  MISSING from generated : ' + missing.length);
  missing.slice(0, 20).forEach(k => console.log('    ' + k));
  console.log('  extra in generated     : ' + extra.length);
  extra.slice(0, 20).forEach(k => console.log('    ' + k));
})().catch(e => { console.error(e); process.exit(1); });