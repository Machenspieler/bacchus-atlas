'use strict';
/* ============================================================
   Bacchus's Atlas — scripts/journey2/retouch-credit-line.js
   Dev-only. The one pixel edit applied to the assembled world raster
   after prepare-map.js's crop+translate: it removes the printed line
   "FOR ADDITIONAL VERSIONS OF THIS MAP, VISIT DAGGERHEART.COM/DOWNLOADS."
   (bottom right, under the scale statement) by copying clean background
   onto the letters and their white halo. The hex lattice repeats every
   121 px vertically, so the source is the same rows 121 px higher — the
   grid lines continue unbroken. Pure function on a raw RGB buffer; only
   pixels inside the dilated letter mask change. Lines outside the mask,
   including the "1 HEX = APPROX. 24 MILES" line above, are untouched.
   ============================================================ */

const BAND = { y0: 3078, y1: 3116, x0: 3090, x1: 4420 };   // search window for the letters
const CLIP = { y1: 3122 };                                  // mask never goes below this row
const LATTICE_DY = 121;                                     // vertical lattice period
const LATTICE_DX = 105;                                     // horizontal lattice period
const COMPASS_X = 4380;                                     // right of this the 121 px source reaches the compass rose
const COMPASS_PATCH_FROM_X = 4392;

// Square max-filter of odd `size` over a boolean mask restricted to rows [ya, yb).
function dilate(mask, w, h, size, ya, yb) {
  const r = (size - 1) / 2;
  const tmp = new Uint8Array(w * h);
  for (let y = Math.max(0, ya - r); y < Math.min(h, yb + r); y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) tmp[y * w + k] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = Math.max(0, ya - r); y < Math.min(h, yb + r); y++) {
    for (let x = 0; x < w; x++) {
      if (!tmp[y * w + x]) continue;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) out[k * w + x] = 1;
    }
  }
  return out;
}

function gray(raw, i) { return (raw[i] + raw[i + 1] + raw[i + 2]) / 3; }

// Returns the number of pixels changed. `raw` is RGB8, w*h*3, edited in place.
function retouchCreditLine(raw, w, h) {
  if (w !== 4848 || h !== 3185) throw new Error(`Unexpected raster size ${w}x${h}`);
  const letters = new Uint8Array(w * h);
  for (let y = BAND.y0; y < BAND.y1; y++) {
    for (let x = BAND.x0; x < BAND.x1; x++) {
      if (gray(raw, (y * w + x) * 3) < 170) letters[y * w + x] = 1;
    }
  }
  const mask = dilate(letters, w, h, 15, BAND.y0, BAND.y1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < BAND.y0 || y >= CLIP.y1 || x < BAND.x0 || x >= BAND.x1) mask[y * w + x] = 0;
    }
  }
  // Where the plain source still carries the compass rose, use the source one lattice cell to the left.
  const near = new Uint8Array(w * h);
  for (let y = BAND.y0; y < CLIP.y1; y++) {
    for (let x = COMPASS_X; x < BAND.x1; x++) {
      const i = y * w + x;
      if (mask[i] && gray(raw, ((y - LATTICE_DY) * w + x) * 3) < 150) near[i] = 1;
    }
  }
  const patch = dilate(near, w, h, 25, BAND.y0, CLIP.y1);
  const before = Buffer.from(raw);
  let changed = 0;
  for (let y = BAND.y0; y < CLIP.y1; y++) {
    for (let x = BAND.x0; x < BAND.x1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const sx = patch[i] && x >= COMPASS_PATCH_FROM_X ? x - LATTICE_DX : x;
      const s = ((y - LATTICE_DY) * w + sx) * 3;
      for (let c = 0; c < 3; c++) raw[i * 3 + c] = before[s + c];
      changed++;
    }
  }
  return changed;
}

module.exports = { retouchCreditLine };
