#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — battle-points-screenshots.js
   Dev-only. Drives a local headless Chrome/Edge over the DevTools protocol
   (no Playwright/Puppeteer dependency — just Node's built-in WebSocket) to
   capture the Battle Points header prototypes into
   artifacts/battle-points-prototypes/ and print a layout report
   (overlap / wrap / horizontal-scroll checks) for each variant and width.

     node scripts/battle-points-screenshots.js

   Serves the repo root itself on a random port and uses a throwaway browser
   profile, so it never touches real browser storage. Not part of the site
   build (scripts/ is excluded from dist/).
   ============================================================ */
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'battle-points-prototypes');
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const PROTOTYPE_HASH = '#/prep?battlePointsPrototype=1';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launchBrowser() {
  const exe = BROWSERS.find(p => fs.existsSync(p));
  if (!exe) throw new Error('No Chrome/Edge found');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-shots-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find(t => t.type === 'page');
      if (page) return { proc, profile, wsUrl: page.webSocketDebuggerUrl };
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Browser did not start');
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return { opened, send, close: () => ws.close() };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchBrowser();
  const cdp = connect(browser.wsUrl);
  await cdp.opened;
  await cdp.send('Page.enable');

  const evaluate = async expression => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
    return r.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await sleep(150); }
    const state = await evaluate(`JSON.stringify({ hash: location.hash, route: document.body.dataset.route, slot: !!document.querySelector('#bp-slot'), sig: document.querySelector('#bp-slot') && document.querySelector('#bp-slot').dataset.bpSig })`);
    throw new Error('Timed out waiting for ' + label + ' ' + state);
  };
  const viewport = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const shot = async name => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
    console.log('saved', name);
  };
  const clickProto = (field, value) => evaluate(`document.querySelector('[data-bp-proto="${field}"][data-value="${value}"]').click()`);

  /* A real Prep holding the four demo-matching adversaries so the cards under
   * the header agree with the demo numbers. Written only into the throwaway
   * profile's storage. */
  async function open(width, height, lang, hash = PROTOTYPE_HASH, seedAdversaries = true) {
    await viewport(width, height);
    await cdp.send('Page.navigate', { url: origin + '/#/lists' });
    await waitFor(`typeof PrepUtils !== 'undefined' && document.readyState === 'complete'`, 'app load');
    await evaluate(`(() => {
      const s = PrepUtils.createDefaultStore();
      s.sessions[0].adversaryIds = ${JSON.stringify(seedAdversaries ? ['bear', 'atototl', 'apprentice-assassin', 'acid-burrower'] : [])};
      localStorage.setItem('dhcodex_session_prep', JSON.stringify(s));
      localStorage.setItem('dhcodex_lang', JSON.stringify(${JSON.stringify(lang)}));
    })()`);
    // A hash-only navigation would not reload (and would keep the old proto
    // state), so leave the document first.
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await cdp.send('Page.navigate', { url: origin + '/' + hash });
    if (hash === PROTOTYPE_HASH) await waitFor(`!!document.querySelector('#bp-slot') && document.querySelector('#bp-trigger')`, 'prototype slot');
    else await waitFor(`!!document.querySelector('#prep-central-adv-title')`, 'ordinary Prep page');
    await sleep(700);
  }

  const report = [];
  async function measure(tag) {
    const m = await evaluate(`(() => {
      const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
      const head = document.querySelector('#prep-central-adv-title').closest('.prep-central-head');
      const title = r('#prep-central-adv-title'), count = r('#prep-central-adv-count'), slot = r('#bp-slot'), fcg = r('.prep-freshcutgrass-link'), h = r('.prep-central-head--mid');
      const slotEl = document.querySelector('#bp-slot');
      const items = [['title', title], ['count', count], ['slot', slot], ['fcg', fcg]].filter(x => x[1] && x[1].w);
      const overlaps = [];
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i][1], b = items[j][1];
        if (a.l < b.r - 0.5 && b.l < a.r - 0.5) overlaps.push(items[i][0] + '/' + items[j][0]);
      }
      const titleSpan = document.querySelector('#prep-central-adv-title span');
      const text = slotEl ? slotEl.querySelector('.bp') : null;
      const tops = slotEl ? Array.from(slotEl.querySelectorAll('.bp > *')).map(e => Math.round(e.getBoundingClientRect().top)) : [];
      return {
        headHeight: h && h.h, title, count, slot, fcg,
        overlaps,
        titleClipped: titleSpan ? titleSpan.scrollWidth > titleSpan.clientWidth : null,
        slotOverflow: slotEl ? slotEl.scrollWidth > slotEl.clientWidth : null,
        slotSingleRow: tops.length ? new Set(tops).size <= 1 : null,
        slotInsideHead: slot && h ? slot.r <= h.r && slot.l >= h.l : null,
        pageHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
        viewport: innerWidth + 'x' + innerHeight,
      };
    })()`);
    report.push(Object.assign({ tag }, m));
    return m;
  }

  const variants = ['A', 'B', 'C'];
  // Primary set at 1085x900, English.
  await open(1085, 900, 'en');
  for (const v of variants) {
    await clickProto('variant', v);
    await clickProto('data', 'demo');
    await clickProto('empty', 'always');
    await sleep(150);
    await shot(`prototype-${v.toLowerCase()}-1085x900.png`);
    await measure(`${v} demo 1085 en`);
    if (v === 'C') {
      await evaluate(`document.querySelector('#bp-trigger').click()`);
      await sleep(250);
      await shot('prototype-c-popover-1085x900.png');
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    }
    if (v === 'A' || v === 'B') {
      await evaluate(`document.querySelector('#bp-trigger').click()`);
      await sleep(250);
      await shot(`prototype-${v.toLowerCase()}-popover-1085x900.png`);
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    }
  }
  // Empty-state comparison (variant A, as the reference header), against a
  // genuinely empty Prep so the cards below agree with the header.
  await open(1085, 900, 'en', PROTOTYPE_HASH, false);
  await clickProto('variant', 'A');
  await clickProto('data', 'current');
  await clickProto('empty', 'always');
  await sleep(150);
  await shot('empty-always-show-1085x900.png');
  await measure('A empty always 1085 en');
  await clickProto('empty', 'hide');
  await sleep(150);
  await shot('empty-hidden-1085x900.png');
  await evaluate(`window.__bpHidden = !document.querySelector('#bp-slot').children.length`);

  // Width matrix for every variant: demo data, plus over-budget + Russian.
  for (const [w, h] of [[1085, 900], [1280, 800], [1440, 900]]) {
    await open(w, h, 'en');
    for (const v of variants) {
      await clickProto('variant', v);
      await clickProto('data', 'demo');
      await clickProto('empty', 'always');
      await sleep(120);
      await measure(`${v} demo ${w} en`);
      if (w === 1440) await shot(`prototype-${v.toLowerCase()}-1440x900.png`);
      if (w === 1280) await shot(`prototype-${v.toLowerCase()}-1280x800.png`);
    }
  }
  for (const [w, h] of [[1085, 900], [1280, 800]]) {
    await open(w, h, 'ru');
    for (const v of variants) {
      await clickProto('variant', v);
      await clickProto('data', 'demo');
      await sleep(120);
      await measure(`${v} demo ${w} ru`);
      if (w === 1085) await shot(`prototype-${v.toLowerCase()}-1085x900-ru.png`);
      if (w === 1280) await shot(`prototype-${v.toLowerCase()}-1280x800-ru.png`);
    }
  }

  // Baseline: the ordinary Prep page (flag off) at each width, for comparison
  // with the prototype pages' scrollWidth above.
  const baseline = [];
  for (const [w, h, lang] of [[1085, 900, 'en'], [1085, 900, 'ru'], [1280, 800, 'en'], [1440, 900, 'en']]) {
    await open(w, h, lang, '#/prep');
    baseline.push(Object.assign({ width: w, lang }, await evaluate(`({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, strip: !!document.querySelector('#bp-proto-strip'), slot: !!document.querySelector('#bp-slot'), midHead: !!document.querySelector('.prep-central-head--mid'), popover: !!document.querySelector('#bp-popover') })`)));
  }
  console.log('baseline (flag off):', JSON.stringify(baseline));
  report.push({ tag: 'baseline', baseline });
  fs.writeFileSync(path.join(OUT, 'layout-report.json'), JSON.stringify(report, null, 2));
  for (const r of report.filter(x => x.tag !== 'baseline')) {
    const flags = [];
    if (r.overlaps.length) flags.push('OVERLAP ' + r.overlaps.join(','));
    if (r.titleClipped) flags.push('title-clipped');
    if (r.slotOverflow) flags.push('slot-overflow');
    if (r.slotSingleRow === false) flags.push('WRAPPED');
    if (r.pageHScroll) flags.push('PAGE-HSCROLL');
    console.log(r.tag.padEnd(26), `head ${r.headHeight}px slot ${r.slot ? r.slot.w : '-'}px sw ${r.scrollWidth}/${r.clientWidth}`, flags.length ? flags.join(' ') : 'ok');
  }

  cdp.close();
  browser.proc.kill();
  server.close();
  try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch { /* profile still locked; harmless */ }
}

main().catch(err => { console.error(err); process.exit(1); });
