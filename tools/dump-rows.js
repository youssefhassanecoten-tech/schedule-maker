'use strict';
/* Prints the first rows of the generated monthly table: cell count and the
 * two label columns, so the row shapes can be eyeballed. */
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = require('@xmldom/xmldom').DOMParser;
global.JSZip = require('jszip');
['config','util','spec','cellparse','docx-read','resolve','counters','rooms','docx-write','i18n','model','package','templates/weekly','templates/monthly','templates/zayavka']
  .forEach(f => require(path.join(ROOT, 'src', f + '.js')));
const SM = globalThis.SM;
const P = require('./paths');

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx')));
  const m = SM.model.createModel(grid, {});
  const doc = SM.templateMonthly.build(m, 2026, 9, { lang: 'ru' });
  const xml = await (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');
  const rows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
  const N = parseInt(process.argv[2] || '14', 10);
  console.log('rows:', rows.length);
  rows.slice(0, N).forEach((r, i) => {
    const cells = (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
      (tc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
        .map(s => s.replace(/<[^>]+>/g, '')).join('').trim());
    console.log(String(i).padStart(3) + ' n=' + String(cells.length).padStart(2) +
      '  c0=[' + cells[0] + ']' +
      '  c1=[' + cells[1] + ']' +
      '  c2=[' + (cells[2] || '') + ']');
  });
})().catch(e => { console.error(e); process.exit(1); });