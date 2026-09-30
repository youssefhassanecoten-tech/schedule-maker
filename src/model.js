/* Schedule Maker - assembles the complete model from a source grid.
 *
 *   source .docx  ->  occurrences  ->  lesson numbers  ->  rooms  ->  week/month views
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  function createModel(grid, options) {
    options = options || {};
    var semester = Object.assign({}, SM.config.semester, options.semester || {});
    semester.weeks = Math.max(1, semester.weeks | 0);

    var res = SM.resolve.build(grid, { semester: semester });
    var occ = res.occurrences;

    var counterInfo = SM.counters.countLessons(occ);
    var alloc = SM.rooms.allocate(occ, { registry: res.registry });

    // ---- indexes ----------------------------------------------------------
    var byWeek = {}, byDate = {}, byMonth = {};
    occ.forEach(function (o) {
      (byWeek[o.week] || (byWeek[o.week] = [])).push(o);
      (byDate[o.date] || (byDate[o.date] = [])).push(o);
      var mk = o.date.slice(0, 7);
      (byMonth[mk] || (byMonth[mk] = [])).push(o);
    });

    // ---- requests ---------------------------------------------------------
    var allRequests = SM.rooms.requests(occ);
    var requestsByWeek = {};
    allRequests.forEach(function (r) {
      var w = U.weekOf(r.date, semester.firstMonday);
      (requestsByWeek[w] || (requestsByWeek[w] = [])).push(r);
    });

    var model = {
      grid: grid,
      semester: semester,
      teachers: grid.teachers.map(function (t) {
        return { name: t.name, surname: U.surname(t.name), cells: t.cells, fills: t.fills };
      }),
      occurrences: occ,
      registry: res.registry,
      byWeek: byWeek,
      byDate: byDate,
      byMonth: byMonth,
      requests: allRequests,
      requestsByWeek: requestsByWeek,
      counters: counterInfo,
      files: Object.assign({ monthly: 'Raspisanie_M_{month}_{year}.docx' }, SM.config.files, options.files || {}),
      warnings: [].concat(res.warnings, alloc.warnings),
      stats: {
        lessons: occ.length,
        groups: counterInfo.totals.groups,
        maxTopic: counterInfo.totals.max,
        weeks: semester.weeks,
        overflowSlots: allRequests.length,
        extraRooms: allRequests.reduce(function (a, r) { return a + r.needed; }, 0)
      }
    };
    return model;
  }

  /* Weeks that belong to a given month, assigned by their Monday. */
  function weeksInMonth(model, year, month) {
    var out = [];
    for (var w = 1; w <= model.semester.weeks; w++) {
      var mon = U.mondayOfWeek(w, model.semester.firstMonday);
      if (+mon.slice(0, 4) === year && (+mon.slice(5, 7) - 1) === month) out.push(w);
    }
    return out;
  }

  /* Months that actually contain lessons. */
  function activeMonths(model) {
    var keys = Object.keys(model.byMonth).sort();
    return keys.map(function (k) {
      return { year: +k.slice(0, 4), month: +k.slice(5, 7) - 1, key: k };
    });
  }

  /* Recompute numbers + rooms after a live edit (room change, lesson deletion). */
  function recompute(model) {
    var occ = model.occurrences;
    SM.counters.countLessons(occ);
    var alloc = SM.rooms.allocate(occ, { registry: model.registry });

    model.byWeek = {}; model.byDate = {}; model.byMonth = {};
    occ.forEach(function (o) {
      (model.byWeek[o.week] || (model.byWeek[o.week] = [])).push(o);
      (model.byDate[o.date] || (model.byDate[o.date] = [])).push(o);
      var mk = o.date.slice(0, 7);
      (model.byMonth[mk] || (model.byMonth[mk] = [])).push(o);
    });

    model.requests = SM.rooms.requests(occ);
    model.requestsByWeek = {};
    model.requests.forEach(function (r) {
      var w = U.weekOf(r.date, model.semester.firstMonday);
      (model.requestsByWeek[w] || (model.requestsByWeek[w] = [])).push(r);
    });
    model.allocWarnings = alloc.warnings;
    model.stats.lessons = occ.length;
    model.stats.overflowSlots = model.requests.length;
    model.stats.extraRooms = model.requests.reduce(function (a, r) { return a + r.needed; }, 0);
    return model;
  }

  SM.model = { createModel: createModel, recompute: recompute, weeksInMonth: weeksInMonth, activeMonths: activeMonths };

})(typeof window !== 'undefined' ? window : globalThis);
