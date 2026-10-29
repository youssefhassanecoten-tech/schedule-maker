/* Schedule Maker - assembles the complete model from a source grid.
 *
 *   source .docx  ->  occurrences  ->  lesson numbers  ->  rooms  ->  week/month views
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  /* Normalise a list of ISO dates supplied by the UI. */
  function normalizeHolidays(list) {
    var out = [];
    (list || []).forEach(function (d) {
      d = String(d || '').trim();
      if (U.isValidISO && U.isValidISO(d) && out.indexOf(d) < 0) out.push(d);
    });
    out.sort();
    return out;
  }

  /* Flag every lesson that falls on a holiday date. */
  function applyHolidays(occ, holidays) {
    var set = Object.create(null);
    (holidays || []).forEach(function (d) { set[d] = true; });
    occ.forEach(function (o) { o.holiday = !!set[o.date]; });
    return set;
  }

  function createModel(grid, options) {
    options = options || {};
    var semester = Object.assign({}, SM.config.semester, options.semester || {});
    semester.weeks = Math.max(1, semester.weeks | 0);

    var res = SM.resolve.build(grid, { semester: semester });
    var occ = res.occurrences;
    var holidays = normalizeHolidays(options.holidays);
    var holidaySet = applyHolidays(occ, holidays);

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
      holidays: holidays,
      holidaySet: holidaySet,
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
    model.holidays = normalizeHolidays(model.holidays);
    model.holidaySet = applyHolidays(occ, model.holidays);
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

  /* All group codes present in the source grid, sorted. */
  function allGroups(model) {
    var seen = Object.create(null), out = [];
    model.occurrences.forEach(function (o) {
      if (!seen[o.group]) { seen[o.group] = true; out.push(o.group); }
    });
    return out.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  }

  /* "181, 182; 263А" -> ['181', '182', '263А'] (unknown tokens dropped). */
  function parseGroupList(text) {
    var out = [];
    String(text || '').split(/[,\s;]+/).forEach(function (tok) {
      var g = U.normalizeGroup(tok);
      if (g && out.indexOf(g) < 0) out.push(g);
    });
    return out;
  }

  /*
   * Turn the user's "separate monthly schedules" setting into a plan.
   *
   *   splits: [{ name, groups }]   groups is free text typed by the user
   *
   * Returns
   *   { schedules: [{ label, groups, unknown, duplicate }], mainGroups }
   *
   * The main flow is every group the user did NOT assign to a schedule. A group
   * is only assigned to the first schedule that mentions it; a repeated or
   * unknown code is reported instead of silently disappearing.
   */
  function resolveSplits(model, splits) {
    var available = Object.create(null);
    var every = allGroups(model);
    /* Preparatory courses (ПО) never appear in a monthly schedule, so they are
     * not part of the monthly flow accounting: not in the main flow, and not
     * assignable to a split. */
    var monthlyGroups = every.filter(function (g) { return !U.isPrep(g); });
    monthlyGroups.forEach(function (g) { available[g] = true; });

    var used = Object.create(null);
    var schedules = [];
    (splits || []).forEach(function (s, i) {
      var groups = [], unknown = [], duplicate = [], excluded = [];
      parseGroupList(s && s.groups).forEach(function (g) {
        if (U.isPrep(g)) { if (excluded.indexOf(g) < 0) excluded.push(g); return; }
        if (!available[g]) { if (unknown.indexOf(g) < 0) unknown.push(g); return; }
        if (used[g]) { if (duplicate.indexOf(g) < 0) duplicate.push(g); return; }
        used[g] = true;
        groups.push(g);
      });
      var name = String((s && s.name) || '').trim();
      schedules.push({
        label: name || ('flow-' + (i + 1)),
        name: name,
        groups: groups,
        unknown: unknown,
        duplicate: duplicate,
        excluded: excluded
      });
    });

    return {
      schedules: schedules,
      mainGroups: monthlyGroups.filter(function (g) { return !used[g]; })
    };
  }

  /*
   * A monthly-only view of the model. It filters the occurrences but keeps the
   * very same objects, so a group carries exactly the № темы and the room it
   * has in the main schedule - splitting must never renumber or reallocate.
   */
  function monthlyView(model, groups) {
    var set = Object.create(null);
    (groups || []).forEach(function (g) { set[g] = true; });

    var occ = model.occurrences.filter(function (o) {
      return set[o.group] && !U.isPrep(o.group);
    });
    var byWeek = {}, byMonth = {};
    occ.forEach(function (o) {
      (byWeek[o.week] || (byWeek[o.week] = [])).push(o);
      var mk = o.date.slice(0, 7);
      (byMonth[mk] || (byMonth[mk] = [])).push(o);
    });

    return {
      semester: model.semester,
      teachers: model.teachers,
      occurrences: occ,
      byWeek: byWeek,
      byMonth: byMonth,
      files: model.files,
      /* The monthly date row is painted red for holidays, so the view must carry
       * the same holiday set as the full model. */
      holidays: model.holidays,
      holidaySet: model.holidaySet,
      groups: (groups || []).slice()
    };
  }

  SM.model = {
    createModel: createModel, recompute: recompute, weeksInMonth: weeksInMonth,
    activeMonths: activeMonths, allGroups: allGroups, parseGroupList: parseGroupList,
    resolveSplits: resolveSplits, monthlyView: monthlyView,
    normalizeHolidays: normalizeHolidays, applyHolidays: applyHolidays
  };

})(typeof window !== 'undefined' ? window : globalThis);
