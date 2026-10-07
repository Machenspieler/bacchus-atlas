'use strict';
/* ============================================================
   Bacchus's Atlas — scripts/journey2/lib/locate-checks.js
   Browser verification of "Locate Soul Echoes" (PD-030) and the Soul Echo Available / Collected state: the overlay's Soul Echo row,
   entering / leaving the tool (Reveal, Hide, armed placement, inspector and overlay are cancelled), hex selection with real pointer
   input (a tile, a sanctuary icon, a pan gesture), the animated compass (text only after the needle settles, the needle and the text agree
   with the independently computed bearing), direction-only output, "here", collected Echoes excluded and eligible again after Undo, the frozen
   RNG draw, Undo / Redo staleness, Player Preview and Print Preview isolation, JSON backup, EN / RU names and reduced motion.
   Real pointer / keyboard input in FRESH browser contexts (the owner's browser storage is never touched).
   Shared by stage1-verify.js (full run); also runnable alone:   node scripts/journey2/lib/locate-checks.js

   runLocateChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc })
   ============================================================ */
const fs = require('fs');
const path = require('path');

async function runLocateChecks(env) {
  const { browser, base, check, shot, logs, attachLogging, Geo, Model, template, anchorsDoc } = env;
  const Locate = require(path.join(__dirname, '..', '..', '..', 'js', 'journey2-locate.js'));
  const ctx0 = Model.createContext(template, anchorsDoc);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const anchor = id => anchorsDoc.anchors.find(a => a.stableId === id);

  async function newPage(opts, label) {
    const context = await browser.newContext(Object.assign({ viewport: { width: 1366, height: 768 }, locale: 'en-US', acceptDownloads: true }, opts || {}));
    await context.addInitScript(() => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } } catch (e) { /* storage unavailable */ } });
    const page = await context.newPage();
    attachLogging(page, logs, label);
    await page.goto(base + '#/journey');
    await page.waitForSelector('.j2-viewport', { timeout: 60000 });
    await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
    await sleep(300);
    return { page, context };
  }

  const { page, context } = await newPage({}, 'locate');
  const st = () => page.evaluate(() => Journey2View.debugState());
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const dispatch = cmd => page.evaluate(c => Journey2View.debugApi().dispatch(c), cmd);
  const loc = async () => (await st()).locate;
  const cell = (x, y) => { const c = ctx0.grid.worldToCell(x, y); return Geo.cellId(c.q, c.r); };
  const clientOf = c => page.evaluate(id => Journey2View.debugApi().cellToClient(id), c);
  const clickCell = async c => { const p = await clientOf(c); await page.mouse.click(p.x, p.y); };
  const locateBtn = () => page.locator('[data-j2-echo-locate]');
  const popover = () => page.locator('[data-j2-locate]');
  const popText = () => popover().innerText();
  const waitStatus = (status, ms) => page.waitForFunction(s => { const d = Journey2View.debugState(); return d.locate && d.locate.status === s; }, status, { timeout: ms || 4000 });
  const overlayOpen = () => page.evaluate(() => !document.querySelector('[data-j2-sanctuary]').hidden);
  const cam = async () => JSON.stringify((await st()).camera);
  const outText = () => page.evaluate(() => document.querySelector('[data-j2-l="line"]').textContent + '|' + document.querySelector('[data-j2-l="dir"]').textContent);
  async function fit() { await page.evaluate(() => { document.querySelector('[data-j2-fit]').click(); }); await sleep(300); }
  async function centerOn(id, scale) {
    const a = anchor(id);
    await page.evaluate(([x, y, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width / 2 + 60 - x * s, ty: r.height / 2 - y * s }); }, [a.worldPixelAnchor[0], a.worldPixelAnchor[1], scale || 0.8]);
    await sleep(300);
  }
  async function openOverlay(id) {
    await page.keyboard.press('Escape'); await sleep(100);
    await centerOn(id);
    const p = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), id);
    await page.mouse.click(p.x, p.y); await sleep(250);
  }
  /** What the app should answer, computed independently from the document the page really holds. */
  async function expected(originCell) {
    const d = await docNow();
    return Locate.locateSoulEcho({ doc: d, ctx: ctx0, originCellId: originCell, random: () => 0 });
  }
  async function startLocate() { await locateBtn().click(); await sleep(200); }
  async function pickAndSettle(c) { await clickCell(c); await waitStatus('result', 4000); await sleep(150); }
  const dirLabel = (idx, lang) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'data', 'i18n.json'), 'utf8'))[lang][Locate.SIXTEEN_DIRECTIONS[idx].labelKey];
  const NINE = ctx0.sanctuaries.map(s => s.id).filter((id, i) => i % 6 === 0).slice(0, 9);

  /* ---- disabled reasons, then the nine Echoes through the real button ---- */
  await check('locate.01.unavailable-without-echoes-with-a-reason-and-the-button-stays-focusable', async () => {
    const b = locateBtn();
    const r = { aria: await b.getAttribute('aria-disabled'), title: await b.getAttribute('title'), disabled: await b.evaluate(x => x.disabled), reason: await page.locator('[data-j2-locate-reason]').innerText(), describedby: await b.getAttribute('aria-describedby') };
    await b.click({ force: true }); await sleep(250);          // aria-disabled (not disabled): Playwright's actionability check would wait forever
    const toast = await page.locator('[data-j2-hint]').innerText();
    return { ok: r.aria === 'true' && r.title === 'Generate Soul Echoes first.' && !r.disabled && r.reason === 'Generate Soul Echoes first.' && r.describedby === 'j2-locate-reason' && toast === 'Generate Soul Echoes first.' && (await loc()) === null, detail: { r, toast } };
  });
  await check('locate.02.nine-echoes-begin-available-and-the-button-enables', async () => {
    await page.click('[data-j2-echo-place]'); await sleep(500);
    const d = await docNow();
    const b = locateBtn();
    return { ok: d.soulEchoes.anchorIds.length === 9 && d.soulEchoes.collectedAnchorIds.length === 0 && (await b.getAttribute('aria-disabled')) === 'false', detail: d.soulEchoes };
  });
  // a controlled distribution of nine, so the checks know every position (one real command, exactly what the button dispatches)
  await dispatch({ type: 'setSoulEchoes', anchorIds: NINE });
  await sleep(200);
  const ECHO = NINE[3];

  /* ---- the sanctuary overlay's Soul Echo row ---- */
  await check('locate.03.overlay-shows-available-and-mark-collected-keeps-the-overlay-camera-and-one-undo', async () => {
    await openOverlay(ECHO);
    const before = { cam: await cam(), undo: (await st()).history.undo };
    const r0 = { open: await overlayOpen(), visible: await page.locator('[data-j2-s="echo"]').isVisible(), text: await page.locator('[data-j2-s="echoText"]').innerText(), btn: await page.locator('[data-j2-echo-collect]').innerText(), heading: await page.locator('#j2-sanc-echo-h').innerText() };
    await page.locator('[data-j2-echo-collect]').click(); await sleep(250);
    const r1 = { open: await overlayOpen(), text: await page.locator('[data-j2-s="echoText"]').innerText(), btn: await page.locator('[data-j2-echo-collect]').innerText(), cam: await cam(), undo: (await st()).history.undo, doc: (await docNow()).soulEchoes, crystal: await page.locator('.j2-echo.is-collected').count(), name: await page.locator('[data-j2-s="player"]').isVisible() };
    return { ok: r0.open && r0.visible && r0.text === 'Available' && r0.btn === 'Mark collected' && r0.heading.toLowerCase() === 'soul echo' && r1.open && r1.text === 'Collected' && r1.btn === 'Restore Echo' && r1.cam === before.cam && r1.undo === before.undo + 1 && r1.doc.collectedAnchorIds.length === 1 && r1.doc.collectedAnchorIds[0] === ECHO && r1.crystal === 1 && r1.name === false, detail: { r0, r1, before } };
  });
  await check('locate.04.the-collected-state-survives-a-language-switch-and-restore-is-undoable', async () => {
    await page.click('[data-lang="ru"]'); await sleep(300);
    const ru = { open: await overlayOpen(), text: await page.locator('[data-j2-s="echoText"]').innerText(), btn: await page.locator('[data-j2-echo-collect]').innerText() };
    await page.click('[data-lang="en"]'); await sleep(300);
    const en = { open: await overlayOpen(), text: await page.locator('[data-j2-s="echoText"]').innerText() };
    const undo0 = (await st()).history.undo;
    await page.locator('[data-j2-echo-collect]').click(); await sleep(250);
    const restored = { text: await page.locator('[data-j2-s="echoText"]').innerText(), collected: (await docNow()).soulEchoes.collectedAnchorIds.length, undo: (await st()).history.undo };
    await page.locator('[data-j2-echo-collect]').click(); await sleep(250);            // collected again for the Locate checks
    return { ok: ru.open && ru.text === 'Собрано' && ru.btn === 'Вернуть Эхо' && en.open && en.text === 'Collected' && restored.text === 'Available' && restored.collected === 0 && restored.undo === undo0 + 1 && (await docNow()).soulEchoes.collectedAnchorIds[0] === ECHO, detail: { ru, en, restored } };
  });
  await check('locate.05.a-sanctuary-without-an-echo-has-no-echo-section', async () => {
    await page.click('[data-j2-sanc-generate]'); await sleep(600);
    const other = ctx0.sanctuaries.map(s => s.id).find(id => !NINE.includes(id));
    await openOverlay(other);
    const r = { open: await overlayOpen(), echoVisible: await page.locator('[data-j2-s="echo"]').isVisible(), nameRow: await page.locator('[data-j2-s="player"]').isVisible() };
    await page.keyboard.press('Escape'); await sleep(100);
    return { ok: r.open && !r.echoVisible && r.nameRow, detail: r };
  });
  await check('locate.06.deleting-the-generated-characteristics-keeps-the-echo-and-its-state-and-the-overlay-still-opens', async () => {
    await openOverlay(ECHO);
    const hasNameRow = await page.locator('[data-j2-s="player"]').isVisible();
    await page.locator('[data-j2-sanc-delete]').click(); await sleep(250);
    await page.locator('.j2-dialog .btn-danger').click(); await sleep(350);
    const d = await docNow();
    await openOverlay(ECHO);
    const r = { hasNameRow, entry: d.sanctuaries.entries.some(e => e.anchorId === ECHO), echo: d.soulEchoes.anchorIds.includes(ECHO), collected: d.soulEchoes.collectedAnchorIds.includes(ECHO), reopened: await overlayOpen(), echoRow: await page.locator('[data-j2-s="echo"]').isVisible(), tables: await page.locator('[data-j2-s="rows"]').isVisible(), footer: await page.locator('[data-j2-s="foot"]').isVisible(), text: await page.locator('[data-j2-s="echoText"]').innerText() };
    await page.keyboard.press('Escape'); await sleep(100);
    return { ok: hasNameRow && !r.entry && r.echo && r.collected && r.reopened && r.echoRow && !r.tables && !r.footer && r.text === 'Collected', detail: r };
  });

  /* ---- entering the tool ---- */
  await fit();
  const ORIGIN = cell(2300, 1700);
  await check('locate.07.entering-cancels-reveal-hide-armed-placement-and-closes-the-panels-without-moving-the-camera', async () => {
    const out = {};
    for (const mode of ['reveal', 'hide']) {
      await page.click('[data-j2-fog-tool="' + mode + '"]'); await sleep(150);
      const camBefore = await cam();
      await startLocate();
      out[mode] = { fog: (await st()).fog.tool, locate: (await loc()) && (await loc()).status, chip: await page.locator('[data-j2-locate-chip]').isVisible(), cam: (await cam()) === camBefore, pressed: await page.locator('[data-j2-fog-tool="' + mode + '"]').getAttribute('aria-pressed') };
      await page.keyboard.press('Escape'); await sleep(150);
    }
    // armed placement
    const batch = await page.evaluate(() => { const M = Journey2Model, id = M.newId('b'); const region = { habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [6] }, terrain: { value: 2, source: 'rolled' }, size: 5, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 12 }; return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null; });
    await sleep(250);
    const h = page.locator('.j2-card[data-batch="' + batch + '"] [data-j2-handle="one"]');
    if (!(await h.isVisible())) await page.locator('.j2-card[data-batch="' + batch + '"] [data-j2-card-toggle]').click();
    await sleep(200);
    await h.click(); await sleep(200);
    const armed = (await st()).transient && (await st()).transient.kind;
    await startLocate();
    const after = await st();
    out.armed = { before: armed, transient: after.transient, locate: after.locate && after.locate.status };
    await page.keyboard.press('Escape'); await sleep(150);
    // inspector + overlay close
    await dispatch({ type: 'place', batchId: batch, tiles: [{ id: 'lt0', cell: cell(2700, 1000) }] }); await sleep(200);
    await clickCell(cell(2700, 1000)); await sleep(250);
    const insp = (await st()).inspector.open;
    await startLocate();
    out.inspector = { before: insp, after: (await st()).inspector.open, locate: (await loc()).status };
    await page.keyboard.press('Escape'); await sleep(150);
    await openOverlay(NINE[1]);
    const ov = await overlayOpen();
    await startLocate();
    out.overlay = { before: ov, after: await overlayOpen(), locate: (await loc()).status };
    await page.keyboard.press('Escape'); await sleep(150);
    const ok = ['reveal', 'hide'].every(m => out[m].fog === null && out[m].locate === 'selecting' && out[m].chip && out[m].cam && out[m].pressed === 'false') && out.armed.before === 'armed' && out.armed.transient === null && out.armed.locate === 'selecting' &&
      out.inspector.before && !out.inspector.after && out.inspector.locate === 'selecting' && out.overlay.before && !out.overlay.after && out.overlay.locate === 'selecting';
    return { ok, detail: out };
  });
  await check('locate.08.the-chip-announces-the-instruction-hover-shows-a-distinct-hex-and-esc-leaves-without-a-document-change', async () => {
    await fit();
    const d0 = JSON.stringify(await docNow());
    await startLocate();
    const chipText = await page.locator('[data-j2-locate-chip]').innerText();
    const live = await page.locator('[data-j2-live]').innerText();
    const p = await clientOf(ORIGIN);
    await page.mouse.move(p.x, p.y); await sleep(150);
    const hov = { hover: (await loc()).hover, el: await page.locator('[data-j2-g="locate"] .j2-loc-hover').count(), star: await page.locator('[data-j2-g="locate"] .j2-loc-star').count(), fogBrush: await page.locator('.j2-fog-brush').count(), cursor: await page.locator('.j2-viewport').evaluate(e => e.classList.contains('is-locating')) };
    await page.keyboard.press('Escape'); await sleep(150);
    const r = { locate: await loc(), chip: await page.locator('[data-j2-locate-chip]').isVisible(), hoverEl: await page.locator('[data-j2-g="locate"] path').count(), focus: await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-j2-echo-locate')), docSame: JSON.stringify(await docNow()) === d0 };
    return { ok: /Locate Soul Echoes/.test(chipText) && /Select the hex where the party is currently located\./.test(chipText) && /Select the hex/.test(live) && hov.hover === ORIGIN && hov.el === 1 && hov.star === 1 && hov.fogBrush === 0 && hov.cursor && r.locate === null && !r.chip && r.hoverEl === 0 && r.focus && r.docSame, detail: { chipText, live, hov, r } };
  });

  /* ---- a search ---- */
  await check('locate.09.a-click-on-a-hex-starts-the-compass-text-appears-only-after-the-needle-settles-and-matches-the-bearing', async () => {
    const d0 = JSON.stringify(await docNow()), s0 = await st();
    const exp = await expected(ORIGIN);
    await startLocate();
    await clickCell(ORIGIN); await sleep(180);
    const mid = { status: (await loc()).status, out: await outText(), visible: await popover().isVisible(), searching: await page.locator('[data-j2-l="searching"]').isVisible(), role: await popover().getAttribute('role'), labelled: await popover().getAttribute('aria-labelledby'), svgHidden: await page.locator('.j2-compass').getAttribute('aria-hidden') };
    await waitStatus('result', 4000); await sleep(200);
    const l = await loc();
    const end = { out: await outText(), text: await popText(), final: Number(await page.locator('[data-j2-l="needle"]').getAttribute('data-final-angle')), focus: await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-j2-locate')), live: await page.locator('[data-j2-l="out"]').getAttribute('aria-live') };
    const d1 = JSON.stringify(await docNow()), s1 = await st();
    await shot(page, 'locate-01-result.png');
    const label = dirLabel(exp.direction.index, 'en');
    return { ok: exp.ok && exp.type === 'direction' && mid.status === 'animating' && mid.out === '|' && mid.visible && mid.searching && mid.role === 'dialog' && mid.labelled === 'j2-locate-title' && mid.svgHidden === 'true' &&
      l.status === 'result' && l.directionIndex === exp.direction.index && l.targetAnchorId === exp.targetAnchorId && Math.abs(l.bearing - exp.bearing) < 1e-9 &&
      end.out.startsWith('The compass points ' + label.toLowerCase() + '.|' + Locate.SIXTEEN_DIRECTIONS[exp.direction.index].abbreviation + ' · ' + label) && end.final >= 720 + exp.bearing - 0.01 && Math.abs(end.final - (720 + exp.bearing)) < 0.02 &&
      /GM reminder: Nearby Seekers-in-Shadow may sense/.test(end.text) && end.focus && end.live === 'polite' && d0 === d1 && s1.history.undo === s0.history.undo && s1.fog.revealed === s0.fog.revealed && s1.saveStatus === s0.saveStatus &&
      !/mk-\d|distance|days|route|km|sanctuary/i.test(end.text) , detail: { exp: { type: exp.type, bearing: exp.bearing, dir: exp.direction.index }, mid, end, l } };
  });
  await check('locate.10.the-result-reveals-no-target-marker-and-leaves-fog-names-and-the-crystals-alone', async () => {
    const r = { origin: await page.locator('[data-j2-g="locate"] .j2-loc-origin').count(), hoverOnly: await page.locator('[data-j2-g="locate"] .j2-loc-hover').count(), echoes: await page.locator('[data-j2-g="echoes"] .j2-echo').count(), collected: await page.locator('[data-j2-g="echoes"] .j2-echo.is-collected').count(), ringOpen: await overlayOpen() };
    const target = (await loc()).targetAnchorId;
    const targetHighlighted = await page.evaluate(id => !!document.querySelector('[data-echo="' + id + '"][data-highlight], [data-echo="' + id + '"].is-target, .j2-target'), target);
    return { ok: r.origin === 1 && r.hoverOnly === 0 && r.echoes === 9 && r.collected === 1 && !r.ringOpen && !targetHighlighted, detail: r };
  });
  await check('locate.11.choose-another-location-returns-to-selection-keeps-the-camera-and-clears-the-result', async () => {
    const c0 = await cam(), s0 = await st();
    await page.locator('[data-j2-locate-again]').click(); await sleep(250);
    const l = await loc();
    const r = { status: l.status, bearing: l.bearing, target: l.targetAnchorId, origin: l.originCellId, popover: await popover().isVisible(), chip: await page.locator('[data-j2-locate-chip]').isVisible(), cam: (await cam()) === c0, undo: (await st()).history.undo === s0.history.undo, focusViewport: await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('j2-viewport')) };
    return { ok: r.status === 'selecting' && r.bearing === null && r.target === null && r.origin === null && !r.popover && r.chip && r.cam && r.undo && r.focusViewport, detail: r };
  });
  await check('locate.12.the-hex-of-an-available-echo-answers-here-with-no-direction-and-the-centre-lit', async () => {
    const avail = NINE.find(id => id !== ECHO && id !== NINE[1]);
    const c = anchor(avail).cellId;
    await clickCell(c); await waitStatus('result', 3500); await sleep(150);
    const l = await loc();
    const r = { type: l.resultType, dirIdx: l.directionIndex, bearing: l.bearing, kind: await popover().getAttribute('data-kind'), line: await page.locator('[data-j2-l="line"]').innerText(), dirHidden: await page.locator('[data-j2-l="dir"]').isHidden(), final: Number(await page.locator('[data-j2-l="needle"]').getAttribute('data-final-angle')), origin: await page.locator('[data-j2-g="locate"] .j2-loc-origin.is-here').count(), glow: await page.locator('.j2-locate.is-done[data-kind="here"] .j2-cmp-core-glow').count(), text: await popText() };
    await shot(page, 'locate-02-here.png');
    return { ok: r.type === 'here' && r.dirIdx === null && r.bearing === null && r.kind === 'here' && r.line === 'The nearest Soul Echo is here.' && r.dirHidden && r.final === 360 && r.origin === 1 && r.glow === 1 && !/\b(NNE|NNW|ENE|ESE|SSE|SSW|WSW|WNW)\b/.test(r.text) && l.targetAnchorId === avail, detail: r };
  });
  await check('locate.13.close-leaves-locate-removes-the-origin-and-returns-focus-to-the-toolbar-button', async () => {
    await page.locator('[data-j2-locate-close]').click(); await sleep(250);
    const r = { locate: await loc(), popover: await popover().isVisible(), origin: await page.locator('[data-j2-g="locate"] path').count(), focus: await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-j2-echo-locate')), pressed: await locateBtn().getAttribute('aria-pressed'), cursor: await page.locator('.j2-viewport').evaluate(e => e.classList.contains('is-locating')) };
    return { ok: r.locate === null && !r.popover && r.origin === 0 && r.focus && r.pressed === 'false' && !r.cursor, detail: r };
  });
  await check('locate.14.a-collected-echo-is-excluded-and-eligible-again-after-undo', async () => {
    const c = anchor(ECHO).cellId;
    await dispatch({ type: 'setSoulEchoCollected', anchorId: ECHO, collected: false });
    await dispatch({ type: 'setSoulEchoCollected', anchorId: ECHO, collected: true });   // the newest history entry is now "Mark collected"
    await sleep(200);
    await startLocate(); await pickAndSettle(c);
    const a = await loc();
    await page.keyboard.press('Escape'); await sleep(150);
    await page.keyboard.press('Control+z'); await sleep(250);                          // Undo "Mark collected"
    const restored = (await docNow()).soulEchoes.collectedAnchorIds;
    await startLocate(); await pickAndSettle(c);
    const b = await loc();
    await page.keyboard.press('Escape'); await sleep(150);
    await page.keyboard.press('Control+Shift+z'); await sleep(250);                    // Redo: collected again
    return { ok: a.resultType === 'direction' && a.targetAnchorId !== ECHO && restored.length === 0 && b.resultType === 'here' && b.targetAnchorId === ECHO && (await docNow()).soulEchoes.collectedAnchorIds[0] === ECHO, detail: { a, restored, b } };
  });
  await check('locate.15.the-random-draw-happens-once-per-search-and-the-frozen-target-does-not-change', async () => {
    await page.evaluate(() => { window.__draws = 0; Journey2View.debugApi().setLocateRandom(() => { window.__draws++; return 0.5; }); });
    await startLocate(); await clickCell(ORIGIN); await sleep(150);
    const t1 = (await loc()).targetAnchorId, d1 = await page.evaluate(() => window.__draws);
    await waitStatus('result', 4000); await sleep(300);
    const t2 = (await loc()).targetAnchorId, d2 = await page.evaluate(() => window.__draws);
    await page.keyboard.press('Escape'); await sleep(150);
    await page.evaluate(() => Journey2View.debugApi().setLocateRandom(null));
    return { ok: t1 === t2 && d1 === 1 && d2 === 1, detail: { t1, t2, d1, d2 } };
  });
  await check('locate.16.a-tile-and-a-sanctuary-icon-select-the-hex-instead-of-opening-the-inspector-or-the-overlay', async () => {
    const tileCell = cell(2700, 1000);                                                 // the placed hex from check 07
    await startLocate();
    await clickCell(tileCell); await sleep(250);
    const onTile = { locate: (await loc()).status, origin: (await loc()).originCellId, inspector: (await st()).inspector.open, sel: (await st()).selectedTile };
    await page.locator('[data-j2-locate-again]').click(); await sleep(200);
    await centerOn(NINE[1], 0.8);
    const p = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), NINE[1]);
    await page.mouse.click(p.x, p.y); await sleep(250);
    const onIcon = { locate: (await loc()).status, origin: (await loc()).originCellId, overlay: await overlayOpen(), expectedCell: Geo.cellId(...Object.values(ctx0.grid.worldToCell(anchor(NINE[1]).worldPixelAnchor[0], anchor(NINE[1]).worldPixelAnchor[1]))) };
    await page.keyboard.press('Escape'); await sleep(150);
    await fit();
    return { ok: ['animating', 'result'].includes(onTile.locate) && onTile.origin === tileCell && !onTile.inspector && onTile.sel === null && ['animating', 'result'].includes(onIcon.locate) && !onIcon.overlay && onIcon.origin === onIcon.expectedCell, detail: { onTile, onIcon } };
  });
  await check('locate.17.a-pan-gesture-pans-the-map-and-does-not-select-a-hex', async () => {
    await startLocate();
    const p = await clientOf(ORIGIN);
    const c0 = await cam();
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 40, p.y + 30, { steps: 6 }); await page.mouse.up(); await sleep(250);
    const r = { status: (await loc()).status, moved: (await cam()) !== c0 };
    await fit();
    await page.keyboard.press('Escape'); await sleep(150);
    return { ok: r.status === 'selecting' && r.moved, detail: r };
  });
  await check('locate.18.undo-redo-closes-a-stale-result-and-never-reopens-the-compass', async () => {
    await dispatch({ type: 'setSoulEchoCollected', anchorId: ECHO, collected: false });
    await dispatch({ type: 'setSoulEchoCollected', anchorId: ECHO, collected: true });   // newest entry = "Mark collected", ECHO collected
    await sleep(200);
    await startLocate(); await pickAndSettle(ORIGIN);
    const before = await loc();
    await page.keyboard.press('Control+z'); await sleep(300);                          // Undo changes availability while the result is open
    const closed = { locate: await loc(), popover: await popover().isVisible(), live: await page.locator('[data-j2-live]').innerText(), collected: (await docNow()).soulEchoes.collectedAnchorIds.length };
    await page.keyboard.press('Control+Shift+z'); await sleep(300);
    const reopened = await loc();
    return { ok: before.status === 'result' && closed.locate === null && !closed.popover && /Soul Echoes changed/.test(closed.live) && closed.collected === 0 && reopened === null, detail: { before, closed, reopened } };
  });
  await check('locate.19.removing-or-regenerating-echoes-while-locating-closes-the-tool-and-clears-the-collected-state', async () => {
    await startLocate(); await pickAndSettle(ORIGIN);
    await page.click('[data-j2-echo-clear]'); await sleep(250);
    await page.locator('.j2-dialog .btn-danger').click(); await sleep(350);
    const d = await docNow();
    const r = { locate: await loc(), popover: await popover().isVisible(), echoes: d.soulEchoes, aria: await locateBtn().getAttribute('aria-disabled'), title: await locateBtn().getAttribute('title') };
    await page.keyboard.press('Control+z'); await sleep(250);
    const back = (await docNow()).soulEchoes;
    return { ok: r.locate === null && !r.popover && r.echoes.anchorIds.length === 0 && r.echoes.collectedAnchorIds.length === 0 && r.aria === 'true' && r.title === 'Generate Soul Echoes first.' && back.anchorIds.length === 9 && back.collectedAnchorIds[0] === ECHO, detail: { r, back } };
  });
  await check('locate.20.all-collected-disables-the-button-with-its-reason-and-restoring-one-enables-it', async () => {
    for (const id of NINE) await dispatch({ type: 'setSoulEchoCollected', anchorId: id, collected: true });
    await sleep(250);
    const b = locateBtn();
    const r = { aria: await b.getAttribute('aria-disabled'), title: await b.getAttribute('title'), reason: await page.locator('[data-j2-locate-reason]').innerText() };
    await b.click({ force: true }); await sleep(200);
    const none = await loc();
    await dispatch({ type: 'setSoulEchoCollected', anchorId: NINE[0], collected: false }); await sleep(250);
    const enabled = await b.getAttribute('aria-disabled');
    // collected while selecting: the tool ends when nothing is left
    await startLocate();
    await dispatch({ type: 'setSoulEchoCollected', anchorId: NINE[0], collected: true }); await sleep(250);
    const ended = { locate: await loc(), live: await page.locator('[data-j2-live]').innerText() };
    for (const id of NINE.slice(0, 4)) await dispatch({ type: 'setSoulEchoCollected', anchorId: id, collected: false });
    return { ok: r.aria === 'true' && r.title === 'All Soul Echoes have been collected.' && r.reason === 'All Soul Echoes have been collected.' && none === null && enabled === 'false' && ended.locate === null && /No uncollected Soul Echoes remain/.test(ended.live), detail: { r, none, enabled, ended } };
  });

  /* ---- isolation ---- */
  await check('locate.21.player-preview-has-no-locate-control-origin-compass-or-echo-state', async () => {
    await startLocate();
    await page.click('[data-j2-preview]'); await sleep(350);
    const r = { locate: await loc(), group: await page.locator('[data-j2-echo-group]').isVisible(), btn: await locateBtn().isVisible(), popover: await popover().isVisible(), chip: await page.locator('[data-j2-locate-chip]').isVisible(), layer: await page.locator('[data-j2-g="locate"] path').count(), echoes: await page.locator('[data-j2-g="echoes"] .j2-echo').count(), collectedDom: await page.evaluate(() => /collect|compass|locate/i.test(document.querySelector('[data-j2-preview-bar]').innerHTML + document.querySelector('[data-j2-g="echoes"]').innerHTML + document.querySelector('[data-j2-g="locate"]').innerHTML)) };
    const proj = await page.evaluate(() => JSON.stringify(Journey2View.debugApi().projection()));
    r.projection = /echo|collected|locate|bearing|compass|mk-/i.test(proj);
    // Print Preview carries no Locate or Echo data either
    await page.click('[data-j2-print-open]'); await sleep(900);
    const html = await page.evaluate(() => (document.querySelector('.j2-printpreview') || { innerHTML: '' }).innerHTML);
    r.print = /echo|collected|locate|bearing|compass|data-echo/i.test(html);
    r.printOpen = html.length > 200;
    await page.keyboard.press('Escape'); await sleep(250);
    await page.click('[data-j2-preview-back]'); await sleep(300);
    return { ok: r.locate === null && !r.group && !r.btn && !r.popover && !r.chip && r.layer === 0 && r.echoes === 0 && !r.collectedDom && !r.projection && r.printOpen && !r.print, detail: r };
  });
  await check('locate.22.json-backup-preserves-the-collected-state-through-export-and-import', async () => {
    const backup = await docNow();
    const want = backup.soulEchoes;
    const file = path.join(require('os').tmpdir(), 'j2-locate-backup.json');
    fs.writeFileSync(file, JSON.stringify(backup));
    await dispatch({ type: 'setSoulEchoCollected', anchorId: NINE[5], collected: true }); await sleep(200);
    await startLocate();
    await page.setInputFiles('input[type="file"]', file); await sleep(250);
    await page.locator('.j2-dialog .btn-danger').click(); await sleep(400);
    const now = await docNow();
    const r = { same: JSON.stringify(now.soulEchoes) === JSON.stringify(want), locate: await loc(), popover: await popover().isVisible(), collected: want.collectedAnchorIds };
    try { fs.unlinkSync(file); } catch (e) { /* temp file */ }
    return { ok: r.same && r.locate === null && !r.popover, detail: r };
  });
  await check('locate.23.english-and-russian-direction-names-and-text-follow-the-language', async () => {
    const c = ORIGIN;
    await startLocate(); await pickAndSettle(c);
    const l = await loc(), exp = await expected(c);
    const en = await outText();
    await page.click('[data-lang="ru"]'); await sleep(350);
    const ru = { out: await outText(), text: await popText(), title: await page.locator('#j2-locate-title').innerText(), letters: await page.locator('.j2-cmp-letter').evaluateAll(els => els.map(e => e.textContent)), btn: await locateBtn().innerText() };
    await shot(page, 'locate-03-ru.png');
    await page.click('[data-lang="en"]'); await sleep(350);
    const back = await outText();
    await page.keyboard.press('Escape'); await sleep(150);
    const idx = exp.direction.index, ruLabel = dirLabel(idx, 'ru');
    return { ok: l.status === 'result' && l.directionIndex === idx && en.includes(dirLabel(idx, 'en')) && ru.out.includes(ruLabel) && ru.out.startsWith('Компас указывает на ' + ruLabel.toLocaleLowerCase('ru') + '.') && /Напоминание GM/.test(ru.text) && ru.title === 'Поиск Эха Души' && ru.letters.join('') === 'СВЮЗ' && ru.btn === 'Найти Эхо Души' && back === en, detail: { en, ru, back } };
  });
  await check('locate.24.leaving-the-route-removes-the-popover-and-cancels-the-pending-completion', async () => {
    await startLocate(); await clickCell(ORIGIN); await sleep(150);
    const mid = (await loc()).status;
    await page.evaluate(() => { location.hash = '#/prep'; }); await sleep(1800);
    const r = await page.evaluate(() => ({ mounted: Journey2View.isMounted(), dom: document.querySelectorAll('.j2-locate').length, state: Journey2View.debugState() }));
    await page.goto(base + '#/journey'); await page.waitForSelector('.j2-viewport'); await sleep(500);
    const fresh = await loc();
    return { ok: mid === 'animating' && !r.mounted && r.dom === 0 && r.state === null && fresh === null && !logs.some(l => /locate.*pageerror/i.test(l)), detail: { mid, r, fresh } };
  });
  await page.close(); await context.close();

  /* ---- reduced motion ---- */
  const rm = await newPage({ reducedMotion: 'reduce' }, 'locate-rm');
  const rmPage = rm.page;
  await check('locate.25.reduced-motion-reaches-the-same-result-without-the-long-spin', async () => {
    const dispatchRm = cmd => rmPage.evaluate(c => Journey2View.debugApi().dispatch(c), cmd);
    await dispatchRm({ type: 'setSoulEchoes', anchorIds: NINE }); await sleep(250);
    await rmPage.evaluate(() => document.querySelector('[data-j2-fit]').click()); await sleep(300);
    const d = await rmPage.evaluate(() => Journey2View.debugApi().document());
    const exp = Locate.locateSoulEcho({ doc: d, ctx: ctx0, originCellId: ORIGIN, random: () => 0 });
    await rmPage.locator('[data-j2-echo-locate]').click(); await sleep(200);
    const p = await rmPage.evaluate(c => Journey2View.debugApi().cellToClient(c), ORIGIN);
    const t0 = Date.now();
    await rmPage.mouse.click(p.x, p.y);
    await rmPage.waitForFunction(() => Journey2View.debugState().locate && Journey2View.debugState().locate.status === 'result', null, { timeout: 3000 });
    const took = Date.now() - t0;
    const final = Number(await rmPage.locator('[data-j2-l="needle"]').getAttribute('data-final-angle'));
    const line = await rmPage.locator('[data-j2-l="line"]').innerText();
    const dur = await rmPage.locator('[data-j2-l="needle"]').evaluate(e => e.style.transition);
    return { ok: exp.ok && Math.abs(final - exp.bearing) < 0.02 && final < 360 && took < 1000 && line.includes(dirLabel(exp.direction.index, 'en').toLowerCase()) && /200ms/.test(dur), detail: { final, bearing: exp.bearing, took, line, dur } };
  });
  await rmPage.close(); await rm.context.close();
}

module.exports = { runLocateChecks };

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
    const record = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + id + (!ok ? '  ' + JSON.stringify(detail).slice(0, 1500) : '')); };
    const check = async (id, fn) => { try { const r = await fn(); if (r === true || r === undefined) record(id, true); else if (r && typeof r === 'object' && 'ok' in r) record(id, r.ok, r.detail); else record(id, !!r, r); } catch (e) { record(id, false, 'exception: ' + String(e.message).split('\n')[0]); } };
    const outDir = process.env.J2_SHOT_DIR || path.join(require('os').tmpdir(), 'j2-locate');
    fs.mkdirSync(outDir, { recursive: true });
    const shot = (page, name) => page.screenshot({ path: path.join(outDir, name) });
    const attachLogging = (page, sink, label) => { page.on('console', m => { if (m.type() === 'error') sink.push(`[${label}] console.error: ${m.text()}`); }); page.on('pageerror', e => sink.push(`[${label}] pageerror: ${e.message}`)); page.on('requestfailed', r => sink.push(`[${label}] requestfailed: ${r.url()}`)); };
    await runLocateChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc });
    const bad = logs.filter(l => !/favicon|fonts\.g|ERR_INTERNET|net::ERR/.test(l));
    record('locate.hygiene.no-console-errors', bad.length === 0, bad.slice(0, 8));
    await browser.close(); await server.close();
    process.exit(results.every(r => r.ok) ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(2); });
}
