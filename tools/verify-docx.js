/* Structural validation of every generated .docx.
 * Checks, for each document:
 *   - document.xml parses strictly (no XML errors)
 *   - every w:tr has the same total grid width once gridSpan is taken into account
 *   - the number of w:gridCol entries equals the widest row
 *   - required package parts exist
 * This is exactly what Word complains about when a file is malformed.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { DOMParser } = require('@xmldom/xmldom');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
global.DOMParser = DOMParser;
global.JSZip = require('jszip');
['config','util','spec','cellparse','docx-read','resolve','counters','rooms','docx-write','i18n','model','package','templates/weekly','templates/monthly','templates/zayavka']
  .forEach(f => require(path.join(ROOT,'src',f+'.js')));
const SM = globalThis.SM;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function tag(n) { const x = n.nodeName; return x.indexOf(':') > 0 ? x.slice(x.indexOf(':') + 1) : x; }
function kids(n, name) {
  const out = [];
  for (let c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && tag(c) === name) out.push(c);
  return out;
}
function all(n, name) {
  const out = [], stack = [n];
  while (stack.length) {
    const cur = stack.pop();
    for (let c = cur.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (tag(c) === name) out.push(c); else stack.push(c);
    }
  }
  return out;
}
function attr(el, name) {
  const v = el.getAttributeNS(W, name);
  return v === null || v === undefined || v === '' ? (el.getAttribute('w:' + name) || 0) : v;
}

let problems = 0;
function check(label, cond, detail) {
  if (!cond) { problems++; console.log('  FAIL  ' + label + (detail ? ' — ' + detail : '')); }
  return cond;
}

async function verifyBlob(label, blob) {
  const zip = await JSZip.loadAsync(blob);
  console.log('\n--- ' + label + ' ---');
  ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml']
    .forEach(p => check('part ' + p, !!zip.file(p)));

  const xml = await zip.file('word/document.xml').async('string');

  // strict well-formedness
  let err = null;
  const parser = new DOMParser({
    errorHandler: { warning: () => {}, error: e => { err = e; }, fatalError: e => { err = e; } }
  });
  const doc = parser.parseFromString(xml, 'text/xml');
  check('document.xml is well formed', !err, String(err && (err.split ? err.split('\n')[0] : err)));

  const tables = all(doc, 'tbl');
  check('has at least one table', tables.length > 0, 'found ' + tables.length);
  console.log('  tables: ' + tables.length + ', size ' + xml.length + ' bytes');

  tables.forEach((tbl, ti) => {
    const gridCols = kids(tbl, 'tblGrid').reduce((a, g) => a + kids(g, 'gridCol').length, 0);
    const rows = kids(tbl, 'tr');
    const widths = rows.map(tr =>
      kids(tr, 'tc').reduce((a, tc) => {
        const pr = kids(tc, 'tcPr')[0];
        const gs = pr ? kids(pr, 'gridSpan')[0] : null;
        return a + (gs ? parseInt(attr(gs, 'val'), 10) || 1 : 1);
      }, 0));
    const distinct = [...new Set(widths)];
    check('table ' + ti + ': all ' + rows.length + ' rows have the same grid width',
      distinct.length === 1, 'widths seen: ' + distinct.join(','));
    check('table ' + ti + ': tblGrid (' + gridCols + ') matches row width (' + distinct[0] + ')',
      gridCols === distinct[0], 'grid=' + gridCols + ' rows=' + distinct.join(','));
    // no cell may be completely empty of paragraphs (Word requires >= 1 w:p per w:tc)
    let emptyCells = 0;
    rows.forEach(tr => kids(tr, 'tc').forEach(tc => { if (!kids(tc, 'p').length) emptyCells++; }));
    check('table ' + ti + ': every w:tc contains at least one w:p', emptyCells === 0, emptyCells + ' empty');
    console.log('  table ' + ti + ': ' + rows.length + ' rows x ' + distinct[0] + ' cols');
  });

  // body must end with sectPr
  const body = all(doc, 'body')[0];
  check('body ends with w:sectPr', kids(body, 'sectPr').length === 1);
  return doc;
}

(async () => {
  const grid = await SM.docxRead.readDocx(fs.readFileSync(require('./paths').resolve('Raspisanie_versia_6.docx', process.argv[2])));
  const model = SM.model.createModel(grid, {});

  const weekly = SM.templateWeekly.build(model, 5, { lang: 'ru' });
  await verifyBlob('weekly week 5', await weekly.toBlob(global.JSZip, 'nodebuffer'));

  const monthly = SM.templateMonthly.build(model, 2026, 10, { lang: 'ru' });
  await verifyBlob('monthly October 2026 (A3)', await monthly.toBlob(global.JSZip, 'nodebuffer'));

  const monthlyA4 = SM.templateMonthly.build(model, 2026, 10, { lang: 'ru', pageSize: 'A4' });
  await verifyBlob('monthly October 2026 (A4)', await monthlyA4.toBlob(global.JSZip, 'nodebuffer'));

  const zay = SM.templateZayavka.build(model.requests.slice(0, 4), { lang: 'ru' });
  await verifyBlob('zayavka', await zay.toBlob(global.JSZip, 'nodebuffer'));

  // and every single document of the whole package
  console.log('\n=== whole package ===');
  const mf = SM.package.manifest(model, { lang: 'ru' });
  let n = 0, bad = 0;
  const jobs = [];
  (function walk(node) {
    node.files.forEach(f => {
      jobs.push(Promise.resolve(f.doc()).then(d => d.toBlob(global.JSZip, 'nodebuffer')).then(async b => {
        n++;
        try {
          const zip = await JSZip.loadAsync(b);
          const xml = await zip.file('word/document.xml').async('string');
          let e = null;
          new DOMParser({ errorHandler: { warning: () => {}, error: x => { e = x; }, fatalError: x => { e = x; } } })
            .parseFromString(xml, 'text/xml');
          if (e) { bad++; console.log('  BAD ' + node.path + '/' + f.name + ': ' + e); }
        } catch (err) { bad++; console.log('  BAD ' + f.name + ': ' + err.message); }
      }));
    });
    Object.keys(node.children).forEach(k => walk(node.children[k]));
  })(mf.root);
  await Promise.all(jobs);
  console.log('  checked ' + n + ' documents, malformed: ' + bad);
  problems += bad;

  console.log('\n' + (problems ? 'PROBLEMS: ' + problems : 'ALL STRUCTURAL CHECKS PASSED'));
  process.exit(problems ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
