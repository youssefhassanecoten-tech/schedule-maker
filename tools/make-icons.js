/* Generates the PWA icons. No image libraries: the PNG is written by hand using
 * Node's built-in zlib, and the glyph is drawn with signed-distance geometry.
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
    raw[y * stride] = 0;                       // filter type: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- signed distance helpers (unit space) ---------- */
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/* rounded box centred on the origin, half extents (hx,hy), corner radius r */
function sdBox(px, py, hx, hy, r) {
  r = Math.min(r, hx, hy);
  const qx = Math.abs(px) - hx + r;
  const qy = Math.abs(py) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
         Math.min(Math.max(qx, qy), 0) - r;
}
/* capsule between a and b with radius r */
function sdCapsule(px, py, ax, ay, bx, by, r) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const L2 = vx * vx + vy * vy || 1e-9;
  const t = clamp01((wx * vx + wy * vy) / L2);
  return Math.hypot(wx - vx * t, wy - vy * t) - r;
}
/* annulus ring, clipped to the right half plane at x = clipX */
function sdRingHalf(px, py, cx, cy, rOut, rIn, clipX) {
  const dx = px - cx, dy = py - cy;
  const mid = (rOut + rIn) / 2, half = (rOut - rIn) / 2;
  const d = Math.abs(Math.hypot(dx, dy) - mid) - half;
  return Math.max(d, -(px - clipX));   // keep only x >= clipX
}

/* ---------- the mark ---------- */
const C1 = [0x5b, 0x5b, 0xd6];
const C2 = [0x9b, 0x6c, 0xf0];
const WHITE = [0xff, 0xff, 0xff];

/* glyph "R" laid out in a 0..1 box */
const stemLeft = 0.300, stemW = 0.105;
const stemRight = stemLeft + stemW;
const stemTop = 0.215, stemBot = 0.790;
const bowlTop = stemTop, bowlBot = 0.455;
const bowlCy = (bowlTop + bowlBot) / 2;
const bowlR = (bowlBot - bowlTop) / 2;
const bowlCx = stemRight + bowlR - 0.030;
const bowlThin = bowlR * 0.50;
const barH = 0.052;
const legTopX = stemRight + 0.090, legTopY = bowlBot + 0.020;
const legBotX = 0.665, legBotY = stemBot;
const legR = 0.052;

function sdGlyph(x, y) {
  // stem
  let d = sdBox(x - (stemLeft + stemW / 2), y - (stemTop + stemBot) / 2,
                stemW / 2, (stemBot - stemTop) / 2, stemW * 0.34);
  // bowl
  d = Math.min(d, sdRingHalf(x, y, bowlCx, bowlCy, bowlR, bowlR - bowlThin, stemRight - 0.012));
  // bar that closes the bowl
  const barW = (bowlCx + bowlR) - stemLeft;
  d = Math.min(d, sdBox(x - (stemLeft + barW / 2), y - bowlBot, barW / 2, barH / 2, barH * 0.4));
  // leg
  d = Math.min(d, sdCapsule(x, y, legTopX, legTopY, legBotX, legBotY, legR));
  return d;
}

function render(S) {
  const buf = Buffer.alloc(S * S * 4);
  const corner = 0.215;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const x = (px + 0.5) / S - 0.5;
      const y = (py + 0.5) / S - 0.5;

      const dBg = sdBox(x, y, 0.5, 0.5, corner);
      const a = clamp01(0.5 - dBg * S);
      if (a <= 0) continue;

      let col = mix(C1, C2, clamp01((x + y + 1) / 2));
      const aGlyph = clamp01(0.5 - sdGlyph(x + 0.5, y + 0.5) * S);
      if (aGlyph > 0) col = mix(col, WHITE, aGlyph);

      const o = (py * S + px) * 4;
      buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2];
      buf[o + 3] = Math.round(a * 255);
    }
  }
  return buf;
}
function makeIcon(S) { return encodePng(S, S, render(S)); }

const out = path.join(__dirname, '..', 'assets');
[[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']].forEach(([s, name]) => {
  const f = path.join(out, name);
  fs.writeFileSync(f, makeIcon(s));
  console.log('wrote', name, fs.statSync(f).size, 'bytes');
});

// self-test against the raw pixel buffer
const T = 64, raw = render(T);
const at = (x, y) => raw[(y * T + x) * 4 + 3];
console.log('rounded corner (1,1) alpha =', at(1, 1), '(expect < 40)');
console.log('top edge       (32,1) alpha =', at(32, 1), '(expect 255)');
console.log('centre         (32,32) alpha =', at(32, 32), '(expect 255)');
