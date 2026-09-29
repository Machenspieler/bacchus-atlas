#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — import-session-prep-adversaries.js
   One-time import/audit tool that (re)builds data/session-prep.json's
   `adversaries` array from:

     1. A canonical Daggerheart SRD 2.0 adversary list (English name, Tier,
        Type) — produced by researching the official SRD text (see
        docs/product-decisions.md and the completion report for the exact
        source used: a GitHub mirror of the SRD, matthttam/daggerheart-srd-2.0,
        cross-checked against each adversary's own stat-block header line).
        This file is NOT committed to the repo (it's raw external research
        output, not this project's own data) — regenerate it by researching
        the current SRD adversary index the same way, or point
        --canonical at your own copy.
     2. daggerheart.ru's own adversary listing (https://daggerheart.ru/adversary,
        with the site's own "На Русском" language toggle switched on — a
        session-scoped cookie, not a URL prefix, which is why an earlier,
        archive.org-only research pass wrongly concluded the site had no
        adversary translations at all). Matched by English slug (the site's
        own `/adversary/<slug>` URL), which matched 129 of the 264 canonical
        adversaries with zero Tier/Type discrepancies against the canonical
        source in the batch verified 2026-09-28. The site does not cover all
        264 (confirmed directly by the project owner) — the remaining ids
        fall through to manual translation. This file is NOT committed
        either (raw external research output) — regenerate by re-scraping
        the listing, or point --ru-site at your own copy; shape is an array
        of `{href: "/adversary/<slug>", nameRu, typeRu (one of the ten
        Russian Type labels), tier}`.
     3. data/adversary-translations-manual.json — this project's own
        committed manual Russian translations, for the ids daggerheart.ru
        doesn't cover. Never overwrites a daggerheart.ru or existing
        translation.
     4. IMAGE_MAPPING below — an explicit, hand-reviewed slug -> local
        source-art path table for img/adversaries/session-prep/*,
        committed here because it IS this project's own data (unlike the
        raw research inputs above). Each mapped source path is turned into
        an `art: { thumb, full }` pair pointing at the pre-generated
        derivatives under img/adversaries/session-prep/generated/ (see
        scripts/generate-adversary-art.js) — run that script first if a
        source file listed here doesn't have derivatives yet.

   Never fetches anything over the network. Never silently overwrites a
   translation. Writes data/session-prep.json and a translation-audit
   report (see --audit-out) so the merge is fully reviewable before commit.

   Usage:
     node scripts/import-session-prep-adversaries.js [--canonical=path] [--ru-site=path] [--dry-run] [--audit-out=path]

   Exits non-zero (and does not write data/session-prep.json) if any
   adversary ends up unresolved / ambiguous / manual-translation-required —
   see "PRODUCTION COMPLETION" in the completion report for what "done"
   requires.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const out = {
    canonical: '/tmp/daggerheart-research/adversaries-canonical.json',
    ruSite: '/tmp/daggerheart-research/adversary-translations-ru-site.json',
    dryRun: false,
    auditOut: path.join(ROOT, 'tmp', 'session-prep-adversary-translation-audit.json'),
  };
  argv.forEach(arg => {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--canonical=')) out.canonical = arg.slice('--canonical='.length);
    else if (arg.startsWith('--ru-site=')) out.ruSite = arg.slice('--ru-site='.length);
    else if (arg.startsWith('--audit-out=')) out.auditOut = arg.slice('--audit-out='.length);
  });
  return out;
}

/* The ten official Adversary Types, as daggerheart.ru's own Russian UI
 * labels them (confirmed directly against the site's Type filter — see the
 * completion report) -> this project's normalized English type keys. Used
 * only to cross-check the site's own Tier/Type against the canonical
 * source, never to decide the final `type` value (the canonical source
 * already gives that in English). */
const RU_TYPE_TO_EN = {
  'Громила': 'bruiser', 'Орда': 'horde', 'Лидер': 'leader', 'Приспешник': 'minion',
  'Дальнобойный': 'ranged', 'Скрытный': 'skulk', 'Социальный': 'social', 'Одиночка': 'solo',
  'Рядовой': 'standard', 'Поддержка': 'support',
};

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

/** Deterministic slug: lowercase, any run of non-alphanumeric characters
 * becomes one hyphen, no leading/trailing hyphen. Verified (see the
 * completion report) to reproduce all 17 existing MVP ids byte-for-byte
 * from their canonical English names, with zero collisions across the
 * full 264-name list. */
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* The 17 original Session Prep MVP ids — must never be renamed. Mirrors
 * scripts/validate-data.js's SESSION_PREP_MVP_IDS; duplicated here (rather
 * than required cross-file) so this script stays a standalone, readable
 * one-time tool. */
const MVP_IDS = [
  'acid-burrower', 'ahuizotl', 'atototl', 'bear', 'bugboar', 'cave-ogre', 'common-ruffian',
  'construct', 'courtier', 'darkweave-crawler', 'darkweave-queen', 'darkweave-spinner',
  'darkweave-swarmlings', 'deeproot-defender', 'dire-wolf', 'elk', 'falcon',
];

/* Explicit slug -> local art path mapping for img/adversaries/session-prep/.
 * Hand-reviewed against the folder's actual filenames (see the completion
 * report for how each was matched, including the handful of "group art"
 * images — one piece of art intentionally shared by every member of a named
 * group the source book itself groups together, e.g. the four Darkweave
 * adversaries or the four Harbingers — never one creature's art reused for
 * an unrelated creature). Missing here is normal and expected: only 110 of
 * 264 adversaries have local art; every other one uses the designed
 * fallback icon. */
const IMAGE_MAPPING = {
  'darkweave-crawler': 'img/adversaries/session-prep/064_darkweave_adversaries.png',
  'darkweave-queen': 'img/adversaries/session-prep/064_darkweave_adversaries.png',
  'darkweave-spinner': 'img/adversaries/session-prep/064_darkweave_adversaries.png',
  'darkweave-swarmlings': 'img/adversaries/session-prep/064_darkweave_adversaries.png',
  'vampire-lord': 'img/adversaries/session-prep/089_vampire_lord_hellwing.png',
  'harbinger-of-death': 'img/adversaries/session-prep/095_the_harbingers.png',
  'harbinger-of-famine': 'img/adversaries/session-prep/095_the_harbingers.png',
  'harbinger-of-pestilence': 'img/adversaries/session-prep/095_the_harbingers.png',
  'harbinger-of-war': 'img/adversaries/session-prep/095_the_harbingers.png',
  'head-vampire': 'img/adversaries/session-prep/head-vampire-and-dire-bat.png',
  'dire-bat': 'img/adversaries/session-prep/head-vampire-and-dire-bat.png',
  'minotaur-wrecker': 'img/adversaries/session-prep/minotaur.png',
};

/** Every other image maps 1:1 by filename: a plain `<slug>.<ext>` file, or
 * a `<page-number>_<slug-with-underscores>.<ext>` crop of the source book —
 * both scanned directly off disk rather than hand-listed a second time, so
 * adding a new art file later needs no code change here. Skips the
 * generated/ subdirectory itself (thumb/full derivatives, not sources). */
function scanImageDirectory() {
  const dir = path.join(ROOT, 'img', 'adversaries', 'session-prep');
  const mapping = Object.assign({}, IMAGE_MAPPING);
  if (!fs.existsSync(dir)) return mapping;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    if (!entry.isFile() || entry.name.startsWith('.')) return;
    const filename = entry.name;
    const ext = path.extname(filename);
    const base = filename.slice(0, -ext.length);
    const m = base.match(/^(\d{3})_(.+)$/);
    const rest = m ? m[2] : base;
    const slug = rest.replace(/_/g, '-');
    if (!mapping[slug]) mapping[slug] = `img/adversaries/session-prep/${filename}`;
  });
  return mapping;
}

/** A mapped source path (e.g. img/adversaries/session-prep/foo.png) to the
 * `{ thumb, full }` pair scripts/generate-adversary-art.js derives from it
 * — same source-stem-based, deterministic naming that script uses, so this
 * never has to be regenerated to stay in sync with it. */
function deriveArtPaths(sourcePath) {
  const base = path.basename(sourcePath);
  const stem = base.slice(0, -path.extname(base).length);
  return {
    thumb: `img/adversaries/session-prep/generated/thumbs/${stem}.webp`,
    full: `img/adversaries/session-prep/generated/full/${stem}.webp`,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(opts.canonical)) {
    console.error(`Canonical adversary list not found at ${opts.canonical}.`);
    console.error('Regenerate it by researching the current Daggerheart SRD 2.0 adversary index (see this script\'s header comment), or pass --canonical=<path>.');
    process.exitCode = 1;
    return;
  }
  const canonical = readJson(opts.canonical).adversaries;

  const manualPath = path.join(ROOT, 'data', 'adversary-translations-manual.json');
  const manualTranslations = fs.existsSync(manualPath) ? readJson(manualPath) : {};

  const ruSiteBySlug = new Map();
  if (fs.existsSync(opts.ruSite)) {
    readJson(opts.ruSite).forEach(entry => {
      const slug = entry.href.replace(/^\/adversary\//, '');
      ruSiteBySlug.set(slug, entry);
    });
  }

  const sessionPrepPath = path.join(ROOT, 'data', 'session-prep.json');
  const currentSessionPrep = readJson(sessionPrepPath);
  const currentById = new Map(currentSessionPrep.adversaries.map(a => [a.id, a]));

  const imageMapping = scanImageDirectory();

  const seenIds = new Set();
  const seenNames = new Set();
  const audit = [];
  const finalAdversaries = [];
  const usedManualKeys = new Set();

  canonical.forEach(entry => {
    const id = slugify(entry.name);
    if (seenIds.has(id)) {
      audit.push({ id, englishName: entry.name, tier: entry.tier, type: entry.type, finalRussianName: null, status: 'ambiguous-match', note: `Slug collision with an earlier entry — refusing to guess which is which.` });
      return;
    }
    seenIds.add(id);
    const normName = entry.name.trim().toLowerCase();
    if (seenNames.has(normName)) {
      audit.push({ id, englishName: entry.name, tier: entry.tier, type: entry.type, finalRussianName: null, status: 'ambiguous-match', note: 'Duplicate English name in the canonical source.' });
      return;
    }
    seenNames.add(normName);

    const existing = currentById.get(id);
    const ruSite = ruSiteBySlug.get(id);
    let ru = null;
    let status = null;
    let note;
    if (ruSite) {
      ru = ruSite.nameRu;
      status = 'daggerheart-source';
      const siteType = RU_TYPE_TO_EN[ruSite.typeRu];
      const mismatches = [];
      if (ruSite.tier !== entry.tier) mismatches.push(`tier ${entry.tier} vs site ${ruSite.tier}`);
      if (siteType && siteType !== entry.type) mismatches.push(`type ${entry.type} vs site ${siteType}`);
      if (mismatches.length) note = `daggerheart.ru disagrees on ${mismatches.join(', ')} — kept the canonical SRD value.`;
    } else if (existing && existing.name && existing.name.ru) {
      ru = existing.name.ru;
      status = 'existing-project-data';
    } else if (Object.prototype.hasOwnProperty.call(manualTranslations, entry.name)) {
      ru = manualTranslations[entry.name];
      usedManualKeys.add(entry.name);
      status = 'manual-translation-supplied';
    } else {
      status = 'manual-translation-required';
    }

    audit.push({ id, englishName: entry.name, tier: entry.tier, type: entry.type, daggerheartRuName: ruSite ? ruSite.nameRu : null, finalRussianName: ru, status, note });

    if (status === 'manual-translation-required' || status === 'ambiguous-match' || status === 'unresolved') return;

    const record = { id, name: { en: entry.name, ru }, tier: entry.tier, type: entry.type };
    const sourceImage = imageMapping[id];
    if (existing && existing.art) record.art = existing.art;
    else if (sourceImage) record.art = deriveArtPaths(sourceImage);
    finalAdversaries.push(record);
  });

  MVP_IDS.forEach(mvpId => {
    if (!seenIds.has(mvpId)) {
      audit.push({ id: mvpId, englishName: null, tier: null, type: null, finalRussianName: null, status: 'unresolved', note: 'Original MVP id not found in the canonical source at all.' });
    }
  });

  const unusedManual = Object.keys(manualTranslations).filter(k => !usedManualKeys.has(k));
  const unknownManualKeys = unusedManual; // every manual key not consumed is either unused or refers to an unknown name — same list here since manual keys are matched by exact English name.

  const blockingStatuses = new Set(['manual-translation-required', 'ambiguous-match', 'unresolved']);
  const blocking = audit.filter(a => blockingStatuses.has(a.status));

  const summary = {
    generatedAt: new Date().toISOString(),
    totalCanonical: canonical.length,
    totalResolved: finalAdversaries.length,
    countByStatus: audit.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {}),
    unusedManualTranslationKeys: unusedManual,
    blockingCount: blocking.length,
  };

  fs.mkdirSync(path.dirname(opts.auditOut), { recursive: true });
  fs.writeFileSync(opts.auditOut, JSON.stringify({ summary, records: audit }, null, 2) + '\n');
  console.log(`Wrote audit report to ${path.relative(ROOT, opts.auditOut)}`);
  console.log(`Resolved ${finalAdversaries.length} / ${canonical.length} adversaries.`);
  if (unusedManual.length) console.log(`WARNING: ${unusedManual.length} manual translation key(s) unused: ${unusedManual.join(', ')}`);

  if (blocking.length) {
    console.error(`\nBLOCKED: ${blocking.length} adversary record(s) are unresolved/ambiguous/manual-translation-required:`);
    blocking.forEach(b => console.error(`  - ${b.englishName || b.id}: ${b.status}${b.note ? ' — ' + b.note : ''}`));
    process.exitCode = 1;
    return;
  }

  if (finalAdversaries.length !== 264) {
    console.error(`BLOCKED: expected exactly 264 resolved adversaries, got ${finalAdversaries.length}.`);
    process.exitCode = 1;
    return;
  }

  if (opts.dryRun) {
    console.log('--dry-run: not writing data/session-prep.json.');
    return;
  }

  const nextSessionPrep = Object.assign({}, currentSessionPrep, { adversaries: finalAdversaries });
  fs.writeFileSync(sessionPrepPath, JSON.stringify(nextSessionPrep, null, 2) + '\n');
  console.log(`Wrote ${finalAdversaries.length} adversaries to data/session-prep.json.`);
}

if (require.main === module) main();

module.exports = { slugify, scanImageDirectory, deriveArtPaths, MVP_IDS };
