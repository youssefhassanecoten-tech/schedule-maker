/* Generates the app icons.
 *
 * The artwork is redrawn with signed-distance geometry rather than resized from
 * a bitmap, so every size is crisp and no image library is needed at runtime.
 * Drop a replacement bitmap at assets/icon-source.png and use
 *   node tools/make-icons-from-bitmap.js
 * to use your own file instead.
 *
 *   node tools/make-icons.js
 */
'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ---------- minimal PNG writer (8-bit RGBA) ---------- */
function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- SDF helpers, all in normalised 0..1 artwork space ---------- */
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function sdBox(px, py, cx, cy, hw, hh, r) {
  r = Math.min(r, hw, hh);
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
         Math.min(Math.max(qx, qy), 0) - r;
}
/* convex polygon with rounded corners: max of the outward half-planes, minus r */
function sdRoundPoly(px, py, verts, r) {
  let d = -Infinity, n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1e-9;
    const nx = ey / len, ny = -ex / len;            // outward normal
    d = Math.max(d, (px - a[0]) * nx + (py - a[1]) * ny);
  }
  return d - r;
}
/* 4-point sparkle (astroid) */
function sdSparkle(px, py, cx, cy, a, thin) {
  const dx = Math.abs(px - cx) / a, dy = Math.abs(py - cy) / a;
  const k = Math.pow(dx, thin) + Math.pow(dy, thin);
  return (Math.pow(k, 1 / thin) - 1) * a;
}

/* ---------- palette ---------- */
const NAVY = [0x10, 0x30, 0x4e];
const TEAL = [0x33, 0xd4, 0xa6];
const WHITE = [0xff, 0xff, 0xff];
const HALO = [0xec, 0xf2, 0xf7];
const PAGE = [0xf8, 0xfa, 0xfc];

/* ---------- artwork, measured off the supplied design ---------- */
/* navy shield / house shape */
const SHIELD = [
  [0.500, 0.128], [0.912, 0.326], [0.912, 0.856],
  [0.088, 0.856], [0.088, 0.326]
];

/* calendar grid, in three rows plus a header bar */
const BAR = { x0: 0.309, x1: 0.693, y0: 0.348, y1: 0.382 };
const ROWS = [
  { y0: 0.412, y1: 0.483, cells: [[0.311, 0.412], [0.455, 0.554], [0.597, 0.696]], teal: [] },
  { y0: 0.516, y1: 0.587, cells: [[0.311, 0.412], [0.455, 0.696]], teal: [1] },
  { y0: 0.624, y1: 0.692, cells: [[0.311, 0.554], [0.597, 0.696]], teal: [] }
];
const CELL_R = 0.019;
const SPARKLE = { x: 0.634, y: 0.561, a: 0.026 };

const HALO_C = [0.5, 0.5];
const HALO_R = 0.5;

function sdShield(x, y) {
  return sdRoundPoly(x, y, SHIELD, 0.075);
}

/* returns [shieldMask, calendarMask, tealMask] coverage distances in px */
function artwork(x, y) {
  return {
    dShield: sdShield(x, y),
    dCal: Math.min(
      sdBox(x, y, (BAR.x0 + BAR.x1) / 2, (BAR.y0 + BAR.y1) / 2,
            (BAR.x1 - BAR.x0) / 2, (BAR.y1 - BAR.y0) / 2, (BAR.y1 - BAR.y0) / 2),
      ...ROWS.flatMap(r => r.cells.map(c =>
        sdBox(x, y, (c[0] + c[1]) / 2, (r.y0 + r.y1) / 2,
              (c[1] - c[0]) / 2, (r.y1 - r.y0) / 2, CELL_R)))
    ),
    dTeal: Math.min(...ROWS.flatMap(r =>
      r.teal.map(ci => {
        const c = r.cells[ci];
        return sdBox(x, y, (c[0] + c[1]) / 2, (r.y0 + r.y1) / 2,
                     (c[1] - c[0]) / 2, (r.y1 - r.y0) / 2, CELL_R);
      }))),
    dSpark: sdSparkle(x, y, SPARKLE.x, SPARKLE.y, SPARKLE.a, 0.62)
  };
}

/*
 * Render one icon.
 *   scale  - artwork scale inside the square (1 = fill)
 *   disc   - draw the pale halo disc as the icon background (true) or fill the
 *            whole square with the page colour (false)
 */
function render(S, scale, disc) {
  const buf = Buffer.alloc(S * S * 4);
  const half = S / 2;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const sx = (px + 0.5) / S, sy = (py + 0.5) / S;

      // background
      const dHalo = Math.hypot(sx - 0.5, sy - 0.5) - HALO_R * (disc ? 1 : 1);
      let base = disc
        ? (clamp01(0.5 - dHalo * S) ? HALO : PAGE)
        : PAGE;
      let alpha = 255;

      // artwork coordinates: centred, then scaled about the centre
      const ax = (sx - 0.5) / scale + 0.5;
      const ay = (sy - 0.5) / scale + 0.5;

      const d = artwork(ax, ay);

      const aShield = clamp01(0.5 - d.dShield * S);
      if (aShield > 0) base = mix(base, NAVY, aShield);

      const aCal = clamp01(0.5 - d.dCal * S) * aShield;
      if (aCal > 0) base = mix(base, WHITE, aCal);

      const aTeal = clamp01(0.5 - d.dTeal * S) * aShield;
      if (aTeal > 0) base = mix(base, TEAL, aTeal);

      const aSpark = clamp01(0.5 - d.dSpark * S) * aTeal;
      if (aSpark > 0) base = mix(base, NAVY, aSpark);

      const o = (py * S + px) * 4;
      buf[o] = base[0]; buf[o + 1] = base[1]; buf[o + 2] = base[2];
      buf[o + 3] = alpha;
    }
  }
  return buf;
}

const out = path.join(__dirname, '..', 'assets');
const jobs = [
  ['icon-192.png', 192, 0.86, true],
  ['icon-512.png', 512, 0.86, true],
  ['apple-touch-icon.png', 180, 0.88, false],
  ['icon-512-maskable.png', 512, 0.58, true],
  ['favicon-32.png', 32, 0.90, true]
];
jobs.forEach(([name, size, scale, disc]) => {
  const f = path.join(out, name);
  fs.writeFileSync(f, encodePng(size, size, render(size, scale, disc)));
  console.log('wrote', name.padEnd(26), fs.statSync(f).size, 'bytes');
});

/* Place square RGBA tiles side by side (my PNG writer is row-major, so this has
 * to copy pixel by pixel). */
function strip(tiles, S, gap) {
  const n = tiles.length;
  const W = n * S + (n - 1) * gap, H = S;
  const out = Buffer.alloc(W * H * 4);
  tiles.forEach((t, k) => {
    const x0 = k * (S + gap);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const s = (y * S + x) * 4, d = (y * W + (x0 + x)) * 4;
        out[d] = t[s]; out[d + 1] = t[s + 1]; out[d + 2] = t[s + 2]; out[d + 3] = t[s + 3];
      }
    }
  });
  return { buf: out, W: W, H: H };
}

// preview strip for quick visual review: home / maskable / apple
const PV = 240;
const stripOut = strip([render(PV, 0.86, true), render(PV, 0.58, true), render(PV, 0.88, false)], PV, 12);
fs.writeFileSync(path.join(out, '_preview.png'), encodePng(stripOut.W, stripOut.H, stripOut.buf));
console.log('wrote _preview.png (home | maskable | apple)');