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
       playerVisibility: { revealedCells: [ "q,r", ... ] } }
   Fog of War (Phase C) is CELL-based and lives only in `playerVisibility.revealedCells` — never on a batch or a
   tile. Every placeable cell is hidden by default; the list is the single source of truth (no hiddenCells twin),
   kept sorted so a serialized document is deterministic.
   Counts (placed / remaining) are DERIVED from tiles, never stored:
     remaining(batch) = quantity(batch) - placedTileCount(batch)
   Occupancy is keyed by the canonical cell id; one tile per cell.

   Region shape rules (enforced here, not in the view): all placed tiles of
   one batch form ONE edge-connected component (six axial neighbours; other
   batches never count), and an enclosed empty hole is reported as a warning
   (enclosedHoles / holeCounts) but never blocks an edit.

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
  const DOC_KEYS = ['schemaVersion', 'kind', 'templateId', 'templateVersion', 'createdAt', 'updatedAt', 'batches', 'tiles', 'playerVisibility'];
  const VISIBILITY_KEYS = ['revealedCells'];
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
    return {
      grid: grid, templateId: template.templateId, templateVersion: template.schemaVersion,
      protections: Geo.protectionRects(template, anchorsDoc || null), decorativeCells: decorative, policy: policy,
      allowedCellCount: grid.validCellCount() - decorative.size,
    };
  }

  /* ---------------- ids & small helpers ---------------- */

  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyDocument(ctx, nowIso) {
    const now = nowIso || new Date().toISOString();
    return { schemaVersion: SCHEMA_VERSION, kind: KIND, templateId: ctx.templateId, templateVersion: ctx.templateVersion, createdAt: now, updatedAt: now, batches: [], tiles: [], playerVisibility: { revealedCells: [] } };
  }

  function isEmptyDocument(doc) { return !doc || (doc.batches.length === 0 && doc.tiles.length === 0 && !(doc.playerVisibility && doc.playerVisibility.revealedCells.length)); }

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
    if (errors.length) return { ok: false, code: 'invalid', errors: errors.slice(0, 20) };
    return { ok: true, doc: { schemaVersion: SCHEMA_VERSION, kind: KIND, templateId: doc.templateId, templateVersion: doc.templateVersion, createdAt: doc.createdAt, updatedAt: doc.updatedAt, batches: batches, tiles: tiles, playerVisibility: vis } };
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

  /** Cell policy + shape rule for placing `cells` for `batchId` (or moving `ignoreTileId`). */
  function checkPlacement(doc, ctx, batchId, cells, ignoreTileId) {
    const checked = checkCells(doc, ctx, cells, ignoreTileId);
    const rc = regionConnectivity(doc, batchId, checked.map(c => c.id), ignoreTileId);
    return { cells: checked, connected: rc.ok, valid: rc.ok && checked.every(c => c.ok) };
  }

  /* ---------------- commands ---------------- */

  const fail = (code, extra) => ({ ok: false, error: Object.assign({ code: code }, extra || {}) });
  const touch = (doc, at, patch) => Object.assign({}, doc, patch, { updatedAt: at || doc.updatedAt });

  /**
   * Applies one command to an (immutable) document: { ok:true, doc, noop? } or { ok:false, error }.
   * Commands (all values pre-generated, so replay is exact):
   *   createBatch { batch, at }
   *   place       { batchId, tiles:[{id, cell}], at }          atomic: all or nothing
   *   move        { tileId, to:"q,r", at }                     same cell => noop
   *   returnTile  { tileId, at }
   *   deleteBatch { batchId, at }                                  removes the batch AND all its tiles, atomically
   *   setNotes    { batchId, notes, at }                       unchanged => noop
   *   setCellsRevealed { cellKeys:["q,r"...], revealed:boolean, at }   Fog of War: reveal (true) or hide (false) cells;
   *                                                                   touches ONLY playerVisibility, never batches or tiles;
   *                                                                   invalid/duplicate keys are ignored; nothing to change => noop
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
        return { ok: true, doc: touch(doc, cmd.at, { tiles: doc.tiles.map(t => (t.id === tile.id ? { id: t.id, batchId: t.batchId, cell: cmd.to } : t)) }) };
      }
      case 'returnTile': {
        const tile = derive(doc).byId.get(cmd.tileId);
        if (!tile) return fail('no-tile');
        if (!regionConnectivity(doc, tile.batchId, [], tile.id).ok) return fail('disconnected-region');
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
    checkCells: checkCells, checkPlacement: checkPlacement, regionConnectivity: regionConnectivity, isConnected: isConnected, componentCount: componentCount, enclosedHoles: enclosedHoles, holeCounts: holeCounts, apply: apply,
    createHistory: createHistory, historyCommit: historyCommit, historyUndo: historyUndo, historyRedo: historyRedo, historyClear: historyClear,
    compactFootprint: compactFootprint,
    isFoggableCell: isFoggableCell, getRevealedCellSet: getRevealedCellSet, isCellRevealed: isCellRevealed, cellsToChange: cellsToChange, compareCellKeys: compareCellKeys,
  };
});
