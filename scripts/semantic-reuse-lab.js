#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — semantic-reuse-lab.js
   DEV-ONLY, offline. Rebuilds everything the Semantic Artwork Reuse Lab shows from the repo's real files:
     - the source-master inventory (dimensions, bytes, derivatives, production use),
     - the production baseline per environment and frame (read from the real resolvers, never edited),
     - lab-only derivatives of approved regions in lab/semantic-reuse/derivs/ (Approach B),
     - Approach A (runtime CSS crop of the existing 960px derivative) sharpness and bytes for comparison,
     - coverage, and the review export.
   Writes docs/research/semantic-artwork-reuse-lab-v1/{inventory,stats,review-export}.json.
   Needs `sharp` (devDependency). Masters are only read. Nothing here touches js/, data/ or the registry.
   Run: node scripts/semantic-reuse-lab.js [--pilot=v2] [--no-derivatives]  (V2 writes docs/research/semantic-artwork-reuse-lab-v2/ and lab/semantic-reuse/derivs-v2/)
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Core = require('../lab/semantic-reuse/lab-core.js');
const DataV1 = require('../lab/semantic-reuse/data.js');
const DataV2 = require('../lab/semantic-reuse/data-v2.js');
/* Pilot selection: V1 (default, historical) or V2. V2 reuses V1's master inventory and writes only its own folders. */
const pilotPaths = pilot => (pilot === 'v2'
  ? { out: path.join(ROOT, DataV2.RESULTS_DIR), derivs: path.join(ROOT, DataV2.DERIVS_DIR), derivsRel: DataV2.DERIVS_DIR, manifest: path.join(ROOT, DataV2.MANIFEST) }
  : { out: path.join(ROOT, 'docs/research/semantic-artwork-reuse-lab-v1'), derivs: path.join(ROOT, 'lab/semantic-reuse/derivs'), derivsRel: 'lab/semantic-reuse/derivs/', manifest: path.join(ROOT, 'lab/semantic-reuse/derivs-manifest.json') });
const dataFor = pilot => (pilot === 'v2'
  ? Object.assign({}, DataV1, { PILOT_SOURCES: DataV2.PILOT_SOURCES, REGIONS: DataV2.REGIONS, MAPPINGS: DataV2.MAPPINGS })
  : DataV1);
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const AVIF = { quality: 52, effort: 6 };
const WEBP = { quality: 82, effort: 6 };
const LIST_COVER_WIDTHS = [320, 640, 960];

/** Source id -> { path, width, height, format, bytes, available, ... } — missing masters are reported, never replaced. */
async function inventory(sharp) {
  const out = {};
  const files = Object.assign({}, DataV1.MASTER_FILES, DataV1.EXTRA_MASTERS);
  const Art = require('../js/list-cover-art.js');
  const Catalog = require('../js/catalog-art.js');
  for (const [id, file] of Object.entries(files)) {
    const rel = DataV1.MASTER_DIR + file;
    const abs = path.join(ROOT, rel);
    const used = !!Art.IMAGES['archetype:' + id];
    const entry = { path: rel, available: fs.existsSync(abs), extra: !!DataV1.EXTRA_MASTERS[id], productionPicture: used };
    if (entry.available) {
      const m = await sharp(abs).metadata();
      Object.assign(entry, { width: m.width, height: m.height, format: m.format, bytes: fs.statSync(abs).size });
    } else Object.assign(entry, { width: null, height: null, format: null, bytes: null });
    if (used) {
      const img = Art.IMAGES['archetype:' + id];
      entry.derivatives = {
        listCovers: img.avif.map(a => ({ path: a.path, w: a.w, bytes: fs.existsSync(path.join(ROOT, a.path)) ? fs.statSync(path.join(ROOT, a.path)).size : null })),
        listCoverFallback: img.fallback,
        catalogStrips: Catalog.PICTURES['archetype:' + id] ? Catalog.files(Catalog.PICTURES['archetype:' + id].stem).avif.map(a => ({ path: a.path, w: a.w, bytes: fs.existsSync(path.join(ROOT, a.path)) ? fs.statSync(path.join(ROOT, a.path)).size : null })) : [],
        catalogUse: Catalog.PICTURES['archetype:' + id] ? Catalog.PICTURES['archetype:' + id].use : null,
      };
      entry.fitEnvironments = Object.keys(Art.ARCHETYPE_FIT).filter(e => Art.ARCHETYPE_FIT[e][0] === id).length;
    }
    out[id] = entry;
  }
  return out;
}

/** What production draws now for every environment and frame. Lists: unique | override | archetype | biome | none. */
function productionBaseline(envs, artBiome) {
  const Art = require('../js/list-cover-art.js');
  const Catalog = require('../js/catalog-art.js');
  const Lists = require('../js/list-cover-utils.js');
  /* The lab's research baseline is production BEFORE PD-090 (the curated overrides it recommended): without them the
   * lab's recorded results stay reproducible. */
  const Pre = { ...Art, SEMANTIC_OVERRIDES: {} };
  const base = {};
  for (const e of envs) {
    const c = Catalog.resolveCatalogArt(e, Pre);
    const l = Lists.resolveEnvironmentArt({ id: e.id, artBiome: artBiome(e) }, Pre);
    base[e.id] = {
      catalog: c.kind, catalogImage: c.imageId,
      prep: 'biome', /* Session Prep draws the biome thumbnail for every environment (docs/research/catalog-prep-artwork-lab-v3.md §2) */
      lists: !l ? 'none' : (l.kind === 'unique' ? 'unique' : (ART_OVERRIDE(Art, e.id, l) ? 'override' : (l.kind === 'archetype' ? 'archetype' : 'biome'))),
      listsImage: l ? l.imageId : null,
    };
  }
  return base;
}
function ART_OVERRIDE(Art, id, l) { return Object.prototype.hasOwnProperty.call(Art.ENV_IMAGE_OVERRIDES, id) && l.imageId === Art.ENV_IMAGE_OVERRIDES[id]; }

function loadContext() {
  const Bridge = require('../lab/artwork-v3/prod-bridge.js');
  const envs = read('data/environments.json').environments;
  const prod = Bridge.load(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'), {
    EnvTierUtils: require('../js/env-tier-utils.js'), PrepUtils: require('../js/prep-utils.js'), RouteUtils: require('../js/route-utils.js'),
  }, { i18n: read('data/i18n.json'), regions: read('data/regions.json').regions, lang: 'en' });
  const classification = read('docs/research/lists-cover-classification.json');
  const primary = {}; const secondary = {};
  classification.environments.forEach(c => { primary[c.id] = c.primary_archetype || null; secondary[c.id] = c.secondary_archetypes || []; });
  return { envs, artBiome: prod.artBiome, primary, secondary };
}

const sizeOf = rel => (fs.existsSync(path.join(ROOT, rel)) ? fs.statSync(path.join(ROOT, rel)).size : 0);
const derivName = (regionId, ctx, w, h, ext) => `${regionId}--${ctx}-${w}x${h}.${ext}`;

/** Approach A: the existing 960 list-cover derivative cropped at runtime with CSS — can it carry this region in this frame? */
function approachA(region, ctxId, px, framing, srcW) {
  const box = Core.CONTEXTS[ctxId].box;
  const win = Core.frameWindow(px, box, framing);
  const fullWidthCss = box.w * srcW / win.w; /* css width the whole picture would need to be drawn at */
  const per = {};
  for (const dpr of Core.DPRS) {
    const needFull = Math.ceil(fullWidthCss * dpr);
    const file = LIST_COVER_WIDTHS.find(w => w >= needFull) || LIST_COVER_WIDTHS[LIST_COVER_WIDTHS.length - 1];
    per[dpr] = { needFullPx: needFull, file, upscaled: needFull > 960, drawsWindowPx: Core.round(win.w * file / srcW, 1), cssFullWidth: Core.round(fullWidthCss, 1) };
  }
  return per;
}

async function buildDerivatives(sharp, region, src, srcMeta, verdicts, P) {
  const files = [];
  const px = Core.boundsToPixels(region.bounds, srcMeta);
  for (const ctx of Core.CONTEXT_IDS) {
    const v = verdicts[ctx];
    if (!v.usable) continue;
    const box = Core.CONTEXTS[ctx].box;
    const win = Core.frameWindow(px, box, v.framing);
    const left = Math.round(px.x + win.x); const top = Math.round(px.y + win.y);
    const width = Math.max(1, Math.min(Math.round(win.w), srcMeta.width - left));
    const height = Math.max(1, Math.min(Math.round(win.h), srcMeta.height - top));
    for (const dpr of Core.DPRS) {
      const w = box.w * dpr; const h = box.h * dpr;
      const base = sharp(src).extract({ left, top, width, height }).resize(w, h, { fit: 'fill', kernel: 'lanczos3', withoutEnlargement: false });
      const name = derivName(region.id, ctx, w, h, 'avif');
      const buf = await base.clone().avif(AVIF).toBuffer();
      fs.writeFileSync(path.join(P.derivs, name), buf);
      files.push({ regionId: region.id, ctx, dpr, w, h, format: 'avif', path: P.derivsRel + name, bytes: buf.length, sourceWindow: { left, top, width, height }, upscaled: width < w });
      if (ctx === 'catalog' && dpr === 2) {
        const wn = derivName(region.id, ctx, w, h, 'webp');
        const wb = await base.clone().webp(WEBP).toBuffer();
        fs.writeFileSync(path.join(P.derivs, wn), wb);
        files.push({ regionId: region.id, ctx, dpr, w, h, format: 'webp', path: P.derivsRel + wn, bytes: wb.length, sourceWindow: { left, top, width, height }, upscaled: width < w });
      }
    }
  }
  return files;
}

async function run(opts) {
  opts = opts || {};
  const pilot = opts.pilot === 'v2' ? 'v2' : 'v1';
  const P = pilotPaths(pilot); const Data = dataFor(pilot); const OUT = P.out; const DERIVS = P.derivs;
  const sharp = require('sharp');
  fs.mkdirSync(OUT, { recursive: true });
  const inv = await inventory(sharp);
  const { envs, artBiome, primary } = loadContext();
  const envIds = envs.map(e => e.id);
  const baseline = productionBaseline(envs, artBiome);
  const sources = {};
  Object.keys(inv).forEach(id => { if (inv[id].available) sources[id] = { path: inv[id].path, width: inv[id].width, height: inv[id].height, format: inv[id].format, bytes: inv[id].bytes }; });

  const regionReports = [];
  const derivFiles = [];
  if (!opts.noDerivatives) { fs.rmSync(DERIVS, { recursive: true, force: true }); fs.mkdirSync(DERIVS, { recursive: true }); }
  for (const r of Data.REGIONS) {
    const srcMeta = sources[r.sourceId];
    const px = Core.boundsToPixels(r.bounds, srcMeta);
    const verdicts = {};
    const frames = {};
    for (const ctx of Core.CONTEXT_IDS) {
      const entry = (r.contexts || {})[ctx] || { verdict: 'unreviewed' };
      const framing = Core.contextFraming(r, ctx, px);
      const viab = Core.viability(px, ctx, framing, Core.subjectFor(r, ctx));
      const status = Core.effectiveStatus(viab, entry.verdict);
      const usable = r.status === 'approved' && entry.verdict === 'pass' && (status === 'suitable-dpr1-dpr2' || status === 'suitable-dpr1-limited-dpr2');
      verdicts[ctx] = { framing, usable };
      frames[ctx] = Object.assign({ verdict: entry.verdict, status, usable, A: approachA(r, ctx, px, framing, srcMeta.width) }, viab);
    }
    let files = [];
    if (!opts.noDerivatives && r.status === 'approved') files = await buildDerivatives(sharp, r, path.join(ROOT, srcMeta.path), srcMeta, verdicts, P);
    derivFiles.push(...files);
    regionReports.push({ id: r.id, sourceId: r.sourceId, status: r.status, pixels: px, frames, derivatives: files });
  }

  const cov = Core.coverage({ regions: Data.REGIONS, mappings: Data.MAPPINGS, sources, envIds, baseline, primaryArchetype: primary });
  const approvedRegions = Data.REGIONS.filter(r => r.status === 'approved');
  const usableFrames = regionReports.flatMap(r => Core.CONTEXT_IDS.filter(c => r.frames[c].usable).map(c => ({ region: r.id, ctx: c })));
  const bytes = (fmt, ctx) => derivFiles.filter(f => f.format === fmt && (!ctx || f.ctx === ctx)).reduce((n, f) => n + f.bytes, 0);
  const gainInput = (regions, mappings) => ({ regions, mappings, sources, envIds, baseline, primaryArchetype: primary });
  const gainsV2 = pilot === 'v2' ? Core.gains(gainInput(Data.REGIONS, Data.MAPPINGS)) : null;
  const gainsCombined = pilot === 'v2' ? Core.gains(gainInput(DataV1.REGIONS.concat(DataV2.REGIONS), DataV1.MAPPINGS.concat(DataV2.MAPPINGS))) : null;
  const gainsV1 = pilot === 'v2' ? Core.gains(gainInput(DataV1.REGIONS, DataV1.MAPPINGS)) : null;
  const stats = {
    pilot,
    generated: new Date().toISOString().slice(0, 10),
    sourcesInspected: Object.keys(inv).length, pilotSources: Data.PILOT_SOURCES.length, mastersMissing: Object.keys(inv).filter(k => !inv[k].available),
    regions: {
      proposed: Data.REGIONS.length, approved: approvedRegions.length,
      byStatus: Core.REGION_STATUSES.reduce((o, s) => { o[s] = Data.REGIONS.filter(r => r.status === s).length; return o; }, {}),
      passingVisualQa: approvedRegions.length,
      resolutionPass: regionReports.filter(r => Core.CONTEXT_IDS.some(c => r.frames[c].usable)).length,
      usableFrames: usableFrames.length,
      averageUsablePerPilotSource: Core.round(approvedRegions.length / Data.PILOT_SOURCES.length, 2),
    },
    mappings: {
      total: Data.MAPPINGS.length,
      byReview: Core.MAPPING_REVIEWS.reduce((o, s) => { o[s] = Data.MAPPINGS.filter(m => m.review === s).length; return o; }, {}),
    },
    baseline: {
      environments: envs.length,
      catalog: countBy(envIds, e => baseline[e].catalog),
      lists: countBy(envIds, e => baseline[e].lists),
      prep: countBy(envIds, e => baseline[e].prep),
    },
    coverage: cov,
    gains: pilot === 'v2' ? { v1: stripRegions(gainsV1), v2: stripRegions(gainsV2), combined: stripRegions(gainsCombined) } : undefined,
    unlockedByCrops: (() => { const ids = cov.approved.ids.filter(e => !['unique', 'override', 'archetype'].includes(baseline[e].lists) && !['unique', 'override', 'thematic'].includes(baseline[e].catalog)); return { count: ids.length, ids }; })(),
    assets: {
      files: derivFiles.length, avifBytes: bytes('avif'), webpBytes: bytes('webp'),
      byContext: Core.CONTEXT_IDS.reduce((o, c) => { o[c] = { avif: bytes('avif', c), files: derivFiles.filter(f => f.ctx === c).length }; return o; }, {}),
      avifBytesDpr1: derivFiles.filter(f => f.format === 'avif' && f.dpr === 1).reduce((n, f) => n + f.bytes, 0),
      avifBytesDpr2: derivFiles.filter(f => f.format === 'avif' && f.dpr === 2).reduce((n, f) => n + f.bytes, 0),
      upscaledFiles: derivFiles.filter(f => f.upscaled).length,
      existingCatalogStrip200Avg: avg(Object.values(inv).filter(i => i.derivatives && i.derivatives.catalogStrips.length).map(i => (i.derivatives.catalogStrips.find(s => s.w === 200) || {}).bytes).filter(Boolean)),
      existing960Avg: avg(Object.values(inv).filter(i => i.derivatives).map(i => (i.derivatives.listCovers.find(s => s.w === 960) || {}).bytes).filter(Boolean)),
      existing640Avg: avg(Object.values(inv).filter(i => i.derivatives).map(i => (i.derivatives.listCovers.find(s => s.w === 640) || {}).bytes).filter(Boolean)),
    },
    regionReports,
  };
  const exp = Core.buildExport({ regions: Data.REGIONS, mappings: Data.MAPPINGS, sources, envIds, baseline, primaryArchetype: primary, generated: stats.generated });
  const problems = Core.validateExport(exp);
  if (problems.length) throw new Error('export invalid: ' + problems.join('; '));
  fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(inv, null, 1) + '\n');
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 1) + '\n');
  fs.writeFileSync(path.join(OUT, 'review-export.json'), JSON.stringify(exp, null, 1) + '\n');
  fs.writeFileSync(P.manifest, JSON.stringify(derivFiles, null, 1) + '\n');
  console.log('inventory', Object.keys(inv).length, 'regions', Data.REGIONS.length, 'approved', approvedRegions.length, 'derivative files', derivFiles.length);
  console.log('coverage', JSON.stringify({ approved: cov.approved.environments, net: Object.fromEntries(Core.COVERAGE_CONTEXTS.map(c => [c, cov.byContext[c].net])), any: cov.netAnyContext, cross: cov.crossArchetype.environments }));
  return { inv, stats, exp, baseline };
}
const stripRegions = g => JSON.parse(JSON.stringify(g, (k, v) => (k === 'regionsByEnv' ? undefined : v)));
const countBy = (a, f) => a.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

module.exports = { inventory, productionBaseline, loadContext, approachA, run, derivName };
if (require.main === module) run({ noDerivatives: process.argv.includes('--no-derivatives'), pilot: process.argv.includes('--pilot=v2') || process.argv.includes('v2') ? 'v2' : 'v1' }).catch(e => { console.error(e); process.exit(1); });
