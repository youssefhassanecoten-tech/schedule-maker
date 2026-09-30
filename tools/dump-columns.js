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
  const P = require('./paths');
  const ref = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_S_28_09_2026_Na_-5n.docx', process.argv[2])));
  const gen = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_S_28_09_2026_Na_-5n.docx', process.argv[3])));

  function dump(g, label) {
    console.log('\n===== ' + label + ' =====');
    // day header is not exposed; infer from the day-name row by re-reading raw
    console.log('teacher rows:', g.teachers.length);
    ['Шехватова А.Н.', 'Гирфанова Э.М.', 'Туркова О.В.', 'Терентьева О.К.'].forEach(name => {
      const t = g.teachers.find(x => x.name === name);
      if (!t) return;
      const used = [];
      t.cells.forEach((c, i) => {
        const parts = String(c || '').split(/\r?\n/).map(x => SM.util.flat(x)).filter(Boolean);
        if (!parts.length) return;
        used.push(i + ':' + parts[0].split(/[\s(]/)[0] + '@' + parts[parts.length - 1]);
      });
      console.log('  ' + name.padEnd(20) + used.join('  '));
    });
  }
  dump(ref, 'DEPARTMENT FILE');
  dump(gen, 'GENERATED FILE');

  console.log('\nSLOT LAYOUT (14):');
  SM.config.SLOTS.forEach(s => console.log('  ' + String(s.idx).padStart(2) + '  day' + s.day + ' ' + s.block));
})().catch(e => { console.error(e); process.exit(1); });
