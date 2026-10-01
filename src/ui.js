/* Schedule Maker - user interface.
 * Classic script, no framework, no build step. Everything runs in the browser.
 */
(function (global) {
  'use strict';
  var SM = global.SM;
  var U = SM.util, C = SM.config, I = SM.i18n;
  var t = function (k) { return I.t(k); };

  var state = {
    lang: 'ru',
    theme: 'light',
    grid: null,
    model: null,
    tab: 'calendar',
    week: 1,
    docLang: 'ru',
    pageSize: 'A3',
    highlight: true,
    warnFilter: 'all',
    groupFilter: '',
    groupSort: 'name',
    semester: JSON.parse(JSON.stringify(C.semester)),
    rooms: C.ROOMS.slice(),
    files: { weekly: C.files.weekly, monthly: 'Raspisanie_M_{month}_{year}.docx', zayavka: C.files.zayavka },
    rootFolder: C.output.rootFolder,
    weekFolderPrefix: C.output.weekFolderPrefix,
    generated: null
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (k) { if (k) n.appendChild(k); });
    return n;
  }

  function toast(msg, kind) {
    var host = $('#toastHost');
    var n = el('div', { class: 'toast' + (kind ? ' is-' + kind : ''), text: msg });
    host.appendChild(n);
    setTimeout(function () {
      n.style.transition = 'opacity .3s, transform .3s';
      n.style.opacity = '0'; n.style.transform = 'translateX(14px)';
      setTimeout(function () { n.remove(); }, 320);
    }, kind === 'error' ? 7000 : 3600);
  }

  /* ------------------------------------------------------------ settings */

  var LS_KEY = 'schedule-maker-settings-v1';
  function saveSettings() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        lang: state.lang, theme: state.theme, semester: state.semester,
        rooms: state.rooms, files: state.files, rootFolder: state.rootFolder,
        weekFolderPrefix: state.weekFolderPrefix, docLang: state.docLang,
        pageSize: state.pageSize, highlight: state.highlight,
        fixed: C.FIXED_ROOMS, pref: C.TEACHER_ROOM_PREF
      }));
    } catch (e) { /* private mode - ignore */ }
  }
  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!s) return;
      ['lang', 'theme', 'docLang', 'pageSize', 'highlight', 'rootFolder', 'weekFolderPrefix'].forEach(function (k) {
        if (s[k] !== undefined && s[k] !== null) state[k] = s[k];
      });
      if (s.semester) state.semester = s.semester;
      if (Array.isArray(s.rooms) && s.rooms.length) state.rooms = s.rooms;
      if (s.files) state.files = Object.assign(state.files, s.files);
      if (s.fixed) C.FIXED_ROOMS = s.fixed;
      if (s.pref) C.TEACHER_ROOM_PREF = s.pref;
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ loading */

  function loadFile(file) {
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      toast(t('errBadFile'), 'error');
      return;
    }
    var dz = $('#dropzone');
    renderBusy(file.name);

    var reader = new FileReader();
    reader.onerror = function () { toast(t('errBadFile'), 'error'); renderUpload(); };
    reader.onload = function () {
      SM.docxRead.readDocx(reader.result)
        .then(function (grid) {
          state.grid = grid;
          rebuildModel();
          state.week = pickStartWeek();
          $('#uploadSection').hidden = true;
          $('#workSection').hidden = false;
          renderAll();
          toast(t('saved') + ': ' + file.name, 'ok');
        })
        .catch(function (err) {
          console.error(err);
          toast(t('errBadFile') + ' — ' + err.message, 'error');
          renderUpload();
        });
    };
    reader.readAsArrayBuffer(file);
  }

  function pickStartWeek() {
    if (!state.model) return 1;
    var today = U.toISO(new Date());
    var w = U.weekOf(today, state.semester.firstMonday);
    if (w < 1 || w > state.semester.weeks) return 1;
    return w;
  }

  function rebuildModel() {
    if (!state.grid) return;
    state.model = SM.model.createModel(state.grid, {
      semester: state.semester,
      files: state.files
    });
  }

  function recompute(keepWeek) {
    if (!state.model) return;
    SM.model.recompute(state.model);
    if (keepWeek) state.week = keepWeek;
    renderAll();
  }

  /* ------------------------------------------------------------ tabs */

  var TABS = [
    { id: 'calendar', label: 'tabsCalendar' },
    { id: 'rooms', label: 'tabsRooms' },
    { id: 'counters', label: 'groupCounter' },
    { id: 'requests', label: 'overflow' },
    { id: 'warnings', label: 'warnings', badge: true },
    { id: 'files', label: 'tabsFiles' },
    { id: 'settings', label: 'tabsSettings' }
  ];

  function renderTabs() {
    var host = $('#tabs');
    host.innerHTML = '';
    TABS.forEach(function (tab) {
      var b = el('button', {
        class: 'tab', role: 'tab', type: 'button',
        'aria-selected': String(state.tab === tab.id),
        onclick: function () { state.tab = tab.id; renderAll(); }
      }, [document.createTextNode(t(tab.label))]);
      if (tab.badge && state.model) {
        var n = countWarnings();
        if (n) {
          b.appendChild(el('span', {
            class: 'badge' + (n > 0 ? (hasConflict() ? ' is-danger' : ' is-warn') : ''),
            text: String(n)
          }));
        }
      }
      host.appendChild(b);
    });
    TABS.forEach(function (tab) {
      $('#panel-' + tab.id).classList.toggle('is-active', state.tab === tab.id);
    });
  }

  /* ------------------------------------------------------------ stats */

  function renderStats() {
    var m = state.model, host = $('#stats');
    host.innerHTML = '';
    if (!m) return;
    var cards = [
      { label: t('lessons'), value: m.stats.lessons, hint: state.grid ? m.teachers.length + ' × ' + t('teacher').toLowerCase() : '' },
      { label: t('groups'), value: m.stats.groups },
      { label: t('maxTopic'), value: m.stats.maxTopic },
      { label: t('weeks'), value: m.stats.weeks },
      {
        label: t('extraRooms'), value: m.stats.extraRooms,
        cls: m.stats.extraRooms ? 'is-warn' : 'is-ok',
        hint: m.stats.overflowSlots + ' × ' + t('overflow').toLowerCase()
      }    ];
    cards.forEach(function (c) {
      host.appendChild(el('div', { class: 'stat' + (c.cls ? ' ' + c.cls : '') }, [
        el('div', { class: 'stat-label', text: c.label }),
        el('div', { class: 'stat-value', text: String(c.value) }),
        c.hint ? el('div', { class: 'stat-hint', text: c.hint }) : null
      ]));
    });
  }

  /* ------------------------------------------------------------ week picker */

  function renderWeekPickers() {
    var m = state.model;
    var weeks = [];
    for (var w = 1; w <= m.semester.weeks; w++) {
      var mon = U.mondayOfWeek(w, m.semester.firstMonday);
      var n = (m.byWeek[w] || []).length;
      weeks.push({ w: w, mon: mon, sat: U.addDays(mon, 5), n: n });
    }

    [['#weekSel', function () { return state.week; }, function (v) { state.week = v; state.tab = 'calendar'; renderAll(); }],
     ['#roomsWeekSel', function () { return state.week; }, function (v) { state.week = v; renderAll(); }]
    ].forEach(function (cfg) {
      var sel = $(cfg[0]);
      sel.innerHTML = '';
      weeks.forEach(function (x) {
        sel.appendChild(el('option', {
          value: x.w, selected: cfg[1]() === x.w,
          text: x.w + 'н · ' + U.fmtRu(x.mon) + '–' + U.fmtRu(x.sat) + (x.n ? '  (' + x.n + ')' : '')
        }));
      });
      sel.onchange = function () { cfg[2](parseInt(sel.value, 10)); };
    });

    var msel = $('#monthSel');
    msel.innerHTML = '';
    msel.appendChild(el('option', { value: '', text: t('allMonths') }));
    SM.model.activeMonths(m).forEach(function (mm) {
      msel.appendChild(el('option', {
        value: mm.year + '-' + (mm.month + 1),
        text: SM.monthNameEn[mm.month] + ' ' + mm.year
      }));
    });
    msel.onchange = function () {
      if (!msel.value) { state.tab = 'calendar'; renderAll(); return; }
      var p = msel.value.split('-');
      var year = +p[0], month = +p[1] - 1;
      var ws = SM.model.weeksInMonth(m, year, month);
      if (ws.length) state.week = ws[0];
      renderAll();
    };
  }

  /* ------------------------------------------------------------ week grid */

  function renderWeekGrid() {
    var m = state.model, table = $('#weekGrid');
    table.innerHTML = '';
    if (!m) return;
    var occ = m.byWeek[state.week] || [];
    var byTeacher = Object.create(null);
    occ.forEach(function (o) { (byTeacher[o.teacher] || (byTeacher[o.teacher] = [])).push(o); });
    var weekLessons = Object.create(null);
    occ.forEach(function (o) { weekLessons[o.id] = o; });

    var mon = U.mondayOfWeek(state.week, m.semester.firstMonday);
    var sat = U.addDays(mon, 5);

    // day header row
    var dayRow = el('tr', { class: 'dayrow' });
    dayRow.appendChild(el('th', { class: 'corner', rowspan: 2, text: t('teacher') }));
    var dayGroups = [];
    C.SLOTS.forEach(function (s) {
      var g = dayGroups[dayGroups.length - 1];
      if (!g || g.day !== s.day) { g = { day: s.day, n: 0 }; dayGroups.push(g); }
      g.n++;
    });
    dayGroups.forEach(function (g) {
      var name = state.lang === 'en' ? C.DAYS_EN[g.day] : C.DAYS_RU[g.day];
      dayRow.appendChild(el('th', { colspan: g.n, text: name + ' · ' + U.fmtRu(U.addDays(mon, g.day)) }));
    });
    table.appendChild(el('thead', {}, [dayRow, timeRow(weekLessons, mon)]));

    // teacher rows
    var tbody = el('tbody');
    m.teachers.forEach(function (teacher) {
      var row = el('tr');
      row.appendChild(el('td', { class: 'teacher', text: teacher.name }));
      C.SLOTS.forEach(function (slot) {
        var o = byTeacher[teacher.name] && byTeacher[teacher.name].filter(function (x) { return x.slot === slot.idx; })[0];
        row.appendChild(el('td', { class: 'cell' }, [o ? lessonCell(o) : null]));
      });
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    function timeRow(lookup, monISO) {
      var tr = el('tr', { class: 'timerow' });
      tr.appendChild(el('th', { class: 'corner' }));
      C.SLOTS.forEach(function (slot) {
        var b = C.BLOCK_BY_KEY[slot.block];
        tr.appendChild(el('th', { text: state.lang === 'en' ? b.labelEn : b.labelRu }));
      });
      return tr;
    }
  }

  function lessonCell(o) {
    var box = el('div', {
      class: 'cellbox' + (o.overflow ? ' is-overflow' : '') +
             (o.locked ? ' is-locked' : '') + (o.notes && o.notes.length ? ' is-note' : ''),
      title: (o.teacher + ' · ' + U.fmtRuLong(o.date) + ' · ' +
              C.BLOCK_BY_KEY[o.block].labelRu + (o.notes.length ? '  (' + o.notes.join('; ') + ')' : ''))
    }, [
      el('div', { class: 'g', text: o.group }),
      el('div', { class: 't', text: '#' + o.topic })
    ]);
    box.appendChild(roomSelect(o));
    return box;
  }

  /*
   * The select always shows the room that is currently in effect, so the effect of the
   * automatic allocation is visible. Picking a different room pins that lesson; picking
   * "auto" releases the pin and lets the algorithm decide again.
   */
  function roomSelect(o) {
    var sel = el('select', {
      class: 'room-edit' + (o.locked ? ' is-locked' : ''),
      title: o.locked ? t('locked') + ' · ' + t('auto') : t('auto')
    });
    sel.appendChild(el('option', { value: '', text: t('auto') }));
    state.rooms.forEach(function (r) {
      sel.appendChild(el('option', { value: r, text: r }));
    });
    if (o.overflow) {
      sel.appendChild(el('option', { value: C.OVERFLOW_ROOM_LABEL, text: C.OVERFLOW_ROOM_LABEL }));
    }
    sel.value = o.room || '';
    sel.onchange = function () {
      var v = sel.value;
      if (!v) { o.locked = false; o.room = null; }
      else { o.locked = true; o.room = v; }
      recompute(state.week);
    };
    return sel;
  }

  /* ------------------------------------------------------------ rooms view */

  function renderRooms() {
    var m = state.model, host = $('#roomsList');
    host.innerHTML = '';
    if (!m) return;
    var occ = m.byWeek[state.week] || [];
    var byDate = Object.create(null);
    occ.forEach(function (o) { (byDate[o.date] || (byDate[o.date] = [])).push(o); });
    var dates = Object.keys(byDate).sort();

    var totalOverflow = 0;
    dates.forEach(function (d) { totalOverflow += (m.requestsByWeek[state.week] || []).filter(function (r) { return r.date === d; }).reduce(function (a, r) { return a + r.needed; }, 0); });
    var sum = $('#roomsSummary');
    sum.textContent = totalOverflow
      ? t('extraRooms') + ': ' + totalOverflow
      : t('noOverflow');
    sum.className = 'pill ' + (totalOverflow ? 'is-warn' : 'is-ok');

    if (!dates.length) {
      host.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'big', text: '○' }),
        el('div', { text: t('noLessons') })
      ]));
      return;
    }

    dates.forEach(function (date) {
      var list = byDate[date];
      var dow = U.dayOfWeek(date);
      var req = (m.requestsByWeek[state.week] || []).filter(function (r) { return r.date === date; });
      var card = el('div', { class: 'dayblock' });
      card.appendChild(el('header', {}, [
        el('span', { text: (state.lang === 'en' ? C.DAYS_EN[dow] : C.DAYS_RU[dow]) + ' · ' + U.fmtRu(date) + '.' + date.slice(0, 4) }),
        el('span', { class: 'spacer' }),
        req.length
          ? el('span', { class: 'pill is-warn', text: t('overflow') + ': ' + req.reduce(function (a, r) { return a + r.needed; }, 0) })
          : el('span', { class: 'pill is-ok', text: t('noOverflow') })
      ]));

      ['M', 'A', 'E'].forEach(function (b) {
        var sub = list.filter(function (o) { return o.block === b; });
        if (!sub.length) return;
        var blk = C.BLOCK_BY_KEY[b];
        var used = {};
        sub.forEach(function (o) { if (!o.overflow) used[o.room] = (used[o.room] || 0) + 1; });
        var row = el('div', { class: 'blockrow' }, [
          el('span', { class: 'btime', text: state.lang === 'en' ? blk.labelEn : blk.labelRu }),
          el('span', {
            class: 'pill ' + (sub.some(function (o) { return o.overflow; }) ? 'is-warn' : 'is-accent'),
            text: sub.length + ' / ' + state.rooms.length
          }),
          el('span', { class: 'pill', text: Object.keys(used).sort().map(function (r) { return r + '×' + used[r]; }).join('  ') })
        ]);
        var chips = el('div', { class: 'lessonchips' });
        sub.forEach(function (o) {
          var sel = el('select', { class: 'roomsel' });
          sel.appendChild(el('option', { value: '', text: '· ' + t('auto') }));
          state.rooms.forEach(function (r) { sel.appendChild(el('option', { value: r, text: r })); });
          if (o.overflow) sel.appendChild(el('option', { value: C.OVERFLOW_ROOM_LABEL, text: C.OVERFLOW_ROOM_LABEL }));
          sel.value = o.room || '';
          sel.onchange = function () {
            if (!sel.value) { o.locked = false; o.room = null; } else { o.locked = true; o.room = sel.value; }
            recompute(state.week);
          };
          chips.appendChild(el('span', {
            class: 'chip' + (o.overflow ? ' is-overflow' : ''),
            title: o.teacher + (o.notes && o.notes.length ? ' · ' + o.notes.join('; ') : '')
          }, [
            el('span', { class: 'g', text: o.group }),
            el('span', { class: 'tp', text: '#' + o.topic }),
            el('span', { text: o.teacher.split(' ')[0] }),
            sel,
            el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button',
              title: t('delLesson'),
              onclick: function () {
                var i = state.model.occurrences.indexOf(o);
                if (i >= 0) state.model.occurrences.splice(i, 1);
                recompute(state.week);
              }
            }, [document.createTextNode('✕')])
          ]));
        });
        row.appendChild(chips);
        card.appendChild(row);
      });
      host.appendChild(card);
    });
  }

  /* ------------------------------------------------------------ counters */

  function renderCounters() {
    var m = state.model, table = $('#countersTable');
    table.innerHTML = '';
    if (!m) return;
    var byGroup = Object.create(null);
    m.occurrences.forEach(function (o) {
      var g = byGroup[o.group] || (byGroup[o.group] = []);
      g.push(o);
    });
    var rows = Object.keys(byGroup).map(function (g) {
      var list = byGroup[g].slice().sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : a.slot - b.slot;
      });
      var teachers = U.unique(list.map(function (o) { return o.teacher; }));
      return {
        group: g, base: U.groupBase(g), suffix: U.groupSuffix(g),
        n: list.length, first: list[0].topic, last: list[list.length - 1].topic,
        start: list[0].counterStart || 1,
        inherited: list[0].counterStart > 1,
        teachers: teachers
      };
    });

    var f = state.groupFilter.trim().toLowerCase();
    if (f) rows = rows.filter(function (r) { return r.group.toLowerCase().indexOf(f) >= 0; });
    rows.sort(function (a, b) {
      if (state.groupSort === 'lessons') return b.n - a.n || a.group.localeCompare(b.group);
      if (state.groupSort === 'last') return b.last - a.last || a.group.localeCompare(b.group);
      return a.base.localeCompare(b.base) || a.suffix.localeCompare(b.suffix);
    });

    table.appendChild(el('thead', {}, [el('tr', {}, [
      el('th', { text: t('group') }),
      el('th', { text: t('lessons') }),
      el('th', { text: '#1' }),
      el('th', { text: '#' + (m.stats.maxTopic) }),
      el('th', { text: t('startAt') }),
      el('th', { text: t('teacher') })
    ])]));
    var tb = el('tbody');
    rows.forEach(function (r) {
      tb.appendChild(el('tr', {}, [
        el('td', {}, [
          el('strong', { text: r.group }),
          r.inherited ? el('span', { class: 'pill is-accent', style: 'margin-left:6px', text: '←' + r.base }) : null
        ]),
        el('td', { class: 'num', text: String(r.n) }),
        el('td', { class: 'num', text: String(r.first) }),
        el('td', { class: 'num', text: String(r.last) }),
        el('td', { class: 'num', text: String(r.start) }),
        el('td', { class: 'fmeta', text: r.teachers.join(', ') })
      ]));
    });
    table.appendChild(tb);
    if (!rows.length) {
      table.appendChild(el('tbody', {}, [el('tr', {}, [el('td', { colspan: 6, class: 'empty', text: '—' })])]));
    }
  }

  /* ------------------------------------------------------------ requests */

  function renderRequests() {
    var m = state.model, host = $('#requestsList');
    host.innerHTML = '';
    if (!m) return;
    if (!m.requests.length) {
      host.appendChild(el('div', { class: 'empty' }, [
        el('div', { class: 'big', text: '✓' }),
        el('div', { text: t('noOverflow') })
      ]));
      return;
    }
    var byWeek = Object.create(null);
    m.requests.forEach(function (r) {
      var w = U.weekOf(r.date, m.semester.firstMonday);
      (byWeek[w] || (byWeek[w] = [])).push(r);
    });
    Object.keys(byWeek).map(Number).sort(function (a, b) { return a - b; }).forEach(function (w) {
      var list = byWeek[w];
      var mon = U.mondayOfWeek(w, m.semester.firstMonday);
      var card = el('div', { class: 'dayblock' });
      card.appendChild(el('header', {}, [
        el('span', { text: t('week') + ' ' + w + 'н · ' + U.fmtRu(mon) + '–' + U.fmtRu(U.addDays(mon, 5)) }),
        el('span', { class: 'spacer' }),
        el('span', { class: 'pill is-warn', text: t('extraRooms') + ': ' + list.reduce(function (a, r) { return a + r.needed; }, 0) }),
        el('button', {
          class: 'btn btn-sm', type: 'button', text: t('tabsPreview'),
          onclick: function () {
            state.week = w; state.tab = 'files'; renderAll();
            SM.templateZayavka.build(list, { lang: state.docLang })
              .toBlob(global.JSZip)
              .then(function (b) { downloadBlob(b, SM.templateZayavka.fileName(m)); });
          }
        })
      ]));
      list.forEach(function (r) {
        var dow = U.dayOfWeek(r.date);
        card.appendChild(el('div', { class: 'blockrow' }, [
          el('span', { class: 'btime', text: U.fmtRu(r.date) }),
          el('span', { class: 'pill', text: (state.lang === 'en' ? C.DAYS_EN[dow] : C.DAYS_RU[dow]) }),
          el('span', { text: r.blockLabel }),
          el('span', { class: 'spacer' }),
          el('span', { class: 'pill', text: t('total') + ': ' + r.total }),
          el('span', { class: 'pill is-danger', text: t('needed') + ': ' + r.needed })
        ]));
      });
      host.appendChild(card);
    });
  }

  /* ------------------------------------------------------------ warnings */

  function classify(w) {
    if (/has two lessons|booked twice|orphaned/.test(w)) return 'conflict';
    if (/exceed the|normally works in room/.test(w)) return 'rooms';
    return 'parse';
  }
  function allWarnings() { return (state.model && state.model.warnings) || []; }
  function countWarnings() { return allWarnings().length; }
  function hasConflict() { return allWarnings().some(function (w) { return classify(w) === 'conflict'; }); }

  function renderWarnings() {
    var host = $('#warnList');
    host.innerHTML = '';
    var list = allWarnings().filter(function (w) {
      return state.warnFilter === 'all' || classify(w) === state.warnFilter;
    });
    if (!list.length) {
      host.appendChild(el('li', { class: 'empty', text: t('noWarnings') }));
      return;
    }
    var counts = { conflict: 0, rooms: 0, parse: 0 };
    list.forEach(function (w) { counts[classify(w)]++; });
    list.sort(function (a, b) {
      var rank = { conflict: 0, parse: 1, rooms: 2 };
      return rank[classify(a)] - rank[classify(b)];
    }).forEach(function (w) {
      var k = classify(w);
      host.appendChild(el('li', {}, [
        el('span', {
          class: 'pill ' + (k === 'conflict' ? 'is-danger' : k === 'rooms' ? 'is-warn' : 'is-accent'),
          text: t(k === 'conflict' ? 'wConflict' : k === 'rooms' ? 'wRooms' : 'wParse')
        }),
        el('span', { text: w })
      ]));
    });
  }

  /* ------------------------------------------------------------ files */

  function genOpts() {
    return {
      lang: state.docLang,
      highlightOverflow: state.highlight,
      pageSize: state.pageSize,
      rootFolder: state.rootFolder,
      weekFolderPrefix: state.weekFolderPrefix,
      months: SM.model.activeMonths(state.model)
    };
  }

  function renderFiles() {
    var host = $('#filesSummary');
    host.innerHTML = '';
    if (!state.model) return;
    var list = SM.package.flatList(state.model, genOpts());
    var counts = { weekly: 0, monthly: 0, zayavka: 0 };
    list.forEach(function (f) { counts[f.kind]++; });
    host.appendChild(el('div', { class: 'stats' }, [
      statCard(t('weeklyFiles'), counts.weekly, 'is-ok'),
      statCard(t('monthlyFiles'), counts.monthly, 'is-ok'),
      statCard(t('zayavkaFiles'), counts.zayavka, counts.zayavka ? 'is-warn' : 'is-ok')
    ]));

    var tree = $('#fileTree');
    tree.textContent = renderTree(list, state.rootFolder + '/');
  }

  function statCard(label, value, cls) {
    return el('div', { class: 'stat' + (cls ? ' ' + cls : '') }, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value', text: String(value) })
    ]);
  }

  function renderTree(list, root) {
    var rootNode = { children: {}, files: [] };
    list.forEach(function (f) {
      var rel = f.path.slice(root.length);
      var parts = rel.split('/');
      var node = rootNode;
      parts.forEach(function (p, i) {
        if (i === parts.length - 1) node.files.push(p);
        else node.children[p] = node.children[p] || { children: {}, files: [] }, node = node.children[p];
      });
    });
    var out = [root];
    (function walk(node, indent, path) {
      Object.keys(node.children).sort().forEach(function (name) {
        out.push(indent + '├─ ' + name + '/');
        walk(node.children[name], indent + '│  ', path + name + '/');
      });
      node.files.sort().forEach(function (f) {
        out.push(indent + '└─ ' + f);
      });
    })(rootNode, '', '');
    return out.join('\n');
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function generateAll() {
    var btn = $('#generateBtn');
    btn.disabled = true;
    var label = btn.textContent;
    btn.innerHTML = '';
    btn.appendChild(el('span', { class: 'spinner' }));
    btn.appendChild(document.createTextNode(' ' + t('generating')));

    SM.package.buildZip(state.model, genOpts())
      .then(function (res) {
        state.generated = res;
        btn.disabled = false;
        btn.textContent = label;
        return res.zip.generateAsync({ type: 'blob' });
      })
      .then(function (blob) {
        downloadBlob(blob, state.rootFolder + '.zip');
        toast(t('filesReady') + ': ' + res_count(), 'ok');
      })
      .catch(function (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = label;
        toast(String(err && err.message || err), 'error');
      });

    function res_count() { return state.generated ? state.generated.count : 0; }
  }

  /* ------------------------------------------------------------ settings UI */

  function renderSettings() {
    $('#semStart').value = state.semester.firstMonday;
    $('#semWeeks').value = state.semester.weeks;
    $('#roomsList').value = state.rooms.join(', ');
    $('#rootFolder').value = state.rootFolder;
    $('#patWeekly').value = state.files.weekly;
    $('#patMonthly').value = state.files.monthly;
    $('#patZayavka').value = state.files.zayavka;

    var fixed = $('#fixedRooms');
    fixed.innerHTML = '';
    Object.keys(C.FIXED_ROOMS).forEach(function (name) {
      fixed.appendChild(roomField(name, C.FIXED_ROOMS[name], function (v) {
        if (v) C.FIXED_ROOMS[name] = v; else delete C.FIXED_ROOMS[name];
        saveSettings();
      }));
    });
    var pref = $('#prefRooms');
    pref.innerHTML = '';
    Object.keys(C.TEACHER_ROOM_PREF).forEach(function (name) {
      pref.appendChild(roomField(name, C.TEACHER_ROOM_PREF[name], function (v) {
        if (v) C.TEACHER_ROOM_PREF[name] = v; else delete C.TEACHER_ROOM_PREF[name];
        saveSettings();
        recompute(state.week);
      }));
    });

    var m = state.model;
    var about = $('#aboutList');
    about.innerHTML = '';
    [['Source', state.fileName || '—'],
     ['Teachers', m ? m.teachers.length : 0],
     ['Weeks', m ? m.semester.weeks : 0],
     ['Lessons', m ? m.stats.lessons : 0],
     ['Groups', m ? m.stats.groups : 0],
     ['Rooms', state.rooms.length]
    ].forEach(function (kv) {
      about.appendChild(el('dt', { text: kv[0] }));
      about.appendChild(el('dd', { text: String(kv[1]) }));
    });
  }

  function roomField(name, value, onChange) {
    var sel = el('select', {
      onchange: function () { onChange(sel.value); }
    });
    sel.appendChild(el('option', { value: '', text: '—' }));
    state.rooms.forEach(function (r) {
      sel.appendChild(el('option', { value: r, text: r, selected: value === r }));
    });
    if (value && state.rooms.indexOf(value) < 0) {
      sel.appendChild(el('option', { value: value, text: value, selected: true }));
    }
    return el('div', { class: 'field' }, [el('label', { text: name }), sel]);
  }

  /* ------------------------------------------------------------ chrome */

  function applyLang() {
    document.documentElement.lang = state.lang;
    I.set(state.lang);
    // The drop zone is rebuilt from scratch, so it must be refreshed rather than
    // relabelled element by element.
    renderUpload();
    var brandMark = $('#brandMark');
    if (brandMark) {
      brandMark.textContent = '';
      brandMark.style.background = 'none';
      brandMark.style.boxShadow = 'none';
      brandMark.appendChild(el('img', { src: 'assets/icon-192.png', alt: '', width: '38', height: '38' }));
    }
    $('#brandTitle').textContent = t('appTitle');
    $('#brandSub').textContent = t('appSubtitle');
    $('#newFileBtn').textContent = t('newFile');
    $('#lblWeek').textContent = t('week');
    $('#lblWeek2').textContent = t('week');
    $('#lblMonth').textContent = t('month');
    $('#lblGroupFilter').textContent = t('group');
    $('#lblSort').textContent = t('sortByName');
    $('#lblDocLang').textContent = t('langDoc');
    $('#lblPage').textContent = t('monthlyPage');
    $('#lblHl').textContent = t('highlight');
    $('#generateBtn').textContent = t('generate');
    $('#lblSemStart').textContent = t('semesterStart');
    $('#lblSemWeeks').textContent = t('semesterWeeks');
    $('#lblRooms').textContent = t('rooms');
    $('#roomsHint').textContent = t('roomsHint');
    $('#lblRoot').textContent = t('rootFolder');
    $('#tSem').textContent = t('settings');
    $('#tFiles').textContent = t('filePatterns');
    $('#tFixed').textContent = t('fixedRooms');
    $('#tPref').textContent = t('teacherRooms');
    $('#treeTitle').textContent = t('generatedTree');
    $('#recalcBtn').textContent = t('recalc');
    $('#unlockBtn').textContent = t('relockAll');
    $('#applySem').textContent = t('recalc');
    $('#resetSem').textContent = t('reset');
    $('#liveNote').textContent = t('liveEditHint');
    $('#dlWeekBtn').textContent = t('dlWeek');
    $('#footer').textContent = t('footer');
    $$('[data-i18n]').forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    var ib = $('#installBtn');
    if (ib) ib.textContent = t('install');
    $('#wAll').textContent = t('wAll');
    $('#wConflict').textContent = t('wConflict');
    $('#wRooms').textContent = t('wRooms');
    $('#wParse').textContent = t('wParse');
    $$('.lang-switch [data-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === state.lang));
    });
  }

  function renderUpload() {
    var dz = $('#dropzone');
    if (!dz) return;
    dz.innerHTML = '';
    dz.appendChild(el('div', { class: 'dropzone-icon', text: '▤' }));
    dz.appendChild(el('h2', { text: t('dropTitle') }));
    dz.appendChild(el('p', { text: t('dropHint') }));
    dz.appendChild(el('p', { class: 'hint-sub', text: t('dropSub') }));
  }

  function renderBusy(name) {
    var dz = $('#dropzone');
    dz.innerHTML = '';
    dz.appendChild(el('div', { class: 'dropzone-icon' }, [el('span', { class: 'spinner' })]));
    dz.appendChild(el('h2', { text: t('busy') }));
    dz.appendChild(el('p', { text: name }));
  }

  function renderAll() {
    applyLang();
    if (!state.model) return;
    $('#fileName').textContent = state.fileName || '—';
    $('#fileMeta').textContent = state.model.grid.title || '';
    renderStats();
    renderTabs();
    renderWeekPickers();
    if (state.tab === 'calendar') renderWeekGrid();
    else if (state.tab === 'rooms') renderRooms();
    else if (state.tab === 'counters') renderCounters();
    else if (state.tab === 'requests') renderRequests();
    else if (state.tab === 'warnings') renderWarnings();
    else if (state.tab === 'files') renderFiles();
    else if (state.tab === 'settings') renderSettings();
    saveSettings();
  }

  /* ------------------------------------------------------------ install (PWA) */

  function initInstall() {
    var btn = $('#installBtn');
    if (!btn) return;
    var deferred = null;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });

    btn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; btn.hidden = true; });
    });

    window.addEventListener('appinstalled', function () {
      btn.hidden = true;
      toast(t('installed') + ' ✓', 'ok');
    });

    // already installed as a standalone app
    try {
      if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        btn.hidden = true;
      }
    } catch (e) { /* older browsers */ }

    // service worker, only meaningful over http(s)
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* file:// or offline */ });
    }
  }

  /* ------------------------------------------------------------ wiring */

  function init() {
    loadSettings();
    document.documentElement.setAttribute('data-theme', state.theme);
    applyLang();

    var dz = $('#dropzone'), input = $('#fileInput');
    dz.onclick = function () { input.click(); };
    dz.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    input.onchange = function () { if (input.files[0]) { state.fileName = input.files[0].name; loadFile(input.files[0]); } };

    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) { state.fileName = f.name; loadFile(f); }
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    $('#newFileBtn').onclick = function () {
      state.grid = null; state.model = null; state.generated = null;
      $('#workSection').hidden = true;
      $('#uploadSection').hidden = false;
      renderUpload();
    };
    $('#themeBtn').onclick = function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      saveSettings();
    };
    $$('.lang-switch [data-lang]').forEach(function (b) {
      b.onclick = function () {
        state.lang = b.getAttribute('data-lang');
        applyLang();
        if (state.model) renderAll(); else saveSettings();
      };
    });

    $('#recalcBtn').onclick = function () { recompute(state.week); toast(t('recalc') + ' ✓', 'ok'); };
    $('#unlockBtn').onclick = function () {
      state.model.occurrences.forEach(function (o) { o.locked = false; o.room = null; });
      recompute(state.week);
      toast(t('relockAll'), 'ok');
    };
    $('#dlWeekBtn').onclick = function () {
      var doc = SM.templateWeekly.build(state.model, state.week, genOpts());
      doc.toBlob(global.JSZip).then(function (b) {
        downloadBlob(b, SM.templateWeekly.fileName(state.model, state.week));
      });
    };
    $('#generateBtn').onclick = generateAll;

    $('#docLang').value = state.docLang;
    $('#docLang').onchange = function () { state.docLang = this.value; renderFiles(); saveSettings(); };
    $('#pageSize').value = state.pageSize;
    $('#pageSize').onchange = function () { state.pageSize = this.value; saveSettings(); };
    $('#hlOverflow').checked = state.highlight;
    $('#hlOverflow').onchange = function () { state.highlight = this.checked; saveSettings(); };

    $('#groupFilter').oninput = function () { state.groupFilter = this.value; renderCounters(); };
    $('#sortGroups').onchange = function () { state.groupSort = this.value; renderCounters(); };

    $$('[data-wfilter]').forEach(function (b) {
      b.onclick = function () {
        state.warnFilter = b.getAttribute('data-wfilter');
        $$('[data-wfilter]').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        renderWarnings();
      };
    });

    $('#applySem').onclick = function () {
      var start = $('#semStart').value;
      var weeks = parseInt($('#semWeeks').value, 10);
      var rooms = $('#roomsList').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      state.semester.firstMonday = start;
      state.semester.weeks = isNaN(weeks) ? state.semester.weeks : weeks;
      state.rooms = rooms.length ? rooms : C.ROOMS.slice();
      state.files.weekly = $('#patWeekly').value || state.files.weekly;
      state.files.monthly = $('#patMonthly').value || state.files.monthly;
      state.files.zayavka = $('#patZayavka').value || state.files.zayavka;
      state.rootFolder = $('#rootFolder').value || state.rootFolder;
      if (state.week > state.semester.weeks) state.week = state.semester.weeks;
      rebuildModel();
      renderAll();
      toast(t('saved'), 'ok');
    };
    $('#resetSem').onclick = function () {
      state.semester = JSON.parse(JSON.stringify(C.semester));
      state.rooms = C.ROOMS.slice();
      state.files = { weekly: C.files.weekly, monthly: 'Raspisanie_M_{month}_{year}.docx', zayavka: C.files.zayavka };
      state.rootFolder = C.output.rootFolder;
      rebuildModel();
      renderAll();
    };

    window.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      var idx = '123456789'.indexOf(e.key);
      if (idx >= 0 && state.model) {
        var w = parseInt(e.key, 10);
        if (w <= state.semester.weeks) { state.week = w; state.tab = 'calendar'; renderAll(); }
      }
    });

    initInstall();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  SM.ui = { state: state, renderAll: renderAll, toast: toast, downloadBlob: downloadBlob };

})(window);
