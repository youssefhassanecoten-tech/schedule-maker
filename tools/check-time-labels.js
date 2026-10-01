/* Checks that the monthly document's "Время" column labels every sub-slot,
 * the way the department's own 2_Oktyabr_2026_G__1.doc does.
 *   node tools/check-time-labels.js "path\to\Raspisanie_versia_6.docx"
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

/* Expected labels: one per SUB-SLOT, in order, for every block that has lessons. */
function expectedLabels(model, year, month) {
  const out = [];
  SM.templateMonthly.weeksOfMonth(model, year, month).forEach(w => {
    ['M', 'A', 'E'].forEach(b => {
      let maxRows = 0;
      for (let d = 0; d < 6; d++) {
        maxRows = Math.max(maxRows, (model.byWeek[w] || []).filter(o => o.block === b && o.day === d).length);
      }
      if (!maxRows) return;
      const subs = SM.config.SUBSLOTS[b];
      for (const ss of subs) out.push(ss.from + (ss.to ? ' – ' + ss.to : ''));
    });
  });
  return out;
}

/* Pull the time column out of the generated .docx by reading the 2nd column of
 * every lesson row (skipping the three header rows per week). */
function actualLabels(doc) {
  const labels = [];
  // Walk the document text stream the same way we walk the department's .doc:
  // rows are 28 cells (2 label + 6*4 + rowmark) once the header rows are passed.
  const rows = doc._rows || [];
  rows.forEach(r => {
    const cells = r.cells || [];
    if (cells.length < 3) return;
    const week = (cells[0] || '').replace(/\s+/g, ' ').trim();
    const time = (cells[1] || '').replace(/\s+/g, ' ').trim();
    // header rows repeat the column titles; the date row is all dates
    if (/^Номер недели|^Week$|^Время$|^Time$/.test(week)) return;
    if (/^\d\d\.\d\d\.?$/.test(time)) return;
    if (time) labels.push(time);
  });
  return labels;
}

(async () => {
  const P = require('./paths');
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx', process.argv[2])));
  const model = SM.model.createModel(grid, {});
  const want = expectedLabels(model, 2026, 10);

  console.log('=== expected labels, October 2026 ===');
  want.forEach((l, i) => console.log('  ' + String(i + 1).padStart(2) + '  ' + l));

  // Generate, then read the produced document back with the generic reader so we
  // are inspecting the real output rather than the builder's intentions.
  const doc = SM.templateMonthly.build(model, 2026, 10, { lang: 'ru' });
  const blob = await doc.toBlob(global.JSZip, 'nodebuffer');
  const xml = await (await JSZip.loadAsync(blob)).file('word/document.xml').async('string');

  // every <w:t> inside the second <w:tc> of each row
  const rowsXml = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
  const got = [];
  rowsXml.forEach(r => {
    const tcs = r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    if (tcs.length < 3) return;
    const text = i => (tcs[i].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(s => s.replace(/<[^>]+>/g, '')).join('').trim();
    const week = text(0), time = text(1);
    if (/^Номер недели|^Week$|^Время$|^Time$/.test(week)) return;
    if (/^\d\d\.\d\d\.?$/.test(time)) return;
    if (time) got.push(time);
  });

  console.log('\n=== generated labels (' + got.length + ') ===');
  got.forEach((l, i) => console.log('  ' + String(i + 1).padStart(2) + '  ' + l));

  console.log('\n=== result ===');
  const missing = want.filter(l => !got.includes(l));
  const ok = got.length === want.length && missing.length === 0;
  console.log('  expected ' + want.length + ', generated ' + got.length);
  console.log('  missing: ' + (missing.length ? missing.join(' | ') : 'none'));
  ['10.45. – 12.15.', '14.55. – 16.25'].forEach(l => {
    console.log('  ' + (got.includes(l) ? 'OK  ' : 'MISSING ') + l);
  });
  console.log(ok ? '  ALL SUB-SLOT LABELS PRESENT' : '  INCOMPLETE');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });