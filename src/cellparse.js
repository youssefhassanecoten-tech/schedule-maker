/* Schedule Maker - turn one grid cell into a list of (group, spec, note) entries.
 *
 * Real examples that must all work:
 *   "269 (2-9) 269А (10-17)"
 *   "269А (13,14) 169А (12.01,19.01, 02.02)"
 *   "126 (2,4,6) 126А (8,10, 12,14,16)"
 *   "131 (8,10,12) (с 15.00.)"
 *   "171Б (06.10-02.02)"
 *   "165Б (03.12,)"
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});

  /* A group code: 3-4 digits plus an optional Cyrillic letter. */
  var RE_GROUP_TOK = /(\d{3,4})\s*([А-Яа-яA-Z]?)\s*\.?/y;
  var RE_PAREN = /\(([^()]*)\)/y;

  /*
   * Tokenise a cell.
   * Returns { entries: [{group, specText, notes:[]}], warnings: [string] }
   */
  function parseCell(rawText, ctx) {
    var s = SM.util.flat(rawText);
    var warnings = [];
    var entries = [];

    if (!s) return { entries: entries, warnings: warnings };

    var pos = 0;
    var pendingNote = '';
    var lastEntry = null;

    while (pos < s.length) {
      // Skip separators between entries.
      var ch = s[pos];
      if (ch === ' ' || ch === ',' || ch === ';') { pos++; continue; }

      // A parenthesised note with no preceding group context, or a note between entries.
      RE_PAREN.lastIndex = pos;
      var pm = RE_PAREN.exec(s);
      if (pm) {
        var inner = SM.util.flat(pm[1]);
        pos = RE_PAREN.lastIndex;
        if (SM.spec.isNote(inner)) {
          if (lastEntry) lastEntry.notes.push(inner);
          else pendingNote += inner + ' ';
          continue;
        }
        // Numeric paren right at the start with no group yet -> orphan, skip with warning.
        if (!lastEntry) {
          warnings.push((ctx || '') + ' orphaned specification "(' + inner + ')"');
          continue;
        }
        // Should not happen (numeric parens are consumed with their group) - attach anyway.
        lastEntry.specText = inner;
        continue;
      }

      RE_GROUP_TOK.lastIndex = pos;
      var gm = RE_GROUP_TOK.exec(s);
      if (gm) {
        pos = RE_GROUP_TOK.lastIndex;
        var group = SM.util.normalizeGroup(gm[0]);
        if (!group) { warnings.push((ctx || '') + ' could not read group "' + gm[0] + '"'); continue; }
        lastEntry = { group: group, specText: null, notes: pendingNote ? [pendingNote.trim()] : [], source: gm[0] };
        pendingNote = '';
        entries.push(lastEntry);
        continue;
      }

      // Anything else: accumulate as a note on the previous entry.
      var chunk = s[pos];
      pos++;
      if (/\s/.test(chunk)) continue;
      if (lastEntry) lastEntry.notes.push(chunk);
      else pendingNote += chunk;
    }

    if (pendingNote.trim() && entries.length) entries[0].notes.push(pendingNote.trim());
    if (!entries.length && s) {
      warnings.push((ctx || '') + ' no group found in "' + s + '"');
    }
    entries.forEach(function (e) { if (!e.specText) warnings.push((ctx || '') + ' group ' + e.group + ' has no week/date specification'); });

    return { entries: entries, warnings: warnings };
  }

  /* Parse every non-empty cell of a grid row. */
  function parseRow(teacher, cells, ctxPrefix) {
    var result = [], warnings = [];
    cells.forEach(function (cellText, slotIdx) {
      if (!cellText || !SM.util.flat(cellText)) return;
      var slot = SM.config.SLOTS[slotIdx];
      var ctx = (ctxPrefix || teacher) + ' / ' + SM.config.DAYS_RU[slot.day] + ' ' + SM.config.BLOCK_BY_KEY[slot.block].labelRu;
      var r = parseCell(cellText, ctx + ':');
      warnings = warnings.concat(r.warnings);
      r.entries.forEach(function (e) {
        result.push({
          teacher: teacher,
          slot: slot.idx,
          day: slot.day,
          block: slot.block,
          group: e.group,
          specText: e.specText,
          notes: e.notes,
          raw: SM.util.flat(cellText)
        });
      });
    });
    return { entries: result, warnings: warnings };
  }

  SM.cellparse = { parseCell: parseCell, parseRow: parseRow };

})(typeof window !== 'undefined' ? window : globalThis);
