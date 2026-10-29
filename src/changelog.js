/* The change history shown by the "What's new" page, in both languages.
 *
 * Newest first. Each entry carries the version it shipped in (`version`), the
 * cumulative change count at that point: MAJOR.MEDIUM.MINOR. The newest entry
 * must always equal SM.config.VERSION; check:changelog enforces that.
 *
 * The array order is newest-first. Within a date the order follows the release
 * order (see CHANGELOG.md).
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});

  SM.changelog = {
    entries: [
      { level: 'major', date: '2026-10-29', commit: '', version: '6.13.7',
        ru: 'Обучение: полный тур при первом запуске, короткие подсказки после обновления и кнопка повторного запуска.',
        en: 'Tutorial: a full first-run tour, short update hints and a replay button.' },

      { level: 'medium', date: '2026-10-29', commit: '', version: '5.13.7',
        ru: 'Страница «Что нового»: раздел «Изменения этой версии», история по крупным версиям (до 7 назад) и кнопка PDF (пока недоступна).',
        en: 'What’s new page: a “Changes in this version” section, history grouped by major version (up to 7 back) and a PDF button (disabled for now).' },

      { level: 'medium', date: '2026-10-29', commit: '', version: '5.12.7',
        ru: 'Аудитории кафедры: список доступных аудиторий можно добавлять, переименовывать и удалять, и он влияет на распределение.',
        en: 'Department rooms: the list of available rooms can be added to, renamed and removed, and it drives the allocation.' },

      { level: 'medium', date: '2026-10-29', commit: 'c060258', version: '5.11.7',
        ru: 'Закреплённые аудитории: преподавателей из файла можно добавлять в список и убирать из него.',
        en: 'Locked rooms: teachers from the file can be added to the list and removed from it.' },

      { level: 'medium', date: '2026-10-29', commit: '08486e4', version: '5.10.7',
        ru: 'Страница «Что нового»: нажмите на номер версии в подвале, чтобы прочитать, что изменилось.',
        en: '“What’s new” page: click the version number in the footer to read what changed.' },

      { level: 'minor', date: '2026-10-29', commit: '6e9bcfe', version: '5.9.7',
        ru: 'Обновления сайта подхватываются сразу, без ожидания кэша браузера.',
        en: 'Site updates are picked up immediately, without waiting for the browser cache.' },
      { level: 'minor', date: '2026-10-29', commit: '941b398', version: '5.9.6',
        ru: 'Праздник можно отметить двойным щелчком по любому дню в календаре; добавлена подсказка.',
        en: 'A holiday can be marked by double-clicking any day in the calendar; a hint was added.' },
      { level: 'medium', date: '2026-10-29', commit: '03bf69e', version: '5.9.5',
        ru: 'Номер версии показывается в подвале и в разделе «О программе».',
        en: 'The version number is shown in the footer and in About.' },
      { level: 'medium', date: '2026-10-29', commit: '8b63dd8', version: '5.8.5',
        ru: 'Страницы политики конфиденциальности и условий использования в подвале, отдельно для русского и английского.',
        en: 'Privacy Policy and Terms of Use pages in the footer, separate for Russian and English.' },
      { level: 'medium', date: '2026-10-29', commit: 'bcf8325', version: '5.7.5',
        ru: 'Документы о безопасности, допустимом использовании и проприетарная лицензия.',
        en: 'Security and acceptable-use documents plus a proprietary licence.' },
      { level: 'medium', date: '2026-10-29', commit: '17fa8ad', version: '5.6.5',
        ru: 'Новый слоган: «Расписание без хаоса».',
        en: 'New tagline: “Schedules, sorted.”' },
      { level: 'medium', date: '2026-10-29', commit: '396032a', version: '5.5.5',
        ru: 'Диагональная штриховка-разделитель в месячном расписании, как на форме кафедры.',
        en: 'Diagonal hatch separators in the monthly schedule, matching the department form.' },
      { level: 'major', date: '2026-10-29', commit: '6af9381', version: '5.4.5',
        ru: 'Праздники: день отменяет занятия, они выделяются красным и не попадают в заявку.',
        en: 'Holidays: a day cancels its lessons, prints them red and removes them from the request.' },

      { level: 'major', date: '2026-10-27', commit: '7e051be', version: '4.4.4',
        ru: 'Подготовительные курсы (ПО) и дистанционные занятия (-ДО): ПО не попадают в месячное расписание, ДО не требует аудитории.',
        en: 'Preparatory courses (ПО) and distance lessons (-ДО): ПО never enter the monthly schedule, -ДО needs no room.' },
      { level: 'minor', date: '2026-10-27', commit: '2a97bf0', version: '4.4.5',
        ru: 'У дистанционного занятия в недельном расписании вместо аудитории стоит «ДО».',
        en: 'A distance lesson shows “ДО” instead of a room in the weekly schedule.' },

      { level: 'major', date: '2026-10-26', commit: '548a798', version: '3.3.3',
        ru: 'Отдельные месячные расписания для потоков: бакалавры, ПО, магистры и другие.',
        en: 'Separate monthly schedules per flow: bachelors, preparatory, masters and others.' },
      { level: 'medium', date: '2026-10-26', commit: 'e966a10', version: '3.4.4',
        ru: 'Папки теперь сначала по году, затем по месяцу: январь 2027 идёт после декабря 2026.',
        en: 'Folders are year → month, so January 2027 follows December 2026.' },
      { level: 'minor', date: '2026-10-26', commit: 'cfa80a9', version: '3.3.4',
        ru: 'Подписи времени в сетке недели выровнены по своим столбцам.',
        en: 'Week-grid time labels are aligned with their columns.' },

      { level: 'minor', date: '2026-10-09', commit: '1bdd674', version: '2.3.3',
        ru: 'В заявке отдельная строка на каждую дополнительную аудиторию; второе занятие в ячейке больше не теряется.',
        en: 'One request row per extra room; the second lesson in a cell is no longer lost.' },

      { level: 'medium', date: '2026-10-01', commit: 'd90d944', version: '2.3.0',
        ru: 'Иконка приложения по мотивам календаря кафедры.',
        en: 'App icon based on the department calendar mark.' },
      { level: 'minor', date: '2026-10-01', commit: 'b8956d2', version: '2.3.1',
        ru: 'Кнопка установки снова показывается в браузерах без beforeinstallprompt.',
        en: 'The install button is shown again in browsers without beforeinstallprompt.' },
      { level: 'minor', date: '2026-10-01', commit: '19598c0', version: '2.3.2',
        ru: 'В месячном расписании подписаны все временные подынтервалы.',
        en: 'Every sub-slot is labelled in the monthly Time column.' },

      { level: 'medium', date: '2026-09-30', commit: '12b85ef', version: '2.1.0',
        ru: 'Месячное расписание точно повторяет форму кафедры: недели на стыке месяцев, шрифт 5 пт без жирного.',
        en: 'The monthly schedule matches the department form: weeks overlap months, 5pt unbolded text.' },
      { level: 'medium', date: '2026-09-30', commit: '4ba929d', version: '2.2.0',
        ru: 'Память запусков, подсказки по установке, адаптивная вёрстка.',
        en: 'Session memory, install guidance and responsive layout.' },
      { level: 'major', date: '2026-09-30', commit: '41ed910', version: '2.0.0',
        ru: 'Публикация на GitHub Pages и установка как приложение (PWA, офлайн).',
        en: 'Published on GitHub Pages and installable as an app (PWA, offline).' },
      { level: 'major', date: '2026-09-30', commit: '49fc01b', version: '1.0.0',
        ru: 'Ядро: чтение Raspisanie_versia_N.docx и создание недельного, месячного расписания и заявки.',
        en: 'Core: read Raspisanie_versia_N.docx and generate the weekly, monthly and request documents.' }
    ]
  };

})(typeof window !== 'undefined' ? window : globalThis);
