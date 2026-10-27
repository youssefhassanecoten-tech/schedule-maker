/* Schedule Maker - builds the delivery folder tree and zips it.
 *
 *   schedule generated/
 *     2026/
 *       09_sentyabr/
 *         Raspisanie_M_September_2026.docx
 *         Week 1/
 *           Raspisanie_S_31_08_2026_Na_-1n.docx
 *           Zayavka_Na_Aud_21_N.docx    (only when that week needs extra rooms)
 *         Week 2/
 *         ...
 *     2027/
 *       01_yanvar/
 *       ...
 *
 * The year level comes first so a calendar sort puts January 2027 after
 * December 2026 instead of next to January 2026.
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
    /* Only the monthly document is split; weeks and the request keep using the
     * complete model. resolveSplits also tells us which groups stay in the main
     * flow, so the main monthly is never duplicated. */
    var plan = SM.model.resolveSplits(model, opts.monthlySplits);

    var entries = [];
    var rootNode = { path: root, children: {}, files: [] };

    months.forEach(function (m) {
      var folder = monthFolderName(m, lang, opts);
      var yearNode = node(rootNode, String(m.year));
      var monthNode = node(yearNode, folder);
      var usedNames = Object.create(null);

      if (plan.mainGroups.length) {
        /* The monthly never contains preparatory courses, and with splits
         * configured it must not repeat the groups sent to a separate document
         * either. Filtering keeps the same occurrences, so numbering and rooms
         * stay identical to the weekly schedule. */
        var mainModel = SM.model.monthlyView(model, plan.mainGroups);
        var mainHasLessons = SM.templateMonthly.weeksOfMonth(mainModel, m.year, m.month)
          .some(function (w) { return (mainModel.byWeek[w] || []).length > 0; });
        if (mainHasLessons) {
          monthNode.files.push({
            name: SM.templateMonthly.fileName(m.year, m.month, model),
            kind: 'monthly',
            doc: function () { return SM.templateMonthly.build(mainModel, m.year, m.month, opts); }
          });
        }
      }

      plan.schedules.forEach(function (s) {
        if (!s.groups.length) return;
        var view = SM.model.monthlyView(model, s.groups);
        /* A flow with nothing to teach in this month is not a document the
         * department can use - leave it out instead of shipping a bare header. */
        var hasLessons = SM.templateMonthly.weeksOfMonth(view, m.year, m.month)
          .some(function (w) { return (view.byWeek[w] || []).length > 0; });
        if (!hasLessons) return;
        var name = flowFileName(m.year, m.month, model, s.label, usedNames);
        monthNode.files.push({
          name: name,
          kind: 'monthly',
          flow: s.label,
          groups: s.groups.slice(),
          doc: function () { return SM.templateMonthly.build(view, m.year, m.month, opts); }
        });
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
      entries.push({ month: m, folder: folder, year: m.year });
    });

    return { root: rootNode, months: entries, splits: plan };
  }

  /* File name for a split monthly: the usual pattern with "_<flow>" inserted
   * before the extension, e.g. Raspisanie_M_Oktyabr_2026_Bakalavry.docx */
  function flowFileName(year, month, model, label, used) {
    var base = SM.templateMonthly.fileName(year, month, model);
    var suffix = String(label || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '_');
    if (!suffix) return base;
    var dot = base.lastIndexOf('.');
    var stem = dot > 0 ? base.slice(0, dot) : base;
    var ext = dot > 0 ? base.slice(dot) : '';
    var name = stem + '_' + suffix + ext;
    if (used) {
      var n = 2;
      while (used[name]) { name = stem + '_' + suffix + '-' + n + ext; n++; }
      used[name] = true;
    }
    return name;
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

  /* f.doc() may return a Doc synchronously or a promise for one.
   *
   * Output format note: everything here writes WordprocessingML (.docx) blobs.
   * The department's originals are binary Word 97 (.doc), which cannot be
   * produced in a browser and is deliberately not attempted - see
   * AGENTS.md. The seam for that is `opts.converter`: pass
   * { docxToDoc: async (blob, name) => blob } to swap in an external
   * converter (for example a local Word COM round-trip) without changing any
   * template. Left undefined, output stays .docx. */
  function toBlob(f, JSZipCtor, converter) {
    return Promise.resolve(f.doc())
      .then(function (d) { return d.toBlob(JSZipCtor); })
      .then(function (blob) {
        if (!converter || !converter.docxToDoc) return blob;
        return Promise.resolve(converter.docxToDoc(blob, f.name));
      });
  }
  /* Async: materialise every document and return a JSZip ready for download. */
  function buildZip(model, opts) {
    opts = opts || {};
    var JSZipCtor = global.JSZip;
    if (!JSZipCtor) return Promise.reject(new Error('JSZip is not loaded'));
    var mf = manifest(model, opts);
    var zip = new JSZipCtor();
    var conv = opts.converter;
    var jobs = [];

    /* Walk the manifest tree to any depth: root -> year -> month -> week. */
    (function emit(n, folder) {
      n.files.forEach(function (f) {
        jobs.push(toBlob(f, JSZipCtor, conv).then(function (blob) {
          folder.file(f.name, blob);
        }));
      });
      Object.keys(n.children).forEach(function (childName) {
        emit(n.children[childName], folder.folder(childName));
      });
    })(mf.root, zip.folder(mf.root.path));

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
