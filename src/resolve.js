/* Schedule Maker - expand the parsed grid into concrete lesson occurrences.
 *
 * A "lesson" is one (group, date, time-block) tuple. Two sub-slots inside the same
 * block (9.00-10.30 + 10.45-12.15) belong to the same lesson, which is why the
 * counter is incremented once per block and not once per sub-slot.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var U = SM.util;

  /* Room lookups are keyed by surname so that small spelling differences in the
   * generated documents do not break the rules. */
  function TeacherRegistry(teachers) {
    this.byName = Object.create(null);
    this.bySurname = Object.create(null);
    var self = this;
    teachers.forEach(function (t) {
      var rec = { name: t.name, surname: U.surname(t.name), isVacancy: t.name === SM.config.VACANCY_RU };
      self.byName[t.name] = rec;
      if (!self.bySurname[rec.surname]) self.bySurname[rec.surname] = rec;
    });
  }
  TeacherRegistry.prototype.lookup = function (name) {
    return this.byName[name] || this.bySurname[U.surname(name)] || null;
  };
  TeacherRegistry.prototype.fixedRoom = function (name) {
    var sn = U.surname(name);
    var map = SM.config.FIXED_ROOMS;
    if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    for (var k in map) if (U.surname(k) === sn) return map[k];
    return null;
  };
  TeacherRegistry.prototype.preferredRoom = function (name) {
    var sn = U.surname(name);
    var map = SM.config.TEACHER_ROOM_PREF;
    if (Object.prototype.hasOwnProperty.call(map, name)) return map[name];
    for (var k in map) if (U.surname(k) === sn) return map[k];
    return null;
  };

  /*
   * build(grid, options) ->
   *   { occurrences:[], warnings:[], registry }
   *
   * grid: result of docxRead.readDocx  ({title, teachers:[{name, cells[]}]})
   */
  function build(grid, options) {
    options = options || {};
    var sem = options.semester || SM.config.semester;
    var warnings = [];
    var occurrences = [];
    var seen = Object.create(null);

    var registry = new TeacherRegistry(grid.teachers.map(function (t) { return { name: t.name }; }));
    warnings = warnings.concat(grid.warnings || []);

    grid.teachers.forEach(function (row) {
      var parsed = SM.cellparse.parseRow(row.name, row.cells, row.name + ' |');
      warnings = warnings.concat(parsed.warnings);

      parsed.entries.forEach(function (e) {
        var slot = SM.config.SLOTS[e.slot];
        var spec = e.specText ? SM.spec.parseSpec(e.specText, sem) : null;

        if (spec && spec.kind === 'unparsed') {
          warnings.push(row.name + ' / ' + SM.config.DAYS_RU[slot.day] + ' ' +
                        SM.config.BLOCK_BY_KEY[slot.block].labelRu +
                        ': could not read specification "(' + spec.text + ')" for group ' + e.group);
          return;
        }
        if (spec && spec.kind === 'note') return;
        if (spec && spec.kind === 'dates' && spec.unresolved && spec.unresolved.length) {
          warnings.push(row.name + ' / group ' + e.group + ': date(s) "' + spec.unresolved.join(', ') +
                        '" fall outside the semester and were skipped');
        }

        var dates = SM.spec.expand(spec, slot.day, sem);
        if (!dates.length) {
          warnings.push(row.name + ' / group ' + e.group + ': specification "(' +
                        (e.specText || '') + ')" produced no dates');
          return;
        }

        dates.forEach(function (iso) {
          var key = [e.teacher, slot.idx, iso, e.group].join('|');
          if (seen[key]) return;
          seen[key] = 1;
          occurrences.push({
            id: key,
            teacher: e.teacher,
            teacherSurname: U.surname(e.teacher),
            group: e.group,
            groupBase: U.groupBase(e.group),
            groupSuffix: U.groupSuffix(e.group),
            slot: slot.idx,
            day: slot.day,
            block: slot.block,
            date: iso,
            week: U.weekOf(iso, sem.firstMonday),
            specText: e.specText,
            notes: e.notes.slice(),
            room: null,
            overflow: false,
            locked: false
          });
        });
      });
    });

    // Deterministic order: date, then slot index, then teacher, then group.
    occurrences.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.slot !== b.slot) return a.slot - b.slot;
      if (a.teacher !== b.teacher) return a.teacher < b.teacher ? -1 : 1;
      return a.group < b.group ? -1 : a.group > b.group ? 1 : 0;
    });

    detectConflicts(occurrences, warnings);
    return { occurrences: occurrences, warnings: warnings, registry: registry, semester: sem };
  }

  /* Same group twice in the same block, or same teacher twice in the same block. */
  function detectConflicts(occ, warnings) {
    var byGroup = Object.create(null), byTeacher = Object.create(null);
    occ.forEach(function (o) {
      var gk = [o.group, o.date, o.block].join('|');
      if (byGroup[gk]) {
        warnings.push('Group ' + o.group + ' has two lessons on ' + U.fmtRuLong(o.date) + ' ' +
                      SM.config.BLOCK_BY_KEY[o.block].labelRu + ' (' + byGroup[gk].teacher + ' and ' + o.teacher + ')');
      } else byGroup[gk] = o;

      var tk = [o.teacher, o.date, o.slot].join('|');
      if (byTeacher[tk]) {
        warnings.push(o.teacher + ' is booked twice on ' + U.fmtRuLong(o.date) + ' ' +
                      SM.config.BLOCK_BY_KEY[o.block].labelRu + ' (' +
                      byTeacher[tk].group + ' and ' + o.group + ')');
      } else byTeacher[tk] = o;
    });
  }

  SM.resolve = { build: build, TeacherRegistry: TeacherRegistry, detectConflicts: detectConflicts };

})(typeof window !== 'undefined' ? window : globalThis);
