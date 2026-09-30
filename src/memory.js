/* Schedule Maker - session memory.
 *
 * Two jobs:
 *   1. Restore the uploaded .docx after a refresh, so the department does not
 *      re-upload the same file every session.
 *   2. Keep a rolling history of up to 10 saved runs the user can reopen,
 *      rename or delete.
 *
 * Storage is IndexedDB, not localStorage: the source grid is a whole .docx
 * (hundreds of KB) and localStorage caps out around 5 MB for everything, which
 * ten of them would blow through. Everything degrades to in-memory only if
 * IndexedDB is unavailable (private mode), so the app still works.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});

  var DB_NAME = 'schedule-maker';
  var DB_VERSION = 1;
  var STORE = 'runs';
  var MAX_RUNS = 10;

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('savedAt', 'savedAt');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
    }).catch(function (err) { dbPromise = null; throw err; });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var os = t.objectStore(STORE);
        var out;
        try { out = fn(os); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('aborted')); };
      });
    });
  }

  function id() {
    return 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* Insert or update, then trim to MAX_RUNS newest. */
  function save(run) {
    run.id = run.id || id();
    run.savedAt = run.savedAt || Date.now();
    return tx('readwrite', function (os) {
      os.put(run);
      return tx('readwrite', function (os2) {
        var all = [];
        os2.openCursor().onsuccess = function (e) {
          var c = e.target.result;
          if (c) { all.push({ id: c.value.id, savedAt: c.value.savedAt }); c.continue(); return; }
          all.sort(function (a, b) { return b.savedAt - a.savedAt; });
          all.slice(MAX_RUNS).forEach(function (old) { os2.delete(old.id); });
        };
      });
    }).then(function () { return run.id; });
  }

  function list() {
    return tx('readonly', function (os) {
      var out = [];
      os.openCursor().onsuccess = function (e) {
        var c = e.target.result;
        if (c) { out.push(c.value); c.continue(); }
      };
      return out;
    }).then(function (rows) {
      rows.sort(function (a, b) { return b.savedAt - a.savedAt; });
      return rows;
    });
  }

  function get(runId) {
    return tx('readonly', function (os) { return os.get(runId); });
  }

  function remove(runId) {
    return tx('readwrite', function (os) { os.delete(runId); });
  }

  function clear() {
    return tx('readwrite', function (os) { os.clear(); });
  }

  /* The most recent run, used to restore the session on load. */
  function latest() {
    return list().then(function (rows) { return rows.length ? rows[0] : null; });
  }

  SM.memory = {
    MAX_RUNS: MAX_RUNS,
    save: save, list: list, get: get,
    remove: remove, clear: clear, latest: latest
  };

})(typeof window !== 'undefined' ? window : globalThis);
