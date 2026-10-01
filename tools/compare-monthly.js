/* Compares the generated monthly document against the department's own
 * 2_Oktyabr_2026_G__1.doc (dumped to JSON by tools/dump-dept-monthly.py).
 *
 *   python tools/dump-dept-monthly.py "<...>\2_Oktyabr_2026_G__1.doc" dept-monthly.json
 *   node tools/compare-monthly.js
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
const P = require('./paths');

const uniq = a => [...new Set(a)];
const wkNo = s => (String(s).match(/^(\d+)/) || [, String(s).replace(/\D/g, '')])[1];

function readGenerated() {
  return Promise.all([0].map(() => null)).then(() => null);
}

(async () => {
  const refFile = path.join(ROOT, process.argv[2] || 'dept-monthly.json');
  const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));

  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx', process.argv[3])));
  const model = SM.model.createModel(grid, {});

  // Generate October 2026 (month index 9) and read the produced XML back.
  const doc = SM.templateMonthly.build(model, 2026, 9, { lang: 'ru' });
  const blob = await doc.toBlob(global.JSZip, 'nodebuffer');
  const xml = await (await JSZip.loadAsync(blob)).file('word/document.xml').async('string');
  const rowsXml = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];

  const myLabels = [], myLessons = [];
  let curWeek = '', lastTime = '';
  // Row shapes in the generated monthly table:
  //   9 cells  = day-name header, or the per-week date row (3 label + 6 dates)
  //   27 cells = sub-header row, or a lesson row (3 label + 6 days x 4)
  rowsXml.forEach(r => {
    const tcs = r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    const cells = tcs.map(tc => (tc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(s => s.replace(/<[^>]+>/g, '')).join('').trim());
    if (cells.length < 3) return;
    const wk = cells[0], tm = cells[1];
    if (/^Номер недели/.test(wk)) return;
    if (cells.length === 8 && cells.slice(2).length === 6 &&
        cells.slice(2).every(c => /^\d\d\.\d\d\.?$/.test(c))) { curWeek = ''; lastTime = ''; return; }
    if (/неделя/.test(wk)) { curWeek = wk; lastTime = ''; }
    // sub-header row: all six day groups repeat the same four titles
    if (cells.slice(2).some(c => /^№ гр\.$/.test(c))) return;
    // The time label is merged down its whole row group, so only the first row
    // of each group carries it. Carry it forward like a reader would.
    if (tm && /^\d{1,2}[.:]\d\d/.test(tm)) { myLabels.push(tm); lastTime = tm; }
    const effTime = tm || lastTime;
    for (let d = 0; d < 6; d++) {
      const g = cells[2 + d * 4] || '', t = cells[3 + d * 4] || '',
            rm = cells[4 + d * 4] || '', tp = cells[5 + d * 4] || '';
      if (g || t) myLessons.push({ week: curWeek, day: d, time: effTime, group: g, teacher: t, room: rm, topic: tp });
    }
  });

  console.log('=== TIME LABELS in the "Время" column ===');
  console.log('  department file : ' + ref.labels.length + '  -> ' + uniq(ref.labels).join(' | '));
  console.log('  generated       : ' + myLabels.length + '  -> ' + uniq(myLabels).join(' | '));
  const miss = uniq(ref.labels).filter(l => !uniq(myLabels).includes(l));
  const extra = uniq(myLabels).filter(l => !uniq(ref.labels).includes(l));
  console.log('  missing here    : ' + (miss.length ? miss.join(' | ') : 'none'));
  console.log('  only here       : ' + (extra.length ? extra.join(' | ') : 'none'));

  const refLessons = ref.weeks.flatMap(w => w.lessons.map(l => Object.assign({ week: w.week }, l)));
  console.log('\n=== LESSON COUNTS PER WEEK ===');
  const tally = list => {
    const m = {};
    list.forEach(e => { const w = wkNo(e.week); m[w] = (m[w] || 0) + 1; });
    return m;
  };
  const a = tally(refLessons), b = tally(myLessons);
  const wks = uniq([...Object.keys(a), ...Object.keys(b)]).sort((x, y) => (+x) - (+y));
  wks.forEach(w => {
    const x = a[w] || 0, y = b[w] || 0;
    console.log('  week ' + String(w).padStart(2) + ': department ' + String(x).padStart(4) +
                '   generated ' + String(y).padStart(4) + (x === y ? '' : '   <-- differs'));
  });
  console.log('  total   : department ' + refLessons.length + '   generated ' + myLessons.length);

  console.log('\n=== GROUP/TOPIC PER (week, day, time) ===');
  const key = e => [wkNo(e.week), e.day, e.time].join('|');
  const ga = new Map(), gb = new Map();
  refLessons.forEach(e => ga.set(key(e) + '|' + e.group, e.topic));
  myLessons.forEach(e => gb.set(key(e) + '|' + e.group, e.topic));
  let same = 0, diff = [];
  gb.forEach((tp, k) => {
    if (ga.has(k)) { if (ga.get(k) === tp) same++; else diff.push(k + '  dept=#' + ga.get(k) + ' ours=#' + tp); }
  });
  console.log('  same topic : ' + same);
  console.log('  differing  : ' + diff.length);
  diff.slice(0, 15).forEach(d => console.log('    ' + d));

  console.log('\n=== WEEK 5, MONDAY, full side by side ===');
  const r5 = refLessons.filter(e => wkNo(e.week) === '5' && e.day === 0);
  const m5 = myLessons.filter(e => wkNo(e.week) === '5' && e.day === 0);
  const n = Math.max(r5.length, m5.length);
  for (let i = 0; i < n; i++) {
    const f = e => e ? `${e.time} ${e.group}/${e.teacher}/${e.room}/#${e.topic}` : '';
    console.log('  ' + String(i).padStart(2) + '  dept: ' + f(r5[i]).padEnd(44) + ' ours: ' + f(m5[i]));
  }
})().catch(e => { console.error(e); process.exit(1); });