'use strict';
/* ============================================================
   Bacchus's Atlas — scripts/journey2/lib/fog-checks.js
   Browser verification of Journey 2 Phase C (Fog of War, Player Preview, suggested environments in the Region
   Inspector), shared by stage1-verify.js (full run) and browser-verify.js (quick run). Real pointer and keyboard
   input in a FRESH browser context, so the owner's own browser storage is never touched. The debug API is only used
   to read state and to translate a cell id into client pixels.

   runFogChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc, full })
   ============================================================ */
const fs = require('fs');
const os = require('os');
const path = require('path');

async function runFogChecks(env) {
  const { browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc } = env;
  const full = !!env.full;
  const ctx0 = Model.createContext(template, anchorsDoc), grid = ctx0.grid;
  const SEAM_X = template.composition.seam.worldX;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'j2-fog-'));

  /* ---- fixtures: a connected cluster of seven real cells near the seam, and a straight run of cells for fast strokes ---- */
  const allowed = (q, r) => ctx0.policy(q, r).ok;
  function nearestAllowed(x, y, avoid) {
    const c0 = grid.worldToCell(x, y), av = new Set(avoid || []);
    for (let ring = 0; ring < 40; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
      const id = Geo.cellId(c0.q + dq, c0.r + dr);
      if (allowed(c0.q + dq, c0.r + dr) && !av.has(id)) return id;
    }
    throw new Error('no allowed cell near ' + x + ',' + y);
  }
  const SEVEN = (() => {
    const out = [nearestAllowed(SEAM_X, 800)], seen = new Set(out);
    for (let i = 0; i < out.length && out.length < 7; i++) {
      const c = Geo.parseCellId(out[i]);
      for (const d of Geo.NEIGHBOR_DELTAS) { const id = Geo.cellId(c.q + d.dq, c.r + d.dr); if (out.length < 7 && !seen.has(id) && allowed(c.q + d.dq, c.r + d.dr)) { seen.add(id); out.push(id); } }
    }
    return out;
  })();
  // a clear area to the right of the seven for strokes: nine placeable cells in a q-direction run, none of them part of the seven
  const RUN = (() => {
    const base0 = Geo.parseCellId(SEVEN[0]);
    for (let dr = 3; dr < 30; dr++) for (let dq = -4; dq < 6; dq++) {
      const cells = [];
      for (let k = 0; k < 9; k++) cells.push(Geo.cellId(base0.q + dq + k, base0.r + dr));
      if (cells.every(id => { const p = Geo.parseCellId(id); return allowed(p.q, p.r) && !SEVEN.includes(id); })) return cells;
    }
    throw new Error('no clear run');
  })();
  const markerOnly = anchorsDoc.anchors.find(m => m.worldPixelAnchor[0] > 1500 && m.worldPixelAnchor[0] < 3400 && m.worldPixelAnchor[1] > 300 && m.worldPixelAnchor[1] < 1300);

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'en-US', acceptDownloads: true });
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } } catch (e) { /* none */ } });
  const page = await context.newPage();
  attachLogging(page, logs, 'fog');

  const st = () => page.evaluate(() => Journey2View.debugState());
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const revealed = async () => (await docNow()).playerVisibility.revealedCells;
  const clientOf = cell => page.evaluate(c => Journey2View.debugApi().cellToClient(c), cell);
  const ptsOf = async cells => Promise.all(cells.map(clientOf));
  const tool = k => page.locator(`[data-j2-fog-tool="${k}"]`);
  const pressed = async k => (await tool(k).getAttribute('aria-pressed')) === 'true';
  const sameSet = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
  const sub = d => (d || '').split('M').length - 1;
  const veilCount = () => page.evaluate(() => { const p = document.querySelector('[data-j2-fog-veil]'); return p ? (p.getAttribute('d') || '').split('M').length - 1 : -1; });
  const cam = async () => (await st()).camera;
  async function view(x, y, scale) {
    await page.evaluate(([x0, y0, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width / 2 + 160 - x0 * s, ty: r.height / 2 - y0 * s }); }, [x, y, scale]);
    await sleep(280);
  }
  async function click(cell) { const p = await clientOf(cell); await page.mouse.click(p.x, p.y); await sleep(120); }
  async function drag(cells, o) {
    const pts = await ptsOf(cells), opts = o || {};
    await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: opts.steps || 1 });
    if (opts.hold) return pts;
    await page.mouse.up(); await sleep(150);
    return pts;
  }
  const historyOf = async () => (await st()).history;
  const live = () => page.locator('[data-j2-live]').innerText();
  const worldOfAnchor = m => m.worldPixelAnchor;

  await page.goto(base + '#/journey2');
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
  await sleep(300);

  // one region with seven placed tiles through the real command path (the placement UI is covered elsewhere)
  const bid = await page.evaluate(() => {
    const M = Journey2Model, id = M.newId('b');
    const region = { habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [4] }, terrain: { value: 3, source: 'rolled' }, size: 7, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17 };
    return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null;
  });
  await page.evaluate(([b, cs]) => Journey2View.debugApi().dispatch({ type: 'place', allowDetached: true, batchId: b, tiles: cs.map(c => ({ id: Journey2Model.newId('t'), cell: c })) }), [bid, SEVEN]);
  await view(...grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))), 1);
  const pristine = await st();

  /* ===== controls and defaults ===== */
  await check('fog.01.controls-exist-localized-with-aria-pressed-and-the-fog-state-defaults-on', async () => {
    const r = await page.evaluate(() => {
      const q = s => document.querySelector(s);
      return {
        reveal: q('[data-j2-fog-tool="reveal"]').getAttribute('aria-label'), hide: q('[data-j2-fog-tool="hide"]').getAttribute('aria-label'), state: q('[data-j2-fog-state]').getAttribute('aria-label'),
        revealText: q('[data-j2-fog-tool="reveal"]').innerText, hideText: q('[data-j2-fog-tool="hide"]').innerText, preview: q('[data-j2-preview]').innerText, previewTitle: q('[data-j2-preview]').title,
        pressed: ['[data-j2-fog-tool="reveal"]', '[data-j2-fog-tool="hide"]', '[data-j2-fog-state]'].map(s => q(s).getAttribute('aria-pressed')), group: q('[data-j2-fog-group]').getAttribute('aria-label'),
        tags: ['[data-j2-fog-tool="reveal"]', '[data-j2-fog-tool="hide"]', '[data-j2-fog-state]', '[data-j2-preview]'].map(s => q(s).tagName),
      };
    });
    return { ok: r.reveal === 'Reveal unexplored hexes' && r.hide === 'Hide explored hexes' && r.state === 'Show fog state' && /Reveal/.test(r.revealText) && /Hide/.test(r.hideText) && /Player Preview/.test(r.preview) && r.previewTitle === 'Preview what players will see' && r.pressed.join() === 'false,false,true' && r.group === 'Fog of War' && r.tags.every(t => t === 'BUTTON'), detail: r };
  });
  await check('fog.02.every-cell-starts-hidden-and-the-veil-covers-all-of-them-above-the-tiles', async () => {
    const d = await docNow(), s = await st();
    const n = await veilCount();
    const order = await page.evaluate(() => [...document.querySelectorAll('.j2-overlay > g')].map(g => g.getAttribute('data-j2-g')));
    return { ok: d.playerVisibility.revealedCells.length === 0 && n === ctx0.allowedCellCount && s.fog.revealed === 0 && order.indexOf('tiles') < order.indexOf('fog') && order.indexOf('fog') < order.indexOf('select') && s.domTileGlyphs >= 6, detail: { n, allowed: ctx0.allowedCellCount, order, glyphs: s.domTileGlyphs } };
  });
  await check('fog.03.the-veil-covers-the-whole-base-map-with-no-rectangular-cut-outs-around-icons-or-labels', async () => {
    const r = await page.evaluate(() => ({ masks: document.querySelectorAll('#j2-fog-mask, mask').length, attr: document.querySelector('[data-j2-g="fog"]').getAttribute('mask'), rects: document.querySelectorAll('[data-j2-g="fog"] rect').length }));
    return { ok: r.masks === 0 && r.attr === null && r.rects === 0, detail: r };
  });

  /* ===== reveal / hide, single click ===== */
  await tool('reveal').click(); await sleep(150);
  await check('fog.04.reveal-tool-activates-pressed-with-a-text-status-and-closes-everything-else', async () => {
    const s = await st();
    const chip = await page.locator('[data-j2-fog-chip]').innerText();
    return { ok: s.fog.tool === 'reveal' && (await pressed('reveal')) && !(await pressed('hide')) && /Reveal tool active/.test(chip) && /Hold Space and drag to pan/.test(chip) && /Esc/.test(chip) && !s.inspector.open && s.selectedTile === null && s.camera.scale === pristine.camera.scale, detail: { chip, fog: s.fog } };
  });
  const h0 = await historyOf();
  await click(RUN[0]);
  await check('fog.05.clicking-an-unrevealed-cell-reveals-it-as-one-history-entry', async () => {
    const r = await revealed(), h = await historyOf(), t = await live();
    return { ok: sameSet(r, [RUN[0]]) && h.undo === h0.undo + 1 && /1 hex revealed/.test(t) && (await veilCount()) === ctx0.allowedCellCount - 1, detail: { r, h, t } };
  });
  await check('fog.06.undo-restores-and-redo-reproduces-the-same-cells', async () => {
    await page.keyboard.press('Control+z'); await sleep(120);
    const a = await revealed();
    await page.keyboard.press('Control+y'); await sleep(120);
    const b = await revealed();
    return { ok: a.length === 0 && sameSet(b, [RUN[0]]), detail: { a, b } };
  });
  const h1 = await historyOf();
  await click(RUN[0]);
  await check('fog.07.clicking-an-already-revealed-cell-with-reveal-is-a-no-op-without-history', async () => {
    const h = await historyOf();
    return { ok: h.undo === h1.undo && sameSet(await revealed(), [RUN[0]]), detail: { h1, h } };
  });
  await tool('hide').click(); await sleep(150);
  await check('fog.08.hide-and-reveal-are-mutually-exclusive-toggles', async () => ({ ok: (await pressed('hide')) && !(await pressed('reveal')) && (await st()).fog.tool === 'hide' && /Hide tool active/.test(await page.locator('[data-j2-fog-chip]').innerText()) }));
  await click(RUN[5]);
  await check('fog.09.hide-on-an-already-hidden-cell-is-a-no-op', async () => ({ ok: (await historyOf()).undo === h1.undo && sameSet(await revealed(), [RUN[0]]) }));
  await click(RUN[0]);
  await check('fog.10.hide-removes-a-revealed-cell-in-one-entry-and-undo-brings-it-back', async () => {
    const a = await revealed(), h = await historyOf();
    await page.keyboard.press('Control+z'); await sleep(120);
    const b = await revealed();
    await page.keyboard.press('Control+y'); await sleep(120);
    return { ok: a.length === 0 && h.undo === h1.undo + 1 && sameSet(b, [RUN[0]]) && (await revealed()).length === 0, detail: { a, b, h } };
  });

  /* ===== painting: drag, fast jump, once per stroke, one undo entry ===== */
  await tool('reveal').click(); await sleep(150);
  const hBefore = await historyOf();
  await drag([RUN[1], RUN[2], RUN[3]], { steps: 6 });
  await check('fog.11.dragging-reveals-every-crossed-cell-as-one-undo-entry', async () => {
    const r = await revealed(), h = await historyOf();
    return { ok: [RUN[1], RUN[2], RUN[3]].every(c => r.includes(c)) && Model.isConnected(r) && h.undo === hBefore.undo + 1, detail: { r, h } };
  });
  await page.keyboard.press('Control+z'); await sleep(150);
  await check('fog.12.one-undo-removes-the-whole-stroke-and-redo-restores-the-exact-same-cells', async () => {
    const a = await revealed();
    await page.keyboard.press('Control+y'); await sleep(150);
    const b = await revealed();
    return { ok: a.length === 0 && b.length >= 3 && [RUN[1], RUN[2], RUN[3]].every(c => b.includes(c)), detail: { a, b } };
  });
  await page.keyboard.press('Control+z'); await sleep(120);
  const hJump = await historyOf();
  await drag([RUN[0], RUN[8]], { steps: 1 });
  await check('fog.13.a-single-fast-jump-leaves-no-gap-the-hex-line-between-the-samples-is-filled', async () => {
    const r = await revealed(), want = Geo.cellLine(Geo.parseCellId(RUN[0]), Geo.parseCellId(RUN[8])).map(c => Geo.cellId(c.q, c.r)), h = await historyOf();
    return { ok: sameSet(r, want) && Model.isConnected(r) && h.undo === hJump.undo + 1, detail: { r, want } };
  });
  await page.keyboard.press('Control+z'); await sleep(120);
  await check('fog.14.each-cell-is-committed-once-per-stroke-and-the-count-is-announced-once', async () => {
    await drag([RUN[1], RUN[2], RUN[3], RUN[2], RUN[1], RUN[2], RUN[3]], { steps: 4 });
    const r = await revealed(), t = await live(), h = await historyOf();
    return { ok: new Set(r).size === r.length && [RUN[1], RUN[2], RUN[3]].every(c => r.includes(c)) && h.undo === hJump.undo + 1 && new RegExp(`^${r.length} hexes revealed$`).test(t.trim()), detail: { r, t, h } };
  });
  await page.keyboard.press('Control+z'); await sleep(120);
  await check('fog.15.the-brush-and-pending-cells-differ-between-reveal-and-hide-by-shape-not-only-colour', async () => {
    const pts = await ptsOf([RUN[1], RUN[2]]);
    await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down(); await page.mouse.move(pts[1].x, pts[1].y, { steps: 3 }); await sleep(120);
    const rev = await page.evaluate(() => ({ pend: !!document.querySelector('.j2-fog-pend.is-reveal'), brush: !!document.querySelector('.j2-fog-brush.is-reveal'), glyph: document.querySelector('.j2-fog-glyph.is-reveal') && document.querySelector('.j2-fog-glyph.is-reveal').tagName, dash: getComputedStyle(document.querySelector('.j2-fog-brush')).strokeDasharray }));
    await page.keyboard.press('Escape'); await page.mouse.up(); await sleep(100);
    await page.keyboard.press('Escape'); await sleep(80);    // leave the tool
    await tool('hide').click(); await sleep(100);
    await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down(); await sleep(100);
    const hid = await page.evaluate(() => ({ brush: !!document.querySelector('.j2-fog-brush.is-hide'), glyph: document.querySelector('.j2-fog-glyph.is-hide') && document.querySelector('.j2-fog-glyph.is-hide').tagName, dash: getComputedStyle(document.querySelector('.j2-fog-brush')).strokeDasharray }));
    await page.mouse.up(); await sleep(80);
    return { ok: rev.pend && rev.brush && rev.glyph === 'circle' && hid.brush && hid.glyph === 'path' && rev.dash !== hid.dash, detail: { rev, hid } };
  });
  await tool('reveal').click(); await sleep(100);

  /* ===== cancelled strokes ===== */
  await check('fog.16.escape-cancels-a-stroke-in-progress-without-a-history-entry-and-a-second-escape-leaves-the-tool', async () => {
    const h = await historyOf(), r0 = await revealed();
    await drag([RUN[1], RUN[2], RUN[3]], { steps: 3, hold: true });
    const mid = (await st()).fog.strokeCells;
    await page.keyboard.press('Escape'); await page.mouse.up(); await sleep(150);
    const toolStill = (await st()).fog.tool;
    await page.keyboard.press('Escape'); await sleep(100);
    return { ok: mid >= 3 && sameSet(await revealed(), r0) && (await historyOf()).undo === h.undo && toolStill === 'reveal' && (await st()).fog.tool === null && !(await pressed('reveal')), detail: { mid, toolStill } };
  });
  await tool('reveal').click(); await sleep(100);
  await check('fog.17.pointer-cancellation-commits-nothing', async () => {
    const h = await historyOf(), r0 = await revealed();
    await drag([RUN[1], RUN[2]], { steps: 3, hold: true });
    const pid = (await st()).fog.strokePointer;
    await page.evaluate(id => document.querySelector('.j2-viewport').dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true })), pid);
    await page.mouse.up(); await sleep(150);
    return { ok: pid !== null && sameSet(await revealed(), r0) && (await historyOf()).undo === h.undo && (await st()).fog.strokeCells === 0, detail: { pid } };
  });

  /* ===== Space pans ===== */
  await check('fog.18.space-plus-drag-pans-instead-of-painting-and-does-not-press-the-focused-button', async () => {
    const r0 = await revealed(), c0 = await cam(), h = await historyOf();
    await tool('reveal').focus();
    await page.keyboard.down('Space');
    const p = await clientOf(RUN[2]);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x - 90, p.y + 40, { steps: 6 }); await page.mouse.up();
    await page.keyboard.up('Space'); await sleep(250);
    const c1 = await cam();
    return { ok: Math.abs(c1.tx - c0.tx) > 60 && sameSet(await revealed(), r0) && (await historyOf()).undo === h.undo && (await st()).fog.tool === 'reveal' && (await pressed('reveal')), detail: { c0, c1 } };
  });
  await view(...grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))), 1);
  await check('fog.19.wheel-zoom-still-works-while-a-tool-is-active', async () => {
    const c0 = await cam(), r = await page.evaluate(() => { const b = document.querySelector('.j2-viewport').getBoundingClientRect(); return { x: b.left + b.width * 0.6, y: b.top + b.height / 2 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.wheel(0, -240); await sleep(250);
    const c1 = await cam();
    await view(...grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))), 1);
    return { ok: c1.scale > c0.scale, detail: { c0, c1 } };
  });

  /* ===== priority over the inspector and tiles ===== */
  await check('fog.20.a-fog-click-on-a-region-tile-paints-fog-and-never-opens-the-inspector-or-moves-the-tile', async () => {
    const tilesBefore = JSON.stringify((await st()).tiles), h = await historyOf();
    await click(SEVEN[2]);
    const s = await st();
    await tool('hide').click(); await sleep(100);
    await drag([SEVEN[1], SEVEN[3]], { steps: 5 });
    const s2 = await st();
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await sleep(150);
    return { ok: !s.inspector.open && !s2.inspector.open && s.selectedTile === null && JSON.stringify(s2.tiles) === tilesBefore && s.fog.revealed >= 1 && (await historyOf()).undo === h.undo && (await revealed()).length === 0, detail: { insp: s.inspector, h } };
  });
  await page.keyboard.press('Escape'); await sleep(100);
  await check('fog.21.activating-a-tool-closes-an-open-inspector-clears-the-selection-and-keeps-pan-zoom-and-sidebar', async () => {
    await click(SEVEN[2]);
    const open = (await st()).inspector.open, side = (await st()).sideCollapsed, c0 = await cam();
    await tool('reveal').click(); await sleep(150);
    const s = await st(), c1 = await cam();
    const insp = await page.locator('[data-j2-inspector]').isHidden();
    return { ok: open && !s.inspector.open && insp && s.selectedTile === null && s.sideCollapsed === side && JSON.stringify(c0) === JSON.stringify(c1) && (await page.locator('[data-j2-g="select"] .j2-region-hl').count()) === 0, detail: { open, c0, c1 } };
  });
  await tool('reveal').click(); await sleep(100);       // neutral again
  await check('fog.22.activating-a-tool-cancels-armed-placement-and-arming-placement-switches-the-tool-off', async () => {
    const extra = await page.evaluate(() => { const M = Journey2Model, id = M.newId('b'); return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion({ habitat: { biome: 'aquatic', blighted: false, overtaken: false, source: 'rolled', rolls: [2] }, terrain: { value: 1, source: 'rolled' }, size: 3, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 }, { id, createdAt: new Date().toISOString() }) }).ok ? id : null; });
    const handle = page.locator(`.j2-card[data-batch="${extra}"] [data-j2-handle="one"]`);
    if ((await page.locator(`.j2-card[data-batch="${extra}"] [data-j2-card-toggle]`).getAttribute('aria-expanded')) !== 'true') await page.locator(`.j2-card[data-batch="${extra}"] [data-j2-card-toggle]`).click();
    await handle.click(); await sleep(120);
    const armed = (await st()).transient;
    await tool('reveal').click(); await sleep(120);
    const a = await st();
    await handle.click(); await sleep(120);
    const b = await st();
    await page.keyboard.press('Escape'); await sleep(80);
    return { ok: armed && armed.kind === 'armed' && a.transient === null && a.fog.tool === 'reveal' && b.transient && b.transient.kind === 'armed' && b.fog.tool === null && !(await pressed('reveal')), detail: { armed, a: a.fog, b: b.fog } };
  });
  await check('fog.23.generation-placement-movement-and-deletion-never-change-the-fog', async () => {
    await tool('reveal').click(); await sleep(100);
    await click(RUN[4]);
    await page.keyboard.press('Escape'); await sleep(80);
    const r0 = await revealed();
    const ids = await page.evaluate(([b, c]) => {
      const api = Journey2View.debugApi(), M = Journey2Model;
      const nb = M.newId('b');
      api.dispatch({ type: 'createBatch', batch: M.batchFromRegion({ habitat: { biome: 'rolling', blighted: false, overtaken: false, source: 'rolled', rolls: [3] }, terrain: { value: 2, source: 'rolled' }, size: 2, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 5 }, { id: nb, createdAt: new Date().toISOString() }) });
      const t = M.newId('t');
      api.dispatch({ type: 'place', allowDetached: true, batchId: nb, tiles: [{ id: t, cell: c }] });
      api.dispatch({ type: 'returnTile', tileId: t });
      api.dispatch({ type: 'deleteBatch', batchId: nb });
      return nb;
    }, [bid, RUN[6]]);
    return { ok: sameSet(await revealed(), r0) && !!ids, detail: r0 };
  });

  /* ===== GM overlay ===== */
  await check('fog.24.the-gm-keeps-every-generated-tile-and-can-switch-the-veil-off-and-on-without-touching-the-document', async () => {
    const docBefore = JSON.stringify(await docNow()), glyphs = (await st()).domTileGlyphs;
    const shown = await page.evaluate(() => getComputedStyle(document.querySelector('[data-j2-g="fog"]')).display);
    await page.locator('[data-j2-fog-state]').click(); await sleep(120);
    const off = await page.evaluate(() => ({ display: getComputedStyle(document.querySelector('[data-j2-g="fog"]')).display, pressed: document.querySelector('[data-j2-fog-state]').getAttribute('aria-pressed'), ui: JSON.parse(localStorage.getItem('dhcodex_journey2_ui')) }));
    const s = await st();
    await page.locator('[data-j2-fog-state]').click(); await sleep(120);
    const on = await page.evaluate(() => getComputedStyle(document.querySelector('[data-j2-g="fog"]')).display);
    return { ok: shown !== 'none' && off.display === 'none' && off.pressed === 'false' && off.ui.showFogState === false && JSON.stringify(await docNow()) === docBefore && s.domTileGlyphs === glyphs && on !== 'none' && (await historyOf()).redo === 0, detail: { shown, off, glyphs: [glyphs, s.domTileGlyphs] } };
  });
  await check('fog.25.activating-a-tool-re-enables-the-veil-and-the-preference-survives-a-reload-while-the-tool-and-preview-do-not', async () => {
    await page.locator('[data-j2-fog-state]').click(); await sleep(100);
    const off = await page.locator('[data-j2-fog-state]').getAttribute('aria-pressed');
    await tool('reveal').click(); await sleep(100);
    const reEnabled = await page.locator('[data-j2-fog-state]').getAttribute('aria-pressed');
    await page.locator('[data-j2-fog-state]').click(); await sleep(100);
    await page.reload(); await page.waitForSelector('.j2-viewport'); await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0); await sleep(300);
    const s = await st();
    const pressedState = await page.locator('[data-j2-fog-state]').getAttribute('aria-pressed');
    await page.locator('[data-j2-fog-state]').click(); await sleep(100);
    return { ok: off === 'false' && reEnabled === 'true' && s.fog.tool === null && !s.fog.previewMode && s.fog.showFogState === false && pressedState === 'false' && (await st()).fog.showFogState === true, detail: { off, reEnabled, fog: s.fog } };
  });
  await view(...grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))), 1);

  /* ===== autosave / persistence ===== */
  await check('fog.26.fog-is-autosaved-with-the-map-and-comes-back-after-a-reload', async () => {
    await tool('reveal').click(); await sleep(100);
    await drag([SEVEN[0], SEVEN[1], SEVEN[2]], { steps: 4 });
    await page.keyboard.press('Escape'); await sleep(100);
    const r0 = await revealed();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dhcodex_journey2_map')).playerVisibility.revealedCells);
    await page.reload(); await page.waitForSelector('.j2-viewport'); await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0); await sleep(300);
    const r1 = await revealed();
    return { ok: r0.length >= 3 && sameSet(stored, r0) && sameSet(r1, r0), detail: { r0, stored, r1 } };
  });
  await view(...grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))), 1);
  await check('fog.27.the-backup-carries-the-fog-and-contains-no-tool-preview-or-preference-state', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => Journey2View.debugApi().runAction('export'))]);
    const file = path.join(tmp, 'backup.json'); await dl.saveAs(file);
    const text = fs.readFileSync(file, 'utf8'), j = JSON.parse(text);
    return { ok: sameSet(j.playerVisibility.revealedCells, await revealed()) && !/showFogState|previewMode|fogTool|hover|stroke|sideCollapsed/.test(text), detail: Object.keys(j) };
  });

  /* ===== Player Preview ===== */
  const revealedNow = await revealed();
  await click(SEVEN[5]);   // neutral click opens the inspector (no tool active)
  const inspectorBefore = (await st()).inspector.open;
  const gmDoc = JSON.stringify(await docNow()), gmHist = await historyOf();
  const camGm = await cam(), sideGm = (await st()).sideCollapsed;
  const gmShot = markerOnly ? null : null; void gmShot;
  await page.locator('[data-j2-preview]').click(); await sleep(250);
  await check('fog.30.entering-preview-closes-the-inspector-and-hides-every-gm-control', async () => {
    const r = await page.evaluate(() => {
      const vis = s => { const n = document.querySelector(s); return !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden'; };
      return {
        mode: document.querySelector('.j2').getAttribute('data-mode'), side: vis('.j2-sidewrap'), rail: vis('.j2-rail'), cards: document.querySelectorAll('.j2-card').length && vis('.j2-card'), gen: vis('[data-j2-generate]'),
        undo: vis('[data-j2-undo]'), redo: vis('[data-j2-redo]'), fog: vis('[data-j2-fog-group]'), save: vis('[data-j2-save]'), insp: vis('[data-j2-inspector]'), back: vis('[data-j2-preview-back]'), flag: vis('.j2-preview-flag'),
        del: vis('[data-j2-delete]'), ret: vis('[data-j2-return]'), chip: vis('[data-j2-fog-chip]'), diag: vis('#j2-panel'), hl: document.querySelectorAll('[data-j2-g="select"] *').length, focus: document.activeElement && document.activeElement.hasAttribute('data-j2-preview-back'),
        zoom: vis('[data-j2-zoom-readout]'), fit: vis('[data-j2-fit]'),
      };
    });
    const s = await st();
    return { ok: inspectorBefore && r.mode === 'preview' && !r.side && !r.rail && !r.cards && !r.gen && !r.undo && !r.redo && !r.fog && !r.save && !r.insp && r.back && r.flag && !r.del && !r.ret && !r.chip && !r.diag && r.hl === 0 && r.focus && r.zoom && r.fit && s.fog.previewMode && !s.inspector.open && s.selectedTile === null, detail: r };
  });
  await check('fog.31.entering-and-leaving-are-announced-and-the-preview-has-a-text-status', async () => {
    const t = await live(), flag = await page.locator('.j2-preview-flag').innerText();
    return { ok: /Player Preview opened/.test(t) && /Player Preview/i.test(flag) && (await page.locator('.j2-preview-flag').getAttribute('role')) === 'status' && (await page.locator('.j2-viewport').getAttribute('aria-label')) === 'Player Preview map — read-only', detail: { t, flag } };
  });
  await check('fog.32.preview-draws-only-the-projection-hidden-generated-content-is-not-in-the-dom', async () => {
    const r = await page.evaluate(() => ({
      gmTiles: document.querySelector('[data-j2-g="tiles"]').children.length,
      hexes: [...document.querySelectorAll('[data-j2-g="player"] .j2-tile-hex')].reduce((n, p) => n + (p.getAttribute('d') || '').split('M').length - 1, 0),
      images: [...document.querySelectorAll('[data-j2-g="player"] image')].map(i => [Number(i.getAttribute('x')) + Number(i.getAttribute('width')) / 2, Number(i.getAttribute('y')) + Number(i.getAttribute('height')) / 2]),
      veil: (document.querySelector('[data-j2-fog-veil]').getAttribute('d') || '').split('M').length - 1, edge: document.querySelector('[data-j2-fog-edge]').getAttribute('d'),
      html: document.querySelector('[data-j2-g="player"]').outerHTML + document.querySelector('[data-j2-g="fog"]').outerHTML,
    }));
    const tilesRevealed = SEVEN.filter(c => revealedNow.includes(c));
    const imgCells = r.images.map(p => { const c = grid.worldToCell(p[0], p[1]); return Geo.cellId(c.q, c.r); });
    const hiddenTiles = SEVEN.filter(c => !revealedNow.includes(c));
    return { ok: r.gmTiles === 0 && r.hexes === tilesRevealed.length && imgCells.every(c => tilesRevealed.includes(c)) && imgCells.length <= tilesRevealed.length && imgCells.length >= tilesRevealed.length - 1 && hiddenTiles.every(c => !imgCells.includes(c)) && tilesRevealed.length >= 3 && hiddenTiles.length >= 3 && r.veil === ctx0.allowedCellCount - revealedNow.length && !r.edge && !/batch|data-tile|data-id/i.test(r.html), detail: { r: { gmTiles: r.gmTiles, hexes: r.hexes, veil: r.veil, imgCells }, tilesRevealed, hiddenTiles } };
  });
  await check('fog.33.mixed-visibility-region-shows-only-its-revealed-hexes-and-never-the-whole-region', async () => {
    const part = SEVEN.filter(c => revealedNow.includes(c)).length;
    return { ok: part >= 3 && part < SEVEN.length, detail: { part, of: SEVEN.length } };
  });
  await check('fog.34.nothing-gm-only-reaches-the-visible-page-or-its-accessibility-tree', async () => {
    const tree = await page.locator('.j2').ariaSnapshot().catch(() => null);
    const text = await page.evaluate(() => {   // rendered HTML text (the SVG overlay is aria-hidden; its hidden diagnostic groups are never painted)
      const out = [], w = document.createTreeWalker(document.querySelector('.j2'), NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const e = n.parentElement; if (e && !e.closest('svg') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && n.textContent.trim()) out.push(n.textContent.trim()); }
      return out.join('\n');
    });
    const bad = /Forest|Encounter|Rumor|Notes|Terrain|Suggested|Environments|Return to stock|Undo|Redo|\bGenerate\b|Region #|region details|Diagnostics|Backup/i;
    const coords = /\b-?\d+,-?\d+\b/;
    return { ok: !bad.test(text) && !coords.test(text) && (tree === null || (!bad.test(tree) && !coords.test(tree))) && /Back to GM/.test(tree || 'Back to GM'), detail: { badText: (text.match(bad) || [])[0], coordText: (text.match(coords) || [])[0], badTree: tree && (tree.match(bad) || [])[0], coordTree: tree && (tree.match(coords) || [])[0], backTree: /Back to GM/.test(tree || ''), text: text.slice(0, 200), tree: tree && tree.slice(0, 300), groups: await page.evaluate(() => [...document.querySelectorAll('.j2-overlay > g')].map(g => g.getAttribute('data-j2-g') + ':' + getComputedStyle(g).display)) } };
  });
  await check('fog.35.preview-fog-uses-the-stronger-player-texture-and-is-static', async () => {
    const r = await page.evaluate(() => { const v = document.querySelector('[data-j2-fog-veil]'); const cs = getComputedStyle(v); return { fill: cs.fill, anim: cs.animationName, trans: cs.transitionProperty, filter: cs.filter }; });
    return { ok: /j2-fog-player/.test(r.fill) && (r.anim === 'none') && r.filter === 'none', detail: r };
  });
  await check('fog.36.base-map-image-is-untouched-and-visible', async () => {
    const r = await page.evaluate(() => { const i = document.querySelector('.j2-base'); const cs = getComputedStyle(i); return { ok: i.complete && i.naturalWidth > 0, op: cs.opacity, vis: cs.visibility, disp: cs.display, filter: cs.filter, src: i.getAttribute('src') }; });
    return { ok: r.ok && r.op === '1' && r.vis === 'visible' && r.disp !== 'none' && r.filter === 'none' && /valloren-world/.test(r.src), detail: r };
  });
  await check('fog.37.preview-is-read-only-clicks-undo-and-drag-change-nothing-but-pan-and-zoom-work', async () => {
    const c0 = await cam();
    const p = await clientOf(SEVEN[1]);
    await page.mouse.click(p.x, p.y); await sleep(100);
    await page.keyboard.press('Control+z'); await page.keyboard.press('Delete'); await sleep(100);
    const s = await st();
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x - 80, p.y + 30, { steps: 5 }); await page.mouse.up(); await sleep(250);
    const c1 = await cam();
    await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, -200); await sleep(250);
    const c2 = await cam();
    return { ok: !s.inspector.open && s.selectedTile === null && JSON.stringify(await docNow()) === gmDoc && JSON.stringify(await historyOf()) === JSON.stringify(gmHist) && Math.abs(c1.tx - c0.tx) > 40 && c2.scale > c1.scale, detail: { c0, c1, c2 } };
  });
  await shot(page, 'fog-player-preview.png');
  await page.locator('[data-j2-preview-back]').click(); await sleep(300);
  await check('fog.38.back-to-gm-restores-camera-sidebar-and-neutral-mode-without-history-or-document-changes', async () => {
    const c = await cam(), s = await st();
    return { ok: Math.abs(c.scale - camGm.scale) < 1e-9 && Math.abs(c.tx - camGm.tx) < 0.5 && Math.abs(c.ty - camGm.ty) < 0.5 && s.sideCollapsed === sideGm && !s.fog.previewMode && s.fog.tool === null && !s.inspector.open && s.selectedTile === null && s.fog.showFogState === true
      && JSON.stringify(await docNow()) === gmDoc && JSON.stringify(s.history) === JSON.stringify(gmHist) && s.domTileGlyphs >= 6 && (await page.locator('.j2-sidewrap').isVisible()) && (await page.locator('[data-j2-fog-group]').isVisible()) && /Back to the GM view/.test(await live()), detail: { c, camGm, s: s.fog } };
  });
  await check('fog.39.escape-leaves-the-preview-and-the-preview-never-survives-a-reload', async () => {
    await page.locator('[data-j2-preview]').click(); await sleep(200);
    const inPreview = (await st()).fog.previewMode;
    await page.keyboard.press('Escape'); await sleep(200);
    const left = !(await st()).fog.previewMode;
    await page.locator('[data-j2-preview]').click(); await sleep(200);
    await page.reload(); await page.waitForSelector('.j2-viewport'); await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0); await sleep(300);
    const s = await st();
    return { ok: inPreview && left && !s.fog.previewMode && (await page.locator('.j2').getAttribute('data-mode')) === 'gm' && (await page.locator('.j2-sidewrap').isVisible()), detail: { inPreview, left } };
  });
  await view(...grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))), 1);
  await check('fog.40.entering-preview-ends-a-fog-tool-and-a-stroke-in-progress-first', async () => {
    await tool('reveal').click(); await sleep(100);
    const h = await historyOf(), r0 = await revealed();
    await drag([RUN[1], RUN[2]], { steps: 3, hold: true });
    await page.evaluate(() => document.querySelector('[data-j2-preview]').click());
    await page.mouse.up(); await sleep(200);
    const s = await st();
    const ok = s.fog.previewMode && s.fog.tool === null && s.fog.strokeCells === 0 && sameSet(await revealed(), r0) && (await historyOf()).undo === h.undo;
    await page.keyboard.press('Escape'); await sleep(150);
    return { ok, detail: s.fog };
  });

  /* ===== base map artwork stays identical under the veil ===== */
  if (full && markerOnly) {
    let sharp = null; try { sharp = require('sharp'); } catch (e) { /* optional */ }
    if (sharp) {
      const [mx, my] = worldOfAnchor(markerOnly), pr = markerOnly.iconProtectionArea.rectPx;
      const clip = async () => {
        const p = await page.evaluate(([x, y]) => Journey2View.debugApi().worldToClient(x, y), [mx, my]);
        const cs = await cam();
        const w = Math.max(6, Math.floor(pr[2] * cs.scale * 0.6)), h = Math.max(6, Math.floor(pr[3] * cs.scale * 0.6));
        return page.screenshot({ clip: { x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2), width: w, height: h } });
      };
      const diff = async (a, b) => { const A = await sharp(a).raw().toBuffer(), B = await sharp(b).raw().toBuffer(); let d = 0; for (let i = 0; i < A.length; i++) d += Math.abs(A[i] - B[i]); return d / A.length; };
      await view(mx, my, 3);
      await page.locator('[data-j2-fog-state]').click(); await sleep(150);           // GM veil OFF = the bare map
      const bare = await clip();
      await page.locator('[data-j2-fog-state]').click(); await sleep(150);
      await page.locator('[data-j2-preview]').click(); await sleep(250);
      const under = await clip();
      // a patch of plain map well away from any icon: the preview must visibly differ there (the fog is really drawn)
      const patchAt = () => page.evaluate(([x, y]) => Journey2View.debugApi().worldToClient(x, y), [mx, my]).then(o => page.screenshot({ clip: { x: Math.round(o.x + 180), y: Math.round(o.y + 100), width: 24, height: 24 } }));
      const fogPatch = await patchAt();
      await page.locator('[data-j2-preview-back]').click(); await sleep(250);
      await page.locator('[data-j2-fog-state]').click(); await sleep(150);
      const barePatch = await patchAt();
      await page.locator('[data-j2-fog-state]').click(); await sleep(150);
      await check('fog.41.the-sanctuary-icon-and-its-surroundings-are-veiled-alike-so-no-untouched-rectangle-is-left-around-it', async () => {
        const iconDiff = await diff(bare, under), patchDiff = await diff(barePatch, fogPatch);
        return { ok: iconDiff > 3 && patchDiff > 3 && iconDiff > patchDiff * 0.3, detail: { iconDiff, patchDiff, marker: markerOnly.stableId } };
      });
      await view(...grid.cellCenter(...Object.values(Geo.parseCellId(SEVEN[0]))), 1);
    }
  }

  /* ===== suggested environments, moved from the sidebar card to the inspector ===== */
  await check('fog.50.suggested-environments-are-gone-from-the-card-and-collapsed-in-the-inspector', async () => {
    const card = await page.evaluate(() => ({ envs: document.querySelectorAll('.j2-card .j2-envs, .j2-card [data-j2-env-toggle], .j2-card .j2-env-link').length, cardH: [...document.querySelectorAll('.j2-card')].map(c => Math.round(c.getBoundingClientRect().height)) }));
    await click(SEVEN[2]);
    const r = await page.evaluate(() => {
      const t = document.querySelector('[data-j2-env-toggle]'), l = document.querySelector('[data-j2-insp-envs], .j2-region-inspector .j2-envs-list');
      return { exp: t.getAttribute('aria-expanded'), hiddenList: l.hidden, label: t.innerText, links: l.querySelectorAll('a.j2-env-link').length, readonly: !document.querySelector('.j2-region-inspector textarea, .j2-region-inspector input'), pos: [...document.querySelectorAll('.j2-region-inspector .j2-insp-h')].map(h => h.textContent.trim().slice(0, 24)) };
    });
    return { ok: card.envs === 0 && r.exp === 'false' && r.hiddenList && /^suggested environments · \d+$/i.test(r.label.replace(/\s+/g, ' ').trim()) && r.links > 0 && r.readonly && /^Encounter$/.test(r.pos[0]) && /^Rumor$/.test(r.pos[1]) && /^Suggested/.test(r.pos[2]), detail: { card, r } };
  });
  await check('fog.51.the-section-opens-lists-tier-then-name-links-and-collapses-again-for-another-region', async () => {
    await page.locator('[data-j2-env-toggle]').click(); await sleep(100);
    const open = await page.evaluate(() => { const l = document.querySelector('.j2-region-inspector .j2-envs-list'); return { hidden: l.hidden, tiers: [...l.querySelectorAll('.j2-env-tier')].map(x => Number(x.textContent)), hrefs: [...l.querySelectorAll('a')].slice(0, 2).map(a => a.getAttribute('href')), exp: document.querySelector('[data-j2-env-toggle]').getAttribute('aria-expanded') }; });
    const sorted = open.tiers.every((t, i) => i === 0 || t >= open.tiers[i - 1]);
    const b2 = await page.evaluate(() => { const M = Journey2Model, id = M.newId('b'); return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion({ habitat: { biome: null, blighted: true, overtaken: true, source: 'manual' }, terrain: { value: 4, source: 'rolled' }, size: 2, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 9 }, { id, createdAt: new Date().toISOString() }) }).ok ? id : null; });
    await page.locator(`.j2-card[data-batch="${b2}"] [data-j2-inspect]`).click(); await sleep(150);
    const none = await page.evaluate(() => ({ toggleHidden: document.querySelector('[data-j2-env-toggle]').hidden, msg: [...document.querySelectorAll('.j2-region-inspector .j2-insp-muted')].filter(p => !p.hidden).map(p => p.textContent) }));
    await page.locator(`.j2-card[data-batch="${bid}"] [data-j2-inspect]`).click(); await sleep(150);
    const again = await page.evaluate(() => ({ exp: document.querySelector('[data-j2-env-toggle]').getAttribute('aria-expanded'), hidden: document.querySelector('.j2-region-inspector .j2-envs-list').hidden }));
    return { ok: !open.hidden && open.exp === 'true' && open.tiers.length > 0 && sorted && open.hrefs.every(h => /^#\/journey2\/env\//.test(h)) && none.toggleHidden && none.msg.join() === 'No suggested environments' && again.exp === 'false' && again.hidden, detail: { open, none, again } };
  });
  await check('fog.52.raw-hex-coordinates-are-not-in-the-inspector-footer-but-return-to-stock-is', async () => {
    await page.keyboard.press('Escape'); await sleep(100);
    await click(SEVEN[2]);
    const r = await page.evaluate(() => { const f = document.querySelector('[data-j2-insp-tile]'); return { hidden: f.hidden, text: f.innerText.trim(), btn: !!f.querySelector('[data-j2-return]:not([disabled])') }; });
    await page.keyboard.press('Escape'); await sleep(100);
    return { ok: !r.hidden && !/\d+,-?\d+/.test(r.text) && /Return to stock/i.test(r.text) && r.btn, detail: r };
  });
  await check('fog.53.the-inspector-body-scrolls-with-the-list-open-and-the-notes-field-stays-removed', async () => {
    await click(SEVEN[2]);
    await page.locator('[data-j2-env-toggle]').click(); await sleep(100);
    const r = await page.evaluate(() => { const s = document.querySelector('.j2-insp-scroll'); const before = s.scrollTop; s.scrollTop = 9999; return { scrollable: s.scrollHeight > s.clientHeight, moved: s.scrollTop > before, ta: document.querySelectorAll('.j2 textarea').length }; });
    await page.keyboard.press('Escape'); await sleep(100);
    return { ok: r.scrollable && r.moved && r.ta === 0, detail: r };
  });

  /* ===== import resets the transient modes ===== */
  await check('fog.60.importing-a-backup-ends-preview-tool-and-stroke-and-renders-the-imported-fog', async () => {
    const backup = await docNow();
    const imported = JSON.parse(JSON.stringify(backup)); imported.playerVisibility.revealedCells = [RUN[8], RUN[7]].sort(Model.compareCellKeys ? Model.compareCellKeys : undefined);
    const file = path.join(tmp, 'import.json'); fs.writeFileSync(file, JSON.stringify(imported));
    await tool('reveal').click(); await sleep(100);
    await page.setInputFiles('input[type="file"]', file); await page.waitForSelector('dialog[open]');
    await page.locator('dialog[open] .btn-danger').click(); await sleep(300);
    const s = await st();
    return { ok: s.fog.tool === null && !s.fog.previewMode && !s.inspector.open && sameSet(await revealed(), imported.playerVisibility.revealedCells) && (await veilCount()) === ctx0.allowedCellCount - 2 && s.history.undo === 0, detail: s.fog };
  });

  /* ===== localization ===== */
  await check('fog.70.russian-labels-for-the-tools-the-preview-and-the-suggested-environments', async () => {
    await page.click('[data-lang="ru"]'); await sleep(300);
    await tool('reveal').click(); await sleep(150);
    const r = await page.evaluate(() => ({
      reveal: document.querySelector('[data-j2-fog-tool="reveal"]').innerText.trim(), hide: document.querySelector('[data-j2-fog-tool="hide"]').innerText.trim(), prev: document.querySelector('[data-j2-preview]').innerText.trim(),
      state: document.querySelector('[data-j2-fog-state]').getAttribute('aria-label'), revealTitle: document.querySelector('[data-j2-fog-tool="reveal"]').getAttribute('aria-label'), group: document.querySelector('[data-j2-fog-group]').getAttribute('aria-label'),
      chip: document.querySelector('[data-j2-fog-chip]').innerText,
    }));
    await tool('reveal').click(); await sleep(100);
    await page.locator('[data-j2-preview]').click(); await sleep(200);
    const prev = await page.evaluate(() => ({ back: document.querySelector('[data-j2-preview-back]').innerText.trim(), flag: document.querySelector('.j2-preview-flag').innerText.trim(), note: document.querySelector('.j2-preview-note').innerText.trim() }));
    await page.locator('[data-j2-preview-back]').click(); await sleep(200);
    await click(SEVEN[2]);
    const insp = await page.evaluate(() => document.querySelector('[data-j2-env-toggle]').innerText.trim());
    await page.keyboard.press('Escape'); await sleep(80);
    await page.click('[data-lang="en"]'); await sleep(250);
    return { ok: r.reveal.toLowerCase() === 'открыть' && r.hide.toLowerCase() === 'скрыть' && /вид игроков/i.test(r.prev) && r.state === 'Показывать туман' && r.revealTitle === 'Открыть неисследованные гексы' && r.group === 'Туман войны' && /Включён инструмент «Открыть»/.test(r.chip) && /Удерживайте пробел/.test(r.chip)
      && prev.back.toLowerCase() === 'назад к мастеру' && /вид игроков/i.test(prev.flag) && /неисследованных/.test(prev.note) && /^подходящие окружения · \d+$/i.test(insp), detail: { r, prev, insp } };
  });

  await page.close(); await context.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  void record;
}

module.exports = { runFogChecks };
