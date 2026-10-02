// Capture harness for the Stage 2 screenshot suite.
// Owns: browser contexts per viewport, settle/hover/focus helpers, the
// full-screenshot and crop writers, and the manifest recorder.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { DETERMINISM_INIT, NOISE_CSS, profile, seedScript } from './lib.mjs';

export const VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
export const vpName = vp => `${vp.width}x${vp.height}`;

export const DSF = 1;

export class Recorder {
  constructor(outDir) {
    this.outDir = outDir;
    this.entries = [];
    this.failures = [];
    this.consoleIssues = [];
    this.measurements = {};
    this.findings = [];
    this.undone = [];
  }
  add(e) { this.entries.push(e); }
  fail(label, err) {
    const msg = String(err && err.message || err).split('\n')[0].slice(0, 300);
    this.failures.push({ label, error: msg });
    console.log(`  ! FAILED ${label}: ${msg}`);
  }
  finding(text) { this.findings.push(text); }
  measure(key, value) { this.measurements[key] = value; }
}

export async function launch() {
  return chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
}

/** One clean browser context + page for a viewport/profile. */
export async function openSession(browser, baseUrl, vp, profileName, rec, { colorScheme = 'dark' } = {}) {
  const context = await browser.newContext({
    viewport: vp, deviceScaleFactor: DSF, locale: 'en-US', timezoneId: 'UTC', colorScheme,
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(DETERMINISM_INIT);
  await context.addInitScript(seedScript(profile(profileName)));
  const page = await context.newPage();
  const tag = `${vpName(vp)}/${profileName}`;
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') {
      rec.consoleIssues.push({ ctx: tag, type: m.type(), text: m.text().slice(0, 240) });
    }
  });
  page.on('pageerror', e => rec.consoleIssues.push({ ctx: tag, type: 'pageerror', text: String(e.message).slice(0, 240) }));
  page.on('requestfailed', r => {
    const err = (r.failure() && r.failure().errorText) || 'unknown';
    // Requests cancelled by our own navigation/reload are not rendering problems.
    if (/ERR_ABORTED/.test(err)) { rec.abortedRequests = (rec.abortedRequests || 0) + 1; return; }
    rec.consoleIssues.push({ ctx: tag, type: 'requestfailed', text: `${r.url().replace(baseUrl, '')} (${err})` });
  });
  page.on('response', r => { if (r.status() >= 400) rec.consoleIssues.push({ ctx: tag, type: `http-${r.status()}`, text: r.url().replace(baseUrl, '') }); });
  return { context, page, vp, profileName, baseUrl, rec, outDir: rec.outDir };
}

export async function go(s, hash, { reload = false } = {}) {
  const url = s.baseUrl + '/index.html' + hash;
  const cur = s.page.url();
  if (!cur || cur === 'about:blank') await s.page.goto(url);
  else if (reload) { await s.page.goto(url); await s.page.reload(); }
  else await s.page.evaluate(h => { location.hash = h; }, hash);
  await settle(s.page, { long: true });
}

/** Wait until fonts, images in view and dynamic lists are stable. */
export async function settle(page, { long = false } = {}) {
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.addStyleTag({ content: NOISE_CSS }).catch(() => {});
  // Initial-load skeleton / aria-busy must be gone.
  await page.waitForFunction(() => !document.querySelector('[data-initial-loading][aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
  if (long) await page.waitForTimeout(600);
  // Images that are in the viewport (and not lazy-deferred) must have decoded.
  await page.evaluate(async () => {
    const vh = innerHeight, vw = innerWidth;
    const imgs = [...document.images].filter(i => {
      const r = i.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    });
    await Promise.all(imgs.map(i => i.complete ? null : new Promise(res => { i.addEventListener('load', res, { once: true }); i.addEventListener('error', res, { once: true }); setTimeout(res, 5000); })));
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(120);
}

/** Toasts are transient: wait for them to go; report if one is still up. */
async function toastCheck(page) {
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => [...document.querySelectorAll('.toast')].filter(t => t.getBoundingClientRect().width > 0).length);
    if (!n) return null;
    await page.waitForTimeout(250);
  }
  return 'a toast was still visible when the screenshot was taken';
}

export async function parkMouse(s) {
  await s.page.mouse.move(s.vp.width - 3, s.vp.height - 3);
  await s.page.waitForTimeout(60);
}

/** Make the next focus() a keyboard-modality focus and verify :focus-visible. */
export async function focusVisible(s, locator) {
  await s.page.keyboard.press('Shift+Tab');
  await locator.focus();
  const ok = await locator.evaluate(el => el.matches(':focus-visible'));
  return ok;
}

export async function hover(s, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await locator.hover({ timeout: 4000 });
  } catch {
    // Something overlaps the target's centre; fall back to a raw pointer move so
    // the real :hover state is still produced (recorded in the manifest notes).
    const b = await locator.boundingBox();
    await s.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  }
  await s.page.waitForTimeout(80);
}

async function boxOf(locator) {
  return locator.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
}

/** Union of viewport-relative boxes of several locators. */
export async function unionBox(locators) {
  const boxes = [];
  for (const l of locators) boxes.push(await boxOf(l));
  const x1 = Math.min(...boxes.map(b => b.x)), y1 = Math.min(...boxes.map(b => b.y));
  const x2 = Math.max(...boxes.map(b => b.x + b.width)), y2 = Math.max(...boxes.map(b => b.y + b.height));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function meta(s, o, type, file) {
  return {
    file,
    type,
    viewport: { width: s.vp.width, height: s.vp.height },
    route: o.route ?? null,
    page: o.page,
    state: o.state,
    components: o.components ?? [],
    actions: o.actions ?? [],
    purpose: o.purpose ?? '',
    auditReferences: o.refs ?? [],
    notes: o.notes ?? '',
    ...(o.zoom ? { zoom: o.zoom } : {}),
    ...(o.verified ? { verified: o.verified } : {}),
  };
}

export function fileName(s, page, state, crop) {
  return `${vpName(s.vp)}__${page}__${state}${crop ? '__crop' : ''}.png`;
}

/** Full-context viewport screenshot. */
export async function full(s, o) {
  const file = fileName(s, o.page, o.state, false);
  const sub = o.dir ?? vpName(s.vp);
  const dir = path.join(s.outDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  if (!o.keepMouse) await parkMouse(s);
  await settle(s.page);
  const toast = o.allowToast ? null : await toastCheck(s.page);
  await s.page.screenshot({ path: path.join(dir, file), fullPage: !!o.fullPage });
  const e = meta(s, { ...o, route: o.route ?? await currentRoute(s) }, o.fullPage ? 'full-page' : 'full-viewport', `${sub}/${file}`);
  if (toast) e.notes = (e.notes ? e.notes + ' ' : '') + toast + '.';
  s.rec.add(e);
  console.log('  + ' + e.file);
  return e;
}

/** Zoomed component crop. `region` is a viewport-relative box or a list of
 *  locators whose union is cropped. Pixels are magnified with nearest-neighbour
 *  so no smoothing is introduced; the zoom is recorded in the manifest. */
export async function crop(s, o) {
  const file = fileName(s, o.page, o.state, true);
  const dir = path.join(s.outDir, 'crops');
  fs.mkdirSync(dir, { recursive: true });
  if (!o.keepMouse) await parkMouse(s);
  await settle(s.page);
  if (!o.box) await o.locators[0].scrollIntoViewIfNeeded().catch(() => {});
  let box = o.box || await unionBox(o.locators);
  const pad = o.pad ?? 10;
  const vw = s.vp.width, vh = s.vp.height;
  const x = Math.max(0, Math.floor(box.x - pad)), y = Math.max(0, Math.floor(box.y - pad));
  const w = Math.min(vw - x, Math.ceil(box.width + pad * 2)), h = Math.min(vh - y, Math.ceil(box.height + pad * 2));
  const raw = await s.page.screenshot({ clip: { x, y, width: w, height: h } });
  const zoom = o.zoom ?? Math.max(1, Math.min(6, Math.floor(900 / Math.max(w, 1))));
  let out = sharp(raw);
  if (zoom > 1) out = out.resize(w * zoom, h * zoom, { kernel: 'nearest' });
  await out.png().toFile(path.join(dir, file));
  const e = meta(s, { ...o, route: o.route ?? await currentRoute(s) }, 'component-crop', `crops/${file}`);
  e.zoom = zoom;
  e.cropRegionCssPx = { x, y, width: w, height: h };
  s.rec.add(e);
  console.log('  + crops/' + file);
  return e;
}

async function currentRoute(s) {
  return s.page.evaluate(() => location.hash || '#/');
}

/** Try a capture step; record the failure instead of aborting the run. */
export async function attempt(rec, label, fn) {
  try { await fn(); } catch (err) { rec.fail(label, err); }
}

/** Assemble existing crops into one captioned contact sheet. */
export async function sheet(s, { page, state, items, cols = 4, cell = { w: 360, h: 220 }, purpose, refs, notes, name }) {
  const file = name ?? `${vpName(s.vp)}__${page}__${state}__sheet.png`;
  const dir = path.join(s.outDir, 'crops');
  const pad = 8, cap = 22;
  const rows = Math.ceil(items.length / cols);
  const W = cols * (cell.w + pad) + pad, H = rows * (cell.h + cap + pad) + pad;
  const comps = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const cx = pad + (i % cols) * (cell.w + pad), cy = pad + Math.floor(i / cols) * (cell.h + cap + pad);
    const src = path.join(s.outDir, it.file);
    const buf = await sharp(src).resize(cell.w, cell.h, { fit: 'inside', withoutEnlargement: true, background: '#0b0908' }).png().toBuffer();
    const m = await sharp(buf).metadata();
    comps.push({ input: buf, left: cx + Math.floor((cell.w - m.width) / 2), top: cy + cap + Math.floor((cell.h - m.height) / 2) });
    const label = String(it.label).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    comps.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell.w}" height="${cap}"><text x="2" y="16" font-family="Arial, sans-serif" font-size="13" fill="#d8cdb0">${label}</text></svg>`), left: cx, top: cy });
  }
  fs.mkdirSync(dir, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: '#0b0908' } }).composite(comps).png().toFile(path.join(dir, file));
  const e = {
    file: `crops/${file}`, type: 'contact-sheet',
    viewport: { width: s.vp.width, height: s.vp.height }, page, state,
    route: null, components: [], actions: ['tile existing real-UI crops (listed in `sheetItems`) into a captioned grid'],
    purpose: purpose ?? '', auditReferences: refs ?? [], notes: notes ?? 'Composite of unmodified crops; captions added by the capture script.',
    sheetItems: items.map(i => ({ file: i.file, label: i.label })),
  };
  s.rec.add(e);
  console.log('  + crops/' + file);
}

/** Computed style + box snapshot for objective comparisons. */
export async function measureEls(page, map) {
  return page.evaluate(m => {
    const out = {};
    for (const [key, sel] of Object.entries(m)) {
      const el = document.querySelector(sel);
      if (!el) { out[key] = null; continue; }
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      out[key] = {
        selector: sel,
        width: +r.width.toFixed(2), height: +r.height.toFixed(2), x: +r.x.toFixed(1), y: +r.y.toFixed(1),
        borderRadius: cs.borderTopLeftRadius, fontSize: cs.fontSize, fontFamily: cs.fontFamily.split(',')[0],
        letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, opacity: cs.opacity,
        outline: cs.outlineStyle === 'none' ? 'none' : `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor} offset ${cs.outlineOffset}`,
        boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 120),
        background: cs.backgroundColor, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        color: cs.color, padding: cs.padding, lineHeight: cs.lineHeight,
      };
    }
    return out;
  }, map);
}
