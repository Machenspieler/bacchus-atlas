/* ============================================================
   Bacchus's Atlas — journey2-model.js
   Pure, dependency-free data model for the Journey 2 map editor: the
   serializable map document, the editor placement policy, the command /
   transaction reducers, bounded Undo/Redo history, the deterministic
   "place all remaining" footprint, quantity parsing and the full-document
   validator used for local loading AND backup import. No window/document/
   storage, so it loads as a plain <script> and is required() as-is from
   tests/journey2-model.test.js.

   Document (schemaVersion 1) — template geometry is referenced by identity,
   never embedded:
     { schemaVersion, kind, templateId, templateVersion, createdAt, updatedAt,
       batches: [ { id, createdAt, habitat, terrain, quantity, quantitySource,
                    encounter, rumor, notes } ],
       tiles:   [ { id, batchId, cell: "q,r" } ],
       playerVisibility: { revealedCells: [ "q,r", ... ] },
       soulEchoes: { anchorIds: [ "mk-012", ... ] },
       sanctuaries: { entries: [ { anchorId, name, trade, quirk, crisis, drive, politics: { rolls }, size, population } ] } }
   Fog of War (Phase C) is CELL-based and lives only in `playerVisibility.revealedCells` — never on a batch or a
   tile. Every placeable cell is hidden by default; the list is the single source of truth (no hiddenCells twin),
   kept sorted so a serialized document is deterministic.
   Soul Echoes (PD-022) are GM-only secrets: at most nine sanctuary stable ids (never a destination), optional on
   load (missing = none, so schemaVersion stays 1), and never part of the player projection.
   Sanctuaries (PD-023) are GM-only generated settlements: one entry per printed sanctuary icon (keyed by its stable anchor id),
   holding the NUMBERS that came up — never the table sentences — so a saved map reads back in either language. Optional on load
   (missing = none, schemaVersion stays 1), never part of the player projection or a print.
   Counts (placed / remaining) are DERIVED from tiles, never stored:
     remaining(batch) = quantity(batch) - placedTileCount(batch)
   Occupancy is keyed by the canonical cell id; one tile per cell.

   Region shape rules (enforced here, not in the view): all placed tiles of
   one batch form ONE edge-connected component (six axial neighbours; other
   batches never count), and an enclosed empty hole is reported as a warning
   (enclosedHoles / holeCounts) but never blocks an edit.

   Prepared-map adjacency (PD-021), enforced by the same preview/commit path: the FIRST tiles of a region that has
   none placed yet must share a full hex edge with a tile of ANOTHER region (corner contact never counts; the very
   first region of an empty map is exempt; the explicit `separate` flag of the place command is the only override),
   and an ordinary move or return-to-stock may never cut a region (or its neighbour) off from the prepared map
   entirely. Nothing about attachment is stored: it is derived from the tiles, so old saves and imports load as-is.
   The region perimeter is likewise derived (regionBoundarySegments) and never stored.

   Commands carry every generated value (ids, cells, timestamps, rolls), so
   replaying one (Redo) can never re-roll. Documents are treated as
   immutable: a command returns a new document that shares unchanged parts.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./journey2-geometry.js'));
  else root.Journey2Model = factory(root.Journey2Geometry);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Geo) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const KIND = 'bacchus-atlas.journey2.gm-backup';

  /** The eleven fixed terrain ids (docs/data-contracts/environments.md) — never extended. */
  const HABITAT_IDS = Object.freeze(['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands']);
  const OVERTAKEN_SYMBOL = 'fully-shadowblighted';

  /* Safety limits. A batch quantity is the stock one drag can place, so it must stay well inside the
   * ~4,800 placeable cells of the fixed Valloren map (4,883 valid cells less decorative furniture):
   * 1000 is about a fifth of the map, leaves room for several such batches, and comfortably allows 20.
   * An entered value above the limit is REJECTED with an error; it is never clamped. */
  const MAX_BATCH_QUANTITY = 1000;
  const MAX_BATCHES = 300;
  const MAX_NOTES_LENGTH = 4000;
  const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
  const HISTORY_LIMIT = 100;

  const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
  const DOC_KEYS = ['schemaVersion', 'kind', 'templateId', 'templateVersion', 'createdAt', 'updatedAt', 'batches', 'tiles', 'playerVisibility', 'soulEchoes', 'sanctuaries'];
  const VISIBILITY_KEYS = ['revealedCells'];
  const SOUL_ECHO_KEYS = ['anchorIds'];
  const SANCTUARY_KEYS = ['entries'];
  const SANCTUARY_ENTRY_KEYS = ['anchorId', 'name', 'trade', 'quirk', 'crisis', 'drive', 'politics', 'size', 'population'];
  /** The book's sanctuary tables (Journey to Horizon, "Creating Sanctuaries"): the die behind each single-roll row. Political system is d8 with its own rule. */
  const SANCTUARY_DICE = Object.freeze({ trade: 20, quirk: 12, crisis: 10, drive: 10, size: 6, population: 4 });
  const POLITICS_SYSTEMS = 7;          // political system rows 1-7; an 8 is "roll twice and combine" and is never stored
  const MAX_POLITICS_SYSTEMS = 4;      // a combine may itself combine once more (two draws, each of which may split in two)
  const MAX_SANCTUARY_NAME = 80;
  /** The campaign frame hides exactly nine Soul Echoes in nine different sanctuaries (PD-022). A hard limit. */
  const MAX_SOUL_ECHOES = 9;
  const BATCH_KEYS = ['id', 'createdAt', 'habitat', 'terrain', 'quantity', 'quantitySource', 'encounter', 'rumor', 'notes'];
  const HABITAT_KEYS = ['biome', 'blighted', 'overtaken', 'source', 'rolls'];
  const TILE_KEYS = ['id', 'batchId', 'cell'];

  const isInt = v => typeof v === 'number' && Number.isInteger(v);
  const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isIso = v => typeof v === 'string' && v.length <= 40 && !isNaN(Date.parse(v));
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /* ---------------- context: template + placement policy ---------------- */

  /**
   * Binds the model to one fixed template. `policy(q, r)` is the single editor placement policy used by
   * preview, commit, load and import:
   *   - outside   structurally invalid cell (grid.isValid false: out of frame / not in the template);
   *   - decorative the cell polygon overlaps a template `decorativeAreas` rectangle (title, compass,
   *                scale/credit statement). The cells stay structurally valid — only terrain placement is
   *                refused there, so valid-cell counts and ids are untouched.
   * Fixed-marker cells, water and coastal cells are allowed; markers are protected by the renderer.
   */
  function createContext(template, anchorsDoc) {
    const grid = Geo.createGrid(template.grid);
    const decorative = new Set();
    for (const d of template.decorativeAreas || []) {
      const r = d.rectPx;
      for (const c of grid.cellsInRect(r[0], r[1], r[0] + r[2], r[1] + r[3], 70)) {
        if (grid.isValid(c.q, c.r) && Geo.rectIntersectsPolygon(r, grid.cellCorners(c.q, c.r))) decorative.add(Geo.cellId(c.q, c.r));
      }
    }
    function policy(q, r) {
      if (!grid.isValid(q, r)) return { ok: false, reason: 'outside' };
      if (decorative.has(Geo.cellId(q, r))) return { ok: false, reason: 'decorative' };
      return { ok: true, reason: null };
    }
    /* The 56 real sanctuaries (never the HORIZON / MARROGATE destinations), west to east: the only places a Soul Echo can be. */
    const sanctuaries = ((anchorsDoc && anchorsDoc.anchors) || [])
      .filter(a => a && a.kind === 'sanctuary' && typeof a.stableId === 'string' && Array.isArray(a.worldPixelAnchor))
      .map(a => ({ id: a.stableId, x: a.worldPixelAnchor[0], y: a.worldPixelAnchor[1], top: a.iconProtectionArea.rectPx[1] }))
      .sort((a, b) => a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : 1));
    return {
      grid: grid, templateId: template.templateId, templateVersion: template.schemaVersion,
      protections: Geo.protectionRects(template, anchorsDoc || null), decorativeCells: decorative, policy: policy,
      allowedCellCount: grid.validCellCount() - decorative.size,
      sanctuaries: sanctuaries, sanctuaryIds: new Set(sanctuaries.map(s => s.id)),
    };
  }

  /* ---------------- ids & small helpers ---------------- */

  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyDocument(ctx, nowIso) {
    const now = nowIso || new Date().toISOString();
    return { schemaVersion: SCHEMA_VERSION, kind: KIND, templateId: ctx.templateId, templateVersion: ctx.templateVersion, createdAt: now, updatedAt: now, batches: [], tiles: [], playerVisibility: { revealedCells: [] }, soulEchoes: { anchorIds: [] }, sanctuaries: { entries: [] } };
  }

  function isEmptyDocument(doc) {
    return !doc || (doc.batches.length === 0 && doc.tiles.length === 0
      && !(doc.playerVisibility && doc.playerVisibility.revealedCells.length)
      && !(doc.soulEchoes && doc.soulEchoes.anchorIds.length)
      && !(doc.sanctuaries && doc.sanctuaries.entries.length));
  }

  function symbolIdOf(batch) { return batch.habitat.overtaken ? OVERTAKEN_SYMBOL : batch.habitat.biome; }

  /* ---------------- derived state ---------------- */

  const derivedCache = new WeakMap();
  /** { counts: Map batchId -> {quantity, placed, remaining}, occupancy: Map cellId -> tile, byId: Map tileId -> tile } */
  function derive(doc) {
    let d = derivedCache.get(doc);
    if (d) return d;
    const counts = new Map(), occupancy = new Map(), byId = new Map();
    for (const b of doc.batches) counts.set(b.id, { quantity: b.quantity, placed: 0, remaining: b.quantity });
    for (const t of doc.tiles) {
      occupancy.set(t.cell, t); byId.set(t.id, t);
      const c = counts.get(t.batchId);
      if (c) { c.placed++; c.remaining--; }
    }
    d = { counts: counts, occupancy: occupancy, byId: byId };
    derivedCache.set(doc, d);
    return d;
  }
  function batchById(doc, id) { return doc.batches.find(b => b.id === id) || null; }

  /* ---------------- quantity / terrain parsing ---------------- */

  /** Strict positive-integer parse for the quantity field. Accepts numbers or digit strings only. */
  function parseQuantity(raw) {
    if (typeof raw === 'number') {
      if (!Number.isFinite(raw)) return { ok: false, code: 'not-integer' };
      if (!Number.isInteger(raw)) return { ok: false, code: 'not-integer' };
      return rangeQuantity(raw);
    }
    const s = String(raw == null ? '' : raw).trim();
    if (s === '') return { ok: false, code: 'empty' };
    if (/^-/.test(s)) return { ok: false, code: 'too-small' };
    if (!/^[0-9]+$/.test(s)) return { ok: false, code: 'not-integer' };
    return rangeQuantity(Number(s));
  }
  function rangeQuantity(n) {
    if (!(n >= 1)) return { ok: false, code: 'too-small' };
    if (n > MAX_BATCH_QUANTITY) return { ok: false, code: 'too-large' };
    return { ok: true, value: n };
  }

  /* ---------------- batch construction / validation ---------------- */

  /**
   * Builds a persisted batch from a generator result (see the adapter in js/app.js):
   *   region = { habitat: { biome, blighted, overtaken, source:'rolled'|'manual', rolls? }, terrain, size, encounter, rumor }
   * `meta.quantity` = { value, source } is optional: without it the quantity is the rolled d12 `region.size`
   * (the only path Journey 2 uses). `terrain`/`habitat` carry their own provenance.
   * Copies by value — nothing is shared with the legacy Journey entry.
   */
  function batchFromRegion(region, meta) {
    const h = region.habitat;
    const quantity = meta.quantity || { value: region.size, source: 'rolled' };
    const habitat = { biome: h.overtaken ? null : h.biome, blighted: !!h.blighted, overtaken: !!h.overtaken, source: h.source };
    if (h.source === 'rolled' && Array.isArray(h.rolls)) habitat.rolls = h.rolls.slice();
    return {
      id: meta.id, createdAt: meta.createdAt, habitat: habitat,
      terrain: { value: region.terrain.value, source: region.terrain.source },
      quantity: quantity.value, quantitySource: quantity.source,
      encounter: { entries: region.encounter.entries.map(p => [p[0], p[1]]), combines: region.encounter.combines },
      rumor: region.rumor, notes: '',
    };
  }

  function checkKeys(o, allowed, where, errors) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(where + ': unknown field "' + String(k).slice(0, 40) + '"');
  }

  /** Strict structural validation of one batch; returns { errors, batch } (batch = normalized copy). */
  function validateBatch(b, where) {
    const errors = [];
    if (!isObj(b)) return { errors: [where + ': not an object'], batch: null };
    checkKeys(b, BATCH_KEYS, where, errors);
    if (typeof b.id !== 'string' || !ID_PATTERN.test(b.id)) errors.push(where + ': invalid id');
    if (!isIso(b.createdAt)) errors.push(where + ': invalid createdAt');
    const h = b.habitat;
    let habitat = null;
    if (!isObj(h)) errors.push(where + ': habitat missing');
    else {
      checkKeys(h, HABITAT_KEYS, where + '.habitat', errors);
      if (typeof h.blighted !== 'boolean' || typeof h.overtaken !== 'boolean') errors.push(where + '.habitat: blighted/overtaken must be booleans');
      else if (h.overtaken && !h.blighted) errors.push(where + '.habitat: overtaken requires blighted');
      if (h.overtaken === true ? h.biome !== null : !HABITAT_IDS.includes(h.biome)) errors.push(where + '.habitat: biome "' + String(h.biome).slice(0, 30) + '" is not one of the eleven terrains');
      if (h.source !== 'rolled' && h.source !== 'manual') errors.push(where + '.habitat: source must be rolled|manual');
      if (h.source === 'manual' && own(h, 'rolls')) errors.push(where + '.habitat: a manual habitat has no dice rolls');
      if (own(h, 'rolls') && !(Array.isArray(h.rolls) && h.rolls.length >= 1 && h.rolls.length <= 2 && h.rolls.every(n => isInt(n) && n >= 1 && n <= 20))) errors.push(where + '.habitat: rolls must be 1-2 d20 results');
      if (h.source === 'rolled' && !own(h, 'rolls')) errors.push(where + '.habitat: a rolled habitat needs its rolls');
      if (!errors.length) { habitat = { biome: h.biome, blighted: h.blighted, overtaken: h.overtaken, source: h.source }; if (own(h, 'rolls')) habitat.rolls = h.rolls.slice(); }
    }
    const tr = b.terrain;
    if (!isObj(tr) || !(isInt(tr.value) && tr.value >= 1 && tr.value <= 4) || (tr.source !== 'rolled' && tr.source !== 'manual') || Object.keys(tr).some(k => k !== 'value' && k !== 'source')) errors.push(where + ': terrain must be {value 1-4, source}');
    if (!isInt(b.quantity) || b.quantity < 1 || b.quantity > MAX_BATCH_QUANTITY) errors.push(where + ': quantity must be an integer 1-' + MAX_BATCH_QUANTITY);
    if (b.quantitySource !== 'rolled' && b.quantitySource !== 'manual') errors.push(where + ': quantitySource must be rolled|manual');
    const e = b.encounter;
    if (!isObj(e) || !Array.isArray(e.entries) || e.entries.length < 1 || e.entries.length > 32 || !isInt(e.combines) || e.combines < 0 ||
        !e.entries.every(p => Array.isArray(p) && p.length === 2 && isInt(p[0]) && p[0] >= 1 && p[0] <= 8 && isInt(p[1]) && p[1] >= 1 && p[1] <= 6) ||
        Object.keys(e).some(k => k !== 'entries' && k !== 'combines')) errors.push(where + ': encounter must be {entries [[d8,d6]...], combines}');
    if (!isInt(b.rumor) || b.rumor < 1 || b.rumor > 100) errors.push(where + ': rumor must be an integer 1-100');
    if (typeof b.notes !== 'string' || b.notes.length > MAX_NOTES_LENGTH) errors.push(where + ': notes must be text up to ' + MAX_NOTES_LENGTH + ' characters');
    if (errors.length) return { errors: errors, batch: null };
    return {
      errors: [], batch: {
        id: b.id, createdAt: b.createdAt, habitat: habitat, terrain: { value: tr.value, source: tr.source }, quantity: b.quantity, quantitySource: b.quantitySource,
        encounter: { entries: e.entries.map(p => [p[0], p[1]]), combines: e.combines }, rumor: b.rumor, notes: b.notes,
      },
    };
  }

  /* ---------------- document validation (load + import) ---------------- */

  /**
   * Validates a whole document against the fixed template and the editor placement policy. Returns
   * { ok:true, doc } with a normalized deep copy, or { ok:false, code, errors } — never a partial repair.
   * code: 'invalid' | 'unsupported-schema' | 'template-mismatch'
   */
  function validateDocument(doc, ctx) {
    if (!isObj(doc)) return { ok: false, code: 'invalid', errors: ['document is not an object'] };
    if (doc.schemaVersion !== SCHEMA_VERSION) return { ok: false, code: 'unsupported-schema', errors: ['unsupported schemaVersion ' + String(doc.schemaVersion).slice(0, 20) + ' (this editor reads ' + SCHEMA_VERSION + ')'] };
    if (doc.kind !== KIND) return { ok: false, code: 'invalid', errors: ['not a Journey 2 GM backup (kind "' + String(doc.kind).slice(0, 60) + '")'] };
    if (doc.templateId !== ctx.templateId || doc.templateVersion !== ctx.templateVersion) {
      return { ok: false, code: 'template-mismatch', errors: ['backup is for template "' + String(doc.templateId).slice(0, 60) + '" v' + String(doc.templateVersion).slice(0, 10) + ', this editor has "' + ctx.templateId + '" v' + ctx.templateVersion] };
    }
    const errors = [];
    checkKeys(doc, DOC_KEYS, 'document', errors);
    if (!isIso(doc.createdAt) || !isIso(doc.updatedAt)) errors.push('document: invalid createdAt/updatedAt');
    if (!Array.isArray(doc.batches) || !Array.isArray(doc.tiles)) return { ok: false, code: 'invalid', errors: errors.concat('document: batches and tiles must be arrays') };
    if (doc.batches.length > MAX_BATCHES) errors.push('document: more than ' + MAX_BATCHES + ' batches');
    const batches = [], batchIds = new Set();
    doc.batches.forEach((b, i) => {
      const r = validateBatch(b, 'batches[' + i + ']');
      errors.push.apply(errors, r.errors.slice(0, 3));
      if (r.batch) {
        if (batchIds.has(r.batch.id)) errors.push('batches[' + i + ']: duplicate batch id "' + r.batch.id + '"');
        batchIds.add(r.batch.id); batches.push(r.batch);
      }
    });
    const quantity = new Map(batches.map(b => [b.id, b.quantity]));
    const placed = new Map(), tileIds = new Set(), cells = new Set(), tiles = [];
    const limit = errors.length > 20 ? 0 : doc.tiles.length;
    for (let i = 0; i < limit && errors.length < 40; i++) {
      const t = doc.tiles[i], where = 'tiles[' + i + ']';
      if (!isObj(t)) { errors.push(where + ': not an object'); continue; }
      checkKeys(t, TILE_KEYS, where, errors);
      if (typeof t.id !== 'string' || !ID_PATTERN.test(t.id)) { errors.push(where + ': invalid id'); continue; }
      if (tileIds.has(t.id)) errors.push(where + ': duplicate tile id "' + t.id + '"');
      tileIds.add(t.id);
      if (typeof t.batchId !== 'string' || !batchIds.has(t.batchId)) { errors.push(where + ': references a missing batch'); continue; }
      const c = Geo.parseCellId(t.cell);
      if (!c) { errors.push(where + ': malformed cell id'); continue; }
      const p = ctx.policy(c.q, c.r);
      if (!p.ok) errors.push(where + ': cell ' + t.cell + ' is not allowed (' + p.reason + ')');
      if (cells.has(t.cell)) errors.push(where + ': cell ' + t.cell + ' is occupied twice');
      cells.add(t.cell);
      placed.set(t.batchId, (placed.get(t.batchId) || 0) + 1);
      tiles.push({ id: t.id, batchId: t.batchId, cell: t.cell });
    }
    for (const [id, n] of placed) if (n > quantity.get(id)) errors.push('batch "' + id + '": ' + n + ' tiles placed but quantity is ' + quantity.get(id));
    const vis = validateVisibility(doc.playerVisibility, ctx, errors);
    const echoes = validateSoulEchoes(doc.soulEchoes, ctx, errors);
    const sanctuaries = validateSanctuaries(doc.sanctuaries, ctx, errors);
    if (errors.length) return { ok: false, code: 'invalid', errors: errors.slice(0, 20) };
    return { ok: true, doc: { schemaVersion: SCHEMA_VERSION, kind: KIND, templateId: doc.templateId, templateVersion: doc.templateVersion, createdAt: doc.createdAt, updatedAt: doc.updatedAt, batches: batches, tiles: tiles, playerVisibility: vis, soulEchoes: echoes, sanctuaries: sanctuaries } };
  }

  /** Text -> validated document. Size-limited; never throws. */
  function parseBackupText(text, ctx) {
    if (typeof text !== 'string') return { ok: false, code: 'invalid', errors: ['no text'] };
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, code: 'invalid', errors: ['file is larger than ' + (MAX_IMPORT_BYTES / 1048576) + ' MB'] };
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, code: 'invalid-json', errors: ['not valid JSON'] }; }
    return validateDocument(parsed, ctx);
  }

  function serializeBackup(doc) { return JSON.stringify(doc, null, 2) + '\n'; }

  /* ---------------- player visibility (Fog of War) ---------------- */

  /** A cell the GM may reveal/hide: inside the printed frame and not title/compass/scale furniture (no content can ever sit there). */
  function isFoggableCell(ctx, key) {
    const c = Geo.parseCellId(key);
    return !!c && ctx.policy(c.q, c.r).ok;
  }

  /** Canonical order for the stored list: ascending q, then r (numeric), so equal sets always serialize identically. */
  function compareCellKeys(a, b) {
    const ca = Geo.parseCellId(a), cb = Geo.parseCellId(b);
    return ca.q - cb.q || ca.r - cb.r;
  }

  /**
   * Validates `playerVisibility` (load + import). A MISSING object is not an error — an old or partial document simply
   * has nothing revealed. A present one must be { revealedCells: [canonical foggable cell ids] }; duplicates are
   * collapsed, order is normalized, anything else is reported (never silently repaired). Returns the normalized object.
   */
  function validateVisibility(v, ctx, errors) {
    if (v === undefined || v === null) return { revealedCells: [] };
    if (!isObj(v)) { errors.push('playerVisibility: not an object'); return { revealedCells: [] }; }
    checkKeys(v, VISIBILITY_KEYS, 'playerVisibility', errors);
    if (v.revealedCells === undefined) return { revealedCells: [] };
    if (!Array.isArray(v.revealedCells)) { errors.push('playerVisibility.revealedCells: not an array'); return { revealedCells: [] }; }
    if (v.revealedCells.length > ctx.allowedCellCount * 2) { errors.push('playerVisibility.revealedCells: too many entries'); return { revealedCells: [] }; }
    const set = new Set();
    for (let i = 0; i < v.revealedCells.length; i++) {
      const key = v.revealedCells[i];
      if (typeof key !== 'string' || !Geo.parseCellId(key)) { errors.push('playerVisibility.revealedCells[' + i + ']: malformed cell id'); continue; }
      if (!isFoggableCell(ctx, key)) { errors.push('playerVisibility.revealedCells[' + i + ']: cell ' + key + ' is not on the map'); continue; }
      set.add(key);
    }
    return { revealedCells: Array.from(set).sort(compareCellKeys) };
  }

  /* ---------------- Soul Echoes (GM-only, PD-022) ---------------- */

  /** Canonical stored order: plain string order of the stable anchor ids ("mk-001" < "mk-012"), so equal sets serialize identically. */
  const sortEchoIds = ids => Array.from(new Set(ids)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  /**
   * Validates `soulEchoes` (load + import). MISSING is not an error (an old document simply has none); a present one must be
   * { anchorIds: [<= 9 distinct sanctuary stable ids] }. Unknown fields, non-sanctuary ids (including the HORIZON / MARROGATE
   * destinations) and more than nine entries are reported — the whole document is rejected, never silently repaired.
   */
  function validateSoulEchoes(v, ctx, errors) {
    const none = { anchorIds: [] };
    if (v === undefined || v === null) return none;
    if (!isObj(v)) { errors.push('soulEchoes: not an object'); return none; }
    checkKeys(v, SOUL_ECHO_KEYS, 'soulEchoes', errors);
    if (v.anchorIds === undefined) return none;
    if (!Array.isArray(v.anchorIds)) { errors.push('soulEchoes.anchorIds: not an array'); return none; }
    if (v.anchorIds.length > MAX_SOUL_ECHOES) { errors.push('soulEchoes.anchorIds: more than ' + MAX_SOUL_ECHOES + ' Soul Echoes'); return none; }
    const ids = [];
    for (let i = 0; i < v.anchorIds.length; i++) {
      const id = v.anchorIds[i];
      if (typeof id !== 'string' || !ctx.sanctuaryIds.has(id)) { errors.push('soulEchoes.anchorIds[' + i + ']: not a sanctuary'); continue; }
      ids.push(id);
    }
    return { anchorIds: sortEchoIds(ids) };
  }

  /* ---------------- Sanctuaries (GM-only generated settlements, PD-023) ---------------- */

  /**
   * Strict check of one stored sanctuary. Returns { errors, entry } (entry = normalized copy). `name` is free text up to
   * MAX_SANCTUARY_NAME characters (it may be empty); every roll is an integer within its own die; the political system
   * is 1-4 DISTINCT results of 1-7 (a rolled 8 is resolved at roll time and never stored), kept in the order they were drawn.
   */
  function validateSanctuaryEntry(e, ctx, where) {
    const errors = [];
    if (!isObj(e)) return { errors: [where + ': not an object'], entry: null };
    checkKeys(e, SANCTUARY_ENTRY_KEYS, where, errors);
    if (typeof e.anchorId !== 'string' || !ctx.sanctuaryIds.has(e.anchorId)) errors.push(where + ': anchorId is not a sanctuary');
    if (typeof e.name !== 'string' || e.name.length > MAX_SANCTUARY_NAME) errors.push(where + ': name must be text up to ' + MAX_SANCTUARY_NAME + ' characters');
    for (const k of Object.keys(SANCTUARY_DICE)) if (!(isInt(e[k]) && e[k] >= 1 && e[k] <= SANCTUARY_DICE[k])) errors.push(where + ': ' + k + ' must be an integer 1-' + SANCTUARY_DICE[k]);
    const p = e.politics;
    if (!isObj(p) || Object.keys(p).some(k => k !== 'rolls') || !Array.isArray(p.rolls) || p.rolls.length < 1 || p.rolls.length > MAX_POLITICS_SYSTEMS ||
        !p.rolls.every(n => isInt(n) && n >= 1 && n <= POLITICS_SYSTEMS) || new Set(p.rolls).size !== p.rolls.length) {
      errors.push(where + ': politics must be { rolls: 1-' + MAX_POLITICS_SYSTEMS + ' distinct results of 1-' + POLITICS_SYSTEMS + ' }');
    }
    if (errors.length) return { errors: errors, entry: null };
    return {
      errors: [], entry: {
        anchorId: e.anchorId, name: e.name, trade: e.trade, quirk: e.quirk, crisis: e.crisis, drive: e.drive,
        politics: { rolls: p.rolls.slice() }, size: e.size, population: e.population,
      },
    };
  }

  /** Canonical stored order: the stable anchor id, so equal sets serialize identically. */
  const sortSanctuaries = entries => entries.slice().sort((a, b) => (a.anchorId < b.anchorId ? -1 : a.anchorId > b.anchorId ? 1 : 0));

  /**
   * Validates `sanctuaries` (load + import). MISSING is not an error (an old document simply has none); a present one must be
   * { entries: [one valid entry per sanctuary, no duplicates] }. Anything else rejects the whole document, never silently repaired.
   */
  function validateSanctuaries(v, ctx, errors) {
    const none = { entries: [] };
    if (v === undefined || v === null) return none;
    if (!isObj(v)) { errors.push('sanctuaries: not an object'); return none; }
    checkKeys(v, SANCTUARY_KEYS, 'sanctuaries', errors);
    if (v.entries === undefined) return none;
    if (!Array.isArray(v.entries)) { errors.push('sanctuaries.entries: not an array'); return none; }
    if (v.entries.length > ctx.sanctuaries.length) { errors.push('sanctuaries.entries: more entries than the map has sanctuaries'); return none; }
    const out = [], seen = new Set();
    v.entries.forEach((raw, i) => {
      const r = validateSanctuaryEntry(raw, ctx, 'sanctuaries.entries[' + i + ']');
      errors.push.apply(errors, r.errors.slice(0, 2));
      if (!r.entry) return;
      if (seen.has(r.entry.anchorId)) { errors.push('sanctuaries.entries[' + i + ']: duplicate sanctuary "' + r.entry.anchorId + '"'); return; }
      seen.add(r.entry.anchorId); out.push(r.entry);
    });
    return { entries: sortSanctuaries(out) };
  }

  /**
   * The one-click plan: a fresh settlement for EVERY sanctuary on the map. `roll()` is the generator adapter (a plain
   * { name, trade, ..., politics: { rolls } } of numbers); a name already taken by another sanctuary is rolled again a few
   * times so the map does not repeat itself. The result is only a proposal: the caller commits these exact entries as one
   * setSanctuaries command, so Redo never re-rolls.
   */
  function planSanctuaries(ctx, roll) {
    const used = new Set(), entries = [];
    for (const s of ctx.sanctuaries) {
      let r = roll();
      for (let i = 0; i < 6 && r.name && used.has(r.name.toLowerCase()); i++) r = roll();
      if (r.name) used.add(r.name.toLowerCase());
      entries.push(Object.assign({ anchorId: s.id }, r));
    }
    return entries;
  }

  /* Placement thresholds, as fractions of the sanctuaries' own bounding box so they follow the fixed map. */
  const ECHO_MIN_SEPARATION = 0.14;    // of the box diagonal: no two Echoes nearly on top of each other
  const ECHO_MIN_NORTH_SOUTH = 0.45;   // of the box height: the nine must not hug one coastline / one latitude
  const ECHO_MIN_SCATTER = 0.07;       // of the box height: RMS distance from the best-fit line — not "every third sanctuary in a line"
  const ECHO_ATTEMPTS = 200;

  /**
   * The book's placement rule as a pure planner: choose nine of the sanctuaries, spread EVENLY WEST TO EAST (one per
   * equal-count west-to-east band, so the first Echoes are far from Horizon and the last is near it), far apart,
   * and neither collinear nor confined to one latitude. Randomness is inspiration, not edict: the result is only a
   * proposal — the caller turns it into a setSoulEchoes command with these exact ids, so Redo never re-rolls.
   * `rng` is any () => [0,1) (injected for tests). Bounded retries; the best attempt is returned if none satisfies every rule.
   */
  function planSoulEchoes(ctx, rng) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    const all = ctx.sanctuaries;
    if (!all.length) return { anchorIds: [], satisfied: false };
    const n = Math.min(MAX_SOUL_ECHOES, all.length);
    const bands = [];
    for (let i = 0; i < n; i++) bands.push(all.slice(Math.floor(i * all.length / n), Math.floor((i + 1) * all.length / n)));

    const xs = all.map(s => s.x), ys = all.map(s => s.y);
    const w = Math.max.apply(null, xs) - Math.min.apply(null, xs), h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    const minSep = ECHO_MIN_SEPARATION * Math.hypot(w, h), minNS = ECHO_MIN_NORTH_SOUTH * h, minScatter = ECHO_MIN_SCATTER * h;

    function measure(picks) {
      let sep = Infinity;
      for (let i = 0; i < picks.length; i++) for (let j = i + 1; j < picks.length; j++) sep = Math.min(sep, Math.hypot(picks[i].x - picks[j].x, picks[i].y - picks[j].y));
      const py = picks.map(p => p.y);
      const northSouth = Math.max.apply(null, py) - Math.min.apply(null, py);
      /* least-squares line y = a x + b over the picks; RMS vertical residual */
      const m = picks.length, mx = picks.reduce((s, p) => s + p.x, 0) / m, my = py.reduce((s, y) => s + y, 0) / m;
      let sxx = 0, sxy = 0;
      for (const p of picks) { sxx += (p.x - mx) * (p.x - mx); sxy += (p.x - mx) * (p.y - my); }
      const a = sxx ? sxy / sxx : 0;
      const scatter = Math.sqrt(picks.reduce((s, p) => s + Math.pow(p.y - (my + a * (p.x - mx)), 2), 0) / m);
      const satisfied = sep >= minSep && northSouth >= minNS && scatter >= minScatter;
      const score = Math.min(sep / minSep, 1) + Math.min(northSouth / minNS, 1) + Math.min(scatter / minScatter, 1);
      return { satisfied: satisfied, score: score };
    }

    let best = null;
    for (let k = 0; k < ECHO_ATTEMPTS; k++) {
      const picks = bands.map(b => b[Math.min(b.length - 1, Math.floor(rand() * b.length))]);
      const m = measure(picks);
      if (!best || m.score > best.score) best = { picks: picks, score: m.score, satisfied: m.satisfied };
      if (m.satisfied) break;
    }
    return { anchorIds: sortEchoIds(best.picks.map(p => p.id)), satisfied: best.satisfied };
  }

  const revealedCache = new WeakMap();
  /** The revealed cells as a Set, built once per document object (the view and the projection never re-parse the array). */
  function getRevealedCellSet(doc) {
    const vis = doc && doc.playerVisibility;
    if (!vis) return new Set();
    let s = revealedCache.get(vis);
    if (!s) { s = new Set(vis.revealedCells); revealedCache.set(vis, s); }
    return s;
  }
  function isCellRevealed(doc, cellKey) { return getRevealedCellSet(doc).has(cellKey); }

  /**
   * Pure core of the setCellsRevealed command: which of `cellKeys` would actually change, given the current set.
   * Invalid, out-of-map and duplicate keys are ignored; the order of the first appearance is kept.
   */
  function cellsToChange(doc, ctx, cellKeys, revealed) {
    const have = getRevealedCellSet(doc), seen = new Set(), out = [];
    if (!Array.isArray(cellKeys)) return out;
    for (const key of cellKeys) {
      if (typeof key !== 'string' || seen.has(key) || !isFoggableCell(ctx, key)) continue;
      seen.add(key);
      if (have.has(key) !== !!revealed) out.push(key);
    }
    return out;
  }

  /* ---------------- cell checks (the one policy: preview, commit, import) ---------------- */

  /**
   * Evaluates candidate cells against the policy and current occupancy.
   * `ignoreTileId` lets a tile being moved ignore its own origin. Returns one record per cell:
   *   { q, r, id, ok, reason }  reason: 'outside' | 'decorative' | 'occupied' | null
   */
  function checkCells(doc, ctx, cells, ignoreTileId) {
    const occ = derive(doc).occupancy;
    return cells.map(c => {
      const id = Geo.cellId(c.q, c.r);
      const p = ctx.policy(c.q, c.r);
      if (!p.ok) return { q: c.q, r: c.r, id: id, ok: false, reason: p.reason };
      const t = occ.get(id);
      if (t && t.id !== ignoreTileId) return { q: c.q, r: c.r, id: id, ok: false, reason: 'occupied' };
      return { q: c.q, r: c.r, id: id, ok: true, reason: null };
    });
  }

  /* ---------------- region shape: connectivity and enclosed holes ---------------- */

  const NB = Geo.NEIGHBOR_DELTAS;

  /** Number of edge-connected components over the six axial neighbours (0 cells: 0). */
  function componentCount(cellIds) {
    const set = new Set(cellIds), seen = new Set();
    let count = 0;
    for (const start of set) {
      if (seen.has(start)) continue;
      count++;
      seen.add(start);
      const stack = [start];
      while (stack.length) {
        const c = Geo.parseCellId(stack.pop());
        if (!c) continue;
        for (const d of NB) {
          const id = Geo.cellId(c.q + d.dq, c.r + d.dr);
          if (set.has(id) && !seen.has(id)) { seen.add(id); stack.push(id); }
        }
      }
    }
    return count;
  }

  /** True when every cell id is reachable from every other (0 or 1 cells: true). */
  function isConnected(cellIds) { return componentCount(cellIds) <= 1; }

  /**
   * Empty cells fully enclosed by the given cells (one region's tiles — nothing else is a barrier).
   * Flood-fills the non-region cells of the bounding area, expanded by one cell, from its outer ring; whatever
   * inside the area the flood cannot reach is a hole. The area is pure axial arithmetic, so a region against the
   * map edge never produces a false hole. `countable(q, r)` (optional) limits the report to cells the editor
   * could actually place on (a hole made only of unplaceable cells is not an "empty hex").
   */
  function enclosedHoles(cellIds, countable) {
    const set = new Set();
    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const id of cellIds) {
      const c = Geo.parseCellId(id);
      if (!c) continue;
      set.add(id);
      if (c.q < minQ) minQ = c.q; if (c.q > maxQ) maxQ = c.q;
      if (c.r < minR) minR = c.r; if (c.r > maxR) maxR = c.r;
    }
    if (set.size < 6) return [];                       // a hole needs six surrounding tiles
    const q0 = minQ - 1, q1 = maxQ + 1, r0 = minR - 1, r1 = maxR + 1;
    const start = Geo.cellId(q0, r0), reach = new Set([start]), stack = [[q0, r0]];
    while (stack.length) {
      const [q, r] = stack.pop();
      for (const d of NB) {
        const nq = q + d.dq, nr = r + d.dr;
        if (nq < q0 || nq > q1 || nr < r0 || nr > r1) continue;
        const id = Geo.cellId(nq, nr);
        if (set.has(id) || reach.has(id)) continue;
        reach.add(id); stack.push([nq, nr]);
      }
    }
    const holes = [];
    for (let q = q0; q <= q1; q++) for (let r = r0; r <= r1; r++) {
      const id = Geo.cellId(q, r);
      if (!set.has(id) && !reach.has(id) && (!countable || countable(q, r))) holes.push(id);
    }
    return holes;
  }

  const holeCache = new WeakMap();
  /** Map batchId -> number of enclosed empty cells (only batches that have any). Cached per document. */
  function holeCounts(doc, ctx) {
    let m = holeCache.get(doc);
    if (m) return m;
    m = new Map();
    const byBatch = new Map();
    for (const t of doc.tiles) { let a = byBatch.get(t.batchId); if (!a) byBatch.set(t.batchId, a = []); a.push(t.cell); }
    const placeable = (q, r) => ctx.policy(q, r).ok;
    for (const [id, cells] of byBatch) { const n = enclosedHoles(cells, placeable).length; if (n) m.set(id, n); }
    holeCache.set(doc, m);
    return m;
  }

  /**
   * The one shape rule behind preview AND commit. The batch's resulting cells (its tiles, minus `ignoreTileId`,
   * plus `addIds`) must be one connected component. Legacy rule for an ALREADY split region (an old save): an
   * edit must not INCREASE the number of components — it may keep or reduce it — so the save stays usable and
   * the strict one-component rule applies as soon as the region is connected.
   * Returns { ok, connected } — `connected` is the raw result, `ok` the verdict.
   */
  function regionConnectivity(doc, batchId, addIds, ignoreTileId) {
    const mine = doc.tiles.filter(t => t.batchId === batchId);
    const before = componentCount(mine.map(t => t.cell));
    const after = componentCount(mine.filter(t => t.id !== ignoreTileId).map(t => t.cell).concat(addIds));
    return { ok: after <= Math.max(1, before), connected: after <= 1 };
  }

  /* ---------------- prepared-map adjacency (edge contact between regions) ---------------- */

  /** Canonical ids of the six edge neighbours of a cell id ("q,r"). */
  function neighborIds(cellKey) {
    const c = Geo.parseCellId(cellKey);
    return c ? NB.map(d => Geo.cellId(c.q + d.dq, c.r + d.dr)) : [];
  }

  /** Cell id -> batch id for a tile list. */
  function cellOwners(tiles) {
    const m = new Map();
    for (const t of tiles) m.set(t.cell, t.batchId);
    return m;
  }

  /** The batches that have at least one tile sharing a full edge with a tile of ANOTHER batch (corner contact never counts). */
  function attachedBatchIds(tiles) {
    const owners = cellOwners(tiles), out = new Set();
    for (const t of tiles) {
      if (out.has(t.batchId)) continue;
      for (const id of neighborIds(t.cell)) {
        const o = owners.get(id);
        if (o !== undefined && o !== t.batchId) { out.add(t.batchId); out.add(o); break; }
      }
    }
    return out;
  }

  /**
   * The prepared-map attachment rule for one edit — a pure function of the document and the proposed change:
   *   placing  (removeTileId null)  a batch with NO tiles yet needs one added cell sharing an edge with another batch's tile,
   *                                 unless the map holds no other tiles (the first region) or `separate` is set;
   *   moving / returning (removeTileId set)  no batch that was attached to the prepared map before may end up unattached while
   *                                 other regions still exist — neither the edited region nor a neighbour that leaned on the tile.
   * Returns { ok:true } or { ok:false, code: 'not-adjacent' | 'detaches-region' | 'detaches-other', batchId }.
   */
  function attachmentCheck(doc, batchId, addIds, removeTileId, separate) {
    const tiles = doc.tiles;
    if (!removeTileId) {
      if (separate || !addIds.length) return { ok: true };
      if (tiles.some(t => t.batchId === batchId)) return { ok: true };          // already part of the map: shape rule keeps it joined
      if (!tiles.length) return { ok: true };                                    // the first region may start anywhere
      const owners = cellOwners(tiles);
      for (const id of addIds) for (const nb of neighborIds(id)) { const o = owners.get(nb); if (o !== undefined && o !== batchId) return { ok: true }; }
      return { ok: false, code: 'not-adjacent', batchId: batchId };
    }
    const before = attachedBatchIds(tiles);
    if (!before.size) return { ok: true };
    const after = tiles.filter(t => t.id !== removeTileId).concat(addIds.map(cell => ({ id: '~', batchId: batchId, cell: cell })));
    const attached = attachedBatchIds(after), present = new Set(after.map(t => t.batchId));
    if (present.size < 2) return { ok: true };                                   // nothing else left to be attached to
    const cut = Array.from(before).filter(id => present.has(id) && !attached.has(id));
    if (!cut.length) return { ok: true };
    const own = cut.includes(batchId);                                            // report the edited region first
    return { ok: false, code: own ? 'detaches-region' : 'detaches-other', batchId: own ? batchId : cut[0] };
  }

  /* ---------------- region perimeter (derived, never stored) ---------------- */

  /**
   * The thick cartographic outline of every placed region as deduplicated hex edges — a pure function of the tiles.
   * One entry per edge: { cell: "q,r", dir: 0-5, kind: 'outer' | 'divider' } where `dir` indexes Geo.NEIGHBOR_DELTAS (the edge shared
   * with that neighbour). Between two tiles of the SAME batch there is no edge; between tiles of DIFFERENT batches there is exactly one
   * `divider` (emitted from the smaller cell id); between a tile and an empty cell, or the edge of the valid map, an `outer` edge. A split
   * (legacy) region is outlined around every component and an enclosed hole gets its inner outline, because only neighbours matter.
   *
   * `visible(key)` (optional) restricts the result to what players may see: an edge is produced only when its tile is visible AND the
   * cell on the other side is visible too — except a neighbour that is not foggable (outside the map or title/compass/scale furniture,
   * which the fog never covers), for which the tile alone decides. An edge towards a hidden cell is never drawn, so the line can neither
   * end falsely nor reveal the shape of an unexplored region. `foggable(key)` defaults to "every cell is foggable" (the strictest reading: an unrevealed neighbour never draws).
   */
  function regionBoundarySegments(doc, ctx, visible, foggable) {
    const owners = cellOwners(doc.tiles), out = [];
    const seeVisible = typeof visible === 'function' ? visible : null;
    const isFog = typeof foggable === 'function' ? foggable : () => true;
    for (const t of doc.tiles) {
      if (seeVisible && !seeVisible(t.cell)) continue;
      const nbs = neighborIds(t.cell);
      for (let k = 0; k < 6; k++) {
        const other = owners.get(nbs[k]);
        if (other === t.batchId) continue;
        const kind = other === undefined ? 'outer' : 'divider';
        if (kind === 'divider' && compareCellKeys(t.cell, nbs[k]) > 0) continue;   // the other tile emits it
        if (seeVisible && !(other !== undefined ? seeVisible(nbs[k]) : (!isFog(nbs[k]) || seeVisible(nbs[k])))) continue;
        out.push({ cell: t.cell, dir: k, kind: kind });
      }
    }
    return out;
  }

  /**
   * Cell policy + shape rule + prepared-map attachment for placing `cells` for `batchId` (or moving `ignoreTileId`).
   * `opts.separate` is the explicit "Start separate area" override of the attachment rule for a first placement.
   * Returns { cells, connected, attached, attachCode, valid }.
   */
  function checkPlacement(doc, ctx, batchId, cells, ignoreTileId, opts) {
    const checked = checkCells(doc, ctx, cells, ignoreTileId);
    const rc = regionConnectivity(doc, batchId, checked.map(c => c.id), ignoreTileId);
    const at = attachmentCheck(doc, batchId, checked.map(c => c.id), ignoreTileId, !!(opts && opts.separate));
    return { cells: checked, connected: rc.ok, attached: at.ok, attachCode: at.ok ? null : at.code, valid: rc.ok && at.ok && checked.every(c => c.ok) };
  }

  /* ---------------- commands ---------------- */

  const fail = (code, extra) => ({ ok: false, error: Object.assign({ code: code }, extra || {}) });
  const touch = (doc, at, patch) => Object.assign({}, doc, patch, { updatedAt: at || doc.updatedAt });

  /**
   * Applies one command to an (immutable) document: { ok:true, doc, noop? } or { ok:false, error }.
   * Commands (all values pre-generated, so replay is exact):
   *   createBatch { batch, at }
   *   place       { batchId, tiles:[{id, cell}], separate?, at }   atomic: all or nothing; the first tiles of an unplaced region must
   *                                                                share an edge with another region unless `separate: true` (PD-021)
   *   move        { tileId, to:"q,r", at }                     same cell => noop; may not detach a region from the map (PD-021)
   *   returnTile  { tileId, at }                                   same detach rule
   *   deleteBatch { batchId, at }                                  removes the batch AND all its tiles, atomically
   *   setNotes    { batchId, notes, at }                       unchanged => noop
   *   setCellsRevealed { cellKeys:["q,r"...], revealed:boolean, at }   Fog of War: reveal (true) or hide (false) cells;
   *                                                                   touches ONLY playerVisibility, never batches or tiles;
   *                                                                   invalid/duplicate keys are ignored; nothing to change => noop
   *   setSoulEchoes { anchorIds:["mk-012"...], at }                GM-only: REPLACES the whole set (<= 9 distinct sanctuary ids; [] removes all);
   *                                                                touches ONLY soulEchoes; same set => noop; anything else is refused whole
   *   setSanctuaries { entries:[{anchorId,name,trade,...}], at }   GM-only: REPLACES every generated sanctuary (one entry per sanctuary id; [] removes
   *                                                                all); touches ONLY sanctuaries; same set => noop; anything invalid is refused whole
   *   setSanctuary   { entry, at }                                 replaces ONE existing sanctuary (the reroll); an unknown one is refused
   *   deleteSanctuary { anchorId, at }                             removes ONE generated sanctuary; the printed icon is never touched
   */
  function apply(doc, cmd, ctx) {
    switch (cmd && cmd.type) {
      case 'createBatch': {
        const r = validateBatch(cmd.batch, 'batch');
        if (!r.batch) return fail('invalid-batch', { errors: r.errors });
        if (doc.batches.some(b => b.id === r.batch.id)) return fail('duplicate-batch');
        if (doc.batches.length >= MAX_BATCHES) return fail('too-many-batches');
        return { ok: true, doc: touch(doc, cmd.at, { batches: doc.batches.concat([r.batch]) }) };
      }
      case 'place': {
        const batch = batchById(doc, cmd.batchId);
        if (!batch) return fail('no-batch');
        if (!Array.isArray(cmd.tiles) || !cmd.tiles.length) return fail('empty');
        const d = derive(doc);
        if (cmd.tiles.length > d.counts.get(batch.id).remaining) return fail('no-stock', { remaining: d.counts.get(batch.id).remaining });
        const cells = [], seenCell = new Set(), seenId = new Set(d.byId.keys());
        for (const t of cmd.tiles) {
          const c = Geo.parseCellId(t && t.cell);
          if (!c) return fail('bad-cell', { cell: t && t.cell });
          if (seenCell.has(t.cell)) return fail('duplicate-cell', { cell: t.cell });
          if (typeof t.id !== 'string' || !ID_PATTERN.test(t.id) || seenId.has(t.id)) return fail('bad-tile-id');
          seenCell.add(t.cell); seenId.add(t.id); cells.push(c);
        }
        const conflicts = checkCells(doc, ctx, cells).filter(c => !c.ok);
        if (conflicts.length) return fail('blocked', { conflicts: conflicts });
        if (!regionConnectivity(doc, batch.id, cmd.tiles.map(t => t.cell)).ok) return fail('disconnected-region');
        const att = attachmentCheck(doc, batch.id, cmd.tiles.map(t => t.cell), null, cmd.separate === true);
        if (!att.ok) return fail(att.code);
        return { ok: true, doc: touch(doc, cmd.at, { tiles: doc.tiles.concat(cmd.tiles.map(t => ({ id: t.id, batchId: batch.id, cell: t.cell }))) }) };
      }
      case 'move': {
        const tile = derive(doc).byId.get(cmd.tileId);
        if (!tile) return fail('no-tile');
        const c = Geo.parseCellId(cmd.to);
        if (!c) return fail('bad-cell', { cell: cmd.to });
        if (cmd.to === tile.cell) return { ok: true, doc: doc, noop: true };
        const chk = checkCells(doc, ctx, [c], tile.id)[0];
        if (!chk.ok) return fail('blocked', { conflicts: [chk] });
        if (!regionConnectivity(doc, tile.batchId, [cmd.to], tile.id).ok) return fail('disconnected-region');
        const att = attachmentCheck(doc, tile.batchId, [cmd.to], tile.id, false);
        if (!att.ok) return fail(att.code, { batchId: att.batchId });
        return { ok: true, doc: touch(doc, cmd.at, { tiles: doc.tiles.map(t => (t.id === tile.id ? { id: t.id, batchId: t.batchId, cell: cmd.to } : t)) }) };
      }
      case 'returnTile': {
        const tile = derive(doc).byId.get(cmd.tileId);
        if (!tile) return fail('no-tile');
        if (!regionConnectivity(doc, tile.batchId, [], tile.id).ok) return fail('disconnected-region');
        const att = attachmentCheck(doc, tile.batchId, [], tile.id, false);
        if (!att.ok) return fail(att.code, { batchId: att.batchId });
        return { ok: true, doc: touch(doc, cmd.at, { tiles: doc.tiles.filter(t => t.id !== cmd.tileId) }) };
      }
      case 'deleteBatch': {
        if (!batchById(doc, cmd.batchId)) return fail('no-batch');
        return { ok: true, doc: touch(doc, cmd.at, { batches: doc.batches.filter(b => b.id !== cmd.batchId), tiles: doc.tiles.filter(t => t.batchId !== cmd.batchId) }) };
      }
      case 'setNotes': {
        const batch = batchById(doc, cmd.batchId);
        if (!batch) return fail('no-batch');
        if (typeof cmd.notes !== 'string' || cmd.notes.length > MAX_NOTES_LENGTH) return fail('bad-notes');
        if (cmd.notes === batch.notes) return { ok: true, doc: doc, noop: true };
        return { ok: true, doc: touch(doc, cmd.at, { batches: doc.batches.map(b => (b.id === batch.id ? Object.assign({}, b, { notes: cmd.notes }) : b)) }) };
      }
      case 'setCellsRevealed': {
        if (typeof cmd.revealed !== 'boolean') return fail('bad-revealed');
        const change = cellsToChange(doc, ctx, cmd.cellKeys, cmd.revealed);
        if (!change.length) return { ok: true, doc: doc, noop: true };
        const next = new Set(getRevealedCellSet(doc));
        for (const key of change) { if (cmd.revealed) next.add(key); else next.delete(key); }
        return { ok: true, doc: touch(doc, cmd.at, { playerVisibility: { revealedCells: Array.from(next).sort(compareCellKeys) } }), changed: change.length };
      }
      case 'setSoulEchoes': {
        if (!Array.isArray(cmd.anchorIds)) return fail('bad-echoes');
        if (cmd.anchorIds.length > MAX_SOUL_ECHOES) return fail('too-many-echoes');
        if (!cmd.anchorIds.every(id => typeof id === 'string' && ctx.sanctuaryIds.has(id))) return fail('bad-echoes');
        const next = sortEchoIds(cmd.anchorIds), have = doc.soulEchoes ? doc.soulEchoes.anchorIds : [];
        if (next.length === have.length && next.every((id, i) => id === have[i])) return { ok: true, doc: doc, noop: true };
        return { ok: true, doc: touch(doc, cmd.at, { soulEchoes: { anchorIds: next } }), changed: next.length };
      }
      case 'setSanctuaries': {
        if (!Array.isArray(cmd.entries) || cmd.entries.length > ctx.sanctuaries.length) return fail('bad-sanctuaries');
        const seen = new Set(), next = [];
        for (const raw of cmd.entries) {
          const r = validateSanctuaryEntry(raw, ctx, 'entry');
          if (!r.entry || seen.has(r.entry.anchorId)) return fail('bad-sanctuaries');
          seen.add(r.entry.anchorId); next.push(r.entry);
        }
        const sorted = sortSanctuaries(next), have = doc.sanctuaries ? doc.sanctuaries.entries : [];
        if (JSON.stringify(sorted) === JSON.stringify(have)) return { ok: true, doc: doc, noop: true };
        return { ok: true, doc: touch(doc, cmd.at, { sanctuaries: { entries: sorted } }), changed: sorted.length };
      }
      case 'setSanctuary': {
        const r = validateSanctuaryEntry(cmd.entry, ctx, 'entry');
        if (!r.entry) return fail('bad-sanctuary');
        const have = doc.sanctuaries ? doc.sanctuaries.entries : [];
        if (!have.some(e => e.anchorId === r.entry.anchorId)) return fail('no-sanctuary');
        const next = have.map(e => (e.anchorId === r.entry.anchorId ? r.entry : e));
        if (JSON.stringify(next) === JSON.stringify(have)) return { ok: true, doc: doc, noop: true };
        return { ok: true, doc: touch(doc, cmd.at, { sanctuaries: { entries: next } }) };
      }
      case 'deleteSanctuary': {
        const have = doc.sanctuaries ? doc.sanctuaries.entries : [];
        if (!have.some(e => e.anchorId === cmd.anchorId)) return fail('no-sanctuary');
        return { ok: true, doc: touch(doc, cmd.at, { sanctuaries: { entries: have.filter(e => e.anchorId !== cmd.anchorId) } }) };
      }
      default: return fail('unknown-command');
    }
  }

  /* ---------------- history (bounded Undo / Redo of document snapshots) ---------------- */

  function createHistory(limit) { return { limit: limit || HISTORY_LIMIT, undo: [], redo: [] }; }

  /** Records one committed transaction. A new edit clears the redo branch. */
  function historyCommit(h, before, after, label) {
    if (before === after) return;
    h.undo.push({ before: before, after: after, label: label });
    if (h.undo.length > h.limit) h.undo.shift();
    h.redo.length = 0;
  }
  function historyUndo(h) { const e = h.undo.pop(); if (!e) return null; h.redo.push(e); return e; }
  function historyRedo(h) { const e = h.redo.pop(); if (!e) return null; h.undo.push(e); return e; }
  function historyClear(h) { h.undo.length = 0; h.redo.length = 0; }

  /* ---------------- "place all remaining" footprint ---------------- */

  /**
   * Deterministic compact connected footprint of exactly n relative axial offsets, centred on (0,0):
   * the centre, then complete hex rings outward (ring k walks 6 sides of k steps from k * the 'sw'
   * neighbour direction), truncated to n. Pure function of n — it never depends on the map, the
   * pointer, zoom or occupancy, so it is generated once per drag and frozen. Each prefix is connected
   * and as round as a ring-walk allows.
   */
  function compactFootprint(n) {
    if (!isInt(n) || n < 1) return [];
    const D = Geo.NEIGHBOR_DELTAS;
    const out = [{ dq: 0, dr: 0 }];
    for (let k = 1; out.length < n; k++) {
      let q = k * D[4].dq, r = k * D[4].dr;
      for (let side = 0; side < 6 && out.length < n; side++) {
        for (let step = 0; step < k && out.length < n; step++) {
          out.push({ dq: q, dr: r });
          q += D[side].dq; r += D[side].dr;
        }
      }
    }
    return out.slice(0, n);
  }

  /* ---------------- region inspection (transient view state — never part of the document, history or storage) ---------------- */

  /** The one empty inspection. `source` is where it was opened from: 'map' (a placed hex, the visual anchor) or 'card' (a sidebar card). */
  const NO_INSPECTION = Object.freeze({ batchId: null, tileId: null, source: null });

  /** Inspect the region a placed hex belongs to; that hex is the selected anchor. An unknown hex changes nothing. */
  function inspectTile(state, doc, tileId) {
    const tile = derive(doc).byId.get(tileId);
    if (!tile) return state;
    return Object.freeze({ batchId: tile.batchId, tileId: tile.id, source: 'map' });
  }

  /** Inspect a region from its card: no hex is selected, so an unplaced region works too. An unknown region changes nothing. */
  function inspectBatch(state, doc, batchId) {
    if (!batchById(doc, batchId)) return state;
    return Object.freeze({ batchId: batchId, tileId: null, source: 'card' });
  }

  /** Reconciles an inspection with a (possibly new) document: a vanished region closes it, a vanished or foreign anchor hex is dropped. */
  function syncInspection(state, doc) {
    if (!state.batchId) return state;
    if (!batchById(doc, state.batchId)) return NO_INSPECTION;
    if (state.tileId) {
      const tile = derive(doc).byId.get(state.tileId);
      if (!tile || tile.batchId !== state.batchId) return Object.freeze({ batchId: state.batchId, tileId: null, source: state.source });
    }
    return state;
  }

  /** Every placed hex of the inspected region (the soft region highlight); empty when closed or when nothing is placed. */
  function inspectedTileIds(state, doc) {
    return state.batchId ? doc.tiles.filter(t => t.batchId === state.batchId).map(t => t.id) : [];
  }

  return {
    NO_INSPECTION: NO_INSPECTION, inspectTile: inspectTile, inspectBatch: inspectBatch, syncInspection: syncInspection, inspectedTileIds: inspectedTileIds,
    SCHEMA_VERSION: SCHEMA_VERSION, KIND: KIND, HABITAT_IDS: HABITAT_IDS, OVERTAKEN_SYMBOL: OVERTAKEN_SYMBOL,
    MAX_BATCH_QUANTITY: MAX_BATCH_QUANTITY, MAX_BATCHES: MAX_BATCHES, MAX_NOTES_LENGTH: MAX_NOTES_LENGTH, MAX_IMPORT_BYTES: MAX_IMPORT_BYTES, HISTORY_LIMIT: HISTORY_LIMIT,
    createContext: createContext, newId: newId, emptyDocument: emptyDocument, isEmptyDocument: isEmptyDocument, symbolIdOf: symbolIdOf,
    derive: derive, batchById: batchById, parseQuantity: parseQuantity, batchFromRegion: batchFromRegion, validateBatch: validateBatch,
    validateDocument: validateDocument, parseBackupText: parseBackupText, serializeBackup: serializeBackup,
    checkCells: checkCells, checkPlacement: checkPlacement, attachmentCheck: attachmentCheck, attachedBatchIds: attachedBatchIds, neighborIds: neighborIds, regionBoundarySegments: regionBoundarySegments, regionConnectivity: regionConnectivity, isConnected: isConnected, componentCount: componentCount, enclosedHoles: enclosedHoles, holeCounts: holeCounts, apply: apply,
    createHistory: createHistory, historyCommit: historyCommit, historyUndo: historyUndo, historyRedo: historyRedo, historyClear: historyClear,
    compactFootprint: compactFootprint,
    MAX_SOUL_ECHOES: MAX_SOUL_ECHOES, planSoulEchoes: planSoulEchoes,
    SANCTUARY_DICE: SANCTUARY_DICE, MAX_SANCTUARY_NAME: MAX_SANCTUARY_NAME, validateSanctuaryEntry: validateSanctuaryEntry, planSanctuaries: planSanctuaries,
    isFoggableCell: isFoggableCell, getRevealedCellSet: getRevealedCellSet, isCellRevealed: isCellRevealed, cellsToChange: cellsToChange, compareCellKeys: compareCellKeys,
  };
});
