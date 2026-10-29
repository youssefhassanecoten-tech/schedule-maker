/* The diagonal hatch bands are a MONTHLY-only decoration.
 *
 *   - the monthly table has the separator columns described by
 *     SM.templateMonthly.GRID (34 grid columns)
 *   - every row carries exactly the hatch cells, shaded with the pattern from
 *     SM.config.MONTHLY_HATCH (w:shd w:val=..., not a border)
 *   - the weekly schedule and the Zayavka contain no hatch at all
 *
 *   node tools/check-monthly-hatch.js
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

function rowsOf(xml) {
  return xml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
}
function cellsOf(rowXml) {
  return rowXml.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || [];
}
function spanOf(tc) {
  const m = tc.match(/<w:gridSpan w:val="(\d+)"\/>/);
  return m ? +m[1] : 1;
}
function shadeOf(tc) {
  const m = tc.match(/<w:shd w:val="([^"]+)" w:color="([^"]+)" w:fill="([^"]+)"\/>/);
  return m ? { val: m[1], color: m[2], fill: m[3] } : null;
}
async function xmlOf(doc) {
  return (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');
}

const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx')));
  const model = SM.model.createModel(grid, {});
  const G = SM.templateMonthly.GRID;
  const HATCH = SM.config.MONTHLY_HATCH;

  // ---- monthly -----------------------------------------------------------
  const monthly = await xmlOf(SM.templateMonthly.build(model, 2026, 9, { lang: 'ru' }));
  const gridCols = (monthly.match(/<w:gridCol w:w="\d+"\/>/g) || []).length;
  check(gridCols === G.columns, 'tblGrid has ' + gridCols + ' columns, want ' + G.columns);

  const rows = rowsOf(monthly);
  check(rows.length > 0, 'no monthly table rows');

  // hatch cells per row: left band + one before each day + right band
  const hatchPerRow = 1 + 6 + 1;
  let rowNo = 0;
  rows.forEach(r => {
    const tcs = cellsOf(r);
    const spanTotal = tcs.reduce((a, tc) => a + spanOf(tc), 0);
    check(spanTotal === G.columns, 'monthly row ' + rowNo + ' spans ' + spanTotal + ' columns, want ' + G.columns);

    const hatch = tcs.map(shadeOf).filter(s => s && s.val === HATCH.val);
    check(hatch.length === hatchPerRow,
      'monthly row ' + rowNo + ' has ' + hatch.length + ' hatch cells, want ' + hatchPerRow);
    hatch.forEach(s => {
      check(s.color === HATCH.color && s.fill === HATCH.fill,
        'monthly row ' + rowNo + ' hatch colour is ' + s.color + '/' + s.fill);
    });

    // and they sit exactly on the separator columns
    const positions = [];
    let acc = 0;
    tcs.forEach(tc => {
      const s = shadeOf(tc);
      if (s && s.val === HATCH.val) positions.push(acc);
      acc += spanOf(tc);
    });
    const want = [0, 3, 8, 13, 18, 23, 28, G.columns - 1];
    check(JSON.stringify(positions) === JSON.stringify(want),
      'monthly row ' + rowNo + ' hatch at ' + positions.join(',') + ', want ' + want.join(','));
    rowNo++;
  });

  // ---- weekly + zayavka must stay plain --------------------------------
  const weekly = await xmlOf(SM.templateWeekly.build(model, 5, { lang: 'ru' }));
  const zay = await xmlOf(SM.templateZayavka.build(model.requests, { lang: 'ru' }));
  const hatchCount = xml => (xml.match(new RegExp('w:val="' + HATCH.val + '"', 'g')) || []).length;
  check(hatchCount(weekly) === 0, 'the weekly document contains hatch shading');
  check(hatchCount(zay) === 0, 'the Zayavka contains hatch shading');

  console.log('=== MONTHLY HATCH ===');
  console.log('grid columns    :', gridCols);
  console.log('rows checked    :', rowNo);
  console.log('hatch per row   :', hatchPerRow, '(' + HATCH.val + ' ' + HATCH.color + '/' + HATCH.fill + ')');
  console.log('weekly hatch    :', hatchCount(weekly));
  console.log('zayavka hatch   :', hatchCount(zay));
  console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
  if (fail.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
