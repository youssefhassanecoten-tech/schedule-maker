/* Keeps the "What's new" data honest:
 *   - the entry counts must equal the three numbers of SM.config.VERSION
 *   - every entry is bilingual and dated
 *   - both pages exist, load the scripts and are in the right language
 *
 *   node tools/check-changelog.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
require(path.join(ROOT, 'src', 'config.js'));
require(path.join(ROOT, 'src', 'changelog.js'));
const SM = globalThis.SM;

const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

const parts = SM.config.VERSION.split('.').map(Number);
const entries = SM.changelog.entries || [];
const counts = { major: 0, medium: 0, minor: 0 };

entries.forEach((e, i) => {
  check(['major', 'medium', 'minor'].indexOf(e.level) >= 0,
    'entry ' + i + ' has an unknown level: ' + e.level);
  check(/^\d{4}-\d{2}-\d{2}$/.test(e.date || ''),
    'entry ' + i + ' has no ISO date');
  check(!!(e.ru && e.en), 'entry ' + i + ' is not bilingual');
  if (counts[e.level] != null) counts[e.level]++;
});

check(parts[0] === counts.major,
  'version major ' + parts[0] + ' != ' + counts.major + ' major entries');
check(parts[1] === counts.medium,
  'version medium ' + parts[1] + ' != ' + counts.medium + ' medium entries');
check(parts[2] === counts.minor,
  'version minor ' + parts[2] + ' != ' + counts.minor + ' minor entries');

['changelog.html', 'changelog.en.html'].forEach(f => {
  const p = path.join(ROOT, f);
  check(fs.existsSync(p), f + ' is missing');
  if (!fs.existsSync(p)) return;
  const s = fs.readFileSync(p, 'utf8');
  check(s.indexOf('src/changelog.js') >= 0 && s.indexOf('src/changelog-page.js') >= 0,
    f + ' does not load the changelog scripts');
});

const ru = fs.readFileSync(path.join(ROOT, 'changelog.html'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'changelog.en.html'), 'utf8');
check(ru.indexOf('<html lang="ru"') >= 0, 'changelog.html must be Russian');
check(en.indexOf('<html lang="en"') >= 0, 'changelog.en.html must be English');
check(ru.indexOf('Что нового') >= 0, 'changelog.html has no Russian headline');
check(en.indexOf("What's new") >= 0, 'changelog.en.html has no English headline');

console.log('=== CHANGELOG ===');
console.log('version      :', SM.config.VERSION);
console.log('entries      :', counts.major, 'major,', counts.medium, 'medium,', counts.minor, 'minor');
console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
if (fail.length) process.exit(1);
