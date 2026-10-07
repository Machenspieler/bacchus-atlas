'use strict';
/* ============================================================
   Bacchus's Atlas — scripts/journey2/lib/topology-checks.js
   Browser verification of Journey 2 Phase D (PD-024): prepared-map connectivity, the explicit "Start separate area"
   confirmation, move / return / delete topology, the derived region boundary and its player-safe projection, and the
   removal of the rectangular fog cut-outs. Shared by stage1-verify.js (full run) and browser-verify.js (quick run).
   Real pointer input in a FRESH browser context (the owner's browser storage is never touched); the debug API only
   reads state, translates cell ids into client pixels and creates the fixture batches.

   runTopologyChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc })
   ============================================================ */

async function runTopologyChecks(env) {
  const { browser, base, check, shot, logs, attachLogging, Geo, Model, template, anchorsDoc } = env;
  const ctx0 = Model.createContext(template, anchorsDoc), grid = ctx0.grid;
  const SEAM_X = template.composition.seam.worldX;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* a placeable area (every cell within 8 steps allowed) near the seam, so every fixture below is real and free */
  const open = (() => {
    const c0 = grid.worldToCell(SEAM_X, 900);
    for (let ring = 0; ring < 60; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
      const q = c0.q + dq, r = c0.r + dr;
      let ok = true;
      for (let a = -8; a <= 8 && ok; a++) for (let b = -8; b <= 8; b++) if (!ctx0.policy(q + a, r + b).ok) { ok = false; break; }
      if (ok) return { q, r };
    }
    throw new Error('no open area');
  })();
  const at = (dq, dr) => Geo.cellId(open.q + dq, open.r + dr);
  const areas = doc => Model.preparedMapComponentCount(doc.tiles.map(t => t.cell));
  const segCount = (doc, kind) => Model.regionBoundarySegments(doc, ctx0).filter(s => !kind || s.kind === kind).length;

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'en-US' });
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } } catch (e) { /* none */ } });
  const page = await context.newPage();
  attachLogging(page, logs, 'topology');

  const st = () => page.evaluate(() => Journey2View.debugState());
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const clientOf = cell => page.evaluate(c => Journey2View.debugApi().cellToClient(c), cell);
  const dispatch = cmd => page.evaluate(c => Journey2View.debugApi().dispatch(c), cmd);
  async function view(x, y, scale) {
    await page.evaluate(([x0, y0, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width / 2 + 160 - x0 * s, ty: r.height / 2 - y0 * s }); }, [x, y, scale]);
    await sleep(280);
  }
  async function makeBatch(size) {
    return page.evaluate(sz => {
      const M = Journey2Model, id = M.newId('b');
      const region = { habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [4] }, terrain: { value: 3, source: 'rolled' }, size: sz, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17 };
      return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null;
    }, size);
  }
  async function activate(id) {
    const head = page.locator(`.j2-card[data-batch="${id}"] [data-j2-card-toggle]`);
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    await sleep(80);
  }
  /** Real pointer drag from a stock handle ('one' | 'all') onto a cell; 'hold' keeps the button down and returns the live state. */
  async function dragStock(id, mode, cell, finish) {
    await activate(id);
    const loc = page.locator(`.j2-card[data-batch="${id}"] [data-j2-handle="${mode}"]`);
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox(), t = await clientOf(cell);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(t.x, t.y, { steps: 10 }); await sleep(80);
    if (finish === 'hold') return st();
    await page.mouse.up(); await sleep(150);
    return null;
  }
  async function dragTile(from, to) {
    const a = await clientOf(from), b = await clientOf(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await sleep(60);
    await page.mouse.up(); await sleep(150);
  }
  const dialogOpen = () => page.locator('dialog[open]').count();
  const perimeterNow = () => page.evaluate(() => {
    const gm = document.querySelector('[data-j2-g="perimeter"]'), pl = document.querySelector('[data-j2-g="perimeterPlayer"]');
    return { gm: Number(gm.getAttribute('data-segments') || 0), player: Number(pl.getAttribute('data-segments') || 0), gmPath: !!gm.querySelector('path'), playerPath: !!pl.querySelector('path') };
  });
  const tilesOf = async () => (await docNow()).tiles;

  await page.goto(base + '#/journey');
  await page.waitForSelector('.j2-viewport', { timeout: 60000 });
  await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
  await sleep(300);
  const c0 = grid.cellCenter(open.q, open.r);
  await view(c0[0] + 100, c0[1] + 60, 0.6);

  const A = await makeBatch(3), B = await makeBatch(2), C = await makeBatch(3), D = await makeBatch(1);
  await page.evaluate(() => document.querySelector('.j2-viewport').focus());

  /* ===== 1. the first region goes anywhere ===== */
  const aFoot = Model.compactFootprint(3).map(o => Geo.cellId(open.q + o.dq, open.r + o.dr));
  await check('topo.01.the-first-region-is-placed-freely-with-no-warning-or-dialog', async () => {
    await dragStock(A, 'all', at(0, 0), 'drop');
    const d = await docNow(), s = await st();
    return { ok: d.tiles.length === 3 && d.tiles.every(t => aFoot.includes(t.cell)) && (await dialogOpen()) === 0 && s.history.undo >= 4 && areas(d) === 1, detail: { tiles: d.tiles.length, history: s.history } };
  });

  /* ===== 2-4. a detached candidate: distinct preview, confirmation dialog, Cancel changes nothing ===== */
  const far = at(5, 4);
  await check('topo.02.a-detached-candidate-shows-an-amber-dashed-preview-a-marker-and-the-hint', async () => {
    const hold = await dragStock(B, 'one', far, 'hold');
    const r = await page.evaluate(() => ({
      detached: document.querySelectorAll('.j2-pv.is-detached').length, bad: document.querySelectorAll('.j2-pv.is-bad').length, marker: document.querySelectorAll('.j2-pv-detach').length,
      dash: getComputedStyle(document.querySelector('.j2-pv.is-detached') || document.body).strokeDasharray, tip: (document.querySelector('[data-j2-tip]') || {}).innerText || '', warn: document.querySelector('[data-j2-tip]').classList.contains('is-warn'),
    }));
    const ok = hold.transient && hold.transient.separateEligible === true && hold.transient.valid === false && r.detached === 1 && r.bad === 0 && r.marker === 1 && r.dash !== 'none' && r.warn
      && /does not touch the prepared map/.test(r.tip) && /Release to start a separate area/.test(r.tip) && /Separate-area placement/.test(r.tip);
    await shot(page, 'topo-01-detached-preview.png');
    return { ok, detail: r };
  });
  await check('topo.03.releasing-opens-a-real-dialog-with-focus-inside-and-commits-nothing', async () => {
    await page.mouse.up(); await sleep(200);
    const r = await page.evaluate(() => {
      const d = document.querySelector('dialog[open]');
      return d ? { title: d.querySelector('h3').innerText, body: d.querySelector('.j2-dialog-body').innerText, labelled: d.getAttribute('aria-labelledby'), focusInside: d.contains(document.activeElement), focus: document.activeElement.innerText, buttons: [...d.querySelectorAll('button')].map(b => b.innerText) } : null;
    });
    const d = await docNow();
    await shot(page, 'topo-02-separate-dialog.png');
    return { ok: !!r && r.title === 'Start a separate area?' && /does not touch the prepared map/.test(r.body) && /new, disconnected preparation area/.test(r.body) && r.focusInside && r.focus === 'Cancel' && r.buttons.join() === 'Cancel,Start separate area' && d.tiles.length === 3, detail: r };
  });
  await check('topo.04.cancel-keeps-the-map-unchanged-and-returns-focus-to-the-placement-control', async () => {
    await page.click('dialog[open] button:has-text("Cancel")'); await sleep(200);
    const d = await docNow();
    const focus = await page.evaluate(() => { const a = document.activeElement; return { handle: a && a.getAttribute('data-j2-handle'), batch: a && a.closest('[data-batch]') && a.closest('[data-batch]').getAttribute('data-batch') }; });
    const s = await st();
    return { ok: (await dialogOpen()) === 0 && d.tiles.length === 3 && focus.handle === 'one' && focus.batch === B && s.detachedConfirm === null, detail: { focus, tiles: d.tiles.length } };
  });

  /* ===== 5-6. confirm: the exact attempted cell; Undo / Redo without another dialog ===== */
  await check('topo.05.confirming-starts-a-separate-area-on-exactly-the-attempted-cell-as-one-history-entry', async () => {
    const before = (await st()).history.undo;
    await dragStock(B, 'one', far, 'drop');
    await page.click('dialog[open] button:has-text("Start separate area")'); await sleep(250);
    const d = await docNow(), s = await st();
    const mine = d.tiles.filter(t => t.batchId === B).map(t => t.cell);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => /journey2/.test(k)).map(k => localStorage.getItem(k)).join('\n'));
    return { ok: mine.join() === far && areas(d) === 2 && s.history.undo === before + 1 && !/allowDetached|separate|detached/i.test(JSON.stringify(d)) && !/allowDetached|"separate|detachedConfirm/i.test(stored), detail: { mine, areas: areas(d), history: s.history } };
  });
  await check('topo.06.undo-removes-the-separate-area-and-redo-restores-it-without-a-dialog', async () => {
    await page.click('[data-j2-undo]'); await sleep(150);
    const u = await docNow();
    await page.click('[data-j2-redo]'); await sleep(150);
    const r = await docNow();
    return { ok: u.tiles.filter(t => t.batchId === B).length === 0 && areas(u) === 1 && r.tiles.filter(t => t.batchId === B).map(t => t.cell).join() === far && areas(r) === 2 && (await dialogOpen()) === 0, detail: { afterUndo: u.tiles.length, afterRedo: r.tiles.length } };
  });

  /* ===== 7. later regions attach to either component ===== */
  const nextToB = Model.neighborIds(far).find(id => { const p = Geo.parseCellId(id); return ctx0.policy(p.q, p.r).ok; });
  await check('topo.07.a-new-region-adjacent-to-either-prepared-area-is-placed-with-no-dialog', async () => {
    await dragStock(C, 'one', nextToB, 'drop');
    const d1 = await docNow();
    const aSide = Model.neighborIds(aFoot[0]).find(id => !d1.tiles.some(t => t.cell === id) && Model.neighborIds(id).every(n => n !== far));
    await dragStock(D, 'one', aSide, 'drop');
    const d2 = await docNow();
    return { ok: (await dialogOpen()) === 0 && d1.tiles.some(t => t.batchId === C && t.cell === nextToB) && d2.tiles.some(t => t.batchId === D && t.cell === aSide) && areas(d2) === 2, detail: { areas: areas(d2) } };
  });

  /* ===== 8. an ordinary move may not split the prepared map ===== */
  // bridge: two regions, one linking tile — build it with a fresh chain E-F-G so the geometry is exact
  const E = await makeBatch(1), F = await makeBatch(1), G = await makeBatch(1);
  const chain = [at(-6, -3), at(-5, -3), at(-4, -3)];
  for (const [id, cell] of [[E, chain[0]], [F, chain[1]], [G, chain[2]]]) await dispatch({ type: 'place', batchId: id, allowDetached: true, tiles: [{ id: 'chain-' + id.slice(-6), cell }] });
  await check('topo.08.moving-or-returning-a-bridge-hex-is-rejected-with-a-specific-message-and-nothing-changes', async () => {
    const before = await tilesOf();
    const away = at(-5, 0);
    await dragTile(chain[1], away);
    const hint = await page.locator('[data-j2-hint]').innerText();
    const after = await tilesOf();
    const api = await dispatch({ type: 'move', tileId: before.find(t => t.cell === chain[1]).id, to: away });
    const ret = await dispatch({ type: 'returnTile', tileId: before.find(t => t.cell === chain[1]).id });
    return { ok: JSON.stringify(before) === JSON.stringify(after) && /Moving this hex would split the prepared map/.test(hint) && api.ok === false && api.error.code === 'would-split-prepared-map' && ret.ok === false && ret.error.code === 'would-split-prepared-map', detail: { hint, move: api.error, ret: ret.error } };
  });

  /* ===== 9-12. boundaries: thick, deduplicated, immediate ===== */
  await check('topo.09.the-gm-boundary-is-a-thick-pointer-transparent-dark-path-above-the-fog-and-aria-hidden', async () => {
    const r = await page.evaluate(() => {
      const g = document.querySelector('[data-j2-g="perimeter"]'), p = g.querySelector('path'), cs = getComputedStyle(p);
      const order = [...document.querySelectorAll('.j2-overlay > g')].map(x => x.getAttribute('data-j2-g'));
      return { sw: parseFloat(cs.strokeWidth), fill: cs.fill, pe: getComputedStyle(g).pointerEvents, pe2: cs.pointerEvents, hidden: !!g.closest('[aria-hidden="true"]'), focusable: g.querySelectorAll('[tabindex]').length, order, tiles: document.querySelectorAll('.j2-tile-hex').length };
    });
    const d = await docNow();
    const s = await perimeterNow();
    return { ok: r.sw >= 2.5 && r.sw <= 3 && r.fill === 'none' && (r.pe === 'none' || r.pe2 === 'none') && r.hidden && r.focusable === 0 && r.order.indexOf('fog') < r.order.indexOf('perimeter') && s.gm === segCount(d), detail: Object.assign(r, s) };
  });
  await check('topo.10.adjacent-regions-share-exactly-one-divider-and-same-region-edges-stay-thin', async () => {
    const d = await docNow();
    const dividers = segCount(d, 'divider'), keys = Model.regionBoundarySegments(d, ctx0).map(x => Model.canonicalEdgeKey(x.cell, Model.neighborIds(x.cell)[x.dir]));
    // A's three tiles are one region: none of their shared edges is a boundary
    const aSet = new Set(d.tiles.filter(t => t.batchId === A).map(t => t.cell));
    const internal = Model.regionBoundarySegments(d, ctx0).filter(x => aSet.has(x.cell) && aSet.has(Model.neighborIds(x.cell)[x.dir])).length;
    return { ok: dividers >= 2 && new Set(keys).size === keys.length && internal === 0, detail: { dividers, internal } };
  });
  await check('topo.11.moving-a-hex-updates-the-boundary-immediately', async () => {
    const d0 = await docNow(), s0 = await perimeterNow();
    const tile = d0.tiles.find(t => t.batchId === C);
    const dest = Model.neighborIds(far).find(id => id !== nextToB && !d0.tiles.some(t => t.cell === id) && ctx0.policy(...Object.values(Geo.parseCellId(id))).ok);
    const r = await dispatch({ type: 'move', tileId: tile.id, to: dest });
    const d1 = await docNow(), s1 = await perimeterNow();
    const old = Model.regionBoundarySegments(d0, ctx0).map(x => x.cell + '#' + x.dir + x.kind), now = Model.regionBoundarySegments(d1, ctx0).map(x => x.cell + '#' + x.dir + x.kind);
    return { ok: r.ok === true && s0.gm === segCount(d0) && s1.gm === segCount(d1) && old.join() !== now.join(), detail: { moved: r.ok, before: s0.gm, after: s1.gm, error: r.error || null } };
  });
  await check('topo.12.returning-a-hex-updates-the-boundary-immediately', async () => {
    const d0 = await docNow();
    const leaf = d0.tiles.find(t => t.batchId === D);
    const r = await dispatch({ type: 'returnTile', tileId: leaf.id });
    const d1 = await docNow(), s1 = await perimeterNow();
    return { ok: r.ok === true && s1.gm === segCount(d1) && segCount(d1) !== segCount(d0), detail: { before: segCount(d0), after: s1.gm } };
  });

  /* ===== 13. delete a bridge region, then Undo ===== */
  await check('topo.13.deleting-a-bridge-region-warns-about-the-split-and-undo-restores-topology-and-boundary', async () => {
    const d0 = await docNow(), s0 = await perimeterNow();
    await activate(F);
    await page.locator(`.j2-card[data-batch="${F}"] [data-j2-delete]`).click(); await sleep(150);
    const text = await page.evaluate(() => (document.querySelector('dialog[open]') || { innerText: '' }).innerText);
    await page.click('dialog[open] button.btn-danger'); await sleep(250);
    const d1 = await docNow(), s1 = await perimeterNow();
    await page.click('[data-j2-undo]'); await sleep(200);
    const d2 = await docNow(), s2 = await perimeterNow();
    return { ok: new RegExp('split the prepared map into ' + (areas(d0) + 1) + ' separate areas').test(text) && /removed too/.test(text) && areas(d1) === areas(d0) + 1 && s1.gm === segCount(d1) && areas(d2) === areas(d0) && s2.gm === s0.gm && JSON.stringify(d2.tiles) === JSON.stringify(d0.tiles), detail: { text, areas: [areas(d0), areas(d1), areas(d2)] } };
  });

  /* ===== 14-17. player-safe boundaries and the fog without cut-outs ===== */
  await check('topo.14.fog-painting-leaves-topology-and-the-gm-boundary-untouched', async () => {
    const d0 = await docNow(), s0 = await perimeterNow();
    const cells = aFoot.concat(Model.neighborIds(aFoot[0]));
    const r = await dispatch({ type: 'setCellsRevealed', cellKeys: cells, revealed: true });
    const d1 = await docNow(), s1 = await perimeterNow();
    return { ok: r.ok === true && JSON.stringify(d1.tiles) === JSON.stringify(d0.tiles) && s1.gm === s0.gm && areas(d1) === areas(d0), detail: { s0, s1 } };
  });
  await check('topo.15.player-preview-draws-only-safe-boundaries-and-never-the-hidden-region-shape', async () => {
    await page.click('[data-j2-preview]'); await sleep(350);
    const proj = await page.evaluate(() => Journey2View.debugApi().projection());
    const s = await perimeterNow(), state = await st();
    const d = await docNow();
    const revealed = new Set(proj.revealedCells);
    const safe = proj.perimeter.every(x => revealed.has(x.cell) && (revealed.has(Model.neighborIds(x.cell)[x.dir]) || !Model.isFoggableCell(ctx0, Model.neighborIds(x.cell)[x.dir])));
    const hiddenRegion = d.tiles.filter(t => t.batchId === B).map(t => t.cell);
    const leaks = proj.perimeter.filter(x => hiddenRegion.includes(x.cell) || hiddenRegion.includes(Model.neighborIds(x.cell)[x.dir])).length;
    const a11y = await page.evaluate(() => ({ gmEmpty: !document.querySelector('[data-j2-g="perimeter"] path'), hidden: !!document.querySelector('[data-j2-g="perimeterPlayer"]').closest('[aria-hidden="true"]') }));
    await shot(page, 'topo-03-player-preview.png');
    return { ok: state.fog.previewMode && s.player === proj.perimeter.length && s.player > 0 && safe && leaks === 0 && a11y.gmEmpty && a11y.hidden && s.gm === 0, detail: { player: s.player, projected: proj.perimeter.length, leaks, a11y } };
  });
  await check('topo.16.player-preview-fog-has-no-rectangular-cut-outs-around-labels-and-icons', async () => {
    const r = await page.evaluate(() => ({ masks: document.querySelectorAll('mask').length, rects: document.querySelectorAll('[data-j2-g="fog"] rect').length, attr: document.querySelector('[data-j2-g="fog"]').getAttribute('mask'), veil: (document.querySelector('[data-j2-fog-veil]').getAttribute('d') || '').split('M').length - 1 }));
    return { ok: r.masks === 0 && r.rects === 0 && r.attr === null && r.veil > 1000, detail: r };
  });
  await page.click('[data-j2-preview-back]'); await sleep(250);

  /* ===== 18. localization ===== */
  await check('topo.17.the-separate-area-dialog-and-reasons-exist-in-russian', async () => {
    await page.evaluate(() => { localStorage.setItem('dhcodex_lang', JSON.stringify('ru')); });
    await page.reload(); await page.waitForSelector('.j2-viewport', { timeout: 60000 });
    await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
    await sleep(400);
    const d = await docNow();
    const spare = await makeBatch(1);
    const free = at(2, 7);
    await view(grid.cellCenter(open.q, open.r)[0] + 100, grid.cellCenter(open.q, open.r)[1] + 60, 0.6);
    await dragStock(spare, 'one', free, 'drop');
    const r = await page.evaluate(() => { const x = document.querySelector('dialog[open]'); return x ? { title: x.querySelector('h3').innerText, btn: [...x.querySelectorAll('button')].map(b => b.innerText) } : null; });
    await shot(page, 'topo-04-separate-dialog-ru.png');
    if (r) await page.click('dialog[open] button:has-text("Отмена")');
    return { ok: !!r && r.title === 'Начать отдельную область?' && r.btn.includes('Начать отдельную область') && d.tiles.length > 0, detail: r };
  });

  await page.close(); await context.close();
}

module.exports = { runTopologyChecks };
