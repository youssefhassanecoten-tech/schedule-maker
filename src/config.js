/* Schedule Maker - core configuration.
 * Pure static app: no build step, no server. Classic scripts, global `SM` namespace.
 */
(function (global) {
  'use strict';

  var SM = global.SM || (global.SM = {});

  var DAYS_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  var DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* Time blocks. `key` is the identifier used everywhere in the model. */
  var BLOCKS = [
    { key: 'M', from: '9.00.',  to: '12.15.', labelRu: '9.00. – 12.15.', labelEn: '9:00 – 12:15' },
    { key: 'A', from: '13.10.', to: '16.25.', labelRu: '13.10. – 16.25.', labelEn: '13:10 – 16:25' },
    { key: 'E', from: '16.45.', to: '20.00.', labelRu: '16.45. – 20.00.', labelEn: '16:45 – 20:00' }
  ];

  /* Column layout of the source .docx grid, in document order (14 columns).
   * day: 0=Mon .. 5=Sat ; block: M/A/E */
  var SLOTS = [];
  for (var d = 0; d < 6; d++) {
    SLOTS.push({ id: d + '-M', day: d, block: 'M', idx: SLOTS.length });
    SLOTS.push({ id: d + '-A', day: d, block: 'A', idx: SLOTS.length });
    if (d === 2 || d === 4) SLOTS.push({ id: d + '-E', day: d, block: 'E', idx: SLOTS.length });
  }
  // Wait: Tue(1) and Fri(4) get an evening column. Fix order to match the document.
  SLOTS = [];
  for (var dd = 0; dd < 6; dd++) {
    SLOTS.push({ id: dd + '-M', day: dd, block: 'M', idx: SLOTS.length });
    SLOTS.push({ id: dd + '-A', day: dd, block: 'A', idx: SLOTS.length });
    if (dd === 1 || dd === 4) SLOTS.push({ id: dd + '-E', day: dd, block: 'E', idx: SLOTS.length });
  }

  /* Sub-slots used inside the monthly document (one "lesson" is drawn as two rows). */
  var SUBSLOTS = {
    M: [{ from: '9.00.',  to: '10.30.' }, { from: '10.45.', to: '12.15.' }],
    A: [{ from: '13.10.', to: '14.40.' }, { from: '14.55.', to: '16.25' }],
    E: [{ from: '16.45.', to: '20.00' }]
  };

  /* The 7 rooms the department owns, in allocation priority order.
   * Anything beyond 7 concurrent lessons becomes an extra-room request. */
  var ROOMS = ['106', '104', '105', '91', '87', '36', '34'];
  var ROOM_CAPACITY = ROOMS.length;
  var OVERFLOW_ROOM_LABEL = '8 пав.';
  var OVERFLOW_ROOM_LABEL_EN = '8 pav.';

  /* Rooms locked to a teacher regardless of what is free. */
  var FIXED_ROOMS = {
    'Гирфанова Э.М.': '104',
    'Туркова О.В.': '105',
    'Шехватова А.Н.': '106',
    'Вострокнутова Н.Н.': '106'
  };

  /* Preferred room per teacher (preferred, not locked). Derived from the rooms each
   * teacher actually used in the department's own monthly documents, so the
   * generated files keep the same room distribution. A lesson still moves on if the
   * preferred room is already busy in that block. Editable in the UI. */
  var TEACHER_ROOM_PREF = {
    'Гирфанова Э.М.': '104',
    'Туркова О.В.': '105',
    'Шехватова А.Н.': '106',
    'Вострокнутова Н.Н.': '106',
    'Дудниченко М.Е.': '106',
    'Сеничева Л.А.': '106',
    'Гоперхоева Д.Р.': '87',
    'Терентьева О.К.': '87',
    'Коюпченко П.Н.': '104',
    'Романова Ю.В.': '105',
    'Яковлева Е.А.': '105',
    'Чащина А.Е.': '91',
    'Андреева С.М.': '91',
    'Рыкова Е.Б.': '36',
    'Аршинова О.С.': '36',
    'Белова А.В.': '36',
    'Штых Ю.Г.': '36',
    'Милованова О.В.': '34',
    'Прохоренкова И.В.': '36',
    'Волонцевич И.А.': '106',
    'Абясова А.И.': '34',
    'Аксенова А.В.': '104',
    'Балашова К.В.': '104',
    'Михайленко Е.М.': '105'
  };

  /* Pseudo teacher row present in the department grid. */
  var VACANCY_RU = 'Вакансия';
  var VACANCY_EN = 'Vacancy';

  /* Page geometry in twips. All generated documents are landscape.
   * `margin` is the value the department's own files use: 567tw = 1cm. */
  var PAGE_SIZES = {
    A4: { w: 16838, h: 11906, margin: 567 },
    A3: { w: 23811, h: 16838, margin: 425 }
  };
  var DEFAULT_PAGE_SIZE = 'A4';

  /* Column profile of the monthly document, measured from the department's own
   * "2_Oktyabr_2026_G__1.doc":
   *
   *   [Номер недели][Время] + 6 days x [№ гр. | Ф.И.О. преподавателя | № ауд. | № темы]
   *
   * Widths are fractions of the usable text width so the identical table can be
   * laid out on any supported page size. Measured A4 values were
   * week 668tw, time 907tw, and per day roughly 468 / 1002 / 411 / 447. */
  var MONTHLY_PROFILE = {
    weekFrac: 0.043,
    timeFrac: 0.058,
    daySubFrac: [0.20, 0.43, 0.175, 0.195],
    /* Which time blocks the monthly document shows. The department's file does
     * contain the evening block (16.45-20.00): it appears at the end of weeks
     * 5, 7 and 9 of 2_Oktyabr_2026_G__1.doc. In the reference those rows carry
     * a plain (unmerged) Время cell rather than a vMerge, which is why a
     * vMerge-only scan misses them. Keep all three blocks. */
    blocks: ['M', 'A', 'E']
  };

  SM.config = {
    DAYS_RU: DAYS_RU,
    DAYS_EN: DAYS_EN,
    BLOCKS: BLOCKS,
    BLOCK_BY_KEY: BLOCKS.reduce(function (a, b) { a[b.key] = b; return a; }, {}),
    SLOTS: SLOTS,
    SLOT_COUNT: SLOTS.length,
    SUBSLOTS: SUBSLOTS,
    ROOMS: ROOMS,
    ROOM_CAPACITY: ROOM_CAPACITY,
    OVERFLOW_ROOM_LABEL: OVERFLOW_ROOM_LABEL,
    OVERFLOW_ROOM_LABEL_EN: OVERFLOW_ROOM_LABEL_EN,
    FIXED_ROOMS: FIXED_ROOMS,
    TEACHER_ROOM_PREF: TEACHER_ROOM_PREF,
    VACANCY_RU: VACANCY_RU,
    VACANCY_EN: VACANCY_EN,
    PAGE_SIZES: PAGE_SIZES,
    DEFAULT_PAGE_SIZE: DEFAULT_PAGE_SIZE,
    MONTHLY_PROFILE: MONTHLY_PROFILE,

    /* Semester calendar. Week 1 Monday = 2026-08-31.
     * NOTE: the source schedule references 10.02.2027 (week 24 Wednesday) in ranges
     * such as "(07.10-10.02)", so 24 weeks is the minimum that loses nothing. */
    semester: {
      firstMonday: '2026-08-31',
      weeks: 24,
      yearLabelRu: '2026/27',
      yearLabelEn: '2026/27',
      termRu: 'осенний',
      termEn: 'autumn'
    },

    output: {
      rootFolder: 'schedule generated',
      monthlyFolderPrefix: '',
      weekFolderPrefix: 'Week '
    },

    /* Names/labels of the generated documents. */
    files: {
      weekly: 'Raspisanie_S_{date}_Na_-{week}n.docx',
      zayavka: 'Zayavka_Na_Aud_21_N.docx',
      zayavkaBase: 'Zayavka_Na_Aud_21_N'
    },

    /* Fixed text of the auditorium request form. */
    zayavka: {
      addressee: [
        'Начальнику учебного управления',
        'Остапенко В.М.',
        'от зав. кафедрой русского',
        'языка как иностранного',
        'Гирфановой Э.М.'
      ],
      title: 'Заявка.',
      lead: 'В соответствие с расписанием занятий прошу выделить аудитории для проведения семинарских занятий. ',
      headers: ['Дата', '№ павильона', '№ аудитории', 'Время проведения'],
      footer: [
        'Сохранность материальных ценностей, находящихся в аудитории, закрытие окон, сохранение мебели в исходном положении, а также соблюдение правил противопожарной безопасности гарантирую.',
        'В случае окончания мероприятия за пределами графика рабочего времени (или в субботу) обязуюсь:',
        '- уведомить сотрудников КПО о времени окончания мероприятия и необходимости закрыть аудитории (ию) (для павильонов №№ 2/4, 8, 9, 32, 33, 40, 46)',
        '- лично закрыть аудиторию, расписаться в журнале учета выдачи-приема ключей от помещения, вернуть ключ на место его хранения (для павильонов №№ 11, 15, 16, 17, 18, 19, 21).',
        '',
        '___________________ (_________________________________________________________)',
        'Подпись\t\t\t\t\tФ.И.О., должность ответственного лица',
        '',
        '________________________\t\tКонтактный телефон ________________________',
        'Дата',
        'Визы согласования:',
        '',
        '___________________ (_________________________________________________________)',
        'Подпись\t\t\t\t\tФ.И.О., должность ответственного лица',
        '___________________ (_________________________________________________________)',
        'Подпись\t\t\t\t\tФ.И.О., должность ответственного лица',
        ''
      ]
    }
  };

  SM.monthNameRu = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
                    'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  SM.monthNameRuGen = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
                       'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  SM.monthNameEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                    'August', 'September', 'October', 'November', 'December'];
  /* File-system safe month folder names. */
  SM.monthFolderEn = ['01_January', '02_February', '03_March', '04_April', '05_May', '06_June',
                      '07_July', '08_August', '09_September', '10_October', '11_November', '12_December'];
  SM.monthFolderRu = ['01_yanvar', '02_fevral', '03_mart', '04_aprel', '05_may', '06_iyun',
                      '07_iyul', '08_avgust', '09_sentyabr', '10_oktyabr', '11_noyabr', '12_dekabr'];

})(typeof window !== 'undefined' ? window : globalThis);
