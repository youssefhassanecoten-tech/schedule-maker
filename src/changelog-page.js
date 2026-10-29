/* Renders the bilingual "What's new" page from SM.changelog + SM.config.
 *
 *   - "Changes in this version" shows only entries of the running version
 *   - "Change history" groups everything older by major version, newest first,
 *     and keeps at most the last 7 major versions
 *   - the PDF button is intentionally inert until the full-history export exists
 */
(function (global) {
  'use strict';
  var SM = global.SM || {};

  var lang = (document.documentElement.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';
  var T = {
    ru: {
      version: 'версия',
      latest: 'Изменения этой версии',
      all: 'История изменений',
      major: function (n) { return 'Версия ' + n + '.x'; },
      historyNote: 'Показаны последние 7 крупных версий. Полная история будет доступна в PDF.',
      pdfSoon: 'Скоро: полная история в PDF',
      majorLabel: 'Крупные изменения',
      mediumLabel: 'Средние изменения',
      minorLabel: 'Мелкие изменения',
      months: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
      summary: function (v, c) {
        return 'Версия ' + v + ' — ' + c[0] + ' крупных, ' + c[1] + ' средних и ' +
          c[2] + ' мелких изменений с самого начала.';
      }
    },
    en: {
      version: 'version',
      latest: 'Changes in this version',
      all: 'Change history',
      major: function (n) { return 'Version ' + n + '.x'; },
      historyNote: 'Showing the last 7 major versions. The full history will be available as a PDF.',
      pdfSoon: 'Soon: the full history as a PDF',
      majorLabel: 'Major changes',
      mediumLabel: 'Medium changes',
      minorLabel: 'Minor changes',
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      summary: function (v, c) {
        return 'Version ' + v + ' — ' + c[0] + ' major, ' + c[1] + ' medium and ' +
          c[2] + ' minor changes since the beginning.';
      }
    }
  };
  var t = T[lang];
  var version = (SM.config && SM.config.VERSION) || '';
  var entries = ((SM.changelog && SM.changelog.entries) || []).slice();

  function vnum(v) {
    return String(v || '0.0.0').split('.').map(function (x) { return +x || 0; });
  }
  function cmp(a, b) {
    var x = vnum(a), y = vnum(b);
    for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  }
  entries.sort(function (a, b) { return cmp(a.version, b.version); });

  function levelLabel(level) {
    return level === 'major' ? t.majorLabel : level === 'medium' ? t.mediumLabel : t.minorLabel;
  }

  var counts = { major: 0, medium: 0, minor: 0 };
  entries.forEach(function (e) { counts[e.level] = (counts[e.level] || 0) + 1; });

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    if (lang === 'en') return (+p[2]) + ' ' + t.months[+p[1] - 1] + ' ' + p[0];
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  function item(e) {
    var wrap = node('div', 'cl-item');
    var top = node('div', 'cl-top');
    top.appendChild(node('span', 'cl-level ' + e.level, levelLabel(e.level)));
    top.appendChild(node('span', 'cl-date', fmtDate(e.date)));
    top.appendChild(node('span', 'cl-version', 'v' + e.version));
    if (e.commit) top.appendChild(node('span', 'cl-commit', e.commit));
    wrap.appendChild(top);
    wrap.appendChild(node('p', 'cl-text', e[lang] || ''));
    return wrap;
  }

  function list(items) {
    var box = node('div', 'cl-list');
    items.forEach(function (e) { box.appendChild(item(e)); });
    return box;
  }

  function fill(id, text) {
    var n = document.getElementById(id);
    if (n) n.textContent = text;
  }

  fill('clVersion', 'Schedule Maker · ' + t.version + ' v' + version);
  fill('clSummary', t.summary(version, [counts.major, counts.medium, counts.minor]));
  fill('clLatestTitle', t.latest);
  fill('clAllTitle', t.all);
  fill('clHistoryNote', t.historyNote);

  /* Only the entries that belong to the running version. */
  var latest = entries.filter(function (e) { return e.version === version; });
  if (!latest.length && entries.length) latest = [entries[0]];
  var latestSet = latest.slice();
  var latestHost = document.getElementById('clLatest');
  if (latestHost) latestHost.appendChild(list(latest));

  /* Everything else, grouped by major version, at most 7 major versions back. */
  var history = entries.filter(function (e) { return latestSet.indexOf(e) < 0; });
  var groups = Object.create(null);
  history.forEach(function (e) {
    var m = (e.version || '0').split('.')[0];
    (groups[m] || (groups[m] = [])).push(e);
  });
  var majors = Object.keys(groups).map(Number).sort(function (a, b) { return b - a; }).slice(0, 7);

  var all = document.getElementById('clAll');
  if (all) {
    majors.forEach(function (m) {
      var group = node('div', 'cl-group');
      group.appendChild(node('h3', null, t.major(m)));
      group.appendChild(list(groups[String(m)]));
      all.appendChild(group);
    });
  }

  var pdf = document.getElementById('clPdf');
  if (pdf) {
    pdf.title = t.pdfSoon;
    pdf.setAttribute('aria-label', t.pdfSoon);
  }
})(typeof window !== 'undefined' ? window : globalThis);
