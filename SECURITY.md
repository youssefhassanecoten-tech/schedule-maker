# Security Policy

Schedule Maker is proprietary software. It is a **static, client-side web app**.
It has no backend, no accounts, no remote API and no telemetry: the schedule grid
you upload is parsed and the documents are generated entirely in your browser.

## Supported versions

| Version | Supported |
| --- | --- |
| Live site (GitHub Pages, `main`) | Yes |
| Latest commit on `main` | Yes |
| Older commits, forks and modified copies | No |

## Reporting a vulnerability

Please report privately, not in a public issue:

1. GitHub → **Security** → **Report a vulnerability** (private advisory).
2. If you cannot use that, open an issue describing only the *class* of problem.
   Do **not** attach a real schedule file, room list or staff names.

We aim to acknowledge a report within 5 working days and to ship a fix or
mitigation within 30 days for confirmed issues.

## Scope

**In scope**

- `src/`, `index.html`, `sw.js`, `manifest.webmanifest`
- the vendored `vendor/jszip.min.js`
- the generated `.docx` output (for example malformed XML, unexpected file
  paths, or content injected from the source grid)

**Out of scope**

- the schedule files you process and the documents themselves
- GitHub Pages hosting and the browser
- social-engineering attempts to obtain a staff member's device or account

## What the app does and does not do

- Parses `.docx` locally with JSZip and `@xmldom/xmldom`. **Nothing is uploaded.**
- Stores settings in `localStorage` and run history in IndexedDB, **on this
  device**.
- Makes no network requests except for same-origin assets.
- Has no login, server, remote API, analytics or cookies.
- Treats the uploaded document as data; it does not execute or evaluate it.

## Data handling

Uploaded grids and generated documents can contain personal data (teacher names,
group numbers, rooms). Because processing is local:

- nothing is transmitted to the copyright holder, GitHub or any third party;
- data persists on the device in browser storage until it is cleared;
- on a shared computer use a private browser profile and clear site data after
  use (Memory tab or browser settings);
- treat exported ZIP files as internal documents: do not publish them.

## Dependencies

Only `vendor/jszip.min.js` ships at runtime. `@xmldom/xmldom`, `jszip` (Node) and
`playwright-core` are development/test dependencies. Keep `package-lock.json`
committed and review dependency updates before merging.

## Deployment guidance

- Serve over HTTPS; GitHub Pages does this by default.
- The site is public by design: the **code** is public, the **data** never leaves
  the browser. Do not add a backend that stores schedule files without a security
  review.
- If the deployment must be private, put it behind an access-controlled proxy or
  host it on an internal server.

## Known limitations / non-goals

- No authentication or per-user access control: this is a local tool.
- No protection against a compromised browser or device.
- The generated files are plain WordprocessingML. Opening untrusted `.docx`
  files is outside this app; Schedule Maker only writes documents.
