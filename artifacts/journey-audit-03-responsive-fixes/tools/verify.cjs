/* Verification harness for the four responsive fixes (audit 03). Usage: node verify.cjs f1|f2|f3|f4 */
const fs = require('fs'), path = require('path');
const { start, sleep, OUT } = require('./lib3.cjs');
const sharp = require(path.resolve(__dirname, '..', '..', '..', 'node_modules', 'sharp'));
const VARIANT = fs.readFileSync(path.join(OUT, 'state', 'exported-state-more-environments.json'), 'utf8');
const log = (name, obj) => { fs.writeFileSync(path.join(OUT, 'logs', name + '.json'), JSON.stringify(obj, null, 1)); console.log(name, JSON.stringify(obj).slice(0, 3000)); };
const consoleOut = k => k.consoleLines;

async function f1() {
  const rows = [];
  for (const [lang, w, h] of [['en', 1280, 720], ['ru', 1280, 720], ['en', 1512, 982], ['en', 1920, 1080], ['en', 1366, 768], ['en', 1536, 864], ['en', 1280, 800]]) {
    const k = await start(w, h); const { p, A } = k;
    if (lang === 'ru') await p.evaluate(() => localStorage.setItem('dhcodex_lang', '"ru"'));
    await k.freshAt(w, h); const [cx, cy] = await k.pos('center'); await k.putCell('51,-1', 1.0, cx - 100, cy); await k.clickHex('51,-1', 900);
    const open = async () => { await p.click('[data-j2-hexenv-link]'); await sleep(900); };
    const st = () => A(() => { const ov = document.querySelector('.modal-overlay'); if (!ov) return null; const b = document.querySelector('.modal-close').getBoundingClientRect(); const m = document.querySelector('.modal').getBoundingClientRect();
      return { osh: ov.scrollHeight, och: ov.clientHeight, top: Math.round(ov.scrollTop), close: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)], inView: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, modalW: Math.round(m.width), pageScrollY: scrollY, bodyOverflow: getComputedStyle(document.body).overflow, atTopEl: (() => { const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && !!e.closest('.modal-close'); })() }; });
    const row = { lang, vp: `${w}x${h}` };
    await open(); row.top = await st(); await k.shot(`F1-${lang}-top`);
    const max = row.top.osh - row.top.och;
    await A(m => { document.querySelector('.modal-overlay').scrollTop = m; }, Math.floor(max / 2)); await sleep(250); row.middle = await st(); await k.shot(`F1-${lang}-middle`);
    await A(() => { const o = document.querySelector('.modal-overlay'); o.scrollTop = o.scrollHeight; }); await sleep(250); row.bottom = await st(); await k.shot(`F1-${lang}-bottom`);
    await p.click('.modal-close'); await sleep(700); row.closedByButton = !(await A(() => !!document.querySelector('.modal-overlay'))); row.hashAfterButton = await A(() => location.hash);
    await open(); await A(() => { const o = document.querySelector('.modal-overlay'); o.scrollTop = o.scrollHeight; }); await sleep(150); await p.keyboard.press('Escape'); await sleep(700); row.closedByEscape = !(await A(() => !!document.querySelector('.modal-overlay')));
    await open(); await A(() => { const o = document.querySelector('.modal-overlay'); o.scrollTop = o.scrollHeight; }); await sleep(150); await p.mouse.click(40, h / 2); await sleep(700); row.closedByBackdrop = !(await A(() => !!document.querySelector('.modal-overlay')));
    row.console = consoleOut(k).slice(); rows.push(row); await k.close();
  }
  log('f1-modal-close', rows);
}

async function f2() {
  const rows = [];
  for (const [w, h, pick] of [[1280, 720, true], [1366, 768, true], [1280, 720, false], [1920, 1080, false]]) {
    const k = await start(w, h); const { p, A } = k; await k.freshAt(w, h, VARIANT); const [cx, cy] = await k.pos('center'); await k.putCell('57,-3', 1.0, cx - 100, cy); await k.clickHex('57,-3', 900);
    if (pick) { await p.click('[data-j2-hexenv="change"]'); await sleep(800); }
    const g = await A(() => { const sc = document.querySelector('[data-j2-inspector] .j2-insp-scroll'); const b = sc.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, sh: sc.scrollHeight, ch: sc.clientHeight }; });
    const insp = await A(() => { const b = document.querySelector('[data-j2-inspector]').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
    const rgb = async (x, y, wd, ht) => { const buf = await p.screenshot({ clip: { x, y, width: wd, height: ht } }); const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true }); return { data, ch: info.channels, n: info.width * info.height }; };
    const L = (d, i) => 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2];
    const cueOn = async on => { await A(on => { const e = document.querySelector('[data-j2-inspector] .j2-insp-scroll'); if (on) e.style.removeProperty('background-image'); else e.style.setProperty('background-image', 'none', 'important'); }, on); await sleep(120); };
    const measure = async edge => { const x = Math.round(g.l + g.w / 2 - 60), y = Math.round(edge === 'bottom' ? g.t + g.h - 22 : g.t), wd = 120, ht = 22; await cueOn(true); const on = await rgb(x, y, wd, ht); await cueOn(false); const off = await rgb(x, y, wd, ht); await cueOn(true);
      let sum = 0, mx = 0; for (let i = 0; i < on.data.length; i += on.ch) { const d = L(on, i) - L(off, i); sum += d; mx = Math.max(mx, d); } return { meanDeltaL: +(sum / on.n).toFixed(2), maxDeltaL: +mx.toFixed(2) }; };
    const row = { vp: `${w}x${h}`, picker: pick, scrollable: g.sh > g.ch, overflowPx: g.sh - g.ch, positions: {} };
    const positions = g.sh > g.ch ? { top: 0, middle: Math.floor((g.sh - g.ch) / 2), end: g.sh - g.ch } : { fits: 0 };
    for (const [name, t] of Object.entries(positions)) { await A(t => { document.querySelector('[data-j2-inspector] .j2-insp-scroll').scrollTop = t; }, t); await sleep(250);
      const real = await A(() => document.querySelector('[data-j2-inspector] .j2-insp-scroll').scrollTop);
      const top = await measure('top'), bottom = await measure('bottom');
      await p.mouse.move(w - 5, h - 5); await sleep(80);
      await p.screenshot({ path: path.join(OUT, 'screenshots', `F2-${pick ? 'picker' : 'plain'}-${name}-${w}x${h}.png`), clip: { x: Math.max(0, insp.x - 4), y: Math.max(0, insp.y - 4), width: Math.min(w, insp.w + 8), height: Math.min(h, insp.h + 8) } });
      row.positions[name] = { scrollTop: real, topCue: top, bottomCue: bottom }; }
    rows.push(row); row.console = consoleOut(k).slice(); await k.close();
  }
  log('f2-scroll-cue', rows);
}

async function f3() {
  const rows = [];
  for (const [w, h] of [[1280, 720], [1366, 768], [1536, 864]]) {
    const k = await start(w, h); const { p, A } = k; await k.freshAt(w, h, VARIANT); const [cx, cy] = await k.pos('center'); await k.putCell('57,-3', 1.0, cx - 100, cy); await k.clickHex('57,-3', 900);
    await p.click('[data-j2-hexenv="change"]'); await sleep(800);
    const m = () => A(() => { const l = document.querySelector('.j2-hexenv-list'), o = document.querySelector('[data-j2-inspector] .j2-insp-scroll'); const lb = l.getBoundingClientRect(); return { list: Math.round(l.scrollTop), listMax: l.scrollHeight - l.clientHeight, outer: Math.round(o.scrollTop), outerMax: o.scrollHeight - o.clientHeight, lx: lb.left + lb.width / 2, ly: lb.top + Math.min(lb.height, innerHeight - lb.top) / 2 }; });
    const row = { vp: `${w}x${h}`, start: await m(), down: [], up: [] };
    // keep the pointer on the list the whole time
    let s = await m(); await p.mouse.move(s.lx, s.ly);
    let hand = null;
    for (let i = 0; i < 60; i++) { await p.mouse.wheel(0, 120); await sleep(70); const c = await m(); if (i % 10 === 0 || c.list === c.listMax) row.down.push(c); if (c.list >= c.listMax - 1 && c.outer > 0 || (i > 50)) {} if (c.list >= c.listMax - 1 && !hand) hand = { atBoundary: c, tick: i }; }
    await sleep(700); for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 120); await sleep(70); } await sleep(300); row.afterHandoff = await m(); row.boundary = hand;
    await k.shot('F3-after-handoff-down');
    // reverse: outer is at max; wheel up with pointer on list (list max -> goes up inside list first)
    s = await m(); await p.mouse.move(s.lx, Math.max(40, Math.min(s.ly, h - 40)));
    for (let i = 0; i < 60; i++) { await p.mouse.wheel(0, -120); await sleep(70); const c = await m(); if (i % 10 === 0) row.up.push(c); }
    await sleep(700); const mid = await m(); for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, -120); await sleep(70); } await sleep(300); row.afterUp = await m(); row.beforeUpBoundaryTail = mid;
    await k.shot('F3-after-handoff-up');
    // assignment still correct: click the 3rd row
    const before = await A(() => document.querySelector('[data-j2-i="hexEnvBody"]').textContent.replace(/\s+/g, ' ').trim());
    await A(() => { const l = document.querySelector('.j2-hexenv-list'); l.scrollTop = 0; document.querySelector('[data-j2-inspector] .j2-insp-scroll').scrollTop = 0; }); await sleep(200);
    const target = await A(() => { const r = document.querySelectorAll('.j2-hexenv-list button, .j2-hexenv-list [role=option], .j2-hexenv-list li'); const rows = Array.from(r).filter(x => x.getClientRects().length); const b = rows[2]; b.scrollIntoView({ block: 'nearest' }); const bb = b.getBoundingClientRect(); return { text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), x: bb.left + bb.width / 2, y: bb.top + bb.height / 2, n: rows.length }; });
    await p.mouse.click(target.x, target.y); await sleep(600);
    row.assign = { before, target: target.text, after: await A(() => document.querySelector('[data-j2-i="hexEnvBody"]').textContent.replace(/\s+/g, ' ').trim()) };
    row.console = consoleOut(k).slice(); rows.push(row); await k.close();
  }
  log('f3-scroll-handoff', rows);
}

async function f4() {
  const rows = []; const camOf = k => k.A(() => { const s = Journey2View.debugState(); return { s: +s.camera.scale.toFixed(4), x: Math.round(s.camera.tx), y: Math.round(s.camera.ty), fit: s.fitMode, side: s.sideCollapsed, insp: s.inspector, sel: s.selectedTile }; });
  const metrics = async k => { const hx = await k.hexState('51,-1'); const cam = await camOf(k); const pr = await k.probe();
    const info = await k.A(() => ({ inspectors: document.querySelectorAll('[data-j2-inspector]:not([hidden])').length, ret: (() => { const b = document.querySelector('[data-j2-return]'); if (!b) return null; const r = b.getBoundingClientRect(), v = document.querySelector('.j2-viewport').getBoundingClientRect(); return { inView: r.top >= v.top && r.bottom <= v.bottom && r.left >= v.left && r.right <= v.right, disabled: b.disabled }; })() }));
    return { hex: hx, cam, insp: pr.insp && { rect: pr.insp.rect, inVp: pr.insp.inVp, caret: undefined, footVisible: pr.insp.footVisible }, ...info, doc: pr.doc }; };
  const caret = k => k.A(() => { const e = document.querySelector('[data-j2-inspector]'); return e ? { side: e.getAttribute('data-side'), caret: e.getAttribute('data-caret') } : null; });
  const run = async (name, from, to, place, opts = {}) => {
    const k = await start(from[0], from[1]); const { p } = k; await k.freshAt(from[0], from[1]); await k.putCell('51,-1', 1.0, place[0], place[1]); await k.clickHex('51,-1', 1000);
    const row = { name, from: from.join('x'), to: to.join('x'), place };
    row.before = await metrics(k); row.before.caret = await caret(k); row.shotBefore = await k.shot(`F4-${name}-before`);
    await k.setVP(to[0], to[1], 1200); row.after = await metrics(k); row.after.caret = await caret(k); row.shotAfter = await k.shot(`F4-${name}-after`);
    const sameCam = (a, b) => a.s === b.s && a.x === b.x && a.y === b.y; row.zoomUnchanged = row.before.cam.s === row.after.cam.s; row.cameraMoved = !sameCam(row.before.cam, row.after.cam); row.fitCalled = row.after.cam.fit;
    row.hexVisible = row.after.hex.inVp && row.after.hex.coveredBy === null;
    if (opts.grow) { await k.setVP(from[0], from[1], 1200); row.afterGrow = await metrics(k); row.afterGrow.caret = await caret(k); row.shotGrow = await k.shot(`F4-${name}-after-grow`); }
    row.console = consoleOut(k).slice(); rows.push(row); await k.close(); };
  await run('1920-to-1280x720-right', [1920, 1080], [1280, 720], [1700, 400], { grow: true });
  await run('1920-to-1512x982-right', [1920, 1080], [1512, 982], [1700, 400], { grow: true });
  await run('1920-to-1366x768-right', [1920, 1080], [1366, 768], [1700, 400], { grow: true });
  await run('1512-to-1280x720-right', [1512, 982], [1280, 720], [1330, 400], { grow: true });
  await run('1920-to-1280x720-bottom', [1920, 1080], [1280, 720], [900, 1000], { grow: true });
  await run('1280x720-to-1920-grow', [1280, 720], [1920, 1080], [900, 300]);
  await run('control-center-1920-to-1280x720', [1920, 1080], [1280, 720], [700, 360]);
  await run('control-center-1920-to-1366x768', [1920, 1080], [1366, 768], [700, 360]);
  log('f4-resize', rows);
}
({ f1, f2, f3, f4 })[process.argv[2]]().catch(e => { console.error(e); process.exit(1); });
