/* Asserts that every lesson in the model reaches the weekly document.
 * The template used to keep only the first lesson of a cell, so a teacher with
 * two groups in the same block lost one of them. This counts what the template
 * actually printed per (teacher, slot) and compares it with the model.
 *   node tools/check-weekly.js
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

function cellLessons(text) {
  // a lesson block is "group (spec)\nweek-room\ndate"
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\d{3,4}[А-Яа-яA-Za-z]?\b/.test(lines[i]) && /^\d+н?-/.test(lines[i + 1] || '')) out.push(lines[i]);
  }
  return out;
}

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx', process.argv[2])));
  const model = SM.model.createModel(grid, {});
  const sem = model.semester;
  const fail = [];
  let totalExpected = 0, totalPrinted = 0;

  for (let w = 1; w <= sem.weeks; w++) {
    const occ = model.byWeek[w] || [];
    if (!occ.length) continue;
    const doc = SM.templateWeekly.build(model, w, { lang: 'ru' });
    const xml = await (await JSZip.loadAsync(await doc.toBlob(global.JSZip, 'nodebuffer')))
      .file('word/document.xml').async('string');
    const rows = xml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];
    // skip the two header rows, keep the teacher rows
    const printed = Object.create(null);
    rows.slice(2).forEach(r => {
      const cells = (r.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
        (tc.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || []).map(p =>
          (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
            .map(s => s.replace(/<[^>]+>/g, '')).join('')).join('\n'));
      const teacher = (cells.shift() || '').trim();
      cells.forEach((c, idx) => {
        const ls = cellLessons(c);
        if (!ls.length) return;
        const k = teacher + '#' + idx;
        printed[k] = (printed[k] || 0) + ls.length;
      });
    });

    occ.forEach(o => { totalExpected++; });
    let weekFail = 0;
    Object.keys(printed).forEach(k => { totalPrinted += printed[k]; });
    // every model lesson must be accounted for
    const seen = Object.create(null);
    occ.forEach(o => { seen[o.teacher + '#' + o.slot] = (seen[o.teacher + '#' + o.slot] || 0) + 1; });
    Object.keys(seen).forEach(k => {
      const got = printed[k] || 0;
      if (got !== seen[k]) {
        weekFail++;
        const parts = k.split('#');
        const s = SM.config.SLOTS[+parts[1]];
        fail.push('week ' + w + ' | ' + parts[0] + ' | ' + SM.config.DAYS_RU[s.day] + ' ' +
          SM.config.BLOCK_BY_KEY[s.block].labelRu + ': model has ' + seen[k] +
          ' lesson(s), document printed ' + got);
      }
    });
    if (weekFail) console.log('week ' + w + ' : ' + weekFail + ' cell(s) with lost lessons');
  }

  console.log('=== WEEKLY CHECK ===');
  console.log('lessons in model   :', totalExpected);
  console.log('lessons in documents:', totalPrinted);
  console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
  if (fail.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });