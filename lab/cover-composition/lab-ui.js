/* ============================================================
   My Lists Cover Composition Lab V2 — lab-ui.js  (DEV-ONLY; lab/ is excluded from dist/)
   Renders the PRODUCTION list card (through prod-bridge.js) with only the cover replaced by each strategy.
   Persists nothing but "labcc2:*" localStorage keys; never reads or writes any production storage key and never fetches the app.
   Reach it at /lab/cover-composition/ on any static server.
   ============================================================ */
(function () {
  'use strict';
  const Core = window.CoverCompositionCore, Fx = window.CoverCompositionFixtures, Bridge = window.CoverCompositionBridge;
  const Art = window.ListCoverArt, Utils = window.ListCoverUtils, REVIEWS = window.CoverCompositionReviews.REVIEWS;
  const root = document.getElementById('lab-root');
  const KEY = 'labcc2:state';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = fb => { try { const v = window.localStorage.getItem(KEY); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } };
  const lsSet = v => { try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const TABS = [['cases', 'Cases'], ['page', 'Full page'], ['library', 'Library · 47'], ['crops', 'Crops'], ['export', 'Review & export']];

  let S, api, analyses, envsById;
  const hash = () => new URLSearchParams(location.hash.replace(/^#/, ''));
  function writeHash(extra) { const p = hash(); p.set('tab', S.tab); Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v)); try { history.replaceState(null, '', location.pathname + '#' + p.toString()); } catch (e) { /* ignore */ } }
  const save = () => lsSet({ prefs: S.prefs, notes: S.notes, crops: S.crops, ratio: S.ratio });

  const opts = () => ({ reviews: REVIEWS, overrides: S.crops, ratio: S.ratio });
  const compose = (caseId, s) => Core.compose(s, analyses[caseId], Art, opts());

  function coverFor(caseId, s) {
    const k = compose(caseId, s);
    return Bridge.coverHtml(k, api, Art) || api.prodListCoverHtml({ id: caseId });
  }
  function card(c, s) {
    api.hooks.cover = list => coverFor(list.id, s);
    return api.listCardHtml({ id: c.id, name: c.name });
  }

  async function init() {
    const [envData, i18n, appSrc] = await Promise.all([
      fetch('data/environments.json').then(r => r.json()), fetch('data/i18n.json').then(r => r.json()), fetch('js/app.js').then(r => r.text()),
    ]);
    const envLists = {};
    Fx.ALL.forEach(c => c.envIds.forEach(id => { (envLists[id] = envLists[id] || []).push(c.id); }));
    api = Bridge.load(appSrc, { ListCoverUtils: Utils, ListCoverArt: Art }, { i18n, envs: envData.environments, lists: Fx.ALL.map(c => ({ id: c.id, name: c.name })), envLists });
    analyses = {};
    Fx.ALL.forEach(c => { analyses[c.id] = Core.analyse(api.envsInList(c.id).map(e => ({ id: e.id, artBiome: api.artBiome(e) })), Art, Utils); });
    const saved = lsGet({});
    const h = hash();
    S = { tab: h.get('tab') || 'cases', strategy: h.get('s') || 'A', prefs: saved.prefs || {}, notes: saved.notes || {}, crops: saved.crops || {}, ratio: h.get('ratio') || saved.ratio || Core.DEFAULT_RATIO, only: h.get('only') || '', cases: (h.get('cases') || '').split(',').filter(Boolean), img: h.get('img') || 'archetype:taverns-and-inns' };
    render();
  }

  /* ---------- views ---------- */
  function strategyColumn(c, s) {
    const k = compose(c.id, s);
    const chips = [`${k.panels.length || 'no'} image${k.panels.length === 1 ? '' : 's'}`, k.ratio ? k.ratio : '', k.provisional ? '<span class="lab-chip prov">provisional</span>' : ''].filter(Boolean).join(' · ');
    return `<div class="lab-strat"><div class="lab-cap">${Core.STRATEGIES[s].label} <span class="lab-chip">${chips.replace('<span class="lab-chip prov">provisional</span>', '')}</span>${k.provisional ? '<span class="lab-chip prov">provisional</span>' : ''}</div>
      <div class="lists-home-wrap" style="width:320px;max-width:100%"><div class="list-cards-grid" style="margin-top:0;grid-template-columns:320px">${card(c, s)}</div></div>
      <p class="lab-small"><code>${esc(k.rule)}</code> — ${esc(k.explanation)}${k.omitted.length ? ` <br>Omitted: ${k.omitted.map(esc).join(', ')}` : ''}</p></div>`;
  }
  function caseSection(c) {
    const a = analyses[c.id];
    const pref = S.prefs[c.id] || '';
    return `<section class="lab-sec" data-case="${c.id}"><h2>${esc(c.name)} <span class="lab-chip">${c.kind}</span></h2>
      <p class="lab-note">${esc(c.note)} ${a.members} environment${a.members === 1 ? '' : 's'} → ${a.distinct} distinct picture${a.distinct === 1 ? '' : 's'} → production shows ${a.production.tiles.length}. Candidates (strongest first): ${a.candidates.map(x => `<code>${esc(x.imageId)}</code>`).join(', ') || 'none'}.</p>
      <div class="lab-strategies">${(S.only ? [S.only] : Core.STRATEGY_IDS).map(s => strategyColumn(c, s)).join('')}</div>
      <div class="lab-review" role="group" aria-label="Preference for ${esc(c.name)}">${Core.PREFERENCES.map(p => `<label><input type="radio" name="pref-${c.id}" value="${p}" data-pref="${c.id}" ${pref === p ? 'checked' : ''}> ${p === 'none' ? 'No acceptable option' : 'Prefer ' + p}</label>`).join('')}
        <textarea data-note="${c.id}" placeholder="Why?" aria-label="Note for ${esc(c.name)}">${esc(S.notes[c.id] || '')}</textarea></div></section>`;
  }
  function viewCases() {
    return `<p class="lab-note">Each case: the same list card (production markup, 320px wide, 90px cover) under five composition strategies, from the same production candidates. Fixtures use real environment ids; the ones named after the user's lists are stand-ins whose contents are invented. D's ratio: ${Object.keys(Core.RATIOS).map(r => `<button class="lab-btn" data-ratio="${r}" aria-pressed="${r === S.ratio}">${r}</button>`).join(' ')}</p>`
      + Fx.ALL.filter(c => !S.cases.length || S.cases.includes(c.id)).map(caseSection).join('');
  }
  function viewPage() {
    const s = S.strategy;
    return `<p class="lab-note">One page, one strategy — identical lists, order, names and chrome; only the cover differs. ${Core.STRATEGY_IDS.map(x => `<button class="lab-btn" data-strategy="${x}" aria-pressed="${x === s}">${Core.STRATEGIES[x].label}</button>`).join(' ')}</p>
      <div id="grid-wrap" class="lab-page"><div class="lists-home-wrap"><h2 class="page-title">${api.state.i18n[api.state.lang].lists_title || 'My Lists'}</h2>
      <div class="list-cards-grid">${Fx.ALL.map(c => card(c, s)).join('')}</div></div></div>`;
  }
  const rateCls = v => 'lab-r-' + v;
  function panelHtml(id, fraction) {
    const k = { layout: 1, panels: [{ imageId: id, kind: Art.IMAGES[id].kind, parent: Art.IMAGES[id].parent || id, fraction, ...Core.framing(Art, id, fraction, S.crops) }] };
    return Bridge.coverHtml(k, api, Art);
  }
  function viewLibrary() {
    const ids = Object.keys(Art.IMAGES);
    return `<p class="lab-note">Every picture a cover can wear, at the three real widths (318 / 159 / 106 × 90) with production framing. Ratings are the lab's provisional visual review (<code>reviews.js</code>); they are context-dependent and per width.</p>
      <table class="lab-lib"><thead><tr><th>Picture</th><th>Hero · Half · Third</th><th>Review</th></tr></thead><tbody>${ids.map(id => {
    const r = REVIEWS[id];
    return `<tr data-img="${esc(id)}"><td><code>${esc(id)}</code>${r ? `<br>${esc(r.subject)}` : '<br>not reviewed'}</td>
        <td><div class="lab-covers"><div class="lab-w1">${panelHtml(id, 1)}</div><div class="lab-w2">${panelHtml(id, 0.5)}</div><div class="lab-w3">${panelHtml(id, 1 / 3)}</div></div></td>
        <td>${r ? `<span class="${rateCls(r.hero)}">hero ${r.hero}</span> · <span class="${rateCls(r.half)}">half ${r.half}</span> · <span class="${rateCls(r.third)}">third ${r.third}</span><br>${r.complexity} · ${r.palette} · survives narrow: ${r.survivesNarrow ? 'yes' : 'no'}<br>${esc(r.note)}` : 'Not reviewed'}</td></tr>`;
  }).join('')}</tbody></table>`;
  }
  function viewCrops() {
    const id = S.img, b = 3, key = id + '@' + b, base = Art.IMAGES[id].pos[b], cur = S.crops[key] || {};
    const r = REVIEWS[id], f = r && r.focal;
    const ov = (o) => ({ [key]: o });
    const strip = (label, overrides) => {
      const k = { layout: 1, panels: [{ imageId: id, kind: Art.IMAGES[id].kind, parent: Art.IMAGES[id].parent || id, fraction: 1 / 3, ...Core.framing(Art, id, 1 / 3, overrides) }] };
      return `<div><div class="lab-cap">${label}</div><div class="lab-w3">${Bridge.coverHtml(k, api, Art)}</div></div>`;
    };
    const hero = (label, overrides) => {
      const k = { layout: 1, panels: [{ imageId: id, kind: Art.IMAGES[id].kind, parent: Art.IMAGES[id].parent || id, fraction: 1, ...Core.framing(Art, id, 1, overrides) }] };
      return `<div><div class="lab-cap">${label}</div><div class="lab-w1">${Bridge.coverHtml(k, api, Art)}</div></div>`;
    };
    return `<p class="lab-note">Lab-only framing at the third-width panel (106×90): the production crop, a suggested focal point and your own x / y / zoom (zoom is capped at ${Core.MAX_SCALE}×). Overrides apply to every strategy in this lab only; nothing is written to the registry.</p>
      <label>Picture <select data-img-select>${Object.keys(Art.IMAGES).map(i => `<option value="${esc(i)}" ${i === id ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></label>
      <div class="lab-crop-row" style="margin-top:12px">${strip('Production framing ' + base.x + '% ' + base.y + '%', {})}${f ? strip('Suggested ' + f[0] + '% ' + f[1] + '%', ov({ x: f[0], y: f[1] })) : ''}${strip('Yours', S.crops)}${hero('Hero (318px) reference', {})}
      <div class="lab-ctl"><span>x</span><input type="range" min="0" max="100" value="${cur.x == null ? base.x : cur.x}" data-crop="x"><span>${cur.x == null ? base.x : cur.x}</span>
        <span>y</span><input type="range" min="0" max="100" value="${cur.y == null ? base.y : cur.y}" data-crop="y"><span>${cur.y == null ? base.y : cur.y}</span>
        <span>zoom</span><input type="range" min="1" max="${Core.MAX_SCALE}" step="0.05" value="${cur.scale || 1}" data-crop="scale"><span>${cur.scale || 1}</span>
        <button class="lab-btn" data-crop-reset>Reset</button></div></div>`;
  }
  function exportJson() {
    const comps = {};
    Fx.ALL.forEach(c => { comps[c.id] = {}; Core.STRATEGY_IDS.forEach(s => { comps[c.id][s] = compose(c.id, s); }); });
    return Core.buildExport({ cases: Fx.ALL, prefs: S.prefs, notes: S.notes, crops: S.crops, reviews: REVIEWS, ratio: S.ratio, generated: new Date().toISOString().slice(0, 10) }, analyses, comps);
  }
  function viewExport() {
    return `<p class="lab-note">Preferences and notes live in this lab's own <code>labcc2:state</code> key only.</p>
      <p><button class="lab-btn" data-copy>Copy JSON</button> <button class="lab-btn" data-clear>Clear review state</button></p>
      <textarea class="lab-export" readonly aria-label="Review export">${esc(JSON.stringify(exportJson(), null, 2))}</textarea>`;
  }

  function render() {
    const body = { cases: viewCases, page: viewPage, library: viewLibrary, crops: viewCrops, export: viewExport }[S.tab]();
    root.innerHTML = `<div class="lab-main"><div class="lab-top"><h1>Cover Composition Lab V2</h1>${TABS.map(([id, l]) => `<button class="lab-tab" role="tab" aria-selected="${id === S.tab}" data-tab="${id}">${l}</button>`).join('')}</div>${body}</div>`;
    writeHash({ s: S.strategy, ratio: S.ratio, img: S.img });
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; render(); }
    else if (t.dataset.strategy) { S.strategy = t.dataset.strategy; render(); }
    else if (t.dataset.ratio) { S.ratio = t.dataset.ratio; save(); render(); }
    else if (t.hasAttribute('data-crop-reset')) { delete S.crops[S.img + '@3']; save(); render(); }
    else if (t.hasAttribute('data-copy')) { const ta = root.querySelector('.lab-export'); ta.select(); try { document.execCommand('copy'); } catch (err) { /* ignore */ } }
    else if (t.hasAttribute('data-clear')) { S.prefs = {}; S.notes = {}; S.crops = {}; save(); render(); }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.pref) { S.prefs[t.dataset.pref] = t.value; save(); }
    else if (t.hasAttribute('data-img-select')) { S.img = t.value; render(); }
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.note) { S.notes[t.dataset.note] = t.value; save(); }
    else if (t.dataset.crop) { const k = S.img + '@3'; S.crops[k] = Object.assign({}, S.crops[k], { [t.dataset.crop]: +t.value }); save(); render(); }
  });

  init().catch(err => { root.innerHTML = `<p class="lab-loading">Lab failed to load: ${esc(err.message)}</p>`; console.error(err); });
})();
