/* Biome Quality section (lab only). Production markup comes from js/app.js (biomeArtHtml, prepEnvThumbHtml);
 * the lab-only evidence images are built by make-biome-quality-assets.js. */
(() => {
  const ROOT = '../../../';
  const A = 'assets/biome-quality/';
  const BIOMES = ['aquatic', 'badlands', 'drylands', 'forest', 'frozen', 'grassland', 'mountain', 'rolling', 'settlement', 'tropical', 'underground', 'universal', 'wetland'];
  const $ = s => document.querySelector(s);
  const tag = (t, s) => `<div class="variant-tag"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  const ARCH = 'assets/haunted-landscape-1280.webp';
  const ARCH_POS = '50% 38%';

  const prodStrip = b => {
    const base = ROOT + 'img/biomes/' + b;
    const avif = [100, 200, 250, 300].map(w => `${base}-${w}.avif ${w}w`).join(', ');
    return `<picture><source type="image/avif" sizes="(max-width: 640px) 88px, 95px" srcset="${avif}"><img src="${base}-200.webp" alt="" decoding="async"></picture>`;
  };
  const card = art => `<article class="card"><div class="card-art">${art}</div><div class="card-body"><h4 class="card-title" style="margin:0">Environment name</h4><p class="card-lore">Same text, same dimensions in every column.</p></div></article>`;
  const prepRow = (thumb, name) => `<div class="prep-row prep-env-row"><button type="button" class="prep-row-open" tabindex="-1">${thumb}<span class="prep-row-text"><span class="prep-row-name">${name}</span><span class="prep-row-meta">Tier 2 · Exploration</span></span></button></div>`;
  const oldThumb = b => `<img class="prep-thumb" src="${ROOT}img/biomes/${b}-200.webp" alt="" decoding="async">`;
  const newThumb = b => { const p = `${ROOT}img/biomes/${b}-thumb-`; return `<img class="prep-thumb" src="${p}48.webp" srcset="${p}96.webp 2x, ${p}144.webp 3x" alt="" decoding="async">`; };
  const archThumb = `<span class="prep-thumb lab-thumb"><img src="${ARCH}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:${ARCH_POS}"></span>`;

  const tile = (src, pos) => `<div class="lab-tile"><img src="${src}" alt="" style="object-position:${pos}"></div>`;
  const cover = tiles => `<div class="list-card-cover" aria-hidden="true">${tiles.join('')}</div>`;
  const listCard = (name, tiles) => `<div class="list-card has-cover">${cover(tiles)}<div class="list-card-top"><span class="list-rename">${name}</span></div><div class="list-card-count">${tiles.length} environments</div></div>`;
  const strip = b => tile(`${ROOT}img/biomes/${b}-200.webp`, '50% 38%');     // what lab/prod would draw today
  const wide = b => tile(`${A}wide-${b}-640.webp`, '50% 50%');
  const arch = () => tile(ARCH, ARCH_POS);

  function render() {
    const b = $('#bq-biome').value;
    $('#bq-dpr').textContent = 'devicePixelRatio ' + window.devicePixelRatio;
    $('#bq-catalog').innerHTML =
      `<div class="lab-bq-col">${tag('Production', 'AVIF strip, as shipped')}${card(prodStrip(b))}</div>` +
      `<div class="lab-bq-col">${tag('PNG master, Lanczos', 'same crop, no codec')}${card(`<img src="${A}master-${b}-300.webp" alt="">`)}</div>` +
      `<div class="lab-bq-col">${tag('Archetype (Haunted)', 'visual standard')}${card(`<img src="${ARCH}" alt="" style="object-position:${ARCH_POS}">`)}</div>`;
    const others = BIOMES.filter(x => x !== b).slice(0, 3);
    $('#bq-prep').innerHTML =
      `<div class="lab-bq-col">${tag('Before', '200×600 strip squeezed into 48 px')}<div class="prep-list">${prepRow(oldThumb(b), 'Selected')}${others.map(o => prepRow(oldThumb(o), o)).join('')}${prepRow(archThumb, 'Archetype art')}</div></div>` +
      `<div class="lab-bq-col">${tag('After', 'dedicated 48 / 96 / 144 px thumbnails')}<div class="prep-list">${prepRow(newThumb(b), 'Selected')}${others.map(o => prepRow(newThumb(o), o)).join('')}${prepRow(archThumb, 'Archetype art')}</div></div>`;
    const o2 = others[0], o3 = others[1];
    const scen = [
      ['One biome, wide hero', [b]], ['Two biomes', [b, o2]], ['Three biomes', [b, o2, o3]],
      ['Biome + archetype', [b, 'A']], ['Two archetypes + biome', ['A', 'A', b]],
    ];
    const mk = (fn) => scen.map(([n, t]) => listCard(n, t.map(x => x === 'A' ? arch() : fn(x))));
    $('#bq-lists').innerHTML =
      `<div class="lab-bq-list">${tag('Strip, as today', 'wide cover drawn from the 200 px-wide strip')}</div><div class="lab-bq-list">${mk(strip).join('')}</div>` +
      `<div class="lab-bq-list">${tag('Wide derivative (proposed)', '640 px, master full width')}</div><div class="lab-bq-list">${mk(wide).join('')}</div>`;
    const img = (src, l, s) => `<div class="lab-bq-col">${tag(l, s)}<img class="lab-bq-diag" src="${src}" alt=""></div>`;
    $('#bq-diag').innerHTML =
      img(`${A}prep-before-d1-${b}.png`, 'Before', 'browser pixels, DPR 1') + img(`${A}prep-after-d1-${b}.png`, 'After', 'browser pixels, DPR 1') + img(`${A}prepref-${b}-48.png`, 'Lanczos reference', 'master, no sharpening');
  }

  fetch('biome-quality-metrics.json').then(r => r.json()).then(m => {
    $('#bq-biome').innerHTML = BIOMES.map(b => `<option>${b}</option>`).join('');
    $('#bq-biome').value = 'forest';
    $('#bq-biome').addEventListener('change', render);
    $('#bq-score').innerHTML = '<tr><th>Biome</th><th>Catalog PSNR DPR1 / 2 (dB)</th><th>Prep PSNR before → after, DPR1 (dB)</th><th>Prep HF energy before → after (1.0 = reference)</th><th>Prep file KB before → after (1x)</th></tr>' +
      m.map(r => `<tr><td>${r.b}</td><td>${r.catPSNR1} / ${r.catPSNR2}</td><td>${r.prepB1} → <b class="lab-bq-good">${r.prepA1}</b></td><td>${r.hfB1} → <b class="lab-bq-good">${r.hfA1}</b></td><td>${r.kbBefore} → <b class="lab-bq-good">${r.kb1}</b></td></tr>`).join('');
    render();
  });
})();
