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

  /* Online ("-ДО") and in-person lessons of the same group share one topic
   * sequence, so the counter is keyed on the group without the -ДО marker. */
  function keyOf(o) { return o.counterGroup || o.group; }

  function countLessons(occurrences, options) {
    options = options || {};
    var byName = Object.create(null);

    // 1) Lessons of unsuffixed groups always start at 1.
    occurrences.forEach(function (o) {
      if (!o.groupSuffix) {
        (byName[keyOf(o)] || (byName[keyOf(o)] = [])).push(o);
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
      if (startValue[keyOf(o)] !== undefined) return;
      startValue[keyOf(o)] = 1;
    });
    occurrences.forEach(function (o) {
      if (!o.groupSuffix) return;
      if (startValue[keyOf(o)] !== 1) return;      // already decided
      var base = o.groupBase;
      var baseLessons = byName[base];
      if (!baseLessons || !baseLessons.length) return;
      // Only inherit when every base lesson happened before this group's first one.
      var firstSuffixed = firstDateOf(occurrences, keyOf(o));
      var lastBase = lastDateOf(baseLessons);
      if (lastBase < firstSuffixed) {
        startValue[keyOf(o)] = baseLessons.length + 1;
      } else {
        startValue[keyOf(o)] = 1;
      }
    });

    // 3) Number each group independently, in chronological order.
    var counters = Object.create(null);
    occurrences.forEach(function (o) {
      var k = keyOf(o);
      if (counters[k] === undefined) counters[k] = (startValue[k] || 1) - 1;
      counters[k] += 1;
      o.topic = counters[k];
      o.counterStart = startValue[k] || 1;
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

  function firstDateOf(occ, groupKey) {
    var best = null;
    for (var i = 0; i < occ.length; i++) {
      if (keyOf(occ[i]) !== groupKey) continue;
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
