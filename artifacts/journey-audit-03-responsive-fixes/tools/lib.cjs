/* Audit-only helper library (interaction audit 02). Serves the repo root read-only, drives installed Chrome via Playwright. */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
const { serve } = require(path.join(ROOT, 'scripts', 'journey2', 'lib', 'static-server.js'));
const STATE = fs.readFileSync(path.join(OUT, 'state', 'exported-state.json'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(W, H, opts = {}) {
  const srv = await serve(ROOT, {});
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__audit')) { sessionStorage.setItem('__audit', '1'); localStorage.setItem('dhcodex_lang', '"en"'); } } catch (e) {} });
  const p = await ctx.newPage();
  const consoleLines = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleLines.push(`console.${m.type()}: ${m.text().slice(0, 400)}`); });
  p.on('pageerror', e => consoleLines.push(`pageerror: ${String(e.message).slice(0, 400)}\n${String(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
  p.on('requestfailed', r => consoleLines.push(`requestfailed: ${r.url()} ${(r.failure() || {}).errorText}`));
  p.on('response', r => { if (r.status() >= 400) consoleLines.push(`HTTP ${r.status()}: ${r.url()}`); });
  await p.goto(srv.base + '#/journey'); await p.waitForSelector('.j2-viewport');
  const A = (fn, arg) => p.evaluate(`(${fn.toString()})(${JSON.stringify(arg === undefined ? null : arg)})`);
  const api = {
    p, A, W, H, srv, browser, consoleLines, sleep, STATE,
    st: () => A(() => Journey2View.debugState()),
    async fresh(stateText) {
      await p.evaluate(s => { localStorage.setItem('dhcodex_journey2_map', s); localStorage.removeItem('dhcodex_journey2_ui'); }, stateText || STATE);
      await p.goto(srv.base + '#/journey'); await p.reload(); await p.waitForSelector('.j2-viewport');
      await p.waitForFunction(() => { const s = Journey2View.debugState(); return s && s.anchors > 0 && s.batches.length > 0; });
      await sleep(700); await p.mouse.move(W - 5, H - 5);
    },
    async cam(cell, scale, dx = 0, dy = 0) {
      await A(({ cell, scale, dx, dy }) => {
        const a = Journey2View.debugApi(), vp = document.querySelector('.j2-viewport').getBoundingClientRect();
        a.setCamera({ scale: 1, tx: 0, ty: 0 }); const w = a.cellToClient(cell); const wx = w.x - vp.left, wy = w.y - vp.top;
        const side = document.querySelector('.j2-side'); const free = side && side.offsetParent ? side.getBoundingClientRect().right - vp.left : 0;
        a.setCamera({ scale, tx: (vp.width + free) / 2 + dx - wx * scale, ty: vp.height / 2 + dy - wy * scale });
      }, { cell, scale, dx, dy });
      await sleep(400);
    },
    cellXY: cell => A(c => Journey2View.debugApi().cellToClient(c), cell),
    /** true when something other than the map (inspector, drawer, toolbar, overlay) sits on top of the cell centre */
    cellCovered: cell => A(c => { const a = Journey2View.debugApi(), w = a.cellToClient(c); const e = document.elementFromPoint(w.x, w.y); return !e || !e.closest('.j2-viewport, .j2-world') ; }, cell),
    /** a user pans when the hex they want is hidden behind the inspector/drawer: do the same (counted in reachLog) */
    async reach(cell) {
      if (!(await api.cellCovered(cell))) return false;
      await A(c => { const a = Journey2View.debugApi(), vp = document.querySelector('.j2-viewport').getBoundingClientRect(), w = a.cellToClient(c), cm = Journey2View.debugState().camera;
        const side = document.querySelector('.j2-side'); const free = side && side.offsetParent ? side.getBoundingClientRect().right : vp.left;
        a.setCamera({ scale: cm.scale, tx: cm.tx + (free + 160 - w.x), ty: cm.ty + (vp.top + vp.height * 0.45 - w.y) }); }, cell);
      await sleep(450); api.reachLog.push(cell); return true;
    },
    /** a point on the map that is plain printed map: not covered by any panel, no placed hex, no sanctuary icon nearby */
    emptyPoint: (prefer = 'br') => A(prefer => { const a = Journey2View.debugApi(), d = a.document(), occ = new Set(d.tiles.map(t => t.cell)), mk = a.markers(); const vp = document.querySelector('.j2-viewport').getBoundingClientRect(); const pts = [];
      for (let x = vp.right - 40; x > vp.left + 40; x -= 37) for (let y = vp.bottom - 40; y > vp.top + 40; y -= 37) pts.push([x, y]);
      if (prefer === 'tl') pts.reverse();
      for (const [x, y] of pts) { const e = document.elementFromPoint(x, y); if (!e || !e.closest('.j2-viewport')) continue; if (e.closest('[data-j2-inspector],[data-j2-sanctuary],[data-j2-locate]')) continue; const id = a.clientToCell(x, y); if (occ.has(id)) continue; if (mk.some(m => { const w = a.worldToClient(m.rect[0] + m.rect[2] / 2, m.rect[1] + m.rect[3] / 2); return Math.hypot(w.x - x, w.y - y) < 70; })) continue; return { x, y }; } return null; }, prefer),
    reachLog: [], coveredLog: [],
    async clickCell(cell, wait = 450, o = {}) { if (o.pan) await api.reach(cell); else if (await api.cellCovered(cell)) { api.coveredLog.push(cell); if (o.closeIfCovered !== false) { await p.keyboard.press('Escape'); await sleep(250); } } const c = await api.cellXY(cell); await p.mouse.click(c.x, c.y); await sleep(wait); return c; },
    sancXY: id => A(id => { const a = Journey2View.debugApi(), m = a.markers().find(x => x.id === id), r = m.rect; return a.worldToClient(r[0] + r[2] / 2, r[1] + r[3] / 2); }, id),
    async focusSanc(id, scale = 1.0, dx = -140, dy = 40) {
      await A(({ id, scale, dx, dy }) => { const a = Journey2View.debugApi(), m = a.markers().find(x => x.id === id), r = m.rect, vp = document.querySelector('.j2-viewport').getBoundingClientRect();
        const side = document.querySelector('.j2-side'); const free = side && side.offsetParent ? side.getBoundingClientRect().right - vp.left : 0;
        const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2; a.setCamera({ scale, tx: (vp.width + free) / 2 + dx - cx * scale, ty: vp.height / 2 + dy - cy * scale }); }, { id, scale, dx, dy });
      await sleep(400);
    },
    async clickSanc(id, scale, dx, dy) { await api.focusSanc(id, scale, dx, dy); const c = await api.sancXY(id); await p.mouse.click(c.x, c.y); await sleep(550); return c; },
    snap: async (name) => { const f = `${name}-${W}x${H}.png`; await p.screenshot({ path: path.join(OUT, 'screenshots', f) }); return 'screenshots/' + f; },
    /** compact observable UI state */
    async ui() {
      return p.evaluate(() => {
        const vis = s => { const e = document.querySelector(s); return !!e && !e.hidden && (e.offsetParent !== null || getComputedStyle(e).position === 'fixed'); };
        const s = Journey2View.debugState();
        const insp = document.querySelector('[data-j2-inspector]');
        const hexEnv = insp && !insp.hidden ? (document.querySelector('[data-j2-i="hexEnvBody"]') || {}).textContent : null;
        return {
          cam: { s: +s.camera.scale.toFixed(4), x: Math.round(s.camera.tx), y: Math.round(s.camera.ty) }, fitMode: s.fitMode,
          selTile: s.selectedTile, inspector: s.inspector, sanctuaryOpen: s.sanctuaryOpen, active: s.activeBatchId, side: s.sideCollapsed,
          inspName: vis('[data-j2-inspector]') ? document.querySelector('[data-j2-i="name"]').textContent : null,
          inspOrd: vis('[data-j2-inspector]') ? document.querySelector('[data-j2-i="ord"]').textContent : null,
          hexEnv: hexEnv && hexEnv.replace(/\s+/g, ' ').trim(),
          sancName: vis('[data-j2-sanctuary]') ? document.querySelector('[data-j2-s="name"]').textContent : null,
          dialogs: document.querySelectorAll('dialog[open]').length, modals: document.querySelectorAll('.modal-overlay').length,
          locate: s.locate, hist: s.history, tool: s.fog.tool, preview: s.fog.previewMode, tiles: s.tiles.length,
          cards: document.querySelectorAll('.j2-card').length, compasses: document.querySelectorAll('.j2-compass').length,
          activeCardIds: Array.from(document.querySelectorAll('.j2-card.is-active, .j2-card[aria-current="true"], .j2-card.is-open')).map(e => e.getAttribute('data-batch')),
        };
      });
    },
    async close() { await api.browser.close(); await srv.close && srv.close(); },
  };
  return api;
}
module.exports = { open, sleep, ROOT, OUT, STATE };
/* shared in-page helpers (evaluated in the page) */
module.exports.helpers = {
  /** placed cell set, free allowed neighbours of the placed set, a far allowed cell */
  geo: `(() => { const G = Journey2Geometry, a = Journey2View.debugApi(), d = a.document();
    const occ = new Set(d.tiles.map(t => t.cell)); const free = new Set(); const dec = new Set(a.decorativeCells());
    for (const t of d.tiles) { const c = G.parseCellId(t.cell); for (const dd of [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]) { const id = (c.q+dd[0])+','+(c.r+dd[1]); if (!occ.has(id) && !dec.has(id) && a.allowedCell(id).ok) free.add(id); } }
    return { occ: Array.from(occ), free: Array.from(free) }; })()`,
};
