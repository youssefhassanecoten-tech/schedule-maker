/* Schedule Maker - parsing of the "(...)" specifications found in the department grid.
 *
 * Two notations are used in the source document and both must be supported:
 *
 *   week numbers   (2-9)      (13,14)      (9, 11-17)      (1-9, 11-18,20)
 *   calendar dates (12.01,19.01, 02.02)    (07.10-10.02)   (19.10,02.11,30.11,11.01.)
 *
 * A specification is treated as calendar based as soon as it contains a dot.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  var RE_ONLY_NUMERIC = /^[\d\s.,\-]+$/;

  function isNote(text) { return !RE_ONLY_NUMERIC.test(text); }

  /* ------------------------------------------------------------------ *
   *  Calendar dates
   * ------------------------------------------------------------------ */

  /* "07.10" / "7.1" / "19.10." -> {day, month} */
  function parseDayMonth(s) {
    var m = String(s).trim().replace(/\.+$/, '').match(/^(\d{1,2})\.(\d{1,2})$/);
    if (!m) return null;
    return { day: +m[1], month: +m[2] };
  }

  function monthLen(year, month) { return new Date(year, month, 0).getDate(); }

  /* Resolve a bare DD.MM to the year that lands inside the semester span. */
  function resolveYear(dm, sem) {
    var spanStart = sem.firstMonday;
    var spanEnd = U.addDays(sem.firstMonday, sem.weeks * 7 - 1);
    var best = null, bestDist = Infinity;
    var baseYear = U.parseISO(spanStart).getFullYear();
    for (var y = baseYear - 1; y <= baseYear + 2; y++) {
      if (dm.month < 1 || dm.month > 12) continue;
      if (dm.day < 1 || dm.day > monthLen(y, dm.month)) continue;
      var iso = y + '-' + U.pad2(dm.month) + '-' + U.pad2(dm.day);
      if (!U.isValidISO(iso)) continue;
      if (iso < spanStart || iso > spanEnd) continue;
      var dist = Math.abs(U.parseISO(iso) - U.parseISO(spanStart));
      if (dist < bestDist) { bestDist = dist; best = iso; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   *  Specification parsing
   * ------------------------------------------------------------------ */

  /* Split a spec body on commas that are not inside anything (no nesting here). */
  function splitTop(s) {
    return String(s).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
  }

  /* Parse into a structured spec object. Does NOT expand to dates. */
  function parseSpec(body, sem) {
    var raw = U.normalizeText(body);
    if (!raw) return null;

    if (isNote(raw)) return { kind: 'note', text: raw };

    var dateBased = raw.indexOf('.') >= 0;
    if (!dateBased) {
      var weeks = [];
      var bad = false;
      splitTop(raw).forEach(function (part) {
        var r = part.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
        if (r) {
          var a = +r[1], b = +r[2];
          if (b < a) { var t = a; a = b; b = t; }
          for (var w = a; w <= b; w++) weeks.push(w);
          return;
        }
        var s1 = part.match(/^(\d{1,2})$/);
        if (s1) { weeks.push(+s1[1]); return; }
        bad = true;
      });
      if (bad || !weeks.length) return { kind: 'unparsed', text: raw };
      weeks.sort(function (x, y) { return x - y; });
      return { kind: 'weeks', weeks: U.unique(weeks), text: raw };
    }

    var dates = [], unresolved = [], badDate = false;
    splitTop(raw).forEach(function (part) {
      var r = part.match(/^(\d{1,2}\.\d{1,2})\s*-\s*(\d{1,2}\.\d{1,2})$/);
      if (r) {
        var dm1 = parseDayMonth(r[1]), dm2 = parseDayMonth(r[2]);
        var iso1 = dm1 && resolveYear(dm1, sem);
        var iso2 = dm2 && resolveYear(dm2, sem);
        if (!iso1 || !iso2) { unresolved.push(part); badDate = true; return; }
        if (iso2 < iso1) { var t = iso1; iso1 = iso2; iso2 = t; }
        // Expand every matching weekday between the two dates later, because the
        // weekday is only known from the grid slot. Store the range here.
        dates.push({ from: iso1, to: iso2, isRange: true });
        return;
      }
      var dm = parseDayMonth(part);
      if (!dm) { badDate = true; unresolved.push(part); return; }
      var iso = resolveYear(dm, sem);
      if (!iso) { badDate = true; unresolved.push(part); return; }
      dates.push({ iso: iso, isRange: false });
    });
    if (!dates.length) return { kind: 'unparsed', text: raw };
    return {
      kind: 'dates',
      dates: dates,
      unresolved: unresolved,
      text: raw
    };
  }

  /* ------------------------------------------------------------------ *
   *  Expansion to concrete dates for a given slot
   * ------------------------------------------------------------------ */

  /* Every date of weekday `dow` between a and b inclusive. */
  function weekdayRange(fromISO, toISO, dow) {
    var out = [];
    var cur = fromISO;
    // align forward to the requested weekday
    var shift = (dow - U.dayOfWeek(cur) + 7) % 7;
    cur = U.addDays(cur, shift);
    var guard = 0;
    while (cur <= toISO && guard++ < 400) {
      out.push(cur);
      cur = U.addDays(cur, 7);
    }
    return out;
  }

  /*
   * Expand a parsed spec into the list of ISO dates on which it applies.
   *
   * `slotDow` is the grid column index: 0 = Monday ... 5 = Saturday.
   * Week based specifications simply shift the Monday of each week.
   * Date ranges such as "(03.10-06.02)" repeat the slot's weekday, which in
   * JavaScript's numbering is (slotDow + 1) % 7.
   */
  function expand(spec, slotDow, sem) {
    if (!spec) return [];
    var spanStart = sem.firstMonday;
    var spanEnd = U.addDays(sem.firstMonday, sem.weeks * 7 - 1);
    var out = [];
    var i;

    if (spec.kind === 'weeks') {
      for (i = 0; i < spec.weeks.length; i++) {
        var w = spec.weeks[i];
        if (w < 1 || w > sem.weeks) continue;
        var monday = U.mondayOfWeek(w, sem.firstMonday);
        var iso = U.addDays(monday, slotDow);
        if (iso >= spanStart && iso <= spanEnd) out.push(iso);
      }
    } else if (spec.kind === 'dates') {
      var jsDow = (slotDow + 1) % 7;
      for (i = 0; i < spec.dates.length; i++) {
        var d = spec.dates[i];
        if (d.isRange) out = out.concat(weekdayRange(d.from, d.to, jsDow));
        else out.push(d.iso);
      }
    } else {
      return [];
    }
    out = U.unique(out).filter(function (iso) { return iso >= spanStart && iso <= spanEnd; });
    out.sort();
    return out;
  }

  SM.spec = {
    isNote: isNote,
    parseSpec: parseSpec,
    expand: expand,
    parseDayMonth: parseDayMonth,
    resolveYear: resolveYear,
    weekdayRange: weekdayRange
  };

})(typeof window !== 'undefined' ? window : globalThis);
