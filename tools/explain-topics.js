'use strict';
/* Explains a topic-number difference against the department's older file by
 * counting how many lessons a group already had before the week in question.
 *   node tools/explain-topics.js 128А 2026-09-28
 */
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
  const day = process.argv[2] || '2026-09-28';
  const groups = process.argv[3] ? [process.argv[3]] : ['128А', '128Б', '129'];
  groups.forEach(g => {
    const all = m.occurrences.filter(o => o.group === g);
    const before = all.filter(o => o.date < day).length;
    const on = all.filter(o => o.date === day);
    console.log(g + ': ' + all.length + ' lessons in the term; ' + before +
      ' before ' + day + ' -> that day is # ' + (before + 1) +
      (on.length ? '  (topic ' + on[0].topic + ', room ' + on[0].room + ')' : '  (no lesson that day)'));
    const firsts = all.slice(0, Math.min(3, all.length));
    firsts.forEach(o => console.log('      first: ' + o.date + ' ' + o.block + ' ' + o.teacher + ' #' + o.topic));
  });
})().catch(e => { console.error(e); process.exit(1); });