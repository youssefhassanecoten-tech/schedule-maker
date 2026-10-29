/* Guided tours: the full first-run walkthrough and the short "what changed"
 * tours shown after an update.
 *
 * A step is:
 *   { selector, tab?, title: {ru,en}, text: {ru,en}, placement? }
 * `tab` switches the app to that panel before highlighting the target.
 * Steps whose target is missing are skipped.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});

  SM.tours = {
    full: [
      {
        selector: '.filebar',
        title: { ru: 'Файл расписания', en: 'Your schedule file' },
        text: {
          ru: 'Отсюда начинается всё: программа читает .docx кафедры и строит из него недельное и месячное расписание и заявку.',
          en: 'Everything starts here: the app reads the department .docx and builds the weekly and monthly schedules plus the auditorium request.'
        }
      },
      {
        selector: '#stats',
        title: { ru: 'Сводка', en: 'At a glance' },
        text: {
          ru: 'Занятия, группы, недели и сколько дополнительных аудиторий понадобится — обновляется после каждого изменения.',
          en: 'Lessons, groups, weeks and how many extra rooms are needed — updated after every change.'
        }
      },
      {
        selector: '#tabs',
        title: { ru: 'Разделы', en: 'Sections' },
        text: {
          ru: 'Календарь, аудитории, счётчики, переполнение, предупреждения, файлы, память и настройки.',
          en: 'Calendar, rooms, counters, overflow, warnings, files, memory and settings.'
        }
      },
      {
        selector: '#weekGrid',
        tab: 'calendar',
        title: { ru: 'Календарь недели', en: 'Week calendar' },
        text: {
          ru: 'Аудиторию можно выбрать прямо в занятии — она закрепится. Двойной щелчок по дню отмечает праздник: занятия этого дня станут красными и уйдут из заявки.',
          en: 'Pick a room right in a lesson to pin it. Double-click a day to mark a holiday: that day’s lessons turn red and leave the request.'
        }
      },
      {
        selector: '#tabs .tab[data-tab="rooms"]',
        title: { ru: 'Аудитории', en: 'Rooms' },
        text: {
          ru: 'Показывает, какие комнаты заняты в каждом блоке и где не хватает аудиторий.',
          en: 'Shows which rooms are taken in each block and where rooms are short.'
        }
      },
      {
        selector: '#tabs .tab[data-tab="counters"]',
        title: { ru: 'Счётчик занятий', en: 'Lesson counters' },
        text: {
          ru: '№ темы для каждой группы. Нумерация не сбрасывается при смене преподавателя и переходит к переименованным группам.',
          en: 'The topic number per group. It does not restart when the teacher changes and it carries over to relabelled groups.'
        }
      },
      {
        selector: '#tabs .tab[data-tab="warnings"]',
        title: { ru: 'Предупреждения', en: 'Warnings' },
        text: {
          ru: 'Конфликты, переполнение и подозрительные места в исходном файле — всё в одном месте.',
          en: 'Conflicts, overflow and suspicious entries in the source file, all in one place.'
        }
      },
      {
        selector: '#generateBtn',
        tab: 'files',
        title: { ru: 'Готовые документы', en: 'Generated documents' },
        text: {
          ru: 'Здесь видно дерево папок и файлов. Кнопка «Сгенерировать» собирает всё в ZIP.',
          en: 'The folder tree is shown here. “Generate” packs everything into a ZIP.'
        }
      },
      {
        selector: '#roomList',
        tab: 'settings',
        title: { ru: 'Аудитории кафедры', en: 'Department rooms' },
        text: {
          ru: 'Список доступных комнат: добавляйте, переименовывайте и удаляйте. Он влияет на распределение и заявку.',
          en: 'The available rooms: add, rename or remove them. The list drives the allocation and the request.'
        }
      },
      {
        selector: '#fixedRooms',
        tab: 'settings',
        title: { ru: 'Закреплённые аудитории', en: 'Locked rooms' },
        text: {
          ru: 'Преподавателя из файла можно добавить в список и убрать из него; выберите ему постоянную аудиторию.',
          en: 'Add a teacher from the file to the list or remove one, and give them a permanent room.'
        }
      },
      {
        selector: '#holidayUpload',
        tab: 'settings',
        title: { ru: 'Праздники', en: 'Holidays' },
        text: {
          ru: 'Праздники отмечаются двойным щелчком по дню в календаре. Загрузка файла праздников пока в разработке.',
          en: 'Mark holidays by double-clicking a day in the calendar. Uploading a holidays file is still in development.'
        }
      },
      {
        selector: '#footerVersion',
        tab: 'settings',
        title: { ru: 'Версия и документы', en: 'Version and documents' },
        text: {
          ru: 'Номер версии открывает «Что нового»; ниже — политика конфиденциальности и условия использования.',
          en: 'The version number opens “What’s new”; below it are the privacy policy and the terms of use.'
        }
      }
    ],

    updates: {
      '6.13.7': [
        {
          selector: '#roomList',
          tab: 'settings',
          title: { ru: 'Новое: аудитории кафедры', en: 'New: department rooms' },
          text: {
            ru: 'Список аудиторий теперь редактируется: добавляйте, переименовывайте и удаляйте комнаты — распределение и заявка сразу пересчитаются.',
            en: 'The room list is editable now: add, rename or remove rooms and the allocation and request are recomputed immediately.'
          }
        },
        {
          selector: '#tourBtn',
          tab: 'settings',
          title: { ru: 'Обучение можно повторить', en: 'Replay the tour' },
          text: {
            ru: 'В любой момент вернитесь к полному обучению этой кнопкой.',
            en: 'Come back to the full walkthrough at any time with this button.'
          }
        }
      ]
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
