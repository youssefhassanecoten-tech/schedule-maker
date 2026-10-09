/* Checks the auditorium request document against the model:
 *  - one table row per EXTRA ROOM (sum of needed), not one per (date, block)
 *  - the date printed once per date group
 *  - № павильона and № аудитории always blank
 *  - time label matches the block that overflowed
 *   node tools/check-zayavka.js
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
const U = SM.util;
const P = require('./paths');

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx', process.argv[2])));
  const model = SM.model.createModel(grid, {});
  const doc = SM.templateZayavka.build(model.requests, { lang: 'ru' });
  const xml = await (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
    .file('word/document.xml').async('string');

  const rows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
  const parsed = rows.map(r => (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
    (tc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(s => s.replace(/<[^>]+>/g, '')).join('').trim()));

  const headers = SM.config.zayavka.headers;
  const body = parsed.filter(c => c[0] !== headers[0] && c.length === 4);
  const expected = model.requests.reduce((a, r) => a + (r.needed != null ? r.needed : 1), 0);

  console.log('=== ZAYAVKA CHECK ===');
  console.log('request entries (date+block) :', model.requests.length);
  console.log('extra rooms needed            :', expected);
  console.log('table rows after the header   :', body.length);

  const fail = [];
  if (body.length !== expected) fail.push('row count ' + body.length + ' != needed ' + expected);

  let blankRooms = 0, dated = 0, prev = null, repeats = 0;
  const perDate = {};
  body.forEach(c => {
    if (!c[1] && !c[2]) blankRooms++;
    else fail.push('row has pavilion/room text: ' + c.join(' | '));
    if (c[0]) { dated++; prev = c[0]; } else if (!prev) fail.push('a continuation row comes before any date');
    if (!c[0] && prev) repeats++;
    const key = (c[0] || prev) + '|' + c[3];
    perDate[key] = (perDate[key] || 0) + 1;
  });
  console.log('rows with a printed date      :', dated, '(one per date)');
  console.log('continuation rows             :', repeats);
  console.log('rows with blank павильона/аудитория:', blankRooms + '/' + body.length);

  // every row's time must equal the label of a block that really overflowed
  const labels = Object.create(null);
  model.requests.forEach(r => { labels[r.date + '|' + r.blockLabel] = (labels[r.date + '|' + r.blockLabel] || 0) + r.needed; });
  Object.keys(perDate).sort().forEach(k => {
    const [shownDate, time] = k.split('|');
    const iso = model.requests
      .filter(r => U.fmtRu(r.date) === shownDate && r.blockLabel === time)
      .reduce((a, r) => a + r.needed, 0);
    const n = iso;
    console.log('  ' + shownDate + '  ' + time + '  rows=' + perDate[k] + (n ? ' (needed=' + n + ')' : '  !! no such overflow'));
    if (!n) fail.push('row ' + k + ' does not match any overflowing block');
    else if (n !== perDate[k]) fail.push('row ' + k + ': ' + perDate[k] + ' rows but ' + n + ' needed');
  });

  console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
  if (fail.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });