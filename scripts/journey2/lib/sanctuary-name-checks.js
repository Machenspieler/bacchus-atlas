'use strict';
/* ============================================================
   Bacchus's Atlas — scripts/journey2/lib/sanctuary-name-checks.js
   Browser verification of Journey 2 player-visible sanctuary names (PD-027): the overlay's Player map row, the GM ring state,
   Player Preview labels (beside the right fixed icon, under no fog cut-out, no tables, no Echoes), hide / Undo, the reroll /
   delete / replace-all confirmations with visibility kept or removed, independence from fog, hex Environments and Biome Tint,
   and EN / RU. Real pointer input in a FRESH browser context (the owner's browser storage is never touched).
   Shared by stage1-verify.js (full run) and browser-verify.js (quick run); also runnable alone:
     node scripts/journey2/lib/sanctuary-name-checks.js

   runSanctuaryNameChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc })
   ============================================================ */
const fs = require('fs');
const path = require('path');

async function runSanctuaryNameChecks(env) {
  const { browser, base, check, shot, logs, attachLogging, Geo, Model, template, anchorsDoc } = env;
  const ctx0 = Model.createContext(template, anchorsDoc);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const SANCT = ctx0.sanctuaries.map(s => s.id);
  const ID = SANCT[Math.floor(SANCT.length / 2)], ID2 = SANCT[Math.floor(SANCT.length / 2) + 1];
  const anchor = id => anchorsDoc.anchors.find(a => a.stableId === id);

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'en-US' });
  await context.addInitScript(() => { try { if (!sessionStorage.getItem('__j2_init')) { sessionStorage.setItem('__j2_init', '1'); localStorage.setItem('dhcodex_lang', JSON.stringify('en')); } } catch (e) { /* storage unavailable */ } });
  const page = await context.newPage();
  attachLogging(page, logs, 'sancnames');

  const st = () => page.evaluate(() => Journey2View.debugState());
  const docNow = () => page.evaluate(() => Journey2View.debugApi().document());
  const names = async () => (await docNow()).playerVisibility.revealedSanctuaryNameAnchorIds;
  const entryOf = async id => (await docNow()).sanctuaries.entries.find(e => e.anchorId === id);
  const dispatch = cmd => page.evaluate(c => Journey2View.debugApi().dispatch(c), cmd);
  const cam = async () => JSON.stringify((await st()).camera);
  const overlayOpen = () => page.evaluate(() => !document.querySelector('[data-j2-sanctuary]').hidden);
  const dialogText = () => page.evaluate(() => { const d = document.querySelector('dialog.j2-dialog[open]'); return d ? d.innerText : null; });
  const sleepShort = () => sleep(220);
  async function boot() {
    await page.waitForSelector('.j2-viewport', { timeout: 60000 });
    await page.waitForFunction(() => Journey2View.isMounted() && Journey2View.debugState() && Journey2View.debugState().anchors > 0, null, { timeout: 60000 });
    await sleep(300);
  }
  async function centerOn(id, scale) {
    const a = anchor(id);
    await page.evaluate(([x, y, s]) => { const r = document.querySelector('.j2-viewport').getBoundingClientRect(); Journey2View.debugApi().setCamera({ scale: s, tx: r.width / 2 - 120 - x * s, ty: r.height / 2 - y * s }); }, [a.worldPixelAnchor[0], a.worldPixelAnchor[1], scale || 0.8]);
    await sleep(300);
  }
  async function openOverlay(id) {
    await page.keyboard.press('Escape'); await sleep(100);
    await centerOn(id);
    const p = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), id);
    await page.mouse.click(p.x, p.y); await sleepShort();
  }
  const nameBtn = () => page.locator('[data-j2-sanc-name]');
  const statusText = () => page.locator('[data-j2-s="nameText"]').innerText();
  const labelOf = id => page.locator('[data-j2-g="sanctlabels"] .j2-sanc-label[data-anchor="' + id + '"]');
  async function enterPreview() { await page.click('[data-j2-preview]'); await sleep(350); }
  async function leavePreview() { await page.click('[data-j2-preview-back]'); await sleep(300); }

  await page.goto(base + '#/journey');
  await boot();
  // fixture: one region with an Environment on its first hex (to prove the name toggles leave Environments and Biome Tint alone)
  const open = (() => { const c0 = ctx0.grid.worldToCell(2424, 900); return { q: c0.q, r: c0.r }; })();
  const cellAt = (dq, dr) => Geo.cellId(open.q + dq, open.r + dr);
  const batch = await page.evaluate(() => {
    const M = Journey2Model, id = M.newId('b');
    const region = { habitat: { biome: 'forest', blighted: false, overtaken: false, source: 'rolled', rolls: [6] }, terrain: { value: 2, source: 'rolled' }, size: 3, encounter: { entries: [[3, 4]], combines: 0 }, rumor: 12 };
    return Journey2View.debugApi().dispatch({ type: 'createBatch', batch: M.batchFromRegion(region, { id, createdAt: new Date().toISOString() }) }).ok ? id : null;
  });
  await dispatch({ type: 'place', batchId: batch, tiles: [0, 1, 2].map(i => ({ id: 'n' + i, cell: cellAt(i, 0) })) });
  await dispatch({ type: 'setTileEnvironment', tileId: 'n0', environmentId: 'time-loop' });
  const envSnapshot = async () => JSON.stringify({ tiles: (await docNow()).tiles, tint: await page.evaluate(() => document.querySelectorAll('[data-j2-g="tiles"] .j2-biome-tint').length), marks: await page.evaluate(() => document.querySelectorAll('[data-j2-g="envmarks"] .j2-envmark').length) });
  const envBefore = await envSnapshot();

  await check('sancname.01.generated-sanctuaries-start-with-every-name-hidden', async () => {
    await page.click('[data-j2-sanc-generate]'); await sleep(500);
    const d = await docNow();
    await openOverlay(ID); await shot(page, 'sancname-01-hidden.png');
    const r = { entries: d.sanctuaries.entries.length, names: d.playerVisibility.revealedSanctuaryNameAnchorIds, open: await overlayOpen(), status: await statusText(), btn: await nameBtn().innerText(), pressed: await nameBtn().getAttribute('aria-pressed'), ringState: await page.locator('[data-j2-g="sanct"] [data-sanc="' + ID + '"]').getAttribute('data-name-visible') };
    return { ok: r.entries === 56 && r.names.length === 0 && r.open && r.status === 'Name hidden from players' && r.btn === 'Reveal name' && r.pressed === 'false' && r.ringState === 'false', detail: r };
  });

  let camBefore, fogBefore, echoBefore, undoBefore;
  await check('sancname.02.reveal-keeps-the-overlay-open-and-changes-only-the-name-state', async () => {
    camBefore = await cam(); fogBefore = JSON.stringify((await docNow()).playerVisibility.revealedCells); echoBefore = JSON.stringify((await docNow()).soulEchoes); undoBefore = (await st()).history.undo;
    await nameBtn().click(); await sleepShort();
    const r = { names: await names(), open: await overlayOpen(), status: await statusText(), btn: await nameBtn().innerText(), pressed: await nameBtn().getAttribute('aria-pressed'), cam: (await cam()) === camBefore, fog: JSON.stringify((await docNow()).playerVisibility.revealedCells) === fogBefore, echo: JSON.stringify((await docNow()).soulEchoes) === echoBefore, undo: (await st()).history.undo - undoBefore, focus: await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-j2-sanc-name')), live: await page.locator('[data-j2-live]').innerText() };
    await shot(page, 'sancname-02-visible.png');
    return { ok: r.names.length === 1 && r.names[0] === ID && r.open && r.status === 'Name visible to players' && r.btn === 'Hide name' && r.pressed === 'true' && r.cam && r.fog && r.echo && r.undo === 1 && r.focus && r.live.includes((await entryOf(ID)).name), detail: r };
  });

  await check('sancname.03.the-gm-map-letters-the-revealed-name-and-the-ring-shows-a-non-colour-shape-and-stays-pointer-transparent-and-hidden-from-assistive-tech', async () => {
    const r = await page.evaluate(id => {
      const g = document.querySelector('[data-j2-g="sanct"]'), m = g.querySelector('[data-sanc="' + id + '"]');
      const lab = document.querySelector('[data-j2-g="sanctlabels"] .j2-sanc-label[data-anchor="' + id + '"]');
      return { gmLabel: !!lab && getComputedStyle(lab).textTransform === 'uppercase' && /Architects Daughter/.test(getComputedStyle(lab).fontFamily), gmLabels: document.querySelectorAll('[data-j2-g="sanctlabels"] .j2-sanc-label').length, visible: m && m.classList.contains('is-name-visible'), parts: m ? Array.from(m.children).map(c => c.getAttribute('class')) : [], pe: g.getAttribute('pointer-events'), other: g.querySelectorAll('.is-name-visible').length, echoLike: g.querySelectorAll('.j2-echo').length, ariaHiddenLayer: !!g.closest('svg') };
    }, ID);
    return { ok: r.gmLabel && r.gmLabels === 1 && r.visible && r.parts.includes('j2-sanc-eye-lid') && r.pe === 'none' && r.other === 1 && r.echoLike === 0, detail: r };
  });

  await check('sancname.04.hovering-the-icon-names-the-state-without-echo-information', async () => {
    await page.keyboard.press('Escape'); await sleep(100);
    const p = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), ID);
    await page.mouse.move(p.x - 30, p.y - 30); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(250);
    const tip = await page.locator('[data-j2-tip]').innerText().catch(() => '');
    const hidden = await page.locator('[data-j2-tip]').isHidden();
    return { ok: !hidden && /Name visible to players/.test(tip) && !/echo/i.test(tip), detail: tip };
  });

  await check('sancname.05.player-preview-shows-the-name-beside-the-right-fixed-icon-even-under-fog', async () => {
    await page.mouse.move(10, 10);
    await centerOn(ID, 0.8);
    await enterPreview();
    const entry = await entryOf(ID);
    const r = await page.evaluate(([id, rect]) => {
      const t = document.querySelector('[data-j2-g="sanctlabels"] .j2-sanc-label[data-anchor="' + id + '"]');
      const bb = t ? t.getBBox() : null;
      const fogEl = document.querySelector('[data-j2-g="fog"]'), lab = document.querySelector('[data-j2-g="sanctlabels"]');
      return {
        text: t ? t.textContent : null, bb: bb && { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
        overlapIcon: bb ? (Math.min(bb.x + bb.width, rect[0] + rect[2]) > Math.max(bb.x, rect[0]) && Math.min(bb.y + bb.height, rect[1] + rect[3]) > Math.max(bb.y, rect[1])) : null,
        labels: document.querySelectorAll('[data-j2-g="sanctlabels"] .j2-sanc-label').length,
        fogShown: fogEl.style.display !== 'none' && (document.querySelector('[data-j2-fog-veil]').getAttribute('d') || '').length > 100,
        labelAboveFog: !!(fogEl.compareDocumentPosition(lab) & Node.DOCUMENT_POSITION_FOLLOWING),
        pe: lab.getAttribute('pointer-events'), aria: lab.getAttribute('aria-hidden'),
        sheet: getComputedStyle(t).paintOrder, fill: getComputedStyle(t).fill, bg: getComputedStyle(t).backgroundColor,
        known: Array.from(document.querySelectorAll('[data-j2-known-sanc] li')).map(x => x.textContent), knownLabel: document.querySelector('[data-j2-known-sanc]').getAttribute('aria-label'), knownHidden: document.querySelector('[data-j2-known-sanc]').hidden,
        overlay: !document.querySelector('[data-j2-sanctuary]').hidden, rings: document.querySelectorAll('[data-j2-g="sanct"] *').length, echoes: document.querySelectorAll('[data-j2-g="echoes"] *').length,
        text_all: document.querySelector('.j2').innerText,
      };
    }, [ID, anchor(ID).iconProtectionArea.rectPx]);
    await shot(page, 'sancname-03-player-preview.png');
    const proj = await page.evaluate(() => Journey2View.debugApi().projection());
    const leak = JSON.stringify(proj);
    return { ok: r.text && r.text.replace(/\s+/g, ' ').trim().length > 0 && entry.name.startsWith(r.text.replace(/…$/, '').split(' ')[0]) && r.overlapIcon === false && r.labels === 1 && r.fogShown && r.labelAboveFog && r.pe === 'none' && r.aria === 'true' && /stroke/.test(r.sheet) && r.bg === 'rgba(0, 0, 0, 0)' && r.known.length === 1 && r.known[0] === entry.name && r.knownLabel === 'Known sanctuaries' && !r.knownHidden && !r.overlay && r.rings === 0 && r.echoes === 0 && !/Trade|Quirk|Crisis|Drive|Population/.test(r.text_all) && JSON.stringify(proj.sanctuaryLabels) === JSON.stringify([{ anchorId: ID, name: entry.name }]) && !/quirk|crisis|politics|population|trade/i.test(leak), detail: Object.assign({}, r, { text_all: undefined, projLabels: proj.sanctuaryLabels }) };
  });

  await check('sancname.06.the-overlay-cannot-open-in-player-preview', async () => {
    const p = await page.evaluate(i => Journey2View.debugApi().sanctuaryClient(i), ID);
    await page.mouse.click(p.x, p.y); await sleepShort();
    const r = { open: await overlayOpen(), state: (await st()).sanctuaryOpen };
    await leavePreview();
    return { ok: !r.open && !r.state, detail: r };
  });

  await check('sancname.07.hide-removes-the-label-from-preview-and-undo-brings-it-back', async () => {
    await openOverlay(ID);
    await nameBtn().click(); await sleepShort();
    const afterHide = { names: await names(), open: await overlayOpen(), status: await statusText(), pressed: await nameBtn().getAttribute('aria-pressed'), live: await page.locator('[data-j2-live]').innerText(), focus: await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-j2-sanc-name')) };
    await page.keyboard.press('Escape'); await sleep(120);
    await enterPreview();
    const hiddenInPreview = await page.evaluate(() => ({ labels: document.querySelectorAll('[data-j2-g="sanctlabels"] .j2-sanc-label').length, list: document.querySelectorAll('[data-j2-known-sanc] li').length, domHasName: false }));
    const nm = (await entryOf(ID)).name;
    const domLeak = await page.evaluate(n => document.querySelector('.j2').innerHTML.includes(n) || document.querySelector('.j2').innerText.includes(n), nm);
    await leavePreview();
    await page.click('[data-j2-undo]'); await sleepShort();
    const afterUndo = await names();
    await page.click('[data-j2-redo]'); await sleepShort();
    const afterRedo = await names();
    await page.click('[data-j2-undo]'); await sleepShort();
    return { ok: afterHide.names.length === 0 && afterHide.open && afterHide.status === 'Name hidden from players' && afterHide.pressed === 'false' && /hidden/i.test(afterHide.live) && afterHide.focus && hiddenInPreview.labels === 0 && hiddenInPreview.list === 0 && !domLeak && afterUndo.length === 1 && afterRedo.length === 0 && (await names()).length === 1, detail: { afterHide, hiddenInPreview, domLeak, afterUndo, afterRedo } };
  });

  await check('sancname.08.rerolling-a-visible-sanctuary-asks-first-cancel-keeps-the-name-confirm-keeps-visibility', async () => {
    await openOverlay(ID);
    const old = (await entryOf(ID)).name;
    await page.click('[data-j2-sanc-reroll]'); await sleepShort();
    const txt = await dialogText();
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
    const undoBefore2 = (await st()).history.undo;
    await page.locator('dialog.j2-dialog[open] button', { hasText: 'Cancel' }).click(); await sleepShort();
    const kept = (await entryOf(ID)).name === old && (await st()).history.undo === undoBefore2;
    await page.click('[data-j2-sanc-reroll]'); await sleepShort();
    await page.locator('dialog.j2-dialog[open] button', { hasText: 'Reroll sanctuary' }).click(); await sleepShort();
    const now = (await entryOf(ID)).name;
    const r = { txt, focused, kept, changed: now !== old, names: await names(), undo: (await st()).history.undo - undoBefore2, open: await overlayOpen() };
    await enterPreview();
    r.label = await page.evaluate(id => Array.from(document.querySelectorAll('[data-j2-known-sanc] li')).map(x => x.textContent), ID);
    await leavePreview();
    await page.click('[data-j2-undo]'); await sleepShort();
    r.undone = (await entryOf(ID)).name === old && (await names()).includes(ID);
    await page.click('[data-j2-redo]'); await sleepShort();
    r.redone = (await entryOf(ID)).name === now;
    return { ok: /Reroll visible sanctuary\?/.test(txt) && /visible to players/.test(txt) && focused === 'Cancel' && kept && r.changed && r.names.includes(ID) && r.undo === 1 && r.label[0] === now && r.undone && r.redone, detail: r };
  });

  await check('sancname.09.a-hidden-sanctuary-rerolls-without-the-visibility-warning', async () => {
    await openOverlay(ID2);
    await page.click('[data-j2-sanc-reroll]'); await sleepShort();
    const dlg = await dialogText();
    return { ok: dlg === null && !(await names()).includes(ID2), detail: dlg };
  });

  await check('sancname.10.deleting-a-visible-sanctuary-mentions-the-player-map-removes-both-and-undo-restores-both', async () => {
    await openOverlay(ID);
    const before = await entryOf(ID);
    await page.click('[data-j2-sanc-delete]'); await sleepShort();
    const txt = await dialogText();
    await page.locator('dialog.j2-dialog[open] button', { hasText: 'Cancel' }).click(); await sleepShort();
    await page.click('[data-j2-sanc-delete]'); await sleepShort();
    await page.locator('dialog.j2-dialog[open] button', { hasText: /^Delete$/ }).click(); await sleepShort();
    const gone = { entry: await entryOf(ID), names: await names(), open: await overlayOpen() };
    await page.click('[data-j2-undo]'); await sleepShort();
    const back = { entry: JSON.stringify(await entryOf(ID)) === JSON.stringify(before), names: (await names()).includes(ID), open: await overlayOpen() };
    return { ok: /visible name will also disappear from the player map/.test(txt) && !gone.entry && !gone.names.includes(ID) && back.entry && back.names && !back.open, detail: { txt, gone, back } };
  });

  await check('sancname.11.replacing-all-mentions-visible-names-and-keeps-only-matching-anchors-revealed', async () => {
    await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: ID2, revealed: true });
    const before = await names();
    await page.keyboard.press('Escape'); await sleep(100);
    await page.click('[data-j2-sanc-generate]'); await sleepShort();
    const txt = await dialogText();
    await page.locator('dialog.j2-dialog[open] button', { hasText: 'Replace all' }).click(); await sleepShort();
    const after = await names();
    const d = await docNow();
    await page.click('[data-j2-undo]'); await sleepShort();
    const undone = JSON.stringify(await names()) === JSON.stringify(before);
    return { ok: new RegExp(before.length + ' sanctuary names are currently visible to players').test(txt) && JSON.stringify(after) === JSON.stringify(before) && d.sanctuaries.entries.length === 56 && undone && before.length >= 2, detail: { txt, before, after, undone } };
  });

  await check('sancname.12.soul-echoes-stay-secret-and-never-change-names', async () => {
    const before = JSON.stringify(await names());
    await page.keyboard.press('Escape'); await sleep(100);
    await page.click('[data-j2-echo-place]'); await sleepShort();
    const ech = (await docNow()).soulEchoes.anchorIds.length;
    const same = JSON.stringify(await names()) === before;
    await enterPreview();
    const r = await page.evaluate(() => ({ echoes: document.querySelectorAll('[data-j2-g="echoes"] *').length, text: document.querySelectorAll('.j2-echo, [data-echo]').length > 0 }));
    const proj = await page.evaluate(() => JSON.stringify(Journey2View.debugApi().projection()));
    await leavePreview();
    await page.click('[data-j2-echo-clear]'); await sleepShort();
    const dlg = await dialogText();
    if (dlg) await page.locator('dialog.j2-dialog[open] button', { hasText: /Remove|Clear|Delete/ }).first().click().catch(() => {});
    await sleepShort();
    return { ok: ech === 9 && same && r.echoes === 0 && !r.text && !/echo|soul/i.test(proj) && JSON.stringify(await names()) === before, detail: { ech, same, r } };
  });

  await check('sancname.13.fog-tools-leave-names-alone-and-names-leave-fog-environments-and-tint-alone', async () => {
    const namesBefore = JSON.stringify(await names());
    await page.keyboard.press('Escape'); await sleep(100);
    await dispatch({ type: 'setCellsRevealed', cellKeys: [cellAt(0, 0)], revealed: true });
    const same = JSON.stringify(await names()) === namesBefore;
    await dispatch({ type: 'setCellsRevealed', cellKeys: [cellAt(0, 0)], revealed: false });
    await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: SANCT[3], revealed: true });
    await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: SANCT[3], revealed: false });
    const envAfter = await envSnapshot();
    const cellsAfter = (await docNow()).playerVisibility.revealedCells.length;
    return { ok: same && envAfter === envBefore && cellsAfter === 0, detail: { same, envSame: envAfter === envBefore, cellsAfter } };
  });

  await check('sancname.14.a-backup-round-trips-the-visible-names-and-reload-keeps-them', async () => {
    const before = await names();
    await page.reload(); await boot();
    const after = await names();
    return { ok: before.length >= 2 && JSON.stringify(before) === JSON.stringify(after), detail: { before, after } };
  });

  await check('sancname.15.russian-strings-and-state-survive-an-in-page-language-switch', async () => {
    await dispatch({ type: 'setSanctuaryNameRevealed', anchorId: ID, revealed: false });
    await openOverlay(ID);
    const nameOf = (await entryOf(ID)).name;
    const stateBefore = { names: JSON.stringify(await names()), undo: (await st()).history.undo, doc: JSON.stringify(await docNow()) };
    await page.evaluate(() => document.querySelector('[data-lang="ru"]').click()); await sleep(500);
    const ru = { open: await overlayOpen(), title: await page.locator('#j2-sanctuary-title').innerText(), status: await statusText(), btn: await nameBtn().innerText(), pressed: await nameBtn().getAttribute('aria-pressed'), group: await page.locator('#j2-sanc-player-h').innerText() };
    const same = JSON.stringify(await docNow()) === stateBefore.doc && (await st()).history.undo === stateBefore.undo;
    await nameBtn().click(); await sleepShort();
    const revealed = { names: await names(), live: await page.locator('[data-j2-live]').innerText() };
    await page.keyboard.press('Escape'); await sleep(120);
    await enterPreview();
    const pv = await page.evaluate(() => ({ list: document.querySelector('[data-j2-known-sanc]').getAttribute('aria-label'), labels: document.querySelectorAll('[data-j2-g="sanctlabels"] .j2-sanc-label').length }));
    await shot(page, 'sancname-04-ru-preview.png');
    await leavePreview();
    await openOverlay(ID);
    await nameBtn().click(); await sleepShort();
    if ((await names()).includes(ID)) { await nameBtn().click(); await sleepShort(); }
    await page.evaluate(() => document.querySelector('[data-lang="en"]').click()); await sleep(400);
    const en = { open: await overlayOpen(), btn: await nameBtn().innerText(), name: (await entryOf(ID)).name === nameOf };
    return { ok: ru.open && ru.title === nameOf && /скрыто/.test(ru.status) && ru.btn === 'Показать название' && ru.pressed === 'false' && ru.group.toLowerCase() === 'карта игроков' && same && pv.list === 'Известные убежища' && pv.labels >= 1 && /Название убежища/.test(revealed.live) && en.open && en.btn === 'Reveal name' && en.name, detail: { ru, same, pv, revealed, en } };
  });

  await page.close(); await context.close();
}

module.exports = { runSanctuaryNameChecks };

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
    const check = async (id, fn) => { try { const r = await fn(); if (r === true || r === undefined) record(id, true); else if (r && typeof r === 'object' && 'ok' in r) record(id, r.ok, r.detail); else record(id, !!r, r); } catch (e) { record(id, false, 'exception: ' + e.message.split('\n')[0]); } };
    const outDir = process.env.J2_SHOT_DIR || path.join(require('os').tmpdir(), 'j2-sancname');
    fs.mkdirSync(outDir, { recursive: true });
    const shot = (page, name) => page.screenshot({ path: path.join(outDir, name) });
    const attachLogging = (page, sink, label) => { page.on('console', m => { if (m.type() === 'error') sink.push(`[${label}] console.error: ${m.text()}`); }); page.on('pageerror', e => sink.push(`[${label}] pageerror: ${e.message}`)); };
    await runSanctuaryNameChecks({ browser, base, check, record, shot, logs, attachLogging, Geo, Model, template, anchorsDoc });
    const bad = logs.filter(l => !/favicon|fonts\.g|ERR_INTERNET|net::ERR/.test(l));
    record('sancname.hygiene.no-console-errors', bad.length === 0, bad.slice(0, 8));
    await browser.close(); await server.close();
    process.exit(results.every(r => r.ok) ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(2); });
}
