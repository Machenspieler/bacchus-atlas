/* Artwork Crop Lab V2 — development-only. No storage, no production script, no writes.
 * Production markup is reproduced from js/app.js (cardHtml, biomeArtHtml,
 * envPickerRowHtml, listCardHtml, listCoverHtml) and styled by css/styles.css as-is.
 * Crop state lives in `state` below and nowhere else, keyed archetype → context → source. */
(function () {
  'use strict';

  const ROOT = '../../../';
  const M = ROOT + 'img/cover-archetypes-source/';

  /* The registry. One or two sources per archetype; a source is only offered if it exists.
   * w/h are the PREVIEW's pixels (overwritten with the loaded image's real size on boot, so the
   * crop math always follows the file, not this literal). mw/mh are the untouched master's pixels
   * as reported by `file` — recorded for the inventory, never decoded in the browser. */
  const ARTWORKS = {
    'haunted-and-deathly': {
      name: 'Haunted & Deathly', short: 'Haunted',
      sources: {
        landscape: { url: 'assets/haunted-landscape-1280.webp', master: M + 'haunted-and-deathly-landscape.png', w: 1280, h: 720, mw: 1672, mh: 941 },
        portrait: { url: 'assets/haunted-portrait-800.webp', master: M + 'haunted-and-deathly-portrait.png', w: 800, h: 1200, mw: 1024, mh: 1536 },
      },
    },
    'forgotten-ruins': {
      name: 'Forgotten Ruins', short: 'Ruins',
      sources: { landscape: { url: 'assets/forgotten-ruins-landscape-1280.webp', master: M + 'forgotten-ruins-landscape.png', w: 1280, h: 853, mw: 1536, mh: 1024 } },
    },
    'arcane-sanctums': {
      name: 'Arcane Sanctums', short: 'Arcane',
      sources: { landscape: { url: 'assets/arcane-sanctums-landscape-1280.webp', master: M + 'arcane-sanctums-landscape.png', w: 1280, h: 720, mw: 1672, mh: 941 } },
    },
    'feasts-and-revelry': {
      name: 'Feasts & Revelry', short: 'Feasts',
      sources: { landscape: { url: 'assets/feasts-and-revelry-landscape-1280.webp', master: M + 'feasts-and-revelry-landscape.png', w: 1280, h: 720, mw: 1672, mh: 941 } },
    },
  };
  const ARCHS = Object.keys(ARTWORKS);
  const srcKeys = a => Object.keys(ARTWORKS[a].sources).filter(k => ARTWORKS[a].sources[k].ok !== false);
  const hasSrc = (a, s) => !!ARTWORKS[a].sources[s] && ARTWORKS[a].sources[s].ok !== false;
  const SRC = (a, s) => ARTWORKS[a].sources[s];
  function ratioName(r) {
    const known = [[16 / 9, '16:9'], [3 / 2, '3:2'], [2 / 3, '2:3'], [1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4']];
    const best = known.reduce((p, k) => Math.abs(k[0] - r) < Math.abs(p[0] - r) ? k : p);
    return Math.abs(best[0] - r) / best[0] < 0.02 ? best[1] : r.toFixed(2) + ':1';
  }
  const aspectOf = s => s.w / s.h;
  const srcWord = s => s === 'landscape' ? 'Landscape' : 'Portrait';
  const srcShort = (a, s) => `${srcWord(s)} ${ratioName(aspectOf(SRC(a, s)))}`;

  const BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'settlement', 'universal'];
  const GENERIC_BIOMES = ['universal', 'settlement'];
  const ENV_ART = new Set(['cauldera-valley', 'field-of-dreams', 'ouroborean-pass']);
  const ENV_ART_FOCUS = { 'field-of-dreams': '58%', 'ouroborean-pass': '42%' };
  const ICON_BOOKMARK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 6.5h15M9.8 6.5V4.9a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v1.6M6.8 6.5l.8 12.3a1 1 0 0 0 1 .9h6.8a1 1 0 0 0 1-.9l.8-12.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.4 10.2v6M13.6 10.2v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  /* Contexts. Sizes are the production figures; catalog height and the list tile widths are
   * re-measured from the rendered production markup (measureSizes). catalogShort / catalogTall are
   * the inspector's windows for the same Catalog crop on the shortest / tallest real card. */
  const CTX = {
    catalog:      { label: 'Catalog strip',      w: 95,    h: 190, hint: '.card-art — 95px × card height' },
    prep:         { label: 'Prep thumbnail',     w: 48,    h: 48,  hint: '.prep-thumb — 48 × 48' },
    listsHero:    { label: 'Lists · single',     w: 318,   h: 90,  hint: '.list-card-cover, one tile' },
    listsPanel2:  { label: 'Lists · 2-up panel', w: 158.5, h: 90,  hint: '.list-card-cover, two tiles' },
    listsPanel3:  { label: 'Lists · 3-up panel', w: 105.3, h: 90,  hint: '.list-card-cover, three tiles' },
    catalogShort: { label: 'Catalog · short card', w: 95,  h: 150, crop: 'catalog', inspOnly: true },
    catalogTall:  { label: 'Catalog · tall card',  w: 95,  h: 300, crop: 'catalog', inspOnly: true },
  };
  const CTX_KEYS = ['catalog', 'prep', 'listsHero', 'listsPanel2', 'listsPanel3'];
  const INSP_KEYS = [...CTX_KEYS, 'catalogShort', 'catalogTall'];
  const COLORS = { catalog: '#ffd166', prep: '#ef476f', listsHero: '#06d6a0', listsPanel2: '#4cc9f0', listsPanel3: '#c77dff', catalogShort: '#ff9f43', catalogTall: '#c9a227' };
  const cropKey = k => CTX[k].crop || k;
  const centerCrop = () => ({ x: 50, y: 50, z: 1 });

  /* Informed starting points, NOT visually approved. Haunted's are V1's, unchanged (V1 parity).
   * The others are derived from where the focal subject sits in each master:
   *   ruins  — entrance arch x≈62 %, statues x≈48–73 %, y≈25–62 %
   *   arcane — tower + orb x≈54–70 % (centre 62 %), y≈2–50 %
   *   feasts — statue x≈45 %, chandeliers x≈24 % / 78 %, window x≈63 %, tables y≈55–75 % */
  const REC = {
    'haunted-and-deathly': {
      catalog:     { landscape: { x: 64, y: 50, z: 1 }, portrait: { x: 90, y: 50, z: 1 } },
      prep:        { landscape: { x: 77, y: 50, z: 1 }, portrait: { x: 30, y: 30, z: 1 } },
      listsHero:   { landscape: { x: 50, y: 34, z: 1 }, portrait: { x: 50, y: 43, z: 1 } },
      listsPanel2: { landscape: { x: 50, y: 40, z: 1 }, portrait: { x: 50, y: 40, z: 1 } },
      listsPanel3: { landscape: { x: 88, y: 40, z: 1 }, portrait: { x: 50, y: 36, z: 1 } },
    },
    'forgotten-ruins': {
      catalog:     { landscape: { x: 67, y: 50, z: 1 } },
      prep:        { landscape: { x: 80, y: 40, z: 1 } },
      listsHero:   { landscape: { x: 50, y: 38, z: 1 } },
      listsPanel2: { landscape: { x: 50, y: 25, z: 1 } },
      listsPanel3: { landscape: { x: 90, y: 30, z: 1 } },
    },
    'arcane-sanctums': {
      catalog:     { landscape: { x: 67, y: 50, z: 1 } },
      prep:        { landscape: { x: 79, y: 30, z: 1 } },
      listsHero:   { landscape: { x: 50, y: 8, z: 1 } },
      listsPanel2: { landscape: { x: 60, y: 30, z: 1 } },
      listsPanel3: { landscape: { x: 85, y: 30, z: 1 } },
    },
    'feasts-and-revelry': {
      catalog:     { landscape: { x: 50, y: 50, z: 1 } },
      prep:        { landscape: { x: 50, y: 50, z: 1 } },
      listsHero:   { landscape: { x: 50, y: 40, z: 1 } },
      listsPanel2: { landscape: { x: 50, y: 50, z: 1 } },
      listsPanel3: { landscape: { x: 45, y: 40, z: 1 } },
    },
  };
  const rec = (a, ctx, s) => (REC[a][ctx][s] || centerCrop());
  const defaultPicks = a => ({ catalog: hasSrc(a, 'portrait') ? 'portrait' : 'landscape', prep: hasSrc(a, 'portrait') ? 'portrait' : 'landscape', listsHero: 'landscape', listsPanel2: 'landscape', listsPanel3: 'landscape' });

  const clone = o => JSON.parse(JSON.stringify(o));
  const freshCrops = a => { const o = {}; CTX_KEYS.forEach(k => { o[k] = {}; Object.keys(ARTWORKS[a].sources).forEach(s => { o[k][s] = { ...rec(a, k, s) }; }); }); return o; };
  const state = {
    arch: 'haunted-and-deathly', ctx: 'catalog', mode: 'compare', basis: 'working',
    srcOf: {}, envOf: {}, crops: {}, filter: {}, picks: {}, inspOf: {},
    overlay: true, overlayCtx: new Set(CTX_KEYS),
  };
  ARCHS.forEach(a => {
    state.srcOf[a] = hasSrc(a, 'portrait') ? 'portrait' : 'landscape';
    state.crops[a] = freshCrops(a); state.filter[a] = { b: 100, c: 100 }; state.picks[a] = defaultPicks(a);
    state.inspOf[a] = 'landscape';
  });

  let ENVS = [], BY_ID = {}, T = {}, PRIMARY = {}, ARCH_ENVS = {}, AUDIT = {}, SCORECARD = null;
  const heightCache = {};

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = k => T[k] || k;
  const fmt = n => (Math.round(n * 10) / 10).toString();
  const A = () => state.arch;
  const env = () => BY_ID[state.envOf[state.arch]];
  const verdictOf = (a, id) => ((AUDIT[a] || {}).envs || {})[id] || null;
  const VERDICT = { strong: 'Strong visual match', acceptable: 'Acceptable thematic match', poor: 'Poor visual match — prefer biome fallback' };

  function artBiome(e) {
    let pool = (e.biomes || []).filter(b => BIOMES.includes(b));
    for (const g of GENERIC_BIOMES) { if (pool.length < 2) break; pool = pool.filter(b => b !== g); }
    return pool[0] || null;
  }
  const biomeUrl = b => `${ROOT}img/biomes/${b}-200.webp`;
  const srcLabel = (a, s) => s === 'biome' ? 'Current biome artwork' : `${ARTWORKS[a].name} ${srcShort(a, s)}`;
  const newVariants = a => (state.mode === 'compare' || state.srcOf[a] === 'biome') ? srcKeys(a) : [state.srcOf[a]];
  const variants = a => state.mode === 'compare' ? ['biome', ...srcKeys(a)] : [state.srcOf[a]];
  /* a real (non-biome) source for this archetype in this context */
  function realSrc(a, ctx) { const p = state.picks[a][ctx]; return p !== 'biome' && hasSrc(a, p) ? p : 'landscape'; }
  function activeNew(ctx, a = state.arch) { const s = state.srcOf[a]; return s !== 'biome' && hasSrc(a, s) ? s : realSrc(a, ctx); }
  const memberEnvs = (a, nonPoor) => ARCH_ENVS[a].filter(id => !nonPoor || (verdictOf(a, id) || {}).v !== 'poor').map(id => BY_ID[id]);

  const cropAt = (a, ctx, s) => state.basis === 'center' ? centerCrop() : state.crops[a][cropKey2(ctx)][s];
  const cropKey2 = ctx => ctx in CTX ? cropKey(ctx) : ctx;

  /* The crop window: what CSS does for `object-fit: cover; object-position: x% y%` followed by
   * `transform: scale(z)` about the same point, as fractions of the master. Uses the real aspect of
   * the source being shown — 16:9, 3:2 and 2:3 all go through the same two lines. */
  function visibleRect(a, srcKey, ctxKey, c) {
    const s = SRC(a, srcKey), d = CTX[ctxKey];
    const I = s.w / s.h, Ar = d.w / d.h;
    let fw = 1, fh = 1;
    if (I > Ar) fw = Ar / I; else fh = I / Ar;
    const ax = (off, f, p, z) => [off + f * (p - p / z), off + f * (p + (1 - p) / z)];
    const px = c.x / 100, py = c.y / 100;
    const [x0, x1] = ax((1 - fw) * px, fw, px, c.z);
    const [y0, y1] = ax((1 - fh) * py, fh, py, c.z);
    return { l: x0, t: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* ---------- production markup, reproduced ---------- */
  function biomeArtHtml(e) {
    const b = artBiome(e);
    if (!b) return '';
    const base = ROOT + 'img/biomes/' + b;
    const avif = [100, 200, 250, 300].map(w => `${base}-${w}.avif ${w}w`).join(', ');
    return `<div class="card-art"><picture>
          <source type="image/avif" sizes="95px" srcset="${avif}">
          <img src="${base}-200.webp" alt="" decoding="async"></picture></div>`;
  }
  const newArtImg = (ctx, src, a = state.arch) => `<img class="lab-crop" data-crop="${ctx}" data-arch="${a}" data-src="${src}" src="${SRC(a, src).url}" alt="" decoding="async">`;

  function catalogCard(e, src, a = state.arch) {
    const impulses = (e.impulses && e.impulses.en) || [];
    const lore = (e.lore && e.lore.en) || '';
    const biomeChips = (e.biomes || []).map(b => `<span class="biome-chip">${esc(t('biome_' + b))}</span>`).join('');
    const tier = EnvTierUtils.tierLabel(e);
    const art = src === 'biome' ? biomeArtHtml(e) : `<div class="card-art">${newArtImg('catalog', src, a)}</div>`;
    return `<article class="card" data-id="${esc(e.id)}">
      <span class="rank-icon rank-icon-sm active card-tier-badge" role="img" aria-label="Tier ${tier}"><span aria-hidden="true">${tier}</span></span>
      ${art}
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-title"><a class="card-open" href="javascript:void(0)" tabindex="-1">${esc(e.name.en)}</a></h3>
          <div class="env-actions"><button type="button" class="card-add-btn" tabindex="-1" aria-label="${esc(t('add_to_list'))}">${ICON_BOOKMARK}</button></div>
        </div>
        ${lore ? `<p class="card-lore">${esc(lore)}</p>` : ''}
        ${impulses.length ? `<div class="card-impulses"><span class="card-impulses-label">${esc(t('impulses_label'))}:</span> ${esc(impulses.join(', '))}</div>` : ''}
        <div class="card-meta"><span class="environment-type-chip">${esc(t('type_' + e.type))}</span>${biomeChips}</div>
      </div>
    </article>`;
  }

  function prepThumb(e, src, a) {
    if (src === 'biome') {
      const b = artBiome(e);
      return b ? `<img class="prep-thumb" src="${biomeUrl(b)}" alt="" decoding="async">` : '<span class="prep-thumb prep-thumb-fallback"></span>';
    }
    return `<span class="prep-thumb lab-thumb">${newArtImg('prep', src, a)}</span>`;
  }
  function prepRow(e, src, checked, a = state.arch) {
    const b = artBiome(e);
    return `<div class="prep-row prep-env-row">
      <label class="prep-checkbox-hit"><input type="checkbox" class="prep-select-checkbox" ${checked ? 'checked' : ''} tabindex="-1" aria-label="Select ${esc(e.name.en)}"></label>
      <button type="button" class="prep-row-open" tabindex="-1">
        ${prepThumb(e, src, a)}
        <span class="prep-row-text"><span class="prep-row-name">${esc(e.name.en)}</span>
        <span class="prep-row-meta">Tier ${EnvTierUtils.tierLabel(e)} · ${esc(t('type_' + e.type))}${b ? ' · ' + esc(t('biome_' + b)) : ''}</span></span>
      </button></div>`;
  }

  /* One cover tile. kind: 'new' (arch, src) | 'env' (id) | 'biome' (biome) */
  function coverTile(tile, n) {
    if (tile.kind === 'new') return `<div class="lab-tile">${newArtImg(n === 1 ? 'listsHero' : n === 2 ? 'listsPanel2' : 'listsPanel3', tile.src || realSrc(tile.arch, n === 1 ? 'listsHero' : n === 2 ? 'listsPanel2' : 'listsPanel3'), tile.arch)}</div>`;
    if (tile.kind === 'biome') return `<div class="lab-tile"><img src="${biomeUrl(tile.biome)}" alt="" style="object-position:50% 38%"></div>`;
    const base = ROOT + 'img/env/thumb/' + tile.id;
    const sizes = n === 1 ? '320px' : n === 2 ? '160px' : '107px';
    const avif = [200, 400, 800].map(w => `${base}-${w}.avif ${w}w`).join(', ');
    const focus = ENV_ART_FOCUS[tile.id] ? ` style="--focus:${ENV_ART_FOCUS[tile.id]}"` : '';
    return `<picture><source type="image/avif" sizes="${sizes}" srcset="${avif}"><img src="${base}-400.webp" alt="" decoding="async"${focus}></picture>`;
  }
  function listCard(name, count, tiles) {
    const cover = tiles.length ? `<div class="list-card-cover" aria-hidden="true">${tiles.map(x => coverTile(x, tiles.length)).join('')}</div>` : '';
    return `<div class="list-card${tiles.length ? ' has-cover' : ''}">${cover}
      <div class="list-card-top">
        <input type="text" value="${esc(name)}" class="list-rename" aria-label="${esc(t('rename_list_label'))}">
        <button type="button" class="icon-btn icon-btn--danger icon-btn--reach list-card-del" tabindex="-1" aria-label="${esc(t('delete'))}">${ICON_TRASH}</button>
      </div>
      <div class="list-card-count">${esc(t('list_env_count').replace('{n}', count))}</div>
      <button type="button" class="btn btn-sm list-card-open lab-fake-btn" tabindex="-1">${esc(t('open_list'))}</button>
    </div>`;
  }

  const tag = (label, ctx, src, a = state.arch) => `<div class="variant-tag"><b>${esc(label)}</b><span data-tag="${a}|${ctx}|${src}"></span></div>`;
  const plainTag = (label, sub) => `<div class="variant-tag"><b>${esc(label)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  const variant = (label, ctx, src, inner, a = state.arch) => `<div class="variant">${tag(label, ctx, src, a)}${inner}</div>`;
  const plainVariant = (label, sub, inner) => `<div class="variant">${plainTag(label, sub)}${inner}</div>`;

  /* generic fixed-size window onto a source (matrix, stress, inspector, gallery) */
  function box(ctx, src, scale = 1, a = state.arch, hOverride) {
    const d = CTX[ctx];
    const style = `width:${d.w * scale}px;height:${(hOverride || d.h) * scale}px`;
    const inner = src === 'biome'
      ? `<img src="${biomeUrl(state.biomeForBox || 'settlement')}" alt="" style="object-position:${ctx === 'catalog' ? '50% 0%' : '50% 38%'}">`
      : newArtImg(cropKey(ctx), src, a);
    return `<div class="lab-box" style="${style}">${inner}</div>`;
  }

  /* ---------- catalog heights: measured from the real card, never faked ---------- */
  function heightsFor(a) {
    const host = $('#measure-grid'), width = $('#catalog-cards').clientWidth;
    const key = a + '|' + width;
    if (heightCache[key]) return heightCache[key];
    const cands = memberEnvs(a, true);
    host.style.width = width + 'px';
    host.innerHTML = cands.map(e => catalogCard(e, 'biome', a)).join('');
    const rows = [...host.querySelectorAll('.card')].map((c, i) => ({ id: cands[i].id, h: Math.round(c.offsetHeight) }));
    host.innerHTML = '';
    rows.sort((p, q) => p.h - q.h);
    if (!rows.length) return (heightCache[key] = []);
    const short = rows[0], tall = rows[rows.length - 1];
    const target = (short.h + tall.h) / 2;
    const med = rows.filter(r => r !== short && r !== tall).sort((p, q) => Math.abs(p.h - target) - Math.abs(q.h - target))[0];
    const out = [['Short', short], ['Medium', med], ['Tall', tall]].filter(([, r]) => r).filter(([, r], i, arr) => arr.findIndex(([, x]) => x.id === r.id) === i);
    return (heightCache[key] = out.map(([label, r]) => ({ label, id: r.id, h: r.h })));
  }

  /* ---------- sections ---------- */
  function renderInventory() {
    const rows = ARCHS.map(a => {
      const cell = s => {
        const x = ARTWORKS[a].sources[s];
        if (!x) return '<td class="inv-none">— none: one master only</td>';
        if (x.ok === false) return `<td class="inv-bad">MISSING — place at <code>${esc(x.master.replace(ROOT, ''))}</code></td>`;
        return `<td><b>${x.mw}×${x.mh}</b> master · ${ratioName(x.mw / x.mh)} <small>${x.bytes ? (x.bytes / 1048576).toFixed(1) + ' MB' : ''}<br>lab preview ${x.w}×${x.h}</small></td>`;
      };
      const wide = SRC(a, 'landscape');
      return `<tr><th>${esc(ARTWORKS[a].name)}<small><code>${a}</code></small></th>
        <td class="inv-thumb">${wide && wide.ok !== false ? `<img src="${wide.url}" alt="" width="120" height="${Math.round(120 * wide.h / wide.w)}">` : ''}</td>
        ${cell('landscape')}${cell('portrait')}<td>${(AUDIT[a] && AUDIT[a].scene) ? esc(AUDIT[a].scene) : ''}</td></tr>`;
    }).join('');
    $('#inventory').innerHTML = '<tr><th>Archetype</th><th></th><th>Landscape master</th><th>Portrait master</th><th>Scene</th></tr>' + rows;
    if (SCORECARD) {
      const head = `<tr>${SCORECARD.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>`;
      const body = SCORECARD.rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ` class="sc-${esc(String(c.v || '').split(' ')[0])}"` : ''}>${i ? `<b>${esc(c.v)}</b> ${esc(c.n || '')}` : esc(c)}</td>`).join('')}</tr>`).join('');
      $('#scorecard').innerHTML = `<h3>${esc(SCORECARD.title)}</h3><p class="lab-lead">${esc(SCORECARD.lead)}</p><div class="lab-matrix-wrap"><table class="lab-inv">${head}${body}</table></div>`;
    }
  }

  function renderCatalog() {
    const a = A(), e = env();
    $('#h-cat-selected').textContent = `Selected environment — ${e.name.en}`;
    $('#catalog-cards').innerHTML = variants(a).map(s => variant(srcLabel(a, s), 'catalog', s, catalogCard(e, s))).join('');
    const hs = heightsFor(a);
    $('#catalog-range-lead').textContent = hs.length
      ? `Heights are measured, not set: the card's own content decides, so these are the shortest, a middle and the tallest of ${ARTWORKS[a].name}'s ${memberEnvs(a, true).length} environments whose art is at least an acceptable match, each rendered at this grid's real card width. One crop setting serves all three.`
      : 'No measured cards.';
    $('#catalog-range').innerHTML = hs.map(r => {
      const e2 = BY_ID[r.id];
      return `<div class="lab-range-row"><h4>${r.label} card · ${esc(e2.name.en)} <small>${r.h} px tall</small></h4><div class="lab-grid3 grid">${variants(a).map(s => variant(srcLabel(a, s), 'catalog', s, catalogCard(e2, s))).join('')}</div></div>`;
    }).join('');
    $('#catalog-strips').innerHTML = ARCHS.map(x => {
      const s = activeNew('catalog', x);
      const hh = heightsFor(x);
      const bm = artBiome(BY_ID[(hh[1] || hh[0] || { id: ARCH_ENVS[x][0] }).id]) || 'settlement';
      return `<div class="variant">${plainTag(ARTWORKS[x].name, srcShort(x, s))}<div class="lab-strip-row">${hh.map(r => `<div class="lab-strip-col">${box('catalog', s, 1, x, r.h)}<small>${r.label.toLowerCase()} ${r.h}</small></div>`).join('')}<div class="lab-strip-col"><div class="lab-box" style="width:95px;height:${(hh[1] || hh[0] || { h: 190 }).h}px"><img src="${biomeUrl(bm)}" alt="" style="object-position:50% 0%"></div><small>biome now</small></div></div></div>`;
    }).join('');
  }

  function renderPrep() {
    const a = A(), e = env();
    const fill = fillerEnvs();
    const col = (label, s, rows, ta = a) => `<div class="lab-prep-col">${tag(label, 'prep', s, ta)}<div class="lab-prep-list">${rows.join('')}</div></div>`;
    const colP = (label, sub, rows) => `<div class="lab-prep-col">${plainTag(label, sub)}<div class="lab-prep-list">${rows.join('')}</div></div>`;
    $('#prep-compare').innerHTML = variants(a).map(s =>
      col(srcLabel(a, s), s, [prepRow(fill[0], 'biome', false), prepRow(e, s, true, a), prepRow(fill[1], 'biome', false)])).join('');

    /* Mixed: one fair-match environment per archetype, each in its own archetype's picked source. */
    const rep = ARCHS.map(x => ({ x, e: memberEnvs(x, true)[0], s: realSrc(x, 'prep') }));
    const listOf = mode => {
      const rows = [];
      if (mode === 'biome') {
        for (let i = 0; i < 8; i++) rows.push(prepRow(i % 2 ? rep[(i - 1) / 2].e : fill[(i / 2 | 0) % fill.length], 'biome', i === 2));
      } else if (mode === 'alt') {
        for (let i = 0; i < 8; i++) rows.push(i % 2 ? prepRow(rep[(i - 1) / 2].e, rep[(i - 1) / 2].s, false, rep[(i - 1) / 2].x) : prepRow(fill[(i / 2 | 0) % fill.length], 'biome', i === 2));
      } else {
        rep.forEach(r => rows.push(prepRow(r.e, r.s, false, r.x)));
        for (let i = 0; i < 4; i++) rows.push(prepRow(fill[i % fill.length], 'biome', i === 1));
      }
      return rows;
    };
    $('#prep-mixed').innerHTML =
      colP('Current: every row a biome thumbnail', '', listOf('biome')) +
      colP('New art on alternate rows', 'each archetype in its own pick', listOf('alt')) +
      colP('Four archetypes adjacent, then biome rows', 'can you tell them apart?', listOf('adj'));

    /* Repeated: five fair-match environments of ONE archetype, current vs new, side by side. */
    $('#prep-repeat').innerHTML = ARCHS.map(x => {
      const es = memberEnvs(x, true).slice(0, 5);
      return `<div class="lab-prep-col">${plainTag(ARTWORKS[x].name, 'biome thumbnails today')}<div class="lab-prep-list">${es.map(e2 => prepRow(e2, 'biome', false)).join('')}</div></div>`;
    }).join('') + ARCHS.map(x => {
      const es = memberEnvs(x, true).slice(0, 5), s = realSrc(x, 'prep');
      return `<div class="lab-prep-col">${tag(ARTWORKS[x].name + ' · one image ×' + es.length, 'prep', s, x)}<div class="lab-prep-list">${es.map(e2 => prepRow(e2, s, false, x)).join('')}</div></div>`;
    }).join('');
  }
  function fillerEnvs() {
    const seen = new Set(), out = [];
    const taken = new Set(Object.values(ARCH_ENVS).flat());
    for (const b of ['drylands', 'forest', 'mountain', 'aquatic', 'grassland', 'tropical', 'frozen', 'badlands']) {
      const e = ENVS.find(x => artBiome(x) === b && !taken.has(x.id) && !seen.has(x.id));
      if (e) { seen.add(e.id); out.push(e); }
    }
    return out;
  }

  /* An illustration of how an adaptive cover might pick up to three tiles from a list. NOT a rule:
   * unique env painting > strong archetype match > acceptable archetype match > biome, de-duplicated. */
  function illustrativeCover(ids) {
    const cands = [];
    ids.forEach((id, order) => {
      const e = BY_ID[id]; if (!e) return;
      const a = PRIMARY[id];
      let c = null;
      if (ENV_ART.has(id)) c = { key: 'env:' + id, rank: 0, order, tile: { kind: 'env', id }, label: `${e.name.en} painting` };
      else if (a && ARTWORKS[a] && verdictOf(a, id) && verdictOf(a, id).v !== 'poor') c = { key: 'art:' + a, rank: verdictOf(a, id).v === 'strong' ? 1 : 2, order, tile: { kind: 'new', arch: a }, label: `${ARTWORKS[a].short} art (${verdictOf(a, id).v}) via ${e.name.en}` };
      else { const b = artBiome(e); if (b) c = { key: 'biome:' + b, rank: 3, order, tile: { kind: 'biome', biome: b }, label: `${b} biome via ${e.name.en}${a && ARTWORKS[a] && verdictOf(a, id) ? ' (art judged poor)' : ''}` }; }
      if (c) cands.push(c);
    });
    const best = new Map();
    cands.forEach(c => { const p = best.get(c.key); if (!p || c.rank < p.rank || (c.rank === p.rank && c.order < p.order)) best.set(c.key, c); });
    return [...best.values()].sort((p, q) => p.rank - q.rank || p.order - q.order).slice(0, 3);
  }

  function renderLists() {
    const a = A();
    const fd = 'field-of-dreams', cv = 'cauldera-valley', op = 'ouroborean-pass';
    const N = (x, ctxn) => ({ kind: 'new', arch: x, src: realSrc(x, ctxn) });
    const N1 = x => N(x, 'listsHero'), N2 = x => N(x, 'listsPanel2'), N3 = x => N(x, 'listsPanel3');
    const nameOf = x => ARTWORKS[x].short;
    const biomeOf = id => ({ kind: 'biome', biome: artBiome(BY_ID[id]) || 'settlement' });
    const row = items => `<div class="lab-lists">${items.join('')}</div>`;
    const lc = (label, sub, name, n, tiles) => plainVariant(label, sub, listCard(name, n, tiles));
    const [H, R, AR, F] = ARCHS;
    const S = [];

    S.push(['A · Single archetype', 'Each artwork as a single wide cover next to what the list would show with a biome stand-in (production today draws no cover at all for such a list).',
      ARCHS.map(x => {
        const rep = memberEnvs(x, true)[0];
        const srcs = state.mode === 'compare' ? srcKeys(x) : [activeNew('listsHero', x)];
        return `<p class="lab-sublabel">${esc(ARTWORKS[x].name)} — ${esc(rep.name.en)}</p>` + row([
          lc('Production today — no cover', '', ARTWORKS[x].short + ' list', 1, []),
          lc('Biome stand-in', 'as a fallback', ARTWORKS[x].short + ' list', 1, [biomeOf(rep.id)]),
          ...srcs.map(s => variant(`${srcShort(x, s)} as wide hero`, 'listsHero', s, listCard(ARTWORKS[x].short + ' list', 1, [{ kind: 'new', arch: x, src: s }]), x)),
        ]);
      }).join('')]);

    S.push(['B · Two-image collage', 'Different brightness and color temperature, side by side. Each tile is the left / right half; the tags show each tile\'s own crop.',
      row([[H, R], [H, AR], [R, F], [AR, F], [F, H]].map(([x, y]) =>
        `<div class="variant">${tag(`${nameOf(x)} + ${nameOf(y)}`, 'listsPanel2', realSrc(x, 'listsPanel2'), x)}${tag(`${nameOf(y)} tile`, 'listsPanel2', realSrc(y, 'listsPanel2'), y)}${listCard(`${nameOf(x)} & ${nameOf(y)}`, 2, [N2(x), N2(y)])}</div>`))]);

    S.push(['C · Three-image collage', 'Three distinct archetypes in one cover; the tags give each panel\'s crop.',
      row([[H, R, AR], [R, AR, F], [H, R, F], [H, AR, F]].map(([x, y, z]) =>
        `<div class="variant">${tag(`${nameOf(x)} / ${nameOf(y)} / ${nameOf(z)}`, 'listsPanel3', realSrc(x, 'listsPanel3'), x)}${tag(`middle: ${nameOf(y)}`, 'listsPanel3', realSrc(y, 'listsPanel3'), y)}${tag(`right: ${nameOf(z)}`, 'listsPanel3', realSrc(z, 'listsPanel3'), z)}${listCard(`${nameOf(x)}, ${nameOf(y)}, ${nameOf(z)}`, 3, [N3(x), N3(y), N3(z)])}</div>`))]);

    S.push(['D · Mixed artwork sources', 'Production will need all three for a long time: a unique env painting, a new archetype illustration and a biome stand-in in one cover.',
      row([
        lc('painting · archetype · biome', 'Cauldera + Arcane + forest', 'Mixed one', 3, [{ kind: 'env', id: cv }, N3(AR), { kind: 'biome', biome: 'forest' }]),
        lc('archetype · painting · biome', 'Haunted + Field + badlands', 'Mixed two', 3, [N3(H), { kind: 'env', id: fd }, { kind: 'biome', biome: 'badlands' }]),
        lc('biome · archetype · painting', 'drylands + Feasts + Pass', 'Mixed three', 3, [{ kind: 'biome', biome: 'drylands' }, N3(F), { kind: 'env', id: op }]),
        lc('painting · archetype ×2', 'Cauldera + Ruins + Haunted', 'Mixed four', 3, [{ kind: 'env', id: cv }, N3(R), N3(H)]),
        lc('painting · archetype (2-up)', 'Field + Arcane', 'Mixed five', 2, [{ kind: 'env', id: fd }, N2(AR)]),
        lc('archetype · biome (2-up)', 'Feasts + mountain', 'Mixed six', 2, [N2(F), { kind: 'biome', biome: 'mountain' }]),
      ])]);

    S.push(['E · Repeated archetype', 'Real lists of 5–10 environments sharing ONE primary archetype. Left to right: one hero; every distinct image the members actually have (the archetype art plus their distinct biome art, up to three); and, for comparison only, the same image ×3.',
      ARCHS.map(x => {
        const members = ARCH_ENVS[x].slice(0, 10).map(id => BY_ID[id]);
        const biomes = [...new Set(members.map(artBiome).filter(Boolean))].slice(0, 2);
        const s = realSrc(x, 'listsPanel3');
        const distinct = [N3(x), ...biomes.map(b => ({ kind: 'biome', biome: b }))];
        return `<p class="lab-sublabel">${esc(ARTWORKS[x].name)} — ${members.length} environments · distinct images available: ${distinct.length} (${esc(['archetype art', ...biomes.map(b => b + ' biome')].join(', '))})</p>` + row([
          variant('Single representative hero', 'listsHero', realSrc(x, 'listsHero'), listCard(`${ARTWORKS[x].short}, ${members.length} places`, members.length, [N1(x)]), x),
          variant(`Distinct images (${distinct.length})`, 'listsPanel' + Math.max(2, Math.min(3, distinct.length)), s, listCard(`${ARTWORKS[x].short}, ${members.length} places`, members.length, distinct.length === 1 ? [N1(x)] : distinct.map((d, i) => d.kind === 'new' ? { ...d, src: realSrc(x, distinct.length === 2 ? 'listsPanel2' : 'listsPanel3') } : d)), x),
          variant('Problem: same image ×3', 'listsPanel3', s, listCard(`${ARTWORKS[x].short}, ${members.length} places`, members.length, [N3(x), N3(x), N3(x)]), x),
        ]);
      }).join('')]);

    const LISTS = [
      [1, ['cursed-graveyard']],
      [2, ['archmages-tower', 'grand-feast']],
      [3, ['forgotten-temple-of-the-serpent', 'eternal-observatory', 'masquerade-ball']],
      [5, [cv, 'haunted-mountain-pass', 'eternal-observatory', 'grand-feast', 'harsh-desert']],
      [10, ['cursed-graveyard', 'desecrated-graveyard', 'vampires-castle', 'deserted-moor', 'ruined-castle', 'korathi-temple', 'archmages-tower', 'magic-city', 'masquerade-ball', 'local-festival']],
    ];
    S.push(['F · Actual list variety', 'Real environments in lists of 1, 2, 3, 5 and 10, covered by an illustrative picker (unique painting, then strong archetype match, then acceptable, then biome; de-duplicated). It shows the mix an adaptive system would face — it is not the rule.',
      row(LISTS.map(([n, ids]) => {
        const pick = illustrativeCover(ids.filter(id => BY_ID[id]));
        const tiles = pick.map(p => p.tile.kind === 'new' ? { ...p.tile, src: realSrc(p.tile.arch, pick.length === 1 ? 'listsHero' : pick.length === 2 ? 'listsPanel2' : 'listsPanel3') } : p.tile);
        return `<div class="variant">${plainTag(`${n} environment${n > 1 ? 's' : ''}`, `${tiles.length} tile${tiles.length > 1 ? 's' : ''}`)}${listCard(`List of ${n}`, n, tiles)}<ul class="lab-why">${pick.map(p => `<li>${esc(p.label)}</li>`).join('')}</ul><p class="lab-members">${ids.map(id => esc(BY_ID[id] ? BY_ID[id].name.en : id)).join(' · ')}</p></div>`;
      }))]);

    S.push(['Regression baseline — existing unique artwork', 'Cauldera Valley, Field of Dreams and Ouroborean Pass: production markup and crops, untouched by any slider.',
      row([plainVariant('Current three-image cover', '', listCard('Painted places', 3, [{ kind: 'env', id: cv }, { kind: 'env', id: fd }, { kind: 'env', id: op }]))])]);

    $('#list-scenarios').innerHTML = S.map(([h, p, body]) => `<div class="lab-scenario"><h3>${h}</h3><p>${p}</p>${body}</div>`).join('');
  }

  function renderGallery() {
    $('#gallery-full').innerHTML = ARCHS.flatMap(a => srcKeys(a).map(s => {
      const x = SRC(a, s);
      return `<figure class="gal-fig${s === 'portrait' ? ' is-portrait' : ''}"><img src="${x.url}" alt="" style="${filterStyle(a)}"><figcaption><b>${esc(ARTWORKS[a].name)}</b> · ${srcWord(s)}<br>${x.mw}×${x.mh} master · ${ratioName(x.mw / x.mh)}</figcaption></figure>`;
    })).join('');
    $('#gallery-ui').innerHTML = `<tr><th>Archetype</th><th>${esc(CTX.catalog.label)}<small data-size="catalog"></small></th><th>${esc(CTX.prep.label)}</th><th>${esc(CTX.listsHero.label)}</th><th>${esc(CTX.listsPanel2.label)}</th><th>${esc(CTX.listsPanel3.label)}</th></tr>` +
      ARCHS.map(a => {
        const cell = ctx => { const s = activeSrcFor(a, ctx); const hh = heightsFor(a); return `<td>${box(ctx, s, 1, a, ctx === 'catalog' ? (hh[1] || hh[0] || { h: CTX.catalog.h }).h : undefined)}<div class="variant-tag"><span data-tag="${a}|${ctx}|${s}"></span></div></td>`; };
        return `<tr><td class="ctx-name">${esc(ARTWORKS[a].name)}<small>${esc(srcShort(a, activeSrcFor(a, 'catalog')))}${hasSrc(a, 'portrait') ? ' for strip + thumb' : ' only'}</small></td>${cell('catalog')}${cell('prep')}${cell('listsHero')}${cell('listsPanel2')}${cell('listsPanel3')}</tr>`;
      }).join('');
    const [H, R, AR, F] = ARCHS;
    const singles = ARCHS.map(a => variant(ARTWORKS[a].name, 'listsHero', realSrc(a, 'listsHero'), listCard(ARTWORKS[a].short + ' list', 1, [{ kind: 'new', arch: a, src: realSrc(a, 'listsHero') }]), a)).join('');
    const trio = (xs, name) => plainVariant(xs.map(x => ARTWORKS[x].short).join(' · '), '', listCard(name, 3, xs.map(x => ({ kind: 'new', arch: x, src: realSrc(x, 'listsPanel3') }))));
    $('#gallery-together').innerHTML =
      `<div class="variant">${plainTag('Catalog strips', 'one environment each')}<div class="lab-strip-row">${ARCHS.map(a => `<div class="lab-strip-col">${box('catalog', activeSrcFor(a, 'catalog'), 1, a)}<small>${ARTWORKS[a].short}</small></div>`).join('')}</div></div>
       <div class="variant">${plainTag('Prep thumbnails', '48 × 48')}<div class="lab-strip-row">${ARCHS.map(a => `<div class="lab-strip-col">${box('prep', activeSrcFor(a, 'prep'), 1, a)}<small>${ARTWORKS[a].short}</small></div>`).join('')}</div></div>
       <div class="lab-lists">${singles}${trio([H, R, AR], 'A library of three')}${trio([R, AR, F], 'Another three')}</div>`;
  }
  /* The source the lab would show for an archetype in a context, honoring the context's pick. */
  function activeSrcFor(a, ctx) { const p = state.picks[a][ctx]; return p !== 'biome' && hasSrc(a, p) ? p : 'landscape'; }
  const filterStyle = a => { const f = filterCss(a); return f ? `filter:${f}` : ''; };

  function renderStress() {
    const a = A();
    $('#stress-actual').innerHTML = variants(a).map(s => `<div class="variant">${tag(srcLabel(a, s), 'catalog', s)}
      <div style="display:flex;gap:var(--s-4);align-items:flex-end">${box('prep', s)}${box('catalog', s)}<div style="display:flex;flex-direction:column;gap:var(--s-2)">${box('listsHero', s)}<div style="display:flex;gap:2px">${box('listsPanel2', s)}${box('listsPanel3', s)}</div></div></div></div>`).join('');

    const src = activeNew('catalog');
    const brights = ['drylands', 'forest', 'tropical', 'grassland'].map(b => ENVS.find(e => artBiome(e) === b && !Object.values(ARCH_ENVS).flat().includes(e.id)));
    const hs = memberEnvs(a, true).slice(0, 2);
    const mix = [hs[0], brights[0], brights[1], brights[2], hs[1], brights[3]].filter(Boolean);
    $('#stress-multi').innerHTML = mix.map(e => { const mine = ARCH_ENVS[a].includes(e.id); return `<div class="variant">${mine ? tag(srcLabel(a, src), 'catalog', src) : plainTag('Production biome art')}${catalogCard(e, mine ? src : 'biome')}</div>`; }).join('');

    $('#stress-repeat').innerHTML = memberEnvs(a, true).slice(0, 6).map(e => catalogCard(e, src)).join('');

    $('#stress-four').innerHTML = ARCHS.map(x => { const e = memberEnvs(x, true)[0]; const s = activeSrcFor(x, 'catalog'); return `<div class="variant">${tag(ARTWORKS[x].name, 'catalog', s, x)}${catalogCard(e, s, x)}</div>`; }).join('');

    const surfaces = [['black', 'near-black #0a0807'], ['ink', 'page ground (--ink)'], ['card', 'card surface (--ink-card)'], ['parchment', 'parchment — brightest tone, for contrast reference']];
    const s2 = activeNew('prep');
    $('#stress-low').innerHTML = surfaces.map(([k, label]) => `<div class="surface" data-s="${k}"><small>${label}</small>${box('prep', s2, 1.5)}${box('catalog', activeNew('catalog'))}${box('listsHero', activeNew('listsHero'))}</div>`).join('');
  }

  function renderMatrix() {
    const a = A();
    const fillB = artBiome(env()) || 'settlement';
    state.biomeForBox = fillB;
    const cols = ['biome', ...srcKeys(a)];
    const head = `<tr><th>Context</th>${cols.map(c => `<th>${c === 'biome' ? 'Current biome' : esc(srcWord(c) + ' master · ' + ratioName(aspectOf(SRC(a, c))))}</th>`).join('')}</tr>`;
    const rows = CTX_KEYS.map(ctx => {
      const cell = s => `<td><div class="cell${state.picks[a][ctx] === s ? ' is-picked' : ''}">${box(ctx, s)}</div>
        <label class="pick"><input type="radio" name="pick-${ctx}" value="${s}" ${state.picks[a][ctx] === s ? 'checked' : ''} data-pick="${ctx}">use for ${esc(CTX[ctx].label)}</label>
        <div class="variant-tag" style="margin-top:2px"><span data-tag="${a}|${ctx}|${s}"></span></div></td>`;
      return `<tr><td class="ctx-name">${esc(CTX[ctx].label)}<small>${esc(CTX[ctx].hint)}<br><span data-size="${ctx}"></span></small></td>${cols.map(cell).join('')}</tr>`;
    }).join('');
    $('#matrix').innerHTML = head + rows;
    $('#matrix-note').textContent = hasSrc(a, 'portrait') ? '' : `${ARTWORKS[a].name} has one master (${srcShort(a, 'landscape')}); there is no Portrait column because there is no Portrait file.`;

    const land = c => 'landscape';
    const maps = {
      A: { name: 'A · Landscape only', note: `One ${srcShort(a, 'landscape')} master, per-context focal point.`, m: Object.fromEntries(CTX_KEYS.map(k => [k, 'landscape'])) },
      B: hasSrc(a, 'portrait')
        ? { name: 'B · Landscape + Portrait', note: 'Portrait for Catalog and Prep, landscape for Lists.', m: { catalog: 'portrait', prep: 'portrait', listsHero: 'landscape', listsPanel2: 'landscape', listsPanel3: 'landscape' } }
        : { name: 'B · Landscape + Portrait', note: `Not testable: ${ARTWORKS[a].name} has one master. The landscape-only strategy A is its whole case.`, m: null },
      C: { name: 'C · Adaptive', note: 'Whatever you picked in the matrix above, row by row.', m: state.picks[a] },
    };
    const fill = fillerEnvs();
    $('#strategies').innerHTML = Object.values(maps).map(({ name, note, m }) => {
      if (!m) return `<div class="lab-strategy is-na"><h4>${name}</h4><p>${esc(note)}</p></div>`;
      const pk = ctx => m[ctx] === 'biome' ? 'biome' : (hasSrc(a, m[ctx]) ? m[ctx] : 'landscape');
      const tileFor = ctx => m[ctx] === 'biome' ? { kind: 'biome', biome: fillB } : { kind: 'new', arch: a, src: pk(ctx) };
      return `<div class="lab-strategy"><h4>${name}</h4><p>${esc(note)}</p>
        ${catalogCard(env(), pk('catalog'))}
        <div class="lab-prep-list">${prepRow(fill[0], 'biome', false)}${prepRow(env(), pk('prep'), true)}${prepRow(fill[1], 'biome', false)}</div>
        ${listCard(`${ARTWORKS[a].short} list`, 1, [tileFor('listsHero')])}
        ${listCard('Night Road', 3, [{ kind: 'env', id: 'field-of-dreams' }, tileFor('listsPanel3'), { kind: 'env', id: 'ouroborean-pass' }])}
        ${listCard('Two places', 2, [tileFor('listsPanel2'), { kind: 'env', id: 'cauldera-valley' }])}
      </div>`;
    }).join('');
    document.querySelectorAll('.lab-strategy .list-card').forEach(c => { c.style.width = '100%'; });
  }

  function renderRelevance() {
    const sum = [];
    const body = ARCHS.map(a => {
      const ids = ARCH_ENVS[a];
      const by = { strong: [], acceptable: [], poor: [] };
      ids.forEach(id => { const v = verdictOf(a, id); (by[v ? v.v : 'acceptable']).push(id); });
      sum.push([a, by.strong.length, by.acceptable.length, by.poor.length]);
      const s = realSrc(a, 'prep');
      const row = id => {
        const e = BY_ID[id], v = verdictOf(a, id) || { v: 'acceptable', why: '—' };
        const lore = ((e.lore && e.lore.en) || '').replace(/\s+/g, ' ');
        return `<div class="rel-row rel-${v.v}"><div class="rel-thumbs">${box('prep', s, 1, a)}${prepThumb(e, 'biome', a)}</div>
          <div class="rel-text"><div class="rel-name">${esc(e.name.en)} <span class="rel-chip rel-chip-${v.v}">${esc(VERDICT[v.v])}</span></div>
          <div class="rel-meta">Tier ${EnvTierUtils.tierLabel(e)} · ${esc(t('type_' + e.type))} · ${esc((e.biomes || []).map(b => t('biome_' + b)).join(', '))}</div>
          <p class="rel-lore">“${esc(lore.length > 190 ? lore.slice(0, 187).trimEnd() + '…' : lore)}”</p>
          <p class="rel-why"><b>Read:</b> ${esc(v.why)}</p></div></div>`;
      };
      const grp = k => by[k].length ? `<h4 class="rel-h rel-h-${k}">${esc(VERDICT[k])} <small>${by[k].length}</small></h4><div class="rel-list">${by[k].map(row).join('')}</div>` : '';
      const wide = SRC(a, 'landscape');
      return `<div class="rel-arch"><div class="rel-head"><img src="${wide.url}" alt="" width="220"><div><h3>${esc(ARTWORKS[a].name)}</h3><p class="lab-note">${esc((AUDIT[a] || {}).scene || '')}</p><p class="rel-count"><b>${by.strong.length}</b> strong · <b>${by.acceptable.length}</b> acceptable · <b>${by.poor.length}</b> poor <span>of ${ids.length} assigned</span></p></div></div>${grp('strong')}${grp('acceptable')}${grp('poor')}</div>`;
    }).join('');
    $('#relevance').innerHTML = body;
  }

  /* ---------- inspector ---------- */
  function buildInspector() {
    $('#overlay-toggles').innerHTML = INSP_KEYS.map(k => `<button type="button" data-ov="${k}" aria-pressed="${state.overlayCtx.has(k)}" style="border-color:${COLORS[k]}55">${esc(CTX[k].label)}</button>`).join('');
    $('#insp-crops').innerHTML = INSP_KEYS.map(k => `<div class="insp-crop" data-icrop="${k}"><div class="variant-tag"><b style="color:${COLORS[k]}">${esc(CTX[k].label)}</b><span data-itag="${k}"></span></div><div data-ibox="${k}"></div></div>`).join('');
  }
  function updateInspector() {
    const a = A();
    const keys = srcKeys(a);
    if (!keys.includes(state.inspOf[a])) state.inspOf[a] = keys[0];
    const s = state.inspOf[a];
    $('#insp-seg').innerHTML = keys.map(k => `<button type="button" data-isrc="${k}" aria-pressed="${k === s}">${esc(srcShort(a, k))}</button>`).join('') +
      (keys.length === 1 ? '<span class="lab-seg-note">only one master exists</span>' : '');
    const hh = heightsFor(a);
    if (hh.length) { CTX.catalogShort.h = hh[0].h; CTX.catalogTall.h = hh[hh.length - 1].h; }
    const img = $('#insp-img');
    if (img.getAttribute('src') !== SRC(a, s).url) img.src = SRC(a, s).url;
    img.style.filter = filterCss(a);
    const stage = $('#insp-stage');
    stage.style.aspectRatio = `${SRC(a, s).w} / ${SRC(a, s).h}`;
    stage.querySelectorAll('.insp-rect').forEach(n => n.remove());
    if (state.overlay) {
      INSP_KEYS.forEach((k, i) => {
        if (!state.overlayCtx.has(k)) return;
        const r = visibleRect(a, s, k, cropAt(a, cropKey(k), s));
        const d = document.createElement('div');
        d.className = 'insp-rect' + (i % 2 ? ' is-top' : '');
        d.style.cssText = `--c:${COLORS[k]};left:${r.l * 100}%;top:${r.t * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
        d.innerHTML = `<span>${esc(CTX[k].label)}</span>`;
        stage.appendChild(d);
      });
    }
    INSP_KEYS.forEach(k => {
      const sc = k === 'listsHero' ? 1.5 : k.startsWith('catalog') ? 1.2 : k === 'prep' ? 3 : 2;
      const holder = $(`[data-ibox="${k}"]`);
      const sig = a + s + sc + CTX[k].w + CTX[k].h;
      if (holder.dataset.sig !== sig) { holder.innerHTML = box(k, s, sc, a); holder.dataset.sig = sig; applyCrops(); }
      const r = visibleRect(a, s, k, cropAt(a, cropKey(k), s));
      $(`[data-itag="${k}"]`).textContent = `${Math.round(r.w * 100)}% × ${Math.round(r.h * 100)}% of master`;
    });
    const x = SRC(a, s);
    $('#insp-caption').textContent = `${ARTWORKS[a].name} · ${srcShort(a, s)} · ${x.w}×${x.h} preview of a ${x.mw}×${x.mh} master. Windows use each context's crop for THIS source${state.basis === 'center' ? ' (center view is on)' : ''}; the original file is never marked.`;
  }

  /* ---------- crop application ---------- */
  function filterCss(a = A()) { const f = state.filter[a]; return (f.b === 100 && f.c === 100) ? '' : `brightness(${f.b / 100}) contrast(${f.c / 100})`; }
  function applyCrops() {
    document.querySelectorAll('img[data-crop]').forEach(img => {
      const a = img.dataset.arch, s = img.dataset.src;
      const c = cropAt(a, img.dataset.crop, s);
      img.style.objectPosition = `${c.x}% ${c.y}%`;
      img.style.transformOrigin = `${c.x}% ${c.y}%`;
      img.style.transform = c.z === 1 ? '' : `scale(${c.z})`;
      img.style.filter = filterCss(a);
    });
    document.querySelectorAll('[data-tag]').forEach(n => {
      const [a, ctx, src] = n.dataset.tag.split('|');
      if (src === 'biome') { n.textContent = 'production crop'; return; }
      if (src === 'x' || !state.crops[a][ctx] || !state.crops[a][ctx][src]) { n.textContent = ''; return; }
      const c = cropAt(a, ctx, src);
      n.textContent = `x ${c.x}% · y ${c.y}% · ${c.z.toFixed(2)}×${state.basis === 'center' ? ' (center view)' : ''}`;
      n.parentElement.parentElement.classList.toggle('is-edited', a === state.arch && ctx === state.ctx && src === state.srcOf[a]);
    });
  }

  /* ---------- export ---------- */
  const cropOut = c => ({ x: c.x, y: c.y, zoom: c.z });
  function configObject() {
    const archetypes = {};
    ARCHS.forEach(a => {
      const crops = {}, allSources = {};
      CTX_KEYS.forEach(k => {
        const pick = state.picks[a][k];
        const raw = pick !== 'biome' && hasSrc(a, pick) ? state.crops[a][k][pick] : null;
        crops[k] = raw ? { source: pick, ...cropOut(raw), recommended: cropOut(rec(a, k, pick)), edited: JSON.stringify(raw) !== JSON.stringify(rec(a, k, pick)) } : { source: 'biome' };
        allSources[k] = {}; srcKeys(a).forEach(s => { allSources[k][s] = cropOut(state.crops[a][k][s]); });
      });
      const f = state.filter[a];
      archetypes[a] = {
        name: ARTWORKS[a].name,
        sources: Object.fromEntries(srcKeys(a).map(s => [s, { file: SRC(a, s).master.replace(ROOT, ''), master: `${SRC(a, s).mw}x${SRC(a, s).mh}`, aspect: ratioName(SRC(a, s).mw / SRC(a, s).mh) }])),
        portrait: hasSrc(a, 'portrait') ? 'available' : 'none — landscape-only',
        adjustments: { brightness: f.b / 100, contrast: f.c / 100, note: 'lab-only preview filter; never applied automatically' },
        crops, allSources,
        relevance: (() => { const o = { strong: 0, acceptable: 0, poor: 0 }; ARCH_ENVS[a].forEach(id => { const v = verdictOf(a, id); if (v) o[v.v]++; }); return o; })(),
      };
    });
    return {
      lab: 'Artwork Crop Lab V2',
      status: 'lab export — recommended values are provisional until visually approved; not production configuration',
      selectedArchetype: state.arch,
      archetypes,
    };
  }
  function cssText() {
    const a = A(), out = [], f = filterCss(a);
    CTX_KEYS.forEach(k => {
      srcKeys(a).forEach(s => {
        const c = state.crops[a][k][s];
        const picked = state.picks[a][k] === s ? '  /* strategy C pick */' : '';
        out.push(`/* ${a} · ${k} — ${s}${picked} */\nobject-fit: cover;\nobject-position: ${c.x}% ${c.y}%;` +
          (c.z === 1 ? '' : `\ntransform: scale(${c.z.toFixed(2)});\ntransform-origin: ${c.x}% ${c.y}%;`) +
          (f ? `\nfilter: ${f};` : ''));
      });
    });
    return out.join('\n\n');
  }
  function updateOutput() {
    $('#out-json').textContent = JSON.stringify(configObject(), null, 2);
    $('#out-css').textContent = cssText();
  }
  let toastTimer;
  function toast(msg) { const n = $('#toast'); n.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { n.textContent = ''; }, 2200); }
  async function copy(text, label) {
    try { await navigator.clipboard.writeText(text); toast(label + ' copied'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* no-op */ }
      ta.remove(); toast(ok ? label + ' copied' : 'Copy blocked — select the text below');
    }
  }

  /* ---------- controls ---------- */
  function syncControls() {
    const a = A();
    if (state.srcOf[a] !== 'biome' && !hasSrc(a, state.srcOf[a])) state.srcOf[a] = 'landscape';
    document.querySelectorAll('#arch-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.arch === a));
    document.querySelectorAll('#ctx-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ctx === state.ctx));
    document.querySelectorAll('#basis-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.basis === state.basis));
    document.querySelectorAll('#mode-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    const keys = ['biome', ...srcKeys(a)];
    $('#src-seg').innerHTML = keys.map(k => `<button type="button" data-src="${k}" aria-pressed="${k === state.srcOf[a]}">${k === 'biome' ? 'Existing biome' : esc(srcWord(k) + ' ' + ratioName(aspectOf(SRC(a, k))))}</button>`).join('') +
      (hasSrc(a, 'portrait') ? '' : '<span class="lab-seg-note" title="No Portrait option is offered because none exists">one master only</span>');
    const isBiome = state.srcOf[a] === 'biome';
    const c = isBiome ? centerCrop() : state.crops[a][state.ctx][state.srcOf[a]];
    ['x', 'y', 'z'].forEach(k => { const i = $('#' + k); i.value = c[k]; i.disabled = isBiome; });
    $('#x-val').textContent = c.x + '%'; $('#y-val').textContent = c.y + '%'; $('#z-val').textContent = c.z.toFixed(2) + '×';
    const f = state.filter[a];
    $('#b').value = f.b; $('#c').value = f.c;
    $('#b-val').textContent = f.b + '%'; $('#c-val').textContent = f.c + '%';
    document.querySelectorAll('#preset-chips button').forEach(b => { b.disabled = isBiome; });
    $('#reset-ctx').disabled = isBiome;
    $('#edit-note').textContent = isBiome
      ? 'Existing biome art is production-fixed (a pre-cut 1:3 strip, top-anchored) — it has no crop controls. Choose a source above to adjust framing.'
      : `Editing ${ARTWORKS[a].name} · ${CTX[state.ctx].label} · ${srcWord(state.srcOf[a])}: moves only that combination (cards, rows, covers, matrix, strategies, stress tests). Brightness / contrast are lab-only and belong to ${ARTWORKS[a].short}.${state.basis === 'center' ? ' Editing leaves Center view.' : ''}`;
    const sel = $('#env-select');
    sel.innerHTML = ARCH_ENVS[a].map(id => { const v = verdictOf(a, id); return `<option value="${esc(id)}">${esc(BY_ID[id].name.en)}${v ? ' · ' + v.v : ''}</option>`; }).join('');
    sel.value = state.envOf[a];
    document.querySelectorAll('#arch-seg button').forEach(b => { b.disabled = !hasSrc(b.dataset.arch, 'landscape') && !hasSrc(b.dataset.arch, 'portrait'); });
  }
  function setCrop(patch) {
    const a = A(), s = state.srcOf[a];
    if (s === 'biome') return;
    if (state.basis === 'center') state.basis = 'working';
    Object.assign(state.crops[a][state.ctx][s], patch);
    syncBasis(); syncControls(); applyCrops(); updateInspector(); updateOutput();
  }
  function syncBasis() { document.querySelectorAll('#basis-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.basis === state.basis)); }

  function bindControls() {
    $('#arch-seg').innerHTML = ARCHS.map(a => `<button type="button" data-arch="${a}">${esc(ARTWORKS[a].name)}</button>`).join('');
    $('#ctx-seg').innerHTML = CTX_KEYS.map(k => `<button type="button" data-ctx="${k}">${esc(CTX[k].label)}</button>`).join('');
    const PRE = {
      Recommended: (a, ctx, s) => ({ ...rec(a, ctx, s) }), Center: () => ({ x: 50, y: 50, z: 1 }),
      'Left-biased': () => ({ x: 8, y: 50 }), 'Right-biased': () => ({ x: 92, y: 50 }),
      'Top-biased': () => ({ x: 50, y: 8 }), 'Bottom-biased': () => ({ x: 50, y: 92 }),
    };
    $('#preset-chips').innerHTML = Object.keys(PRE).map(n => `<button type="button" data-preset="${n}" aria-pressed="false">${n}</button>`).join('');
    $('#preset-chips').addEventListener('click', e => {
      const b = e.target.closest('button[data-preset]'); if (!b || b.disabled) return;
      setCrop(PRE[b.dataset.preset](A(), state.ctx, state.srcOf[A()]));
    });
    $('#arch-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) { state.arch = b.dataset.arch; syncControls(); renderAllSections(); } });
    $('#ctx-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.ctx = b.dataset.ctx; syncControls(); applyCrops(); } });
    $('#src-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.srcOf[A()] = b.dataset.src; syncControls(); renderAllSections(); } });
    $('#mode-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.mode = b.dataset.mode; syncControls(); renderAllSections(); } });
    $('#basis-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.basis = b.dataset.basis; syncBasis(); applyCrops(); updateInspector(); } });
    $('#x').addEventListener('input', e => setCrop({ x: +e.target.value }));
    $('#y').addEventListener('input', e => setCrop({ y: +e.target.value }));
    $('#z').addEventListener('input', e => setCrop({ z: +(+e.target.value).toFixed(2) }));
    $('#b').addEventListener('input', e => { state.filter[A()].b = +e.target.value; syncControls(); applyCrops(); updateInspector(); updateOutput(); renderGallery(); applyCrops(); });
    $('#c').addEventListener('input', e => { state.filter[A()].c = +e.target.value; syncControls(); applyCrops(); updateInspector(); updateOutput(); renderGallery(); applyCrops(); });
    $('#reset-ctx').addEventListener('click', () => { const a = A(), s = state.srcOf[a]; if (s === 'biome') return; state.crops[a][state.ctx][s] = { ...rec(a, state.ctx, s) }; syncControls(); applyCrops(); updateInspector(); updateOutput(); toast('Reset'); });
    $('#reset-arch').addEventListener('click', () => { const a = A(); state.crops[a] = freshCrops(a); state.filter[a] = { b: 100, c: 100 }; state.picks[a] = defaultPicks(a); syncControls(); renderAllSections(); toast(ARTWORKS[a].name + ' reset'); });
    $('#reset-all').addEventListener('click', () => { ARCHS.forEach(a => { state.crops[a] = freshCrops(a); state.filter[a] = { b: 100, c: 100 }; state.picks[a] = defaultPicks(a); }); state.basis = 'working'; syncControls(); renderAllSections(); toast('Everything reset'); });
    $('#collapse').addEventListener('click', e => { const c = $('#controls').classList.toggle('is-collapsed'); e.target.textContent = c ? 'Expand ▾' : 'Collapse ▴'; e.target.setAttribute('aria-expanded', !c); stickyOffset(); });
    $('#copy-json').addEventListener('click', () => copy($('#out-json').textContent, 'JSON'));
    $('#copy-css').addEventListener('click', () => copy($('#out-css').textContent, 'CSS'));
    $('#env-select').addEventListener('change', e => { state.envOf[A()] = e.target.value; renderAllSections(); });
    $('#insp-seg').addEventListener('click', e => { const b = e.target.closest('button[data-isrc]'); if (b) { state.inspOf[A()] = b.dataset.isrc; updateInspector(); } });
    $('#overlay-on').addEventListener('change', e => { state.overlay = e.target.checked; updateInspector(); });
    $('#overlay-toggles').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.ov; state.overlayCtx.has(k) ? state.overlayCtx.delete(k) : state.overlayCtx.add(k);
      b.setAttribute('aria-pressed', state.overlayCtx.has(k)); updateInspector();
    });
    $('#matrix').addEventListener('change', e => {
      const r = e.target.closest('input[data-pick]'); if (!r) return;
      state.picks[A()][r.dataset.pick] = r.value; renderMatrix(); renderStress(); renderGallery(); applyCrops(); updateOutput();
    });
    $('#lab-nav').addEventListener('click', e => {
      const l = e.target.closest('a'); if (!l) return;
      e.preventDefault();
      const target = document.getElementById(l.getAttribute('href').slice(1));
      if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - stickyOffset(), behavior: 'smooth' });
    });
    window.addEventListener('resize', () => { Object.keys(heightCache).forEach(k => delete heightCache[k]); renderAllSections(); });
  }
  function stickyOffset() { const h = $('#controls').offsetHeight + 12; document.documentElement.style.setProperty('--lab-sticky', h + 'px'); return h; }

  /* ---------- rendering driver + measuring real production boxes ---------- */
  let measuring = false;
  function renderAllSections() {
    state.biomeForBox = artBiome(env()) || 'settlement';
    renderCatalog(); renderPrep(); renderLists(); renderGallery(); renderStress(); renderMatrix(); renderRelevance();
    applyCrops(); updateOutput(); updateInspector(); renderInventory();
    stickyOffset();
    if (!measuring) { measuring = true; setTimeout(() => { measuring = false; measureOnce(); }, 30); }
  }
  /* measure() re-renders the sized boxes once with real numbers; guard against looping. */
  function measureOnce() {
    const before = JSON.stringify(CTX);
    measureSizes();
    if (JSON.stringify(CTX) !== before) { renderGallery(); renderStress(); renderMatrix(); document.querySelectorAll('#insp-crops [data-ibox]').forEach(h => { h.dataset.sig = ''; }); applyCrops(); updateInspector(); }
    labelSizes();
  }
  function measureSizes() {
    const art = document.querySelector('#catalog-cards .card-art');
    if (art && art.offsetHeight) { CTX.catalog.w = art.offsetWidth; CTX.catalog.h = art.offsetHeight; }
    const covers = [...document.querySelectorAll('#list-scenarios .list-card-cover')];
    const by = n => covers.find(c => c.children.length === n);
    const w = c => c ? c.children[0].getBoundingClientRect().width : null;
    if (by(1)) CTX.listsHero.w = w(by(1));
    if (by(2)) CTX.listsPanel2.w = w(by(2));
    if (by(3)) CTX.listsPanel3.w = w(by(3));
    if (covers[0]) { const h = covers[0].getBoundingClientRect().height; if (h) ['listsHero', 'listsPanel2', 'listsPanel3'].forEach(k => { CTX[k].h = h; }); }
    const th = document.querySelector('#prep-compare .prep-thumb');
    if (th && th.offsetWidth) { CTX.prep.w = th.offsetWidth; CTX.prep.h = th.offsetHeight; }
  }
  function labelSizes() {
    $('#catalog-dim').textContent = `Measured strip: ${CTX.catalog.w} × ${CTX.catalog.h} px (aspect ${(CTX.catalog.w / CTX.catalog.h).toFixed(2)}).`;
    $('#lists-dim').textContent = `Measured tiles: ${fmt(CTX.listsHero.w)} / ${fmt(CTX.listsPanel2.w)} / ${fmt(CTX.listsPanel3.w)} × ${fmt(CTX.listsHero.h)} px. Prep thumb ${CTX.prep.w} × ${CTX.prep.h}.`;
    document.querySelectorAll('[data-size]').forEach(n => { const d = CTX[n.dataset.size]; n.textContent = `${fmt(d.w)} × ${fmt(d.h)} px · ${(d.w / d.h).toFixed(2)}:1`; });
  }

  /* ---------- boot ---------- */
  const loadImage = url => new Promise(res => { const i = new Image(); i.onload = () => res({ ok: true, w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ ok: false }); i.src = url; });
  async function status() {
    const items = [];
    for (const a of ARCHS) {
      for (const k of Object.keys(ARTWORKS[a].sources)) {
        const s = ARTWORKS[a].sources[k];
        const [prev, master] = await Promise.all([loadImage(s.url), fetch(s.master, { method: 'HEAD' }).then(r => ({ ok: r.ok, bytes: +r.headers.get('content-length') || 0 })).catch(() => ({ ok: false }))]);
        s.ok = prev.ok; s.bytes = master.bytes;
        if (prev.ok) { s.w = prev.w; s.h = prev.h; }
        items.push([prev.ok, `${a} ${k} preview ${prev.ok ? prev.w + '×' + prev.h : 'MISSING: ' + s.url}`]);
        items.push([master.ok, `${a} ${k} master ${master.ok ? 'present, ' + (master.bytes / 1048576).toFixed(1) + ' MB (checked, never loaded)' : 'NOT FOUND at ' + s.master.replace(ROOT, '')}`]);
      }
    }
    $('#asset-status').innerHTML = items.map(([ok, txt]) => `<li class="${ok ? 'ok' : 'bad'}">${esc(txt)}</li>`).join('');
  }

  async function boot() {
    const [envs, i18n, cls, audit] = await Promise.all([
      fetch(ROOT + 'data/environments.json').then(r => r.json()),
      fetch(ROOT + 'data/i18n.json').then(r => r.json()),
      fetch(ROOT + 'docs/research/lists-cover-classification.json').then(r => r.json()),
      fetch('relevance-audit.json').then(r => r.json()),
    ]);
    ENVS = envs.environments; BY_ID = Object.fromEntries(ENVS.map(e => [e.id, e])); T = i18n.en;
    AUDIT = audit.archetypes; SCORECARD = audit.scorecard || null;
    cls.environments.forEach(e => { PRIMARY[e.id] = e.primary_archetype; });
    const order = { strong: 0, acceptable: 1, poor: 2 };
    ARCHS.forEach(a => {
      const ids = cls.environments.filter(e => e.primary_archetype === a).map(e => e.id).filter(id => BY_ID[id]);
      /* strong first, then acceptable, then poor; haunted keeps V1's two named environments in front */
      ARCH_ENVS[a] = ids.sort((p, q) => {
        const vp = (verdictOf(a, p) || { v: 'acceptable' }).v, vq = (verdictOf(a, q) || { v: 'acceptable' }).v;
        if (a === 'haunted-and-deathly') { if (p === 'cursed-graveyard') return -1; if (q === 'cursed-graveyard') return 1; if (p === 'vampires-castle') return -1; if (q === 'vampires-castle') return 1; }
        return order[vp] - order[vq];
      });
      state.envOf[a] = ARCH_ENVS[a][0];
    });
    bindControls(); buildInspector();
    await status();
    ARCHS.forEach(a => { if (!hasSrc(a, state.srcOf[a])) state.srcOf[a] = hasSrc(a, 'landscape') ? 'landscape' : state.srcOf[a]; });
    syncControls(); renderAllSections();
    document.fonts && document.fonts.ready.then(() => { Object.keys(heightCache).forEach(k => delete heightCache[k]); renderAllSections(); });
  }
  boot().catch(err => { document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#f88;padding:16px">Lab failed to start: ${esc(err.message)}\nServe the repo root (launch.json "atlas-lab", port 8107).</pre>`); console.error(err); });
})();
