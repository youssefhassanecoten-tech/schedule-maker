/* Schedule Maker - lesson numbering ("№ темы").
 *
 * Rules implemented (as specified by the department):
 *  1. The counter belongs to a GROUP and never resets during the semester.
 *  2. It is incremented once per (group, date, time-block). The two sub-slots of a
 *     block (9.00-10.30 / 10.45-12.15) are the same lesson and share one number.
 *  3. There are no different subjects - only different teachers - so switching
 *     teacher does NOT restart the counter.
 *  4. A group may be relabelled mid-term: "263" (weeks 1-8) becomes "263А"/"263Б"
 *     (weeks 9-17). The relabelled groups INHERIT the last number reached by the
 *     base group and are then counted independently of each other.
 *     Groups that exist from week 1 side by side (128А and 128Б) start at 1 each,
 *     because neither continues the other.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  function countLessons(occurrences, options) {
    options = options || {};
    var byName = Object.create(null);

    // 1) Lessons of unsuffixed groups always start at 1.
    occurrences.forEach(function (o) {
      if (!o.groupSuffix) {
        (byName[o.group] || (byName[o.group] = [])).push(o);
      }
    });

    var baseLast = Object.create(null);   // "263" -> last number reached
    Object.keys(byName).forEach(function (g) {
      baseLast[g] = byName[g].length;     // one lesson per occurrence
    });

    // 2) Suffix groups inherit the last value of their base group, if the base group
    //    actually finished before the suffixed group started.
    var startValue = Object.create(null);
    occurrences.forEach(function (o) {
      if (startValue[o.group] !== undefined) return;
      startValue[o.group] = 1;
    });
    occurrences.forEach(function (o) {
      if (!o.groupSuffix) return;
      if (startValue[o.group] !== 1) return;      // already decided
      var base = o.groupBase;
      var baseLessons = byName[base];
      if (!baseLessons || !baseLessons.length) return;
      // Only inherit when every base lesson happened before this group's first one.
      var firstSuffixed = firstDateOf(occurrences, o.group);
      var lastBase = lastDateOf(baseLessons);
      if (lastBase < firstSuffixed) {
        startValue[o.group] = baseLessons.length + 1;
      } else {
        startValue[o.group] = 1;
      }
    });

    // 3) Number each group independently, in chronological order.
    var counters = Object.create(null);
    occurrences.forEach(function (o) {
      if (counters[o.group] === undefined) counters[o.group] = (startValue[o.group] || 1) - 1;
      counters[o.group] += 1;
      o.topic = counters[o.group];
      o.counterStart = startValue[o.group] || 1;
    });

    occurrences.forEach(function (o) {
      if (o.notes && o.notes.length) o.topicNote = o.notes.join(' ');
    });

    return {
      startValue: startValue,
      baseLast: baseLast,
      totals: totals(counters)
    };
  }

  function firstDateOf(occ, group) {
    var best = null;
    for (var i = 0; i < occ.length; i++) {
      if (occ[i].group !== group) continue;
      if (best === null || occ[i].date < best) best = occ[i].date;
    }
    return best;
  }
  function lastDateOf(list) {
    var best = null;
    for (var i = 0; i < list.length; i++) {
      if (best === null || list[i].date > best) best = list[i].date;
    }
    return best;
  }

  function totals(counters) {
    var max = 0, sum = 0, n = 0;
    Object.keys(counters).forEach(function (g) {
      max = Math.max(max, counters[g]);
      sum += counters[g];
      n++;
    });
    return { max: max, sum: sum, groups: n };
  }

  SM.counters = { countLessons: countLessons };

})(typeof window !== 'undefined' ? window : globalThis);
