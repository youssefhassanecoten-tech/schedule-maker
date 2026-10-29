/* Renders the bilingual "What's new" page from SM.changelog + SM.config.
 * The page language comes from <html lang="ru|en">. */
(function (global) {
  'use strict';
  var SM = global.SM || {};

  var lang = (document.documentElement.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';
  var T = {
    ru: {
      version: 'версия',
      latest: 'Последние изменения',
      all: 'Вся история изменений',
      major: 'Крупные изменения',
      medium: 'Средние изменения',
      minor: 'Мелкие изменения',
      months: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
      summary: function (v, c) {
        return 'Версия ' + v + ' — ' + c[0] + ' крупных, ' + c[1] + ' средних и ' +
          c[2] + ' мелких изменений с самого начала.';
      }
    },
    en: {
      version: 'version',
      latest: 'Latest changes',
      all: 'Full history',
      major: 'Major changes',
      medium: 'Medium changes',
      minor: 'Minor changes',
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      summary: function (v, c) {
        return 'Version ' + v + ' — ' + c[0] + ' major, ' + c[1] + ' medium and ' +
          c[2] + ' minor changes since the beginning.';
      }
    }
  };
  var t = T[lang];
  var entries = (SM.changelog && SM.changelog.entries) || [];
  var version = (SM.config && SM.config.VERSION) || '';
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
    top.appendChild(node('span', 'cl-level ' + e.level, t[e.level]));
    top.appendChild(node('span', 'cl-date', fmtDate(e.date)));
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

  var latest = document.getElementById('clLatest');
  if (latest) latest.appendChild(list(entries.slice(0, 4)));

  var all = document.getElementById('clAll');
  if (all) {
    ['major', 'medium', 'minor'].forEach(function (level) {
      var items = entries.filter(function (e) { return e.level === level; });
      if (!items.length) return;
      var group = node('div', 'cl-group');
      group.appendChild(node('h3', null, t[level] + ' (' + items.length + ')'));
      group.appendChild(list(items));
      all.appendChild(group);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
