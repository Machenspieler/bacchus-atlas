#!/usr/bin/env node
/* ============================================================
   Daggerheart Atlas — prerender.js
   Runs in CI (see .github/workflows/deploy.yml), never locally as
   part of "development". Builds dist/ as a copy of the repo with
   index.html's PRERENDER markers replaced by real markup generated
   from data/environments.json, so the HTML GitHub Pages serves has
   the catalog in it before any JavaScript runs — most search and
   AI crawling tools never execute js/app.js.

   This mirrors (a trimmed, single-language version of) cardHtml()
   in js/app.js. It is a separate implementation, not a shared one,
   because js/app.js depends on `document`/`location` throughout and
   isn't meant to run under Node.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const SITE_URL = 'https://machenspieler.github.io/daggerheart-codex/';

/* The default language shown to a visitor (and to anything that doesn't run
 * JS) is Russian — see storedLang() in js/app.js. */
const LANG = 'ru';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function bilingual(field) { return field?.[LANG] || field?.en || field?.ru || ''; }

function envField(env, field) {
  const v = env[field];
  if (!v) return [];
  return (v[LANG] && v[LANG].length) ? v[LANG] : (v.en || v.ru || []);
}

function envName(env) { return env.name[LANG] || env.name.en || env.name.ru || '(untitled)'; }

function envHash(id) { return '#/env/' + encodeURIComponent(id); }

const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/i18n.json'), 'utf8'));
const dict = i18n[LANG] || {};
function t(key) { return dict[key] || key; }

const { environments = [] } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/environments.json'), 'utf8'));
const { regions = [] } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regions.json'), 'utf8'));

function regionOfEnv(id) { return regions.find(r => (r.environments || []).includes(id)) || null; }
function regionName(region) { return region.name?.[LANG] || region.name?.en || region.name?.ru || ''; }

function cardHtml(env) {
  const impulses = envField(env, 'impulses');
  const loreText = bilingual(env.lore);
  const typeChip = `<span class="environment-type-chip">${escapeHtml(t('type_' + env.type))}</span>`;
  const biomeChips = (env.biomes || []).map(b => `<span class="biome-chip">${escapeHtml(t('biome_' + b))}</span>`).join('');
  const region = regionOfEnv(env.id);
  const regionChip = region ? `<span class="region-chip">${escapeHtml(regionName(region))}</span>` : '';
  return `
    <article class="card" data-id="${env.id}">
      <span class="rank-icon rank-icon-sm active card-tier-badge" role="img" aria-label="${escapeHtml(t('tier_label'))} ${env.tier}"><span aria-hidden="true">${env.tier}</span></span>
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-title"><a class="card-open" href="${envHash(env.id)}">${escapeHtml(envName(env))}</a></h3>
        </div>
        ${loreText ? `<p class="card-lore">${escapeHtml(loreText)}</p>` : ''}
        ${impulses.length ? `<div class="card-impulses"><span class="card-impulses-label">${escapeHtml(t('impulses_label'))}:</span> ${escapeHtml(impulses.join(', '))}</div>` : ''}
        <div class="card-meta">${typeChip}${biomeChips}${regionChip}</div>
      </div>
    </article>`;
}

const cardsHtml = environments.map(cardHtml).join('\n');

/* A schema.org ItemList is understood by both classic search and the newer
 * "answer engine" style tools, and survives even where the markup above
 * doesn't get read (e.g. a tool that parses structured data but not prose). */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Daggerheart Atlas',
  description: dict.app_subtitle || '',
  numberOfItems: environments.length,
  itemListElement: environments.map((env, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: SITE_URL + envHash(env.id),
    name: envName(env),
  })),
};
/* Escaping "</" keeps a stray "</script>" inside any field from closing the
 * tag early — none of today's data has one, but this runs unattended. */
const jsonLdHtml = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\//g, '<\\/')}</script>`;

/* ---- assemble dist/ ---- */

fs.rmSync(OUT, { recursive: true, force: true });
/* fs.cpSync refuses outright to copy a directory into its own subdirectory,
 * before it ever consults `filter` — which is exactly dist/'s relationship to
 * ROOT — so the tree is walked and copied by hand instead. */
const EXCLUDE = new Set(['.git', '.github', '.claude', 'scripts', 'dist', 'node_modules']);
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}
copyTree(ROOT, OUT);

const indexPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('<!--PRERENDER:CATALOG-->') || !html.includes('<!--PRERENDER:JSONLD-->')) {
  throw new Error('index.html is missing a PRERENDER marker — did it change shape?');
}
html = html.replace('<!--PRERENDER:CATALOG-->', cardsHtml);
html = html.replace('<!--PRERENDER:JSONLD-->', jsonLdHtml);
fs.writeFileSync(indexPath, html);

console.log(`Prerendered ${environments.length} environments into dist/index.html`);
