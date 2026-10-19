#!/usr/bin/env node
/* Dev-only: bakes img/journey2/legend-ruin.webp — the legend swatch for "Destroyed sanctuary" — from the SAME fire/smoke renderer the map uses
   (js/journey2-ruin-fx.js) laid over the printed sanctuary silhouette, so the legend shows the burning castle players see on the map, not a generic flame. */
const path = require('path');
const sharp = require('sharp');
const Fx = require(path.join(__dirname, '..', 'js', 'journey2-ruin-fx.js'));
const ROOT = path.join(__dirname, '..');
const PPU = 3, X0 = -22, Y0 = -30, W = 44, H = 48, TIME = 31, SEED = 7;

(async () => {
  const OW = W * PPU, OH = H * PPU;
  // 1. the castle silhouette, scaled to map units (the 44x39 legend raster is ~1.37 px per unit), centred on the castle's origin
  const castle = sharp(path.join(ROOT, 'img/journey2/legend-sanctuary.webp')).ensureAlpha();
  const cm = await castle.metadata();
  const k = PPU / 1.37;
  const cw = Math.round(cm.width * k), ch = Math.round(cm.height * k);
  const big = await castle.resize(cw, ch, { kernel: 'lanczos3' }).png().toBuffer();
  // the printed icon is only 44 px: a plain upscale is soft, so steepen its alpha edge and keep the ink black
  const { data: cd, info: ci } = await sharp(big).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < cd.length; i += 4) { const a = Math.max(0, Math.min(1, (cd[i + 3] / 255 - 0.5) * 1.4 + 0.5)); cd[i] = cd[i + 1] = cd[i + 2] = 12; cd[i + 3] = Math.round(a * 255); }
  const castleBuf = await sharp(cd, { raw: { width: ci.width, height: ci.height, channels: 4 } }).blur(0.6).png().toBuffer();
  // 2. fire + smoke through the real renderers
  const layer = (R, ppu, render) => {
    const img = { width: R.w * ppu, height: R.h * ppu, data: new Uint8ClampedArray(R.w * ppu * R.h * ppu * 4) };
    render(img);
    return { input: Buffer.from(img.data.buffer), raw: { width: img.width, height: img.height, channels: 4 }, left: Math.round((R.x0 - X0) * PPU), top: Math.round((R.y0 - Y0) * PPU), ppu };
  };
  const smoke = layer(Fx.SMOKE, 2, img => Fx.renderSmoke(img, TIME, SEED));
  const fire = layer(Fx.FIRE, PPU, img => Fx.renderFire(img, TIME, SEED, 1.5));
  const up = async (l, R) => ({ input: await sharp(l.input, { raw: l.raw }).resize(R.w * PPU, R.h * PPU, { kernel: 'lanczos3' }).png().toBuffer(), left: l.left, top: l.top });
  const smokeBig = await sharp(smoke.input, { raw: smoke.raw }).resize(Fx.SMOKE.w * PPU, Fx.SMOKE.h * PPU, { kernel: 'lanczos3' }).raw().toBuffer();
  const sw = Fx.SMOKE.w * PPU, sh = Fx.SMOKE.h * PPU, ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {    // fade the plume in just above the roofs and out at the box edges: no hard rectangle in a swatch
    const ux = Fx.SMOKE.x0 + x / PPU, uy = Fx.SMOKE.y0 + y / PPU;
    const f = ramp(uy, 8, -4) * ramp(uy, -86, -30 + 0) * 1 * ramp(60 - ux, 0, 14);
    smokeBig[(y * sw + x) * 4 + 3] = Math.round(smokeBig[(y * sw + x) * 4 + 3] * Math.min(1, f * 1.0));
  }
  const smokeL = { input: await sharp(smokeBig, { raw: { width: sw, height: sh, channels: 4 } }).png().toBuffer(), left: smoke.left, top: smoke.top };
  const fireL = { input: await sharp(fire.input, { raw: fire.raw }).png().toBuffer(), left: fire.left, top: fire.top };
  const castleL = { input: castleBuf, left: Math.round((-cw / 2 / PPU - X0) * PPU), top: Math.round((-ch / 2 / PPU + 2 - Y0) * PPU) };
  const crop = async (l) => {   // keep only what lies inside the canvas
    const m = await sharp(l.input).metadata();
    const L = Math.max(0, -l.left), T = Math.max(0, -l.top);
    const w = Math.min(m.width - L, OW - Math.max(0, l.left)), h = Math.min(m.height - T, OH - Math.max(0, l.top));
    return { input: await sharp(l.input).extract({ left: L, top: T, width: w, height: h }).png().toBuffer(), left: Math.max(0, l.left), top: Math.max(0, l.top) };
  };
  const layers = [];
  for (const l of [smokeL, castleL, fireL]) layers.push(await crop(l));
  await sharp({ create: { width: OW, height: OH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).webp({ quality: 88, alphaQuality: 95 }).toFile(path.join(ROOT, 'img/journey2/legend-ruin.webp'));
  console.log('legend-ruin.webp', OW + 'x' + OH);
})();
