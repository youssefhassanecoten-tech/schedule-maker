/* Schedule Maker - small helpers (dates, text, ids). */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});

  /* ---------- dates (all internal dates are 'YYYY-MM-DD' strings) ---------- */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function toISO(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseISO(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function addDays(iso, n) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function dayOfWeek(iso) { return parseISO(iso).getDay(); } // 0=Sun .. 6=Sat

  function isValidISO(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = parseISO(s);
    return toISO(d) === s;
  }

  /* Russian short date as used in the department documents: "28.09", "03.10." */
  function fmtRu(iso, trailingDot) {
    var p = iso.split('-');
    var s = p[2] + '.' + p[1];
    if (trailingDot) s += '.';
    return s;
  }

  function fmtRuLong(iso) {
    var p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  function fmtEn(iso) {
    var p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  /* ISO week number (Mon-based) of an ISO date, for a given known Monday.
   * week = floor(daysBetween(firstMonday, mondayOf(iso)) / 7) + 1 */
  function weekOf(iso, firstMondayISO) {
    var offset = (parseISO(iso) - parseISO(firstMondayISO)) / 86400000;
    return Math.floor(offset / 7) + 1;
  }

  function mondayOfWeek(w, firstMondayISO) {
    return addDays(firstMondayISO, (w - 1) * 7);
  }

  function clampISO(iso, minISO, maxISO) {
    return iso < minISO ? minISO : (iso > maxISO ? maxISO : iso);
  }

  /* ---------- text ---------- */

  var NBSP_MAP = {
    '\u00a0': ' ', '\u2007': ' ', '\u202f': ' ', '\u2009': ' ',
    '\u2013': '-', '\u2014': '-', '\u2212': '-'
  };

  function normalizeText(s) {
    if (!s) return '';
    var out = String(s).replace(/[\u00a0\u2007\u202f\u2009]/g, ' ');
    out = out.replace(/[\u2013\u2014\u2212]/g, '-');
    out = out.replace(/\s+/g, ' ').trim();
    return out;
  }

  /* Collapse all whitespace to single spaces (keeps case). */
  function flat(s) { return normalizeText(s); }

  /* Split a cell into logical lines, dropping empties. */
  function lines(s) {
    return String(s || '')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(function (x) { return normalizeText(x); })
      .filter(function (x) { return x.length > 0; });
  }

  /* ---------- misc ---------- */

  function unique(arr) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
    }
    return out;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Group code: leading digits + optional Cyrillic letter suffix. */
  var RE_GROUP = /^(\d{3,4})\s*([А-Яа-я]?)\.?$/;

  function normalizeGroup(raw) {
    var g = normalizeText(raw).replace(/\s+/g, '');
    var m = g.match(RE_GROUP);
    if (!m) return null;
    var suf = m[2] ? m[2].toUpperCase() : '';
    return m[1] + suf;
  }

  /* Base number without the letter suffix -> used for counter families. */
  function groupBase(group) {
    var m = String(group).match(/^(\d{3,4})/);
    return m ? m[1] : group;
  }

  function groupSuffix(group) {
    var m = String(group).match(/^(\d{3,4})([А-Яа-я]?)$/);
    return m && m[2] ? m[2].toUpperCase() : '';
  }

  /* Surname part of "Фамилия И.О." */
  function surname(full) {
    var s = normalizeText(full);
    var m = s.match(/^([^\s]+)/);
    return m ? m[1] : s;
  }

  SM.util = {
    pad2: pad2, toISO: toISO, parseISO: parseISO, addDays: addDays,
    dayOfWeek: dayOfWeek, isValidISO: isValidISO,
    fmtRu: fmtRu, fmtRuLong: fmtRuLong, fmtEn: fmtEn,
    weekOf: weekOf, mondayOfWeek: mondayOfWeek, clampISO: clampISO,
    normalizeText: normalizeText, flat: flat, lines: lines,
    unique: unique, clone: clone,
    normalizeGroup: normalizeGroup, groupBase: groupBase, groupSuffix: groupSuffix,
    surname: surname
  };

})(typeof window !== 'undefined' ? window : globalThis);
