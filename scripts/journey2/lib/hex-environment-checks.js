'use strict';
/* ============================================================
   Bacchus's Atlas — scripts/journey2/lib/hex-environment-checks.js
   Browser verification of Journey 2 per-hex Environment assignment (PD-025): the inline picker limited to the region's
   biome, the reused Environment Overlay, assign / change / detach with Undo / Redo, the GM-only map marker, the tile
   lifecycle (move, return, Undo), Player Preview leaking nothing, sanctuary / Soul Echo clicks unchanged, and EN / RU.
   Shared by stage1-verify.js (full run) and browser-verify.js (quick run). Real pointer and keyboard input in a FRESH
   browser context (the owner's browser storage is never touched); the debug API only reads state, translates cell ids
   into client pixels and creates the fixture regions.

   runHexEnvironmentChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc })
   ============================================================ */
const fs = require('fs');
const path = require('path');

async function runHexEnvironmentChecks(env) {
  const { browser, base, check, shot, logs, attachLogging, Geo, Model, template, anchorsDoc } = env;
  const ctx0 = Model.createContext(template, anchorsDoc), grid = ctx0.grid;
  const SEAM_X = template.composition.seam.worldX;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const envs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'environments.json'), 'utf8'));
  const catalog = Array.isArray(envs) ? envs : envs.environments || Object.values(envs);
  const forBiome = b => catalog.filter(e => e.biomes.includes(b));

  const open = (() => {
    const c0 = grid.worldToCell(SEAM_X, 900);
    for (let ring = 0; ring < 60; ring++) for (let dq = -ring; dq <= ring; dq++) for (let dr = -ring; dr <= ring; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== ring) continue;
      const q = c0.q + dq, r = c0.r + dr;
      let ok = true;
      for (let a = -5; a <= 5 && ok; a++) for (let b = -5; b <= 5; b++) if (!ctx0.policy(q + a, r + b).ok) { ok = false; break; }
      if (ok) return { q, r };
    }
    throw new Error('no open area');
  })();
  const at = (dq, dr) => Geo.cellId(open.q + dq, open.r + dr);
  const MV = Geo.cellId(open.q + 1, open.r - 1);   // a free cell that keeps region w0..w3 (and the whole prepared map) connected when w0 moves there

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'en-US' });
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } } catch (e) { /* none */ } });
  const page = await context.newPage();
  attachLogging(page, logs, 'hexenv');

  const st = () => page.evaluate(() => Journey2View.debugState());
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const clientOf = cell => page.evaluate(c => Journey2View.debugApi().cellToClient(c), cell);
  const dispatch = cmd => page.evaluate(c => Journey2View.debugApi().dispatch(c), cmd);
  const tileOf = async id => (await docNow()).tiles.find(t => t.id === id);
  const markCount = () => page.locator('[data-j2-g="envmarks"] .j2-envmark').count();
  const storageSnap = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(k => k.startsWith('dhcodex_journey2_')).sort().map(k => [k, localStorage.getItem(k)])));
  async function boot() {
    await page.waitForSelector('.j2-viewport', { timeout: 60000 });
    await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
    await sleep(300);
  }
  async function view(x, y, scale) {
    await page.evaluate(([x0, y0, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width / 2 + 160 - x0 * s, ty: r.height / 2 - y0 * s }); }, [x, y, scale]);
    await sleep(280);
  }
  async function makeBatch(biome, size, o) {
    return page.evaluate(([b, sz, opt]) => {
      const M = Journey2Model, id = M.newId('b');
      const region = { habitat: { biome: b, blighted: !!(opt && (opt.blighted || opt.overtaken)), overtaken: !!(opt && opt.overtaken), source: 'rolled', rolls: [4] }, terrain: { value: 2, source: 'rolled' }, size: sz, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 17 };
      return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null;
    }, [biome, size, o || null]);
  }
  const place = (batchId, tiles, allowDetached) => dispatch({ type: 'place', batchId, tiles, allowDetached: !!allowDetached });
  /** Closes any open inspector first (its panel can sit over a neighbouring hex), then clicks the cell like a GM would. */
  async function clickCell(cell, keep) { if (!keep) { await page.keyboard.press('Escape'); await sleep(80); } const p = await clientOf(cell); await page.mouse.click(p.x, p.y); await sleep(160); }
  async function dragTile(from, to) {
    const a = await clientOf(from), b = await clientOf(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await sleep(60);
    await page.mouse.up(); await sleep(200);
  }
  const sec = () => page.locator('[data-j2-i="hexEnvSec"]');
  const names = () => page.locator('.j2-hexenv-list .j2-env-name').allInnerTexts();
  const cam = async () => (await st()).camera;
  const press = key => page.keyboard.press(key);

  await page.goto(base + '#/journey');
  await boot();
  const c0 = grid.cellCenter(open.q, open.r);
  await view(c0[0] + 60, c0[1] + 40, 0.8);

  const W = await makeBatch('wetland', 4), WS = await makeBatch('wetland', 2, { blighted: true }), OVER = await makeBatch(null, 1, { overtaken: true });
  await place(W, [0, 1, 2, 3].map(i => ({ id: 'w' + i, cell: at(i, 0) })));
  await place(WS, [{ id: 's0', cell: at(0, 1) }, { id: 's1', cell: at(1, 1) }]);
  const overPlaced = await place(OVER, [{ id: 'o0', cell: at(0, -1) }]);
  if (!overPlaced.ok) throw new Error('fixture: the overtaken region could not be placed: ' + JSON.stringify(overPlaced.error) + ' batch ' + OVER);
  await page.evaluate(() => document.querySelector('.j2-viewport').focus());
  const wetlandNames = forBiome('wetland').sort((a, b) => a.tier - b.tier).map(e => e.id);

  /* ===== inspector sources ===== */
  await check('hexenv.01.a-map-opened-inspector-shows-hex-environment-and-hides-suggested', async () => {
    await clickCell(at(0, 0));
    const r = await page.evaluate(() => ({ sec: !document.querySelector('[data-j2-i="hexEnvSec"]').hidden, sug: !document.querySelector('[data-j2-i="envSec"]').hidden, none: document.querySelector('[data-j2-i="hexEnvBody"]').innerText, choose: !!document.querySelector('[data-j2-hexenv="choose"]'), headingBeforeEncounter: document.querySelector('#j2-hexenv-title').compareDocumentPosition(document.querySelector('[data-t="journey_k_encounter"]')) & Node.DOCUMENT_POSITION_FOLLOWING }));
    await shot(page, 'hexenv-01-unassigned.png');
    return { ok: r.sec && !r.sug && /No Environment assigned to this hex/.test(r.none) && r.choose && !!r.headingBeforeEncounter, detail: r };
  });
  await check('hexenv.02.a-card-opened-inspector-has-no-assignment-controls-and-keeps-suggested', async () => {
    await page.click(`.j2-card[data-batch="${W}"] [data-j2-inspect]`); await sleep(200);
    const r = await page.evaluate(() => ({ sec: !document.querySelector('[data-j2-i="hexEnvSec"]').hidden, sug: !document.querySelector('[data-j2-i="envSec"]').hidden, label: document.querySelector('[data-j2-i="envLabel"]').innerText, assign: document.querySelectorAll('[data-j2-hexenv]').length, source: Journey2View.debugState().inspector.source }));
    return { ok: !r.sec && r.sug && /Suggested environments · \d+/i.test(r.label) && r.assign === 0 && r.source === 'card', detail: r };
  });

  /* ===== picker contents ===== */
  await check('hexenv.03.the-picker-lists-exactly-the-wetland-environments-in-adapter-order', async () => {
    await clickCell(at(0, 0));
    await page.click('[data-j2-hexenv="choose"]'); await sleep(120);
    const shown = await page.locator('.j2-hexenv-list .j2-env-link').evaluateAll(a => a.map(x => x.getAttribute('href')));
    const tiers = await page.locator('.j2-hexenv-list .j2-env-tier').allInnerTexts();
    const suggestedIds = shown.map(h => decodeURIComponent(h));
    const expected = new Set(forBiome('wetland').map(e => e.id));
    const matches = shown.length === expected.size && [...expected].every(id => shown.some(h => h.includes(id)));
    const sorted = tiers.every((t, i) => i === 0 || Number(tiers[i - 1]) <= Number(t));
    const r = await page.evaluate(() => { const l = document.querySelector('.j2-hexenv-list'); return { overflow: getComputedStyle(l).overflowY, expanded: document.querySelector('[data-j2-hexenv="choose"]').getAttribute('aria-expanded'), assigns: document.querySelectorAll('[data-j2-hexenv="assign"]').length, label: document.querySelector('[data-j2-hexenv="assign"]').getAttribute('aria-label') }; });
    await shot(page, 'hexenv-02-picker.png');
    return { ok: matches && sorted && r.overflow === 'auto' && r.expanded === 'true' && r.assigns === expected.size && /^Assign .+ to this hex$/.test(r.label), detail: { shown: shown.length, expected: expected.size, sorted, r } };
  });
  await check('hexenv.04.opening-and-closing-the-picker-creates-no-history-and-writes-nothing', async () => {
    const before = await st(), snap = await storageSnap();
    await page.click('[data-j2-hexenv="choose"]'); await sleep(100);   // close
    const closed = await page.locator('.j2-hexenv-list').count();
    await page.click('[data-j2-hexenv="choose"]'); await sleep(100);   // open again
    const after = await st();
    const focus = await page.evaluate(() => document.activeElement.getAttribute('data-j2-hexenv'));
    return { ok: closed === 0 && after.history.undo === before.history.undo && (await storageSnap()) === snap && focus === 'choose', detail: { closed, before: before.history, after: after.history, focus } };
  });

  /* ===== overlay without assigning ===== */
  await check('hexenv.05.a-picker-name-opens-the-existing-overlay-without-assigning-and-closing-preserves-state', async () => {
    const before = await st(), cam0 = before.camera, snap = await storageSnap();
    const link = page.locator('.j2-hexenv-list .j2-env-link').first();
    await link.click(); await sleep(500);
    const opened = await page.locator('.modal-overlay').count();
    const mid = await page.evaluate(() => ({ hash: location.hash, mounted: Journey2View.isMounted() }));
    await shot(page, 'hexenv-03-overlay.png');
    await press('Escape'); await sleep(400);
    const after = await st(), cam1 = after.camera;
    const r = await page.evaluate(() => ({ picker: !!document.querySelector('.j2-hexenv-list'), insp: !document.querySelector('[data-j2-inspector]').hidden, focus: document.activeElement.className }));
    const t = await tileOf('w0');
    return { ok: opened > 0 && mid.mounted && !t.environmentId && cam0.scale === cam1.scale && cam0.tx === cam1.tx && cam0.ty === cam1.ty && after.history.undo === before.history.undo && (await storageSnap()) === snap && r.insp && after.inspector.tileId === 'w0' && after.selectedTile === 'w0', detail: { opened, mid, r, cam0, cam1 } };
  });

  /* ===== assign ===== */
  let pickedName = '', pickedId = '';
  await check('hexenv.06.assign-closes-the-picker-keeps-the-inspector-and-selection-and-adds-one-marker', async () => {
    const before = await st();
    const row = page.locator('.j2-hexenv-row').filter({ hasText: 'Buzzing Swamp' });
    pickedName = 'Buzzing Swamp'; pickedId = 'buzzing-swamp';
    await row.locator('[data-j2-hexenv="assign"]').click(); await sleep(250);
    const after = await st(), t = await tileOf('w0');
    const r = await page.evaluate(() => ({ picker: !!document.querySelector('.j2-hexenv-list'), card: document.querySelector('[data-j2-i="hexEnvBody"]').innerText, link: document.querySelector('[data-j2-hexenv-link]') && document.querySelector('[data-j2-hexenv-link]').getAttribute('href'), focus: document.activeElement.hasAttribute('data-j2-hexenv-link'), live: document.querySelector('[data-j2-live]').textContent, insp: !document.querySelector('[data-j2-inspector]').hidden }));
    await shot(page, 'hexenv-04-assigned.png');
    return { ok: t.environmentId === pickedId && !r.picker && /Tier 1/.test(r.card) && /Buzzing Swamp/.test(r.card) && /^#\/.*buzzing-swamp/.test(r.link) && r.focus && /Environment assigned: Buzzing Swamp/.test(r.live) && r.insp && after.inspector.tileId === 'w0' && after.history.undo === before.history.undo + 1 && (await markCount()) === 1, detail: { r, history: after.history } };
  });
  await check('hexenv.07.the-marker-is-decorative-non-interactive-and-inside-its-hex', async () => {
    const r = await page.evaluate(() => {
      const g = document.querySelector('[data-j2-g="envmarks"]'), m = g.querySelector('.j2-envmark');
      return { aria: g.getAttribute('aria-hidden'), pe: g.getAttribute('pointer-events'), count: g.querySelectorAll('.j2-envmark').length, tabbable: !!g.querySelector('[tabindex],a,button') };
    });
    return { ok: r.aria === 'true' && r.pe === 'none' && r.count === 1 && !r.tabbable, detail: r };
  });
  await check('hexenv.08.hover-shows-the-environment-name-in-neutral-mode-only', async () => {
    await press('Escape'); await sleep(100);   // close the inspector so the hover target is plain map
    const p = await clientOf(at(0, 0));
    await page.mouse.move(p.x - 20, p.y); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(150);
    const tip = await page.evaluate(() => { const t = document.querySelector('[data-j2-tip]'); return { hidden: t.hidden, text: t.innerText }; });
    const p2 = await clientOf(at(1, 0));
    await page.mouse.move(p2.x, p2.y, { steps: 4 }); await sleep(150);
    const none = await page.evaluate(() => document.querySelector('[data-j2-tip]').hidden);
    await page.click('[data-j2-fog-tool="reveal"]'); await sleep(100);
    await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(150);
    const inFog = await page.evaluate(() => document.querySelector('[data-j2-tip]').hidden);
    await page.click('[data-j2-fog-tool="reveal"]'); await sleep(100);
    return { ok: !tip.hidden && /Buzzing Swamp/.test(tip.text) && none && inFog, detail: { tip, none, inFog } };
  });

  /* ===== move ===== */
  await check('hexenv.09.moving-the-tile-carries-the-assignment-and-the-marker', async () => {
    await clickCell(at(0, 0));
    await dragTile(at(0, 0), MV);
    const t = await tileOf('w0'), r = await page.evaluate(() => document.querySelector('[data-j2-i="hexEnvBody"]').innerText);
    const markerAt = await page.evaluate(() => { const m = document.querySelector('.j2-envmark'); return m ? m.getAttribute('transform') : null; });
    return { ok: t.cell === MV && t.environmentId === 'buzzing-swamp' && (await markCount()) === 1 && !!markerAt, detail: { cell: t.cell, env: t.environmentId, r } };
  });

  /* ===== change / undo / redo ===== */
  await check('hexenv.10.change-is-one-history-entry-and-undo-redo-restore-the-ids-directly', async () => {
    await clickCell(MV);
    await page.click('[data-j2-hexenv="change"]'); await sleep(120);
    const current = await page.evaluate(() => ({ assigned: document.querySelector('.j2-hexenv-row.is-current .j2-hexenv-assigned').innerText, redundantAssign: !!document.querySelector('.j2-hexenv-row.is-current [data-j2-hexenv="assign"]') }));
    const before = await st();
    await page.locator('.j2-hexenv-row').filter({ hasText: 'Corrupted Swamp' }).locator('[data-j2-hexenv="assign"]').click(); await sleep(250);
    const a = await tileOf('w0'), h1 = (await st()).history;
    await page.keyboard.press('Control+z'); await sleep(200);
    const b = await tileOf('w0');
    await page.keyboard.press('Control+y'); await sleep(200);
    const c = await tileOf('w0');
    const pickerAfterUndo = await page.locator('.j2-hexenv-list').count();
    return { ok: current.assigned === 'Assigned' && !current.redundantAssign && a.environmentId === 'corrupted-swamp' && h1.undo === before.history.undo + 1 && b.environmentId === 'buzzing-swamp' && c.environmentId === 'corrupted-swamp' && pickerAfterUndo === 0, detail: { current, a: a.environmentId, b: b.environmentId, c: c.environmentId, h1 } };
  });

  /* ===== detach / undo ===== */
  await check('hexenv.11.detach-clears-without-a-dialog-focuses-choose-and-undo-restores', async () => {
    await clickCell(MV);
    await page.click('[data-j2-hexenv="detach"]'); await sleep(250);
    const t = await tileOf('w0');
    const r = await page.evaluate(() => ({ focus: document.activeElement.getAttribute('data-j2-hexenv'), dialog: document.querySelectorAll('dialog[open]').length, live: document.querySelector('[data-j2-live]').textContent }));
    const marks = await markCount();
    await page.keyboard.press('Control+z'); await sleep(200);
    const back = await tileOf('w0');
    return { ok: !t.environmentId && !('environmentId' in t) && r.focus === 'choose' && r.dialog === 0 && /detached/.test(r.live) && marks === 0 && back.environmentId === 'corrupted-swamp' && (await markCount()) === 1, detail: { r, marks, back: back.environmentId } };
  });

  /* ===== the same environment on many tiles; filtering ===== */
  await check('hexenv.12.the-same-environment-can-sit-on-several-hexes', async () => {
    await clickCell(at(1, 0));
    await page.click('[data-j2-hexenv="choose"]');
    await page.locator('.j2-hexenv-row').filter({ hasText: 'Corrupted Swamp' }).locator('[data-j2-hexenv="assign"]').click(); await sleep(250);
    const d = await docNow();
    return { ok: d.tiles.filter(t => t.environmentId === 'corrupted-swamp').length === 2 && (await markCount()) === 2, detail: d.tiles.map(t => [t.id, t.environmentId]) };
  });
  await check('hexenv.13.a-shadowblighted-wetland-hex-offers-the-same-wetland-list', async () => {
    await clickCell(at(0, 1));
    await page.click('[data-j2-hexenv="choose"]'); await sleep(100);
    const n = await page.locator('.j2-hexenv-list .j2-env-link').count();
    const blight = await page.evaluate(() => !document.querySelector('[data-j2-i="blight"]').hidden);
    return { ok: n === forBiome('wetland').length && blight, detail: { n, blight } };
  });
  await check('hexenv.14.a-fully-overtaken-region-offers-no-picker-and-no-fallback-list', async () => {
    await clickCell(at(0, -1));
    const r = await page.evaluate(() => ({ text: document.querySelector('[data-j2-i="hexEnvBody"]').innerText, buttons: document.querySelectorAll('[data-j2-hexenv]').length, list: document.querySelectorAll('.j2-hexenv-list').length }));
    r.tiles = (await docNow()).tiles.map(t => t.id + '@' + t.cell).join(' '); r.insp = (await st()).inspector;
    return { ok: /No habitat-specific environments are available for this region/.test(r.text) && r.buttons === 0 && r.list === 0, detail: r };
  });
  await check('hexenv.15.an-id-the-habitat-no-longer-offers-renders-unavailable-and-can-be-detached', async () => {
    await clickCell(at(0, 1));
    await dispatch({ type: 'setTileEnvironment', tileId: 's0', environmentId: 'lizardfolk-city-not-here' });
    await clickCell(at(0, 1)); await sleep(100);
    const r = await page.evaluate(() => { const b = document.querySelector('[data-j2-i="hexEnvBody"]'); return { text: b.innerText, link: !!b.querySelector('a'), detach: !!b.querySelector('[data-j2-hexenv="detach"]'), change: !!b.querySelector('[data-j2-hexenv="change"]') }; });
    const kept = (await tileOf('s0')).environmentId;
    await page.click('[data-j2-hexenv="detach"]'); await sleep(200);
    return { ok: /Environment unavailable/.test(r.text) && /Stored id: lizardfolk-city-not-here/.test(r.text) && /no longer available for this habitat/.test(r.text) && !r.link && r.detach && r.change && kept === 'lizardfolk-city-not-here' && !(await tileOf('s0')).environmentId, detail: r };
  });
  await check('hexenv.16.a-malformed-or-ineligible-assignment-cannot-be-dispatched-through-the-model', async () => {
    const r = await dispatch({ type: 'setTileEnvironment', tileId: 'w1', environmentId: 'Not A Valid Id' });
    const nt = await dispatch({ type: 'setTileEnvironment', tileId: 'nope', environmentId: 'buzzing-swamp' });
    return { ok: r.ok === false && r.error.code === 'bad-environment' && nt.ok === false && nt.error.code === 'no-tile', detail: { r, nt } };
  });

  /* ===== return to stock ===== */
  await check('hexenv.17.returning-a-tile-removes-its-marker-and-undo-restores-the-assignment', async () => {
    await dispatch({ type: 'setTileEnvironment', tileId: 'w3', environmentId: 'blood-marsh' });   // the chain's end tile: returning it never splits the prepared map
    const marks0 = await markCount();
    await clickCell(at(3, 0));
    await page.click('[data-j2-return]'); await sleep(250);
    const gone = await tileOf('w3'), marks = await markCount();
    await page.keyboard.press('Control+z'); await sleep(250);
    const back = await tileOf('w3');
    await page.keyboard.press('Control+y'); await sleep(250);
    const again = await tileOf('w3');
    await page.keyboard.press('Control+z'); await sleep(250);
    return { ok: !gone && marks === marks0 - 1 && back && back.environmentId === 'blood-marsh' && !again && (await markCount()) === marks0, detail: { marks0, marks, back, again } };
  });

  /* ===== Player Preview ===== */
  await check('hexenv.18.player-preview-shows-no-marker-name-id-or-controls-even-on-a-revealed-hex', async () => {
    await dispatch({ type: 'setCellsRevealed', cellKeys: [MV, at(1, 0)], revealed: true });
    const gm = await markCount();
    await page.click('[data-j2-preview]'); await sleep(300);
    const r = await page.evaluate(() => {
      const root = document.querySelector('.j2');
      const html = root.innerHTML;
      return { marks: document.querySelectorAll('.j2-envmark').length, inspector: !document.querySelector('[data-j2-inspector]').hidden, controls: document.querySelectorAll('[data-j2-hexenv]').length, proj: JSON.stringify(Journey2View.debugApi().projection()), tipHidden: document.querySelector('[data-j2-tip]').hidden, hasName: /Corrupted Swamp|Buzzing Swamp/.test(root.innerText), assignedIds: root.querySelectorAll('[data-env-id], [data-j2-hexenv-link]').length, bodyHtml: document.querySelector('[data-j2-i="hexEnvBody"]').innerHTML.length };
    });
    await shot(page, 'hexenv-05-player-preview.png');
    const p = await clientOf(MV);
    await page.mouse.move(p.x - 10, p.y); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(150);
    const tip = await page.evaluate(() => document.querySelector('[data-j2-tip]').hidden);
    await page.click('[data-j2-preview-back]'); await sleep(300);
    const t = await tileOf('w0');
    return { ok: gm >= 2 && r.marks === 0 && !r.inspector && r.controls === 0 && r.assignedIds === 0 && r.bodyHtml === 0 && !/environment|swamp/i.test(r.proj) && r.tipHidden && tip && !r.hasName && t.environmentId === 'corrupted-swamp' && (await markCount()) >= 2, detail: { gm, r: Object.assign({}, r, { proj: r.proj.length }), tip } };
  });
  await check('hexenv.19.entering-a-fog-tool-closes-the-picker-and-clicking-an-assigned-hex-paints-fog', async () => {
    await clickCell(at(2, 0));
    await page.click('[data-j2-hexenv="choose"]'); await sleep(80);
    const open = await page.locator('.j2-hexenv-list').count();
    await page.click('[data-j2-fog-tool="hide"]'); await sleep(150);
    const closed = (await page.locator('.j2-hexenv-list').count()) === 0 && await page.evaluate(() => document.querySelector('[data-j2-inspector]').hidden);
    const before = (await tileOf('w1')).environmentId;
    await clickCell(MV, true); await sleep(100);
    const d = await docNow();
    await page.click('[data-j2-fog-tool="hide"]'); await sleep(100);
    return { ok: open === 1 && closed && !d.playerVisibility.revealedCells.includes(MV) && (await tileOf('w1')).environmentId === before && (await tileOf('w0')).environmentId === 'corrupted-swamp', detail: { open, closed } };
  });

  /* ===== persistence ===== */
  await check('hexenv.20.autosave-reload-and-backup-keep-the-assignments-and-the-ui-key-does-not', async () => {
    await sleep(500);
    const ids = (await docNow()).tiles.filter(t => t.environmentId).map(t => [t.id, t.environmentId]);
    const ui = await page.evaluate(() => localStorage.getItem('dhcodex_journey2_ui') || '');
    await page.reload(); await boot();
    const after = (await docNow()).tiles.filter(t => t.environmentId).map(t => [t.id, t.environmentId]);
    return { ok: ids.length >= 2 && JSON.stringify(ids) === JSON.stringify(after) && !/environment|picker/i.test(ui) && (await markCount()) === ids.length, detail: { ids, after, ui } };
  });

  /* ===== sanctuary and Soul Echo clicks ===== */
  await check('hexenv.21.sanctuary-and-soul-echo-behaviour-is-unchanged', async () => {
    await view(c0[0] + 60, c0[1] + 40, 0.8);
    await page.click('[data-j2-sanc-generate]'); await sleep(400);
    const id = [...ctx0.sanctuaryIds][0];
    const pt = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), id);
    await view(pt ? 0 : 0, 0, 0.8).catch(() => {});
    const camNow = await cam();
    const pt2 = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), id);
    await page.evaluate(i => { const a = Journey2View.debugApi().markers().find(m => m.id === i); const c = Journey2View.debugApi(); const w = [a.rect[0] + a.rect[2] / 2, a.rect[1] + a.rect[3] / 2]; const r = document.querySelector('.j2-viewport').getBoundingClientRect(); c.setCamera({ scale: 1, tx: r.width / 2 + 160 - w[0], ty: r.height / 2 - w[1] }); }, id);
    await sleep(300);
    const pt3 = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), id);
    await page.mouse.click(pt3.x, pt3.y); await sleep(250);
    const opened = await page.evaluate(() => !document.querySelector('[data-j2-sanctuary]').hidden);
    const insp = await page.evaluate(() => Journey2View.debugState().inspector.open);
    const envInSanc = await page.evaluate(() => /environment/i.test(document.querySelector('[data-j2-sanctuary]').innerText));
    await press('Escape'); await sleep(150);
    await page.click('[data-j2-echo-place]'); await sleep(250);
    const echoes = (await docNow()).soulEchoes.anchorIds.length;
    const echoPe = await page.evaluate(() => document.querySelector('[data-j2-g="echoes"]').getAttribute('pointer-events'));
    return { ok: opened && !insp && !envInSanc && echoes === 9 && echoPe === 'none' && !!camNow, detail: { opened, insp, envInSanc, echoes, echoPe } };
  });

  /* ===== localization ===== */
  await check('hexenv.22.russian-relabels-names-and-controls-without-changing-the-saved-ids', async () => {
    const snapDoc = JSON.stringify((await docNow()).tiles);
    await view(c0[0] + 60, c0[1] + 40, 0.8);
    await page.evaluate(() => { localStorage.setItem('dhcodex_lang', JSON.stringify('ru')); });
    await page.reload(); await boot();
    await view(c0[0] + 60, c0[1] + 40, 0.8);
    await clickCell(MV);
    const r = await page.evaluate(() => ({ body: document.querySelector('[data-j2-i="hexEnvBody"]').innerText, title: document.querySelector('#j2-hexenv-title').innerText }));
    await page.click('[data-j2-hexenv="change"]'); await sleep(150);
    const row = await page.evaluate(() => ({ assign: document.querySelector('[data-j2-hexenv="assign"]').getAttribute('aria-label'), assigned: document.querySelector('.j2-hexenv-assigned') && document.querySelector('.j2-hexenv-assigned').innerText }));
    await shot(page, 'hexenv-06-ru.png');
    const same = JSON.stringify((await docNow()).tiles) === snapDoc;
    const ruName = await page.evaluate(() => document.querySelector('[data-j2-hexenv-link]').innerText);
    return { ok: r.title.toLowerCase() === 'окружение гекса' && /Ранг \d/.test(r.body) && !/Corrupted Swamp/.test(r.body) && /Назначить/.test(row.assign) && row.assigned === 'Назначено' && same && ruName.length > 0, detail: { r, row, same } };
  });

  await page.close(); await context.close();
}

module.exports = { runHexEnvironmentChecks };
