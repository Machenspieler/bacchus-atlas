/* ============================================================
   Semantic Artwork Reuse Lab — lab-ui.js  (DEV-ONLY; lab/ is excluded from dist/)
   Browser side. Reads the repo's real data, renders the PRODUCTION card and picker-row templates
   (through lab/artwork-v3/prod-bridge.js) and swaps only the picture. Persists nothing but
   "labsr:*" localStorage keys; never reads or writes a dhcodex_* key and never fetches the app.
   Reach it at /lab/semantic-reuse/ on any static server.
   ============================================================ */
(function () {
  'use strict';
  const Core = window.SemanticReuseCore;
  const DataV1 = window.SemanticReuseData;
  /* Pilot: V1 (default, the published six sources) or V2 (#pilot=v2, three more sources). Same lab, same rules; separate data, storage and results. */
  const PILOT = new URLSearchParams(location.hash.replace(/^#/, '')).get('pilot') === 'v2' && window.SemanticReuseDataV2 ? 'v2' : 'v1';
  const DataV2 = window.SemanticReuseDataV2;
  const Data = PILOT === 'v2' ? Object.assign({}, DataV1, { PILOT_SOURCES: DataV2.PILOT_SOURCES, REGIONS: DataV2.REGIONS, MAPPINGS: DataV2.MAPPINGS }) : DataV1;
  const Art = window.ListCoverArt;
  const root = document.getElementById('lab-root');
  const RES = PILOT === 'v2' ? DataV2.RESULTS_DIR : 'docs/research/semantic-artwork-reuse-lab-v1/';

  const LS = PILOT === 'v2' ? { regions: 'labsr:v2:regions', mappings: 'labsr:v2:mappings', ui: 'labsr:v2:ui' } : { regions: 'labsr:regions', mappings: 'labsr:mappings', ui: 'labsr:ui' };
  const lsGet = (k, fb) => { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
  const lsSet = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const TABS = [['editor', 'Source & regions'], ['contexts', 'Context previews'], ['match', 'Environment matching'], ['coverage', 'Coverage'], ['library', 'Library scan · 28'], ['assets', 'Derivatives'], ['export', 'Review & export']].concat(PILOT === 'v2' ? [['sheet', 'Comparison sheet']] : []);
  const STATUS_LABEL = { proposed: 'Proposed', approved: 'Approve', rejected: 'Reject', 'needs-better-crop': 'Needs better crop', 'insufficient-resolution': 'Insufficient resolution', 'too-complex': 'Too visually complex', 'not-independently-meaningful': 'Not independently meaningful' };
  const REVIEW_LABEL = { strong: 'Strong', acceptable: 'Acceptable', rejected: 'Rejected', 'needs-review': 'Needs review' };

  let S; let inventory; let stats; let manifest; let envs; let byEnv; let classification; let primary; let secondary; let baseline; let prod;

  /* ---------- state ---------- */
  function hashState() { const p = new URLSearchParams(location.hash.replace(/^#/, '')); return { pilot: p.get('pilot'), tab: p.get('tab'), source: p.get('source'), region: p.get('region'), env: p.get('env'), ctx: p.get('ctx') }; }
  function writeHash() { try { history.replaceState(null, '', location.pathname + '#' + new URLSearchParams({ pilot: PILOT, tab: S.tab, source: S.sourceId, region: S.regionId || '', env: S.envId || '', ctx: S.ctx }).toString()); } catch (e) { /* ignore */ } }
  const regionsAll = () => S.regions;
  const regionById = id => S.regions.find(r => r.id === id);
  const curRegion = () => regionById(S.regionId);
  const srcMeta = id => inventory[id];
  const px = r => Core.boundsToPixels(r.bounds, srcMeta(r.sourceId));
  function persist() { lsSet(LS.regions, S.regions); lsSet(LS.mappings, S.mappings); }
  const sourcesMap = () => { const o = {}; Object.keys(inventory).forEach(k => { if (inventory[k].available) o[k] = { path: inventory[k].path, width: inventory[k].width, height: inventory[k].height, format: inventory[k].format, bytes: inventory[k].bytes }; }); return o; };
  const exportInput = () => ({ regions: S.regions, mappings: S.mappings, sources: sourcesMap(), envIds: envs.map(e => e.id), baseline, primaryArchetype: primary, generated: new Date().toISOString().slice(0, 10) });

  /* ---------- frames: one region in one box, from the master, the 960 derivative or a pre-generated file ---------- */
  function frameImgStyle(r, ctx, mode) {
    const box = Core.CONTEXTS[ctx].box; const m = srcMeta(r.sourceId); const p = px(r);
    const fr = Core.contextFraming(r, ctx, p); const win = Core.frameWindow(p, box, fr);
    const scale = box.w / win.w;
    return { fr, win, style: `left:${(-(p.x + win.x) * scale).toFixed(2)}px;top:${(-(p.y + win.y) * scale).toFixed(2)}px;width:${(m.width * scale).toFixed(2)}px;height:${(m.height * scale).toFixed(2)}px;` };
  }
  function derivFiles(r, ctx) { return manifest.filter(f => f.regionId === r.id && f.ctx === ctx && f.format === 'avif'); }
  /** The <img> (with its own positioning style) a region draws in a frame. mode: master | A | B */
  function regionImg(r, ctx, mode) {
    const box = Core.CONTEXTS[ctx].box; const m = srcMeta(r.sourceId);
    if (mode === 'B') {
      const f = derivFiles(r, ctx); const f1 = f.find(x => x.dpr === 1); const f2 = f.find(x => x.dpr === 2);
      if (f1 && f2) return `<img src="${f1.path}" srcset="${f1.path} 1x, ${f2.path} 2x" alt="" style="left:0;top:0;width:${box.w}px;height:${box.h}px" data-mode="B">`;
    }
    const g = frameImgStyle(r, ctx, mode);
    if (mode === 'A') {
      const img = Art.IMAGES['archetype:' + r.sourceId];
      if (img) { const need = Math.ceil(m.width * (box.w / g.win.w)); const pick = img.avif.find(a => a.w >= need) || img.avif[img.avif.length - 1];
        return `<img src="${pick.path}" srcset="${img.avif.map(a => `${a.path} ${a.w}w`).join(', ')}" sizes="${Math.ceil(m.width * box.w / g.win.w)}px" alt="" style="${g.style}" data-mode="A">`; }
    }
    return `<img src="${m.path}" alt="" style="${g.style}" data-mode="master">`;
  }
  function frameHtml(r, ctx, mode, cls) {
    const box = Core.CONTEXTS[ctx].box;
    return `<div class="sr-frame ${cls || ''}" style="width:${box.w}px;height:${box.h}px" data-region="${esc(r.id)}" data-ctx="${ctx}">${regionImg(r, ctx, mode)}</div>`;
  }

  /* ---------- the production artwork each frame shows today ---------- */
  function stripHtml(avifSet, fallback, inner) {
    const avif = avifSet.map(a => `${a.path} ${a.w}w`).join(', ');
    return `<div class="card-art" style="overflow:hidden"><picture><source type="image/avif" sizes="(max-width: 640px) 88px, 95px" srcset="${avif}"><img src="${fallback}" alt="" loading="eager" decoding="async"></picture></div>`;
  }
  /* A copy of js/app.js catalogArtHtml (PD-089), kept in step by tests/semantic-reuse-lab.test.js. */
  function productionCatalogArt(env) {
    const art = window.CatalogArt.resolveCatalogArt(env);
    if (art.kind === 'biome') return prod.prodBiomeArtHtml(env).replace('loading="lazy"', 'loading="eager"');
    if (art.kind === 'override') return stripHtml(prod.ART_WIDTHS.map(w => ({ path: `img/biomes/settlement-${w}.avif`, w })), 'img/biomes/settlement-200.webp');
    const f = window.CatalogArt.files(window.CatalogArt.PICTURES[art.imageId].stem);
    return stripHtml(f.avif, f.fallback);
  }
  /** B: the whole archetype picture where the registry already authorises it (never a new authorisation). */
  function fullArchetypeImage(env) { const r = window.ListCoverUtils.resolveEnvironmentArt({ id: env.id, artBiome: prod.artBiome(env) }, Art); return r && r.kind !== 'biome' ? Art.IMAGES[r.imageId] : null; }
  function wholePictureCatalog(img) {
    const f = img.id.startsWith('archetype:') && window.CatalogArt.PICTURES[img.id] ? window.CatalogArt.files(window.CatalogArt.PICTURES[img.id].stem) : null;
    return f ? stripHtml(f.avif, f.fallback) : `<div class="card-art"><img src="${img.fallback}" alt="" style="object-fit:cover;object-position:${img.pos[1].x}% ${img.pos[1].y}%"></div>`;
  }

  /* ---------- real production components with the picture swapped ---------- */
  function cardWith(env, artHtml) { prod.hooks.catalogArt = () => artHtml; prod.hooks.prepThumb = null; return `<div class="grid sr-card">${prod.cardHtml(env)}</div>`; }
  function rowWith(env, thumbHtml) { prod.hooks.prepThumb = () => thumbHtml; prod.hooks.catalogArt = null; return prod.envPickerRowHtml(env, { environmentIds: [] }); }
  const cardRegion = (env, r, mode) => cardWith(env, `<div class="card-art" style="overflow:hidden">${regionImg(r, 'catalog', mode)}</div>`);
  const rowRegion = (env, r, mode) => rowWith(env, `<span class="prep-thumb sr-frame" style="display:block;position:relative;overflow:hidden;width:48px;height:48px">${regionImg(r, 'prep', mode)}</span>`);
  function coverHtml(r, layout, mode) {
    const ctx = 'lists' + layout; const companions = ['archetype:forgotten-ruins', 'biome:forest'].map(id => Art.IMAGES[id]);
    const tile = img => { const p = img.pos[layout]; return `<picture><img src="${img.fallback}" alt="" style="position:static;width:100%;height:100%;object-fit:cover;object-position:${p.x}% ${p.y}%"></picture>`; };
    const tiles = [`<picture>${regionImg(r, ctx, mode)}</picture>`].concat(companions.slice(0, layout - 1).map(tile));
    return `<div class="list-card-cover sr-cover" style="width:${Math.round(318 - (3 - layout) * 0)}px">${tiles.join('')}</div>`;
  }

  /* ---------- views ---------- */
  function shell(body) {
    root.innerHTML = `<div class="lab-main" style="padding-top:0"><div class="lab-top"><b style="font-size:15px">Semantic Artwork Reuse Lab</b>
      <div class="lab-tabs" role="tablist">${TABS.map(([id, label]) => `<button class="lab-tab" role="tab" aria-selected="${S.tab === id}" data-tab="${id}">${label}</button>`).join('')}</div>
      <div class="lab-cur">dev-only · research · no production change · pilot <button class="lab-btn${PILOT === 'v1' ? ' on' : ''}" data-act="pilot" data-pilot="v1">V1 · 6 sources</button><button class="lab-btn${PILOT === 'v2' ? ' on' : ''}" data-act="pilot" data-pilot="v2">V2 · 3 sources</button> <button class="lab-btn" data-act="reset-data">Reset to curated data</button></div></div>
      <div class="lab-body">${body}</div></div>`;
  }

  function viewEditor() {
    const regs = S.regions.filter(r => r.sourceId === S.sourceId); const r = curRegion(); const m = srcMeta(S.sourceId);
    const srcList = Object.keys(Data.MASTER_FILES).concat(Object.keys(Data.EXTRA_MASTERS)).map(id => {
      const n = S.regions.filter(x => x.sourceId === id).length; const pilot = Data.PILOT_SOURCES.includes(id);
      return `<button data-source="${id}" aria-current="${id === S.sourceId}"><span class="n">${id}</span>${pilot ? '<span class="lab-chip u">pilot</span>' : ''}<span class="c">${n || ''}</span></button>`;
    }).join('');
    const status = r ? Core.REGION_STATUSES.map(s => `<option value="${s}"${r.status === s ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('') : '';
    const pxr = r ? px(r) : null;
    return `<div class="sr-grid">
      <div><div class="lab-sublabel">Sources · 28 masters + 1 unused variant</div><div class="sr-src">${srcList}</div></div>
      <div>
        <div class="sr-bar"><button class="lab-btn${S.drawing ? ' on' : ''}" data-act="new-region">New region</button><button class="lab-btn" data-act="dup-region"${r ? '' : ' disabled'}>Duplicate</button><button class="lab-btn" data-act="del-region"${r ? '' : ' disabled'}>Delete</button>
          <span class="sp"></span><button class="lab-btn" data-act="zoom-out" aria-label="Zoom out">−</button><output id="sr-zoom">${S.view.scale.toFixed(2)}×</output><button class="lab-btn" data-act="zoom-in" aria-label="Zoom in">+</button><button class="lab-btn" data-act="reset-view">Reset viewport</button>
          <label style="font-size:12px"><input type="checkbox" data-act="toggle-tags"${S.tags ? ' checked' : ''}> bounds</label></div>
        <div class="sr-viewer${S.drawing ? ' drawing' : ''}" id="sr-viewer" tabindex="0" aria-label="Source viewer: wheel zooms, drag pans, arrow keys nudge the selected region (Shift = ×5, Alt = resize)"><div class="sr-world" id="sr-world"></div></div>
        <p class="lab-note" style="margin-top:6px">${esc(S.sourceId)} · ${m.width}×${m.height} ${m.format} · ${(m.bytes / 1048576).toFixed(2)} MB · <code>${esc(m.path)}</code>${m.productionPicture ? ' · production archetype picture' : ' · not a production picture'}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="sr-panel"><b>Regions on ${esc(S.sourceId)}</b><div class="sr-regions">${regs.map(x => `<button data-region="${esc(x.id)}" aria-current="${x.id === S.regionId}"><span class="sr-dot" data-status="${x.status}"></span>${esc(x.label)}</button>`).join('') || '<i style="color:var(--muted)">none — click New region and drag on the image</i>'}</div></div>
        ${r ? `<div class="sr-panel" id="sr-meta"><b>${esc(r.id)}</b>
          <label>Name <input type="text" data-f="label" value="${esc(r.label)}"></label>
          <label>Visible <textarea data-f="description">${esc(r.description)}</textarea></label>
          <label>Review <select data-f="status">${status}</select></label>
          <label>Notes <textarea data-f="notes">${esc(r.notes || '')}</textarea></label>
          <div class="sr-nums">${['x', 'y', 'width', 'height'].map(k => `<label>${k}<input type="text" data-b="${k}" value="${r.bounds[k]}"></label>`).join('')}</div>
          <div id="sr-px" style="font-family:var(--font-mono,monospace);font-size:11.5px;color:var(--muted)">${pxr.w}×${pxr.h}px at (${pxr.x}, ${pxr.y}) · parent ${esc(r.sourceId)}</div>
          <div id="sr-prevmini" style="overflow:auto">${miniPreview(r)}</div></div>` : '<div class="sr-panel">Select or draw a region.</div>'}
      </div></div>`;
  }
  function miniPreview(r) {
    const p = px(r); const w = 300; const h = Math.round(w * p.h / p.w);
    return `<div class="sr-frame" style="width:${w}px;height:${Math.min(h, 260)}px"><img src="${srcMeta(r.sourceId).path}" alt="" style="left:${-p.x * w / p.w}px;top:${-p.y * w / p.w}px;width:${srcMeta(r.sourceId).width * w / p.w}px;height:${srcMeta(r.sourceId).height * w / p.w}px"></div>`;
  }
  function paintWorld() {
    const vw = document.getElementById('sr-viewer'); const world = document.getElementById('sr-world'); if (!vw) return;
    const m = srcMeta(S.sourceId); const fitW = vw.clientWidth; const fit = { w: fitW, h: fitW * m.height / m.width };
    world.style.width = fit.w + 'px'; world.style.height = fit.h + 'px';
    world.style.transform = `translate(${S.view.panX}px,${S.view.panY}px) scale(${S.view.scale})`;
    const inv = 1 / S.view.scale; const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    const pos = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };
    world.innerHTML = `<img src="${m.path}" alt="" draggable="false">` + S.regions.filter(r => r.sourceId === S.sourceId).map(r => {
      const sel = r.id === S.regionId; const b = r.bounds;
      return `<div class="sr-reg" data-reg="${esc(r.id)}" data-status="${r.status}" aria-selected="${sel}" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.width * 100}%;height:${b.height * 100}%;border-width:${2 * inv}px">
        ${S.tags ? `<span class="tag" style="transform:scale(${inv})">${esc(r.label)} · ${px(r).w}×${px(r).h}</span>` : ''}
        ${sel ? handles.map(h => `<span class="h" data-h="${h}" style="left:calc(${pos[h][0]}% - 5px);top:calc(${pos[h][1]}% - 5px);transform:scale(${inv});cursor:${h}-resize"></span>`).join('') : ''}</div>`;
    }).join('') + (S.draft ? `<div class="sr-reg" data-status="proposed" style="left:${S.draft.x * 100}%;top:${S.draft.y * 100}%;width:${S.draft.width * 100}%;height:${S.draft.height * 100}%;border-style:dashed"></div>` : '');
    const z = document.getElementById('sr-zoom'); if (z) z.textContent = S.view.scale.toFixed(2) + '×';
  }
  function fitOf() { const vw = document.getElementById('sr-viewer'); const m = srcMeta(S.sourceId); return { w: vw.clientWidth, h: vw.clientWidth * m.height / m.width }; }
  function bindViewer() {
    const vw = document.getElementById('sr-viewer'); if (!vw) return;
    paintWorld();
    const toSrc = e => { const rc = vw.getBoundingClientRect(); return Core.viewToSource({ x: e.clientX - rc.left, y: e.clientY - rc.top }, fitOf(), S.view); };
    vw.addEventListener('wheel', e => { e.preventDefault(); const rc = vw.getBoundingClientRect(); S.view = Core.zoomAt(S.view, { x: e.clientX - rc.left, y: e.clientY - rc.top }, e.deltaY < 0 ? 1.15 : 1 / 1.15, 1, 10); constrain(); paintWorld(); }, { passive: false });
    let drag = null;
    vw.addEventListener('pointerdown', e => {
      vw.setPointerCapture(e.pointerId); vw.focus();
      const h = e.target.closest('[data-h]'); const reg = e.target.closest('[data-reg]');
      const start = toSrc(e);
      if (S.drawing && !h) { drag = { kind: 'draw', start }; S.draft = { x: start.x, y: start.y, width: 0.001, height: 0.001 }; return; }
      if (h) { const r = curRegion(); drag = { kind: 'resize', h: h.dataset.h, start, orig: clone(r.bounds) }; return; }
      if (reg && !reg.dataset.reg.startsWith('__')) { S.regionId = reg.dataset.reg; const r = curRegion(); drag = { kind: 'move', start, orig: clone(r.bounds) }; render(); return; }
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, pan: { x: S.view.panX, y: S.view.panY } };
    });
    vw.addEventListener('pointermove', e => {
      if (!drag) return; const r = curRegion();
      if (drag.kind === 'pan') { S.view.panX = drag.pan.x + e.clientX - drag.sx; S.view.panY = drag.pan.y + e.clientY - drag.sy; constrain(); paintWorld(); return; }
      const p = toSrc(e); const dx = p.x - drag.start.x; const dy = p.y - drag.start.y;
      if (drag.kind === 'draw') { S.draft = { x: Math.min(p.x, drag.start.x), y: Math.min(p.y, drag.start.y), width: Math.abs(dx), height: Math.abs(dy) }; paintWorld(); return; }
      let b = clone(drag.orig);
      if (drag.kind === 'move') { b.x += dx; b.y += dy; b = Object.assign(b, { x: Core.clamp(b.x, 0, 1 - b.width), y: Core.clamp(b.y, 0, 1 - b.height) }); }
      else {
        const hh = drag.h; let x0 = b.x; let y0 = b.y; let x1 = b.x + b.width; let y1 = b.y + b.height;
        if (hh.includes('w')) x0 = Core.clamp(x0 + dx, 0, x1 - Core.MIN_REGION); if (hh.includes('e')) x1 = Core.clamp(x1 + dx, x0 + Core.MIN_REGION, 1);
        if (hh.includes('n')) y0 = Core.clamp(y0 + dy, 0, y1 - Core.MIN_REGION); if (hh.includes('s')) y1 = Core.clamp(y1 + dy, y0 + Core.MIN_REGION, 1);
        b = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      }
      r.bounds = Core.clampBounds(b); paintWorld(); refreshMeta();
    });
    const end = e => {
      if (!drag) return; const was = drag; drag = null;
      if (was.kind === 'draw') {
        const d = S.draft; S.draft = null; S.drawing = false;
        if (d && d.width > Core.MIN_REGION && d.height > Core.MIN_REGION) {
          const n = S.regions.filter(r => r.sourceId === S.sourceId).length + 1; let id = `${S.sourceId}-region-${n}`; while (regionById(id)) id += '-x';
          S.regions.push({ id, sourceId: S.sourceId, label: 'New region ' + n, description: 'Describe what is actually visible.', bounds: Core.clampBounds(d), status: 'proposed', contexts: {}, notes: '' });
          S.regionId = id;
        }
        persist(); render(); return;
      }
      persist(); if (was.kind !== 'pan') render();
    };
    vw.addEventListener('pointerup', end); vw.addEventListener('pointercancel', end);
    vw.addEventListener('keydown', e => {
      const r = curRegion(); if (!r || !e.key.startsWith('Arrow')) return; e.preventDefault();
      const step = (e.shiftKey ? 5 : 1) / srcMeta(S.sourceId).width; const b = clone(r.bounds);
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (e.altKey) { b.width += d[0]; b.height += d[1] * (srcMeta(S.sourceId).width / srcMeta(S.sourceId).height); } else { b.x += d[0]; b.y += d[1] * (srcMeta(S.sourceId).width / srcMeta(S.sourceId).height); }
      r.bounds = Core.clampBounds(b); persist(); paintWorld(); refreshMeta();
    });
  }
  function constrain() {
    const vw = document.getElementById('sr-viewer'); if (!vw) return; const f = fitOf();
    const minX = Math.min(0, vw.clientWidth - f.w * S.view.scale); const minY = Math.min(0, vw.clientHeight - f.h * S.view.scale);
    S.view.panX = Core.clamp(S.view.panX, minX, 0); S.view.panY = Core.clamp(S.view.panY, minY, Math.max(0, (vw.clientHeight - f.h * S.view.scale) / 2));
    if (f.h * S.view.scale < vw.clientHeight) S.view.panY = (vw.clientHeight - f.h * S.view.scale) / 2;
  }
  function refreshMeta() {
    const r = curRegion(); if (!r) return;
    document.querySelectorAll('[data-b]').forEach(i => { if (document.activeElement !== i) i.value = r.bounds[i.dataset.b]; });
    const p = px(r); const el = document.getElementById('sr-px'); if (el) el.textContent = `${p.w}×${p.h}px at (${p.x}, ${p.y}) · parent ${r.sourceId}`;
    const mp = document.getElementById('sr-prevmini'); if (mp) mp.innerHTML = miniPreview(r);
  }

  /* ---------- context previews ---------- */
  function viabCell(v, ctx) {
    const cls = v.status.startsWith('suitable') ? (v.status === 'suitable-dpr1-dpr2' ? 'ok' : 'warn') : 'bad';
    return `<div class="sr-via"><span class="${cls}">${esc(v.label)}</span><br>
      region ${v.region.w}×${v.region.h}px → survives cover: ${v.effective.w}×${v.effective.h}px (${Math.round(v.effective.share * 100)}% of region)<br>
      focal subject kept: ${Math.round(v.survival * 100)}%${v.subjectPx ? ` · subject ${v.subjectPx.w}×${v.subjectPx.h}px in the master${v.subjectTooSmall ? ' (TOO SMALL)' : ''}` : ''}<br>
      target ${v.box.w}×${v.box.h} css · DPR1 ${v.dpr[1].needW}×${v.dpr[1].needH} (×${v.dpr[1].scale}${v.dpr[1].upscaled ? ' UPSCALE' : ''}) · DPR2 ${v.dpr[2].needW}×${v.dpr[2].needH} (×${v.dpr[2].scale}${v.dpr[2].upscaled ? ' UPSCALE' : ''})</div>`;
  }
  function viewContexts() {
    const r = curRegion(); if (!r) return '<p class="lab-note">Select a region in the first tab.</p>';
    const env = byEnv.get(S.envId) || byEnv.get('local-tavern'); const p = px(r);
    const rows = Core.CONTEXT_IDS.map(ctx => {
      const e = (r.contexts || {})[ctx] || { verdict: 'unreviewed' }; const fr = Core.contextFraming(r, ctx, p);
      const v = Core.viability(p, ctx, fr, Core.subjectFor(r, ctx)); const eff = Core.effectiveStatus(v, e.verdict);
      const slider = (k, min, max, step) => `<label style="display:grid;grid-template-columns:44px 1fr 44px;gap:4px;align-items:center;font-size:12px">${k}<input type="range" min="${min}" max="${max}" step="${step}" value="${fr[k]}" data-fr="${ctx}:${k}"><output>${fr[k]}</output></label>`;
      const preview = ctx === 'catalog' ? `<div class="sr-pair"><div>${cardRegion(env, r, S.mode)}<div class="sr-cap">Real production card · ${esc(env.id)} · the card shows as much of the 95×249 frame as its own height allows (top-anchored, as production strips are)</div></div><div>${frameHtml(r, 'catalog', S.mode)}<div class="sr-cap">The whole 95×249 frame</div></div></div>`
        : ctx === 'prep' ? `<div style="width:380px">${rowRegion(env, r, S.mode)}<div class="sr-cap">Real picker row · ${esc(env.id)}</div></div>`
          : `<div>${coverHtml(r, Number(ctx.slice(5)), S.mode)}<div class="sr-cap">${Number(ctx.slice(5)) === 1 ? 'Region alone' : 'Region + production companion pictures (unchanged)'} · cover 318×90 card width</div></div>`;
      return `<div class="sr-ctxrow"><div class="sr-panel"><b>${Core.CONTEXTS[ctx].label}</b><span class="sr-cap" style="margin:0">${esc(Core.CONTEXTS[ctx].note)}</span>
        ${slider('x', 0, 100, 1)}${slider('y', 0, 100, 1)}${slider('zoom', 1, 3, 0.05)}
        <div class="sr-bar" style="margin:0"><button class="lab-btn" data-act="fr-region" data-ctx="${ctx}">Reset to region</button><button class="lab-btn" data-act="fr-center" data-ctx="${ctx}">Reset to center</button></div>
        <label style="grid-template-columns:54px 1fr">Verdict <select data-verdict="${ctx}">${Core.VERDICTS.map(x => `<option${e.verdict === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <input type="text" data-vnote="${ctx}" placeholder="reviewer note" value="${esc(e.note || '')}">
        ${viabCell(v, ctx)}<div class="sr-via">Final: <b class="${eff.startsWith('suitable') ? 'ok' : 'bad'}">${esc(Core.VIABILITY[eff])}</b></div></div>
        <div>${preview}</div></div>`;
    }).join('');
    return `<div class="sr-bar"><b>${esc(r.label)}</b><span class="lab-chip">${esc(r.id)}</span><span class="lab-chip">${p.w}×${p.h}px</span>
      <span class="sp"></span>Preview source: <span class="sr-seg" role="group" aria-label="Image source">${[['master', 'Master (live crop)'], ['A', 'A · runtime CSS on 960 derivative'], ['B', 'B · pre-generated']].map(([id, l]) => `<button data-mode="${id}" aria-pressed="${S.mode === id}">${l}</button>`).join('')}</span>
      Environment: <select data-envsel style="width:230px">${envs.map(e => `<option value="${esc(e.id)}"${e.id === env.id ? ' selected' : ''}>${esc(e.name.en)}</option>`).join('')}</select></div>${rows}`;
  }

  /* ---------- environment matching ---------- */
  function searchEnvs() {
    const q = (S.q || '').toLowerCase().trim();
    return envs.filter(e => {
      if (S.fTier && String(e.tier) !== S.fTier) return false;
      if (S.fBiome && !(e.biomes || []).includes(S.fBiome)) return false;
      if (S.fArch && primary[e.id] !== S.fArch && !(secondary[e.id] || []).includes(S.fArch)) return false;
      if (S.onlyMapped && !S.mappings.some(m => m.envId === e.id)) return false;
      if (!q) return true;
      return [e.id, e.name.en, e.lore && e.lore.en, (e.biomes || []).join(' '), primary[e.id], (secondary[e.id] || []).join(' ')].join(' ').toLowerCase().includes(q);
    });
  }
  const mappingOf = (regionId, envId) => S.mappings.find(m => m.regionId === regionId && m.envId === envId);
  function viewMatch() {
    const r = curRegion(); const list = searchEnvs().slice(0, 120); const env = byEnv.get(S.envId);
    const biomes = [...new Set(envs.flatMap(e => e.biomes || []))].sort(); const archs = Object.keys(Data.MASTER_FILES);
    const sel = (k, opts, label) => `<select data-fil="${k}"><option value="">${label}</option>${opts.map(o => `<option${S[k] === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    const left = `<div class="sr-bar"><input type="text" data-q placeholder="Search name, id, lore, biome, archetype…" value="${esc(S.q || '')}" style="flex:1">${sel('fTier', ['1', '2', '3', '4'], 'Tier')}${sel('fBiome', biomes, 'Biome')}${sel('fArch', archs, 'Archetype')}
      <label style="font-size:12px"><input type="checkbox" data-act="only-mapped"${S.onlyMapped ? ' checked' : ''}> mapped only</label></div>
      <div class="lab-sublabel">Region: ${r ? esc(r.label) : 'none selected'} — ${searchEnvs().length} environments</div>
      <div class="sr-list">${list.map(e => { const m = r && mappingOf(r.id, e.id); const b = baseline[e.id];
        return `<button class="sr-env" data-env="${esc(e.id)}" aria-current="${e.id === S.envId}"><span class="t">T${e.tier}</span><span class="n">${esc(e.name.en)}<br><small style="color:var(--muted)">${esc(primary[e.id] || '—')}${b.catalog === 'thematic' || b.catalog === 'unique' ? ' · themed' : ''}</small></span>${m ? `<span class="m ${m.review}">${REVIEW_LABEL[m.review]}</span>` : ''}</button>`; }).join('')}</div>`;
    return `<div class="sr-two"><div>${left}</div><div>${env && r ? matchDetail(env, r) : '<p class="lab-note">Pick a region (tab 1), then an environment.</p>'}</div></div>`;
  }
  /** Why a region may not stand in a frame (computed + human verdict), or '' when it may. */
  function frameNote(r, ctxs) {
    const p = px(r);
    const bad = ctxs.map(c => { const e = (r.contexts || {})[c] || { verdict: 'unreviewed' }; const v = Core.viability(p, c, Core.contextFraming(r, c, p), Core.subjectFor(r, c)); const eff = Core.effectiveStatus(v, e.verdict);
      return r.status !== 'approved' ? `region ${r.status}` : e.verdict !== 'pass' ? `verdict ${e.verdict}` : eff.startsWith('suitable') ? '' : Core.VIABILITY[eff]; }).filter(Boolean);
    return bad.length ? ` · <b style="color:#ef8b8b">not eligible here: ${esc(bad[0])}</b>` : ' · <b style="color:#8fd0a0">eligible in this frame</b>';
  }
  function matchDetail(env, r) {
    const m = mappingOf(r.id, env.id) || { review: '', reason: '', improves: '' };
    const feats = (env.features || []).map(f => f.name && f.name.en).filter(Boolean).join(' · ');
    const cross = primary[env.id] && primary[env.id] !== r.sourceId;
    const prodCat = productionCatalogArt(env); const full = fullArchetypeImage(env); const b = baseline[env.id];
    const col = (title, cap, body) => `<div><div class="lab-sublabel">${title}</div>${body}<div class="sr-cap">${cap}</div></div>`;
    const prodThumb = prod.prodPrepEnvThumbHtml(env);
    const fullCard = full ? cardWith(env, wholePictureCatalog(full)) : '<div class="sr-cap" style="width:340px">No whole-picture archetype is authorised for this environment (not in ARCHETYPE_FIT): option B does not exist.</div>';
    return `<div class="sr-panel"><b>${esc(env.name.en)} <span class="lab-chip">${esc(env.id)}</span> <span class="lab-chip">T${env.tier}</span> ${(env.biomes || []).map(x => `<span class="lab-chip">${x}</span>`).join('')}</b>
      <div>${esc(env.lore && env.lore.en)}</div><div class="sr-cap" style="max-width:none"><b>Features:</b> ${esc(feats)}</div>
      <div class="sr-cap" style="max-width:none">Taxonomy: <b>${esc(primary[env.id] || 'none')}</b>${(secondary[env.id] || []).length ? ' · also ' + esc(secondary[env.id].join(', ')) : ''} · region source: <b>${esc(r.sourceId)}</b>${cross ? ' · <b style="color:#e6c36a">CROSS-ARCHETYPE (taxonomy unchanged)</b>' : ''}</div>
      <div class="sr-bar" style="margin:0">${Core.MAPPING_REVIEWS.map(x => `<button class="lab-btn${m.review === x ? ' on' : ''}" data-act="map" data-review="${x}">${REVIEW_LABEL[x]}</button>`).join('')}<button class="lab-btn" data-act="map-clear">Clear</button></div>
      <input type="text" data-mreason placeholder="Reason (required, in terms of the lore and what the crop visibly shows)" value="${esc(m.reason)}">
      <input type="text" data-mimproves placeholder="Qualitative improvement on today's picture (optional; empty = does not count as improvement)" value="${esc(m.improves)}">
      <div class="sr-cap" style="max-width:none">Only Strong and Acceptable count, only on an Approved region, only in a frame whose verdict and resolution pass. Unreviewed = not counted.</div></div>
      <div class="lab-sec" style="margin-top:12px"><h2 style="font-size:15px">A · B · C — Catalog</h2><div class="sr-pair">
        ${col('A · Existing production artwork', `${b.catalog} (${esc(b.catalogImage || 'biome strip')})`, `<div class="grid sr-card">${(prod.hooks.catalogArt = () => prodCat, prod.cardHtml(env))}</div>`)}
        ${col('B · Full archetype artwork', full ? esc(full.id) : 'not eligible', fullCard)}
        ${col('C · Semantic crop', esc(r.id) + frameNote(r, ['catalog']), cardRegion(env, r, S.mode))}</div></div>
      <div class="lab-sec"><h2 style="font-size:15px">Session Prep (48×48)</h2><div class="sr-pair">
        ${col('A · Existing', 'biome thumbnail (production)', `<div style="width:340px">${rowWith(env, prodThumb)}</div>`)}
        ${col('B · Full archetype', full ? 'whole picture at 48px' : 'not eligible', full ? `<div style="width:340px">${rowWith(env, `<span class="prep-thumb" style="display:block;overflow:hidden"><img src="${full.fallback}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${full.pos[2].x}% ${full.pos[2].y}%"></span>`)}</div>` : '')}
        ${col('C · Semantic crop', esc(r.id) + frameNote(r, ['prep']), `<div style="width:340px">${rowRegion(env, r, S.mode)}</div>`)}</div></div>
      <div class="lab-sec"><h2 style="font-size:15px">My Lists cover (1 / 2 / 3 tiles)</h2><div class="sr-pair">${[1, 2, 3].map(n => col(n + (n === 1 ? ' tile' : ' tiles'), 'region' + frameNote(r, ['lists' + n]) + (n > 1 ? ' · companions are unchanged production pictures; a cover may hold one region per parent illustration' : ''), coverHtml(r, n, S.mode))).join('')}</div></div>`;
  }


  /* ---------- V2 comparison sheet: sources, regions, approved crops and the real before / after ---------- */
  const OV = { approved: '#8fd0a0', proposed: '#e6c36a' };
  function viewSheet() {
    const g = Core.gains(exportInput());
    const regs = id => S.regions.filter(r => r.sourceId === id);
    const srcBlock = id => {
      const m = srcMeta(id); const W = 600; const H = Math.round(W * m.height / m.width);
      const ov = regs(id).map(r => { const c = OV[r.status] || '#ef8b8b'; const b = r.bounds;
        return `<div class="sr-ov" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.width * 100}%;height:${b.height * 100}%;border-color:${c}"><span style="background:${c}">${esc(r.id.replace(id + '-', ''))}</span></div>`; }).join('');
      const crops = regs(id).filter(r => r.status === 'approved').map(r => { const p = px(r); const w = Math.round(110 * p.w / Math.max(p.w, p.h) * 1.2); const h = Math.round(w * p.h / p.w);
        return `<div><div class="sr-frame" style="width:${w}px;height:${h}px"><img src="${m.path}" alt="" style="left:${-p.x * w / p.w}px;top:${-p.y * w / p.w}px;width:${m.width * w / p.w}px;height:${m.height * w / p.w}px"></div><div class="sr-cap" style="max-width:${w}px">${esc(r.label)}</div></div>`; }).join('');
      const rej = regs(id).filter(r => r.status !== 'approved').map(r => `<li><b>${esc(r.id.replace(id + '-', ''))}</b> <span class="lab-chip">${esc(r.status)}</span></li>`).join('');
      return `<div class="sr-sheet-src"><div class="lab-sublabel">${esc(id)} · ${m.width}×${m.height}</div>
        <div class="sr-sheet-img" style="position:relative;width:${W}px;height:${H}px"><img src="${m.path}" alt="" style="width:${W}px;height:${H}px;display:block">${ov}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:flex-start">${crops}</div><ul class="sr-cap" style="max-width:none;margin:6px 0 0 16px">${rej}</ul></div>`;
    };
    /* every environment with a gain in Catalog, Prep (vs archetype-first) or My Lists, with the crop that gives it */
    const rows = {};
    ['catalog', 'prepFuture', 'lists'].forEach(k => {
      [['new', 'newIds'], ['qualitative', 'qualitativeIds']].forEach(([cat, key]) => g[k][key].forEach(e => {
        const row = rows[e] = rows[e] || { cats: {}, region: null };
        if (!row.cats[k] || cat === 'new') row.cats[k] = cat;
        if (!row.region) row.region = (g[k].regionsByEnv[e] || [])[0];
      }));
    });
    const gainCard = id => {
      const env = byEnv.get(id); const row = rows[id]; const r = regionById(row.region); if (!env || !r) return '';
      const cats = Object.entries(row.cats).map(([k, c]) => `<span class="lab-chip ${c === 'new' ? 'u' : ''}">${k}: ${c}</span>`).join(' ');
      const inCat = !!row.cats.catalog; const inPrep = !!row.cats.prepFuture;
      return `<div class="sr-sheet-gain"><div class="lab-sublabel"><b>${esc(env.name.en)}</b> <code>${esc(id)}</code> · ${esc(primary[id] || 'no archetype')} ← <code>${esc(r.id)}</code> ${primary[id] && primary[id] !== r.sourceId ? '<span class="lab-chip">cross-archetype</span>' : ''} ${cats}</div>
        <div class="sr-pair">
          ${inCat ? `<div><div class="sr-cap">Catalog now (${esc(baseline[id].catalog)})</div>${cardWith(env, productionCatalogArt(env))}</div><div><div class="sr-cap">Catalog with crop</div>${cardRegion(env, r, S.mode)}</div>` : ''}
          ${inPrep ? `<div><div class="sr-cap">Prep now · biome</div><div style="width:300px">${rowWith(env, prod.prodPrepEnvThumbHtml(env))}</div>${fullArchetypeImage(env) ? `<div class="sr-cap">Prep, whole archetype (option 1)</div><div style="width:300px">${rowWith(env, `<span class="prep-thumb" style="display:block;overflow:hidden"><img src="${fullArchetypeImage(env).fallback}" alt="" style="width:100%;height:100%;object-fit:cover"></span>`)}</div>` : ''}</div><div><div class="sr-cap">Prep with crop (option 2)</div><div style="width:300px">${rowRegion(env, r, S.mode)}</div></div>` : ''}
        </div></div>`;
    };
    return `<p class="lab-note">Three V2 sources with every proposed region (green = approved, amber = needs review, red = rejected), the approved crops, and every environment that gains a picture: real Catalog cards and Prep rows, before and after. Categories are kept apart; an environment is listed once.</p>
      <div class="sr-sheet-grid">${Data.PILOT_SOURCES.map(srcBlock).join('')}</div>
      <div class="lab-sec"><h2>Environments that gain</h2>${Object.keys(rows).sort().map(gainCard).join('') || '<p class="lab-note">None.</p>'}</div>`;
  }

  /* ---------- coverage ---------- */
  function viewCoverage() {
    const cov = Core.coverage(exportInput()); const ids = a => a.length ? a.map(esc).join(', ') : '—';
    const k = (b, s) => `<div class="k"><b>${b}</b><span>${s}</span></div>`;
    const row = c => { const x = cov.byContext[c]; return `<tr><td>${c === 'lists' ? 'My Lists (all three layouts)' : Core.CONTEXTS[c].label}</td><td class="num">${cov.baseline[c].themed}</td><td class="num">${x.usableEnvironments}</td><td class="num">${x.newlyCovered}</td><td class="num">${x.improved}</td><td class="num"><b>${x.net}</b></td><td>${ids(x.netIds)}</td></tr>`; };
    return `<div class="sr-stat">${k(envs.length, 'environments (current data)')}${k(S.regions.length, 'regions proposed')}${k(S.regions.filter(r => r.status === 'approved').length, 'regions approved')}${k(cov.candidate.environments, 'environments with a non-rejected candidate')}${k(cov.approved.environments, 'environments with a Strong/Acceptable match on an approved region')}${k(cov.netAnyContext, 'environments gaining a better option in at least one context')}${k(cov.crossArchetype.environments, 'cross-archetype environments')}${k(cov.rejected, 'rejected mappings')}${k(cov.needsReview, 'needs-review (not counted)')}</div>
      <div class="lab-sec" style="margin-top:16px"><h2>Per context (never double-counted; unique environment ids)</h2><p class="lab-note">"Themed now" = environments whose picture today is a painting, harbour override or thematic archetype picture (Session Prep draws a biome thumbnail for all). Newly covered = approved crop and no themed picture today; Improved = themed today and the mapping records a confirmed qualitative improvement.</p>
      <div class="lab-scroll"><table class="lab-table"><tr><th>Context</th><th>Themed now</th><th>Usable env ids</th><th>Newly covered</th><th>Improved</th><th>Net</th><th>Net ids</th></tr>${Core.COVERAGE_CONTEXTS.map(row).join('')}</table></div></div>
      ${gainsSection()}
      <p class="lab-note">Cross-archetype approved: ${ids(cov.crossArchetype.ids)}. The same numbers, computed offline, are in <code>${RES}stats.json</code>.</p>`;
  }

  /** The three gain categories kept apart (lab-core gains()): new coverage, qualitative replacement, no meaningful gain. */
  function gainsSection() {
    const input = Object.assign(exportInput(), {});
    const g = Core.gains(input);
    const comb = PILOT === 'v2' ? Core.gains(Object.assign({}, input, { regions: DataV1.REGIONS.concat(S.regions), mappings: DataV1.MAPPINGS.concat(S.mappings) })) : null;
    const ids = a => (a.length ? a.map(esc).join(', ') : '—');
    const rows = (x, label) => [['catalog', 'Catalog'], ['prep', 'Session Prep (production: biome)'], ['prepFuture', 'Session Prep vs archetype-first'], ['lists', 'My Lists']].map(([k, n]) => `<tr><td>${label}</td><td>${n}</td><td class="num">${x[k].new}</td><td class="num">${x[k].qualitative}</td><td class="num">${x[k].noGain}</td><td>${ids(x[k].newIds)}</td><td>${ids(x[k].qualitativeIds)}</td></tr>`).join('');
    return `<div class="lab-sec" style="margin-top:16px"><h2>New coverage · qualitative replacement · no gain (kept apart)</h2><p class="lab-note">One count per environment per context, at its best category. "Session Prep vs archetype-first" treats every environment the existing archetype pictures already reach as themed, so only gains beyond using the 28 whole pictures remain.</p>
      <div class="lab-scroll"><table class="lab-table"><tr><th>Set</th><th>Context</th><th>New</th><th>Qualitative</th><th>No gain</th><th>New ids</th><th>Qualitative ids</th></tr>${rows(g, PILOT.toUpperCase())}${comb ? rows(comb, 'V1 + V2') : ''}</table></div></div>`;
  }

  function viewLibrary() {
    return `<p class="lab-note">Preliminary research classification from a contact sheet of all masters plus full-size looks at the pilots. Not a count of approved assets. All masters are ≈1672×941 (one 1536×1024), so resolution limits come from how small a subject is, not from the file.</p>
      <div class="lab-scroll"><table class="lab-table"><tr><th></th><th>Source</th><th>Opportunity</th><th>Est. regions</th><th>Why</th><th>Next</th></tr>
      ${Data.SCAN.map(s => `<tr><td><div class="sr-frame" style="width:96px;height:54px"><img src="${srcMeta(s.sourceId).path}" alt="" loading="lazy" style="left:0;top:0;width:96px;height:54px"></div></td><td><button class="lab-btn" data-open-source="${s.sourceId}">${s.sourceId}</button></td><td class="sr-opp-${s.opportunity}"><b>${s.opportunity}</b></td><td class="num">${s.estimatedRegions}</td><td>${esc(s.why)}</td><td>${esc(s.next)}</td></tr>`).join('')}</table></div>`;
  }

  function viewAssets() {
    const a = stats.assets; const kb = n => (n / 1024).toFixed(1) + ' KB';
    const rows = stats.regionReports.filter(r => r.derivatives.length).map(r => `<tr><td>${esc(r.id)}</td><td class="num">${r.pixels.w}×${r.pixels.h}</td>${Core.CONTEXT_IDS.map(c => { const f = r.derivatives.filter(d => d.ctx === c && d.format === 'avif'); const fr = r.frames[c]; return `<td class="num">${f.length ? kb(f.reduce((n, x) => n + x.bytes, 0)) : '—'}<br><small>A: ${fr.A[2].upscaled ? 'UPSCALE' : fr.A[2].file + 'w'}</small></td>`; }).join('')}</tr>`).join('');
    return `<div class="sr-stat"><div class="k"><b>${a.files}</b><span>lab-only derivative files (${kb(a.avifBytes)} AVIF + ${kb(a.webpBytes)} WebP)</span></div><div class="k"><b>${kb(a.avifBytesDpr1)}</b><span>AVIF @1x total</span></div><div class="k"><b>${kb(a.avifBytesDpr2)}</b><span>AVIF @2x total</span></div><div class="k"><b>${kb(a.existing960Avg)}</b><span>avg existing 960px list-cover AVIF (Approach A source)</span></div><div class="k"><b>${kb(a.existingCatalogStrip200Avg)}</b><span>avg existing 200px Catalog strip AVIF</span></div></div>
      <p class="lab-note" style="margin-top:12px">Approach B files are cut once from the master, one resample, no sharpening, named <code>&lt;region&gt;--&lt;frame&gt;-&lt;w&gt;x&lt;h&gt;.avif</code> (<code>lab/semantic-reuse/derivs/</code>). Approach A column: the existing list-cover derivative file a runtime CSS crop would have to download at DPR 2 (or UPSCALE when even the 960px file is too small).</p>
      <div class="lab-scroll"><table class="lab-table"><tr><th>Region</th><th>Region px</th>${Core.CONTEXT_IDS.map(c => `<th>${Core.CONTEXTS[c].label}<br><small>B bytes (1x+2x)</small></th>`).join('')}</tr>${rows}</table></div>
      <div class="lab-sec" style="margin-top:16px"><h2>Approved pilot crops</h2><div class="sr-thumbgrid">${S.regions.filter(r => r.status === 'approved').map(r => `<figure><div class="sr-frame" style="aspect-ratio:${px(r).w}/${px(r).h};height:auto"><img src="${srcMeta(r.sourceId).path}" alt="" loading="lazy" style="left:${-px(r).x / px(r).w * 100}%;top:${-px(r).y / px(r).h * 100}%;width:${srcMeta(r.sourceId).width / px(r).w * 100}%;height:auto"></div>${esc(r.label)}<br><small style="color:var(--muted)">${esc(r.sourceId)}</small></figure>`).join('')}</div></div>`;
  }

  function viewExport() {
    const exp = Core.buildExport(exportInput()); const problems = Core.validateExport(exp); const text = JSON.stringify(exp, null, 1);
    return `<div class="sr-bar"><b>${problems.length ? '<span class="sr-via"><span class="bad">Invalid: ' + esc(problems.join('; ')) + '</span></span>' : '<span class="sr-via"><span class="ok">Valid</span></span> · schema ' + exp.schema + ' v' + exp.version}</b><span class="sp"></span><button class="lab-btn" data-act="copy-export">Copy JSON</button></div>
      <p class="lab-note">${exp.regions.length} regions, ${exp.mappings.length} mappings. Experimental data for a later, separately authorised integration; nothing in it is applied anywhere.</p>
      <textarea readonly style="width:100%;height:520px;font:11.5px var(--font-mono,monospace)">${esc(text)}</textarea>`;
  }

  /* ---------- render + events ---------- */
  function render() {
    writeHash();
    const body = { editor: viewEditor, contexts: viewContexts, match: viewMatch, coverage: viewCoverage, library: viewLibrary, assets: viewAssets, export: viewExport, sheet: viewSheet }[S.tab]();
    const keepFocus = document.activeElement && document.activeElement.dataset && (document.activeElement.dataset.q !== undefined);
    shell(body);
    if (S.tab === 'editor') bindViewer();
    if (keepFocus) { const q = root.querySelector('[data-q]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
    lsSet(LS.ui, { tab: S.tab, sourceId: S.sourceId, mode: S.mode });
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('button, [data-source], [data-region], [data-env], [data-open-source]'); if (!t) return;
    const d = t.dataset;
    if (d.tab) { S.tab = d.tab; return render(); }
    if (d.openSource) { S.sourceId = d.openSource; S.tab = 'editor'; S.view = { scale: 1, panX: 0, panY: 0 }; S.regionId = (S.regions.find(r => r.sourceId === S.sourceId) || {}).id || null; return render(); }
    if (d.source) { S.sourceId = d.source; S.view = { scale: 1, panX: 0, panY: 0 }; S.regionId = (S.regions.find(r => r.sourceId === S.sourceId) || {}).id || null; return render(); }
    if (d.region && !t.classList.contains('sr-reg')) { S.regionId = d.region; return render(); }
    if (d.env) { S.envId = d.env; return render(); }
    if (d.mode) { S.mode = d.mode; return render(); }
    const r = curRegion();
    switch (d.act) {
      case 'new-region': S.drawing = !S.drawing; return render();
      case 'dup-region': { if (!r) return; const c = clone(r); let n = 2; while (regionById(`${r.id}-copy${n === 2 ? '' : n}`)) n += 1; c.id = `${r.id}-copy${n === 2 ? '' : n}`; c.label = r.label + ' (copy)'; c.status = 'proposed'; c.bounds = Core.clampBounds(Object.assign({}, c.bounds, { x: c.bounds.x + 0.02, y: c.bounds.y + 0.02 })); S.regions.push(c); S.regionId = c.id; persist(); return render(); }
      case 'del-region': { if (!r) return; S.regions = S.regions.filter(x => x.id !== r.id); S.mappings = S.mappings.filter(m => m.regionId !== r.id); S.regionId = (S.regions.find(x => x.sourceId === S.sourceId) || {}).id || null; persist(); return render(); }
      case 'zoom-in': case 'zoom-out': { const vw = document.getElementById('sr-viewer'); S.view = Core.zoomAt(S.view, { x: vw.clientWidth / 2, y: vw.clientHeight / 2 }, d.act === 'zoom-in' ? 1.3 : 1 / 1.3, 1, 10); constrain(); return paintWorld(); }
      case 'reset-view': S.view = { scale: 1, panX: 0, panY: 0 }; constrain(); return paintWorld();
      case 'fr-region': case 'fr-center': { if (!r) return; r.contexts = r.contexts || {}; const c = r.contexts[d.ctx] = r.contexts[d.ctx] || { verdict: 'unreviewed' };
        c.framing = d.act === 'fr-center' ? { x: 50, y: 50, zoom: 1 } : (delete c.framing, Core.contextFraming(Object.assign({}, r, { contexts: {} }), d.ctx, px(r))); if (d.act === 'fr-region') delete c.framing; persist(); return render(); }
      case 'map': { if (!r || !S.envId) return; let m = mappingOf(r.id, S.envId); if (!m) { m = { regionId: r.id, envId: S.envId, review: d.review, reason: '', improves: '' }; S.mappings.push(m); } m.review = d.review; persist(); return render(); }
      case 'map-clear': { S.mappings = S.mappings.filter(m => !(m.regionId === (r || {}).id && m.envId === S.envId)); persist(); return render(); }
      case 'pilot': try { history.replaceState(null, '', location.pathname + '#pilot=' + d.pilot); } catch (err) { /* ignore */ } location.reload(); return undefined;
      case 'reset-data': S.regions = clone(Data.REGIONS); S.mappings = clone(Data.MAPPINGS); persist(); S.regionId = (S.regions.find(x => x.sourceId === S.sourceId) || {}).id || null; return render();
      case 'copy-export': { const text = JSON.stringify(Core.buildExport(exportInput()), null, 1); if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {}); return undefined; }
      default: return undefined;
    }
  });
  root.addEventListener('change', e => {
    const el = e.target; const r = curRegion();
    if (el.dataset.act === 'toggle-tags') { S.tags = el.checked; return paintWorld(); }
    if (el.dataset.act === 'only-mapped') { S.onlyMapped = el.checked; return render(); }
    if (el.dataset.fil) { S[el.dataset.fil] = el.value; return render(); }
    if (el.dataset.envsel !== undefined) { S.envId = el.value; return render(); }
    if (!r) return;
    if (el.dataset.f) { r[el.dataset.f] = el.value; persist(); return render(); }
    if (el.dataset.b) { const b = Object.assign({}, r.bounds, { [el.dataset.b]: Number(el.value) }); const v = Core.validateBounds(b); if (v.ok) { r.bounds = b; persist(); } else el.value = r.bounds[el.dataset.b]; return render(); }
    if (el.dataset.verdict) { r.contexts = r.contexts || {}; (r.contexts[el.dataset.verdict] = r.contexts[el.dataset.verdict] || {}).verdict = el.value; persist(); return render(); }
    if (el.dataset.vnote) { r.contexts = r.contexts || {}; (r.contexts[el.dataset.vnote] = r.contexts[el.dataset.vnote] || { verdict: 'unreviewed' }).note = el.value; persist(); return undefined; }
    if (el.dataset.mreason !== undefined || el.dataset.mimproves !== undefined) { const m = mappingOf(r.id, S.envId); if (m) { if (el.dataset.mreason !== undefined) m.reason = el.value; else m.improves = el.value; persist(); } return undefined; }
    return undefined;
  });
  root.addEventListener('input', e => {
    const el = e.target; const r = curRegion();
    if (el.dataset.q !== undefined) { S.q = el.value; return render(); }
    if (el.dataset.fr && r) { const [ctx, k] = el.dataset.fr.split(':'); r.contexts = r.contexts || {}; const c = r.contexts[ctx] = r.contexts[ctx] || { verdict: 'unreviewed' };
      c.framing = Core.normalizeFraming(Object.assign({}, Core.contextFraming(r, ctx, px(r)), c.framing, { [k]: Number(el.value) })); persist();
      const out = el.nextElementSibling; if (out) out.textContent = el.value; refreshFrames(r, ctx); }
    return undefined;
  });
  /* A slider moves the picture without rebuilding the page (so it can be dragged). */
  function refreshFrames(r, ctx) {
    if (ctx === 'catalog' || ctx === 'prep' || ctx.startsWith('lists')) {
      const sel = ctx === 'catalog' ? '.card-art img' : ctx === 'prep' ? '.prep-thumb img' : null;
      root.querySelectorAll(`.sr-ctxrow:nth-of-type(${Core.CONTEXT_IDS.indexOf(ctx) + 1}) img[data-mode]`).forEach(img => { const g = frameImgStyle(r, ctx, S.mode); if (img.dataset.mode !== 'B') img.setAttribute('style', g.style); });
      void sel;
    }
  }

  /* ---------- boot ---------- */
  async function getJson(p) { const r = await fetch(p); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); }
  async function boot() {
    try {
      const [envData, cls, inv, st, man, i18n, regions, appSrc] = await Promise.all([getJson('data/environments.json'), getJson('docs/research/lists-cover-classification.json'), getJson(RES + 'inventory.json'), getJson(RES + 'stats.json'), getJson(PILOT === 'v2' ? DataV2.MANIFEST : 'lab/semantic-reuse/derivs-manifest.json'), getJson('data/i18n.json'), getJson('data/regions.json'), fetch('js/app.js').then(r => r.text())]);
      envs = envData.environments; byEnv = new Map(envs.map(e => [e.id, e])); classification = cls; inventory = inv; stats = st; manifest = man;
      primary = {}; secondary = {}; cls.environments.forEach(c => { primary[c.id] = c.primary_archetype || null; secondary[c.id] = c.secondary_archetypes || []; });
      prod = window.ArtworkLabBridge.load(appSrc, { EnvTierUtils: window.EnvTierUtils, PrepUtils: window.PrepUtils, RouteUtils: window.RouteUtils }, { i18n, regions: regions.regions, lang: 'en' });
      baseline = {};
      envs.forEach(e => { const c = window.CatalogArt.resolveCatalogArt(e); const l = window.ListCoverUtils.resolveEnvironmentArt({ id: e.id, artBiome: prod.artBiome(e) }, Art);
        baseline[e.id] = { catalog: c.kind, catalogImage: c.imageId, prep: 'biome', lists: !l ? 'none' : l.kind === 'unique' ? 'unique' : (Art.ENV_IMAGE_OVERRIDES[e.id] === l.imageId ? 'override' : l.kind === 'archetype' ? 'archetype' : 'biome') }; });
      const ui = lsGet(LS.ui, {}); const h = hashState();
      const regionsSaved = lsGet(LS.regions, null); const mappingsSaved = lsGet(LS.mappings, null);
      const sourceId = h.source && inventory[h.source] ? h.source : (ui.sourceId && inventory[ui.sourceId] ? ui.sourceId : Data.PILOT_SOURCES[0]);
      S = { tab: TABS.some(t => t[0] === h.tab) ? h.tab : (ui.tab || 'editor'), sourceId, regions: regionsSaved || clone(Data.REGIONS), mappings: mappingsSaved || clone(Data.MAPPINGS), view: { scale: 1, panX: 0, panY: 0 }, tags: true, mode: ui.mode || 'master', ctx: h.ctx || 'catalog', envId: h.env || 'bustling-marketplace', drawing: false, draft: null };
      S.regionId = h.region && regionById(h.region) ? h.region : (S.regions.find(r => r.sourceId === sourceId) || {}).id || null;
      if (S.regionId) S.sourceId = regionById(S.regionId).sourceId;
      render();
      window.addEventListener('resize', () => { if (S.tab === 'editor') { constrain(); paintWorld(); } });
    } catch (err) { root.innerHTML = `<p class="lab-loading">Lab failed to load: ${esc(err.message)}. Serve the repo root with a static server (see docs/research/semantic-artwork-reuse-lab-v1.md).</p>`; console.error(err); }
  }
  boot();
})();
