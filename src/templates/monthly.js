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

  /* Half-point font size. The reference sets every run in the table to w:sz=10,
   * i.e. 5pt, with no bold anywhere and centre alignment throughout. Matching
   * that literally makes the output look like the department's file. */
  var SZ = SM.config.MONTHLY_FONT_SZ;

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

  /* Weeks that touch the given calendar month.
   *
   * The department files a week under the month it *overlaps*, not the month its
   * Monday falls in. 2_Oktyabr_2026_G__1.doc opens with week 5, whose Monday is
   * 28.09 - a September date - yet the week runs to 03.10 and is filed with
   * October. Selecting on Monday alone drops that week from the October document
   * and leaves it in September, which is not what the department does.
   *
   * So: any week with at least one lesson day inside the month counts. */
  function weeksOfMonth(model, year, month) {
    var out = [];
    for (var w = 1; w <= model.semester.weeks; w++) {
      var mon = U.mondayOfWeek(w, model.semester.firstMonday);
      var touches = false;
      for (var d = 0; d < DAYS; d++) {
        var iso = U.addDays(mon, d);
        if (+iso.slice(0, 4) === year && +iso.slice(5, 7) - 1 === month) { touches = true; break; }
      }
      if (touches) out.push(w);
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
      width: weekW, align: 'center', size: SZ, vMerge: 'restart'
    });
    ra.cell({
      text: lang === 'en' ? 'Time' : 'Время',
      width: timeW, align: 'center', size: SZ, vMerge: 'restart'
    });
    for (var d1 = 0; d1 < DAYS; d1++) {
      // Reference spells the weekdays lower-case: "понедельник", not
      // "Понедельник".
      ra.cell({
        text: (lang === 'en' ? SM.config.DAYS_EN[d1] : SM.config.DAYS_RU[d1]).toLowerCase(),
        gridSpan: SUB, align: 'center', size: SZ
      });
    }

    // Row B: sub-headers
    var rb = table.row();
    rb.cell({ text: '', width: weekW, vMerge: 'continue' });
    rb.cell({ text: '', width: timeW, vMerge: 'continue' });
    for (var d2 = 0; d2 < DAYS; d2++) {
      for (var k = 0; k < SUB; k++) rb.cell({ text: sub[k], align: 'center', size: SZ });
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
          gridSpan: SUB, align: 'center', size: SZ
        });
      }

      /* Reference wording, verbatim:
       *   "5 неделя" / "(с 28.09. по 03.10.)"   - two paragraphs, no space
       *   before the bracket. The old build emitted it as a single line
       *   "5 неделя (с ...)". */
      var weekLabel = lang === 'en'
        ? ('week ' + week + '\n(from ' + U.fmtRu(mon, true) + ' to ' + U.fmtRu(sat, true) + ')')
        : (week + ' неделя\n(с ' + U.fmtRu(mon, true) + ' по ' + U.fmtRu(sat, true) + ')');

      /* True only for the first row ever emitted for this week, which is what
       * starts the week-label merge. */
      var firstBlock = true;

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
            var startsWeek = (s === 0 && r === 0 && firstBlock);
            row.cell({
              text: startsWeek ? weekLabel : '',
              width: weekW, align: 'center', size: SZ,
              /* The week label spans the whole week, not one time group: only
               * the very first row of the week restarts the merge, every
               * remaining row continues it. Restarting it per time block
               * duplicated the label three times over. */
              vMerge: startsWeek ? 'restart' : 'continue'
            });
            var tlabel = (s === 0 && r === 0)
              ? (ss.from + (ss.to ? ' – ' + ss.to : ''))
              : '';
            // The time label is merged down its whole group, matching the
            // reference: first row restarts the merge, the rest continue it.
            row.cell({
              text: tlabel, width: timeW, align: 'center', size: SZ,
              vMerge: (s === 0 && r === 0) ? 'restart' : 'continue'
            });
            for (var d4 = 0; d4 < DAYS; d4++) {
              var o = days[d4][r];
              var hl = o && o.overflow && opts.highlightOverflow !== false ? 'FFFF00' : null;
              if (!o) {
                for (var e = 0; e < SUB; e++) row.cell({ text: '' });
                continue;
              }
              row.cell({ text: o.group, align: 'center', size: SZ, fill: hl });
              row.cell({ text: o.teacher, align: 'center', size: SZ, fill: hl });
              row.cell({ text: o.room || '', align: 'center', size: SZ, fill: hl });
              row.cell({ text: String(o.topic || ''), align: 'center', size: SZ, fill: hl });
            }
            if (s === 0 && r === 0) firstBlock = false;
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
