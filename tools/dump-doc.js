/* Writes a single generated document to disk for manual inspection in Word.
 *   node tools/dump-doc.js monthly 2026 10
 *   node tools/dump-doc.js weekly 5
 *   node tools/dump-doc.js zayavka
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

const kind = process.argv[2] || 'monthly';
const a = process.argv[3], b = process.argv[4];

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(require('./paths').resolve('Raspisanie_versia_6.docx', process.argv[5])));
  const model = SM.model.createModel(grid, {});
  const opts = { lang: 'ru' };
  let doc, name;
  if (kind === 'monthly') {
    doc = SM.templateMonthly.build(model, +a, +b, opts);
    name = `check-monthly-${a}-${String(+b + 1).padStart(2, '0')}.docx`;
  } else if (kind === 'weekly') {
    const w = +a;
    doc = SM.templateWeekly.build(model, w, opts);
    name = `check-weekly-w${w}.docx`;
  } else {
    doc = SM.templateZayavka.build(model.requests, opts);
    name = 'check-zayavka.docx';
  }
  const out = path.join(ROOT, name);
  fs.writeFileSync(out, Buffer.from(await doc.toBlob(global.JSZip, 'nodebuffer')));
  console.log('wrote', name, fs.statSync(out).size, 'bytes');
})().catch(e => { console.error(e); process.exit(1); });