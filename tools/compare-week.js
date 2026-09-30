/* Compares the generated week-5 schedule with the department's own
 * Raspisanie_S_28_09_2026_Na_-5n.docx so we can see how far we match.
 * The department file was produced from an EARLIER version of the grid, so
 * differences are expected - this is a sanity check, not a strict test.
 */
'use strict';
const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = require('@xmldom/xmldom').DOMParser;
global.JSZip = require('jszip');
['config','util','spec','cellparse','docx-read','resolve','counters','rooms','docx-write','i18n','model','package','templates/weekly','templates/monthly','templates/zayavka']
  .forEach(f => require(path.join(ROOT,'src',f+'.js')));
const SM = globalThis.SM;

const P = require('./paths');
const SRC = P.resolve('Raspisanie_versia_6.docx', process.argv[2]);
const REF = P.resolve('Raspisanie_S_28_09_2026_Na_-5n.docx', process.argv[3]);

function cellsOf(refGrid, week) {
  const set = new Set();
  refGrid.teachers.forEach(t => {
    t.cells.forEach((c, idx) => {
      const parts = String(c || '').split(/\r?\n/).map(x => SM.util.flat(x)).filter(Boolean);
      if (!parts.length) return;
      const date = parts[parts.length - 1];
      if (!/^\d\d\.\d\d\.?$/.test(date)) return;
      const g = parts[0].split(/[\s(]/)[0];
      set.add(g + '|' + date.replace(/\.$/, ''));
    });
  });
  return set;
}

(async () => {
  const refGrid = await SM.docxRead.readDocx(fs.readFileSync(REF));
  const srcGrid = await SM.docxRead.readDocx(fs.readFileSync(SRC));
  const model = SM.model.createModel(srcGrid, {});
  const W = 5;

  const refSet = cellsOf(refGrid, W);
  const mine = (model.byWeek[W] || []).map(o => o.group + '|' + o.date.slice(8, 10) + '.' + o.date.slice(5, 7));

  const mineSet = new Set(mine);
  const onlyRef = [...refSet].filter(k => !mineSet.has(k));
  const onlyMine = mine.filter(k => !refSet.has(k));

  console.log('=== WEEK 5 COMPARISON vs the department file ===');
  console.log('department file entries :', refSet.size);
  console.log('generated entries       :', mineSet.size);
  console.log('common                  :', [...refSet].filter(k => mineSet.has(k)).length);
  console.log('\nonly in department file (' + onlyRef.length + '):');
  console.log('  ' + onlyRef.sort().join('  '));
  console.log('\nonly in generated (' + onlyMine.length + '):');
  console.log('  ' + onlyMine.sort().join('  '));

  // Room comparison where the (group,date) pair matches
  console.log('\n=== ROOM COMPARISON (matching entries) ===');
  const refRoom = {};
  refGrid.teachers.forEach(t => {
    t.cells.forEach(c => {
      const parts = String(c || '').split(/\r?\n/).map(x => SM.util.flat(x)).filter(Boolean);
      if (parts.length < 2) return;
      const roomLine = parts[parts.length - 2];
      const m = roomLine.match(/^\d+н-(.+)$/);
      if (!m) return;
      const date = parts[parts.length - 1].replace(/\.$/, '');
      const g = parts[0].split(/[\s(]/)[0];
      refRoom[g + '|' + date] = { room: m[1], teacher: t.name };
    });
  });
  let same = 0, diff = 0, missing = 0;
  const diffs = [];
  (model.byWeek[W] || []).forEach(o => {
    const k = o.group + '|' + o.date.slice(8, 10) + '.' + o.date.slice(5, 7);
    const r = refRoom[k];
    if (!r) { missing++; return; }
    if (r.room === o.room) same++;
    else { diff++; diffs.push('  ' + k + '  dept=' + r.room + ' (' + r.teacher + ')  ours=' + o.room + ' (' + o.teacher + ')'); }
  });
  console.log('same room: ' + same + '   different: ' + diff + '   not in dept file: ' + missing);
  if (diffs.length) { console.log('--- differences ---'); diffs.forEach(d => console.log(d)); }
})().catch(e => { console.error(e); process.exit(1); });
