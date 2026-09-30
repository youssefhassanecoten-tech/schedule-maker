/* Content comparison: the generated week-5 document vs the department's own
 * Raspisanie_S_28_09_2026_Na_-5n.docx, cell by cell (teacher x time block).
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
const SRC = P.resolve('Raspisanie_versia_6.docx', process.argv[2]);
const REF = P.resolve('Raspisanie_S_28_09_2026_Na_-5n.docx', process.argv[3]);
const WEEK = 5;

/* read "269 (2-9)\n5н-104\n28.09" style cells */
function refCells(grid) {
  const out = [];
  grid.teachers.forEach(t => t.cells.forEach((c, slot) => {
    const parts = String(c || '').split(/\r?\n/).map(x => SM.util.flat(x)).filter(Boolean);
    if (!parts.length) return;
    const date = parts[parts.length - 1];
    if (!/^\d\d\.\d\d\.?$/.test(date)) return;
    out.push({ teacher: t.name, slot, group: parts[0].split(/[\s(]/)[0], date: date.replace(/\.$/, '') });
  }));
  return out;
}

/* The department's weekly file only has 13 time columns: it omits the Friday
 * 16.45-20.00 block that exists in the grid, so everything from Saturday on sits
 * one column earlier. The generated file has all 14 and needs no remapping. */
const REF_SLOT_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13];

function dayBlockOf(slotIdx, mapped) {
  const idx = mapped ? REF_SLOT_MAP[slotIdx] : slotIdx;
  const s = idx !== undefined ? SM.config.SLOTS[idx] : null;
  return s ? s.day + '/' + s.block : '?';
}

(async () => {
  const refGrid = await SM.docxRead.readDocx(fs.readFileSync(REF));
  const srcGrid = await SM.docxRead.readDocx(fs.readFileSync(SRC));
  const model = SM.model.createModel(srcGrid, {});

  // Generate the weekly document and read it back, so we compare the ACTUAL output
  const doc = SM.templateWeekly.build(model, WEEK, { lang: 'ru' });
  const mine = await SM.docxRead.readDocx(await doc.toBlob(global.JSZip, 'nodebuffer'));
  const mineCells = refCells(mine);

  const ref = refCells(refGrid);
  ref.forEach(c => { c.__ref = true; });
  const mineMarked = mineCells.map(c => { c.__ref = false; return c; });
  console.log('=== CELL COMPARISON, week ' + WEEK + ' ===');
  console.log('department file cells :', ref.length);
  console.log('generated cells       :', mineMarked.length);
  console.log('their time columns    : 13 of 14 (their file omits the Friday 16.45-20.00 column)');

  const key = c => c.teacher + '|' + dayBlockOf(c.slot, c.__ref) + '|' + c.group + '|' + c.date;
  const refSet = new Set(ref.map(key));
  const mineSet = new Set(mineMarked.map(key));
  const common = [...refSet].filter(k => mineSet.has(k));

  console.log('identical cells      :', common.length);
  console.log('only department file :', [...refSet].filter(k => !mineSet.has(k)).length,
              [...refSet].filter(k => !mineSet.has(k)));
  console.log('only generated       :', [...mineSet].filter(k => !refSet.has(k)).length,
              [...mineSet].filter(k => !refSet.has(k)));

  console.log('\n--- teacher x day x block occupancy ---');
  const occ = r => {
    const s = new Set();
    r.forEach(c => s.add(c.teacher + '|' + dayBlockOf(c.slot, c.__ref)));
    return s;
  };
  const a = occ(ref), b = occ(mineMarked);
  let same = 0; const diff = [];
  [...new Set([...a, ...b])].sort().forEach(k => {
    if (a.has(k) && b.has(k)) same++;
    else diff.push('  ' + k + (a.has(k) ? '  (dept only)' : '  (generated only)'));
  });
  console.log('slots matching        :', same);
  console.log('slots differing       :', diff.length);
  diff.forEach(d => console.log(d));
})().catch(e => { console.error(e); process.exit(1); });
