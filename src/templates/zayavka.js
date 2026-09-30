/* Schedule Maker - auditorium request ("заявка на недостающие аудитории").
 *
 * Mirrors "Zayavka_Na_Aud_21_N.doc": a letter to the head of studies followed by a
 * four column table
 *     Дата | № павильона | № аудитории | Время проведения
 * Only the date and the time are filled in - the pavilion and the room numbers are
 * left blank on purpose, the department completes them by hand.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  function fileName(opts) {
    var f = (opts && opts.files && opts.files.zayavka) || SM.config.files.zayavka;
    return f;
  }

  /*
   * requests: [{ date, block, blockLabel, needed }]
   * Rows are grouped by date; the date is printed on the first row of each group and
   * every surplus room becomes its own row.
   */
  function build(requests, opts) {
    opts = opts || {};
    var Z = SM.config.zayavka;
    var doc = new SM.docxWrite.Doc({ orient: 'portrait', size: 'A4', defaultSize: 22, margin: 1134 });

    Z.addressee.forEach(function (l) { doc.para(l, { align: 'left' }); });
    doc.empty();
    doc.para(Z.title, { align: 'center', bold: true, before: 120, after: 160 });
    doc.para(Z.lead, { align: 'left', after: 160 });

    var cols = [2400, 1500, 1500, 3600];
    var table = doc.table({ cols: cols });

    var hr = table.row();
    Z.headers.forEach(function (h, i) {
      hr.cell({ text: h, width: cols[i], align: 'center', bold: true });
    });

    var byDate = Object.create(null);
    requests.forEach(function (r) {
      (byDate[r.date] || (byDate[r.date] = [])).push(r);
    });

    Object.keys(byDate).sort().forEach(function (date) {
      byDate[date].forEach(function (r, idx) {
        var row = table.row();
        // the date is printed once per date, like in the original form
        row.cell({ text: idx === 0 ? U.fmtRu(date) : '', width: cols[0], align: 'center' });
        row.cell({ text: '', width: cols[1], align: 'center' });   // № павильона - blank
        row.cell({ text: '', width: cols[2], align: 'center' });   // № аудитории  - blank
        row.cell({ text: r.blockLabel, width: cols[3], align: 'center' });
      });
    });

    doc.empty();
    Z.footer.forEach(function (l, i) {
      if (!l) { doc.empty(); return; }
      doc.para(l, { align: 'left', before: i === 0 ? 200 : 0 });
    });

    return doc;
  }

  SM.templateZayavka = { build: build, fileName: fileName };

})(typeof window !== 'undefined' ? window : globalThis);
