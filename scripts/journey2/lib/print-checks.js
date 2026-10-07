'use strict';
/* ============================================================
   Bacchus's Atlas — scripts/journey2/lib/print-checks.js
   Browser verification of Journey 2 Phase F (PD-028): the two-page black-and-white player map Print Preview and its physical print.
   Real pointer/keyboard input in a FRESH browser context (the owner's browser storage is never touched). The scenario: several
   prepared regions (one crossing the seam), only a few cells revealed, one sanctuary name revealed on each page and one left hidden,
   a hex Environment, Soul Echoes and Biome colors on — then Player Preview (fog visible) and Print Preview (no fog, no tint, no
   Environment, no Echo, only what players may know), camera independence, the single window.print() call, print-media layout and a
   real print-to-PDF page count, then the key flow again in Russian.
   Shared by stage1-verify.js (full run) and browser-verify.js (quick run); also runnable alone:
     node scripts/journey2/lib/print-checks.js

   runPrintChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc })
   ============================================================ */
const fs = require('fs');
const path = require('path');

async function runPrintChecks(env) {
  const { browser, base, check, shot, logs, attachLogging, Geo, Model, template, anchorsDoc } = env;
  const ctx0 = Model.createContext(template, anchorsDoc), grid = ctx0.grid;
  const SEAM_X = template.composition.seam.worldX;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---- fixtures ---- */
  const ok = (q, r) => ctx0.placeable(q, r);
  function rowNear(x, y, len) {
    for (let dy = 0; dy < 600; dy += 20) for (const sy of [y + dy, y - dy]) {
      const c0 = grid.worldToCell(x, sy);
      for (const off of Array.from({ length: 2 * len + 1 }, (_, i) => i - len).sort((a, b) => Math.abs(a + len / 2) - Math.abs(b + len / 2))) {
        let all = true;
        for (let i = 0; i < len; i++) if (!ok(c0.q + off + i, c0.r)) { all = false; break; }
        if (all) return Array.from({ length: len }, (_, i) => Geo.cellId(c0.q + off + i, c0.r));
      }
    }
    throw new Error('no free row near ' + x + ',' + sy);
  }
  const SEAM_ROW = rowNear(SEAM_X, 1300, 6);               // crosses the seam
  const WEST_ROW = rowNear(700, 2100, 4), EAST_ROW = rowNear(4100, 1700, 4);
  const firstEast = SEAM_ROW.findIndex(c => { const p = Geo.parseCellId(c); return grid.cellCenter(p.q, p.r)[0] >= SEAM_X; });
  const lo = Math.max(1, Math.min(firstEast - 2, SEAM_ROW.length - 5));
  const REVEALED = SEAM_ROW.slice(lo, lo + 4);             // four tiles straddling the seam; the row's end cells stay hidden (a divider-free open end)
  const NEIGHBOURS = Array.from(new Set(REVEALED.flatMap(c => { const p = Geo.parseCellId(c); return Geo.NEIGHBOR_DELTAS.map(d => Geo.cellId(p.q + d.dq, p.r + d.dr)); }))).filter(c => !SEAM_ROW.includes(c) && Model.isFoggableCell(ctx0, c));
  const REVEAL_CELLS = REVEALED.concat(NEIGHBOURS);        // revealed empty neighbours are what make outer boundary edges appear
  const sanctuariesWest = ctx0.sanctuaries.filter(s => s.x < SEAM_X - 300), sanctuariesEast = ctx0.sanctuaries.filter(s => s.x > SEAM_X + 300);
  const ID_W = sanctuariesWest[Math.floor(sanctuariesWest.length / 2)].id, ID_E = sanctuariesEast[Math.floor(sanctuariesEast.length / 2)].id;
  const ID_HIDDEN = sanctuariesEast[Math.floor(sanctuariesEast.length / 2) + 1].id;

  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'en-US' });
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } } catch (e) { /* storage unavailable */ } });
  const page = await context.newPage();
  attachLogging(page, logs, 'print');
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const st = () => page.evaluate(() => Journey2View.debugState());
  const dispatch = cmd => page.evaluate(c => Journey2View.debugApi().dispatch(c), cmd);
  const storage = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('dhcodex_journey2_')).sort().map(k => [k, localStorage.getItem(k)])));
  const rootHtml = () => page.evaluate(() => { const r = document.querySelector('.j2-print-root'); return r ? r.outerHTML : null; });

  await page.goto(base + '#/journey2');
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
  await sleep(300);
  const mkBatch = (biome, size) => page.evaluate(([b, size]) => {
    const M = Journey2Model, id = M.newId('b');
    const region = { habitat: { biome: b, blighted: false, overtaken: false, source: 'rolled', rolls: [6] }, terrain: { value: 3, source: 'rolled' }, size, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 12 };
    return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null;
  }, [biome, size]);
  const bSeam = await mkBatch('forest', 6), bWest = await mkBatch('mountain', 4), bEast = await mkBatch('aquatic', 4);
  const placeRow = (batchId, cells, prefix) => dispatch({ type: 'place', allowDetached: true, batchId, tiles: cells.map((cell, i) => ({ id: prefix + i, cell })) });
  const r1 = await placeRow(bSeam, SEAM_ROW, 's'), r2 = await placeRow(bWest, WEST_ROW, 'w'), r3 = await placeRow(bEast, EAST_ROW, 'e');
  if (!r1.ok || !r2.ok || !r3.ok) throw new Error('fixture placement failed ' + JSON.stringify([r1, r2, r3].map(r => r.error)));
  await dispatch({ type: 'setCellsRevealed', cellKeys: REVEAL_CELLS, revealed: true });
  await dispatch({ type: 'setTileEnvironment', tileId: 's1', environmentId: 'time-loop' });
  await page.click('[data-j2-sanc-generate]'); await sleep(500);
  await page.click('[data-j2-echo-place]'); await sleep(300);
  await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: ID_W, revealed: true });
  await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: ID_E, revealed: true });
  const doc0 = await docNow();
  const nameOf = id => doc0.sanctuaries.entries.find(e => e.anchorId === id).name;
  const biomeOn = await page.getAttribute('[data-j2-biome-colors]', 'aria-pressed');

  const enterPreview = async () => { await page.click('[data-j2-preview]'); await sleep(350); };
  const openPrint = async () => { await page.click('[data-j2-print-open]'); await page.waitForSelector('[data-pp-print]:not([disabled])', { timeout: 30000 }); await sleep(250); };
  const closePrint = async () => { await page.click('[data-pp-back]'); await sleep(250); };

  await check('print.01.button-only-in-player-preview', async () => {
    const gm = await page.locator('[data-j2-print-open]').isVisible();
    await enterPreview();
    const pv = await page.locator('[data-j2-print-open]').isVisible();
    const label = await page.locator('[data-j2-print-open]').innerText();
    return { ok: !gm && pv && label === 'Print player map', detail: { gm, pv, label, biomeOn } };
  });

  await check('print.02.screen-preview-still-shows-fog', async () => {
    const r = await page.evaluate(() => ({ veil: (document.querySelector('[data-j2-fog-veil]') || { getAttribute: () => '' }).getAttribute('d').length, tinted: document.querySelectorAll('[data-j2-g="player"] .j2-biome-tint').length }));
    await shot(page, 'print-01-screen-preview.png');
    return { ok: r.veil > 100, detail: r };
  });

  const stateBefore = { doc: JSON.stringify(await docNow()), storage: await storage(), hist: JSON.stringify((await st()).history), cam: JSON.stringify((await st()).camera) };
  await openPrint();
  await shot(page, 'print-02-preview.png');

  await check('print.03.exactly-two-a4-pages-with-heading-and-focus', async () => {
    const r = await page.evaluate(() => ({
      pages: Array.from(document.querySelectorAll('.j2-print-page')).map(p => p.getAttribute('data-page')),
      roots: document.querySelectorAll('.j2-print-root').length,
      heading: document.querySelector('.j2-pp-title').textContent, tag: document.querySelector('.j2-pp-title').tagName,
      labels: Array.from(document.querySelectorAll('.j2-pp-pagelabel')).map(x => x.textContent),
      focus: document.activeElement && document.activeElement.className, status: document.querySelector('[data-pp-status]').textContent,
      print: !document.querySelector('[data-pp-print]').disabled, summary: document.querySelector('[data-pp-summary]').textContent,
      inert: document.querySelector('.j2').inert, bodyMode: document.body.classList.contains('j2-printpreview-mode'),
    }));
    return { ok: r.pages.join() === 'v1,v2' && r.roots === 1 && r.heading === 'Player Map Print Preview' && r.tag === 'H2' && r.labels.join('|') === 'Page 1 of 2|Page 2 of 2' &&
      r.focus === 'j2-pp-title' && r.status === 'Map pages are ready' && r.print && /Two-page player map\. 4 wilderness hexes revealed\. 2 sanctuary names known\./.test(r.summary) && r.inert && r.bodyMode, detail: r };
  });

  await check('print.04.pages-are-the-two-original-halves', async () => {
    const r = await page.evaluate(() => Array.from(document.querySelectorAll('.j2-print-page svg')).map(s => ({
      viewBox: s.getAttribute('viewBox'), g: s.querySelector(':scope > g').getAttribute('transform'), img: s.querySelector('image.j2-pp-base').getAttribute('href'),
      w: s.querySelector('image.j2-pp-base').getAttribute('width'), h: s.querySelector('image.j2-pp-base').getAttribute('height'),
    })));
    const [a, b] = template.composition.panels.map(p => p.worldRectPx);
    return { ok: r.length === 2 && r[0].viewBox === `0 0 ${a[2]} ${a[3]}` && r[1].viewBox === `0 0 ${b[2]} ${b[3]}` && r[0].g === 'translate(0 0)' && r[1].g === `translate(${-b[0]} 0)` &&
      r.every(x => /valloren-world\.webp/.test(x.img) && Number(x.w) === template.worldSizePx[0] && Number(x.h) === template.worldSizePx[1]), detail: r };
  });

  await check('print.05.no-fog-tint-environment-echo-or-colour', async () => {
    const r = await page.evaluate(() => {
      const root = document.querySelector('.j2-print-root');
      const bad = root.querySelectorAll('[class*="fog"], .j2-biome-tint, .j2-biome-layer, .j2-biome-halo, .j2-echo, .j2-sanc-ring, [data-env], [data-tile-id], pattern, filter, linearGradient').length;
      const colours = new Set();
      for (const e of root.querySelectorAll('.j2-pp-gen *, .j2-pp-perimeter *, .j2-pp-labels *')) { const c = getComputedStyle(e); colours.add(c.fill); colours.add(c.stroke); }
      const html = root.innerHTML;
      return { bad: bad, colours: Array.from(colours), ids: /b_|tile|batch|environment|time-loop|echo|region/i.test(html.replace(/<image[^>]*>/g, '').replace(/class="[^"]*"/g, '')) };
    });
    const allowed = new Set(['none', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
    return { ok: r.bad === 0 && r.colours.every(c => allowed.has(c)) && !r.ids, detail: r };
  });

  await check('print.06.generated-content-only-in-revealed-cells', async () => {
    const r = await page.evaluate(() => Array.from(document.querySelectorAll('.j2-print-page')).map(p => ({
      id: p.getAttribute('data-page'),
      syms: Array.from(p.querySelectorAll('image.j2-tile-sym')).map(i => [Number(i.getAttribute('x')) + Number(i.getAttribute('width')) / 2, Number(i.getAttribute('y')) + Number(i.getAttribute('height')) / 2]),
      dots: p.querySelectorAll('.j2-tile-dot').length, hexes: (p.querySelector('.j2-tile-hex') || { getAttribute: () => '' }).getAttribute('d').split('M').length - 1,
    })));
    const revealed = new Set(REVEALED);
    const cells = r.flatMap(p => p.syms.map(c => Geo.cellId(grid.worldToCell(c[0], c[1]).q, grid.worldToCell(c[0], c[1]).r)));
    const total = r.reduce((a, p) => a + p.syms.length, 0);
    return { ok: total >= REVEALED.length - 1 && cells.every(c => revealed.has(c)) && r.every(p => p.hexes <= REVEALED.length), detail: { r: r.map(p => ({ id: p.id, syms: p.syms.length, dots: p.dots, hexes: p.hexes })), cells } };
  });

  await check('print.07.seam-content-is-clipped-not-moved', async () => {
    const r = await page.evaluate(() => Array.from(document.querySelectorAll('.j2-print-page')).map(p => ({ id: p.getAttribute('data-page'), overlays: Number(p.querySelector('.j2-pp-gen').getAttribute('data-pp-overlays')), segs: Number(p.querySelector('.j2-pp-perimeter').getAttribute('data-pp-segments')) })));
    const west = REVEALED.filter(c => { const p = Geo.parseCellId(c); return grid.cellCenter(p.q, p.r)[0] < SEAM_X; }).length, east = REVEALED.length - west;
    return { ok: r[0].overlays >= west && r[1].overlays >= east && r[0].overlays + r[1].overlays >= REVEALED.length && r[0].segs > 0 && r[1].segs > 0, detail: { r, west, east } };
  });

  await check('print.08.only-revealed-sanctuary-names-on-their-own-page', async () => {
    const r = await page.evaluate(() => ({
      v1: Array.from(document.querySelectorAll('[data-page="v1"] .j2-sanc-label')).map(l => l.getAttribute('data-anchor') + ':' + l.textContent),
      v2: Array.from(document.querySelectorAll('[data-page="v2"] .j2-sanc-label')).map(l => l.getAttribute('data-anchor') + ':' + l.textContent),
      all: document.querySelector('.j2-print-root').textContent,
    }));
    const hidden = nameOf(ID_HIDDEN);
    return { ok: r.v1.length === 1 && r.v2.length === 1 && r.v1[0].startsWith(ID_W + ':') && r.v2[0].startsWith(ID_E + ':') && r.all.includes(nameOf(ID_W)) && r.all.includes(nameOf(ID_E)) && (hidden === nameOf(ID_W) || hidden === nameOf(ID_E) || !r.all.includes(hidden)), detail: { r: { v1: r.v1, v2: r.v2 }, hidden } };
  });

  await check('print.09.screen-reader-sees-no-generated-svg', async () => {
    const r = await page.evaluate(() => ({ hidden: Array.from(document.querySelectorAll('.j2-print-page svg')).every(s => s.getAttribute('aria-hidden') === 'true'), groups: Array.from(document.querySelectorAll('.j2-print-page')).map(p => p.getAttribute('aria-label')) }));
    return { ok: r.hidden && r.groups.join() === 'Page 1 of 2,Page 2 of 2', detail: r };
  });

  await check('print.10.print-calls-window-print-once-and-changes-nothing', async () => {
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls++; }; });
    const html0 = await rootHtml();
    await page.click('[data-pp-print]'); await sleep(500);
    const calls = await page.evaluate(() => window.__printCalls);
    const same = (await rootHtml()) === html0;
    const unchanged = JSON.stringify(await docNow()) === stateBefore.doc && (await storage()) === stateBefore.storage && JSON.stringify((await st()).history) === stateBefore.hist;
    const still = await page.locator('.j2-print-page').count();
    return { ok: calls === 1 && same && unchanged && still === 2, detail: { calls, same, unchanged, still } };
  });

  await check('print.11.print-media-shows-only-the-two-sheets', async () => {
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => {
      const shown = e => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden'; };
      const pages = Array.from(document.querySelectorAll('.j2-print-page'));
      return {
        pages: pages.filter(shown).length, bar: shown(document.querySelector('.j2-pp-bar')), label: pages.some(p => shown(p.querySelector('.j2-pp-pagelabel'))),
        app: Array.from(document.body.children).filter(e => !e.classList.contains('j2-printpreview') && shown(e) && e.tagName !== 'SCRIPT').map(e => e.tagName + '#' + e.id),
        pageName: getComputedStyle(document.querySelector('.j2-print-root')).page || 'n/a', h: pages.map(p => Math.round(p.getBoundingClientRect().height)),
        brk: pages.map(p => getComputedStyle(p).breakAfter),
      };
    });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const txt = pdf.toString('latin1');
    const count = (txt.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    const box = (txt.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/) || []).slice(1).map(Number);
    fs.writeFileSync(path.join(process.env.J2_SHOT_DIR || require('os').tmpdir(), 'j2-player-print.pdf'), pdf);
    await page.emulateMedia({ media: 'screen' });
    return { ok: r.pages === 2 && !r.bar && !r.label && r.app.length === 0 && r.brk.join() === 'page,auto' && count === 2 && box.length === 2 && Math.abs(box[0] - 595) < 2 && Math.abs(box[1] - 842) < 2, detail: { r, pdfPages: count, box } };
  });

  await check('print.12.independent-of-camera-sidebar-and-biome-preference', async () => {
    const html0 = await rootHtml();
    await closePrint();
    await page.evaluate(() => Journey2View.debugApi().setCamera({ scale: 2, tx: -900, ty: -400 })); await sleep(200);
    await page.click('[data-j2-zoom="in"]').catch(() => {});
    await page.click('[data-j2-fit]'); await sleep(300);
    await openPrint();
    const html1 = await rootHtml();
    return { ok: html0 === html1 && html0 !== null, detail: { equal: html0 === html1 } };
  });

  await check('print.13.back-returns-to-player-preview-not-gm', async () => {
    await page.keyboard.press('Escape'); await sleep(300);
    const r = await page.evaluate(() => ({
      root: !!document.querySelector('.j2-printpreview'), mode: document.querySelector('.j2').getAttribute('data-mode'), inert: document.querySelector('.j2').inert,
      bodyMode: document.body.classList.contains('j2-printpreview-mode'), focus: document.activeElement && document.activeElement.hasAttribute('data-j2-print-open'),
    }));
    const unchanged = JSON.stringify(await docNow()) === stateBefore.doc && (await storage()) === stateBefore.storage && JSON.stringify((await st()).history) === stateBefore.hist;
    return { ok: !r.root && r.mode === 'preview' && !r.inert && !r.bodyMode && r.focus && unchanged, detail: { r, unchanged } };
  });

  await check('print.14.russian', async () => {
    await page.evaluate(() => document.querySelector('[data-lang="ru"]').click()); await sleep(500);
    const btn = await page.locator('[data-j2-print-open]').innerText();
    await openPrint();
    await shot(page, 'print-03-ru-preview.png');
    const r = await page.evaluate(() => ({
      heading: document.querySelector('.j2-pp-title').textContent, labels: Array.from(document.querySelectorAll('.j2-pp-pagelabel')).map(x => x.textContent),
      status: document.querySelector('[data-pp-status]').textContent, print: document.querySelector('[data-pp-print]').textContent, back: document.querySelector('[data-pp-back]').textContent,
      summary: document.querySelector('[data-pp-summary]').textContent, pages: document.querySelectorAll('.j2-print-page').length,
      fog: document.querySelectorAll('.j2-print-root [class*="fog"], .j2-print-root .j2-biome-tint, .j2-print-root .j2-echo').length,
    }));
    // a language switch while the preview is open rebuilds the text, not the data
    await page.evaluate(() => document.querySelector('[data-lang="en"]').click()); await sleep(500);
    const en = await page.evaluate(() => ({ heading: document.querySelector('.j2-pp-title') && document.querySelector('.j2-pp-title').textContent, pages: document.querySelectorAll('.j2-print-page').length, print: document.querySelector('[data-pp-print]') && !document.querySelector('[data-pp-print]').disabled }));
    await closePrint();
    return { ok: btn === 'Распечатать карту игроков' && r.heading === 'Предпросмотр печати карты игроков' && r.labels.join('|') === 'Страница 1 из 2|Страница 2 из 2' && r.status === 'Страницы карты готовы' && r.print === 'Печать' &&
      r.back === 'Назад к виду игроков' && r.pages === 2 && r.fog === 0 && /Карта игроков на двух листах/.test(r.summary) && en.heading === 'Player Map Print Preview' && en.pages === 2 && en.print, detail: { btn, r, en } };
  });

  await check('print.15.empty-reveal-set-prints-the-plain-old-map', async () => {
    await page.click('[data-j2-preview-back]'); await sleep(300);
    await dispatch({ type: 'setCellsRevealed', cellKeys: REVEAL_CELLS, revealed: false });
    await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: ID_W, revealed: false });
    await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: ID_E, revealed: false });
    await enterPreview(); await openPrint();
    const r = await page.evaluate(() => ({ pages: document.querySelectorAll('.j2-print-page').length, syms: document.querySelectorAll('.j2-print-root .j2-tile-sym').length, segs: document.querySelectorAll('.j2-print-root .j2-perimeter').length, labels: document.querySelectorAll('.j2-print-root .j2-sanc-label').length, print: !document.querySelector('[data-pp-print]').disabled }));
    await shot(page, 'print-04-empty.png');
    await closePrint();
    return { ok: r.pages === 2 && r.syms === 0 && r.segs === 0 && r.labels === 0 && r.print, detail: r };
  });

  await page.close(); await context.close();
}

module.exports = { runPrintChecks };

if (require.main === module) {
  (async () => {
    const { chromium } = require('playwright');
    const { serve } = require('./static-server.js');
    const root = path.join(__dirname, '..', '..', '..');
    const Geo = require(path.join(root, 'js/journey2-geometry.js')), Model = require(path.join(root, 'js/journey2-model.js'));
    const template = JSON.parse(fs.readFileSync(path.join(root, 'data/journey2/map-template.json'), 'utf8'));
    const anchorsDoc = JSON.parse(fs.readFileSync(path.join(root, 'data/journey2/map-anchors.json'), 'utf8'));
    const { server, base } = await serve(root, {});
    const browser = await chromium.launch(process.env.J2_BROWSER_CHANNEL ? { channel: process.env.J2_BROWSER_CHANNEL } : {});
    const logs = [], results = [];
    const record = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + id + (!ok ? '  ' + JSON.stringify(detail) : '')); };
    const check = async (id, fn) => { try { const r = await fn(); if (r === true || r === undefined) record(id, true); else if (r && typeof r === 'object' && 'ok' in r) record(id, r.ok, r.detail); else record(id, !!r, r); } catch (e) { record(id, false, String(e && e.stack || e)); } };
    const outDir = process.env.J2_SHOT_DIR || path.join(require('os').tmpdir(), 'j2-print');
    fs.mkdirSync(outDir, { recursive: true });
    process.env.J2_SHOT_DIR = outDir;
    const shot = (page, name) => page.screenshot({ path: path.join(outDir, name) });
    const attachLogging = (page, sink, label) => { page.on('console', m => { if (m.type() === 'error') sink.push(`[${label}] console.error: ${m.text()}`); }); page.on('pageerror', e => sink.push(`[${label}] pageerror: ${e.message}`)); };
    await runPrintChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc });
    const bad = logs.filter(l => !/favicon|fonts\.g|ERR_INTERNET|net::ERR/.test(l));
    record('print.hygiene.no-console-errors', bad.length === 0, bad.slice(0, 8));
    console.log('artifacts: ' + outDir);
    await browser.close(); await server.close();
    process.exit(results.every(r => r.ok) ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(2); });
}
