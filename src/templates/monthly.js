/* Schedule Maker - monthly schedule document.
 *
 * Mirrors "2_Oktyabr_2026_G__1.doc", measured from that file:
 *   title paragraph
 *   table with 2 label columns + 6 day columns x 4 sub-columns
 *     [Номер недели][Время][понедельник]...[суббота]
 *     [ ][ ] | № гр. | Ф.И.О. преподавателя | № ауд. | № темы |   (x6)
 *     [ ][ ] | 28.09 | 29.09. | 30.09. | ...                    (x6)
 *   then, for every week of the month and every time block, one row per lesson:
 *     a lesson is drawn as two rows (9.00-10.30 and 10.45-12.15) that share the
 *     same "№ темы".
 *
 * Three details of the reference file that this module used to get wrong, and
 * which are now driven from SM.config.MONTHLY_PROFILE / PAGE_SIZES:
 *   - there are exactly 2 label columns. An earlier version also emitted a
 *     narrow empty corner column, which shifted every body row one cell to the
 *     right of where the reference puts it;
 *   - the reference is A4 landscape with 1cm margins, not A3;
 *   - the week label and the time label are vertically merged down their whole
 *     group. The reference writes the evening label (16.45-20.00) as a plain
 *     unmerged cell, so it is emitted as its own single-row group.
 *
 * Column count: 2 label + 6 days x 4 sub-columns = 26 cells per body row. The
 * reference reports 28 grid columns because Word's .doc -> .docx conversion
 * leaves two sliver columns (42 and 105 twips) behind; they are a conversion
 * artefact, not part of the design, and are not reproduced here.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  var SUB_HEADERS_RU = ['№ гр.', 'Ф.И.О. преподавателя', '№ ауд.', '№ темы'];
  var SUB_HEADERS_EN = ['Grp', 'Teacher', 'Room', 'Topic'];

  var DAYS = 6;
  var SUB = 4;

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
    var days = [];
    for (var i = 0; i < DAYS; i++) days.push([]);
    (model.byWeek[week] || []).forEach(function (o) {
      if (o.block !== block) return;
      days[o.day].push(o);
    });
    return days;
  }

  /* Resolve the requested page size to {w, h, margin}. Falls back to the
   * department's A4 default when the name is unknown, so a bad Settings value
   * can never produce a document Word refuses to open. */
  function page(name) {
    var sizes = SM.config.PAGE_SIZES;
    return sizes[name] || sizes[SM.config.DEFAULT_PAGE_SIZE];
  }

  /* 2 label columns + 6 days x 4 sub-columns = 26 columns, sized from the
   * measured profile. Fractions of the usable width so the same table fits A4
   * or A3 without a second set of magic numbers. */
  function columnWidths(usable) {
    var p = SM.config.MONTHLY_PROFILE;
    var weekW = Math.round(usable * p.weekFrac);
    var timeW = Math.round(usable * p.timeFrac);
    var dayW = Math.floor((usable - weekW - timeW) / DAYS);
    var cols = [weekW, timeW];
    for (var d = 0; d < DAYS; d++) {
      var g = Math.round(dayW * p.daySubFrac[0]);
      var f = Math.round(dayW * p.daySubFrac[1]);
      var a = Math.round(dayW * p.daySubFrac[2]);
      var t = dayW - g - f - a; // absorb rounding drift in the last column
      cols = cols.concat([g, f, a, t]);
    }
    return cols;
  }

  function build(model, year, month, opts) {
    opts = opts || {};
    var lang = opts.lang || 'ru';
    var pg = page(opts.pageSize);
    var doc = new SM.docxWrite.Doc({
      orient: 'landscape', size: opts.pageSize || SM.config.DEFAULT_PAGE_SIZE,
      defaultSize: 12, margin: pg.margin
    });

    doc.para(title(year, month, lang), { align: 'center', bold: true, size: 22, after: 100 });

    var weeks = weeksOfMonth(model, year, month);
    var sub = lang === 'en' ? SUB_HEADERS_EN : SUB_HEADERS_RU;
    var cols = columnWidths(pg.w - 2 * pg.margin);
    var weekW = cols[0], timeW = cols[1];

    var table = doc.table({ cols: cols });

    // Row A: week column + time column + day names
    var ra = table.row();
    ra.cell({
      text: lang === 'en' ? 'Week' : 'Номер недели',
      width: weekW, align: 'center', bold: true, size: 13, vMerge: 'restart'
    });
    ra.cell({
      text: lang === 'en' ? 'Time' : 'Время',
      width: timeW, align: 'center', bold: true, size: 13, vMerge: 'restart'
    });
    for (var d1 = 0; d1 < DAYS; d1++) {
      ra.cell({
        text: lang === 'en' ? SM.config.DAYS_EN[d1] : SM.config.DAYS_RU[d1],
        gridSpan: SUB, align: 'center', bold: true, size: 14
      });
    }

    // Row B: sub-headers
    var rb = table.row();
    rb.cell({ text: '', width: weekW, vMerge: 'continue' });
    rb.cell({ text: '', width: timeW, vMerge: 'continue' });
    for (var d2 = 0; d2 < DAYS; d2++) {
      for (var k = 0; k < SUB; k++) rb.cell({ text: sub[k], align: 'center', bold: true, size: 12 });
    }

    weeks.forEach(function (week) {
      // Row C: dates
      var mon = U.mondayOfWeek(week, model.semester.firstMonday);
      var sat = U.addDays(mon, 5);
      var rc = table.row();
      rc.cell({ text: '', width: weekW, vMerge: 'continue' });
      rc.cell({ text: '', width: timeW, vMerge: 'continue' });
      for (var d3 = 0; d3 < DAYS; d3++) {
        rc.cell({
          text: U.fmtRu(U.addDays(mon, d3), true),
          gridSpan: SUB, align: 'center', bold: true, size: 13
        });
      }

      var weekLabel = (lang === 'en' ? 'week ' : '') + week +
                      (lang === 'en' ? ' (' : ' неделя (с ') +
                      U.fmtRu(mon, true) + ' по ' + U.fmtRu(sat, true) + ')';

      SM.config.MONTHLY_PROFILE.blocks.forEach(function (bkey) {
        var days = blockMatrix(model, week, bkey);
        var maxRows = 0;
        days.forEach(function (list) { maxRows = Math.max(maxRows, list.length); });
        if (!maxRows) return;
        var subslots = SM.config.SUBSLOTS[bkey];

        for (var s = 0; s < subslots.length; s++) {
          var ss = subslots[s];
          for (var r = 0; r < maxRows; r++) {
            var row = table.row();
            row.cell({
              text: (s === 0 && r === 0) ? weekLabel : '',
              width: weekW, align: 'left', size: 11,
              // The week label spans the whole week: the first time group starts
              // it, every following group continues it.
              vMerge: (s === 0 && r === 0) ? 'restart' : 'continue'
            });
            var tlabel = (s === 0 && r === 0)
              ? (ss.from + (ss.to ? ' – ' + ss.to : ''))
              : '';
            // The time label is merged down its whole group, matching the
            // reference: first row restarts the merge, the rest continue it.
            row.cell({
              text: tlabel, width: timeW, align: 'left', size: 11,
              vMerge: (s === 0 && r === 0) ? 'restart' : 'continue'
            });
            for (var d4 = 0; d4 < DAYS; d4++) {
              var o = days[d4][r];
              var hl = o && o.overflow && opts.highlightOverflow !== false ? 'FFFF00' : null;
              if (!o) {
                for (var e = 0; e < SUB; e++) row.cell({ text: '' });
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
