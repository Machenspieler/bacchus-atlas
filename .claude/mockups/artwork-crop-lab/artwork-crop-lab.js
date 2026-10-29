/* Artwork Crop Lab — development-only. No storage, no production script, no writes.
 * Production markup is reproduced from js/app.js (cardHtml, biomeArtHtml,
 * envPickerRowHtml, listCardHtml, listCoverHtml) and styled by css/styles.css as-is.
 * Crop state lives in `state` below and nowhere else. */
(function () {
  'use strict';

  const ROOT = '../../../';
  const SRC = {
    landscape: { label: 'Haunted Landscape', short: 'Landscape 16:9', url: 'assets/haunted-landscape-1280.webp', master: ROOT + 'img/cover-archetypes-source/haunted-and-deathly-landscape.png', w: 1280, h: 720 },
    portrait:  { label: 'Haunted Portrait',  short: 'Portrait 2:3',   url: 'assets/haunted-portrait-800.webp',   master: ROOT + 'img/cover-archetypes-source/haunted-and-deathly-portrait.png',  w: 800,  h: 1200 },
  };
  const BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'settlement', 'universal'];
  const GENERIC_BIOMES = ['universal', 'settlement'];
  const ENV_ART_FOCUS = { 'field-of-dreams': '58%', 'ouroborean-pass': '42%' };
  const ICON_BOOKMARK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 6.5h15M9.8 6.5V4.9a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v1.6M6.8 6.5l.8 12.3a1 1 0 0 0 1 .9h6.8a1 1 0 0 0 1-.9l.8-12.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.4 10.2v6M13.6 10.2v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  /* Contexts. Sizes are the production figures; catalog height and the list tile
   * widths are re-measured from the rendered production markup (measure()). */
  const CTX = {
    catalog:     { label: 'Catalog strip',      w: 95,    h: 190, hint: '.card-art — 95px × card height' },
    prep:        { label: 'Prep thumbnail',     w: 48,    h: 48,  hint: '.prep-thumb — 48 × 48' },
    listsHero:   { label: 'Lists · single',     w: 318,   h: 90,  hint: '.list-card-cover, one tile' },
    listsPanel2: { label: 'Lists · 2-up panel', w: 158.5, h: 90,  hint: '.list-card-cover, two tiles' },
    listsPanel3: { label: 'Lists · 3-up panel', w: 105.3, h: 90,  hint: '.list-card-cover, three tiles' },
  };
  const CTX_KEYS = Object.keys(CTX);
  const COLORS = { catalog: '#ffd166', prep: '#ef476f', listsHero: '#06d6a0', listsPanel2: '#4cc9f0', listsPanel3: '#c77dff' };

  /* Informed starting points, derived from where the manor sits in each master
   * (landscape: facade x≈48–88 %, door x≈57 %, y≈30–60 %; portrait: facade x≈37–88 %,
   * door y≈47 %). NOT visually verified — adjust, then copy the settings out. */
  const REC = {
    catalog:     { landscape: { x: 64, y: 50, z: 1 }, portrait: { x: 90, y: 50, z: 1 } },
    prep:        { landscape: { x: 77, y: 50, z: 1 }, portrait: { x: 30, y: 30, z: 1 } },
    listsHero:   { landscape: { x: 50, y: 34, z: 1 }, portrait: { x: 50, y: 43, z: 1 } },
    listsPanel2: { landscape: { x: 50, y: 40, z: 1 }, portrait: { x: 50, y: 40, z: 1 } },
    listsPanel3: { landscape: { x: 88, y: 40, z: 1 }, portrait: { x: 50, y: 36, z: 1 } },
  };
  const DEFAULT_PICKS = { catalog: 'portrait', prep: 'portrait', listsHero: 'landscape', listsPanel2: 'landscape', listsPanel3: 'landscape' };

  const clone = o => JSON.parse(JSON.stringify(o));
  const state = {
    ctx: 'catalog', src: 'portrait', mode: 'compare', env: 'cursed-graveyard',
    crops: clone(REC), filter: { b: 100, c: 100 }, picks: { ...DEFAULT_PICKS },
    insp: 'landscape', overlay: true, overlayCtx: new Set(CTX_KEYS),
  };

  let ENVS = [], BY_ID = {}, T = {}, HAUNTED = [];

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = k => T[k] || k;
  const fmt = n => (Math.round(n * 10) / 10).toString();
  const edited = (ctx, src) => JSON.stringify(state.crops[ctx][src]) !== JSON.stringify(REC[ctx][src]);

  function artBiome(env) {
    let pool = (env.biomes || []).filter(b => BIOMES.includes(b));
    for (const g of GENERIC_BIOMES) { if (pool.length < 2) break; pool = pool.filter(b => b !== g); }
    return pool[0] || null;
  }
  const biomeUrl = b => `${ROOT}img/biomes/${b}-200.webp`;
  const newVariants = () => (state.mode === 'compare' || state.src === 'biome') ? ['landscape', 'portrait'] : [state.src];
  const variants = () => state.mode === 'compare' ? ['biome', 'landscape', 'portrait'] : [state.src];
  const activeNew = ctx => state.src !== 'biome' ? state.src : (state.picks[ctx] !== 'biome' ? state.picks[ctx] : 'portrait');
  const srcLabel = s => s === 'biome' ? 'Current biome artwork' : SRC[s].label;

  /* The crop windows. Mirrors what CSS does for `object-fit: cover; object-position: x% y%`
   * followed by `transform: scale(z)` about the same x% y% — returned as fractions of the master. */
  function visibleRect(srcKey, ctxKey, c) {
    const s = SRC[srcKey], d = CTX[ctxKey];
    const I = s.w / s.h, A = d.w / d.h;
    let fw = 1, fh = 1;
    if (I > A) fw = A / I; else fh = I / A;
    const ax = (off, f, p, z) => [off + f * (p - p / z), off + f * (p + (1 - p) / z)];
    const px = c.x / 100, py = c.y / 100;
    const [x0, x1] = ax((1 - fw) * px, fw, px, c.z);
    const [y0, y1] = ax((1 - fh) * py, fh, py, c.z);
    return { l: x0, t: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* ---------- production markup, reproduced ---------- */
  function biomeArtHtml(env) {
    const b = artBiome(env);
    if (!b) return '';
    const base = ROOT + 'img/biomes/' + b;
    const avif = [100, 200, 250, 300].map(w => `${base}-${w}.avif ${w}w`).join(', ');
    return `<div class="card-art"><picture>
          <source type="image/avif" sizes="95px" srcset="${avif}">
          <img src="${base}-200.webp" alt="" decoding="async"></picture></div>`;
  }
  const newArtImg = (ctx, src) => `<img class="lab-crop" data-crop="${ctx}" data-src="${src}" src="${SRC[src].url}" alt="" decoding="async">`;

  function catalogCard(env, src) {
    const impulses = (env.impulses && env.impulses.en) || [];
    const lore = (env.lore && env.lore.en) || '';
    const biomeChips = (env.biomes || []).map(b => `<span class="biome-chip">${esc(t('biome_' + b))}</span>`).join('');
    const tier = EnvTierUtils.tierLabel(env);
    const art = src === 'biome' ? biomeArtHtml(env) : `<div class="card-art">${newArtImg('catalog', src)}</div>`;
    return `<article class="card" data-id="${esc(env.id)}">
      <span class="rank-icon rank-icon-sm active card-tier-badge" role="img" aria-label="Tier ${tier}"><span aria-hidden="true">${tier}</span></span>
      ${art}
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-title"><a class="card-open" href="javascript:void(0)" tabindex="-1">${esc(env.name.en)}</a></h3>
          <div class="env-actions"><button type="button" class="card-add-btn" tabindex="-1" aria-label="${esc(t('add_to_list'))}">${ICON_BOOKMARK}</button></div>
        </div>
        ${lore ? `<p class="card-lore">${esc(lore)}</p>` : ''}
        ${impulses.length ? `<div class="card-impulses"><span class="card-impulses-label">${esc(t('impulses_label'))}:</span> ${esc(impulses.join(', '))}</div>` : ''}
        <div class="card-meta"><span class="environment-type-chip">${esc(t('type_' + env.type))}</span>${biomeChips}</div>
      </div>
    </article>`;
  }

  function prepThumb(env, src) {
    if (src === 'biome') {
      const b = artBiome(env);
      return b ? `<img class="prep-thumb" src="${biomeUrl(b)}" alt="" decoding="async">` : '<span class="prep-thumb prep-thumb-fallback"></span>';
    }
    return `<span class="prep-thumb lab-thumb">${newArtImg('prep', src)}</span>`;
  }
  function prepRow(env, src, checked) {
    const b = artBiome(env);
    return `<div class="prep-row prep-env-row">
      <label class="prep-checkbox-hit"><input type="checkbox" class="prep-select-checkbox" ${checked ? 'checked' : ''} tabindex="-1" aria-label="Select ${esc(env.name.en)}"></label>
      <button type="button" class="prep-row-open" tabindex="-1">
        ${prepThumb(env, src)}
        <span class="prep-row-text"><span class="prep-row-name">${esc(env.name.en)}</span>
        <span class="prep-row-meta">Tier ${EnvTierUtils.tierLabel(env)} · ${esc(t('type_' + env.type))}${b ? ' · ' + esc(t('biome_' + b)) : ''}</span></span>
      </button></div>`;
  }

  /* One cover tile. kind: 'new' | 'env' | 'biome' */
  function coverTile(tile, n) {
    if (tile.kind === 'new') return `<div class="lab-tile">${newArtImg(n === 1 ? 'listsHero' : n === 2 ? 'listsPanel2' : 'listsPanel3', tile.src)}</div>`;
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

  const tag = (label, ctx, src) => `<div class="variant-tag"><b>${esc(label)}</b><span data-tag="${ctx}|${src}"></span></div>`;
  const variant = (label, ctx, src, inner) => `<div class="variant">${tag(label, ctx, src)}${inner}</div>`;

  /* generic fixed-size window onto a source (matrix, stress, inspector) */
  function box(ctx, src, scale = 1) {
    const d = CTX[ctx];
    const style = `width:${d.w * scale}px;height:${d.h * scale}px`;
    const inner = src === 'biome'
      ? `<img src="${biomeUrl(state.biomeForBox || 'settlement')}" alt="" style="object-position:${ctx === 'catalog' ? '50% 0%' : '50% 38%'}">`
      : newArtImg(ctx, src);
    return `<div class="lab-box" style="${style}">${inner}</div>`;
  }

  /* ---------- sections ---------- */
  const env = () => BY_ID[state.env];

  function renderCatalog() {
    $('#catalog-cards').innerHTML = variants().map(s =>
      variant(srcLabel(s), 'catalog', s, catalogCard(env(), s))).join('');
  }

  function fillerEnvs() {
    const seen = new Set(), out = [];
    for (const b of ['drylands', 'forest', 'mountain', 'aquatic', 'grassland', 'tropical', 'frozen', 'badlands']) {
      const e = ENVS.find(x => artBiome(x) === b && !HAUNTED.includes(x.id) && !seen.has(x.id));
      if (e) { seen.add(e.id); out.push(e); }
    }
    return out;
  }
  function renderPrep() {
    const fill = fillerEnvs();
    const col = (label, s, rows) => `<div class="lab-prep-col">${tag(label, 'prep', s)}<div class="lab-prep-list">${rows.join('')}</div></div>`;
    $('#prep-compare').innerHTML = variants().map(s =>
      col(srcLabel(s), s, [prepRow(fill[0], 'biome', false), prepRow(env(), s, true), prepRow(fill[1], 'biome', false)])).join('');
    const hs = HAUNTED.slice(0, 8).map(id => BY_ID[id]);
    const mixed = s => {
      const rows = [];
      for (let i = 0; i < 8; i++) {
        if (i % 2 === 1 && hs[(i - 1) / 2]) rows.push(prepRow(hs[(i - 1) / 2], s, false));
        else rows.push(prepRow(fill[(i / 2 | 0) % fill.length], 'biome', i === 2));
      }
      return rows;
    };
    $('#prep-mixed').innerHTML = variants().map(s => col(s === 'biome' ? 'Current: every row a biome thumbnail' : `Haunted rows use ${srcLabel(s)}`, s, mixed(s))).join('');
  }

  function renderLists() {
    const nv = newVariants();
    const fd = 'field-of-dreams', cv = 'cauldera-valley', op = 'ouroborean-pass';
    const S = [];
    const row = items => `<div class="lab-lists">${items.join('')}</div>`;
    const lc = (label, ctx, src, name, n, tiles) => variant(label, ctx, src, listCard(name, n, tiles));

    S.push(['1 · Single image', 'One Haunted &amp; Deathly environment. Production today shows no cover at all for this list.',
      row([variant('Production today — no cover', 'listsHero', 'landscape', listCard('Graveyard crawl', 1, [])).replace(/<div class="variant-tag">.*?<\/div>/, '<div class="variant-tag"><b>Production today — no cover</b></div>'),
        ...nv.map(s => lc(`${SRC[s].short} as wide hero`, 'listsHero', s, 'Graveyard crawl', 1, [{ kind: 'new', src: s }]))])]);

    S.push(['2 · Two-image collage', 'Haunted &amp; Deathly in one half, Cauldera Valley (a real existing painting) in the other.',
      row(nv.flatMap(s => [
        lc(`${SRC[s].short} · left half`, 'listsPanel2', s, 'The Quiet and the Lush', 2, [{ kind: 'new', src: s }, { kind: 'env', id: cv }]),
        lc(`${SRC[s].short} · right half`, 'listsPanel2', s, 'The Lush and the Quiet', 2, [{ kind: 'env', id: cv }, { kind: 'new', src: s }]),
      ]))]);

    S.push(['3 · Three-image collage', 'Haunted &amp; Deathly in the middle panel, flanked by two genuine existing paintings.',
      row(nv.map(s => lc(`${SRC[s].short} · middle panel`, 'listsPanel3', s, 'Night Road', 3, [{ kind: 'env', id: fd }, { kind: 'new', src: s }, { kind: 'env', id: op }])))]);

    S.push(['4 · Repeated archetype', 'A list of ten, five or more of them Haunted &amp; Deathly. Three ways to cover it; the third is for comparison only.',
      nv.map(s => `<p style="margin-top:var(--s-3)"><b style="color:var(--parchment)">${SRC[s].short}</b></p>` + row([
        lc('Single representative hero', 'listsHero', s, 'Ten nights of dread', 10, [{ kind: 'new', src: s }]),
        lc('Collage with biome fallback', 'listsPanel3', s, 'Ten nights of dread', 10, [{ kind: 'new', src: s }, { kind: 'biome', biome: 'badlands' }, { kind: 'biome', biome: 'forest' }]),
        lc('Problem: same image ×3', 'listsPanel3', s, 'Ten nights of dread', 10, [{ kind: 'new', src: s }, { kind: 'new', src: s }, { kind: 'new', src: s }]),
      ])).join('')]);

    S.push(['5 · Existing unique artwork (regression baseline)', 'Cauldera Valley, Field of Dreams and Ouroborean Pass: production markup and production crops, untouched by any slider.',
      row([variant('Current three-image cover', 'listsPanel3', 'landscape', listCard('Painted places', 3, [{ kind: 'env', id: cv }, { kind: 'env', id: fd }, { kind: 'env', id: op }])).replace(/<div class="variant-tag">.*?<\/div>/, '<div class="variant-tag"><b>Current three-image cover</b></div>')])]);

    $('#list-scenarios').innerHTML = S.map(([h, p, body]) =>
      `<div class="lab-scenario"><h3>${h}</h3><p>${p}</p>${typeof body === 'string' ? body : body}</div>`).join('');
  }

  function renderStress() {
    // actual sizes
    $('#stress-actual').innerHTML = variants().map(s => `<div class="variant">${tag(srcLabel(s), 'catalog', s)}
      <div style="display:flex;gap:var(--s-4);align-items:flex-end">${box('prep', s)}${box('catalog', s)}<div style="display:flex;flex-direction:column;gap:var(--s-2)">${box('listsHero', s)}<div style="display:flex;gap:2px">${box('listsPanel2', s)}${box('listsPanel3', s)}</div></div></div></div>`).join('');

    // beside brighter biome paintings
    const src = activeNew('catalog');
    const brights = ['drylands', 'forest', 'tropical', 'grassland'].map(b => ENVS.find(e => artBiome(e) === b && !HAUNTED.includes(e.id)));
    const hs = HAUNTED.slice(0, 2).map(id => BY_ID[id]);
    const mix = [hs[0], brights[0], brights[1], brights[2], hs[1], brights[3]].filter(Boolean);
    $('#stress-multi').innerHTML = mix.map(e => `<div class="variant">${HAUNTED.includes(e.id) ? tag(srcLabel(src), 'catalog', src) : '<div class="variant-tag"><b>Production biome art</b></div>'}${catalogCard(e, HAUNTED.includes(e.id) ? src : 'biome')}</div>`).join('');

    // repetition
    $('#stress-repeat').innerHTML = HAUNTED.slice(0, 6).map(id => catalogCard(BY_ID[id], src)).join('');

    // low light
    const surfaces = [['black', 'near-black #0a0807'], ['ink', 'page ground (--ink)'], ['card', 'card surface (--ink-card)'], ['parchment', 'parchment — brightest tone, for contrast reference']];
    const s2 = activeNew('prep');
    $('#stress-low').innerHTML = surfaces.map(([k, label]) => `<div class="surface" data-s="${k}"><small>${label}</small>${box('prep', s2, 1.5)}${box('catalog', activeNew('catalog'))}${box('listsHero', activeNew('listsHero'))}</div>`).join('');
  }

  function renderMatrix() {
    const fillB = artBiome(env()) || 'settlement';
    state.biomeForBox = fillB;
    const head = `<tr><th>Context</th><th>Current biome</th><th>Landscape master</th><th>Portrait master</th></tr>`;
    const rows = CTX_KEYS.map(ctx => {
      const cell = s => `<td><div class="cell${state.picks[ctx] === s ? ' is-picked' : ''}">${box(ctx, s)}</div>
        <label class="pick"><input type="radio" name="pick-${ctx}" value="${s}" ${state.picks[ctx] === s ? 'checked' : ''} data-pick="${ctx}">use for ${esc(CTX[ctx].label)}</label>
        <div class="variant-tag" style="margin-top:2px"><span data-tag="${ctx}|${s}"></span></div></td>`;
      return `<tr><td class="ctx-name">${esc(CTX[ctx].label)}<small>${esc(CTX[ctx].hint)}<br><span data-size="${ctx}"></span></small></td>${cell('biome')}${cell('landscape')}${cell('portrait')}</tr>`;
    }).join('');
    $('#matrix').innerHTML = head + rows;

    // strategies
    const maps = {
      A: { name: 'A · Landscape only', note: 'One 16:9 master, per-context focal point.', m: { catalog: 'landscape', prep: 'landscape', listsHero: 'landscape', listsPanel2: 'landscape', listsPanel3: 'landscape' } },
      B: { name: 'B · Landscape + Portrait', note: 'Portrait for Catalog and Prep, landscape for Lists.', m: { catalog: 'portrait', prep: 'portrait', listsHero: 'landscape', listsPanel2: 'landscape', listsPanel3: 'landscape' } },
      C: { name: 'C · Adaptive', note: 'Whatever you picked in the matrix above, row by row.', m: state.picks },
    };
    const fill = fillerEnvs();
    $('#strategies').innerHTML = Object.values(maps).map(({ name, note, m }) => {
      const pk = ctx => m[ctx] === 'biome' ? 'biome' : m[ctx];
      const tileFor = (ctx, extra) => m[ctx] === 'biome' ? { kind: 'biome', biome: fillB } : { kind: 'new', src: m[ctx] };
      return `<div class="lab-strategy"><h4>${name}</h4><p>${note}</p>
        ${catalogCard(env(), pk('catalog'))}
        <div class="lab-prep-list">${prepRow(fill[0], 'biome', false)}${prepRow(env(), pk('prep'), true)}${prepRow(fill[1], 'biome', false)}</div>
        <div class="lab-lists" style="gap:var(--s-3)">${[
          listCard('Graveyard crawl', 1, [tileFor('listsHero')]),
        ].join('')}</div>
        ${listCard('Night Road', 3, [{ kind: 'env', id: 'field-of-dreams' }, tileFor('listsPanel3'), { kind: 'env', id: 'ouroborean-pass' }])}
        ${listCard('The Quiet and the Lush', 2, [tileFor('listsPanel2'), { kind: 'env', id: 'cauldera-valley' }])}
      </div>`;
    }).join('');
    // lists inside the strategy cards must not be forced to 320px
    document.querySelectorAll('.lab-strategy .lab-lists .list-card').forEach(c => { c.style.width = '100%'; });
  }

  /* ---------- inspector ---------- */
  function buildInspector() {
    $('#overlay-toggles').innerHTML = CTX_KEYS.map(k => `<button type="button" data-ov="${k}" aria-pressed="${state.overlayCtx.has(k)}" style="border-color:${COLORS[k]}55">${esc(CTX[k].label)}</button>`).join('');
    $('#insp-crops').innerHTML = CTX_KEYS.map(k => `<div class="insp-crop" data-icrop="${k}"><div class="variant-tag"><b style="color:${COLORS[k]}">${esc(CTX[k].label)}</b><span data-itag="${k}"></span></div><div data-ibox="${k}"></div></div>`).join('');
  }
  function updateInspector() {
    const s = state.insp;
    const img = $('#insp-img');
    if (img.getAttribute('src') !== SRC[s].url) img.src = SRC[s].url;
    img.style.filter = filterCss();
    document.querySelectorAll('#insp-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.isrc === s));
    const stage = $('#insp-stage');
    stage.querySelectorAll('.insp-rect').forEach(n => n.remove());
    if (state.overlay) {
      CTX_KEYS.forEach((k, i) => {
        if (!state.overlayCtx.has(k)) return;
        const r = visibleRect(s, k, state.crops[k][s]);
        const d = document.createElement('div');
        d.className = 'insp-rect' + (i % 2 ? ' is-top' : '');
        d.style.cssText = `--c:${COLORS[k]};left:${r.l * 100}%;top:${r.t * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
        d.innerHTML = `<span>${esc(CTX[k].label)}</span>`;
        stage.appendChild(d);
      });
    }
    CTX_KEYS.forEach(k => {
      const sc = k === 'listsHero' ? 1.5 : k === 'catalog' ? 1.5 : k === 'prep' ? 3 : 2;
      const holder = $(`[data-ibox="${k}"]`);
      const sig = s + sc + CTX[k].w + CTX[k].h;
      if (holder.dataset.sig !== sig) { holder.innerHTML = box(k, s, sc); holder.dataset.sig = sig; applyCrops(); }
      const r = visibleRect(s, k, state.crops[k][s]);
      $(`[data-itag="${k}"]`).textContent = `${Math.round(r.w * 100)}% × ${Math.round(r.h * 100)}% of master`;
    });
    const cap = $('#insp-caption');
    cap.textContent = `${SRC[s].short} · ${SRC[s].w}×${SRC[s].h} preview (master is larger). Windows use each context's crop for THIS source; the original file is never marked.`;
  }

  /* ---------- crop application ---------- */
  const filterCss = () => (state.filter.b === 100 && state.filter.c === 100) ? '' : `brightness(${state.filter.b / 100}) contrast(${state.filter.c / 100})`;
  function applyCrops() {
    const f = filterCss();
    document.querySelectorAll('img[data-crop]').forEach(img => {
      const c = state.crops[img.dataset.crop][img.dataset.src];
      img.style.objectPosition = `${c.x}% ${c.y}%`;
      img.style.transformOrigin = `${c.x}% ${c.y}%`;
      img.style.transform = c.z === 1 ? '' : `scale(${c.z})`;
      img.style.filter = f;
    });
    document.querySelectorAll('[data-tag]').forEach(n => {
      const [ctx, src] = n.dataset.tag.split('|');
      if (src === 'biome') { n.textContent = 'production crop'; return; }
      const c = state.crops[ctx][src];
      n.textContent = `x ${c.x}% · y ${c.y}% · ${c.z.toFixed(2)}×`;
      n.parentElement.parentElement.classList.toggle('is-edited', ctx === state.ctx && src === state.src);
    });
  }

  /* ---------- export ---------- */
  function configObject() {
    const crops = {};
    CTX_KEYS.forEach(k => {
      const pick = state.picks[k];
      crops[k] = pick === 'biome' ? { source: 'biome' } : { source: pick, x: state.crops[k][pick].x, y: state.crops[k][pick].y, zoom: state.crops[k][pick].z };
    });
    const perSource = {};
    CTX_KEYS.forEach(k => { perSource[k] = { landscape: cropOut(state.crops[k].landscape), portrait: cropOut(state.crops[k].portrait) }; });
    return {
      archetype: 'haunted-and-deathly',
      status: 'lab export — starting values were informed guesses; not production configuration',
      sources: { landscape: 'img/cover-archetypes-source/haunted-and-deathly-landscape.png', portrait: 'img/cover-archetypes-source/haunted-and-deathly-portrait.png' },
      adjustments: { brightness: state.filter.b / 100, contrast: state.filter.c / 100, note: 'lab-only preview filter; never applied automatically' },
      crops,
      allSources: perSource,
    };
  }
  const cropOut = c => ({ x: c.x, y: c.y, zoom: c.z });
  function cssText() {
    const out = [];
    const f = filterCss();
    CTX_KEYS.forEach(k => {
      ['landscape', 'portrait'].forEach(s => {
        const c = state.crops[k][s];
        const picked = state.picks[k] === s ? '  /* strategy C pick */' : '';
        out.push(`/* ${k} — ${s}${picked} */\nobject-fit: cover;\nobject-position: ${c.x}% ${c.y}%;` +
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
    document.querySelectorAll('#ctx-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ctx === state.ctx));
    document.querySelectorAll('#src-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.src === state.src));
    document.querySelectorAll('#mode-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === state.mode));
    const isBiome = state.src === 'biome';
    const c = isBiome ? { x: 50, y: 50, z: 1 } : state.crops[state.ctx][state.src];
    ['x', 'y', 'z'].forEach(k => { const i = $('#' + k); i.value = c[k]; i.disabled = isBiome; });
    $('#x-val').textContent = c.x + '%'; $('#y-val').textContent = c.y + '%'; $('#z-val').textContent = c.z.toFixed(2) + '×';
    $('#b').value = state.filter.b; $('#c').value = state.filter.c;
    $('#b-val').textContent = state.filter.b + '%'; $('#c-val').textContent = state.filter.c + '%';
    document.querySelectorAll('#preset-chips button').forEach(b => { b.disabled = isBiome; });
    $('#reset-ctx').disabled = isBiome;
    $('#edit-note').textContent = isBiome
      ? 'Existing biome art is production-fixed (a pre-cut 1:3 strip, top-anchored) — it has no crop controls. Choose a Haunted source to adjust framing.'
      : `Editing ${CTX[state.ctx].label} · ${SRC[state.src].label}: moves only ${CTX[state.ctx].label} previews of that source (cards, rows, covers, matrix, strategies, stress tests). Brightness/contrast are lab-only and apply to both new sources everywhere.`;
    if (!isBiome) state.insp = state.src;
  }
  function setCrop(patch) {
    if (state.src === 'biome') return;
    Object.assign(state.crops[state.ctx][state.src], patch);
    syncControls(); applyCrops(); updateInspector(); updateOutput();
  }

  function bindControls() {
    $('#ctx-seg').innerHTML = CTX_KEYS.map(k => `<button type="button" data-ctx="${k}">${esc(CTX[k].label)}</button>`).join('');
    const PRE = {
      Center: () => ({ x: 50, y: 50 }), 'Left-biased': () => ({ x: 8, y: 50 }), 'Right-biased': () => ({ x: 92, y: 50 }),
      'Top-biased': () => ({ x: 50, y: 8 }), 'Bottom-biased': () => ({ x: 50, y: 92 }),
      Recommended: (ctx, src) => ({ ...REC[ctx][src] }),
    };
    $('#preset-chips').innerHTML = Object.keys(PRE).map(n => `<button type="button" data-preset="${n}" aria-pressed="false">${n}</button>`).join('');
    $('#preset-chips').addEventListener('click', e => {
      const b = e.target.closest('button[data-preset]'); if (!b || b.disabled) return;
      setCrop(PRE[b.dataset.preset](state.ctx, state.src));
    });
    $('#ctx-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.ctx = b.dataset.ctx; syncControls(); applyCrops(); } });
    $('#src-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.src = b.dataset.src; syncControls(); renderAllSections(); } });
    $('#mode-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.mode = b.dataset.mode; syncControls(); renderAllSections(); } });
    $('#x').addEventListener('input', e => setCrop({ x: +e.target.value }));
    $('#y').addEventListener('input', e => setCrop({ y: +e.target.value }));
    $('#z').addEventListener('input', e => setCrop({ z: +(+e.target.value).toFixed(2) }));
    $('#b').addEventListener('input', e => { state.filter.b = +e.target.value; syncControls(); applyCrops(); updateInspector(); updateOutput(); });
    $('#c').addEventListener('input', e => { state.filter.c = +e.target.value; syncControls(); applyCrops(); updateInspector(); updateOutput(); });
    $('#reset-ctx').addEventListener('click', () => { if (state.src === 'biome') return; state.crops[state.ctx][state.src] = { ...REC[state.ctx][state.src] }; syncControls(); applyCrops(); updateInspector(); updateOutput(); toast('Reset'); });
    $('#reset-all').addEventListener('click', () => { state.crops = clone(REC); state.filter = { b: 100, c: 100 }; state.picks = { ...DEFAULT_PICKS }; syncControls(); renderAllSections(); toast('Everything reset'); });
    $('#collapse').addEventListener('click', e => { const c = $('#controls').classList.toggle('is-collapsed'); e.target.textContent = c ? 'Expand ▾' : 'Collapse ▴'; e.target.setAttribute('aria-expanded', !c); });
    $('#copy-json').addEventListener('click', () => copy($('#out-json').textContent, 'JSON'));
    $('#copy-css').addEventListener('click', () => copy($('#out-css').textContent, 'CSS'));
    $('#env-select').addEventListener('change', e => { state.env = e.target.value; renderAllSections(); });
    $('#insp-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.insp = b.dataset.isrc; updateInspector(); } });
    $('#overlay-on').addEventListener('change', e => { state.overlay = e.target.checked; updateInspector(); });
    $('#overlay-toggles').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const k = b.dataset.ov; state.overlayCtx.has(k) ? state.overlayCtx.delete(k) : state.overlayCtx.add(k);
      b.setAttribute('aria-pressed', state.overlayCtx.has(k)); updateInspector();
    });
    $('#matrix').addEventListener('change', e => {
      const r = e.target.closest('input[data-pick]'); if (!r) return;
      state.picks[r.dataset.pick] = r.value; renderMatrix(); renderStress(); applyCrops(); updateOutput();
    });
    window.addEventListener('resize', () => measureOnce());
  }

  /* ---------- measuring real production boxes ---------- */

  let measuring = false;
  function renderAllSections() {
    state.biomeForBox = artBiome(env()) || 'settlement';
    renderCatalog(); renderPrep(); renderLists(); renderStress(); renderMatrix();
    applyCrops(); updateOutput(); updateInspector();
    if (!measuring) { measuring = true; requestAnimationFrame(() => { measuring = false; measureOnce(); }); }
  }
  /* measure() re-renders the sized boxes once with real numbers; guard against looping. */
  function measureOnce() {
    const before = JSON.stringify(CTX);
    measureSizes();
    if (JSON.stringify(CTX) !== before) { renderStress(); renderMatrix(); document.querySelectorAll('#insp-crops [data-ibox]').forEach(h => { h.dataset.sig = ''; }); applyCrops(); updateInspector(); }
    labelSizes();
  }
  function measureSizes() {
    const art = document.querySelector('#catalog-cards .card-art');
    if (art && art.offsetHeight) { CTX.catalog.w = art.offsetWidth; CTX.catalog.h = art.offsetHeight; }
    const covers = [...document.querySelectorAll('#list-scenarios .list-card-cover')];
    const by = n => covers.find(c => c.children.length === n);
    const w = (c) => c ? c.children[0].getBoundingClientRect().width : null;
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
  function loadImage(url) {
    return new Promise(res => { const i = new Image(); i.onload = () => res({ ok: true, w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ ok: false }); i.src = url; });
  }
  async function status() {
    const items = [];
    for (const k of ['landscape', 'portrait']) {
      const s = SRC[k];
      const [prev, master] = await Promise.all([loadImage(s.url), fetch(s.master, { method: 'HEAD' }).then(r => ({ ok: r.ok, bytes: +r.headers.get('content-length') || 0 })).catch(() => ({ ok: false }))]);
      if (prev.ok) { s.w = prev.w; s.h = prev.h; }
      items.push([prev.ok, `${k} preview ${prev.ok ? prev.w + '×' + prev.h : 'MISSING: ' + s.url}`]);
      items.push([master.ok, `${k} master ${master.ok ? 'present, ' + (master.bytes / 1048576).toFixed(1) + ' MB (checked, never loaded)' : 'NOT FOUND at ' + s.master.replace(ROOT, '')}`]);
    }
    $('#asset-status').innerHTML = items.map(([ok, txt]) => `<li class="${ok ? 'ok' : 'bad'}">${esc(txt)}</li>`).join('');
    return items.every(i => i[0] || /master/.test(i[1]));
  }

  async function boot() {
    const [envs, i18n, cls] = await Promise.all([
      fetch(ROOT + 'data/environments.json').then(r => r.json()),
      fetch(ROOT + 'data/i18n.json').then(r => r.json()),
      fetch(ROOT + 'docs/research/lists-cover-classification.json').then(r => r.json()),
    ]);
    ENVS = envs.environments; BY_ID = Object.fromEntries(ENVS.map(e => [e.id, e])); T = i18n.en;
    HAUNTED = cls.environments.filter(e => e.primary_archetype === 'haunted-and-deathly').map(e => e.id).filter(id => BY_ID[id]);
    // keep the two named in the brief first
    HAUNTED.sort((a, b) => (a === 'cursed-graveyard' ? -1 : b === 'cursed-graveyard' ? 1 : a === 'vampires-castle' ? -1 : b === 'vampires-castle' ? 1 : 0));
    $('#env-select').innerHTML = HAUNTED.map(id => `<option value="${esc(id)}">${esc(BY_ID[id].name.en)}</option>`).join('');
    $('#env-select').value = state.env;
    bindControls(); buildInspector();
    await status();
    syncControls(); renderAllSections();
    document.fonts && document.fonts.ready.then(() => measureOnce());
  }
  boot().catch(err => { document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#f88;padding:16px">Lab failed to start: ${esc(err.message)}\nServe the repo root (launch.json "atlas-lab", port 8107).</pre>`); console.error(err); });
})();
