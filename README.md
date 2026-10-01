# Schedule Maker · Составитель расписания

An automatic schedule maker for organisations and institutions, specially those
involved in educational programs like universities and academies.

Concretely: a schedule maker and editor for the **Department of Russian as a
Foreign Language**. Feed it the department's grid (`Raspisanie_versia_N.docx`)
and it produces every downstream document the department has to file.

Runs entirely in the browser — the file is never uploaded anywhere.

---

## Quick start

**Online:** <https://youssefhassanecoten-tech.github.io/schedule-maker/>

**Offline / local:** double-click **`index.html`**. No install, no server, no
build step.

Either way:

1. Drag `Raspisanie_versia_N.docx` onto the drop zone.
2. Check the **Warnings** tab — it flags real errors in the source grid.
3. Fix anything you like under **Rooms** (live editing).
4. **Files → Generate files → Download ZIP**.

---

## Installing it as an app

The site is a progressive web app. Open it in a browser and choose
**Install app** (Chrome/Edge: the install icon in the address bar, or the
`Установить` button in the toolbar; iPhone: Share → Add to Home Screen).

You then get an app icon, a standalone window with no browser chrome, and
offline use after the first visit — on Android, iPhone, Windows and macOS.

No APK is needed. If you do want a signed `.apk` for sideloading or a store,
the URL is all a wrapper such as Bubblewrap or PWABuilder needs.

Icons live in `assets/` and are generated from vector geometry by
`node tools/make-icons.js` — no image library involved. To use a bitmap instead,
drop it at `assets/icon-source.png` and resize it to the sizes listed in
`manifest.webmanifest`.

---

## What it generates

```
schedule generated/
├── 09_sentyabr/
│   ├── Raspisanie_M_September_2026.docx      ← monthly schedule
│   ├── Week 2/
│   │   └── Raspisanie_S_07_09_2026_Na_-2n.docx   ← weekly schedule
│   ├── Week 3/
│   ├── Week 4/
│   └── Week 5/
│       ├── Raspisanie_S_28_09_2026_Na_-5n.docx
│       └── Zayavka_Na_Aud_21_N.docx          ← only if rooms overflow
│   ...
├── 10_oktyabr/
├── 11_noyabr/
├── 12_dekabr/
├── 01_yanvar/
└── 02_fevral/
```

* A week is filed under the month that contains its **Monday**, so every week
  appears exactly once.
* `Zayavka_Na_Aud_21_N.docx` is created **only** for weeks that actually exceed
  the 7 department rooms.
* The Zayavka form is filled with **date and time only** — `№ павильона` and
  `№ аудитории` stay blank on purpose, the department completes them by hand.

### Two different week-to-month rules

They answer different questions, so they differ on purpose:

| What | Rule | Why |
|---|---|---|
| **Folder layout** (`weeksInMonth`) | a week is filed under the month of its **Monday** | every week appears exactly once, no duplicates |
| **Monthly document** (`weeksOfMonth`) | a week is included if it **overlaps** the month | `2_Oktyabr_2026_G__1.doc` opens with week 5, whose Monday is 28.09, yet runs to 03.10 and belongs in the October document |

Selecting on Monday alone would drop that week from the October document and
leave it in September.

---

## Session memory

The **Memory** tab keeps the last 10 runs so a refresh no longer sends you back
to an empty drop zone — the old behaviour lost the whole grid on every reload.
Runs can be reopened, renamed, deleted individually, or cleared in bulk.

Storage is **IndexedDB** (`src/memory.js`), not `localStorage`: the source grid is
a whole `.docx` and the ~5 MB `localStorage` ceiling would not hold ten of them.
If IndexedDB is unavailable the feature degrades to in-memory only and the app
still works; a corrupt or unparseable stored run shows an error and leaves you on
the drop zone rather than blocking startup.

Autosave reuses the current run's id instead of minting a new one, so repeated
saves update one history entry instead of flooding the 10-run cap.

`openRun` copies the stored bytes into a standalone `ArrayBuffer` before handing
them to JSZip — passing the `Uint8Array`'s own buffer risks a view that runs past
the end of the file, which produced *"Can't find end of central directory"* on
stored runs.

---

## Monthly document fidelity

The monthly table is measured against the department's own
`2_Oktyabr_2026_G__1.doc` rather than guessed:

* column profile in `SM.config.MONTHLY_PROFILE` — week `0.043`, time `0.058`, and
  per day `0.20 / 0.43 / 0.175 / 0.195` of the usable text width, so the same
  table lays out on any supported page size
* `SM.config.MONTHLY_FONT_SZ = 10` — every run is `w:sz=10` (5pt), unbolded, as in
  the reference
* `SM.config.DEFAULT_PAGE_SIZE = 'A4'` with a `567tw` (1 cm) margin, and all three
  time blocks including the evening one

> The evening block is easy to miss: in the reference those rows carry a plain
> (unmerged) `Время` cell rather than a `vMerge`, so a `vMerge`-only scan misses
> them. They appear at the end of weeks 5, 7 and 9 of the October file.

---

## The rules it implements

### 1. Reading the source grid

The grid is 14 columns — one row per teacher, one column per time block:

| Mon | Tue | Wed | Thu | Fri | Sat |
|---|---|---|---|---|---|
| 9.00–12.15, 13.10–16.25 | + 16.45–20.00 | 9.00–12.15, 13.10–16.25 | 9.00–12.15, 13.10–16.25 | + 16.45–20.00 | 9.00–12.15, 13.10–16.25 |

A cell holds any number of `group (specification)` pairs, separated by spaces or
line breaks:

```
269 (2-9) 269А (10-17)
269А (13,14) 169А (12.01,19.01, 02.02)
126 (2,4,6) 126А (8,10, 12,14,16)
131 (8,10,12) (с 15.00.)            ← trailing notes are preserved and flagged
171Б (06.10-02.02)
```

### 2. Two notations, both supported

| Notation | Meaning |
|---|---|
| `(2-9)`, `(13,14)`, `(9, 11-17)`, `(1-9, 11-18,20)` | **week numbers** counted from the start of the term |
| `(12.01,19.01, 02.02)`, `(19.10,02.11,11.01.)` | **exact calendar dates** |
| `(07.10-10.02)`, `(03.10-06.02)` | a **date range**, repeated on that column's weekday |

A specification is read as calendar-based as soon as it contains a dot.

### 3. Lesson numbering (`№ темы`)

* The counter belongs to a **group** and **never resets** during the semester.
* It increments **once per (group, date, time block)**. The two sub-slots of a
  block (9.00–10.30 and 10.45–12.15) are the *same* lesson and share one number.
* There are no different subjects, only different teachers, so **switching teacher
  does not restart the counter**.
* A group may be **relabelled mid-term** — `263` (weeks 1–8) becomes `263А`/`263Б`
  (weeks 9–17). The relabelled groups **inherit the last number reached by the
  base group** and are then counted independently of each other.
* Groups that exist side by side from week 1 (`128А` and `128Б`) each start at 1,
  because neither continues the other.

The **Lesson counters** tab shows every group with its starting value, so the
inherited cases are marked `←263` and can be verified at a glance.

### 4. Rooms

The department owns **7 rooms**: `34, 36, 87, 91, 104, 105, 106`.

Each block of each day is an independent pool. Allocation order inside one block:

1. rooms pinned by hand in the editor
2. teachers with a **fixed** room — Гирфанова `104`, Туркова `105`,
   Шехватова `106`, Вострокнутова `106`
3. the room the teacher already had on that day
4. the teacher's **preferred** room (derived from the rooms the department
   actually used, editable in Settings)
5. the free room that teacher has used least this term — keeps the seven rooms
   evenly loaded
6. nothing free → the lesson is marked `8 пав.` and appears in the Zayavka

Every pass is re-run until no further progress is possible, so all preferences
that *can* be satisfied at the same time are satisfied.

### 5. Live editing

Pick a room in the **Calendar** or **Rooms** tab and that lesson is **pinned** —
it keeps your room across every recalculation. Choosing `авто` / `auto` releases
the pin. Lessons can also be deleted from the Rooms tab, which renumbers
everything downstream.

---

## Semester calendar

Defaults are set from your own files: **week 1 Monday = 31.08.2026**.

> The default length is **24 weeks**, not 22. The grid references `10.02.2027`
> in ranges such as `(07.10-10.02)`, and that date falls in week 24. With 22
> weeks those lessons would be silently dropped. Change it in **Settings** if the
> term is shorter.

Settings are remembered in `localStorage`, including locked and preferred rooms.

---

## Warnings the tool reports

These are genuine problems in the source document, not tool failures:

* **Conflicts** — a group is booked twice in the same block, or a teacher is
  booked twice in the same column. `versia_6` contains two: group `167Б` appears
  identically under both Туркова and Шехватова, and group `127А` under both
  Прохоренкова and Коюпченко. Delete the duplicate from the Rooms tab.
* **Rooms** — a block needs more than 7 rooms (this is what feeds the Zayavka),
  or a teacher's fixed room was already busy.
* **Parsing** — an unreadable specification, a group with no specification, or a
  date outside the term.

Notes such as `(с 15.00.)` / `(до 18.15.)` that change a lesson's actual start or
end time are preserved and flagged with `✎` so they can be confirmed by hand.

---

## Known differences from the department's current files

* **The weekly document has 14 columns, not 13.** The existing
  `Raspisanie_S_...docx` omits the Friday `16.45–20.00` block, which loses
  Шехватова's Friday-evening lessons (`182`, `131 до 18.15`). Verified: for week 5
  the generated file matches the department's file in **45 of 45 cells**.
* **Output is `.docx`**, not binary Word 97 `.doc`. Same layout, reliable to
  generate, opens in Word / LibreOffice / Google Docs.
* **Room numbers are recomputed.** The department's rooms were assigned by hand;
  the automatic rule is deterministic but does not reproduce their exact
  historical choices. Every room can be pinned or overridden live.

---

## Project layout

```
index.html                 markup + script order (classic scripts, no bundler)
manifest.webmanifest       PWA manifest (name, icons, standalone display)
sw.js                      service worker, network-first with offline cache
.nojekyll                  makes GitHub Pages serve the tree as-is
assets/styles.css          interface styles, light and dark
assets/icon-*.png          app icons, generated by tools/make-icons.js
vendor/jszip.min.js        the only dependency (vendored, works offline)
src/
  config.js                rooms, time blocks, semester defaults, document text
  util.js                  dates, text normalisation, group codes
  spec.js                  week / date specification parsing and expansion
  cellparse.js             one grid cell -> [{group, spec, notes}]
  docx-read.js             .docx -> grid rows (teacher + 14 columns)
  resolve.js               grid -> concrete dated lessons, conflict detection
  counters.js              lesson numbering incl. relabelled-group inheritance
  rooms.js                 room allocation and overflow detection
  docx-write.js            WordprocessingML writer (tables, merges, shading)
  templates/
    weekly.js  monthly.js  zayavka.js
  model.js                 orchestrates the pipeline, live-edit recompute
  package.js               folder tree + ZIP
  i18n.js                  Russian / English strings
  ui.js                    interface
tools/                     Node test harnesses (not needed to run the app)
```

The modules attach to a single global `SM` namespace and are plain scripts, which
is what lets `index.html` work from `file://` without a server. Every asset
reference is relative, so the same tree works at the `/schedule-maker/` subpath.

---

## Deploying

GitHub Pages is enabled on `main/` at the repository root. To change it:

**Settings → Pages → Source → Deploy from a branch → `main` / `/ (root)`**

Pushing to `main` rebuilds the site. No workflow file is needed.

### Push authentication

Prefer the SSH deploy key over a personal access token — no secret ever has to be
pasted into a chat or a terminal.

The key pair already exists at `~/.ssh/schedule_maker_deploy`, with
`~/.ssh/config` pointing `github.com` at it and GitHub's official host keys
already in `known_hosts`. To finish the setup, add the **public** key as a
deploy key with write access:

**Repository → Settings → Deploy keys → Add deploy key**

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKITCWLJzMx/QuB4r5Ms9uhJMnnEwT7sLsAyOpTQGWdB schedule-maker deploy key
```

Then point the remote at SSH:

```bash
git remote set-url origin git@github.com:youssefhassanecoten-tech/schedule-maker.git
```

A deploy key is scoped to this one repository and can be revoked without
touching the account, which is why it is preferable to a classic token. A
classic token carrying `repo` can write to **every** repository the account can
reach, plus `admin:org` and `workflow`.

If you push from more than one computer, give each its own deploy key
(`ssh-keygen -t ed25519 -f ~/.ssh/schedule_maker_deploy -N '""'`) so they can be
revoked individually.

---

## Tests

The tools are Node harnesses used during development. They require
`npm install` (only `jszip`, `@xmldom/xmldom`, `playwright-core` and `Pillow`),
and the app itself needs none of it. Point the tools at your files with
`SM_SAMPLES`, or pass paths as arguments.

```bash
npm test            # validate + verify + compare
npm run validate    # end-to-end: read v6, build the model, generate 41 files
npm run verify      # strict OOXML structure check of every generated document
npm run compare     # generated week 5 vs the department's own week-5 file
npm run browser     # headless Chrome from file:// - every tab, live edit, ZIP
npm run serve:test  # headless Chrome over HTTP - manifest, icons, service worker
npm run live        # the published GitHub Pages URL, end to end
npm run icons       # regenerate the app icons
```

`npm run compare` is the strongest check — it reports **45/45 cells identical**
and **18/18 lesson-number assertions correct** against the department's files.

---

## Adding a new semester

1. Put the new grid in as `Raspisanie_versia_N.docx` — nothing else changes.
2. Open **Settings** and set the first Monday and the number of weeks.
3. Review **Lesson counters** to confirm which groups inherit a number.
4. Review **Warnings**, fix duplicates, generate.
