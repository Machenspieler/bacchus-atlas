/* Audit-only helpers for responsive audit 03: extends lib.cjs (Playwright + installed Chrome, repo root served read-only). */
const fs = require('fs'), path = require('path');
const { open, sleep, OUT, STATE } = require('./lib.cjs');

/** in-page: one comprehensive layout snapshot (all numbers are CSS px, rounded) */
const PROBE = `(() => {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  const shown = e => !!e && !e.hidden && e.getClientRects().length > 0;
  const q = s => document.querySelector(s);
  const de = document.documentElement;
  const out = { iw: innerWidth, ih: innerHeight, doc: { sw: de.scrollWidth, cw: de.clientWidth, sh: de.scrollHeight, ch: de.clientHeight, bodySW: document.body.scrollWidth, bodySH: document.body.scrollHeight, scrollY: scrollY, scrollX: scrollX } };
  out.header = r(q('.site-header')); const vp = q('.j2-viewport'); out.vp = r(vp); out.stage = r(q('.j2-stage'));
  const stage = q('.j2-stage'); out.sideState = stage && stage.getAttribute('data-side');
  const side = q('.j2-side'), rail = q('.j2-rail'), ctl = q('.j2-controls'), sc = q('[data-j2-side-scroll]');
  out.side = r(side); out.rail = r(rail); out.controls = r(ctl);
  out.railScroll = rail ? { sh: rail.scrollHeight, ch: rail.clientHeight } : null;
  const vpr = vp ? vp.getBoundingClientRect() : null;
  /* toolbar rows */
  if (ctl) {
    const btns = Array.from(ctl.querySelectorAll('button')).filter(shown);
    const rows = []; btns.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left).forEach(b => {
      const br = b.getBoundingClientRect(); const row = rows.find(x => Math.abs(x.y - br.top) < 6); const lab = (b.getAttribute('aria-label') || b.textContent || b.title || '').replace(/\\s+/g, ' ').trim().slice(0, 28) || b.className.slice(0, 20);
      if (row) row.l.push(lab); else rows.push({ y: Math.round(br.top), h: Math.round(br.height), l: [lab] });
    });
    out.toolbarRows = rows.map(x => x.l.length + ':' + x.l.join(' | '));
    out.toolbarRowCount = rows.length;
    const cr = ctl.getBoundingClientRect(); const bad = []; const hs = new Set();
    btns.forEach(b => { const br = b.getBoundingClientRect(); hs.add(Math.round(br.height)); if (br.right > cr.right + 0.5 || br.left < cr.left - 0.5) bad.push('clip:' + (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 20)); if (b.scrollWidth > b.clientWidth + 1) bad.push('textclip:' + (b.textContent || '').trim().slice(0, 20)); });
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) { const a = btns[i].getBoundingClientRect(), b = btns[j].getBoundingClientRect(); if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) bad.push('overlap:' + (btns[i].textContent || btns[i].getAttribute('aria-label') || '').trim().slice(0, 14) + '/' + (btns[j].textContent || btns[j].getAttribute('aria-label') || '').trim().slice(0, 14)); }
    out.toolbarBad = bad; out.toolbarHeights = Array.from(hs).sort(); out.toolbarH = Math.round(cr.height);
  }
  /* rail buttons (collapsed drawer) */
  if (rail && shown(rail) && getComputedStyle(rail).opacity !== '0') { const rr = rail.getBoundingClientRect(); const bs = Array.from(rail.querySelectorAll('button')).filter(shown); out.railBtns = bs.length; out.railBtnsOutside = bs.filter(b => { const br = b.getBoundingClientRect(); return br.bottom > rr.bottom + 0.5 || br.top < rr.top - 0.5; }).length; }
  /* drawer scroll + cards */
  if (sc) { const scr = sc.getBoundingClientRect(); const cards = Array.from(sc.querySelectorAll('.j2-card')); out.drawer = { sh: sc.scrollHeight, ch: sc.clientHeight, top: Math.round(sc.scrollTop), rect: r(sc), cards: cards.length,
    fullyVisible: cards.filter(c => { const b = c.getBoundingClientRect(); return b.top >= scr.top - 1 && b.bottom <= scr.bottom + 1; }).length,
    partlyVisible: cards.filter(c => { const b = c.getBoundingClientRect(); return b.bottom > scr.top && b.top < scr.bottom; }).length,
    hOverflow: sc.scrollWidth > sc.clientWidth + 1, cardOverflow: cards.filter(c => c.scrollWidth > c.clientWidth + 1).length,
    lastBottomGap: cards.length ? Math.round(scr.bottom - cards[cards.length - 1].getBoundingClientRect().bottom) : null,
    sideBottomVsViewport: side && vpr ? Math.round(vpr.bottom - side.getBoundingClientRect().bottom) : null }; }
  /* floating panels */
  const panel = (sel, closeSel) => { const e = q(sel); if (!shown(e)) return null; const b = e.getBoundingClientRect(); const o = { rect: r(e), sh: e.scrollHeight, ch: e.clientHeight };
    if (vpr) { o.out = { l: Math.round(vpr.left - b.left), t: Math.round(vpr.top - b.top), r: Math.round(b.right - vpr.right), b: Math.round(b.bottom - vpr.bottom) }; o.inVp = o.out.l <= 0 && o.out.t <= 0 && o.out.r <= 0 && o.out.b <= 0; }
    const hb = q('.site-header') ? q('.site-header').getBoundingClientRect() : null; o.overHeader = hb ? b.top < hb.bottom - 0.5 : false;
    const sb = side && out.sideState !== 'collapsed' ? side.getBoundingClientRect() : (rail ? rail.getBoundingClientRect() : null); o.overDrawer = sb ? (b.left < sb.right - 0.5 && b.right > sb.left + 0.5 && b.top < sb.bottom - 0.5 && b.bottom > sb.top + 0.5) : false;
    if (closeSel) { const c = e.querySelector(closeSel); if (c) { const cb = c.getBoundingClientRect(); o.close = r(c); o.closeVisible = !!vpr && cb.top >= vpr.top && cb.bottom <= vpr.bottom && cb.left >= vpr.left && cb.right <= vpr.right; } }
    const sc2 = e.querySelector('.j2-insp-scroll'); if (sc2) { o.scroller = { sh: sc2.scrollHeight, ch: sc2.clientHeight, top: Math.round(sc2.scrollTop), scrollable: sc2.scrollHeight > sc2.clientHeight + 1 }; }
    const foot = e.querySelector('.j2-insp-tile, .j2-sanc-foot, .j2-locate-foot'); if (foot && shown(foot)) { const fb = foot.getBoundingClientRect(); o.foot = r(foot); o.footVisible = !!vpr && fb.bottom <= vpr.bottom + 0.5 && fb.top >= vpr.top - 0.5; }
    o.btnsOutside = Array.from(e.querySelectorAll('button')).filter(shown).filter(x => { if (x.closest('.j2-insp-scroll')) return false; const xb = x.getBoundingClientRect(); return !vpr || xb.bottom > vpr.bottom + 0.5 || xb.top < vpr.top - 0.5 || xb.right > vpr.right + 0.5 || xb.left < vpr.left - 0.5; }).map(x => (x.textContent || x.getAttribute('aria-label') || '').trim().slice(0, 20));
    o.txtOverflow = Array.from(e.querySelectorAll('button, h2, h3, .j2-insp-title')).filter(shown).filter(x => x.scrollWidth > x.clientWidth + 1).map(x => (x.textContent || '').trim().slice(0, 20));
    return o; };
  out.insp = panel('[data-j2-inspector]', '[data-j2-insp-close]'); out.sanc = panel('[data-j2-sanctuary]', '[data-j2-sanc-close]'); out.loc = panel('[data-j2-locate]', '[data-j2-locate-close]');
  const route = q('.j2-route'); out.route = shown(route) ? { rect: r(route) } : null;
  const cmp = q('.j2-compass'); if (cmp && shown(cmp)) { out.compass = { rect: r(cmp) }; const lab = ['cn', 'ce', 'cs', 'cw'].map(k => { const t = cmp.querySelector('[data-j2-l="' + k + '"]'); if (!t) return null; const b = t.getBoundingClientRect(); const cb = cmp.getBoundingClientRect(); return { k: k, inside: b.left >= cb.left - 1 && b.right <= cb.right + 1 && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1, w: Math.round(b.width), h: Math.round(b.height) }; }); out.compass.labels = lab; }
  const ov = q('.modal-overlay'); if (shown(ov)) { const m = ov.querySelector('.modal'); const cl = ov.querySelector('.modal-close'); out.modal = { overlay: r(ov), osh: ov.scrollHeight, och: ov.clientHeight, oTop: Math.round(ov.scrollTop), modal: r(m), msh: m && m.scrollHeight, mch: m && m.clientHeight, close: r(cl), closeSel: cl && (cl.className || cl.tagName), closeInView: cl ? (cl.getBoundingClientRect().top >= 0 && cl.getBoundingClientRect().bottom <= innerHeight) : null, bodyOverflow: getComputedStyle(document.body).overflow, htmlOverflow: getComputedStyle(de).overflow, count: document.querySelectorAll('.modal-overlay').length }; }
  const dlg = q('dialog[open]'); if (dlg) out.dialog = { rect: r(dlg) };
  out.visiblePanels = [out.insp && 'insp', out.sanc && 'sanc', out.loc && 'loc', out.modal && 'modal'].filter(Boolean);
  const st = Journey2View.debugState(); out.cam = { s: +st.camera.scale.toFixed(4), x: Math.round(st.camera.tx), y: Math.round(st.camera.ty) }; out.fitMode = st.fitMode; out.selTile = st.selectedTile; out.inspState = st.inspector; out.sancOpen = st.sanctuaryOpen; out.locate = st.locate && { status: st.locate.status, origin: st.locate.originCellId, target: st.locate.targetAnchorId, dir: st.locate.directionIndex }; out.sideCollapsed = st.sideCollapsed;
  out.tooltips = Array.from(document.querySelectorAll('[data-j2-tip]')).filter(shown).length;
  return out; })()`;

async function start(W = 1920, H = 1080) {
  const k = await open(W, H); const { p, A } = k;
  k.cur = [W, H];
  k.setVP = async (w, h, wait = 650) => { await p.setViewportSize({ width: w, height: h }); k.cur = [w, h]; await sleep(wait); await p.mouse.move(w - 5, h - 5); };
  k.vpName = () => k.cur.join('x');
  k.probe = () => p.evaluate(PROBE);
  k.shot = async (name) => { const f = `${name}-${k.vpName()}.png`; await p.screenshot({ path: path.join(OUT, 'screenshots', f) }); return f; };
  k.freshAt = async (w, h, stateText) => { await p.setViewportSize({ width: w, height: h }); k.cur = [w, h]; await k.fresh(stateText);
    /* the app persists the drawer state on unload, which re-writes dhcodex_journey2_ui after fresh() removed it: normalise to the default (expanded) */
    if ((await A(() => document.querySelector('.j2-stage').getAttribute('data-side'))) === 'collapsed') { await p.click('.j2-rail-btn[data-j2-side-toggle]'); await sleep(600); await p.mouse.move(w - 5, h - 5); } };
  /** put a cell centre at an absolute client point */
  k.putCell = async (cell, scale, cx, cy) => { await A(({ cell, scale, cx, cy }) => { const a = Journey2View.debugApi(); a.setCamera({ scale: 1, tx: 0, ty: 0 }); const w = a.cellToClient(cell); const vp = document.querySelector('.j2-viewport').getBoundingClientRect(); const wx = w.x - vp.left, wy = w.y - vp.top; a.setCamera({ scale, tx: cx - vp.left - wx * scale, ty: cy - vp.top - wy * scale }); }, { cell, scale, cx, cy }); await sleep(350); };
  k.freeArea = () => A(() => { const vp = document.querySelector('.j2-viewport').getBoundingClientRect(); const st = document.querySelector('.j2-stage'); const col = st.getAttribute('data-side') === 'collapsed'; const side = document.querySelector(col ? '.j2-rail' : '.j2-side').getBoundingClientRect(); return { l: side.right, t: vp.top, r: vp.right, b: vp.bottom, w: vp.right - side.right, h: vp.height }; });
  k.cellCentre = cell => k.A(c => { const w = Journey2View.debugApi().cellToClient(c); return w; }, cell);
  k.collapse = async () => { const col = (await A(() => document.querySelector('.j2-stage').getAttribute('data-side'))) === 'collapsed'; await p.click(col ? '.j2-rail-btn[data-j2-side-toggle]' : '.j2-ctl-collapse[data-j2-side-toggle]'); await sleep(550); };
  k.sideIs = () => A(() => document.querySelector('.j2-stage').getAttribute('data-side'));
  /** state of one placed hex after a click: client centre, inside map viewport, covered by what */
  k.hexState = cell => A(c => { const a = Journey2View.debugApi(), w = a.cellToClient(c), vp = document.querySelector('.j2-viewport').getBoundingClientRect(); const e = document.elementFromPoint(w.x, w.y);
    const inVp = w.x >= vp.left && w.x <= vp.right && w.y >= vp.top && w.y <= vp.bottom; return { x: Math.round(w.x), y: Math.round(w.y), inVp, coveredBy: !inVp ? 'outside' : (!e ? 'none' : (e.closest('.j2-viewport, .j2-world') ? null : (e.closest('[data-j2-inspector]') ? 'inspector' : e.closest('[data-j2-sanctuary]') ? 'sanctuary' : e.closest('[data-j2-locate]') ? 'locate' : e.closest('.j2-side') ? 'drawer' : e.closest('.j2-rail') ? 'rail' : e.className.toString().slice(0, 30)))) }; }, cell);
  k.clickHex = async (cell, wait = 700) => { const c = await k.cellCentre(cell); await p.mouse.click(c.x, c.y); await sleep(wait); await p.mouse.move(k.cur[0] - 5, k.cur[1] - 5); await sleep(60); };
  k.pos = async (name) => { const f = await k.freeArea(); const cx = f.l + f.w / 2, cy = f.t + f.h / 2; return { center: [cx, cy], right: [f.r - 45, cy], left: [f.l + 45, cy], bottom: [cx, f.b - 40], top: [cx, f.t + 40] }[name]; };
  k.scrollSide = async (to) => { await A(to => { const e = document.querySelector('[data-j2-side-scroll]'); e.scrollTop = to === 'bottom' ? e.scrollHeight : 0; }, to); await sleep(200); };
  return k;
}
module.exports = { start, sleep, OUT, STATE, PROBE };
