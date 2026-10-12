'use strict';
/* Journey: the shareable player link (PD-052) — the pure snapshot codec and the synthetic document. No browser.
   The strongest claim is the first one: a document rebuilt from the snapshot yields the SAME player projection as the original, so the player page
   draws exactly what Player Preview draws; the rest checks that nothing hidden is in the link and that decoding never trusts its input. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Geo = require('../js/journey2-geometry.js');
const M = require('../js/journey2-model.js');
const P = require('../js/journey2-projection.js');
const R = require('../js/journey2-route.js');
const S = require('../js/journey2-share.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const template = JSON.parse(read('data/journey2/map-template.json'));
const anchorsDoc = JSON.parse(read('data/journey2/map-anchors.json'));
const ctx = M.createContext(template, anchorsDoc);
const AT = '2026-10-12T10:00:00.000Z';
const must = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.doc; };

let BASE;
for (let q = 40; q < 80 && !BASE; q++) for (let r = -20; r < 20 && !BASE; r++) {
  let ok = true;
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (!ctx.placeable(q + a, r + b)) ok = false;
  if (ok) BASE = { q: q, r: r };
}
const at = (dq, dr) => Geo.cellId(BASE.q + dq, BASE.r + dr);
const SANCT = ctx.sanctuaries.filter(s => s.cellId).map(s => s.id);
const sanctCell = id => ctx.sanctuaries.find(s => s.id === id).cellId;

const region = (id, biome, terrain, extra) => M.batchFromRegion({
  habitat: Object.assign({ biome: biome, blighted: false, overtaken: false, source: 'rolled', rolls: [11] }, extra || {}), terrain: { value: terrain, source: 'rolled' }, size: 6,
  encounter: { entries: [[3, 4]], combines: 0 }, rumor: 49,
}, { id: id, createdAt: AT });

/** Four regions (one blighted, one fully overtaken), some tiles revealed and some hidden, the party shown, two names (one hidden), one collected Echo
 *  on a revealed sanctuary hex plus an Available one and a collected one under fog. */
function campaign() {
  let doc = M.emptyDocument(ctx, AT);
  for (const b of [region('A', 'forest', 2), region('B', 'mountain', 3, { blighted: true }), region('C', null, 1, { overtaken: true, blighted: true }), region('D', 'aquatic', 1)]) doc = must(M.apply(doc, { type: 'createBatch', batch: b, at: AT }, ctx));
  let seq = 0;
  const place = (b, cells) => { doc = must(M.apply(doc, { type: 'place', batchId: b, tiles: cells.map(c => ({ id: 't' + (++seq), cell: c })), at: AT }, ctx)); };
  place('A', [at(0, 0), at(1, 0), at(0, 1)]); place('B', [at(2, 0), at(1, 1), at(2, 1)]); place('C', [at(3, 0), at(3, 1)]); place('D', [at(-1, 1), at(-1, 2)]);
  const echoes = SANCT.slice(0, 9);
  doc = must(M.apply(doc, { type: 'setCellsRevealed', cellKeys: [at(0, 0), at(1, 0), at(2, 0), at(0, 1), at(3, 0), at(-1, 1), sanctCell(echoes[0]), sanctCell(echoes[2])], revealed: true, at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setParty', cell: at(2, 1), shown: true, at: AT }, ctx));
  let n = 0;
  const entries = M.planSanctuaries(ctx, () => ({ name: 'Burg-' + String(n++).padStart(3, '0'), trade: 1, quirk: 1, crisis: 1, drive: 1, politics: { rolls: [1] }, size: 1, population: 1 }));
  doc = must(M.apply(doc, { type: 'setSanctuaries', entries: entries, at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: entries[3].anchorId, revealed: true, at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setSanctuaryNameRevealed', anchorId: entries[10].anchorId, revealed: true, at: AT }, ctx));
  doc = must(M.apply(doc, { type: 'setSoulEchoes', anchorIds: echoes, at: AT }, ctx));
  for (const id of [echoes[0], echoes[1]]) doc = must(M.apply(doc, { type: 'setSoulEchoCollected', anchorId: id, collected: true, at: AT }, ctx));
  return { doc: doc, echoes: echoes, entries: entries };
}

/* ---------------- the core claim ---------------- */

/** Overlay and edge lists follow document order (placement order vs. cell order); drawing never depends on it, so compare them canonically. */
const norm = p => Object.assign({}, p, {
  overlays: p.overlays.slice().sort((a, b) => a.q - b.q || a.r - b.r),
  perimeter: p.perimeter.slice().sort((a, b) => (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : a.dir - b.dir)),
});

test('the document rebuilt from a snapshot has the SAME player projection as the original (tiles, X, perimeter, names, party light, Echoes)', () => {
  const { doc, echoes } = campaign();
  const original = P.buildPlayerProjection(doc, ctx);
  assert.ok(original.overlays.length >= 5 && original.perimeter.length > 0 && original.sanctuaryLabels.length === 2 && original.party, 'the fixture exercises every part');
  assert.deepEqual(original.collectedEchoes, [echoes[0]], 'a collected Echo on a revealed hex; the fogged collected one and the Available one are not there');
  const snap = S.buildSnapshot(doc, ctx, { lang: 'ru' });
  const rebuilt = P.buildPlayerProjection(S.snapshotToDocument(snap, ctx), ctx);
  assert.deepEqual(norm(rebuilt), norm(original));
});

test('encode -> decode returns the snapshot unchanged (language, party, tiles, regions, X marks, names with non-ASCII text, Echoes)', () => {
  const { doc, entries } = campaign();
  let d = doc;
  d = must(M.apply(d, { type: 'setSanctuary', entry: Object.assign({}, entries[3], { name: 'Ёлки-Палки «Æ» 🏰' }), at: AT }, ctx));
  const snap = S.buildSnapshot(d, ctx, { lang: 'en' });
  const back = S.decodeSnapshot(S.encodeSnapshot(snap, ctx), ctx);
  assert.equal(back.ok, true);
  assert.deepEqual(back.snap, snap);
  assert.ok(back.snap.names.some(n => n.name === 'Ёлки-Палки «Æ» 🏰'));
  assert.equal(back.snap.lang, 'en');
});

test('an empty map, no party and no language round-trip too', () => {
  const snap = S.buildSnapshot(M.emptyDocument(ctx, AT), ctx);
  assert.deepEqual(snap, { lang: null, party: null, revealed: [], regions: [], tiles: [], xs: [], names: [], echoes: [] });
  const bytes = S.encodeSnapshot(snap, ctx);
  assert.deepEqual(S.decodeSnapshot(bytes, ctx).snap, snap);
  assert.ok(bytes.length < 700, 'an empty snapshot is one bitmap');
});

test('a floating Shadowblight X (a hex with no tile) survives the trip', () => {
  const { doc } = campaign();
  const snap = S.buildSnapshot(doc, ctx);
  snap.xs = [at(0, 2)];
  snap.revealed = snap.revealed.concat([at(0, 2)]).sort((a, b) => Geo.parseCellId(a).q - Geo.parseCellId(b).q || Geo.parseCellId(a).r - Geo.parseCellId(b).r);
  const back = S.decodeSnapshot(S.encodeSnapshot(snap, ctx), ctx).snap;
  assert.deepEqual(back.xs, [at(0, 2)]);
  assert.ok(P.buildPlayerProjection(S.snapshotToDocument(back, ctx), ctx).shadowMarks.some(m => m.q === BASE.q && m.r === BASE.r + 2));
});

/* ---------------- nothing hidden is in the link ---------------- */

test('hidden content is absent from the snapshot, the bytes and the rebuilt document (fog is a data filter)', async () => {
  const { doc, echoes, entries } = campaign();
  const snap = S.buildSnapshot(doc, ctx);
  const hiddenTiles = doc.tiles.filter(t => !P.buildPlayerProjection(doc, ctx).revealedCells.includes(t.cell));
  assert.ok(hiddenTiles.length > 0);
  for (const t of hiddenTiles) assert.ok(!snap.tiles.some(x => x.cell === t.cell) && !snap.revealed.includes(t.cell), 'a hidden tile is not encoded');
  assert.ok(!snap.regions.some(r => r.symbol === 'aquatic' && r.dots === 1 && !snap.tiles.some(t => snap.regions[t.region] === r)), 'no region without a revealed tile');
  assert.deepEqual(snap.names.map(n => n.anchorId).sort(), [entries[3].anchorId, entries[10].anchorId].sort(), 'only the names the GM revealed');
  assert.deepEqual(snap.echoes, [echoes[0]]);
  const text = await S.createLinkText(doc, ctx);
  const raw = Buffer.from(S.base64UrlToBytes(text.split('.')[1]));
  const inflated = zlib.inflateRawSync(raw).toString('latin1');
  const shown = new Set(snap.names.map(n => n.name));
  for (const e of entries) if (!shown.has(e.name)) assert.ok(!inflated.includes(e.name) && !inflated.includes(e.anchorId), 'an unrevealed sanctuary leaked: ' + e.name);
  for (const secret of ['encounter', 'rumor', 'notes', 'batch', 'mk-', 'trade']) assert.ok(!inflated.includes(secret), 'leaked ' + secret);
  assert.ok(inflated.includes('Burg-003'), 'a revealed name IS in the link');
  const synth = S.snapshotToDocument(snap, ctx);
  assert.equal(synth.tiles.length, snap.tiles.length);
  assert.ok(synth.tiles.every(t => snap.revealed.includes(t.cell)));
  assert.equal(synth.sanctuaries.entries.length, snap.names.length, 'only revealed sanctuaries exist in the rebuilt document');
});

test('a route over the rebuilt document can only know revealed tiles (fogged terrain does not exist for the player)', () => {
  const { doc } = campaign();
  const full = R.buildTerrainIndex(doc), seen = R.buildTerrainIndex(S.snapshotToDocument(S.buildSnapshot(doc, ctx), ctx));
  assert.ok(full.size > seen.size && seen.size > 0);
  const revealed = new Set(P.buildPlayerProjection(doc, ctx).revealedCells);
  const blocked = new Set(doc.tiles.filter(t => doc.batches.find(b => b.id === t.batchId).habitat.overtaken).map(t => t.cell));   // an overtaken region is impassable; its rating is irrelevant\n  for (const [cell, rating] of seen) { assert.ok(revealed.has(cell)); if (!blocked.has(cell)) assert.equal(rating, full.get(cell)); }
  for (const [cell] of full) if (!revealed.has(cell)) assert.ok(!seen.has(cell), 'a fogged tile has no rating');
});

/* ---------------- text form and size ---------------- */

test('link text: "<version>.<base64url>", round-trips through openLinkText into a ready document', async () => {
  const { doc } = campaign();
  const text = await S.createLinkText(doc, ctx, { lang: 'ru' });
  assert.match(text, /^1\.[A-Za-z0-9_-]+$/);
  const opened = await S.openLinkText(text, ctx);
  assert.equal(opened.ok, true);
  assert.equal(opened.snap.lang, 'ru');
  assert.deepEqual(norm(P.buildPlayerProjection(opened.doc, ctx)), norm(P.buildPlayerProjection(doc, ctx)));
});

/** A big synthetic campaign: `count` revealed hexes grown from the middle, regions of 6-11 hexes, tiles on every one. */
function bigDoc(count) {
  const doc = M.emptyDocument(ctx, AT), cells = [];
  ctx.grid.forEachValidCell((q, r) => cells.push(Geo.cellId(q, r)));
  const start = cells.filter(c => ctx.placeable(...Object.values(Geo.parseCellId(c))))[Math.floor(cells.length / 2)];
  const seen = [start], set = new Set(seen);
  for (let h = 0; h < seen.length && seen.length < count; h++) {
    const c = Geo.parseCellId(seen[h]);
    for (const nb of ctx.grid.neighbors(c.q, c.r)) if (nb.valid && ctx.placeable(nb.q, nb.r) && !set.has(nb.id) && seen.length < count) { set.add(nb.id); seen.push(nb.id); }
  }
  let a = 99; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let left = 0, bi = -1;
  seen.forEach((cell, i) => {
    if (left-- <= 0) { bi++; left = 5 + Math.floor(rnd() * 6); doc.batches.push({ id: 'g' + bi, createdAt: AT, habitat: { biome: S.SYMBOLS[Math.floor(rnd() * 11)], blighted: false, overtaken: false, source: 'rolled' }, terrain: { value: 1 + Math.floor(rnd() * 4), source: 'rolled' }, quantity: 1, quantitySource: 'rolled', encounter: { entries: [], combines: 0 }, rumor: 1, notes: '' }); }
    doc.tiles.push({ id: 'b' + i, batchId: 'g' + bi, cell: cell });
  });
  doc.playerVisibility = { revealedCells: seen.slice(), revealedSanctuaryNameAnchorIds: [] };
  return doc;
}

test('size budget: a link stays well under the 2000-character chat limit for hundreds of revealed hexes', async () => {
  const lens = {};
  for (const n of [10, 100, 1000]) lens[n] = (await S.createLinkText(bigDoc(n), ctx)).length;
  assert.ok(lens[10] < 150, JSON.stringify(lens));
  assert.ok(lens[100] < 350, JSON.stringify(lens));
  assert.ok(lens[1000] < 1700, JSON.stringify(lens));
  const whole = (await S.createLinkText(bigDoc(4600), ctx)).length;
  assert.ok(whole < 6000, 'the whole map still fits a URL: ' + whole);
});

/* ---------------- strict, never-throwing decoding ---------------- */

test('decoding refuses bad input with a code and never throws', async () => {
  const { doc } = campaign();
  const good = S.encodeSnapshot(S.buildSnapshot(doc, ctx), ctx);
  const code = r => { assert.equal(r.ok, false); return r.code; };
  assert.equal(code(S.decodeSnapshot(new Uint8Array(0), ctx)), 'empty');
  assert.equal(code(S.decodeSnapshot(null, ctx)), 'empty');
  assert.equal(code(S.decodeSnapshot(good.subarray(0, 5), ctx)), 'truncated');
  assert.equal(code(S.decodeSnapshot(good.subarray(0, good.length - 1), ctx)), 'truncated');
  assert.equal(code(S.decodeSnapshot(Uint8Array.from([...good, 0]), ctx)), 'trailing-bytes');
  const other = Uint8Array.from(good); other[1] ^= 1;                                   // the cell count differs: another map template
  assert.equal(code(S.decodeSnapshot(other, ctx)), 'template-mismatch');
  assert.equal(code(S.decodeSnapshot(Uint8Array.from([7]), ctx)), 'invalid', 'unknown flag bits');
  for (const t of ['', 'x', '2.AAAA', '1.', '1.!!!!', '1.' + 'A'.repeat(30000), '0.AAAA', null, 42]) {
    const r = await S.unpackSnapshot(t, ctx);
    assert.equal(r.ok, false, String(t).slice(0, 20));
    assert.ok(typeof r.code === 'string');
  }
  assert.equal((await S.unpackSnapshot('2.AAAA', ctx)).code, 'unsupported-version');
  assert.equal((await S.openLinkText('1.AAAA', ctx)).ok, false);
});

test('a tiny link that inflates into a huge buffer is refused before parsing (zip bomb)', async () => {
  const bomb = zlib.deflateRawSync(Buffer.alloc(4 * 1024 * 1024), { level: 9 });
  assert.ok(bomb.length < 10000);
  const r = await S.unpackSnapshot('1.' + S.bytesToBase64Url(bomb), ctx);
  assert.deepEqual([r.ok, r.code], [false, 'corrupt']);
});

test('fuzz: random corruption of a valid snapshot is either decoded to a well-formed snapshot or refused — never an exception', () => {
  const { doc } = campaign();
  const good = S.encodeSnapshot(S.buildSnapshot(doc, ctx), ctx);
  let a = 7; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let refused = 0;
  for (let i = 0; i < 600; i++) {
    const bytes = Uint8Array.from(good);
    for (let k = 0, n = 1 + Math.floor(rnd() * 4); k < n; k++) bytes[Math.floor(rnd() * bytes.length)] = Math.floor(rnd() * 256);
    const cut = rnd() < 0.2 ? bytes.subarray(0, Math.floor(rnd() * bytes.length)) : bytes;
    const r = S.decodeSnapshot(cut, ctx);
    if (!r.ok) { refused++; assert.ok(typeof r.code === 'string'); continue; }
    const d = S.snapshotToDocument(r.snap, ctx);
    assert.doesNotThrow(() => P.buildPlayerProjection(d, ctx));                      // whatever decodes, the shared code can draw it
    for (const t of r.snap.tiles) assert.ok(t.region < r.snap.regions.length);
  }
  assert.ok(refused > 50, 'most corruptions are caught: ' + refused);
});

/* ---------------- boundaries ---------------- */

test('the codec is pure and format 1 is frozen: no DOM or storage; the symbol table never moves', () => {
  const src = read('js/journey2-share.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /localStorage|sessionStorage|SafeStorage|document\.|window\.|innerHTML|location\b/);
  assert.doesNotMatch(src, /environmentId|\.rumor\b|\.encounter\b|\.notes\b|\.sanctuaries\.entries/, 'no GM-only field is read');
  assert.deepEqual(Array.from(S.SYMBOLS), ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'fully-shadowblighted']);
  assert.equal(S.FORMAT_VERSION, 1);
});

test('wiring: the module loads after the projection and before the view, and ships in the build list', () => {
  const html = read('index.html');
  assert.match(html, /<script src="js\/journey2-share\.js" data-cache-version="ui"><\/script>/);
  assert.ok(html.indexOf('journey2-share.js') > html.indexOf('journey2-projection.js'));
  assert.match(read('scripts/check-journey2-build.js'), /'js\/journey2-share\.js'/);
});
