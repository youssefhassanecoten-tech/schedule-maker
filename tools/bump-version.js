/* Bumps the change-count version and keeps every place in sync.
 *
 *   npm run version:bump -- <major|medium|minor> "<short description>"
 *   node tools/bump-version.js medium "Added X" --dry
 *
 * What it updates, in one go:
 *   - SM.config.VERSION in src/config.js  (5.9.7 -> 5.10.7 for "medium")
 *   - "version" in package.json
 *   - the service-worker CACHE in sw.js (vN -> vN+1)
 *   - CHANGELOG.md: the summary line, the section counts and a new entry
 *
 * The version is NOT semantic precedence; it is a count:
 *   MAJOR.MEDIUM.MINOR = how many changes of each size have been made.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const positional = args.filter(a => a !== '--dry');
const type = (positional[0] || '').toLowerCase();
const description = positional.slice(1).join(' ').trim();

const INDEX = { major: 0, medium: 1, minor: 2 };
const SECTION = { major: 'Major changes', medium: 'Medium changes', minor: 'Minor changes' };

if (!(type in INDEX) || !description) {
  console.error('usage: node tools/bump-version.js <major|medium|minor> "<description>" [--dry]');
  process.exit(2);
}

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function write(rel, text) { if (!dry) fs.writeFileSync(path.join(ROOT, rel), text); }

const configPath = 'src/config.js';
const config = read(configPath);
const vm = config.match(/var VERSION = '(\d+)\.(\d+)\.(\d+)';/);
if (!vm) { console.error('could not find "var VERSION" in src/config.js'); process.exit(1); }

const old = [+vm[1], +vm[2], +vm[3]];
const next = old.slice();
next[INDEX[type]] += 1;
const oldStr = old.join('.');
const newStr = next.join('.');
const today = new Date().toISOString().slice(0, 10);

// ---- source of truth ----------------------------------------------------
write(configPath, config.replace(
  new RegExp("var VERSION = '" + oldStr.replace(/\./g, '\\.') + "';"),
  "var VERSION = '" + newStr + "';"
));

// ---- package.json -------------------------------------------------------
const pkgPath = 'package.json';
const pkg = JSON.parse(read(pkgPath));
pkg.version = newStr;
write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// ---- service worker cache ----------------------------------------------
const swPath = 'sw.js';
const sw = read(swPath);
const cm = sw.match(/var CACHE = 'schedule-maker-v(\d+)';/);
if (!cm) { console.error('could not find the CACHE constant in sw.js'); process.exit(1); }
const newCache = +cm[1] + 1;
write(swPath, sw.replace(
  /var CACHE = 'schedule-maker-v\d+';/,
  "var CACHE = 'schedule-maker-v" + newCache + "';"
));

// ---- changelog ----------------------------------------------------------
const logPath = 'CHANGELOG.md';
let log = read(logPath);

log = log.replace(
  /Current version: \*\*\d+\.\d+\.\d+\*\* — \d+ major, \d+ medium and \d+ minor changes\./,
  'Current version: **' + newStr + '** — ' + next[0] + ' major, ' + next[1] +
  ' medium and ' + next[2] + ' minor changes.'
);

Object.keys(SECTION).forEach(function (kind) {
  const heading = SECTION[kind];
  const n = next[INDEX[kind]];
  log = log.replace(
    new RegExp('## ' + heading + ' \\((\\d+)\\)'),
    '## ' + heading + ' (' + n + ')'
  );
});

/* Append the new entry at the end of its own section. */
const headingText = '## ' + SECTION[type] + ' (' + next[INDEX[type]] + ')';
const start = log.indexOf(headingText);
if (start < 0) { console.error('could not find "' + headingText + '" in CHANGELOG.md'); process.exit(1); }
const afterHeading = start + headingText.length;
const nextHeading = log.indexOf('\n## ', afterHeading);
const end = nextHeading < 0 ? log.length : nextHeading;
const entry = '\n' + next[INDEX[type]] + '. **' + description + '** (' + today + ')\n';
log = log.slice(0, end).replace(/\s*$/, '\n') + entry + log.slice(end);

write(logPath, log);

console.log((dry ? '[dry run] ' : '') + 'version ' + oldStr + ' -> ' + newStr +
  ' (' + type + '), sw cache v' + newCache);
console.log('  config.js, package.json, sw.js, CHANGELOG.md updated');
