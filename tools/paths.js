/* Resolves the sample department files used by the test harnesses.
 * Order: explicit CLI argument > SM_SAMPLES env var > the project's samples/ folder.
 */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

function samplesDir() {
  return process.env.SM_SAMPLES || path.join(ROOT, 'samples');
}

function resolve(name, arg) {
  const dir = samplesDir();
  const candidates = [
    arg,
    path.join(dir, name),
    path.join(process.env.USERPROFILE || '', 'Downloads', name)
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  console.error(
    'Could not find "' + name + '".\n' +
    'Looked in:\n  ' + candidates.join('\n  ') + '\n' +
    'Pass it as an argument, or set SM_SAMPLES to the folder that contains it:\n' +
    '  set SM_SAMPLES=C:\\Users\\yousef\\Downloads\n' +
    '  node tools/compare-cells.js "path\\to\\Raspisanie_versia_6.docx" "path\\to\\Raspisanie_S_...docx"'
  );
  process.exit(2);
}

module.exports = { ROOT, samplesDir, resolve };
