/* Schedule Maker - builds the delivery folder tree and zips it.
 *
 *   schedule generated/
 *     01_September/
 *       Raspisanie_M_September_2026.docx
 *       Week 1/
 *         Raspisanie_S_31_08_2026_Na_-1n.docx
 *         Zayavka_Na_Aud_21_N.docx      (only when that week needs extra rooms)
 *       Week 2/
 *       ...
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  function manifest(model, opts) {
    opts = opts || {};
    var root = opts.rootFolder || SM.config.output.rootFolder;
    var weekPrefix = opts.weekFolderPrefix != null ? opts.weekFolderPrefix : SM.config.output.weekFolderPrefix;
    var lang = opts.lang || 'ru';
    var months = opts.months || SM.model.activeMonths(model);

    var entries = [];
    var rootNode = { path: root, children: {}, files: [] };

    months.forEach(function (m) {
      var folder = monthFolderName(m, lang, opts);
      var monthNode = node(rootNode, folder);
      monthNode.files.push({
        name: SM.templateMonthly.fileName(m.year, m.month, model),
        kind: 'monthly',
        doc: function () { return SM.templateMonthly.build(model, m.year, m.month, opts); }
      });

      SM.model.weeksInMonth(model, m.year, m.month).forEach(function (w) {
        var wf = weekPrefix + w;
        var weekNode = node(monthNode, wf);
        weekNode.files.push({
          name: SM.templateWeekly.fileName(model, w),
          kind: 'weekly',
          week: w,
          doc: function () { return SM.templateWeekly.build(model, w, opts); }
        });
        var reqs = model.requestsByWeek[w] || [];
        if (reqs.length) {
          weekNode.files.push({
            name: SM.templateZayavka.fileName(model),
            kind: 'zayavka',
            week: w,
            doc: function () { return SM.templateZayavka.build(reqs, opts); }
          });
        }
      });
      entries.push({ month: m, folder: folder });
    });

    return { root: rootNode, months: entries };
  }

  function monthFolderName(m, lang, opts) {
    if (opts && opts.monthFolderPattern) {
      return opts.monthFolderPattern
        .replace('{n}', SM.monthFolderEn[m.month].slice(0, 2))
        .replace('{month}', lang === 'en' ? SM.monthNameEn[m.month] : SM.monthFolderRu[m.month].slice(3))
        .replace('{year}', m.year);
    }
    return lang === 'en' ? SM.monthFolderEn[m.month] : SM.monthFolderRu[m.month];
  }

  function node(root, name) {
    if (!root.children[name]) root.children[name] = { path: root.path ? root.path + '/' + name : name, children: {}, files: [] };
    return root.children[name];
  }

  /* f.doc() may return a Doc synchronously or a promise for one. */
  function toBlob(f, JSZipCtor) {
    return Promise.resolve(f.doc()).then(function (d) { return d.toBlob(JSZipCtor); });
  }
  /* Async: materialise every document and return a JSZip ready for download. */
  function buildZip(model, opts) {
    opts = opts || {};
    var JSZipCtor = global.JSZip;
    if (!JSZipCtor) return Promise.reject(new Error('JSZip is not loaded'));
    var mf = manifest(model, opts);
    var zip = new JSZipCtor();
    var root = zip.folder(mf.root.path);
    var jobs = [];

    Object.keys(mf.root.children).forEach(function (monthName) {
      var mNode = mf.root.children[monthName];
      var mFolder = root.folder(monthName);
      mNode.files.forEach(function (f) {
        jobs.push(toBlob(f, JSZipCtor).then(function (blob) {
          mFolder.file(f.name, blob);
        }));
      });
      Object.keys(mNode.children).forEach(function (weekName) {
        var wFolder = mFolder.folder(weekName);
        mNode.children[weekName].files.forEach(function (f) {
          jobs.push(toBlob(f, JSZipCtor).then(function (blob) {
            wFolder.file(f.name, blob);
          }));
        });
      });
    });

    return Promise.all(jobs).then(function () {
      return { zip: zip, manifest: mf, count: countFiles(mf.root) };
    });
  }

  function countFiles(n) {
    var c = n.files.length;
    Object.keys(n.children).forEach(function (k) { c += countFiles(n.children[k]); });
    return c;
  }

  /* Flat list of {path, kind, week} for the download panel. */
  function flatList(model, opts) {
    var mf = manifest(model, opts);
    var out = [];
    (function walk(n, prefix) {
      n.files.forEach(function (f) { out.push({ path: n.path + '/' + f.name, kind: f.kind, week: f.week }); });
      Object.keys(n.children).forEach(function (k) { walk(n.children[k], n.path); });
    })(mf.root);
    return out;
  }

  SM.package = { manifest: manifest, buildZip: buildZip, flatList: flatList, monthFolderName: monthFolderName };

})(typeof window !== 'undefined' ? window : globalThis);
