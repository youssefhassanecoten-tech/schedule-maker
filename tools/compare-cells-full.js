/* Full cell-text comparison of the generated weekly document against the
 * department's own file, cell by cell (every line, not just the first group).
 *
 *   node tools/compare-cells-full.js [srcDocx] [refDocx] [week]
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
const WEEK = +(process.argv[4] || 5);

/* their column -> our slot index: their file drops the Friday 16.45-20.00 block */
const REF_SLOT_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13];
const RE_DATE = /^\d\d\.\d\d\.?$/;
const RE_GROUP = /^\d{3,4}[А-Яа-яA-Za-z]?$/;

function lines(cell) {
  return String(cell || '').split(/\r?\n/).map(x => SM.util.flat(x)).filter(Boolean);
}
/* Canonical form of a cell: what the lesson IS (group + spec), not how the
 * lines happen to be wrapped. Room and date are compared separately. */
function splitCell(cell) {
  const ls = lines(cell);
  let room = null, date = null;
  const rest = [];
  ls.forEach(l => {
    if (RE_DATE.test(l)) { date = l.replace(/\.$/, ''); return; }
    if (/^\d+н-/.test(l)) { room = l.replace(/^\d+н-/, ''); return; }
    rest.push(l);
  });
  const text = rest.join(' ');
  const parsed = SM.cellparse.parseCell(text, '');
  const pairs = parsed.entries.map(e =>
    e.group + '(' + String(e.specText || '').replace(/\s+/g, '') + ')' +
    (e.notes.length ? '{' + e.notes.join('').replace(/\s+/g, '') + '}' : '')
  ).sort();
  return { pairs, groups: parsed.entries.map(e => e.group).sort(), room, date, raw: ls, unparsed: text };
}
function cellMap(grid, mapped) {
  const m = new Map();
  grid.teachers.forEach(t => (t.cells || []).forEach((c, idx) => {
    if (!lines(c).length) return;
    const slot = mapped ? REF_SLOT_MAP[idx] : idx;
    if (slot === undefined) return;
    m.set(t.name + '#' + slot, { text: c, raw: lines(c), slot, idx, teacher: t.name });
  }));
  return m;
}

(async () => {
  const refGrid = await SM.docxRead.readDocx(fs.readFileSync(REF));
  const srcGrid = await SM.docxRead.readDocx(fs.readFileSync(SRC));
  const model = SM.model.createModel(srcGrid, {});
  const doc = SM.templateWeekly.build(model, WEEK, { lang: 'ru' });
  const mine = await SM.docxRead.readDocx(await doc.toBlob(global.JSZip, 'nodebuffer'));

  const ref = cellMap(refGrid, true);
  const gen = cellMap(mine, false);

  console.log('=== FULL CELL COMPARISON, week ' + WEEK + ' ===');
  console.log('department cells :', ref.size);
  console.log('generated cells  :', gen.size);

  const keys = [...new Set([...ref.keys(), ...gen.keys()])].sort();
  let identical = 0;
  const problems = [];
  keys.forEach(k => {
    const a = ref.get(k), b = gen.get(k);
    if (!a) { problems.push({ k, kind: 'generated only', b }); return; }
    if (!b) { problems.push({ k, kind: 'department only', a }); return; }
    const pa = splitCell(a.text), pb = splitCell(b.text);
    const missingPairs = pa.pairs.filter(g => !pb.pairs.includes(g));
    const extraPairs = pb.pairs.filter(g => !pa.pairs.includes(g));
    const sameRoom = pa.room === pb.room;
    const sameDate = pa.date === pb.date;
    if (!missingPairs.length && !extraPairs.length && sameRoom && sameDate) { identical++; return; }
    problems.push({ k, kind: 'differs', pa, pb, missingPairs, extraPairs });
  });

  console.log('identical cells  :', identical);
  console.log('problem cells    :', problems.length);
  problems.forEach(p => {
    const [teacher, slot] = p.k.split('#');
    const s = SM.config.SLOTS[+slot];
    const where = teacher + ' / ' + SM.config.DAYS_RU[s.day] + ' ' + SM.config.BLOCK_BY_KEY[s.block].labelRu;
    if (p.kind !== 'differs') {
      const cell = (p.a && p.a.raw) || (p.b && p.b.raw) || [];
      console.log('\n[' + p.kind + '] ' + where);
      console.log('   ' + cell.join(' | '));
      return;
    }
    console.log('\n[differs] ' + where);
    if (p.missingPairs.length) console.log('   MISSING lessons : ' + p.missingPairs.join('  '));
    if (p.extraPairs.length)  console.log('   EXTRA lessons   : ' + p.extraPairs.join('  '));
    if (p.pa.room !== p.pb.room) console.log('   room  dept=' + p.pa.room + '  ours=' + p.pb.room);
    if (p.pa.date !== p.pb.date) console.log('   date  dept=' + p.pa.date + '  ours=' + p.pb.date);
    console.log('   dept : ' + p.pa.raw.join(' | '));
    console.log('   ours : ' + p.pb.raw.join(' | '));
  });
})().catch(e => { console.error(e); process.exit(1); });
