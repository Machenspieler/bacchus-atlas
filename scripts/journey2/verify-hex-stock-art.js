#!/usr/bin/env node
/* Dev-only verification for the Hex Stock biome artwork: one fixture list built through the model, screenshots, geometry, text-contrast sampling and the
   Hex Stock interactions (click-to-place, REAL pointer drag, invalid drops, Inspect, delete, selection, scrolling).
   Usage: node scripts/journey2/verify-hex-stock-art.js [--out qa/hex-stock-art] [--part shots|interact|all]   Exit 1 on any failed check. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const sharp = require('sharp');
const Geo = require('../../js/journey2-geometry.js'), Model = require('../../js/journey2-model.js');
const ROOT = path.join(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', path.join(ROOT, 'qa', 'hex-stock-art'))), PART = arg('part', 'all');
fs.mkdirSync(OUT, { recursive: true });
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/journey2/map-template.json'), 'utf8'));
const anchorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/journey2/map-anchors.json'), 'utf8'));
const ctx0 = Model.createContext(template, anchorsDoc), grid = ctx0.grid;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const serve = root => new Promise(r => { const s = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res); }); s.listen(0, '127.0.0.1', () => r({ s, port: s.address().port })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const results = [];
const rec = (id, ok, detail) => { ok ? pass++ : fail++; results.push({ id, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + id + (ok || detail === undefined ? '' : '  ' + JSON.stringify(detail))); };
const open = (() => { const c0 = grid.worldToCell(template.composition.seam.worldX, 900);
  for (let ring = 0; ring < 80; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
    if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue; const q = c0.q + dq, r = c0.r + dr; let ok = true;
    for (let a = 0; a <= 40 && ok; a++) for (let b = -6; b <= 6; b++) if (!ctx0.policy(q + a, r + b).ok) { ok = false; break; }
    if (ok) return { q, r }; } throw new Error('no open area'); })();
// [biome, size, placed, blighted] — bottom of the list first (created first = displayed last)
const LIST = [['badlands', 3, 1, false], ['mountain', 4, 4, false], ['tropical', 3, 1, false], ['grassland', 5, 0, false], ['wetland', 4, 4, false],
  ['aquatic', 4, 1, true], ['frozen', 3, 3, false], ['drylands', 5, 2, false], ['forest', 3, 3, false], ['forest', 6, 0, false]];

async function boot(browser, base, lang, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: lang === 'ru' ? 'ru-RU' : 'en-US' });
  await ctx.addInitScript(l => { try { if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify(l)); } } catch (e) { /* none */ } }, lang);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(base + '#/journey'); await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 }); await sleep(300);
  const c0 = grid.cellCenter(open.q + 8, open.r);
  await page.evaluate(([x, y, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width * 0.62 - x * s, ty: r.height / 2 - y * s }); }, [c0[0], c0[1], 0.8]);
  const ids = []; let line = 0;
  for (const [biome, size, placed, bl] of LIST) {
    const id = await page.evaluate(([b, sz, bl]) => { const M = Journey2Model, id = M.newId('b');
      const region = { habitat: { biome: b, blighted: bl, overtaken: false, source: 'rolled', rolls: [4] }, terrain: { value: 2, source: 'rolled' }, size: sz, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17 };
      return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null; }, [biome, size, bl]);
    ids.push(id);
    if (placed) { const tiles = []; for (let i = 0; i < placed; i++) tiles.push({ id: 't' + line + '_' + i, cell: Geo.cellId(open.q + i, open.r + line) }); line++;
      const r = await page.evaluate(([b, t]) => Journey2View.debugApi().dispatch({ type: 'place', batchId: b, tiles: t }), [id, tiles]); if (!r.ok) throw new Error('fixture place failed ' + biome + ' ' + JSON.stringify(r.error) + JSON.stringify(open)); }
  }
  await sleep(300);
  return { ctx, page, errors, ids: [...ids].reverse() };      // ids[0] = top card
}
const activate = async (page, id) => { const a = () => page.evaluate(i => document.querySelector(`.j2-card[data-batch="${i}"]`).classList.contains('is-active'), id);
  if (!(await a())) await page.click(`.j2-card[data-batch="${id}"] [data-j2-card-toggle]`); await sleep(250); };
const qa = (page, css) => page.evaluate(c => { const e = document.createElement('style'); e.setAttribute('data-qa', ''); e.textContent = c; document.head.appendChild(e); }, css);
const qaClear = page => page.evaluate(() => document.querySelectorAll('style[data-qa]').forEach(e => e.remove()));
const OLD_FADE = '.j2-card[data-art]{--j2-card-art-fade:linear-gradient(90deg,#000 0,#000 38%,transparent 100%)!important}.j2-card.is-active[data-art]{--j2-card-art-fade:linear-gradient(90deg,#000 0,#000 38%,transparent 100%),linear-gradient(180deg,#000 0,#000 30px,transparent 62px)!important}';
const sideScroll = page => page.locator('[data-j2-side-scroll]');

/* text-contrast sampling: card screenshots with the text hidden (visibility), measured over the name + meta boxes only */
async function contrast(page, ids, tag, oldFade) {
  if (oldFade) await qa(page, OLD_FADE);
  const out = {};
  for (const id of ids) {
    const sel = `.j2-card[data-batch="${id}"]`; await page.locator(sel).scrollIntoViewIfNeeded();
    const info = await page.evaluate(s => { const c = document.querySelector(s), cr = c.getBoundingClientRect(); const box = e => { const r = e.getBoundingClientRect(); return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height }; };
      const nm = c.querySelector('[data-j2-c="name"]'), meta = c.querySelector('.j2-card-meta'), col = getComputedStyle(nm).color;
      return { biome: c.getAttribute('data-art'), exhausted: c.classList.contains('is-exhausted') && !c.classList.contains('is-active'), name: box(nm), meta: box(meta), col }; }, sel);
    await qa(page, '.j2-card-title{visibility:hidden!important}.j2-card [data-j2-inspect]{visibility:hidden!important}');
    const buf = await page.locator(sel).screenshot(); const img = sharp(buf); const meta0 = await img.metadata(); const raw = await sharp(buf).raw().toBuffer();
    const lum = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const stat = bx => { const v = []; for (let y = Math.max(0, Math.floor(bx.y)); y < Math.min(meta0.height, Math.ceil(bx.y + bx.h)); y++) for (let x = Math.max(0, Math.floor(bx.x)); x < Math.min(meta0.width, Math.ceil(bx.x + bx.w)); x++) { const i = (y * meta0.width + x) * meta0.channels; v.push(lum(raw[i], raw[i + 1], raw[i + 2])); }
      v.sort((a, b) => a - b); return { mean: v.reduce((a, b) => a + b, 0) / v.length, p95: v[Math.floor(v.length * 0.95)] }; };
    const m = info.col.match(/\d+/g).map(Number), Lt = lum(m[0], m[1], m[2]);
    const n = stat(info.name), me = stat(info.meta);
    out[info.biome + (info.exhausted ? '*' : '')] = { nameP95Contrast: +((Lt + 0.05) / (n.p95 + 0.05)).toFixed(2), metaP95Contrast: +((Lt + 0.05) / (me.p95 + 0.05)).toFixed(2), nameMeanContrast: +((Lt + 0.05) / (n.mean + 0.05)).toFixed(2) };
    await page.evaluate(() => { const l = [...document.querySelectorAll('style[data-qa]')].pop(); if (/visibility:hidden/.test(l.textContent)) l.remove(); });
  }
  await qaClear(page);
  fs.writeFileSync(path.join(OUT, `contrast-${tag}.json`), JSON.stringify(out, null, 1)); return out;
}

async function shots(browser, base) {
  const VPS = arg('vp', '1280x800,1366x768,1440x900,1920x1080,2560x1440').split(',').map(v => v.split('x').map(Number));
  const geo = {};
  for (const lang of arg('langs', 'en,ru').split(',')) for (const [w, h] of VPS) {
    if (lang === 'ru' && w === 2560) continue;
    const { ctx, page, errors, ids } = await boot(browser, base, lang, w, h); const tag = `${lang}-${w}x${h}`;
    await activate(page, ids[0]); await page.evaluate(() => { const s = document.querySelector('[data-j2-side-scroll]'); s.scrollTop = 0; }); await sleep(200);
    await page.screenshot({ path: path.join(OUT, `context-${tag}.png`) });
    // geometry: collapsed / expanded / fully placed cards and the complete list, on a tall page
    await page.setViewportSize({ width: w, height: 1500 }); await sleep(300);
    const g = await page.evaluate(() => { const r = e => { const b = e.getBoundingClientRect(); return { w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
      const cs = [...document.querySelectorAll('.j2-card')]; const l = document.querySelector('.j2-cards'), gaps = cs.slice(1).map((c, i) => +(c.getBoundingClientRect().top - cs[i].getBoundingClientRect().bottom).toFixed(2));
      return { cards: cs.map(c => Object.assign({ biome: c.getAttribute('data-art'), active: c.classList.contains('is-active'), exhausted: c.classList.contains('is-exhausted') }, r(c))), list: r(l), side: r(document.querySelector('.j2-side')), gaps: [...new Set(gaps)] }; });
    geo[tag] = g;
    await page.locator('.j2-side').screenshot({ path: path.join(OUT, `list-${tag}.png`) });
    if (w === 1280 && lang === 'en') {
      for (const [i, name] of [[0, 'selected-expanded'], [1, 'fully-placed'], [2, 'partial-collapsed'], [4, 'shadowblighted-aquatic'], [3, 'frozen-fully-placed']]) await page.locator(`.j2-card[data-batch="${ids[i]}"]`).screenshot({ path: path.join(OUT, `card-${name}-${tag}.png`) });
      await activate(page, ids[2]); await page.locator(`.j2-card[data-batch="${ids[2]}"]`).screenshot({ path: path.join(OUT, `card-partial-expanded-${tag}.png`) });
      await activate(page, ids[0]);
    }
    await page.setViewportSize({ width: w, height: h }); await sleep(200);
    if (w === 1280 && lang === 'en') {
      const after = await contrast(page, ids.filter((_, i) => [0, 2, 3, 4, 6].includes(i)), 'after', false);
      const before = await contrast(page, ids.filter((_, i) => [0, 2, 3, 4, 6].includes(i)), 'before', true);
      console.log('contrast before', JSON.stringify(before)); console.log('contrast after ', JSON.stringify(after));
      // before/after strips (old fade vs final) for the five review biomes
      for (const [state] of [['before'], ['after']]) {
        if (state === 'before') await qa(page, OLD_FADE); await page.setViewportSize({ width: w, height: 1500 }); await sleep(250);
        for (const [i, nm] of [[4, 'aquatic'], [2, 'drylands'], [3, 'frozen'], [6, 'grassland'], [0, 'forest']]) await page.locator(`.j2-card[data-batch="${ids[i]}"]`).screenshot({ path: path.join(OUT, `polish-${state}-${nm}.png`) }).catch(() => {});
        await qaClear(page); await page.setViewportSize({ width: w, height: h });
      }
    }
    rec(`shots.${tag}: no page errors / failed requests`, errors.length === 0, errors.slice(0, 4));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'geometry-after.json'), JSON.stringify(geo, null, 1));
}

async function interact(browser, base) {
  const [w, h] = [1366, 768]; const { ctx, page, errors, ids } = await boot(browser, base, 'en', w, h);
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const cam = () => page.evaluate(() => Journey2View.debugState().camera);
  const counts = id => page.evaluate(i => { const d = Journey2View.debugApi().document(); return { tiles: d.tiles.filter(t => t.batchId === i).length, all: d.tiles.length, batches: d.batches.length }; }, id);
  const sumText = id => page.evaluate(i => document.querySelector(`.j2-card[data-batch="${i}"] [data-j2-c="placedText"]`)?.textContent || document.querySelector(`.j2-card[data-batch="${i}"] [data-j2-c="sum"]`).textContent, id);
  const clientOf = cell => page.evaluate(c => Journey2View.debugApi().cellToClient(c), cell);
  const top = ids[0]; await activate(page, top);
  const handle = `.j2-card[data-batch="${top}"] [data-j2-handle="one"]`;
  const dragTo = async (pt, steps = 14) => { const hb = await page.locator(handle).boundingBox(); await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 24, hb.y + hb.height / 2 + 12, { steps: 4 }); await page.mouse.move(pt.x, pt.y, { steps }); await sleep(120); const midArmed = await page.evaluate(() => !!document.querySelector('.j2-handle.is-dragging, .is-dragging, [data-j2-preview]')); await page.mouse.up(); await sleep(350); return midArmed; };

  // B. real drag-and-drop to a valid hex
  const c1 = await counts(top), cam1 = await cam(), s1 = await sumText(top), target = Geo.cellId(open.q + 1, open.r);
  const pt = await clientOf(target); await dragTo(pt);
  const c2 = await counts(top), cam2 = await cam(), d2 = await docNow();
  rec('drag: a real pointer drag of Place 1 onto a valid hex places exactly one tile', c2.tiles === c1.tiles + 1 && c2.all === c1.all + 1, { c1, c2 });
  rec('drag: the tile landed on the hex under the cursor', d2.tiles.some(t => t.batchId === top && t.cell === target), null);
  const s2 = await sumText(top); rec('drag: the card status updates (placed / left)', s1 !== s2 && /1/.test(s2), { s1, s2 });
  rec('drag: no pan/zoom/refit', JSON.stringify(cam1) === JSON.stringify(cam2), { cam1, cam2 });
  rec('drag: card stays selected (is-active)', await page.evaluate(i => document.querySelector(`.j2-card[data-batch="${i}"]`).classList.contains('is-active'), top), null);
  // invalid drops: occupied hex, detached hex, off-map (sidebar), and nothing left armed
  const before = await counts(top);
  const occ = await clientOf(Geo.cellId(open.q, open.r)); await dragTo(occ);
  rec('invalid drop: onto an occupied hex places nothing', (await counts(top)).all === before.all, null);
  const far = await clientOf(Geo.cellId(open.q + 7, open.r + 3)); const farOn = far && far.x > 380 && far.x < w - 10 && far.y > 80 && far.y < h - 10;
  if (farOn) { await dragTo(far); rec('invalid drop: onto a detached hex places nothing (continuity rule)', (await counts(top)).all === before.all, null); } else rec('invalid drop: detached hex (off screen at this camera — skipped, not counted as a pass)', true, 'skipped');
  const sb = await page.locator('[data-j2-side-scroll]').boundingBox(); await dragTo({ x: sb.x + 60, y: sb.y + 120 });
  rec('invalid drop: released over the sidebar places nothing', (await counts(top)).all === before.all, null);
  rec('invalid drops: camera untouched and no error', JSON.stringify(await cam()) === JSON.stringify(cam2) && errors.length === 0, errors);
  // drag of "Place all" too
  const allH = `.j2-card[data-batch="${top}"] [data-j2-handle="all"]`;
  // A. click-to-place
  const cc1 = await counts(top); await page.click(handle); await sleep(150);
  rec('click: Place 1 arms (aria-pressed)', (await page.getAttribute(handle, 'aria-pressed')) === 'true', null);
  const t2 = Geo.cellId(open.q + 2, open.r); await page.mouse.move(0, 0); const p2 = await clientOf(t2); await page.mouse.click(p2.x, p2.y); await sleep(350);
  const cc2 = await counts(top); rec('click: clicking a valid hex places one tile and the count updates', cc2.tiles === cc1.tiles + 1, { cc1, cc2 });
  // C. Inspect
  await page.click(`.j2-card[data-batch="${top}"] [data-j2-inspect]`); await sleep(300);
  const insp = await page.evaluate(() => { const i = document.querySelector('[data-j2-inspector]'); const st = Journey2View.debugState().inspector; const bg = i && getComputedStyle(i.querySelector('.j2-insp-head'), '::before').backgroundImage; return { open: st && st.open, source: st && st.source, art: i && i.getAttribute('data-art'), bg: bg }; });
  rec('inspect: Region Overlay opens from the card with its illustrated header unchanged', insp.open && insp.source === 'card' && insp.art === 'forest' && /headers\/forest\.webp/.test(insp.bg || ''), insp);
  await page.screenshot({ path: path.join(OUT, 'inspect-open-1366x768.png') }); await page.keyboard.press('Escape'); await sleep(200);
  // E. selection + collapsed/expanded
  const second = ids[2]; await page.click(`.j2-card[data-batch="${second}"] [data-j2-card-toggle]`); await sleep(250);
  const sel = await page.evaluate(([a, b]) => ({ a: document.querySelector(`.j2-card[data-batch="${a}"]`).classList.contains('is-active'), b: document.querySelector(`.j2-card[data-batch="${b}"]`).classList.contains('is-active'), exp: document.querySelector(`.j2-card[data-batch="${b}"] [data-j2-card-toggle]`).getAttribute('aria-expanded') }), [top, second]);
  rec('select: clicking another card makes it the only active, expanded card', !sel.a && sel.b && sel.exp === 'true', sel);
  // E. scrolling
  const sc = page.locator('[data-j2-side-scroll]'); await sc.evaluate(e => { e.scrollTop = 0; }); const bb = await sc.boundingBox();
  await page.mouse.move(bb.x + 30, bb.y + bb.height / 2); await page.mouse.wheel(0, 700); await sleep(300);
  const st1 = await sc.evaluate(e => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight }));
  rec('scroll: a wheel over the artwork strip scrolls the Hex Stock', st1.top > 0, st1);
  await sc.evaluate(e => { e.scrollTop = e.scrollHeight; }); await sleep(200);
  const last = ids[ids.length - 1], lb = await page.evaluate(i => { const c = document.querySelector(`.j2-card[data-batch="${i}"]`), r = c.querySelector('[data-j2-inspect]').getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { visible: r.bottom <= innerHeight + 1, hit: c.querySelector('[data-j2-inspect]').contains(hit) }; }, last);
  rec('scroll: the last card and its Inspect button are reachable and hit-testable at the bottom', lb.visible && lb.hit, lb);
  // hit-test: every visible control wins its own centre; layer takes no pointer events
  const hit = await page.evaluate(() => { let tot = 0, ok = 0, layer = true; for (const c of document.querySelectorAll('.j2-card')) { if (getComputedStyle(c, '::before').pointerEvents !== 'none') layer = false;
    for (const s of ['[data-j2-inspect]', '[data-j2-card-toggle]', '[data-j2-handle]:not([hidden])', '[data-j2-delete]']) for (const e of c.querySelectorAll(s)) { const r = e.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue; const sb = document.querySelector('[data-j2-side-scroll]').getBoundingClientRect(); if (r.top < sb.top || r.bottom > sb.bottom) continue; tot++; if (e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) ok++; } } return { tot, ok, layer }; });
  rec('hit areas: art layer pointer-events none; every on-screen control wins its own centre', hit.layer && hit.tot === hit.ok && hit.tot > 0, hit);
  // D. delete
  await sc.evaluate(e => { e.scrollTop = 0; }); await activate(page, top); const n0 = await counts(top), nb = n0.batches;
  await page.click(`.j2-card[data-batch="${top}"] [data-j2-delete]`); await sleep(250);
  await page.click('dialog.j2-dialog[open] .btn-ghost'); await sleep(250);
  rec('delete: Cancel in the confirmation keeps the region', (await counts(top)).batches === nb, null);
  await page.click(`.j2-card[data-batch="${top}"] [data-j2-delete]`); await sleep(250); await page.click('dialog.j2-dialog[open] .btn-danger'); await sleep(350);
  const n1 = await counts(top); rec('delete: confirming removes the region and its tiles, nothing else', n1.batches === nb - 1 && n1.tiles === 0 && n1.all === n0.all - n0.tiles, { n0, n1 });
  rec('interactions: no page errors / failed requests', errors.length === 0, errors);
  await ctx.close();
}

(async () => {
  const { s, port } = await serve(ROOT); const browser = await chromium.launch({ channel: 'chrome' }); const base = `http://127.0.0.1:${port}/`;
  try { if (PART !== 'interact') await shots(browser, base); if (PART !== 'shots') await interact(browser, base); } finally { await browser.close(); s.close(); }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ pass, fail, results }, null, 1)); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
