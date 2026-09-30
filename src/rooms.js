/* Schedule Maker - room allocation and overflow detection.
 *
 * The department owns 7 rooms. Every block (morning / afternoon / evening) of every
 * day is a separate resource pool: each concurrent lesson needs one room.
 *  - 7 rooms or fewer            -> ordinary allocation, no request needed
 *  - more than 7                 -> the surplus becomes a request in the Zayavka file
 *
 * Allocation order inside one block:
 *   1. lessons the user locked in the editor
 *   2. teachers with a fixed room (Гирфанова 104, Туркова 105, Шехватова 106,
 *      Вострокнутова 106)
 *   3. the room the teacher already had on that day (keeps a teacher's day stable)
 *   4. the teacher's preferred room, if free
 *   5. the first free room from the department priority list
 *   6. nothing free -> overflow, room becomes "8 пав."
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  function blockKey(o) { return o.date + '|' + o.block; }

  function allocate(occurrences, options) {
    options = options || {};
    var registry = options.registry;
    var rooms = options.rooms || SM.config.ROOMS;
    var capacity = options.capacity != null ? options.capacity : rooms.length;
    var overflowLabel = options.overflowLabel || SM.config.OVERFLOW_ROOM_LABEL;
    var warnings = [];

    var pools = Object.create(null);   // blockKey -> { used:{}, lessons:[] }
    occurrences.forEach(function (o) {
      var k = blockKey(o);
      var p = pools[k] || (pools[k] = { used: Object.create(null), lessons: [] });
      p.lessons.push(o);
    });

    // Teacher's room on a given day (sticky across morning/afternoon/evening).
    var dayRoom = Object.create(null);
    // How often each teacher has used each room over the whole semester, used to
    // rotate the fallback room so the seven rooms stay evenly loaded.
    var teacherUse = Object.create(null);
    occurrences.forEach(function (o) {
      var t = teacherUse[o.teacherSurname] || (teacherUse[o.teacherSurname] = Object.create(null));
      t[o.room] = (t[o.room] || 0) + 1;
    });

    // ---- pass 0: honour manual locks ------------------------------------------
    Object.keys(pools).forEach(function (k) {
      pools[k].lessons.forEach(function (o) {
        if (o.locked && o.room) pools[k].used[o.room] = true;
      });
    });

    /*
     * Placement passes. Each pass is re-run over the still unplaced lessons until no
     * further progress is made, so that every preference which CAN be satisfied at
     * the same time actually is - rather than the first teacher in the list winning
     * and pushing everyone else into overflow.
     */
    function fixedRoomOf(o) { return registry ? registry.fixedRoom(o.teacher) : null; }
    function prefRoomOf(o) {
      var p = registry ? registry.preferredRoom(o.teacher) : null;
      return p && rooms.indexOf(p) >= 0 ? p : null;
    }
    function stickyRoomOf(o) {
      var r = dayRoom[o.date + '|' + o.day + '|' + o.teacherSurname];
      return (r && rooms.indexOf(r) >= 0) ? r : null;
    }
    function leastUsedByTeacher(o, used) {
      var t = teacherUse[o.teacherSurname] || {};
      var best = null, bestN = Infinity;
      for (var i = 0; i < rooms.length; i++) {
        if (used[rooms[i]]) continue;
        var n = t[rooms[i]] || 0;
        if (n < bestN) { bestN = n; best = rooms[i]; }
      }
      return best;
    }

    var PASSES = [
      function (o, used) {
        var f = fixedRoomOf(o);
        return f && !used[f] ? f : null;
      },
      function (o, used) {
        var p = prefRoomOf(o);
        return p && !used[p] ? p : null;
      },
      function (o, used) {
        var r = stickyRoomOf(o);
        return r && !used[r] ? r : null;
      },
      leastUsedByTeacher
    ];

    function commit(o, room) {
      o.room = room;
      var p = pools[o.date + '|' + o.block];
      p.used[room] = true;
      var t = teacherUse[o.teacherSurname] || (teacherUse[o.teacherSurname] = Object.create(null));
      t[room] = (t[room] || 0) + 1;
      dayRoom[o.date + '|' + o.day + '|' + o.teacherSurname] = room;
    }

    Object.keys(pools).sort().forEach(function (k) {
      var p = pools[k];
      var pending = p.lessons.filter(function (o) { return !(o.locked && o.room); });

      PASSES.forEach(function (pass) {
        for (var round = 0; round < 8; round++) {
          var moved = false;
          var left = [];
          for (var i = 0; i < pending.length; i++) {
            var o = pending[i];
            var chosen = pass(o, p.used);
            if (chosen) { commit(o, chosen); moved = true; }
            else left.push(o);
          }
          pending = left;
          if (!moved) break;
        }
      });

      // ---- leftovers: no room left -> request an extra auditorium -------------
      pending.forEach(function (o) {
        o.room = overflowLabel;
        o.overflow = true;
      });
      if (pending.length) {
        warnings.push(U.fmtRuLong(p.lessons[0].date) + ' ' +
                      SM.config.BLOCK_BY_KEY[p.lessons[0].block].labelRu + ': ' +
                      pending.length + ' lesson(s) exceed the ' + capacity +
                      ' department rooms and need an extra auditorium');
      }
    });

    // A fixed teacher pushed out of their own room is worth reporting.
    var displaced = Object.create(null);
    occurrences.forEach(function (o) {
      var fx = registry ? registry.fixedRoom(o.teacher) : null;
      if (fx && o.room !== fx && !o.overflow) {
        var k = o.teacher + '|' + fx;
        displaced[k] = (displaced[k] || 0) + 1;
      }
    });
    Object.keys(displaced).forEach(function (k) {
      var parts = k.split('|');
      warnings.push(parts[0] + ' normally works in room ' + parts[1] + ', but ' +
                    displaced[k] + ' lesson(s) had to be moved to another room because ' +
                    parts[1] + ' was already busy');
    });

    return { warnings: warnings, dayRoom: dayRoom };
  }

  /*
   * How many extra rooms are needed per (date, block).
   * Returns { entries: [{date, block, blockLabel, needed, total, lessons:[...]}] }
   */
  function requests(occurrences, options) {
    options = options || {};
    var capacity = options.capacity != null ? options.capacity : SM.config.ROOM_CAPACITY;
    var groups = Object.create(null);
    occurrences.forEach(function (o) {
      var k = blockKey(o);
      (groups[k] || (groups[k] = [])).push(o);
    });
    var out = [];
    Object.keys(groups).sort().forEach(function (k) {
      var list = groups[k];
      var total = list.length;
      if (total <= capacity) return;
      out.push({
        date: list[0].date,
        block: list[0].block,
        blockLabel: SM.config.BLOCK_BY_KEY[list[0].block].labelRu,
        blockLabelEn: SM.config.BLOCK_BY_KEY[list[0].block].labelEn,
        needed: total - capacity,
        total: total,
        lessons: list
      });
    });
    return out;
  }

  SM.rooms = { allocate: allocate, requests: requests, blockKey: blockKey };

})(typeof window !== 'undefined' ? window : globalThis);
