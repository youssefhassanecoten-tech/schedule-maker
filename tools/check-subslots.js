/* Verifies the property the department relies on: a lesson occupies BOTH
 * sub-slots of its block and shows the SAME "№ темы" in both.
 *
 *   9.00-10.30  Mikhailenko  105  1
 *  10.45-12.15  Mikhailenko  105  1
 *
 * Also checks that the two sub-slot groups carry the same lesson in the same
 * row, so the table reads as pairs rather than as a single unsplit column.
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

function cellsOf(rowXml) {
  return (rowXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
    (tc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(s => s.replace(/<[^>]+>/g, '')).join('').trim());
}

(async () => {
  const MONTH = 9; // October, months are 0-indexed
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx')));
  const model = SM.model.createModel(grid, {});
  const doc = SM.templateMonthly.build(model, 2026, MONTH, { lang: 'ru' });
  const xml = await (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');
  const rowsXml = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];

  // Walk rows, grouping them into (week, block, sub-slot) bands.
  let curWeek = '', lastTime = '', rowInBand = 0;
  const bands = [];   // {week, time, rows:[{row, day->{g,tp}}]}
  let band = null;

  rowsXml.forEach(r => {
    const cells = cellsOf(r);
    if (cells.length < 3) return;
    if (/^Номер недели/.test(cells[0])) return;
    if (cells.length === 8 && cells.slice(2).length === 6 &&
        cells.slice(2).every(c => /^\d\d\.\d\d\.?$/.test(c))) { curWeek = ''; lastTime = ''; return; }
    if (/неделя/.test(cells[0])) { curWeek = cells[0]; lastTime = ''; }
    if (cells.slice(2).some(c => /^№ гр\.$/.test(c))) return;

    const tm = cells[1];
    if (tm && /^\d{1,2}[.:]\d\d/.test(tm)) {
      lastTime = tm;
      band = { week: curWeek, time: tm, rows: [] };
      bands.push(band);
      rowInBand = 0;
    }
    if (!band) return;
    const perDay = {};
    for (let d = 0; d < 6; d++) {
      const g = cells[2 + d * 4] || '', tp = cells[5 + d * 4] || '';
      if (g || tp) perDay[d] = { group: g, topic: tp };
    }
    if (Object.keys(perDay).length) band.rows.push({ idx: rowInBand, perDay });
    rowInBand++;
  });

  console.log('=== bands (one per sub-slot group) ===');
  console.log('  total bands: ' + bands.length);
  const times = {};
  bands.forEach(b => { times[b.time] = (times[b.time] || 0) + 1; });
  Object.entries(times).forEach(([k, v]) => console.log('   ' + k.padEnd(20) + ' x' + v));

  // pair up consecutive bands that share a week and differ only by sub-slot
  const SUBA = { M: ['9.00. – 10.30.', '10.45. – 12.15.'], A: ['13.10. – 14.40.', '14.55. – 16.25'] };
  let checked = 0, topicMismatch = [], rowMismatch = [];
  for (let i = 0; i + 1 < bands.length; i++) {
    const b1 = bands[i], b2 = bands[i + 1];
    if (b1.week !== b2.week) continue;
    const pair = [b1.time, b2.time];
    const isPair = (pair[0] === SUBA.M[0] && pair[1] === SUBA.M[1]) ||
                   (pair[0] === SUBA.A[0] && pair[1] === SUBA.A[1]);
    if (!isPair) continue;
    checked++;
    const maxRows = Math.max(b1.rows.length, b2.rows.length);
    for (let ri = 0; ri < maxRows; ri++) {
      const r1 = b1.rows[ri], r2 = b2.rows[ri];
      const days = new Set([...(r1 ? Object.keys(r1.perDay) : []), ...(r2 ? Object.keys(r2.perDay) : [])]);
      days.forEach(d => {
        const a = r1 && r1.perDay[d], b = r2 && r2.perDay[d];
        if (!a || !b) {
          rowMismatch.push('week ' + (b1.week.match(/^\d+/) || [''])[0] +
            ' day ' + d + ' row ' + ri + '  ' + (a ? 'only in ' + b1.time : 'only in ' + b2.time) +
            '  group ' + (a ? a.group : b.group));
          return;
        }
        if (a.group !== b.group || a.topic !== b.topic) {
          topicMismatch.push('week ' + (b1.week.match(/^\d+/) || [''])[0] + ' day ' + d + ' row ' + ri +
            '  ' + b1.time + ' [' + a.group + ' #' + a.topic + ']  vs  ' + b2.time + ' [' + b.group + ' #' + b.topic + ']');
        }
      });
    }
  }

  console.log('\n=== sub-slot pairing ===');
  console.log('  band pairs checked : ' + checked);
  console.log('  group/topic differs: ' + topicMismatch.length);
  topicMismatch.slice(0, 10).forEach(x => console.log('    ' + x));
  console.log('  lesson missing from one sub-slot: ' + rowMismatch.length);
  rowMismatch.slice(0, 10).forEach(x => console.log('    ' + x));

  const ok = checked > 0 && !topicMismatch.length && !rowMismatch.length;
  console.log('\n' + (ok
    ? 'EVERY lesson appears in both sub-slots with the same № темы'
    : 'PROBLEM FOUND'));
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });