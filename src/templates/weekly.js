/* Schedule Maker - weekly schedule document.
 *
 * Mirrors "Raspisanie_S_28_09_2026_Na_-5n.docx":
 *   title paragraph
 *   table: [teacher] x [14 time blocks]  with the day names spanning their columns
 *   each occupied cell reads:   269 (2-9)
 *                              5н-104
 *                              28.09
 * A cell holds one such block per lesson: a teacher working with two groups in
 * the same block lists both of them.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  function weekLabel(w) { return w + 'н'; }

  function title(model, week, lang) {
    var sem = model.semester;
    var mon = U.mondayOfWeek(week, sem.firstMonday);
    var dd = U.pad2(+mon.slice(8, 10)) + '.' + U.pad2(+mon.slice(5, 7)) + '.' + mon.slice(0, 4);
    if (lang === 'en') {
      return 'Class schedule of the Department of Russian as a Foreign Language, ' +
             sem.termEn + ' ' + sem.yearLabelEn + ', from ' + U.fmtEn(mon) + ' - week ' + week;
    }
    return 'Расписание занятий на кафедре русского языка как иностранного на ' +
           sem.termRu + ' ' + sem.yearLabelRu + ' учебного года с ' +
           U.fmtRu(mon, true) + '-' + weekLabel(week);
  }

  function fileName(model, week) {
    var mon = U.mondayOfWeek(week, model.semester.firstMonday);
    var dd = U.pad2(+mon.slice(8, 10)), mm = U.pad2(+mon.slice(5, 7)), yyyy = mon.slice(0, 4);
    return model.files.weekly
      .replace('{date}', dd + '_' + mm + '_' + yyyy)
      .replace('{week}', String(week));
  }

  /* Column groups per day, in document order. */
  function dayGroups() {
    var groups = [], cur = null;
    SM.config.SLOTS.forEach(function (s) {
      if (!cur || cur.day !== s.day) { cur = { day: s.day, slots: [] }; groups.push(cur); }
      cur.slots.push(s);
    });
    return groups;
  }

  function build(model, week, opts) {
    opts = opts || {};
    var lang = opts.lang || 'ru';
    var doc = new SM.docxWrite.Doc({ orient: 'landscape', size: 'A4', defaultSize: 14, margin: 567 });

    doc.para(title(model, week, lang), { align: 'center', bold: true, size: 24, after: 120 });

    // Column widths
    var usable = 16838 - 2 * 567;
    var teacherW = 1900;
    var slotW = Math.floor((usable - teacherW) / SM.config.SLOT_COUNT);
    var cols = [teacherW];
    for (var i = 0; i < SM.config.SLOT_COUNT; i++) cols.push(slotW);

    var groups = dayGroups();
    var table = doc.table({ cols: cols });

    // Header row: day names spanning their columns
    var hr = table.row();
    hr.cell({ text: '', width: teacherW, align: 'center', bold: true });
    groups.forEach(function (g) {
      var name = lang === 'en' ? SM.config.DAYS_EN[g.day] : SM.config.DAYS_RU[g.day];
      hr.cell({
        text: name, gridSpan: g.slots.length, align: 'center', bold: true, size: 16
      });
    });

    // Header row: time labels
    var tr = table.row();
    tr.cell({ text: '', width: teacherW });
    SM.config.SLOTS.forEach(function (s) {
      var b = SM.config.BLOCK_BY_KEY[s.block];
      tr.cell({ text: lang === 'en' ? (b.labelEn) : (b.labelRu), align: 'center', size: 13 });
    });

    var occ = model.byWeek[week] || [];

    model.teachers.forEach(function (t) {
      var row = table.row();
      row.cell({ text: t.name, width: teacherW, size: 13, align: 'left' });
      SM.config.SLOTS.forEach(function (s) {
        /* One cell can hold more than one lesson: a teacher who works with two
         * groups in the same block (their specifications overlap on this date).
         * Keeping only the first silently lost 16 lessons over the term. */
        var cells = occ.filter(function (o) { return o.teacher === t.name && o.slot === s.idx; });
        if (!cells.length) { row.cell({ text: '' }); return; }
        var lines = cellText(cells, week, lang);
        var over = cells.some(function (o) { return o.overflow; });
        row.cell({
          text: lines,
          align: 'center',
          size: 13,
          fill: over && opts.highlightOverflow !== false ? 'FFFF00' : null
        });
      });
    });

    return doc;
  }

  /*
   * One block of text for every lesson in the cell.
   * Same layout as the department's file - group, room, date - and a date is
   * printed on each lesson, so a cell with two groups reads:
   *
   *     263А (15)
   *     5н-104
   *     08.12
   *     267Б (15)
   *     5н-8 пав.
   *     08.12
   */
  function cellText(cells, week, lang) {
    return cells.map(function (o) {
      /* A distance lesson has no auditorium: print the week without a room
       * instead of an empty "5н-". */
      var room = o.room ? '-' + o.room : '';
      var spec = o.specText ? ' (' + o.specText + ')' : '';
      return o.group + spec + '\n' + weekLabel(week) + room + '\n' + U.fmtRu(o.date);
    }).join('\n');
  }

  SM.templateWeekly = { build: build, title: title, fileName: fileName, weekLabel: weekLabel };

})(typeof window !== 'undefined' ? window : globalThis);
