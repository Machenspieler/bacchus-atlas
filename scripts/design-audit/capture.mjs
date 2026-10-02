#!/usr/bin/env node
// Stage 2 visual screenshot suite. Usage:
//   node scripts/design-audit/capture.mjs [--only=core,prep,...] [--vp=1440x900] [--out=docs/design-audit/stage-2]
// Read-only with respect to the app: serves the repo as-is, never edits CSS/HTML/JS.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { startServer, ROOT } from './lib.mjs';
import { Recorder, launch, openSession, VIEWPORTS, vpName, attempt, DSF } from './harness.mjs';
import * as core from './sections-core.mjs';
import * as prep from './sections-prep.mjs';
import * as ui from './sections-ui.mjs';
import * as icons from './sections-icons.mjs';
import * as states from './sections-states.mjs';
import { buildSheets, buildReport, buildReadme, gitInfo } from './finalize.mjs';
import { createRequire } from 'node:module';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const only = (arg('only') || '').split(',').filter(Boolean);
const vpOnly = arg('vp');
const OUT = path.resolve(ROOT, arg('out') || 'docs/design-audit/stage-2');
const want = n => !only.length || only.includes(n);

const rec = new Recorder(OUT);
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await startServer();
const browser = await launch();
const t0 = Date.now();

const vps = VIEWPORTS.filter(v => !vpOnly || vpName(v) === vpOnly);

for (const vp of vps) {
  console.log(`== ${vpName(vp)}`);
  if (want('core')) {
    for (const [label, profileName, fn] of [['catalog', 'full', core.catalog], ['lists', 'full', core.lists], ['journey', 'full', core.journey], ['journey-details', 'full', core.journeyDetails]]) {
      const s = await openSession(browser, url, vp, profileName, rec);
      await attempt(rec, `${vpName(vp)} ${label}`, () => fn(s));
      await s.context.close();
    }
  }

  if (want('prep')) {
    for (const [label, profileName, fn] of [
      ['prep-layouts', 'full', prep.layouts],
      ['prep-empty', 'empty', s => prep.emptyAndPartial(s, 'empty')],
      ['prep-partial', 'partial', s => prep.emptyAndPartial(s, 'partial')],
      ['prep-session', 'full', prep.session],
      ['prep-hint', 'hint', prep.sessionHint],
    ]) {
      const s = await openSession(browser, url, vp, profileName, rec);
      await attempt(rec, `${vpName(vp)} ${label}`, () => fn(s));
      await s.context.close();
    }
  }
  if (want('ui')) {
    const plan = [['prep-controls', 'full', ui.controls]];
    if (vp.width === 1440) plan.push(['prep-recommended', 'full', ui.recommended], ['prep-empties', 'full', ui.pickerEmpties], ['other-empties', 'full', ui.emptyOtherPages], ['surfaces', 'full', ui.surfaces]);
    for (const [label, profileName, fn] of plan) {
      const s = await openSession(browser, url, vp, profileName, rec);
      await attempt(rec, `${vpName(vp)} ${label}`, () => fn(s));
      await s.context.close();
    }
  }
  if (want('icons')) {
    const plan = [['optical', 'full', icons.opticalSet]];
    if (vp.width === 1440) plan.unshift(['icon-families', 'full', icons.iconFamilies], ['chips', 'full', icons.chips], ['storage-notice', 'notice', icons.storageNotice]);
    for (const [label, profileName, fn] of plan) {
      const s = await openSession(browser, url, vp, profileName, rec);
      await attempt(rec, `${vpName(vp)} ${label}`, () => fn(s));
      await s.context.close();
    }
  }
  if (want('states')) {
    const plan = [['modals', 'full', states.modals]];
    if (vp.width === 1440) plan.push(['focus', 'full', states.focusStates], ['links', 'full', states.linkStates], ['disabled', 'full', states.disabledStates], ['checkboxes', 'full', states.checkboxes]);
    for (const [label, profileName, fn] of plan) {
      const s = await openSession(browser, url, vp, profileName, rec);
      await attempt(rec, `${vpName(vp)} ${label}`, () => fn(s));
      await s.context.close();
    }
  }
}

if (want('breakpoint')) {
  console.log('== breakpoint 640/641/642');
  const { openSession: o, go: g, full: f } = await import('./harness.mjs');
  await attempt(rec, 'breakpoint', () => states.breakpoint(browser, url, rec, OUT, { openSession: o, go: g, full: f }));
}

const browserVersion = browser.version();
await browser.close(); server.close();

const partial = !!(only.length || vpOnly);
if (!partial) {
  await attempt(rec, 'sheets', () => buildSheets(rec, OUT));
  const pw = createRequire(import.meta.url)('playwright/package.json').version;
  const g = gitInfo(ROOT);
  const secs = Math.round((Date.now() - t0) / 1000);
  const info = { browserVersion, playwright: pw, dsf: DSF, commit: g.commit, dirty: g.dirty, date: new Date().toISOString().slice(0, 10), duration: `${Math.floor(secs / 60)}m ${secs % 60}s` };
  const { md, unmet } = buildReport(rec, info);
  fs.writeFileSync(path.join(OUT, 'capture-report.md'), md);
  fs.writeFileSync(path.join(OUT, 'README.md'), buildReadme());
  const sorted = [...rec.entries].sort((a, b) => a.file.localeCompare(b.file));
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    meta: { generatedBy: 'scripts/design-audit/capture.mjs', stage1Report: 'docs/design-consistency-audit.md', ...info, viewports: vps, diagnosticViewports: ['640x900', '641x900', '642x900'], appLanguage: 'en', counts: { total: sorted.length, fullContext: sorted.filter(e => e.type.startsWith('full')).length, componentCrops: sorted.filter(e => e.type === 'component-crop').length, contactSheets: sorted.filter(e => e.type === 'contact-sheet').length } },
    captures: sorted, notCaptured: rec.undone, failures: rec.failures, abortedRequestsNotListed: rec.abortedRequests || 0, consoleIssues: rec.consoleIssues, measurements: rec.measurements,
  }, null, 1));
  console.log('unmet Stage 1 checklist items:', unmet.length ? unmet : 'none');
} else {
  fs.writeFileSync(path.join(OUT, 'manifest.partial.json'), JSON.stringify({ entries: rec.entries, failures: rec.failures, notCaptured: rec.undone, consoleIssues: rec.consoleIssues, measurements: rec.measurements }, null, 1));
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${rec.entries.length} files, ${rec.failures.length} failures`);
