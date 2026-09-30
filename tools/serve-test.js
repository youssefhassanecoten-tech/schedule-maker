/* Serves the app over HTTP and checks that the PWA plumbing really works:
 * manifest is reachable and valid, icons resolve, service worker registers,
 * and the app still loads and generates files.
 *   node tools/serve-test.js
 */
'use strict';
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC = require('./paths').resolve('Raspisanie_versia_6.docx', process.argv[2]);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.zip': 'application/zip'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  console.log('serving', ROOT, 'at', base);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('!! ' + e.message); });
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('!! ' + m.text()); } });

  await page.goto(base, { waitUntil: 'networkidle' });
  console.log('title          :', await page.title());

  // manifest
  const mf = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]').href;
    const r = await fetch(href);
    return { href, status: r.status, type: r.headers.get('content-type'), body: await r.json() };
  });
  console.log('manifest       :', mf.status, mf.type);
  console.log('  name         :', mf.body.name);
  console.log('  display      :', mf.body.display);
  console.log('  icons        :', mf.body.icons.map(i => i.sizes + ' ' + i.purpose).join(', '));

  // icons resolve
  for (const icon of mf.body.icons) {
    const r = await page.evaluate(async u => {
      const res = await fetch(new URL(u, location.href));
      return { status: res.status, type: res.headers.get('content-type') };
    }, icon.src);
    console.log('  icon ' + icon.src.padEnd(24), r.status, r.type);
  }

  // service worker
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready.catch(e => null);
    return reg ? { scope: reg.scope, active: !!reg.active } : null;
  });
  console.log('service worker :', sw ? sw.scope + '  active=' + sw.active : 'NOT REGISTERED');

  // the app still works over http
  await page.setInputFiles('#fileInput', SRC);
  await page.waitForSelector('#workSection:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(500);
  console.log('stats          :', (await page.textContent('#stats')).replace(/\s+/g, ' ').trim().slice(0, 90));

  const dl = page.waitForEvent('download', { timeout: 120000 });
  await page.click('#tabs .tab:nth-child(6)');
  await page.waitForTimeout(300);
  await page.click('#generateBtn');
  const d = await dl;
  console.log('download       :', d.suggestedFilename());

  // subpath deployment check: every asset reference must be relative, otherwise
  // the app would break under https://<user>.github.io/schedule-maker/
  const relative = await page.evaluate(() => {
    const urls = [...document.querySelectorAll('script[src],link[href]')]
      .map(e => e.getAttribute('src') || e.getAttribute('href'))
      .filter(u => u && !u.startsWith('http') && !u.startsWith('data:'));
    return { allRelative: urls.every(u => !u.startsWith('/')), urls: urls };
  });
  console.log('relative paths :', relative.allRelative, '(' + relative.urls.length + ' assets)');
  relative.urls.forEach(u => console.log('   ', u));

  console.log('\nERRORS (' + errors.length + ')');
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FAILED', e); server.close(); process.exit(1); });
