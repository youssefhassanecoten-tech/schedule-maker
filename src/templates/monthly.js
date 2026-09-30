/* Schedule Maker - monthly schedule document.
 *
 * Mirrors "2_Oktyabr_2026_G__1.doc":
 *   title paragraph
 *   table with 2 label columns + 6 day columns x 4 sub-columns
 *     [Номер недели][Время][понедельник]...[суббота]
 *     [ ][ ] | № гр. | Ф.И.О. преподавателя | № ауд. | № темы |   (x6)
 *     [ ][ ] | 28.09 | 29.09. | 30.09. | ...                    (x6)
 *   then, for every week of the month and every time block, one row per lesson:
 *     a lesson is drawn as two rows (9.00-10.30 and 10.45-12.15) that share the
 *     same "№ темы".
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  var SUB_HEADERS_RU = ['№ гр.', 'Ф.И.О. преподавателя', '№ ауд.', '№ темы'];
  var SUB_HEADERS_EN = ['Grp', 'Teacher', 'Room', 'Topic'];

  function title(year, month, lang) {
    if (lang === 'en') {
      return 'Class schedule of the Department of Russian as a Foreign Language, ' +
             SM.monthNameEn[month] + ' ' + year;
    }
    return 'Расписание занятий на кафедре русского языка как иностранного в ' +
           SM.monthNameRu[month] + ' ' + year + ' г.';
  }

  function fileName(year, month, opts) {
    var pat = (opts && opts.files && opts.files.monthly) || 'Raspisanie_M_{month}_{year}.docx';
    return pat.replace('{month}', SM.monthNameEn[month])
               .replace('{monthRu}', SM.monthNameRuGen[month])
               .replace('{monthFolder}', SM.monthFolderEn[month])
               .replace('{year}', year);
  }

  function weeksOfMonth(model, year, month) {
    var out = [];
    for (var w = 1; w <= model.semester.weeks; w++) {
      var mon = U.mondayOfWeek(w, model.semester.firstMonday);
      if (+mon.slice(5, 7) - 1 === month && +mon.slice(0, 4) === year) out.push(w);
    }
    return out;
  }

  /* lessons of (week, block) grouped by day, then sorted */
  function blockMatrix(model, week, block) {
    var days = [[], [], [], [], [], []];
    (model.byWeek[week] || []).forEach(function (o) {
      if (o.block !== block) return;
      days[o.day].push(o);
    });
    return days;
  }

  function build(model, year, month, opts) {
    opts = opts || {};
    var lang = opts.lang || 'ru';
    var doc = new SM.docxWrite.Doc({
      orient: 'landscape', size: opts.pageSize || 'A3',
      defaultSize: 12, margin: 425
    });

    doc.para(title(year, month, lang), { align: 'center', bold: true, size: 22, after: 100 });

    var weeks = weeksOfMonth(model, year, month);
    var sub = lang === 'en' ? SUB_HEADERS_EN : SUB_HEADERS_RU;

    // Column widths (proportional). 3 label columns: corner, week, time.
    var pageW = opts.pageSize === 'A4' ? 16838 : 23811;
    var usable = pageW - 2 * 425;
    var cornerW = Math.round(usable * 0.012);
    var weekW = Math.round(usable * 0.055), timeW = Math.round(usable * 0.085);
    var rest = usable - cornerW - weekW - timeW;
    var wGrp = Math.round(rest * 0.135), wFio = Math.round(rest * 0.47);
    var wAud = Math.round(rest * 0.195), wTop = rest - wGrp - wFio - wAud;
    var cols = [cornerW, weekW, timeW];
    for (var d = 0; d < 6; d++) cols = cols.concat([wGrp, wFio, wAud, wTop]);

    var table = doc.table({ cols: cols });

    // Row A: corner + week column + time column + day names
    var ra = table.row();
    ra.cell({ text: '', width: cornerW });
    ra.cell({
      text: lang === 'en' ? 'Week' : 'Номер недели',
      width: weekW, align: 'center', bold: true, size: 13, vMerge: 'restart'
    });
    ra.cell({
      text: lang === 'en' ? 'Time' : 'Время',
      width: timeW, align: 'center', bold: true, size: 13, vMerge: 'restart'
    });
    for (var d1 = 0; d1 < 6; d1++) {
      ra.cell({
        text: lang === 'en' ? SM.config.DAYS_EN[d1] : SM.config.DAYS_RU[d1],
        gridSpan: 4, align: 'center', bold: true, size: 14
      });
    }

    // Row B: sub-headers
    var rb = table.row();
    rb.cell({ text: '', width: cornerW });
    rb.cell({ text: '', width: weekW, vMerge: 'continue' });
    rb.cell({ text: '', width: timeW, vMerge: 'continue' });
    for (var d2 = 0; d2 < 6; d2++) {
      for (var k = 0; k < 4; k++) rb.cell({ text: sub[k], align: 'center', bold: true, size: 12 });
    }

    weeks.forEach(function (week) {
      // Row C: dates
      var mon = U.mondayOfWeek(week, model.semester.firstMonday);
      var sat = U.addDays(mon, 5);
      var rc = table.row();
      rc.cell({ text: '', width: cornerW });
      rc.cell({ text: '', width: weekW, vMerge: 'continue' });
      rc.cell({ text: '', width: timeW, vMerge: 'continue' });
      for (var d3 = 0; d3 < 6; d3++) {
        rc.cell({
          text: U.fmtRu(U.addDays(mon, d3), true),
          gridSpan: 4, align: 'center', bold: true, size: 13
        });
      }

      var weekLabel = (lang === 'en' ? 'week ' : '') + week +
                      (lang === 'en' ? ' (' : ' неделя (с ') +
                      U.fmtRu(mon, true) + ' по ' + U.fmtRu(sat, true) + ')';

      ['M', 'A', 'E'].forEach(function (bkey) {
        var days = blockMatrix(model, week, bkey);
        var maxRows = 0;
        days.forEach(function (list) { maxRows = Math.max(maxRows, list.length); });
        if (!maxRows) return;
        var subslots = SM.config.SUBSLOTS[bkey];
        var blk = SM.config.BLOCK_BY_KEY[bkey];

        for (var s = 0; s < subslots.length; s++) {
          var ss = subslots[s];
          for (var r = 0; r < maxRows; r++) {
            var row = table.row();
            row.cell({ text: '', width: cornerW });
            row.cell({ text: (s === 0 && r === 0) ? weekLabel : '', width: weekW, align: 'left', size: 11 });
            var tlabel = (s === 0 && r === 0)
              ? (ss.from + (ss.to ? ' – ' + ss.to : ''))
              : '';
            row.cell({ text: tlabel, width: timeW, align: 'left', size: 11 });
            for (var d4 = 0; d4 < 6; d4++) {
              var o = days[d4][r];
              var hl = o && o.overflow && opts.highlightOverflow !== false ? 'FFFF00' : null;
              if (!o) {
                row.cell({ text: '' }); row.cell({ text: '' });
                row.cell({ text: '' }); row.cell({ text: '' });
                continue;
              }
              row.cell({ text: o.group, align: 'center', size: 12, fill: hl });
              row.cell({ text: o.teacher, align: 'left', size: 12, fill: hl });
              row.cell({ text: o.room || '', align: 'center', size: 12, fill: hl });
              row.cell({ text: String(o.topic || ''), align: 'center', size: 12, fill: hl });
            }
          }
        }
      });
    });

    return doc;
  }

  SM.templateMonthly = {
    build: build, title: title, fileName: fileName, weeksOfMonth: weeksOfMonth
  };

})(typeof window !== 'undefined' ? window : globalThis);
