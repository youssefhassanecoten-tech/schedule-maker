/* Validates the guided-tour data:
 *   - the full first-run tour has enough steps
 *   - every step names a selector, a Russian and an English title/text
 *   - every update tour is keyed by a real version and has a matching changelog
 *     entry; referenced tabs exist
 *
 *   node tools/check-tours.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = globalThis;
require(path.join(ROOT, 'src', 'config.js'));
require(path.join(ROOT, 'src', 'changelog.js'));
require(path.join(ROOT, 'src', 'tours.js'));
const SM = globalThis.SM;

const TABS = ['calendar', 'rooms', 'counters', 'requests', 'warnings', 'files', 'memory', 'settings'];
const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

function step(s, where) {
  check(!!s.selector, where + ' has no selector');
  check(!!(s.title && s.title.ru), where + ' has no Russian title');
  check(!!(s.title && s.title.en), where + ' has no English title');
  check(!!(s.text && s.text.ru), where + ' has no Russian text');
  check(!!(s.text && s.text.en), where + ' has no English text');
  if (s.tab) check(TABS.indexOf(s.tab) >= 0, where + ' uses unknown tab "' + s.tab + '"');
}

const full = (SM.tours && SM.tours.full) || [];
check(full.length >= 8, 'the full tour has only ' + full.length + ' steps (want at least 8)');
full.forEach((s, i) => step(s, 'full[' + i + ']'));

const versions = (SM.changelog.entries || []).map(e => e.version);
const updates = (SM.tours && SM.tours.updates) || {};
const keys = Object.keys(updates);
keys.forEach(v => {
  check(/^\d+\.\d+\.\d+$/.test(v), 'update key "' + v + '" is not a version');
  check(versions.indexOf(v) >= 0, 'update tour "' + v + '" has no changelog entry');
  check((updates[v] || []).length > 0, 'update tour "' + v + '" has no steps');
  (updates[v] || []).forEach((s, i) => step(s, 'updates[' + v + '][' + i + ']'));
});

console.log('=== TOURS ===');
console.log('full steps   :', full.length);
console.log('update tours :', keys.length ? keys.join(', ') : '(none)');
console.log('\n' + (fail.length ? 'FAILURES:\n  ' + fail.join('\n  ') : 'ALL CHECKS PASSED'));
if (fail.length) process.exit(1);
