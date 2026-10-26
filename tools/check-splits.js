/* Verifies the "separate monthly schedules" feature:
 *
 *   - only the monthly documents are split; every week folder keeps ONE weekly
 *     schedule and ONE request, built from the full model
 *   - the main monthly contains every group NOT assigned to a split, and the
 *     split monthly contains only its own groups
 *   - a split lesson keeps the same room and the same № темы as in the main
 *     schedule (splitting is a view, never a renumbering)
 *   - unknown / duplicated group codes are reported, not silently dropped
 *
 *   node tools/check-splits.js [source.docx]
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

const FLOW = 'Тестовый поток';

function walk(node, out) {
  node.files.forEach(f => out.push({ path: node.path + '/' + f.name, f }));
  Object.keys(node.children).forEach(k => walk(node.children[k], out));
  return out;
}

function rowCells(rowXml) {
  return (rowXml.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) || []).map(tc =>
    (tc.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || []).map(p =>
      (p.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
        .map(s => s.replace(/<[^>]+>/g, '')).join('')).join('\n'));
}

function tableRows(xml) {
  return (xml.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || []).map(rowCells);
}

/* Group cells of a monthly document -> [{group, teacher, room, topic, date}] */
function monthlyLessons(xml) {
  /* The first two rows are the header block: day names (8 cells) and the four
   * sub-headers per day (26 cells). Only rows after them carry lessons. */
  const rows = tableRows(xml).slice(2);
  const out = [];
  let dates = null;
  rows.forEach(cells => {
    if (cells.length === 8) { dates = cells.slice(2); return; }
    if (cells.length !== 26 || !dates) return;
    for (let d = 0; d < 6; d++) {
      const g = (cells[2 + d * 4] || '').trim();
      if (!g) continue;
      out.push({
        group: g,
        teacher: (cells[3 + d * 4] || '').trim(),
        room: (cells[4 + d * 4] || '').trim(),
        topic: (cells[5 + d * 4] || '').trim(),
        date: (dates[d] || '').replace(/\./g, '')
      });
    }
  });
  return out;
}

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(P.resolve('Raspisanie_versia_6.docx', process.argv[2])));
  const model = SM.model.createModel(grid, {});
  const fail = [];
  const check = (ok, msg) => { if (!ok) fail.push(msg); };

  const every = SM.model.allGroups(model);
  console.log('=== SPLIT CHECK ===');
  console.log('source groups :', every.length);

  // ---- 1. the plan -------------------------------------------------------
  const chosen = every.filter(g => /^\d{3,4}$/.test(g)).slice(0, 2);
  const plan = SM.model.resolveSplits(model, [{ name: FLOW, groups: chosen.join(', ') }]);
  check(plan.schedules.length === 1, 'expected one schedule');
  check(plan.schedules[0].groups.join(',') === chosen.join(','), 'split picked the wrong groups');
  check(chosen.every(g => plan.mainGroups.indexOf(g) < 0), 'split groups leaked into the main flow');
  check(plan.mainGroups.length === every.length - chosen.length, 'main flow group count is wrong');

  // unknown and duplicate codes are reported
  const bad = SM.model.resolveSplits(model, [
    { name: 'A', groups: chosen[0] + ', 999' },
    { name: 'B', groups: chosen[0] }
  ]);
  check(bad.schedules[0].unknown.indexOf('999') >= 0, 'unknown group not reported');
  check(bad.schedules[1].duplicate.indexOf(chosen[0]) >= 0, 'duplicate group not reported');

  // assigning every group leaves no main flow
  const all = SM.model.resolveSplits(model, [{ name: 'all', groups: every.join(', ') }]);
  check(all.mainGroups.length === 0, 'main flow should be empty when every group is assigned');

  // two schedules produce two differently named files
  const pairs = [
    { name: 'Первый', groups: chosen[0] },
    { name: 'Второй', groups: chosen[1] }
  ];
  const two = SM.package.manifest(model, { lang: 'ru', monthlySplits: pairs });
  const twoFiles = walk(two.root, []).filter(x => x.f.kind === 'monthly').map(x => x.f.name);
  check(twoFiles.some(n => /Первый\.docx$/.test(n)), 'first flow has no file');
  check(twoFiles.some(n => /Второй\.docx$/.test(n)), 'second flow has no file');

  // ---- 2. manifest: weeks and requests are untouched ---------------------
  const base = SM.package.manifest(model, { lang: 'ru' });
  const withSplits = SM.package.manifest(model, {
    lang: 'ru', monthlySplits: [{ name: FLOW, groups: chosen.join(', ') }]
  });
  const baseFiles = walk(base.root, []);
  const splitFiles = walk(withSplits.root, []);
  const countOf = (list, kind) => list.filter(x => x.f.kind === kind).length;

  check(countOf(baseFiles, 'weekly') === countOf(splitFiles, 'weekly'),
    'weekly file count changed after adding a split');
  check(countOf(baseFiles, 'zayavka') === countOf(splitFiles, 'zayavka'),
    'zayavka file count changed after adding a split');
  check(countOf(baseFiles, 'monthly') < countOf(splitFiles, 'monthly'),
    'no extra monthly documents were produced');

  // every week folder still holds exactly the same files
  const weekPaths = list => list.filter(x => /\/[^/]*\d+н?\/?$|Week /.test(x.path) || /\/\d+н\//.test(x.path))
    .map(x => x.path).sort().join('\n');
  const wk = list => list.filter(x => x.f.kind === 'weekly' || x.f.kind === 'zayavka')
    .map(x => x.path + '|' + x.f.kind).sort().join('\n');
  check(wk(baseFiles) === wk(splitFiles), 'week folders changed after adding a split');

  const splitNamePattern = new RegExp('_' + FLOW.replace(/\s+/g, '_') + '\\.docx$');  const splitMonthlies = splitFiles.filter(x => x.f.kind === 'monthly' && splitNamePattern.test(x.f.name));
  check(splitMonthlies.length > 0, 'no file got the flow suffix');
  const mainMonthlies = splitFiles.filter(x => x.f.kind === 'monthly' && !splitNamePattern.test(x.f.name));
  check(mainMonthlies.length > 0, 'the main monthly disappeared');
  console.log('monthly files  :', countOf(splitFiles, 'monthly'),
    '(main ' + mainMonthlies.length + ', split ' + splitMonthlies.length + ')');
  console.log('weekly/request :', countOf(splitFiles, 'weekly'), '/', countOf(splitFiles, 'zayavka'));

  // folders are year -> month, and January 2027 must follow December 2026
  const monthKeys = splitFiles.filter(x => x.f.kind === 'monthly').map(x => {
    const m = x.path.match(/\/(\d{4})\/(\d{2})_/);
    return m ? +m[1] * 100 + +m[2] : null;
  });
  check(monthKeys.every(k => k !== null), 'a monthly file is not inside <year>/<month>/');
  check(monthKeys.every((k, i) => i === 0 || monthKeys[i - 1] <= k),
    'month folders are not in chronological order');
  const years = [...new Set(splitFiles
    .filter(x => x.f.kind === 'monthly')
    .map(x => (x.path.match(/\/(\d{4})\//) || [])[1]))];
  console.log('year folders   :', years.join(', '));

  // ---- 3. document contents ---------------------------------------------
  function readDoc(f) {
    return Promise.resolve(f.doc())
      .then(d => d.toBlob(global.JSZip, 'nodebuffer'))
      .then(buf => JSZip.loadAsync(buf))
      .then(z => z.file('word/document.xml').async('string'));
  }

  const months = SM.model.activeMonths(model);
  const view = SM.model.monthlyView(model, chosen);

  for (const m of months) {
    const touch = SM.templateMonthly.weeksOfMonth(view, m.year, m.month);
    if (!touch.some(w => (view.byWeek[w] || []).length)) continue;

    const splitEntry = splitMonthlies.find(x =>
      x.f.name.indexOf(SM.monthNameEn[m.month]) >= 0);
    const mainEntry = mainMonthlies.find(x =>
      x.f.name.indexOf(SM.monthNameEn[m.month]) >= 0);
    if (!splitEntry) { fail.push('missing split monthly for ' + m.key); continue; }
    if (!mainEntry) { fail.push('missing main monthly for ' + m.key); continue; }

    const splitXml = await readDoc(splitEntry.f);
    const mainXml = await readDoc(mainEntry.f);
    const splitLessons = monthlyLessons(splitXml);
    const mainLessons = monthlyLessons(mainXml);

    const chosenSet = new Set(chosen);
    check(splitLessons.length > 0, 'split monthly for ' + m.key + ' is empty');
    splitLessons.forEach(l => {
      if (!chosenSet.has(l.group)) fail.push('split monthly ' + m.key + ' contains group ' + l.group);
    });
    mainLessons.forEach(l => {
      if (chosenSet.has(l.group)) fail.push('main monthly ' + m.key + ' still contains group ' + l.group);
    });

    // room + topic must equal what the model assigned
    const byKey = Object.create(null);
    model.occurrences.forEach(o => {
      byKey[o.group + '|' + o.date.slice(8, 10) + '.' + o.date.slice(5, 7) + '|' + o.block] = o;
    });
    splitLessons.forEach(l => {
      const hit = model.occurrences.filter(o =>
        o.group === l.group && o.room === l.room && String(o.topic) === l.topic &&
        U.fmtRu(o.date, true).replace(/\./g, '') === l.date);
      if (!hit.length) {
        fail.push('split lesson does not match the model: ' + l.group + ' ' + l.date +
          ' room ' + l.room + ' topic ' + l.topic);
      }
    });
    console.log('  ' + m.key + ' : split ' + splitLessons.length + ', main ' + mainLessons.length);
  }

  console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
  if (fail.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
