/* Biome Cover Source Comparison (lab only, section K).
 * Real My Lists markup (.list-card / .list-card-cover) and production CSS; the only variable is the artwork
 * source and its crop. Sources and proposed crops come from docs/research/biome-cover-registry.json, which is
 * a research file: production never reads it. Nothing here persists. */
(() => {
  'use strict';
  const ROOT = '../../../';
  const REG_URL = ROOT + 'docs/research/biome-cover-registry.json';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tag = (t, s) => `<div class="variant-tag"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  const CTXS = { listsHero: { label: 'Single 318×90', w: 318, h: 90 }, listsPanel2: { label: '2-up 159×90', w: 158.5, h: 90 }, listsPanel3: { label: '3-up 105×90', w: 105.3, h: 90 } };
  const CTX_KEYS = Object.keys(CTXS);
  const KINDS = { strip: 'A · Catalog strip', band: 'B0 · master band', b16: 'B · master 16:9', journey: 'C · Journey header' };
  const KIND_SHORT = { strip: 'Strip (as today)', band: 'Master band (audit)', b16: 'Master 16:9 window', journey: 'Journey header' };
  const STRAT = { strip: 'Strip, as drawn today', A: 'Strategy A — master derivatives', B: 'Strategy B — Journey only', C: 'Strategy C — hybrid (registry)' };

  /* Archetype panels reuse the crops of artwork-crop-lab.js REC (landscape sources). */
  const ARCH = {
    'haunted-and-deathly': { url: 'assets/haunted-landscape-1280.webp', w: 1280, h: 720, name: 'Haunted & Deathly', pos: { listsHero: [50, 34], listsPanel2: [50, 40], listsPanel3: [88, 40] } },
    'forgotten-ruins': { url: 'assets/forgotten-ruins-landscape-1280.webp', w: 1280, h: 853, name: 'Forgotten Ruins', pos: { listsHero: [50, 38], listsPanel2: [50, 25], listsPanel3: [90, 30] } },
    'arcane-sanctums': { url: 'assets/arcane-sanctums-landscape-1280.webp', w: 1280, h: 720, name: 'Arcane Sanctums', pos: { listsHero: [50, 8], listsPanel2: [60, 30], listsPanel3: [85, 30] } },
    'feasts-and-revelry': { url: 'assets/feasts-and-revelry-landscape-1280.webp', w: 1280, h: 720, name: 'Feasts & Revelry', pos: { listsHero: [50, 40], listsPanel2: [50, 50], listsPanel3: [45, 40] } },
  };
  const ENV_ART = { 'cauldera-valley': { focus: 50, name: 'Cauldera Valley' }, 'field-of-dreams': { focus: 58, name: 'Field of Dreams' }, 'ouroborean-pass': { focus: 42, name: 'Ouroborean Pass' } };

  let REG = null, BY = {}, ENV = {}, CLS = {};
  const edits = {};                                   // biome → ctx → kind → {x,y}
  const st = { basis: 'rec', biome: 'forest', ctx: 'listsHero', kind: 'journey', pair: ['forest', 'mountain'], trio: ['aquatic', 'frozen', 'badlands'], dpr: window.devicePixelRatio || 1 };
  const nat = {};                                     // url → {w,h} measured from the loaded file

  const hasKind = (b, k) => !!BY[b].sources[k];
  const url = (b, k) => ROOT + BY[b].sources[k].path;
  const defCrop = (k) => (k === 'strip' ? { x: 50, y: 38 } : { x: 50, y: 50 });
  function crop(b, ctx, k) {
    if (st.basis === 'center') return { x: 50, y: 50 };
    const e = edits[b] && edits[b][ctx] && edits[b][ctx][k];
    if (e) return e;
    const r = BY[b].crops[ctx] && BY[b].crops[ctx][k];
    return r || defCrop(k);
  }
  const recCrop = (b, ctx, k) => (BY[b].crops[ctx] && BY[b].crops[ctx][k]) || defCrop(k);
  const tile = (src, pos, title) => `<div class="lab-tile" title="${esc(title || '')}"><img src="${src}" alt="" style="object-position:${pos}" decoding="async"></div>`;
  const hole = txt => `<div class="lab-tile lab-k-hole"><span>${esc(txt)}</span></div>`;
  const cover = tiles => `<div class="list-card-cover" aria-hidden="true">${tiles.join('')}</div>`;
  const listCard = (name, tiles, count) => `<div class="list-card has-cover">${cover(tiles)}<div class="list-card-top"><span class="list-rename">${esc(name)}</span></div><div class="list-card-count">${count || tiles.length + ' environments'}</div></div>`;

  /* resolve a panel descriptor to one tile for a context */
  function panelTile(p, ctx, strat) {
    if (p.type === 'arch') { const a = ARCH[p.id]; const q = a.pos[ctx]; return tile(a.url, `${q[0]}% ${q[1]}%`, a.name); }
    if (p.type === 'env') { const e = ENV_ART[p.id]; return tile(`${ROOT}img/env/thumb/${p.id}-800.avif`, `50% ${e.focus}%`, e.name); }
    const b = p.biome;
    let k;
    if (strat === 'strip') k = 'strip';
    else if (strat === 'A') k = 'b16';
    else if (strat === 'B') k = hasKind(b, 'journey') ? 'journey' : null;
    else k = ctx === 'listsHero' ? BY[b].preferredHeroSource : BY[b].preferredCollageSource;
    if (!k) return hole('no Journey art for ' + b);
    const c = crop(b, ctx, k);
    return tile(url(b, k), `${c.x}% ${c.y}%`, b + ' · ' + KINDS[k]);
  }
  const ctxOf = n => n === 1 ? 'listsHero' : n === 2 ? 'listsPanel2' : 'listsPanel3';
  const coverFor = (panels, strat) => panels.map(p => panelTile(p, ctxOf(panels.length), strat));
  const B = b => ({ type: 'biome', biome: b });

  /* effective pixel density: source px actually covering the tile ÷ device px of the tile */
  function density(b, k, ctx, dpr) {
    const s = BY[b].sources[k], c = CTXS[ctx];
    return 1 / (Math.max(c.w / s.w, c.h / s.h) * dpr);   // source px per device px across the tile
  }
  const densLabel = v => (v >= 1 ? `${v.toFixed(2)}× oversampled` : `<b class="lab-k-bad">${(1 / v).toFixed(1)}× upscaled</b>`);

  /* ---------- sections ---------- */
  function renderInventory() {
    const rows = REG.biomes.map(r => {
      const cell = k => {
        const s = r.sources[k];
        if (!s) return '<td class="lab-k-none">—</td>';
        const n = nat[ROOT + s.path];
        const real = n ? `${n.w}×${n.h}` : '…';
        const ok = n && n.w === s.w && n.h === s.h;
        return `<td>${real}${ok ? '' : ' <b class="lab-k-bad">≠ registry</b>'}<br><small>${s.kb != null ? s.kb + ' KB' : 'lab'}${s.shipped ? ' · shipped' : s.lab ? ' · lab' : ''}</small></td>`;
      };
      return `<tr><td><b>${r.biome}</b><br><small>${r.catalogEnvironments} envs</small></td>${['strip', 'band', 'b16', 'journey'].map(cell).join('')}<td>${KIND_SHORT[r.preferredHeroSource]}</td><td>${r.effectiveQuality} / ${r.representativeness}</td><td>${r.status.replace(/-/g, ' ')}</td></tr>`;
    }).join('');
    $('#k-inv').innerHTML = `<tr><th>Biome</th><th>A · strip<br><small>200×600 WebP</small></th><th>B0 · master band<br><small>lab 640×181</small></th><th>B · master 16:9<br><small>lab 640×360</small></th><th>C · Journey header<br><small>960×540 WebP</small></th><th>Preferred</th><th>Quality / represents</th><th>Status</th></tr>${rows}`;
  }

  function renderControls() {
    const bi = REG.biomes.map(r => r.biome);
    $('#k-biome').innerHTML = bi.map(b => `<option>${b}</option>`).join('');
    $('#k-biome').value = st.biome;
    $('#k-kind').innerHTML = Object.keys(KINDS).map(k => `<option value="${k}">${KINDS[k]}</option>`).join('');
    ['#k-p1', '#k-p2', '#k-t1', '#k-t2', '#k-t3'].forEach(s => { $(s).innerHTML = bi.map(b => `<option>${b}</option>`).join(''); });
    $('#k-p1').value = st.pair[0]; $('#k-p2').value = st.pair[1];
    $('#k-t1').value = st.trio[0]; $('#k-t2').value = st.trio[1]; $('#k-t3').value = st.trio[2];
    syncSliders();
  }
  function syncSliders() {
    if (!hasKind(st.biome, st.kind)) st.kind = BY[st.biome].preferredHeroSource;
    $('#k-kind').value = st.kind;
    const c = recCrop(st.biome, st.ctx, st.kind);
    const e = edits[st.biome] && edits[st.biome][st.ctx] && edits[st.biome][st.ctx][st.kind];
    const v = e || c;
    $('#k-x').value = v.x; $('#k-y').value = v.y; $('#k-xv').textContent = v.x + '%'; $('#k-yv').textContent = v.y + '%';
    $('#k-note').textContent = (e ? 'Edited from ' + c.x + ' / ' + c.y + '. ' : 'Recommended value. ') + (st.basis === 'center' ? 'Center view is on: edits are kept but not shown until you switch back.' : '');
    document.querySelectorAll('#k-basis button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.basis === st.basis)));
    document.querySelectorAll('#k-ctx button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ctx === st.ctx)));
  }

  function renderSingle() {
    const b = st.biome, r = BY[b];
    const kinds = ['strip', 'band', 'b16', 'journey'].filter(k => r.sources[k]);
    const cols = kinds.map(k => {
      const c = crop(b, 'listsHero', k), s = r.sources[k];
      const d = density(b, k, 'listsHero', 2);
      return `<div class="variant lab-k-col">${tag(KIND_SHORT[k], `${s.w}×${s.h}${s.kb != null ? ' · ' + s.kb + ' KB' : ''}`)}${tag('', `crop ${c.x}/${c.y} · DPR 2: ${densLabel(d)}`)}${listCard('Campaign list', [tile(url(b, k), `${c.x}% ${c.y}%`)], '1 environment')}</div>`;
    });
    if (!r.sources.journey) cols.push(`<div class="variant lab-k-col">${tag('Journey header', 'does not exist')}${listCard('Campaign list', [hole('Journey has no ' + b + ' region')], '—')}</div>`);
    const full = k => `<figure class="lab-k-full"><img src="${url(b, k)}" alt="" loading="lazy"><figcaption>${KIND_SHORT[k]} — full image</figcaption></figure>`;
    $('#k-single').innerHTML = `<div class="lab-lists">${cols.join('')}</div><div class="lab-k-fulls">${full(r.sources.journey ? 'journey' : 'b16')}${r.sources.journey ? full('b16') : ''}${full('strip')}</div><p class="lab-note">${esc(r.explanation)}</p>`;
  }

  function strategyRows(el, panels, strats) {
    el.innerHTML = `<div class="lab-lists">${strats.map(s => `<div class="variant lab-k-col">${tag(STRAT[s])}${listCard('Campaign list', coverFor(panels, s))}</div>`).join('')}</div>`;
  }
  const STRATS = ['strip', 'A', 'B', 'C'];

  function renderPair() { strategyRows($('#k-pair'), st.pair.map(B), STRATS); }
  function renderTrio() { strategyRows($('#k-trio'), st.trio.map(B), STRATS); }

  function renderMixed() {
    const sets = [
      ['Archetype + biome + unique', [{ type: 'arch', id: 'arcane-sanctums' }, B('forest'), { type: 'env', id: 'cauldera-valley' }]],
      ['Haunted + wetland + unique', [{ type: 'arch', id: 'haunted-and-deathly' }, B('wetland'), { type: 'env', id: 'ouroborean-pass' }]],
      ['Feasts + settlement + unique', [{ type: 'arch', id: 'feasts-and-revelry' }, B('settlement'), { type: 'env', id: 'field-of-dreams' }]],
      ['Ruins + underground + unique', [{ type: 'arch', id: 'forgotten-ruins' }, B('underground'), { type: 'env', id: 'cauldera-valley' }]],
      ['Archetype + biome (two panels)', [{ type: 'arch', id: 'haunted-and-deathly' }, B('frozen')]],
      ['Biome + unique (two panels)', [B('drylands'), { type: 'env', id: 'ouroborean-pass' }]],
    ];
    $('#k-mixed').innerHTML = sets.map(([n, p]) => `<div class="lab-scenario"><h4>${n}</h4><div class="lab-lists">${['strip', 'A', 'C'].map(s => `<div class="variant lab-k-col">${tag(STRAT[s])}${listCard('Campaign list', coverFor(p, s))}</div>`).join('')}</div></div>`).join('');
  }

  function renderGallery() {
    $('#k-gallery').innerHTML = REG.biomes.map(r => {
      const b = r.biome, kinds = ['strip', 'band', 'b16', 'journey'].filter(k => r.sources[k]);
      const rowFor = k => `<div class="lab-k-row"><div class="lab-k-lbl">${KIND_SHORT[k]}${k === r.preferredHeroSource ? ' <b class="lab-bq-good">★ recommended</b>' : ''}<small>${r.sources[k].w}×${r.sources[k].h}${r.sources[k].kb != null ? ' · ' + r.sources[k].kb + ' KB' : ''}</small></div>${CTX_KEYS.map(c => { const q = crop(b, c, k); return `<div class="lab-k-cell" data-w="${c}">${tile(url(b, k), `${q.x}% ${q.y}%`)}</div>`; }).join('')}</div>`;
      return `<article class="lab-k-biome" id="kg-${b}"><header><h4>${b} <small>${r.catalogEnvironments} environments · ${r.status.replace(/-/g, ' ')}</small></h4><p>${esc(r.explanation)}</p></header><div class="lab-k-grid">${kinds.map(rowFor).join('')}</div></article>`;
    }).join('');
  }

  function renderMatrix() {
    $('#k-matrix').innerHTML = '<tr><th>Biome</th><th>Available sources</th><th>Hero source</th><th>Collage source</th><th>Focal x/y (hero · 2-up · 3-up)</th><th>Quality</th><th>Represents</th><th>New asset?</th><th>Why</th></tr>' + REG.biomes.map(r => {
      const hk = r.preferredHeroSource, ck = r.preferredCollageSource;
      const f = ['listsHero', 'listsPanel2', 'listsPanel3'].map((c, i) => { const q = r.crops[c][i === 0 ? hk : ck]; return q.x + '/' + q.y; }).join(' · ');
      return `<tr><td><b>${r.biome}</b></td><td>${Object.keys(r.sources).filter(k => k !== 'band').map(k => KIND_SHORT[k]).join(', ')}</td><td>${KIND_SHORT[hk]}</td><td>${KIND_SHORT[ck]}</td><td>${f}</td><td>${r.effectiveQuality}</td><td>${r.representativeness}</td><td>${r.additionalAssetNeeded ? 'Replacement recommended' : 'No'}</td><td class="lab-k-why">${esc(r.explanation)}</td></tr>`;
    }).join('');
  }

  /* Illustrative picker for the mixed collections — NOT the production algorithm. Unique painting first, a HIGH-confidence
   * archetype of the four second, then the environment's own art biome; one panel per distinct image, at most three. */
  const LISTS = [
    ['1 environment', ['ouroborean-pass']],
    ['2 environments', ['ruined-castle', 'arctic']],
    ['3 environments', ['archmages-tower', 'almara-forest', 'cauldera-valley']],
    ['5 environments', ['ouroborean-pass', 'grand-feast', 'cursed-graveyard', 'endless-forest', 'waterfalls-of-light-and-dark']],
    ['10 environments', ['field-of-dreams', 'ancient-city', 'deep-underground-cave', 'arctic', 'desert', 'jungle', 'perilous-journey', 'keep-away', 'crystal-wasteland', 'haunted-city']],
    ['3 environments, all settlement', ['the-garage', 'keep-away', 'tower-of-slime']],
    ['3 environments, all universal', ['body', 'lunar-surface', 'perilous-journey']],
  ];
  function pickPanels(ids) {
    const out = [], seen = new Set(), notes = [];
    for (const id of ids) {
      const c = CLS[id]; if (!c) continue;
      let p, key;
      if (ENV_ART[id]) { p = { type: 'env', id }; key = 'e:' + id; }
      else if (ARCH[c.primary_archetype] && c.classification_status === 'high') { p = { type: 'arch', id: c.primary_archetype }; key = 'a:' + c.primary_archetype; }
      else { p = B(c.art_biome); key = 'b:' + c.art_biome; }
      notes.push(`${ENV[id] ? ENV[id].name.en : id} → ${p.type === 'biome' ? p.biome + ' art' : p.type === 'arch' ? ARCH[p.id].name : 'its own painting'}`);
      if (!seen.has(key) && out.length < 3) { seen.add(key); out.push(p); }
    }
    return { panels: out, notes };
  }
  function renderLists() {
    $('#k-lists').innerHTML = LISTS.map(([n, ids]) => {
      const { panels, notes } = pickPanels(ids);
      return `<div class="lab-scenario"><h4>${n}</h4><div class="lab-lists">${['strip', 'C'].map(s => `<div class="variant lab-k-col">${tag(s === 'C' ? 'Hybrid (registry)' : 'Biome strip, as today')}${listCard('Campaign list', coverFor(panels, s), n + ' · ' + panels.length + ' distinct image' + (panels.length > 1 ? 's' : ''))}</div>`).join('')}</div><p class="lab-note">${notes.map(esc).join(' · ')}</p></div>`;
    }).join('');
  }

  function renderHybrid() {
    const bi = REG.biomes.map(r => r.biome);
    const heroes = bi.map(b => `<div class="variant lab-k-col">${tag(b, KIND_SHORT[BY[b].preferredHeroSource])}${listCard(b, coverFor([B(b)], 'C'), '1 environment')}</div>`);
    const trios = [];
    for (let i = 0; i < bi.length; i += 3) { const t = bi.slice(i, i + 3); if (t.length === 3) trios.push(`<div class="variant lab-k-col">${tag(t.join(' · '), '3-up')}${listCard('Three-up', coverFor(t.map(B), 'C'))}</div>`); }
    const pairs = [];
    for (let i = 0; i + 1 < bi.length; i += 2) pairs.push(`<div class="variant lab-k-col">${tag(bi[i] + ' · ' + bi[i + 1], '2-up')}${listCard('Two-up', coverFor([B(bi[i]), B(bi[i + 1])], 'C'))}</div>`);
    $('#k-hybrid').innerHTML = `<h4>Single</h4><div class="lab-lists">${heroes.join('')}</div><h4>Two-up</h4><div class="lab-lists">${pairs.join('')}</div><h4>Three-up</h4><div class="lab-lists">${trios.join('')}</div>`;
  }

  function renderConfig() {
    const out = JSON.parse(JSON.stringify(REG));
    out.biomes.forEach(r => CTX_KEYS.forEach(c => Object.keys(r.crops[c]).forEach(k => { const e = edits[r.biome] && edits[r.biome][c] && edits[r.biome][c][k]; if (e) r.crops[c][k] = { x: e.x, y: e.y }; })));
    const edited = [];
    Object.keys(edits).forEach(b => CTX_KEYS.forEach(c => Object.keys(edits[b][c] || {}).forEach(k => edited.push(`${b}.${c}.${k} = ${edits[b][c][k].x}/${edits[b][c][k].y}`))));
    $('#k-edited').textContent = edited.length ? 'Edited here: ' + edited.join(' · ') : 'No edits: the registry file is shown as written.';
    $('#k-json').textContent = JSON.stringify(out.biomes.map(r => ({ biome: r.biome, preferredHeroSource: r.preferredHeroSource, preferredCollageSource: r.preferredCollageSource, crops: r.crops })), null, 1);
  }

  let raf = 0;
  function renderAll() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      syncSliders(); renderSingle(); renderPair(); renderTrio(); renderMixed(); renderGallery(); renderLists(); renderHybrid(); renderConfig();
      const t = $('#k-dpr'); if (t) t.textContent = 'devicePixelRatio ' + (window.devicePixelRatio || 1);
    });
  }

  function bind() {
    $('#k-biome').addEventListener('change', e => { st.biome = e.target.value; renderAll(); });
    $('#k-kind').addEventListener('change', e => { st.kind = e.target.value; renderAll(); });
    document.querySelectorAll('#k-basis button').forEach(b => b.addEventListener('click', () => { st.basis = b.dataset.basis; renderAll(); }));
    document.querySelectorAll('#k-ctx button').forEach(b => b.addEventListener('click', () => { st.ctx = b.dataset.ctx; renderAll(); }));
    const set = () => {
      const x = +$('#k-x').value, y = +$('#k-y').value;
      ((edits[st.biome] = edits[st.biome] || {})[st.ctx] = edits[st.biome][st.ctx] || {})[st.kind] = { x, y };
      $('#k-xv').textContent = x + '%'; $('#k-yv').textContent = y + '%';
      if (st.basis === 'center') st.basis = 'rec';
      renderAll();
    };
    $('#k-x').addEventListener('input', set); $('#k-y').addEventListener('input', set);
    $('#k-reset').addEventListener('click', () => { if (edits[st.biome] && edits[st.biome][st.ctx]) delete edits[st.biome][st.ctx][st.kind]; renderAll(); });
    $('#k-reset-all').addEventListener('click', () => { Object.keys(edits).forEach(k => delete edits[k]); renderAll(); });
    ['#k-p1', '#k-p2'].forEach((s, i) => $(s).addEventListener('change', e => { st.pair[i] = e.target.value; renderAll(); }));
    ['#k-t1', '#k-t2', '#k-t3'].forEach((s, i) => $(s).addEventListener('change', e => { st.trio[i] = e.target.value; renderAll(); }));
  }

  function measure() {
    const urls = [];
    REG.biomes.forEach(r => Object.keys(r.sources).forEach(k => urls.push(ROOT + r.sources[k].path)));
    return Promise.all(urls.map(u => new Promise(res => { const i = new Image(); i.onload = () => { nat[u] = { w: i.naturalWidth, h: i.naturalHeight }; res(); }; i.onerror = () => { nat[u] = { w: 0, h: 0 }; res(); }; i.src = u; })));
  }

  Promise.all([fetch(REG_URL).then(r => r.json()), fetch(ROOT + 'data/environments.json').then(r => r.json()), fetch(ROOT + 'docs/research/lists-cover-classification.json').then(r => r.json())]).then(([reg, env, cls]) => {
    REG = reg; reg.biomes.forEach(r => { BY[r.biome] = r; });
    (env.environments || []).forEach(e => { ENV[e.id] = e; });
    cls.environments.forEach(e => { CLS[e.id] = e; });
    return measure();
  }).then(() => { renderControls(); renderInventory(); renderMatrix(); bind(); renderAll(); window.__biomeCoverLab = { ready: true, nat }; })
    .catch(err => { $('#k-inv').innerHTML = '<tr><td>Could not load the registry: ' + esc(err.message) + '</td></tr>'; });
})();
