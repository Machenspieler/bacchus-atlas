/* ============================================================
   Artwork Lab V3 — lab-ui.js  (DEV-ONLY; lab/ is excluded from dist/)
   Browser side of the lab. Reads the repo's real data, renders the PRODUCTION card and picker-row
   templates (through lab/artwork-v3/prod-bridge.js) and swaps only the picture. Persists nothing
   but lab-prefixed localStorage keys ("labv3:*"); never reads or writes a dhcodex_* key.
   Reach it at /lab/artwork-v3/ on any static server — see docs/research/catalog-prep-artwork-lab-v3.md.
   ============================================================ */
(function () {
  'use strict';
  const Core = window.ArtworkLabCore;
  const Art = window.ListCoverArt;
  const root = document.getElementById('lab-root');

  /* ---------- lab-local storage (never a production key) ---------- */
  const LS = { crops: 'labv3:crops', reviews: 'labv3:reviews', ui: 'labv3:ui' };
  const lsGet = (k, fb) => { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = p => String(p || '').split('/').pop();
  const fmt = n => (Math.round(n * 100) / 100).toString();

  const TABS = [
    ['summary', 'Summary'], ['catalog', 'Catalog'], ['prep', 'Session Prep'], ['stress', 'Stress tests'], ['library', 'Library · 28'], ['review', 'Review & export'],
  ];

  let core; let bridge; let data; let S;

  /* ---------- state ---------- */
  function readHash() {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return { tab: p.get('tab'), env: p.get('env'), lang: p.get('lang'), dpr: p.get('dpr') };
  }
  function writeHash() {
    const p = new URLSearchParams();
    p.set('tab', S.tab); p.set('env', S.envId); p.set('lang', S.lang);
    try { window.history.replaceState(null, '', '#' + p.toString()); } catch (e) { /* file:// etc. */ }
  }
  function saveUi() { lsSet(LS.ui, { side: S.side, gridMode: S.gridMode, group: S.group, prepList: S.prepList }); }

  const curEnv = () => core.byId.get(S.envId);

  /* ---------- picture markup ---------- */

  /** A thematic (landscape) picture in a Catalog strip or a Prep tile, from the production cuts. */
  function landscapeArt(image, ctx, crop, opts) {
    opts = opts || {};
    const box = Core.CONTEXTS[ctx].box;
    const sizes = Math.ceil(Core.coverWidth(box, image.aspect) * crop.zoom) + 'px';
    const srcset = image.sources.map(s => `${s.path} ${s.w}w`).join(', ');
    const loading = opts.eager ? 'eager' : 'lazy';
    const img = `<img ${ctx === 'prep' ? 'class="prep-thumb" ' : ''}src="${image.fallback}" alt="" loading="${loading}" decoding="async" style="${Core.cropStyle(crop)}" data-zoom="${crop.zoom}" data-image="${esc(image.id)}">`;
    const pic = `<picture${ctx === 'prep' ? ' style="display:block"' : ''}><source type="image/avif" sizes="${sizes}" srcset="${srcset}">${img}</picture>`;
    if (ctx === 'catalog') return `<div class="card-art" style="overflow:hidden${opts.frameStyle ? ';' + opts.frameStyle : ''}">${pic}</div>`;
    return `<span style="flex:none;display:block;width:48px;height:48px;border-radius:var(--r-sm);overflow:hidden">${pic}</span>`;
  }
  function eagerize(html, eager) { return eager ? html.replace(/loading="lazy"/g, 'loading="eager"') : html; }

  /** The picture a strategy puts in `ctx` for `env`, as the production seam expects it. */
  function artFor(env, strategy, ctx, opts) {
    opts = opts || {};
    const res = core.resolve(strategy, env, ctx);
    if (!res.image) return ctx === 'catalog' ? '' : bridge.prodPrepEnvThumbHtml(env);
    if (res.image.kind === 'biome-production') {
      return eagerize(ctx === 'catalog' ? bridge.prodBiomeArtHtml(env) : bridge.prodPrepEnvThumbHtml(env), opts.eager);
    }
    const crop = core.effectiveCrop(strategy, res.image, ctx, S.crops);
    return landscapeArt(res.image, ctx, crop, opts);
  }

  function setSeams(strategy, opts) {
    bridge.hooks.catalogArt = env => artFor(env, strategy, 'catalog', opts);
    bridge.hooks.prepThumb = env => artFor(env, strategy, 'prep', opts);
  }
  function cardFor(env, strategy, opts) { setSeams(strategy, opts); return bridge.cardHtml(env); }
  function rowFor(env, strategy, checkedIds, opts) {
    setSeams(strategy, opts);
    return bridge.envPickerRowHtml(env, { environmentIds: checkedIds });
  }

  /* ---------- small renderers ---------- */

  const SOURCE_LABEL = { unique: 'unique painting', override: 'explicit override', archetype: 'archetype', biome: 'biome', none: 'no picture' };
  const SOURCE_CLASS = { unique: 'u', override: 'u', archetype: 'a', biome: 's', none: 'x' };
  function sourceChip(res) {
    const fit = res.fit ? ` · ${res.fit}` : '';
    const rev = res.rejectedImageId ? ` · kept biome (${res.reviewStatus})` : '';
    return `<span class="lab-chip ${SOURCE_CLASS[res.source]}">${SOURCE_LABEL[res.source]}${fit}${rev}</span>`;
  }
  const ratingPill = rv => (rv ? `<span class="lab-pill-${rv.rating[0]}">${rv.rating}</span>` : '<span class="lab-pill-u">unreviewed</span>');

  function diagnostics(env) {
    const hint = core.taxonomyHint(env);
    const auth = core.authorised(env);
    const A = core.resolveA(env, 'catalog'); const B = core.resolveB(env, 'catalog'); const C = core.resolveC(env, 'catalog');
    const Ap = core.resolveA(env, 'prep'); const Bp = core.resolveB(env, 'prep'); const Cp = core.resolveC(env, 'prep');
    const choice = (r, ctx) => `${SOURCE_LABEL[r.source]}${r.image ? ' — <code>' + esc(r.image.id) + '</code>' : ''}${ctx === 'catalog' ? '' : ''}`;
    const taxText = {
      authorised: 'authorised by ARCHETYPE_FIT',
      'authorised-differs-from-primary': 'authorised by ARCHETYPE_FIT, but to a different archetype than the taxonomy primary',
      'taxonomy-only-not-authorised': 'taxonomy only — <b>NOT authorised</b> (the picture was judged not to show this place, or was never mapped); never used by B or C',
      'no-taxonomy-archetype': 'taxonomy has no archetype for it',
    }[hint.status];
    const diff = (r1, r2) => (r1.identity === r2.identity ? 'same picture' : 'different picture');
    return `
      <div class="lab-two">
        <div class="lab-card"><dl class="lab-facts">
          <dt>ID</dt><dd><code>${esc(env.id)}</code></dd>
          <dt>Name</dt><dd>${esc(env.name.en)} · ${esc(env.name.ru || '—')}</dd>
          <dt>Tier / type</dt><dd>${esc(EnvTierUtils.tierLabel(env))} · ${esc(env.type)}</dd>
          <dt>Biomes</dt><dd>${(env.biomes || []).map(esc).join(', ') || '—'} → production <code>artBiome</code> = <b>${esc(A.biome || 'none')}</b></dd>
          <dt>Primary archetype</dt><dd>${hint.primary ? `${esc(hint.primaryName)} (<code>${esc(hint.primary)}</code>)` : '—'}</dd>
          <dt>Secondary</dt><dd>${hint.secondary.length ? hint.secondary.map(x => `<code>${esc(x)}</code>`).join(', ') : '—'}</dd>
          <dt>Taxonomy vs registry</dt><dd>${taxText}</dd>
          <dt>Unique painting</dt><dd>${Art.UNIQUE_ENV_IDS.includes(env.id) ? 'yes — <code>env:' + esc(env.id) + '</code> (production Catalog/Prep do not draw it today)' : 'no'}</dd>
          <dt>Eligible thematic</dt><dd>${auth && auth.role !== 'unique' ? `<code>${esc(auth.imageId)}</code> · ${esc(auth.role)}${auth.fit ? ' · ' + auth.fit : ''}` : 'none'}</dd>
          <dt>Existing biome art</dt><dd>${A.image ? `<code>${esc(A.image.fallback)}</code>` : 'none'}</dd>
          ${hint.explanation ? `<dt>Classification note</dt><dd>${esc(hint.explanation)}</dd>` : ''}
        </dl></div>
        <div class="lab-card"><dl class="lab-facts">
          <dt>Production (A)</dt><dd>Catalog: ${choice(A)}<br>Prep: ${choice(Ap)}</dd>
          <dt>Strategy B</dt><dd>Catalog: ${choice(B)} <i>(${diff(A, B)})</i><br>Prep: ${choice(Bp)} <i>(${diff(Ap, Bp)})</i></dd>
          <dt>Strategy C</dt><dd>Catalog: ${choice(C)} <i>(${diff(A, C)})</i><br>Prep: ${choice(Cp)} <i>(${diff(Ap, Cp)})</i></dd>
          <dt>Why (Catalog)</dt><dd><ul class="lab-reason">${C.reason.map(r => `<li>${esc(r)}</li>`).join('')}</ul></dd>
          <dt>Why (Prep)</dt><dd><ul class="lab-reason">${Cp.reason.map(r => `<li>${esc(r)}</li>`).join('')}</ul></dd>
        </dl></div>
      </div>`;
  }

  function colHead(strategy, res) {
    return `<div class="lab-colhead">${Core.STRATEGIES[strategy].label} ${sourceChip(res)}</div>`;
  }

  /* ---------- audit (real browser measurements) ---------- */

  /* img.naturalWidth is density-corrected for srcset candidates (a 960w file shown at sizes="443px" reports
   * 443), so the true pixel size is read from a plain Image on the very file the browser chose. */
  const rawCache = new Map();
  function rawDims(src) {
    if (!rawCache.has(src)) rawCache.set(src, new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = src; }));
    return rawCache.get(src);
  }
  async function measureImg(img) {
    const src = img.currentSrc || img.src;
    const d = await rawDims(src);
    const zoom = Number(img.dataset.zoom || 1);
    const box = { w: img.offsetWidth, h: img.offsetHeight };
    const dpr = window.devicePixelRatio || 1;
    if (!d || !d.w) return { broken: true, src };
    const drawnW = Core.coverWidth(box, d.w / d.h) * zoom;
    const ratio = d.w / (drawnW * dpr);
    return { broken: false, src, file: base(src), nw: d.w, nh: d.h, box, drawnW: Math.round(drawnW * 10) / 10, dpr, ratio: Math.round(ratio * 100) / 100, upscaled: ratio < 0.995 };
  }
  async function whenLoaded(imgs) {
    await Promise.all(imgs.map(img => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise(res => {
      const done = () => res(); img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); setTimeout(done, 8000);
    }))));
  }
  async function fillAudits(scope) {
    const nodes = [...scope.querySelectorAll('[data-audit]')];
    for (const node of nodes) {
      const host = node.previousElementSibling;
      const img = host && host.querySelector('.card-art img, img.prep-thumb');
      if (!img) { node.innerHTML = 'no picture drawn (production draws none for this case)'; continue; }
      await whenLoaded([img]);
      const m = await measureImg(img);
      if (m.broken) { node.innerHTML = '<span class="bad">BROKEN image</span> ' + esc(m.src); continue; }
      const verdict = m.upscaled ? `<span class="bad">upscaled ×${fmt(1 / m.ratio)}</span>` : `<span class="ok">sharp ${fmt(m.ratio)}×</span>`;
      node.innerHTML = `${esc(m.file)} · source ${m.nw}×${m.nh}px · drawn ${fmt(m.drawnW)} css px wide · DPR ${m.dpr} · ${verdict}`;
    }
  }

  /** Every distinct file every strategy would fetch, measured in this browser at this DPR. */
  async function auditAll() {
    const host = document.createElement('div'); host.className = 'lab-hidden-audit'; document.body.appendChild(host);
    const result = { dpr: window.devicePixelRatio || 1, viewport: [window.innerWidth, window.innerHeight], contexts: {} };
    for (const ctx of ['catalog', 'prep']) {
      result.contexts[ctx] = {};
      for (const s of ['A', 'B', 'C']) {
        host.innerHTML = core.envs.map(env => {
          const art = artFor(env, s, ctx, { eager: true });
          return ctx === 'catalog'
            ? `<div style="position:relative;display:flex;width:95px;height:249px;overflow:hidden">${art}</div>`
            : `<div style="display:flex;width:48px;height:48px">${art}</div>`;
        }).join('');
        const imgs = [...host.querySelectorAll('img')];
        await whenLoaded(imgs);
        const measures = await Promise.all(imgs.map(measureImg));
        const files = new Map();
        measures.forEach(m => { if (!m.broken) files.set(m.src, m); });
        let bytes = 0;
        for (const url of files.keys()) {
          try { const r = await fetch(url, { method: 'HEAD' }); bytes += Number(r.headers.get('content-length') || 0); } catch (e) { /* ignore */ }
        }
        const ratios = measures.filter(m => !m.broken).map(m => m.ratio);
        result.contexts[ctx][s] = {
          envs: core.envs.length, images: imgs.length, requests: files.size, bytes,
          broken: measures.filter(m => m.broken).length, upscaled: measures.filter(m => m.upscaled).length,
          minRatio: ratios.length ? Math.min.apply(null, ratios) : null,
          files: [...files.values()].map(m => ({ file: m.file, nw: m.nw, nh: m.nh, ratio: m.ratio })).sort((a, b) => (a.file < b.file ? -1 : 1)),
        };
      }
    }
    host.remove();
    return result;
  }
  window.__labAuditAll = auditAll;

  /* ---------- crop editor + diagnostics (per context) ---------- */

  function candidateImages(env, ctx) {
    const list = core.candidatesFor(env, ctx).map(c => c);
    /* Also offer the archetype the taxonomy points at, flagged, so a "not authorised" picture can be
     * LOOKED at — it is never selectable as a strategy choice. */
    return list;
  }
  function currentCandidate(env, ctx) {
    const list = candidateImages(env, ctx);
    const want = S.cand[ctx];
    const hit = list.find(c => c.image && c.image.id === want);
    if (hit) return hit;
    const pref = list.find(c => c.role !== 'production-biome') || list[0];
    return pref || null;
  }
  function cropFor(cand, ctx) {
    const strat = 'B';
    return core.effectiveCrop(strat, cand.image, ctx, S.crops);
  }

  function pixelZoom(host, cand, ctx, factor) {
    const box = Core.CONTEXTS[ctx].box;
    const dpr = window.devicePixelRatio || 1;
    const crop = core.effectiveCrop('B', cand.image, ctx, S.crops);
    const pick = cand.image.shape === 'thumb'
      ? { source: cand.image.sources.find(s => s.w >= 48 * dpr) || cand.image.sources[cand.image.sources.length - 1] }
      : Core.pickDerivative(cand.image, ctx, dpr, crop.zoom);
    const img = new Image();
    img.onload = () => {
      const W = Math.round(box.w * dpr); const H = Math.round(box.h * dpr);
      const cv = host.querySelector('canvas'); if (!cv) return;
      cv.width = W; cv.height = H;
      cv.style.width = (box.w * factor) + 'px'; cv.style.height = (box.h * factor) + 'px';
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      const win = Core.cropWindow(box, img.naturalWidth / img.naturalHeight, crop);
      c.drawImage(img, win.left * img.naturalWidth, win.top * img.naturalHeight, win.vw * img.naturalWidth, win.vh * img.naturalHeight, 0, 0, W, H);
      const cap = host.querySelector('.cap'); if (cap) cap.textContent = `${base(pick.source.path)} (${img.naturalWidth}×${img.naturalHeight}) → ${W}×${H} device px, shown ×${factor} pixelated`;
    };
    img.src = pick.source.path;
  }

  function editorHtml(ctx) {
    const label = Core.CONTEXTS[ctx].label;
    return `
      <div class="lab-card" data-editor="${ctx}">
        <div class="lab-colhead">Crop experiment — ${label} <span class="lab-chip">independent of ${ctx === 'catalog' ? 'Session Prep' : 'Catalog'}</span></div>
        <p class="lab-note" style="margin:0 0 8px">Applies to the selected candidate in <b>${label}</b> only, for both B and C (so source choice and crop can be judged separately). Production CSS and registry are never touched.</p>
        <div class="lab-editor">
          <label>X</label><input type="range" min="0" max="100" step="1" data-k="x"><output data-o="x"></output>
          <label>Y</label><input type="range" min="0" max="100" step="1" data-k="y"><output data-o="y"></output>
          <label>Zoom</label><input type="range" min="1" max="3" step="0.05" data-k="zoom"><output data-o="zoom"></output>
        </div>
        <div class="lab-row">
          <button class="lab-btn" data-preset="production">Production crop</button>
          <button class="lab-btn" data-preset="registry">Registry crop (B start)</button>
          <button class="lab-btn" data-preset="reviewed">Recommended (C start)</button>
          <button class="lab-btn" data-preset="center">Center</button>
          <button class="lab-btn" data-preset="left">◀ left</button><button class="lab-btn" data-preset="right">right ▶</button>
          <button class="lab-btn" data-preset="up">▲ up</button><button class="lab-btn" data-preset="down">down ▼</button>
          <button class="lab-btn" data-preset="clear">Clear experiment</button>
        </div>
        <div class="lab-row">
          <button class="lab-btn" data-act="copycss">Copy experimental CSS</button>
          <button class="lab-btn" data-act="copyjson">Copy crop JSON</button>
          <span class="lab-audit" data-editor-status></span>
        </div>
        <pre class="lab-audit" data-css style="white-space:pre-wrap;margin:6px 0 0"></pre>
      </div>`;
  }

  function wireEditor(box, ctx, env, onChange) {
    const get = () => { const c = currentCandidate(env, ctx); return c; };
    const read = () => { const c = get(); return c ? core.effectiveCrop('B', c.image, ctx, S.crops) : null; };
    function sync() {
      const c = get(); const crop = read();
      const editable = c && c.image.crop;
      box.querySelectorAll('input[type=range]').forEach(r => { r.disabled = !editable; if (crop) r.value = crop[r.dataset.k]; });
      box.querySelectorAll('[data-o]').forEach(o => { o.textContent = crop ? (o.dataset.o === 'zoom' ? '×' + fmt(crop.zoom) : crop[o.dataset.o] + '%') : ''; });
      box.querySelectorAll('[data-preset]').forEach(b => { b.disabled = !editable; });
      const st = box.querySelector('[data-editor-status]');
      st.textContent = !c ? 'no candidate' : editable ? (S.crops[ctx][c.image.id] ? 'lab override active' : 'no override — registry/reviewed start') : 'production biome: baked crop, not adjustable';
      box.querySelector('[data-css]').textContent = c && editable ? Core.cropCss(crop, ctx === 'catalog' ? '.card-art img' : '.prep-thumb') : '';
    }
    function setCrop(next) {
      const c = get(); if (!c || !c.image.crop) return;
      S.crops[ctx][c.image.id] = Core.normalizeCrop(next);
      lsSet(LS.crops, S.crops); sync(); onChange();
    }
    box.addEventListener('input', e => {
      const k = e.target.dataset && e.target.dataset.k; if (!k) return;
      const crop = read(); setCrop(Object.assign({}, crop, { [k]: Number(e.target.value) }));
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const c = get(); if (!c) return; const crop = read();
      const p = b.dataset.preset;
      if (p === 'clear') { delete S.crops[ctx][c.image.id]; lsSet(LS.crops, S.crops); sync(); onChange(); return; }
      if (p === 'production') { delete S.crops[ctx][c.image.id]; setCrop({ x: 50, y: ctx === 'catalog' ? 0 : 50, zoom: 1 }); return; }
      if (p === 'registry') return setCrop(core.startCrop('B', c.image, ctx));
      if (p === 'reviewed') return setCrop(core.reviewedCrop(c.image, ctx) || core.startCrop('B', c.image, ctx));
      if (p === 'center') return setCrop({ x: 50, y: 50, zoom: crop.zoom });
      if (p === 'left') return setCrop(Object.assign({}, crop, { x: Math.max(0, crop.x - 10) }));
      if (p === 'right') return setCrop(Object.assign({}, crop, { x: Math.min(100, crop.x + 10) }));
      if (p === 'up') return setCrop(Object.assign({}, crop, { y: Math.max(0, crop.y - 10) }));
      if (p === 'down') return setCrop(Object.assign({}, crop, { y: Math.min(100, crop.y + 10) }));
      if (b.dataset.act === 'copycss') copy(box.querySelector('[data-css]').textContent, b);
      if (b.dataset.act === 'copyjson') copy(JSON.stringify({ context: ctx, image: c.image.id, crop }, null, 2), b);
    });
    sync();
    return sync;
  }
  function copy(text, btn) {
    const done = ok => { if (btn) { const t = btn.textContent; btn.textContent = ok ? 'Copied ✓' : 'Copy failed'; setTimeout(() => { btn.textContent = t; }, 1200); } };
    try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (e) { done(false); }
  }

  /** The candidate strips, the full-source crop window and the pixel inspection for one context. */
  function candidatesHtml(env, ctx) {
    const cands = candidateImages(env, ctx);
    const sel = currentCandidate(env, ctx);
    const items = cands.map(c => {
      const crop = core.effectiveCrop('B', c.image, ctx, S.crops);
      const art = c.image.kind === 'biome-production'
        ? eagerize(ctx === 'catalog' ? bridge.prodBiomeArtHtml(env) : bridge.prodPrepEnvThumbHtml(env), true)
        : landscapeArt(c.image, ctx, crop, { eager: true });
      const role = { 'production-biome': 'Current biome (A)', archetype: 'Eligible thematic (B/C)', unique: 'Unique painting', override: 'Explicit override' }[c.role];
      const rv = c.image.kind === 'biome-production' ? null : core.reviewFor(c.image.id, ctx);
      const stripHost = ctx === 'catalog' ? `<div class="lab-strip">${art}</div>` : `<div class="prep-row" style="padding:4px">${art}</div>`;
      return `<div class="lab-cand" data-selected="${sel && sel.image.id === c.image.id}">
        <label><input type="radio" name="cand-${ctx}" value="${esc(c.image.id)}" ${sel && sel.image.id === c.image.id ? 'checked' : ''}> ${role}</label>
        ${stripHost}<div class="lab-audit" data-audit></div>
        <div class="lab-audit"><code>${esc(c.image.id)}</code> · ${c.image.kind === 'biome-production' ? 'baked crop' : 'review: ' + ratingPill(rv)}${c.fit ? ' · fit ' + c.fit : ''}</div>
      </div>`;
    }).join('');
    return `<div class="lab-cands">${items || '<div class="lab-card">No legitimate candidate.</div>'}</div>`;
  }

  function diagZoomHtml(env, ctx) {
    const c = currentCandidate(env, ctx);
    if (!c) return '';
    const box = Core.CONTEXTS[ctx].box;
    const crop = core.effectiveCrop('B', c.image, ctx, S.crops);
    const full = c.image.sources.slice().sort((a, b) => a.w - b.w)[ctx === 'prep' ? 0 : 1] || c.image.sources[0];
    const win = Core.cropWindow(box, c.image.aspect, crop);
    const pct = v => (v * 100).toFixed(2) + '%';
    const frame = c.image.shape === 'strip' || c.image.shape === 'thumb'
      ? '<div class="lab-note">Baked production crop: the whole file is the crop.</div>'
      : `<div class="lab-diag" style="width:${Math.min(420, 300 * c.image.aspect)}px"><img src="${full.path}" alt=""><div class="win" style="left:${pct(win.left)};top:${pct(win.top)};width:${pct(win.vw)};height:${pct(win.vh)}"></div></div>`;
    return `<div class="lab-card">
      <div class="lab-colhead">Diagnostic zoom <span class="lab-chip">not production rendering</span></div>
      <div class="lab-dl">Full source with the visible ${ctx === 'catalog' ? '95×249' : '48×48'} window outlined (yellow)</div>${frame}
      <div class="lab-dl" style="margin-top:10px">Pixel inspection: the exact device pixels the browser draws in production, enlarged</div>
      <div data-pix><canvas class="lab-pix"></canvas><div class="lab-audit cap"></div></div>
    </div>`;
  }

  /* ---------- review panel ---------- */

  function reviewKey(envId, ctx) { return envId + '|' + ctx; }
  function reviewPanelHtml(env, ctx) {
    const r = S.reviews[reviewKey(env.id, ctx)];
    const opts = Core.JUDGEMENTS.map(j => `<option value="${j.id}" ${r && r.judgement === j.id ? 'selected' : ''}>${j.label}</option>`).join('');
    return `<div class="lab-card lab-review" data-review="${ctx}">
      <div class="lab-colhead">Your judgement — ${Core.CONTEXTS[ctx].label} · ${esc(env.name.en)}</div>
      <div class="lab-row"><select data-j>${opts}<option value="" ${r ? '' : 'selected'}>— not judged —</option></select></div>
      <textarea data-n placeholder="Optional note (why; what crop or source would fix it)">${esc(r ? r.notes : '')}</textarea>
      <div class="lab-row"><button class="lab-btn" data-act="save">Record</button><button class="lab-btn" data-act="clear">Remove</button>
      <span class="lab-audit" data-status>${r ? 'recorded ' + esc(r.at || '') : 'nothing recorded for this environment in this context'}</span></div>
    </div>`;
  }
  function wireReview(box, env, ctx) {
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const key = reviewKey(env.id, ctx);
      if (b.dataset.act === 'clear') { delete S.reviews[key]; }
      if (b.dataset.act === 'save') {
        const j = box.querySelector('[data-j]').value;
        if (!j) { delete S.reviews[key]; } else {
          const cand = currentCandidate(env, ctx);
          const def = Core.JUDGEMENTS.find(x => x.id === j);
          S.reviews[key] = {
            envId: env.id, ctx, judgement: j, preferred: def.preferred, notes: box.querySelector('[data-n]').value.trim(),
            crop: cand && cand.image.crop ? core.effectiveCrop('B', cand.image, ctx, S.crops) : null, at: new Date().toISOString().slice(0, 10),
          };
        }
      }
      const ok = lsSet(LS.reviews, S.reviews);
      box.querySelector('[data-status]').textContent = (S.reviews[key] ? 'recorded' : 'removed') + (ok ? '' : ' (this browser blocked storage — use Review & export before leaving)');
    });
  }

  /* ---------- tabs ---------- */

  function mainEl() { return root.querySelector('.lab-body'); }

  function tripleCatalog(env) {
    return ['A', 'B', 'C'].map(s => {
      const res = core.resolve(s, env, 'catalog');
      return `<div class="lab-col">${colHead(s, res)}<div class="grid" style="grid-template-columns:minmax(0,1fr)">${cardFor(env, s, { eager: true })}</div><div class="lab-audit" data-audit></div></div>`;
    }).join('');
  }

  function renderCatalog() {
    const env = curEnv();
    const el = mainEl();
    el.innerHTML = `
      <section class="lab-sec"><h2>Selected environment — real card, three artwork strategies</h2>
        <p class="lab-note">The card is the production <code>cardHtml()</code> run from <code>js/app.js</code>; only the picture in <code>.card-art</code> differs. A is exactly what production draws.</p>
        ${diagnostics(env)}</section>
      <section class="lab-sec"><div class="lab-scroll"><div class="lab-triple" style="grid-template-columns:repeat(3,minmax(340px,1fr))" data-triple>${tripleCatalog(env)}</div></div></section>
      <section class="lab-sec"><h2>Artwork source × crop</h2>
        <p class="lab-note">Choose the candidate, then adjust its crop. The strip is shown at its real 95 px width; its height follows the card (≈249 px). A 16:9 master in this strip shows about a fifth of its width — x is the only axis that matters until you zoom.</p>
        <div data-cands>${candidatesHtml(env, 'catalog')}</div></section>
      <section class="lab-sec lab-two" style="align-items:start">${editorHtml('catalog')}<div data-diag>${diagZoomHtml(env, 'catalog')}</div></section>
      <section class="lab-sec">${reviewPanelHtml(env, 'catalog')}</section>
      <section class="lab-sec lab-grid-wrap"><h2>Whole-grid view</h2>${catalogGridControls()}<div data-grid></div></section>`;
    wireContext(el, env, 'catalog');
    el.querySelector('.lab-grid-wrap').addEventListener('click', e => {
      const b = e.target.closest('[data-gm]'); if (!b) return;
      S.gridMode = b.dataset.gm; saveUi();
      el.querySelectorAll('[data-gm]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.gm === S.gridMode)));
      renderCatalogGrid();
    });
    el.querySelector('[data-group]').addEventListener('change', e => { S.group = e.target.value; saveUi(); renderCatalogGrid(); });
    renderCatalogGrid();
    fillAudits(el);
  }

  function wireContext(el, env, ctx) {
    const refresh = () => {
      if (ctx === 'catalog') {
        el.querySelector('[data-triple]').innerHTML = tripleCatalog(env);
      } else {
        el.querySelector('[data-triple]').innerHTML = triplePrep(env);
        const lists = el.querySelector('[data-lists]'); if (lists) lists.innerHTML = prepListsHtml(env);
      }
      el.querySelector('[data-cands]').innerHTML = candidatesHtml(env, ctx);
      el.querySelector('[data-diag]').innerHTML = diagZoomHtml(env, ctx);
      afterCands();
      if (ctx === 'catalog') renderCatalogGrid();
      fillAudits(el);
    };
    const afterCands = () => {
      const c = currentCandidate(env, ctx);
      const host = el.querySelector('[data-pix]');
      if (c && host) pixelZoom(host, c, ctx, ctx === 'catalog' ? 2 : 4);
    };
    const editor = el.querySelector(`[data-editor="${ctx}"]`);
    const syncEditor = wireEditor(editor, ctx, env, refresh);
    el.querySelector('[data-cands]').addEventListener('change', e => {
      if (e.target.name !== 'cand-' + ctx) return;
      S.cand[ctx] = e.target.value;
      refresh();
      syncEditor();
    });
    wireReview(el.querySelector(`[data-review="${ctx}"]`), env, ctx);
    afterCands();
  }

  /* --- catalog grid --- */
  function catalogGridControls() {
    const groups = core.sampleGroups('catalog');
    const opts = [`<option value="mixed">Mixed sample (all groups)</option>`].concat(groups.map(g => `<option value="${g.id}" ${S.group === g.id ? 'selected' : ''}>${esc(g.label)} (${g.envIds.length})</option>`)).join('');
    return `<div class="lab-row">
      <select data-group style="width:auto">${opts.replace(`value="mixed"`, `value="mixed" ${S.group === 'mixed' ? 'selected' : ''}`)}</select>
      ${['A', 'B', 'C'].map(s => `<button class="lab-btn" data-gm="${s}" aria-pressed="${S.gridMode === s}">${Core.STRATEGIES[s].label}</button>`).join('')}
      <button class="lab-btn" data-gm="tri" aria-pressed="${S.gridMode === 'tri'}">Triptych strips</button>
      <span class="lab-audit">Switch between A/B/C to see what a whole page of cards feels like, or use the triptych to compare strips row by row.</span></div>`;
  }
  function gridEnvs() {
    const groups = core.sampleGroups('catalog');
    if (S.group === 'mixed') {
      const seen = new Set(); const out = [];
      groups.forEach(g => g.envIds.slice(0, 4).forEach(id => { if (!seen.has(id)) { seen.add(id); out.push(core.byId.get(id)); } }));
      return out;
    }
    const g = groups.find(x => x.id === S.group);
    return g ? g.envIds.map(id => core.byId.get(id)) : [];
  }
  function renderCatalogGrid() {
    const host = mainEl().querySelector('[data-grid]'); if (!host) return;
    const envs = gridEnvs();
    if (S.gridMode === 'tri') {
      envs.length = Math.min(envs.length, 18);
      host.innerHTML = `<div class="lab-tri-strip"><b>Environment</b><b>A</b><b>B</b><b>C</b>${envs.map(env => `
        <div><div>${esc(core.byId.get(env.id).name.en)}</div><div class="lab-audit">${['A', 'B', 'C'].map(s => core.resolve(s, env, 'catalog').source + (core.resolve(s, env, 'catalog').fit ? '/' + core.resolve(s, env, 'catalog').fit : '')).join(' · ')}</div></div>
        ${['A', 'B', 'C'].map(s => `<div style="display:flex;height:249px;position:relative;overflow:hidden;background:var(--ink-raised)">${artFor(env, s, 'catalog', { eager: false })}</div>`).join('')}`).join('')}</div>`;
      return;
    }
    const strategy = S.gridMode;
    setSeams(strategy, {});
    host.innerHTML = `<div class="grid">${envs.map(e => bridge.cardHtml(e)).join('')}</div>`;
  }

  /* --- prep --- */
  function triplePrep(env) {
    const pair = s => `<div class="lab-sublabel">selected</div>${rowFor(env, s, [env.id], { eager: true })}<div class="lab-sublabel">not selected</div>${rowFor(env, s, [], { eager: true })}`;
    return ['A', 'B', 'C'].map(s => {
      const res = core.resolve(s, env, 'prep');
      return `<div class="lab-col">${colHead(s, res)}<div class="lab-prep-col">${pair(s)}</div><div class="lab-audit" data-audit-skip></div></div>`;
    }).join('');
  }
  function prepOrder() {
    const collator = new Intl.Collator(S.lang, { sensitivity: 'base', numeric: true });
    return core.envs.slice().sort((a, b) => a.tier - b.tier || collator.compare(a.name[S.lang] || a.name.en, b.name[S.lang] || b.name.en));
  }
  function prepListEnvs(env) {
    if (S.prepList === 'archetype') {
      const id = core.resolveB(env, 'prep').identity;
      const same = prepOrder().filter(e => core.resolveB(e, 'prep').identity === id);
      return same.slice(0, 24);
    }
    if (S.prepList === 'window') {
      const order = prepOrder(); const i = order.findIndex(e => e.id === env.id);
      const start = Math.max(0, Math.min(order.length - 28, i - 4));
      return order.slice(start, start + 28);
    }
    const seen = new Set(); const out = [];
    core.sampleGroups('prep').forEach(g => g.envIds.slice(0, 3).forEach(id => { if (!seen.has(id)) { seen.add(id); out.push(core.byId.get(id)); } }));
    return out.slice(0, 28);
  }
  function prepListsHtml(env) {
    const list = prepListEnvs(env);
    const checked = [list[1], list[Math.floor(list.length / 2)], list[list.length - 3]].filter(Boolean).map(e => e.id);
    return ['A', 'B', 'C'].map(s => {
      const rep = core.repetition(list, s, 'prep');
      return `<div class="lab-col"><div class="lab-colhead">${Core.STRATEGIES[s].label} <span class="lab-chip">${rep.distinct} distinct pictures · ${rep.adjacentSame} adjacent repeats · longest run ${rep.maxRun}</span></div>
        <div class="lab-prep-col">${list.map(e => rowFor(e, s, checked, {})).join('')}</div></div>`;
    }).join('');
  }
  function renderPrep() {
    const env = curEnv(); const el = mainEl();
    el.innerHTML = `
      <section class="lab-sec"><h2>Selected environment — real picker rows, three artwork strategies</h2>
        <p class="lab-note">Rows are the production <code>envPickerRowHtml()</code>; checkbox, title, tier · type · biome line and spacing are untouched. Only the 48×48 tile differs. Production (A) uses a tile pre-cut to 48/96/144 px; B and C downscale the 320 px cut in the browser — the quality line under each tile says what actually happened.</p>
        ${diagnostics(env)}</section>
      <section class="lab-sec"><div class="lab-scroll"><div class="lab-triple" style="grid-template-columns:repeat(3,minmax(340px,1fr))" data-triple>${triplePrep(env)}</div></div></section>
      <section class="lab-sec"><h2>Artwork source × crop</h2>
        <p class="lab-note">A 16:9 master shows its middle 56% in a square tile; x picks which part. Zoom narrows it further.</p>
        <div data-cands>${candidatesHtml(env, 'prep')}</div></section>
      <section class="lab-sec lab-two" style="align-items:start">${editorHtml('prep')}<div data-diag>${diagZoomHtml(env, 'prep')}</div></section>
      <section class="lab-sec">${reviewPanelHtml(env, 'prep')}</section>
      <section class="lab-sec"><h2>Dense list simulation</h2>
        <div class="lab-row"><select data-plist style="width:auto">
          <option value="mixed" ${S.prepList === 'mixed' ? 'selected' : ''}>Mixed sample (every case)</option>
          <option value="window" ${S.prepList === 'window' ? 'selected' : ''}>Real order — 28 rows around the selected environment (tier, then name)</option>
          <option value="archetype" ${S.prepList === 'archetype' ? 'selected' : ''}>Repetition test — every environment sharing the selected picture under B</option></select>
          <span class="lab-audit">Up to 3 rows are checked (production cap); the rest are disabled exactly as production disables them.</span></div>
        <div class="lab-scroll"><div class="lab-triple" style="grid-template-columns:repeat(3,minmax(340px,1fr))" data-lists>${prepListsHtml(env)}</div></div></section>`;
    wireContext(el, env, 'prep');
    el.querySelector('[data-plist]').addEventListener('change', e => { S.prepList = e.target.value; saveUi(); el.querySelector('[data-lists]').innerHTML = prepListsHtml(env); });
    /* Prep audits sit under the selected-row columns: measure each column's first tile. */
    el.querySelectorAll('[data-audit-skip]').forEach(async node => {
      const img = node.parentElement.querySelector('img.prep-thumb');
      if (!img) { node.textContent = 'no picture drawn — production shows the hex icon'; return; }
      await whenLoaded([img]); const m = await measureImg(img);
      node.innerHTML = m.broken ? '<span class="bad">BROKEN image</span>' : `${esc(m.file)} · source ${m.nw}×${m.nh}px · drawn ${fmt(m.drawnW)} css px · DPR ${m.dpr} · ${m.upscaled ? `<span class="bad">upscaled ×${fmt(1 / m.ratio)}</span>` : `<span class="ok">sharp ${fmt(m.ratio)}×</span>`}`;
    });
  }

  /* --- stress --- */
  const STRESS_STRIP = ['starfaring', 'sky-realms', 'seafaring', 'arenas-and-duels', 'time-and-dream', 'planar-rifts', 'archives-and-libraries', 'taverns-and-inns', 'sinister-woods', 'drowned-depths'];
  const STRESS_THUMB = ['sky-realms', 'time-and-dream', 'arenas-and-duels', 'starfaring', 'drowned-depths', 'crypts-and-tombs', 'taverns-and-inns', 'monster-lairs', 'planar-rifts', 'haunted-and-deathly'];
  function stressStrip(a) {
    const image = Core.registryImage(Art, 'archetype:' + a);
    const reg = Core.normalizeCrop(image.regPos); const rv = core.reviewedCrop(image, 'catalog') || reg;
    const strip = c => `<div class="strip-host">${landscapeArt(image, 'catalog', c, { eager: true })}</div>`;
    const q = (core.reviewFor(image.id, 'catalog') || {});
    return `<div class="item"><b>${esc(core.taxonomyName.get(a) || a)}</b><div class="pair"><div>${strip(reg)}<div class="lab-audit">registry x${reg.x}</div></div><div>${strip(rv)}<div class="lab-audit">reviewed x${rv.x}</div></div></div>
      <div>${ratingPill(q.rating ? q : null)}</div><div class="q">${esc(q.note || '')}</div></div>`;
  }
  function stressThumb(a) {
    const image = Core.registryImage(Art, 'archetype:' + a);
    const reg = Core.normalizeCrop(image.regPos); const rv = core.reviewedCrop(image, 'prep') || reg;
    const q = core.reviewFor(image.id, 'prep') || {};
    const tile = c => `<div class="prep-row" style="padding:2px">${landscapeArt(image, 'prep', c, { eager: true })}</div>`;
    return `<div class="item"><b>${esc(core.taxonomyName.get(a) || a)}</b>
      <div class="pair"><div>${tile(reg)}<div class="lab-audit">registry x${reg.x}</div></div><div>${tile(rv)}<div class="lab-audit">reviewed x${rv.x}</div></div></div>
      <div data-pixhost="${a}"><div class="lab-dl">diagnostic zoom ×4</div><canvas class="lab-pix" data-a="${a}"></canvas></div>
      <div>${ratingPill(q.rating ? q : null)}</div><div class="q">${esc(q.note || '')}</div></div>`;
  }
  function renderStress() {
    const el = mainEl();
    el.innerHTML = `
      <section class="lab-sec"><h2>Very narrow images — the 95×249 Catalog strip</h2>
        <p class="lab-note">Each picture twice at real size: the registry crop that Strategy B starts from, and the lab's reviewed crop that Strategy C starts from. Ratings are the lab's provisional review (see report §8), not a validated classifier.</p>
        <div class="lab-stress">${STRESS_STRIP.map(stressStrip).join('')}</div></section>
      <section class="lab-sec"><h2>Small thumbnails — the 48×48 Prep tile</h2>
        <p class="lab-note">Real size, registry vs reviewed crop; the canvas below each pair is a ×4 diagnostic zoom of the reviewed crop's actual device pixels (not production rendering).</p>
        <div class="lab-stress sq">${STRESS_THUMB.map(stressThumb).join('')}</div></section>`;
    STRESS_THUMB.forEach(a => {
      const host = el.querySelector(`[data-pixhost="${a}"]`);
      const image = Core.registryImage(Art, 'archetype:' + a);
      pixelZoom(host, { image }, 'prep', 4);
      const cap = host.querySelector('.cap'); if (cap) cap.remove();
    });
  }

  /* --- library --- */
  function libraryEntries() {
    const out = Object.keys(Art.ARCHETYPES).map(a => ({ id: 'archetype:' + a, key: a }));
    Art.UNIQUE_ENV_IDS.forEach(e => out.push({ id: 'env:' + e, key: e }));
    Object.values(Art.ENV_IMAGE_OVERRIDES).forEach(id => { if (!out.some(o => o.id === id)) out.push({ id, key: id.replace(/^biome:/, 'settlement override · ') }); });
    return out;
  }
  function renderLibrary() {
    const el = mainEl();
    const tax = data.classification.environments;
    const tiles = libraryEntries().map(({ id, key }) => {
      const image = Core.registryImage(Art, id);
      if (!image) return `<div class="lab-tile"><h3>${esc(id)}</h3><b class="lab-pill-p">MISSING FROM REGISTRY</b></div>`;
      const eligible = core.envs.filter(e => { const a = core.authorised(e); return a && a.imageId === id; });
      const archetype = id.startsWith('archetype:') ? id.slice(10) : null;
      const primary = archetype ? tax.filter(r => r.primary_archetype === archetype) : [];
      const unmapped = primary.filter(r => !eligible.some(e => e.id === r.id));
      const reg = Core.normalizeCrop(image.regPos);
      const rvc = core.reviewFor(id, 'catalog'); const rvp = core.reviewFor(id, 'prep');
      const cc = core.reviewedCrop(image, 'catalog') || reg; const cp = core.reviewedCrop(image, 'prep') || reg;
      const small = image.sources.slice().sort((a, b) => a.w - b.w)[0];
      return `<div class="lab-tile" data-tile="${esc(id)}"><h3>${esc(archetype ? core.taxonomyName.get(archetype) || archetype : key)}</h3>
        <img class="full" loading="lazy" decoding="async" alt="" src="${image.sources[1] ? image.sources[1].path : small.path}">
        <div class="previews">
          <div><div class="lab-audit">Catalog 95×249</div><div class="frame" style="width:95px;height:249px">${landscapeArt(image, 'catalog', cc, { eager: false, frameStyle: 'margin:0;height:249px' })}</div></div>
          <div><div class="lab-audit">Prep 48×48</div><div style="display:flex;padding:2px">${landscapeArt(image, 'prep', cp, { eager: false })}</div>
            <div class="lab-audit" style="margin-top:8px">Catalog ${ratingPill(rvc)}<br>Prep ${ratingPill(rvp)}</div></div>
        </div>
        <dl><dt>Identity</dt><dd><code>${esc(id)}</code> · ${esc(image.kind)}</dd>
          <dt>Files</dt><dd>${image.sources.map(s => base(s.path)).join(' · ')}</dd>
          <dt>Eligible envs</dt><dd>${eligible.length}${eligible.length ? ' (' + eligible.filter(e => core.authorised(e).fit === 'strong').length + ' strong)' : ''}</dd>
          ${archetype ? `<dt>Taxonomy primary</dt><dd>${primary.length} · <b>${unmapped.length}</b> with no eligible mapping</dd>` : ''}
          <dt>Lab review</dt><dd>${rvc || rvp ? 'provisional (Claude visual pass)' : 'unreviewed'}</dd></dl></div>`;
    }).join('');
    el.innerHTML = `<section class="lab-sec"><h2>Complete artwork library — ${libraryEntries().length} registered pictures</h2>
      <p class="lab-note">All 28 archetypes, the three unique paintings and the one picture used by an explicit override. Previews use the optimized production cuts (<code>img/list-covers/*-{320,640,960}.avif</code>), never the PNG masters. "No eligible mapping" counts environments whose taxonomy primary archetype is this one but which <code>ARCHETYPE_FIT</code> deliberately does not authorise.</p>
      <div class="lab-lib">${tiles}</div></section>`;
  }

  /* --- summary --- */
  function pct(n, d) { return d ? Math.round(1000 * n / d) / 10 + '%' : '—'; }
  function covRows(cov) {
    const rows = [['unique painting', 'unique'], ['explicit override', 'override'], ['thematic archetype', 'archetype'], ['biome', 'biome'], ['no picture', 'none']];
    return rows.map(([label, k]) => `<tr><td>${label}</td>${['A', 'B', 'C'].map(s => `<td class="num">${cov[s].counts[k]}</td>`).join('')}</tr>`).join('');
  }
  function renderSummary() {
    const el = mainEl();
    const catC = core.coverage('catalog'); const prepC = core.coverage('prep');
    const order = prepOrder();
    const rep = (ctx, list) => ['A', 'B', 'C'].map(s => core.repetition(list, s, ctx));
    const catRep = rep('catalog', order); const catPage = rep('catalog', order.slice(0, 18)); const prepRep = rep('prep', order);
    const sm = Object.assign({ catalog: {}, prep: {} }, data.review.summary || {});
    const s = k => (ctx) => `<td>${esc((sm[ctx] && sm[ctx][k]) || 'not reviewed')}</td>`;
    const stats = data.stats;
    const cost = (ctx, st) => (stats && stats.delivery ? (() => { const d = stats.delivery[ctx][st]; return `${d.requests} files · ${(d.bytes / 1024).toFixed(0)} KB`; })() : 'run scripts/artwork-lab-v3-stats.js');
    el.innerHTML = `
      <section class="lab-sec"><h2>Quantitative coverage — recalculated from the current data</h2>
        <p class="lab-note">${core.envs.length} environments. Not the My Lists numbers: Catalog and Prep draw a biome picture for <i>every</i> environment (including universal and settlement), and neither draws a unique painting today. "Thematic" means the production registry authorises the picture (<code>ARCHETYPE_FIT</code> / unique / override). Strategy C's column is provisional: it applies the lab's per-picture, per-context review, not an environment-by-environment inspection.</p>
        <div class="lab-two">
          ${['catalog', 'prep'].map(ctx => { const cov = ctx === 'catalog' ? catC : prepC; return `<div class="lab-scroll"><table class="lab-table"><caption style="text-align:left;font-weight:600;padding:4px 0">${Core.CONTEXTS[ctx].label}</caption>
            <tr><th>Source of the picture drawn</th><th>A</th><th>B</th><th>C</th></tr>${covRows(cov)}
            <tr><td>Thematic total</td>${['A', 'B', 'C'].map(x => `<td class="num">${cov[x].thematic} (${pct(cov[x].thematic, cov.total)})</td>`).join('')}</tr>
            <tr><td>Biome retained</td>${['A', 'B', 'C'].map(x => `<td class="num">${cov[x].biomeRetained}</td>`).join('')}</tr>
            <tr><td>Eligible but C keeps biome</td><td class="num">—</td><td class="num">—</td><td class="num">${cov.C.downgradedToBiome} (reviewed ${cov.C.downgradeReviewStatus.reviewed}, unreviewed ${cov.C.downgradeReviewStatus.unreviewed})</td></tr>
            <tr><td>Registry-authorised thematic</td><td colspan="3">${cov.eligible.authorised} · not authorised ${cov.eligible.notAuthorised} · taxonomy-only (deliberately not authorised) ${cov.eligible.taxonomyOnlyNotAuthorised}</td></tr>
            <tr><td>Missing / invalid files</td><td colspan="3">checked in <code>scripts/artwork-lab-v3-stats.js</code> and the test suite${stats ? ': ' + stats.missingFiles : ''}</td></tr></table></div>`; }).join('')}
        </div></section>
      <section class="lab-sec"><h2>Comparison matrix</h2>
        <div class="lab-scroll"><table class="lab-table"><tr><th>Metric</th><th>A · Current Biome</th><th>B · Archetype First</th><th>C · Context Adaptive</th></tr>
          <tr><td>Artwork coverage — Catalog</td>${[0, 1, 2].map(i => `<td>${catC[['A', 'B', 'C'][i]].thematic} thematic / ${catC[['A', 'B', 'C'][i]].biomeRetained} biome / ${catC[['A', 'B', 'C'][i]].neutral} none</td>`).join('')}</tr>
          <tr><td>Artwork coverage — Prep</td>${[0, 1, 2].map(i => `<td>${prepC[['A', 'B', 'C'][i]].thematic} thematic / ${prepC[['A', 'B', 'C'][i]].biomeRetained} biome / ${prepC[['A', 'B', 'C'][i]].neutral} none</td>`).join('')}</tr>
          <tr><td>Semantically suitable</td><td>biome only: geography, never specific</td><td>explicit ARCHETYPE_FIT only</td><td>explicit ARCHETYPE_FIT only, plus frame review</td></tr>
          <tr><td>Catalog recognizability (reviewed)</td>${['A', 'B', 'C'].map(x => s(x)('catalog')).join('')}</tr>
          <tr><td>Prep recognizability (reviewed)</td>${['A', 'B', 'C'].map(x => s(x)('prep')).join('')}</tr>
          <tr><td>Repetitive thumbnails — Prep, full list in tier/name order (adjacent repeats · longest run · distinct)</td>${prepRep.map(r => `<td>${r.adjacentSame} (${r.adjacentSamePct}%) · ${r.maxRun} · ${r.distinct}</td>`).join('')}</tr>
          <tr><td>Repetitive strips — Catalog first page (18 cards)</td>${catPage.map(r => `<td>${r.adjacentSame} adjacent · ${r.maxRun} longest · ${r.distinct} distinct</td>`).join('')}</tr>
          <tr><td>Repetitive strips — Catalog whole list</td>${catRep.map(r => `<td>${r.adjacentSame} (${r.adjacentSamePct}%) · ${r.maxRun} · ${r.distinct}</td>`).join('')}</tr>
          <tr><td>Image delivery — Catalog, all ${core.envs.length} at DPR 1 / 2 (HEAD sizes, node)</td>${['A', 'B', 'C'].map(x => `<td>${stats && stats.deliveryDpr ? ['1', '2'].map(d => { const v = stats.deliveryDpr.catalog[d][x]; return `${v.requests}f ${Math.round(v.bytes / 1024)}KB`; }).join(' / ') : cost('catalog', x)}</td>`).join('')}</tr>
          <tr><td>Image delivery — Prep, all ${core.envs.length} at DPR 1 / 2</td>${['A', 'B', 'C'].map(x => `<td>${stats && stats.deliveryDpr ? ['1', '2'].map(d => { const v = stats.deliveryDpr.prep[d][x]; return `${v.requests}f ${Math.round(v.bytes / 1024)}KB`; }).join(' / ') : cost('prep', x)}</td>`).join('')}</tr>
        </table></div>
        <p class="lab-note">Subjective rows are the written review in <code>context-review.js</code> (provisional, one reviewer, to be confirmed by an art director) — never a computed score.</p></section>
      <section class="lab-sec"><h2>Image-quality audit in this browser</h2>
        <p class="lab-note">Renders every environment under all three strategies off-screen and measures what the browser really loaded: distinct files, bytes (HEAD), broken images, and any picture drawn larger than its source (upscaled) at the current device pixel ratio (${window.devicePixelRatio}).</p>
        <div class="lab-row"><button class="lab-btn" data-act="audit">Run audit (this DPR)</button></div><div data-audit-out class="lab-scroll"></div></section>`;
    el.querySelector('[data-act=audit]').addEventListener('click', async e => {
      e.target.disabled = true; e.target.textContent = 'Measuring…';
      const r = await auditAll();
      el.querySelector('[data-audit-out]').innerHTML = `<table class="lab-table"><tr><th>Context</th><th>Strategy</th><th>Distinct files</th><th>Bytes</th><th>Broken</th><th>Upscaled</th><th>Min sharpness</th></tr>${['catalog', 'prep'].map(ctx => ['A', 'B', 'C'].map(st => { const d = r.contexts[ctx][st]; return `<tr><td>${ctx}</td><td>${st}</td><td class="num">${d.requests}</td><td class="num">${(d.bytes / 1024).toFixed(0)} KB</td><td class="num">${d.broken}</td><td class="num">${d.upscaled}</td><td class="num">${d.minRatio == null ? '—' : fmt(d.minRatio) + '×'}</td></tr>`; }).join('')).join('')}</table>`;
      e.target.disabled = false; e.target.textContent = 'Run audit (this DPR)';
    });
  }

  /* --- review & export --- */
  function exportObject() {
    return core.buildExport({ reviews: S.reviews, crops: S.crops, lang: S.lang, generatedAt: new Date().toISOString() });
  }
  function renderReview() {
    const el = mainEl();
    const rows = Object.values(S.reviews).sort((a, b) => (a.envId + a.ctx < b.envId + b.ctx ? -1 : 1));
    el.innerHTML = `<section class="lab-sec"><h2>Recorded judgements (${rows.length})</h2>
      <p class="lab-note">Stored only in this browser under <code>labv3:*</code> keys; never read by the app, never written into a list. Export is always available even if storage is blocked.</p>
      <div class="lab-scroll"><table class="lab-table"><tr><th>Environment</th><th>Context</th><th>Judgement</th><th>Notes</th><th>Crop</th><th></th></tr>
      ${rows.map(r => `<tr><td><a href="#" data-go="${esc(r.envId)}">${esc((core.byId.get(r.envId) || { name: { en: r.envId } }).name.en)}</a><br><code>${esc(r.envId)}</code></td><td>${r.ctx}</td><td>${esc((Core.JUDGEMENTS.find(j => j.id === r.judgement) || {}).label || r.judgement)}</td><td>${esc(r.notes)}</td><td>${r.crop ? `x${r.crop.x} y${r.crop.y} ×${r.crop.zoom}` : '—'}</td><td><button class="lab-btn" data-del="${esc(r.envId + '|' + r.ctx)}">Remove</button></td></tr>`).join('') || '<tr><td colspan="6">Nothing recorded yet.</td></tr>'}
      </table></div></section>
      <section class="lab-sec"><h2>Export</h2>
        <div class="lab-row"><button class="lab-btn" data-act="copy">Copy review JSON</button><button class="lab-btn" data-act="dl">Download review JSON</button><button class="lab-btn" data-act="clearcrops">Clear all crop experiments</button></div>
        <textarea readonly style="height:260px;font-family:var(--font-mono,monospace)" data-json></textarea></section>`;
    const ta = el.querySelector('[data-json]'); ta.value = JSON.stringify(exportObject(), null, 2);
    el.addEventListener('click', e => {
      const t = e.target;
      if (t.dataset.go) { e.preventDefault(); selectEnv(t.dataset.go); setTab('catalog'); }
      if (t.dataset.del) { delete S.reviews[t.dataset.del]; lsSet(LS.reviews, S.reviews); renderReview(); }
      if (t.dataset.act === 'copy') copy(ta.value, t);
      if (t.dataset.act === 'clearcrops') { S.crops = { catalog: {}, prep: {} }; lsSet(LS.crops, S.crops); renderReview(); }
      if (t.dataset.act === 'dl') {
        try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ta.value], { type: 'application/json' })); a.download = 'artwork-lab-v3-review.json'; a.click(); } catch (err) { t.textContent = 'Download blocked — use Copy'; }
      }
    });
  }

  /* ---------- shell ---------- */

  function envVisible(env) {
    const f = S.filters; const q = S.search.trim().toLowerCase();
    if (q) {
      const hint = core.taxonomyHint(env);
      const hay = [env.id, env.name.en, env.name.ru, (env.biomes || []).join(' '), 'tier ' + env.tier, hint.primary, hint.authorisedArchetype, ...(hint.secondary || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.biome && !(env.biomes || []).includes(f.biome)) return false;
    if (f.tier && String(env.tier) !== f.tier) return false;
    if (f.archetype) { const h = core.taxonomyHint(env); if (h.primary !== f.archetype && h.authorisedArchetype !== f.archetype) return false; }
    if (f.art) {
      const b = core.resolveB(env, 'catalog'); const c = core.resolveC(env, 'catalog');
      const ok = { unique: b.source === 'unique', strong: b.fit === 'strong', acceptable: b.fit === 'acceptable', 'biome-only': b.source === 'biome', 'c-keeps-biome': !!c.rejectedImageId, 'taxonomy-only': core.taxonomyHint(env).status === 'taxonomy-only-not-authorised' }[f.art];
      if (!ok) return false;
    }
    return true;
  }
  function renderSide() {
    const side = root.querySelector('.lab-side');
    const archetypes = Object.keys(Art.ARCHETYPES);
    const biomes = bridge.BIOMES;
    side.innerHTML = `<h1>Artwork Lab V3</h1><div class="lab-sub">Catalog &amp; Session Prep · dev-only · ${core.envs.length} environments</div>
      <div class="lab-filters">
        <input type="search" placeholder="Search name, id, biome, tier, archetype" value="${esc(S.search)}" data-search>
        <select data-f="biome"><option value="">any biome</option>${biomes.map(b => `<option ${S.filters.biome === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
        <select data-f="tier"><option value="">any tier</option>${[1, 2, 3, 4].map(t => `<option ${S.filters.tier === String(t) ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select data-f="archetype" style="grid-column:1/-1"><option value="">any archetype</option>${archetypes.map(a => `<option value="${a}" ${S.filters.archetype === a ? 'selected' : ''}>${esc(core.taxonomyName.get(a) || a)}</option>`).join('')}</select>
        <select data-f="art" style="grid-column:1/-1"><option value="">any artwork availability</option>
          ${[['unique', 'unique painting'], ['strong', 'strong thematic match'], ['acceptable', 'acceptable thematic match'], ['biome-only', 'biome only (B)'], ['c-keeps-biome', 'eligible, but C keeps biome'], ['taxonomy-only', 'taxonomy-only (not authorised)']].map(([v, l]) => `<option value="${v}" ${S.filters.art === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div><div class="lab-envlist" data-list></div>`;
    renderEnvList();
    side.querySelector('[data-search]').addEventListener('input', e => { S.search = e.target.value; renderEnvList(); });
    side.querySelectorAll('[data-f]').forEach(sel => sel.addEventListener('change', e => { S.filters[e.target.dataset.f] = e.target.value; renderEnvList(); }));
  }
  function renderEnvList() {
    const list = root.querySelector('[data-list]');
    const order = prepOrder().filter(envVisible);
    list.innerHTML = order.map(env => {
      const b = core.resolveB(env, 'catalog');
      const badge = b.source === 'unique' ? '<span class="b u">unique</span>' : b.fit ? `<span class="b a">${b.fit === 'strong' ? 'strong' : 'accept.'}</span>` : '<span class="b s">biome</span>';
      return `<button class="lab-env" data-env="${esc(env.id)}" aria-current="${env.id === S.envId}"><span class="t">${esc(EnvTierUtils.tierLabel(env))}</span><span class="n">${esc(env.name[S.lang] || env.name.en)}</span>${badge}</button>`;
    }).join('') || '<div style="padding:14px;color:var(--muted)">No environment matches.</div>';
    list.querySelectorAll('[data-env]').forEach(b => b.addEventListener('click', () => selectEnv(b.dataset.env)));
  }
  function selectEnv(id) {
    S.envId = id; writeHash();
    root.querySelectorAll('.lab-env').forEach(b => b.setAttribute('aria-current', String(b.dataset.env === id)));
    updateCur(); renderMain();
  }
  function setTab(tab) {
    S.tab = tab; writeHash();
    root.querySelectorAll('.lab-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    renderMain();
  }
  function updateCur() {
    const env = curEnv();
    const cur = root.querySelector('.lab-cur');
    cur.innerHTML = `<span>Environment: <b>${esc(env.name[S.lang] || env.name.en)}</b> <code>${esc(env.id)}</code></span><span>DPR <b>${window.devicePixelRatio}</b> · viewport <b>${window.innerWidth}×${window.innerHeight}</b></span>
      <button class="lab-btn" data-lang aria-pressed="${S.lang === 'ru'}">${S.lang === 'ru' ? 'RU' : 'EN'}</button><button class="lab-btn" data-side>${S.side ? 'Hide list' : 'Show list'}</button>`;
    cur.querySelector('[data-lang]').addEventListener('click', () => { S.lang = S.lang === 'en' ? 'ru' : 'en'; bridge.state.lang = S.lang; writeHash(); renderEnvList(); updateCur(); renderMain(); });
    cur.querySelector('[data-side]').addEventListener('click', () => { S.side = !S.side; saveUi(); applySide(); updateCur(); });
  }
  function applySide() { root.querySelector('.lab-shell').style.gridTemplateColumns = S.side ? '280px minmax(0,1fr)' : '0 minmax(0,1fr)'; root.querySelector('.lab-side').style.display = S.side ? '' : 'none'; }
  function renderMain() {
    const fns = { summary: renderSummary, catalog: renderCatalog, prep: renderPrep, stress: renderStress, library: renderLibrary, review: renderReview };
    (fns[S.tab] || renderCatalog)();
  }

  function shell() {
    root.innerHTML = `<div class="lab-shell"><aside class="lab-side"></aside><main class="lab-main">
      <div class="lab-top"><div class="lab-tabs" role="tablist">${TABS.map(([id, label]) => `<button class="lab-tab" role="tab" data-tab="${id}" aria-selected="${id === S.tab}">${label}</button>`).join('')}</div><div class="lab-cur"></div></div>
      <div class="lab-body"></div></main></div>`;
    root.querySelectorAll('.lab-tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    renderSide(); updateCur(); applySide(); renderMain();
  }

  /* The cards carry real production links and buttons; nothing in the lab may navigate or act. */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/"], .card-open');
    if (a) e.preventDefault();
  }, true);
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const order = prepOrder().filter(envVisible); const i = order.findIndex(x => x.id === S.envId);
      const next = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { e.preventDefault(); selectEnv(next.id); const b = root.querySelector(`.lab-env[data-env="${CSS.escape(next.id)}"]`); if (b) b.scrollIntoView({ block: 'nearest' }); }
    }
  });

  /* ---------- boot ---------- */
  async function getJson(p, optional) {
    try { const r = await fetch(p); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (e) { if (optional) return null; throw e; }
  }
  async function boot() {
    const [envs, i18n, regions, classification, appSource, stats] = await Promise.all([
      getJson('data/environments.json'), getJson('data/i18n.json'), getJson('data/regions.json'),
      getJson('docs/research/lists-cover-classification.json'), fetch('js/app.js').then(r => r.text()),
      getJson('docs/research/artwork-lab-v3/stats.json', true),
    ]);
    const h = readHash(); const ui = lsGet(LS.ui, {});
    bridge = window.ArtworkLabBridge.load(appSource, { EnvTierUtils: window.EnvTierUtils, PrepUtils: window.PrepUtils, RouteUtils: window.RouteUtils }, { i18n, regions: regions.regions, lang: h.lang === 'ru' ? 'ru' : 'en' });
    core = Core.create({ envs: envs.environments, art: Art, coverUtils: window.ListCoverUtils, artBiome: bridge.artBiome, review: window.ArtworkLabReview, classification });
    data = { classification, review: window.ArtworkLabReview, stats };
    const first = core.envs.find(e => e.id === 'sky-realms') || core.envs.find(e => core.resolveB(e, 'catalog').fit === 'strong') || core.envs[0];
    const crops = lsGet(LS.crops, null);
    S = {
      tab: TABS.some(t => t[0] === h.tab) ? h.tab : 'summary', envId: core.byId.has(h.env) ? h.env : first.id, lang: h.lang === 'ru' ? 'ru' : 'en',
      search: '', filters: { biome: '', tier: '', archetype: '', art: '' }, crops: crops && crops.catalog && crops.prep ? crops : { catalog: {}, prep: {} },
      cand: { catalog: null, prep: null }, reviews: lsGet(LS.reviews, {}), side: ui.side !== false, gridMode: ui.gridMode || 'A', group: ui.group || 'mixed', prepList: ui.prepList || 'mixed',
    };
    window.__lab = { get core() { return core; }, get state() { return S; }, bridge, auditAll };
    shell();
  }
  boot().catch(err => { root.innerHTML = `<p class="lab-loading" style="color:#ef8b8b">Artwork Lab failed to start: ${esc(err && err.message)}. Serve the repository root over HTTP (e.g. <code>python3 -m http.server</code>) and open /lab/artwork-v3/.</p>`; console.error(err); });
})();
