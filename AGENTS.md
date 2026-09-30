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
* **The Zayavka is never auto-filled with rooms.** Date and time only; pavilion
  and room stay blank by design.
* **Week 1 Monday = 31.08.2026** and the term is **24 weeks** — 22 is not enough,
  `10.02.2027` (referenced by `(07.10-10.02)`) falls in week 24.
* **Slot indices are 0=Mon..5=Sat for `slot.day`, but JavaScript's
  `Date.getDay()` is 0=Sun.** `src/spec.js` converts with `(slotDow + 1) % 7`.
  Getting this wrong silently shifts every date range onto the wrong weekday.

## Layout conventions

* `src/config.js` holds all magic values: rooms, time blocks, semester dates,
  fixed/preferred rooms, and the literal text of the Zayavka form.
* Every user-facing string lives in `src/i18n.js` in **both** `ru` and `en`.
  Never hard-code UI text in `ui.js`.
* Templates are pure: `build(model, …)` returns a `Doc` and never touches the
  DOM.
* `SM.model.recompute(model)` is the single entry point for live edits — it
  renumbers and reallocates in place.

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
