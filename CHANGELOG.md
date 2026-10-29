# Changelog and versioning

Schedule Maker does not use calendar versioning or an arbitrary counter. The
version records **how many changes of each size the app has received since the
very beginning**:

```
MAJOR . MEDIUM . MINOR   =   count of major / medium / minor changes
```

Current version: **5.11.7** — 5 major, 11 medium and 7 minor changes.

A *major* change is a new capability that changes what the product is or how it
is delivered. A *medium* change is a new feature or a visible capability added to
an existing part. A *minor* change is a fix or a small refinement. Documentation
and housekeeping commits are not counted.

The number is set in one place, `SM.config.VERSION` in `src/config.js`, and kept
in sync with `version` in `package.json`.

---

## Major changes (5)

1. **Core generator** — read `Raspisanie_versia_N.docx` and produce the weekly
   schedule, the monthly schedule and the auditorium request, with lesson
   numbering, room allocation and overflow detection. (`49fc01b`)
2. **Installable app and live deployment** — GitHub Pages, PWA manifest, icons,
   offline service worker. (`41ed910`)
3. **Separate monthly schedules per flow** — groups assigned to their own monthly
   document, everything else stays in the main one; weekly schedules and the
   request remain shared. (`548a798`)
4. **Preparatory courses and distance lessons** — `ПО-2` / `ПО-орд.2` groups,
   `-ДО` online lessons with no room, and their own week-1 anchor. (`7e051be`,
   `cca6623`)
5. **Holidays** — a whole date overrides its lessons, prints them red and removes
   them from the auditorium request. (`6af9381`)

## Medium changes (11)

1. **Monthly document fidelity** — table measured against the department file,
   weeks overlap months, 5pt unbolded text, save-path panel. (`03fec0f`,
   `12b85ef`)
2. **Session memory, install guidance, responsive layout.** (`4ba929d`)
3. **App icon** taken from the department's calendar mark. (`d90d944`)
4. **Year → month folder order** so January 2027 follows December 2026.
   (`e966a10`)
5. **Diagonal hatch bands** on the monthly form, monthly only. (`396032a`)
6. **Brand tagline** — «Расписание без хаоса» / "Schedules, sorted."
   (`17fa8ad`)
7. **Legal documents** — security policy, acceptable-use policy and a
   proprietary owner-issued licence. (`bcf8325`, `f0443a5`)
8. **Footer legal pages** — privacy and terms, per language, with acceptance by
   use. (`8b63dd8`, `bb15be1`)
9. **Version display** in the footer and in Settings → About. (`03bf69e`)

10. **What’s new page: click the version number in the footer to read what changed.** (2026-10-29)

11. **Locked rooms: add or remove teachers from the source-file list.** (2026-10-29)

## Minor changes (7)

1. **Install button** restored on browsers without `beforeinstallprompt`.
   (`b8956d2`)
2. **Sub-slot time labels** in the monthly `Время` column. (`19598c0`)
3. **Zayavka rows** — one row per extra room, and the second lesson of a cell no
   longer lost. (`1bdd674`)
4. **Week-grid alignment** — time labels no longer shifted one column right.
   (`cfa80a9`)
5. **`-ДО` in the room position** of an online weekly lesson. (`2a97bf0`)
6. **Holiday discoverability** — double-click any day cell, visible hint, cache
   refresh. (`941b398`)
7. **Deployment freshness** — revalidate assets instead of waiting for the HTTP
   cache. (`6e9bcfe`)
