/* ============================================================
   Bacchus's Atlas — journey2-share.js
   The SHAREABLE PLAYER LINK (PD-052): a snapshot of what Player Preview shows, packed into a short URL fragment so a player can open the
   map on their own device. Pure and DOM-free (it needs only TextEncoder / TextDecoder / CompressionStream, present in browsers and Node).

   The pipeline
     doc --buildSnapshot--> snapshot --encodeSnapshot--> bytes --pack--> "1.<base64url>"            (the GM's side)
     "1.<base64url>" --unpack--> bytes --decodeSnapshot--> snapshot --snapshotToDocument--> a synthetic map document   (the player's side)
   The synthetic document is fed to the SAME Journey2Projection / Journey2Route / view code as a real one, so the player page draws exactly what Player
   Preview draws (verified: the projection of the rebuilt document equals the original's), and a route over it can only know what the link carries.

   What a snapshot contains — ONLY what a player may already see (it is built from the player projection, so fog has already been applied):
     lang      the GM's language, a default for a player with no saved choice (or null)
     regionIcons  true when the GM draws one icon per region (the "Regions" display switch, PD-062), so the player page draws the same; version 3+
     sepiaMap, biomeColors  the GM's "Sepia map" and "Biome colors" display switches (PD-066): the player page's DEFAULTS, which the viewer may flip for their session; version 4+ (older links read as both on, as the page always drew them)
     view      the GM's camera (world centre + visible world width), so the player first sees the same part of the map at the same zoom (or null = fit); version 2+
     party     the shown party marker's hex, or null
     revealed  the revealed cell ids (hand-revealed ∪ the party's light)
     regions   one { symbol, dots } per region that has a tile in a revealed cell, numbered by first appearance in cell order — an anonymous number, never an id
     tiles     one { cell, region, x } per generated tile in a revealed cell (x = a Shadowblight X stands on it)
     xs        X's on revealed hexes that hold no tile
     names     { anchorId, name } of sanctuaries whose name the GM revealed by hand
     echoes    sanctuary ids of Soul Echoes marked Collected whose hex is revealed
   It never contains hidden tiles, regions, sanctuaries, an Available Echo, Encounters, Rumors, notes, Environments or any id from the GM's document.

   Format (version 4 is written, 1-3 are still read; the version is the prefix of the link text, never reordered — a new layout is a new version; 2 = 1 plus the optional camera; 3 = 2 plus the region-icons flag; 4 = 3 plus the sepia and biome-colors flags):
     flags byte (bits 0-1 language 0 none / 1 en / 2 ru, bit 2 party present, bit 3 camera present [v2], bit 4 region icons [v3], bit 5 sepia map on, bit 6 biome colors on [v4]) · varint cell count N (a template check) · [varint party cell index] · [varint cx, cy, width]
     · bitmap of revealed cells (ceil(N/8) bytes, cell order = the grid's valid-cell order) · bitmap over the revealed cells: has a tile (ceil(R/8))
     · varint region count, per region a byte symbol | dots << 4 · per tile (cell order) a varint region << 1 | x
     · varint X count + delta-coded cell indexes · varint name count, per name varint sanctuary index + varint byte length + UTF-8
     · varint Echo count + sanctuary indexes. (Sanctuary index = position in the sorted sanctuary ids.)
   Everything is deflate-raw compressed and base64url-encoded; decoding is strict (bounds, counts, trailing bytes) and never throws.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'), require('./journey2-model.js'), require('./journey2-projection.js'));
  else root.Journey2Share = factory(root.Journey2Geometry, root.Journey2Model, root.Journey2Projection);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo, Model, Projection) {
  'use strict';

  const FORMAT_VERSION = 4;                               // what is written; versions 1 (no camera), 2 (no region-icon flag) and 3 (no sepia / biome flags) are still read
  const SUPPORTED_VERSIONS = Object.freeze([1, 2, 3, 4]);
  const MAX_VIEW = 1000000;
  /** Symbol table of formats 1 and 2: the eleven Journey biomes, then the fully overtaken region. NEVER reorder or insert — add a new format version instead. */
  const SYMBOLS = Object.freeze(['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'fully-shadowblighted']);
  const OVERTAKEN_SYMBOL = 'fully-shadowblighted';
  const LANGS = Object.freeze([null, 'en', 'ru']);
  const MAX_DOTS = 7;
  const MAX_NAME_CHARS = 80;
  const MAX_NAME_BYTES = MAX_NAME_CHARS * 4;
  const MAX_ECHOES = 9;
  const MAX_INFLATED_BYTES = 256 * 1024;                  // a snapshot is a few KB; anything larger is refused before it is parsed
  const MAX_LINK_CHARS = 20000;

  const ERR = Object.freeze({ truncated: 'truncated', trailing: 'trailing-bytes', template: 'template-mismatch', invalid: 'invalid', version: 'unsupported-version', empty: 'empty', corrupt: 'corrupt' });

  /* ---------------- grid indexes ---------------- */

  const indexCache = new WeakMap();
  /** { cells: [id], index: Map id -> i, sanctuaryIds: [sorted ids], sanctuaryIndex: Map } for a context (built once per context). */
  function indexesOf(ctx) {
    let ix = indexCache.get(ctx);
    if (ix) return ix;
    const cells = [];
    ctx.grid.forEachValidCell((q, r) => cells.push(Geo.cellId(q, r)));
    const ids = ctx.sanctuaries.map(s => s.id).sort();
    ix = { cells: cells, index: new Map(cells.map((c, i) => [c, i])), sanctuaryIds: ids, sanctuaryIndex: new Map(ids.map((id, i) => [id, i])) };
    indexCache.set(ctx, ix);
    return ix;
  }

  /* ---------------- byte helpers ---------------- */

  function createWriter() {
    const bytes = [];
    return {
      byte(b) { bytes.push(b & 255); },
      varint(n) { let v = n; while (v >= 128) { bytes.push((v & 127) | 128); v = Math.floor(v / 128); } bytes.push(v); },
      raw(arr) { for (let i = 0; i < arr.length; i++) bytes.push(arr[i]); },
      done() { return Uint8Array.from(bytes); },
    };
  }

  class DecodeError extends Error { constructor(code) { super(code); this.code = code; } }

  function createReader(bytes) {
    let pos = 0;
    return {
      byte() { if (pos >= bytes.length) throw new DecodeError(ERR.truncated); return bytes[pos++]; },
      varint() {
        let n = 0, mul = 1;
        for (let i = 0; i < 5; i++) { const b = this.byte(); n += (b & 127) * mul; if (b < 128) return n; mul *= 128; }
        throw new DecodeError(ERR.invalid);
      },
      take(len) { if (len < 0 || pos + len > bytes.length) throw new DecodeError(ERR.truncated); const out = bytes.subarray(pos, pos + len); pos += len; return out; },
      atEnd() { return pos === bytes.length; },
    };
  }

  const bitmapBytes = n => Math.ceil(n / 8);
  const bitGet = (bm, i) => (bm[i >> 3] >> (i & 7)) & 1;

  /** The GM's camera as the player should first see it: { cx, cy } the world point at the centre and `width` the world width on screen (whole px), or null (= fit the map). */
  function cleanView(v) {
    if (!v || ![v.cx, v.cy, v.width].every(n => typeof n === 'number' && Number.isFinite(n))) return null;
    const cx = Math.round(v.cx), cy = Math.round(v.cy), width = Math.round(v.width);
    return cx >= 0 && cy >= 0 && width >= 1 && cx <= MAX_VIEW && cy <= MAX_VIEW && width <= MAX_VIEW ? { cx: cx, cy: cy, width: width } : null;
  }

  /* ---------------- snapshot (the filter) ---------------- */

  /**
   * The snapshot of `doc` for players: everything is taken from the player projection, so Fog of War, the revealed names, the party's light and the
   * collected-Echo rule (PD-052) have already been applied by the one function that decides them. `opts.lang` ('en' | 'ru') rides along as a default.
   */
  function buildSnapshot(doc, ctx, opts) {
    const ix = indexesOf(ctx), proj = Projection.buildPlayerProjection(doc, ctx);
    const revealed = proj.revealedCells.filter(c => ix.index.has(c)).sort((a, b) => ix.index.get(a) - ix.index.get(b));
    const overlayAt = new Map(proj.overlays.map(o => [Geo.cellId(o.q, o.r), o]));
    const batchOfCell = new Map(doc.tiles.map(t => [t.cell, t.batchId]));
    const regionNo = new Map(), regions = [], tiles = [];
    for (const cell of revealed) {
      const o = overlayAt.get(cell);
      if (!o) continue;
      const batchId = batchOfCell.get(cell);
      if (!regionNo.has(batchId)) { regionNo.set(batchId, regions.length); regions.push({ symbol: o.symbolId, dots: o.dots }); }
      tiles.push({ cell: cell, region: regionNo.get(batchId), x: !!o.blightMark });
    }
    const lang = opts && (opts.lang === 'en' || opts.lang === 'ru') ? opts.lang : null;
    return {
      lang: lang,
      view: cleanView(opts && opts.view),
      regionIcons: !!(opts && opts.regionIcons),
      sepiaMap: !(opts && opts.sepiaMap === false),
      biomeColors: !(opts && opts.biomeColors === false),
      party: proj.party ? Geo.cellId(proj.party.q, proj.party.r) : null,
      revealed: revealed, regions: regions, tiles: tiles,
      xs: proj.shadowMarks.map(m => Geo.cellId(m.q, m.r)).filter(c => ix.index.has(c)).sort((a, b) => ix.index.get(a) - ix.index.get(b)),
      names: proj.sanctuaryLabels.map(l => ({ anchorId: l.anchorId, name: l.name })).filter(n => ix.sanctuaryIndex.has(n.anchorId)),
      echoes: proj.collectedEchoes.filter(id => ix.sanctuaryIndex.has(id)),
    };
  }

  /* ---------------- binary encode / decode ---------------- */

  /** The uncompressed bytes of a snapshot (format 4). Throws only for a snapshot that could not have come from buildSnapshot (a programming error). */
  function encodeSnapshot(snap, ctx) {
    const ix = indexesOf(ctx), N = ix.cells.length, w = createWriter();
    const langIdx = LANGS.indexOf(snap.lang || null);
    const view = cleanView(snap.view);
    w.byte((langIdx < 0 ? 0 : langIdx) | (snap.party ? 4 : 0) | (view ? 8 : 0) | (snap.regionIcons ? 16 : 0) | (snap.sepiaMap !== false ? 32 : 0) | (snap.biomeColors !== false ? 64 : 0));
    w.varint(N);
    if (snap.party) w.varint(ix.index.get(snap.party));
    if (view) { w.varint(view.cx); w.varint(view.cy); w.varint(view.width); }
    const bm = new Uint8Array(bitmapBytes(N));
    for (const c of snap.revealed) { const i = ix.index.get(c); bm[i >> 3] |= 1 << (i & 7); }
    w.raw(bm);
    const hasTile = new Set(snap.tiles.map(t => t.cell));
    const mask = new Uint8Array(bitmapBytes(snap.revealed.length));
    snap.revealed.forEach((c, i) => { if (hasTile.has(c)) mask[i >> 3] |= 1 << (i & 7); });
    w.raw(mask);
    w.varint(snap.regions.length);
    for (const r of snap.regions) {
      const s = SYMBOLS.indexOf(r.symbol);
      if (s < 0 || !Number.isInteger(r.dots) || r.dots < 0 || r.dots > MAX_DOTS) throw new Error('journey2-share: region not encodable');
      w.byte(s | (r.dots << 4));
    }
    const tileAt = new Map(snap.tiles.map(t => [t.cell, t]));
    for (const c of snap.revealed) { const t = tileAt.get(c); if (t) w.varint(t.region * 2 + (t.x ? 1 : 0)); }
    w.varint(snap.xs.length);
    let prev = -1;
    for (const c of snap.xs) { const i = ix.index.get(c); w.varint(i - prev); prev = i; }
    const enc = new TextEncoder();
    w.varint(snap.names.length);
    for (const n of snap.names) { const b = enc.encode(n.name); w.varint(ix.sanctuaryIndex.get(n.anchorId)); w.varint(b.length); w.raw(b); }
    w.varint(snap.echoes.length);
    for (const id of snap.echoes) w.varint(ix.sanctuaryIndex.get(id));
    return w.done();
  }

  /** Strict inverse of encodeSnapshot: { ok: true, snap } or { ok: false, code }. Never throws. */
  function decodeSnapshot(bytes, ctx, version) {
    try { return { ok: true, snap: decodeOrThrow(bytes, ctx, version || FORMAT_VERSION) }; }
    catch (e) { return { ok: false, code: e instanceof DecodeError ? e.code : ERR.corrupt }; }
  }

  function decodeOrThrow(bytes, ctx, version) {
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new DecodeError(ERR.empty);
    const ix = indexesOf(ctx), N = ix.cells.length, r = createReader(bytes);
    const flags = r.byte();
    if ((flags & 3) > 2 || (flags & ~(version >= 4 ? 127 : version >= 3 ? 31 : version >= 2 ? 15 : 7))) throw new DecodeError(ERR.invalid);   // bit 3 (a camera) exists from version 2, bit 4 (region icons) from version 3, bits 5-6 (sepia, biome colors) from version 4
    if (r.varint() !== N) throw new DecodeError(ERR.template);
    let party = null, view = null;
    if (flags & 4) { const i = r.varint(); if (i >= N) throw new DecodeError(ERR.invalid); party = ix.cells[i]; }
    if (flags & 8) {
      view = cleanView({ cx: r.varint(), cy: r.varint(), width: r.varint() });
      if (!view) throw new DecodeError(ERR.invalid);
    }
    const bm = r.take(bitmapBytes(N)), revealed = [];
    for (let i = 0; i < N; i++) if (bitGet(bm, i)) revealed.push(ix.cells[i]);
    if (N % 8 && (bm[bm.length - 1] >> (N % 8)) !== 0) throw new DecodeError(ERR.invalid);   // padding bits are zero
    const mask = r.take(bitmapBytes(revealed.length)), tileCells = [];
    revealed.forEach((c, i) => { if (bitGet(mask, i)) tileCells.push(c); });
    if (revealed.length % 8 && mask.length && (mask[mask.length - 1] >> (revealed.length % 8)) !== 0) throw new DecodeError(ERR.invalid);
    const regionCount = r.varint();
    if (regionCount > tileCells.length) throw new DecodeError(ERR.invalid);
    const regions = [];
    for (let i = 0; i < regionCount; i++) {
      const b = r.byte(), symbol = SYMBOLS[b & 15], dots = b >> 4;
      if (!symbol) throw new DecodeError(ERR.invalid);
      regions.push({ symbol: symbol, dots: dots });
    }
    const tiles = [];
    for (const cell of tileCells) {
      const v = r.varint(), region = Math.floor(v / 2);
      if (region >= regionCount) throw new DecodeError(ERR.invalid);
      tiles.push({ cell: cell, region: region, x: (v & 1) === 1 });
    }
    const xCount = r.varint();
    if (xCount > N) throw new DecodeError(ERR.invalid);
    const xs = []; let prev = -1;
    for (let i = 0; i < xCount; i++) { const d = r.varint(); if (d < 1) throw new DecodeError(ERR.invalid); prev += d; if (prev >= N) throw new DecodeError(ERR.invalid); xs.push(ix.cells[prev]); }
    const nameCount = r.varint(), dec = new TextDecoder('utf-8', { fatal: true }), names = [], seen = new Set();
    if (nameCount > ix.sanctuaryIds.length) throw new DecodeError(ERR.invalid);
    for (let i = 0; i < nameCount; i++) {
      const si = r.varint(), len = r.varint();
      if (si >= ix.sanctuaryIds.length || seen.has(si) || len > MAX_NAME_BYTES) throw new DecodeError(ERR.invalid);
      seen.add(si);
      let name; try { name = dec.decode(r.take(len)); } catch (e) { if (e instanceof DecodeError) throw e; throw new DecodeError(ERR.invalid); }
      if (Array.from(name).length > MAX_NAME_CHARS || !name.trim()) throw new DecodeError(ERR.invalid);
      names.push({ anchorId: ix.sanctuaryIds[si], name: name });
    }
    const echoCount = r.varint();
    if (echoCount > MAX_ECHOES) throw new DecodeError(ERR.invalid);
    const echoes = [], seenEcho = new Set();
    for (let i = 0; i < echoCount; i++) { const si = r.varint(); if (si >= ix.sanctuaryIds.length || seenEcho.has(si)) throw new DecodeError(ERR.invalid); seenEcho.add(si); echoes.push(ix.sanctuaryIds[si]); }
    if (!r.atEnd()) throw new DecodeError(ERR.trailing);
    return { lang: LANGS[flags & 3], regionIcons: (flags & 16) !== 0, sepiaMap: version < 4 || (flags & 32) !== 0, biomeColors: version < 4 || (flags & 64) !== 0, view: view, party: party, revealed: revealed, regions: regions, tiles: tiles, xs: xs, names: names, echoes: echoes };
  }

  /* ---------------- the synthetic document ---------------- */

  /**
   * Rebuilds a map document from a snapshot, in the same shape the editor's model uses, so the unchanged projection, perimeter and route code run on it.
   * It holds ONLY the snapshot's content: one batch per region (biome / terrain / overtaken), the revealed tiles, the revealed cells, X's as added marks,
   * the revealed sanctuary names and the collected Echoes. Nothing hidden exists in it, so nothing can be derived from it that the link did not carry.
   */
  function snapshotToDocument(snap, ctx) {
    const AT = '2000-01-01T00:00:00.000Z';
    const doc = Model.emptyDocument(ctx, AT);
    doc.batches = snap.regions.map((r, i) => {
      const over = r.symbol === OVERTAKEN_SYMBOL;
      return { id: 'r' + i, createdAt: AT, habitat: { biome: over ? null : r.symbol, blighted: over, overtaken: over, source: 'rolled' }, terrain: { value: over ? 0 : r.dots, source: 'rolled' }, quantity: 1, quantitySource: 'rolled', encounter: { entries: [], combines: 0 }, rumor: 1, notes: '' };
    });
    doc.tiles = snap.tiles.map((t, i) => ({ id: 's' + i, batchId: 'r' + t.region, cell: t.cell }));
    doc.playerVisibility = { revealedCells: snap.revealed.slice(), revealedSanctuaryNameAnchorIds: snap.names.map(n => n.anchorId).sort() };
    doc.sanctuaries = { entries: snap.names.map(n => ({ anchorId: n.anchorId, name: n.name, trade: 1, quirk: 1, crisis: 1, drive: 1, politics: { rolls: [1] }, size: 1, population: 1 })) };
    doc.soulEchoes = { anchorIds: snap.echoes.slice(), collectedAnchorIds: snap.echoes.slice() };
    const ix = indexesOf(ctx), marks = new Set(snap.tiles.filter(t => t.x).map(t => t.cell));
    for (const c of snap.xs) marks.add(c);
    doc.shadowMarks = { added: Array.from(marks).sort((a, b) => ix.index.get(a) - ix.index.get(b)), suppressed: [] };
    doc.party = snap.party ? { cell: snap.party, shown: true } : { cell: null, shown: false };
    return doc;
  }

  /* ---------------- text form: "<version>.<base64url of deflate-raw>" ---------------- */

  function bytesToBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
    try {
      const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (e) { return null; }
  }

  async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** deflate-raw inflate with a hard output cap (a tiny link must not expand into memory). Rejects with DecodeError('corrupt'). */
  async function inflate(bytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = []; let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_INFLATED_BYTES) { try { await reader.cancel(); } catch (e) { /* already closed */ } throw new DecodeError(ERR.corrupt); }
        chunks.push(value);
      }
    } catch (e) { throw e instanceof DecodeError ? e : new DecodeError(ERR.corrupt); }
    const out = new Uint8Array(total); let at = 0;
    for (const c of chunks) { out.set(c, at); at += c.length; }
    return out;
  }

  /** The link text for a snapshot: "<format version>.<payload>". */
  async function packSnapshot(snap, ctx) {
    return FORMAT_VERSION + '.' + bytesToBase64Url(await deflate(encodeSnapshot(snap, ctx)));
  }

  /** Link text -> { ok: true, snap } | { ok: false, code }. Never throws. */
  async function unpackSnapshot(text, ctx) {
    try {
      if (typeof text !== 'string' || !text) return { ok: false, code: ERR.empty };
      if (text.length > MAX_LINK_CHARS) return { ok: false, code: ERR.invalid };
      const m = /^(\d{1,3})\.([A-Za-z0-9_-]*)$/.exec(text);
      if (!m) return { ok: false, code: ERR.invalid };
      const version = Number(m[1]);
      if (!SUPPORTED_VERSIONS.includes(version)) return { ok: false, code: ERR.version };
      const raw = base64UrlToBytes(m[2]);
      if (!raw || !raw.length) return { ok: false, code: ERR.corrupt };
      return decodeSnapshot(await inflate(raw), ctx, version);
    } catch (e) { return { ok: false, code: e instanceof DecodeError ? e.code : ERR.corrupt }; }
  }

  /** doc -> link text, in one step (the GM's "Copy player link"). */
  async function createLinkText(doc, ctx, opts) { return packSnapshot(buildSnapshot(doc, ctx, opts), ctx); }

  /** link text -> { ok: true, doc, snap } | { ok: false, code } (the player's page). */
  async function openLinkText(text, ctx) {
    const r = await unpackSnapshot(text, ctx);
    return r.ok ? { ok: true, snap: r.snap, doc: snapshotToDocument(r.snap, ctx) } : r;
  }

  return {
    FORMAT_VERSION: FORMAT_VERSION, SUPPORTED_VERSIONS: SUPPORTED_VERSIONS, SYMBOLS: SYMBOLS, ERR: ERR, MAX_LINK_CHARS: MAX_LINK_CHARS,
    buildSnapshot: buildSnapshot, encodeSnapshot: encodeSnapshot, decodeSnapshot: decodeSnapshot, snapshotToDocument: snapshotToDocument,
    packSnapshot: packSnapshot, unpackSnapshot: unpackSnapshot, createLinkText: createLinkText, openLinkText: openLinkText,
    bytesToBase64Url: bytesToBase64Url, base64UrlToBytes: base64UrlToBytes,
  };
});
