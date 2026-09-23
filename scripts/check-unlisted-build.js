#!/usr/bin/env node
/* ============================================================
   Daggerheart Atlas — check-unlisted-build.js
   Regression check for the public-but-unlisted deployment model (see
   the "Unlisted public deployment" section in README.md). Runs after
   scripts/build.js in CI and fails the build if dist/ ever regresses
   back toward crawler-friendly prerendering.

   This does not check access control — there isn't any. It only checks
   that the noindex signal is in place and that the initial HTML/deployed
   artifact doesn't leak the environment catalog or advertise itself to
   crawlers.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

let failed = false;
function fail(msg) { console.error(`FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`PASS: ${msg}`); }

function mustExist(relPath) {
  const full = path.join(DIST, relPath);
  if (!fs.existsSync(full)) {
    fail(`dist/${relPath} does not exist`);
    return false;
  }
  pass(`dist/${relPath} exists`);
  return true;
}

function mustNotExist(relPath, reason) {
  const full = path.join(DIST, relPath);
  if (fs.existsSync(full)) {
    fail(`dist/${relPath} must not be deployed${reason ? ` — ${reason}` : ''}`);
    return false;
  }
  pass(`dist/${relPath} is absent`);
  return true;
}

/* ---- 1/2/3: index.html + noindex ---- */

if (!mustExist('index.html')) {
  console.error('\nCannot continue without dist/index.html.');
  process.exit(1);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

const robotsMatches = html.match(/<meta\s+name="robots"[^>]*>/gi) || [];
const noindexMatches = robotsMatches.filter(tag => /noindex/i.test(tag));
if (noindexMatches.length === 0) {
  fail('dist/index.html does not contain a robots meta directive with noindex');
} else if (noindexMatches.length > 1) {
  fail(`dist/index.html contains ${noindexMatches.length} noindex directives — expected exactly 1`);
} else {
  pass('noindex directive found exactly once');
}

/* ---- 4/5/6/7: no baked-in catalog content ---- */

if (/application\/ld\+json/i.test(html)) {
  fail('dist/index.html contains application/ld+json');
} else {
  pass('dist/index.html contains no application/ld+json block');
}

for (const marker of ['<!--PRERENDER:CATALOG-->', '<!--PRERENDER:JSONLD-->']) {
  if (html.includes(marker)) {
    fail(`dist/index.html still contains the ${marker} placeholder`);
  } else {
    pass(`dist/index.html does not contain ${marker}`);
  }
}

if (/class="card"\s+data-id="/.test(html) || /card-open/.test(html)) {
  fail('dist/index.html appears to contain prerendered environment card markup');
} else {
  pass('dist/index.html contains no prerendered environment cards');
}

/* Sample stable environment names/lore from the beginning, middle, and end
 * of the real dataset, so a regression can't hide behind picking a single
 * checked ID. */
const envPath = path.join(ROOT, 'data', 'environments.json');
let environments = [];
try {
  const parsed = JSON.parse(fs.readFileSync(envPath, 'utf8'));
  environments = parsed.environments || [];
} catch (err) {
  fail(`could not read/parse data/environments.json: ${err.message}`);
}

if (environments.length === 0) {
  fail('data/environments.json has no environments to sample for leak-checking');
} else {
  const n = environments.length;
  const sampleIndexes = [...new Set([
    0, 1,
    Math.floor(n / 2), Math.floor(n / 2) + 1,
    n - 2, n - 1,
  ])].filter(i => i >= 0 && i < n);

  let leaked = false;
  for (const i of sampleIndexes) {
    const env = environments[i];
    const names = [env.name?.en, env.name?.ru].filter(Boolean);
    for (const name of names) {
      if (name.length >= 4 && html.includes(name)) {
        fail(`dist/index.html contains prerendered environment name: "${name}"`);
        leaked = true;
      }
    }
    const loreExcerpts = [env.lore?.en, env.lore?.ru]
      .filter(Boolean)
      .map(text => text.slice(0, 40))
      .filter(excerpt => excerpt.length >= 20);
    for (const excerpt of loreExcerpts) {
      if (html.includes(excerpt)) {
        fail(`dist/index.html contains prerendered environment lore: "${excerpt}..."`);
        leaked = true;
      }
    }
  }
  if (!leaked) pass(`dist/index.html does not contain any of ${sampleIndexes.length} sampled environment names/lore excerpts`);
}

/* ---- 8/9/10: crawler-discovery files absent ---- */

mustNotExist('llms.txt');
mustNotExist('sitemap.xml');
mustNotExist('robots.txt', 'the effective robots.txt must live at the origin root, not under this project path');

/* ---- 11/12/13: runtime assets present and wired up ---- */

mustExist(path.join('data', 'environments.json'));
mustExist(path.join('js', 'app.js'));

if (/<script[^>]+src="js\/app\.js/.test(html)) {
  pass('dist/index.html includes the application script');
} else {
  fail('dist/index.html does not include js/app.js');
}

/* ---- 14: the root-robots example template is documentation only ---- */

mustNotExist(path.join('scripts', 'root-robots.example.txt'));
mustNotExist('root-robots.example.txt');

if (failed) {
  console.error('\nUnlisted-build check failed.');
  process.exit(1);
}

console.log('\nUnlisted-build check passed.');
