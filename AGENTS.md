# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this project is

A dependency-free, build-free, static web app that reads the department's
schedule grid (`Raspisanie_versia_N.docx`) and generates the three downstream
documents (weekly schedule, monthly schedule, auditorium request).

## Hard constraints — do not break these

1. **No build step, no bundler, no framework.** `index.html` must keep working
   when opened directly from `file://`. That means:
   - scripts are classic `<script src>` tags, never `type="module"` (ES modules
     are blocked by CORS on `file://`);
   - modules attach to the single global `SM` namespace (`SM.config`,
     `SM.util`, `SM.spec`, …) via an IIFE;
   - no `import`/`export` statements in `src/`.
2. **No new runtime dependency.** The only vendored library is
   `vendor/jszip.min.js`. Anything else must be written in plain JS.
3. **Documents are `.docx`** (WordprocessingML), never binary Word 97 `.doc`.
   This was an explicit decision: binary `.doc` cannot be generated reliably.

## Domain rules that must not drift

These encode the department's rules. Changing them silently will produce wrong
documents.

* **Week numbers** inside brackets are counted from the start of the term.
  Anything containing a dot is a **calendar date**, not a week number.
  A date *range* such as `(07.10-10.02)` repeats the weekday of its column.
* **A lesson is one `(group, date, time block)`.** The two sub-slots of a block
  (9.00–10.30 and 10.45–12.15) are the same lesson and share one `№ темы`.
* **The counter belongs to the group and never resets** within the term.
  Switching teacher does not restart it.
* **Relabelled groups inherit, then diverge.** When `263` (weeks 1–8) becomes
  `263А`/`263Б` (weeks 9–17), both start at `last(263) + 1` and then count
  independently. Two groups that both exist from week 1 (`128А`, `128Б`) start
  at 1 each.
* **7 rooms.** A block with more concurrent lessons than rooms produces overflow
  entries and feeds the Zayavka. Overflow is counted per `(date, block)`, not
  per day.
* **`-ДО` marks a distance (online) lesson.** It gets **no room** and never
  overflows, so it is excluded from the Zayavka's room count — but it still
  appears in the weekly schedule. Online and in-person lessons of one group
  share one "№ темы" counter.
* **ПО groups are preparatory courses**, written `ПО-<n>` or `ПО-орд.<n>`; the
  number after the name is the group, not a week. They appear in the weekly
  schedule (and, when in person, in the Zayavka) but **never in the monthly
  schedule**, so they are also not part of the monthly flow accounting.
  Their **week numbers count from their own week 1** (`semester.prepFirstMonday`,
  default `2026-11-02`), not from the department's `2026-08-31`; `(1-8)` on a ПО
  group is therefore November–December, while `(1-8)` on a normal group is
  September–October.
* **A holiday is a whole date** (`model.holidays`, ISO). It overrides that day's
  lessons: they get no room, never overflow and are left out of the Zayavka, but
  the weekly/monthly documents print them **red** (`SM.config.HOLIDAY`) and the
  monthly date cell is red too. Numbering does **not** change — a holiday cancels
  a lesson, it does not renumber the group. Marked by double-clicking a day
  header or any cell of that day; the file upload is a disabled DEMO until its
  format is agreed.
* **The Zayavka is never auto-filled with rooms.** Date and time only; pavilion
  and room stay blank by design. **One row per extra room** — a block that needs
  three more rooms produces three rows, not one.
* **Separate monthly schedules only filter the monthly document.** Groups listed
  in Settings → "Отдельные месячные расписания" get their own monthly `.docx`
  (same month folder, `_<name>` suffix) and are removed from the main monthly.
  Weekly schedules and the Zayavka stay single and still cover every group.
  A split is a **view**: never renumber and never reallocate rooms for it, or the
  split document would disagree with the main schedule.
* **Week 1 Monday = 31.08.2026** and the term is **24 weeks** — 22 is not enough,
  `10.02.2027` (referenced by `(07.10-10.02)`) falls in week 24.
* **Slot indices are 0=Mon..5=Sat for `slot.day`, but JavaScript's
  `Date.getDay()` is 0=Sun.** `src/spec.js` converts with `(slotDow + 1) % 7`.
  Getting this wrong silently shifts every date range onto the wrong weekday.

## Layout conventions

* `src/config.js` holds all magic values: rooms, time blocks, semester dates,
  fixed/preferred rooms, and the literal text of the Zayavka form.
* The running version is `SM.config.VERSION` (shown in the footer and in
  Settings → About). It follows `MAJOR.MEDIUM.MINOR` = the count of major, medium
  and minor product changes since the beginning, documented in `CHANGELOG.md`.
  Keep it in sync with `version` in `package.json`; bump the service-worker
  `CACHE` in `sw.js` whenever shipped assets change.
* Every user-facing string lives in `src/i18n.js` in **both** `ru` and `en`.
  Never hard-code UI text in `ui.js`.
* Templates are pure: `build(model, …)` returns a `Doc` and never touches the
  DOM.
* `SM.model.recompute(model)` is the single entry point for live edits — it
  renumbers and reallocates in place.

## Every change ships with its version

The version is a **count**, not a calendar: `MAJOR.MEDIUM.MINOR` = how many major,
medium and minor product changes the app has received since the beginning
(`CHANGELOG.md` holds the mapping). Every product change MUST be committed
together with its bumped version:

```bash
npm run version:bump -- <major|medium|minor> "<short description>"
```

That updates `SM.config.VERSION`, `package.json`, the service-worker `CACHE` and
`CHANGELOG.md` in one step. Documentation-only and housekeeping commits do not
bump the version.

## Before you change anything

```bash
npm install
npm run validate     # pipeline + numbering assertions against the real file
npm run verify       # strict OOXML structure check of all 41 generated documents
npm run compare      # generated week 5 vs the department's own file
npm run browser      # headless Chrome smoke test of every tab
```

`npm run compare` must keep reporting **45/45 identical cells** and
**18/18 numbering assertions correct**. A drop in the cell count means the grid
layout mapping broke; a numbering failure means the counter rules broke.

For OOXML changes, `npm run verify` catches the usual Word complaints: rows whose
`gridSpan` total disagrees with `tblGrid`, and cells with no `w:p`. Those are the
two bugs that actually happen, so keep both checks.

## Known source-data issues (not tool bugs)

`Raspisanie_versia_6.docx` contains real duplicates that the tool reports as
warnings on purpose:

* group `167Б` appears identically under Туркова and Шехватова (Saturday morning)
* group `127А` appears identically under Прохоренкова and Коюпченко (Wednesday morning)

Do not "fix" these in the parser. They are surfaced so a human can delete the
duplicate from the Rooms tab.
