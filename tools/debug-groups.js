'use strict';
const path = require('path'); const fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = require('@xmldom/xmldom').DOMParser;
global.JSZip = require('jszip');
['config','util','spec','cellparse','docx-read','resolve','counters','rooms','docx-write','i18n','model','package','templates/weekly','templates/monthly','templates/zayavka']
  .forEach(f => require(path.join(ROOT,'src',f+'.js')));
const SM = globalThis.SM;

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(require('./paths').resolve('Raspisanie_versia_6.docx', process.argv[2])));
  const model = SM.model.createModel(grid, {});
  const targets = ['167Б', '127А', '165Б'];
  targets.forEach(g => {
    console.log('=== ' + g + ' ===');
    model.occurrences.filter(o => o.group === g).forEach(o => {
      const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][SM.util.dayOfWeek(o.date)];
      console.log('  ' + o.date + ' ' + dow + ' ' + o.block + '  w' + o.week +
                  '  №' + o.topic + '  ' + o.teacher + '   spec=(' + o.specText + ')');
    });
  });
  console.log('\n=== SLOT LAYOUT ===');
  SM.config.SLOTS.forEach(s => console.log('  ' + s.idx + '  day' + s.day +
    ' (' + SM.config.DAYS_RU[s.day] + ') ' + s.block));
})().catch(e => { console.error(e); process.exit(1); });
