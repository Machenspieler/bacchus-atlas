/* ============================================================
   Bacchus's Atlas — darkheart-encounter.js
   Pure, dependency-light Darkheart encounter assembly: given a party, a
   difficulty, a Darkheart outcome and an environment (optionally a feature
   fragment of it), recommend concrete adversaries from the EXISTING catalogue
   (data/prep.json) with their Battle Points. The fourth, independently
   regenerable component of the Scene Composer
   (docs/data-contracts/scene-composer.md; decision record PD-098).

   What it reuses, and never duplicates:
   - js/battle-points.js — every cost, budget and modifier (Daggerheart Battle
     Guide / SRD 2.0). This file never states a cost; it only asks
     BattlePoints.calculate().
   - js/potential-adversary-utils.js — the one Potential Adversaries parser and
     catalogue name matcher that Prep's recommendations use.
   - js/freshcutgrass-utils.js — the one encoder for "Open in Encounter
     Builder" (optional; see encounterBuilderEntries / encounterBuilderUrl).

   What it never does: invent or rescale a stat block, read or write campaign
   state (GM Fear, Forest Difficulty, quest countdowns, expedition state), touch
   storage or the DOM, or call out of the page. It is advisory: Battle Points
   are guidance, never a guarantee of perfect difficulty, and the Darkheart
   rules stay authoritative for the outcome itself.

   Lives in scripts/lib/ beside the manifest library on purpose: every file under
   js/ must be referenced by index.html (check-asset-versioning), and nothing
   loads this until the dashboard exists. It already carries the browser UMD
   branch, so promoting it is a move to js/ plus a <script> tag. Required() from
   a Node test (tests/darkheart-encounter.test.js).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./battle-points.js'),
      require('./potential-adversary-utils.js'),
      require('./freshcutgrass-utils.js'),
    );
  } else {
    root.DarkheartEncounter = factory(root.BattlePoints, root.PotentialAdversaryUtils, root.FreshCutGrassUtils);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (BattlePoints, PAU, FCG) {
  'use strict';

  var SCHEMA = 1;

  /* ---------------- outcome policy ---------------- */

  /* What each of the twelve Darkheart outcomes asks of the encounter. The keys
   * are exactly scripts/lib/darkheart-scenes.js OUTCOME_KEYS (a test pins it).
   *   recommended — a combat encounter is the default (hostile creature)
   *   prepared    — stats on hand, combat never forced (neutral creature)
   *   optional    — danger may be environmental; combat only if the Master
   *                 wants it, and only thematic adversaries are offered
   *   none        — no combat; nothing is generated unless adversaries are locked
   * `thematicOnly` forbids the role-filler pool (no unrelated enemies);
   * `maxLines` caps distinct adversaries. */
  var OUTCOME_POLICY = {
    'creature-fail-fear':    { combat: 'recommended', thematicOnly: false, maxLines: 4 },
    'creature-fail-hope':    { combat: 'prepared',    thematicOnly: true,  maxLines: 2 },
    'creature-success-fear': { combat: 'optional',    thematicOnly: true,  maxLines: 3 },
    'creature-success-hope': { combat: 'none' },
    'landmark-fail-fear':    { combat: 'none' },
    'landmark-fail-hope':    { combat: 'none' },
    'landmark-success-fear': { combat: 'none' },
    'landmark-success-hope': { combat: 'none' },
    'hazard-fail-fear':      { combat: 'optional',    thematicOnly: true,  maxLines: 2 },
    'hazard-fail-hope':      { combat: 'optional',    thematicOnly: true,  maxLines: 2 },
    'resource-success-fear': { combat: 'optional',    thematicOnly: true,  maxLines: 3 },
    'resource-success-hope': { combat: 'none' },
  };
  var OUTCOME_KEYS = Object.keys(OUTCOME_POLICY);

  var DIFFICULTIES = ['easier', 'standard', 'harder'];
  /* The encounter engine's wording -> the Battle Guide style battle-points.js knows. */
  var STYLE_FOR = { easier: 'easier', standard: 'standard', harder: 'dangerous' };

  /* Variety caps. Not rules — taste, so a recommendation stays readable. */
  var MAX_LINES = 5;
  var MAX_QTY_NON_MINION = { social: 2, support: 2, horde: 2, ranged: 2, skulk: 2, standard: 2, leader: 1, bruiser: 1, solo: 1 };
  var MAX_MINION_GROUPS = 2;
  var BUDGET_SLACK = 1; // a composition within this much of the budget counts as filled

  var SOURCE_WEIGHT = { locked: 100, environment: 10, narrative: 5, 'role-filler': 2 };

  /* ---------------- bilingual text ---------------- */

  /* Every sentence the engine returns is { en, ru } — new Darkheart text is
   * never English-only (docs/data-contracts/darkheart-scenes.md). Russian
   * follows docs/translation-glossary.md. */
  var TEXT = {
    'combat-none': function () { return { en: 'This outcome does not call for combat; no adversaries were generated.', ru: 'Этот исход не предполагает боя; противники не подбирались.' }; },
    'combat-prepared': function () { return { en: 'Neutral encounter: the stat blocks are ready if things turn, but combat is never forced.', ru: 'Нейтральная встреча: характеристики наготове на случай, если всё обернётся плохо, но бой не навязывается.' }; },
    'combat-optional': function () { return { en: 'The danger can be purely environmental; these adversaries are an option if the Master wants a fight.', ru: 'Опасность может быть чисто окружающей; эти противники — вариант, если Мастер хочет бой.' }; },
    'combat-recommended': function () { return { en: 'Hostile encounter: a combat composition is recommended.', ru: 'Враждебная встреча: рекомендуется боевой состав.' }; },
    'budget': function (p) { return { en: 'Battle Points budget ' + p.available + ' (base ' + p.base + ', adjustments ' + signed(p.available - p.base) + '); composition spends ' + p.spent + '. Guidance only, not a guarantee of difficulty.', ru: 'Бюджет очков боя ' + p.available + ' (база ' + p.base + ', поправки ' + signed(p.available - p.base) + '); состав тратит ' + p.spent + '. Это ориентир, а не гарантия сложности.' }; },
    'pick-locked': function (p) { return { en: p.name + ': kept as locked by the Master.', ru: p.nameRu + ': оставлен Мастером (закреплён).' }; },
    'pick-environment': function (p) { return { en: p.name + ': listed in this environment’s Potential Adversaries.', ru: p.nameRu + ': указан среди возможных противников этого окружения.' }; },
    'pick-gm-theme': function (p) { return { en: p.name + ': fits the theme you chose (' + p.themes + ').', ru: p.nameRu + ': подходит к выбранной вами теме (' + p.themes + ').' }; },
    'pick-narrative': function (p) { return { en: p.name + ': fits the scene’s ' + p.themes + ' theme.', ru: p.nameRu + ': подходит к теме сцены (' + p.themes + ').' }; },
    'pick-filler': function (p) { return { en: p.name + ': fills a missing combat role (' + p.role + ') at the party’s tier.', ru: p.nameRu + ': закрывает недостающую боевую роль (' + p.role + ') того же ранга, что и отряд.' }; },
    'cross-tier': function (p) { return { en: p.name + ' is one tier below the party; the Battle Points lower-tier adjustment (+1) applies.', ru: p.nameRu + ' на ранг ниже отряда; действует поправка очков боя за низший ранг (+1).' }; },
    'minion-group': function (p) { return { en: p.name + ': taken as ' + p.groups + ' full Minion group(s) of ' + p.size + ' (a group equal to the party size costs 1).', ru: p.nameRu + ': ' + p.groups + ' полная группа приспешников по ' + p.size + ' (группа, равная размеру отряда, стоит 1).' }; },
    'no-environment-adversaries': function () { return { en: 'This environment lists no Potential Adversaries that resolve to the catalogue.', ru: 'В этом окружении нет возможных противников, которые нашлись бы в каталоге.' }; },
    'higher-tier-excluded': function (p) { return { en: 'Left out because they are above the party’s tier: ' + p.names + '.', ru: 'Не включены, так как их ранг выше ранга отряда: ' + p.names + '.' }; },
    'too-low-tier-excluded': function (p) { return { en: 'Left out because they are more than one tier below the party: ' + p.names + '.', ru: 'Не включены, так как их ранг ниже ранга отряда больше чем на единицу: ' + p.names + '.' }; },
    'insufficient-thematic-candidates': function (p) { return { en: 'Not enough fitting adversaries to use the whole budget (' + p.remaining + ' Battle Points left); a partial recommendation is returned instead of unrelated filler.', ru: 'Подходящих противников не хватает, чтобы потратить весь бюджет (осталось ' + p.remaining + ' очков боя); вместо посторонних «затычек» возвращён неполный состав.' }; },
    'variety-limits': function (p) { return { en: p.remaining + ' Battle Points are left unspent: the variety limits (few distinct adversaries, no large repeated groups) were reached before the budget. Add more only if you want a bigger fight.', ru: 'Неизведёнными остались ' + p.remaining + ' очков боя: достигнуты ограничения разнообразия (немного разных противников, без больших одинаковых групп). Добавляйте ещё, только если хотите более крупный бой.' }; },
    'no-encounter-theme': function () { return { en: 'This scene names no adversary theme, so none is suggested; the danger is the scene itself.', ru: 'У этой сцены нет темы противников, поэтому никто не предложен: опасность — сама сцена.' }; },
    'nothing-fits': function () { return { en: 'No candidate fits the budget for this party; nothing was recommended.', ru: 'Ни один кандидат не вписывается в бюджет этого отряда; ничего не рекомендовано.' }; },
    'no-candidates': function () { return { en: 'No thematically fitting adversary was found in the catalogue.', ru: 'В каталоге не нашлось подходящих по теме противников.' }; },
    'over-budget': function (p) { return { en: 'The locked adversaries already exceed the budget by ' + p.over + '; nothing was added.', ru: 'Закреплённые противники уже превышают бюджет на ' + p.over + '; ничего не добавлено.' }; },
    'locked-missing': function (p) { return { en: 'Locked adversary "' + p.id + '" is not in the catalogue and was ignored.', ru: 'Закреплённого противника «' + p.id + '» нет в каталоге; он проигнорирован.' }; },
    'locked-duplicate': function (p) { return { en: 'Locked adversary "' + p.id + '" was listed more than once; one entry was kept.', ru: 'Закреплённый противник «' + p.id + '» указан несколько раз; оставлена одна запись.' }; },
    'locked-higher-tier': function (p) { return { en: p.name + ' is above the party’s tier. Kept because it is locked, but Battle Points no longer describe its danger well.', ru: p.nameRu + ' выше рангом, чем отряд. Оставлен, так как закреплён, но очки боя плохо описывают его опасность.' }; },
    'locked-no-combat': function () { return { en: 'This outcome normally has no combat; the locked adversaries were kept because the Master chose them.', ru: 'Обычно этот исход обходится без боя; закреплённые противники оставлены по выбору Мастера.' }; },
    'unknown-fragment-feature': function (p) { return { en: 'Feature "' + p.name + '" is not part of this environment and was ignored.', ru: 'Особенности «' + p.name + '» нет в этом окружении; она проигнорирована.' }; },
    'party-size-clamped': function (p) { return { en: 'Party size was adjusted to ' + p.value + '.', ru: 'Размер отряда скорректирован до ' + p.value + '.' }; },
  };
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }
  function say(code, params) { return TEXT[code](params || {}); }
  function note(code, params, extra) { return Object.assign({ code: code, text: say(code, params) }, extra || {}); }

  /* ---------------- seeded randomness ---------------- */

  function seedToInt(seed) {
    var s = String(seed == null ? 0 : seed);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** mulberry32 — a tiny deterministic PRNG; same seed, same sequence. */
  function makeRng(seed) {
    var a = seedToInt(seed);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- context ---------------- */

  /** Builds the lookups once per catalogue pair. `adversaries` is the array in
   * data/prep.json; `environments` the array in data/environments.json. Pass
   * the result as `ctx` to assembleEncounter() to avoid rebuilding it. */
  function createContext(adversaries, environments, affinity) {
    var byId = new Map();
    (adversaries || []).forEach(function (a) { if (a && a.id && !byId.has(a.id)) byId.set(a.id, a); });
    return {
      adversaries: adversaries || [],
      environments: environments || [],
      adversaryById: byId,
      nameIndex: PAU.buildCatalogueNameIndex(adversaries || []),
      affinity: affinity && affinity.adversaries ? affinity : { themes: {}, adversaries: {} },
      environmentById: new Map((environments || []).filter(function (e) { return e && e.id; }).map(function (e) { return [e.id, e]; })),
    };
  }

  function nameOf(adv, lang) { return (adv.name && (adv.name[lang] || adv.name.en)) || adv.id; }

  /* ---------------- Battle Points (all arithmetic is battle-points.js) ---------------- */

  function evaluate(lines, ctx, pcs, style, partyTier) {
    var entries = lines.map(function (l) {
      var adv = ctx.adversaryById.get(l.id);
      return { type: adv.type, quantity: l.minionGroups ? l.minionGroups * pcs : l.qty };
    });
    var lowerTier = lines.some(function (l) { return ctx.adversaryById.get(l.id).tier < partyTier; });
    return BattlePoints.calculate({ pcs: pcs, entries: entries, style: style, lowerTier: lowerTier });
  }

  /** The cost of one line, taken from BattlePoints.calculate() itself. */
  function lineCost(adv, quantity, pcs) {
    var r = BattlePoints.calculate({ pcs: pcs, entries: [{ type: adv.type, quantity: quantity }] });
    return r.costLines.length ? r.costLines[0].cost : 0;
  }

  function lineQuantity(line, pcs) { return line.minionGroups ? line.minionGroups * pcs : line.qty; }

  /* ---------------- candidate pools ---------------- */

  function fragmentFeatures(env, featureNames, warnings) {
    if (!featureNames || !featureNames.length) return [];
    var features = Array.isArray(env.features) ? env.features : [];
    var out = [];
    featureNames.forEach(function (n) {
      var f = features.find(function (x) { return x && x.name && x.name.en === n; });
      if (f) out.push(f); else warnings.push(note('unknown-fragment-feature', { name: n }, { severity: 'info' }));
    });
    return out;
  }

  function textOfScene(env, fragment) {
    var parts = [env && env.lore && env.lore.en];
    var feats = fragment.length ? fragment : (Array.isArray(env && env.features) ? env.features : []);
    feats.forEach(function (f) { parts.push(f.name && f.name.en, f.description && f.description.en); });
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function fragmentMentionedNames(text, ctx) {
    var found = [];
    ctx.adversaries.forEach(function (a) {
      var n = PAU.normalizeAdversaryName(nameOf(a, 'en'));
      if (n.length < 4) return;
      var hay = ' ' + PAU.normalizeAdversaryName(text).replace(/[^\p{L}\p{N}'’-]+/gu, ' ') + ' ';
      if (hay.indexOf(' ' + n + ' ') !== -1) found.push(a.id);
    });
    return found;
  }

  /** Tier rules: same tier is preferred; one tier below is supported by the
   * Battle Guide's own lower-tier adjustment; above the party is excluded. */
  function tierRelation(advTier, partyTier) {
    if (advTier === partyTier) return 'same';
    if (advTier === partyTier - 1) return 'lower';
    if (advTier > partyTier) return 'higher';
    return 'too-low';
  }

  /* ---------------- the assembler ---------------- */

  /**
   * input: {
   *   tier: 1..4, partySize: 1..20, difficulty: 'easier'|'standard'|'harder',
   *   outcome: one of the twelve keys,
   *   environmentId | environment, featureNames?: [English feature names],
   *   locked?: [id | { id, quantity? }], seed?: string|number
   * }
   * ctx: createContext(adversaries, environments) (or those two arrays as
   *   { adversaries, environments }).
   * Pure: never mutates input or ctx, never reads or writes campaign state.
   */
  function assembleEncounter(input, ctx) {
    var inp = input || {};
    var c = ctx && ctx.adversaryById ? ctx : createContext(ctx && ctx.adversaries, ctx && ctx.environments, ctx && ctx.affinity);
    var errors = [];

    var tier = Number(inp.tier);
    if (!Number.isInteger(tier) || tier < 1 || tier > 4) errors.push({ code: 'invalid-tier', text: { en: 'Party tier must be 1, 2, 3 or 4.', ru: 'Ранг отряда должен быть 1, 2, 3 или 4.' } });
    var difficulty = inp.difficulty == null ? 'standard' : inp.difficulty;
    if (DIFFICULTIES.indexOf(difficulty) === -1) errors.push({ code: 'invalid-difficulty', text: { en: 'Difficulty must be easier, standard or harder.', ru: 'Сложность — easier, standard или harder.' } });
    var policy = OUTCOME_POLICY[inp.outcome];
    if (!policy) errors.push({ code: 'invalid-outcome', text: { en: 'Unknown Darkheart outcome.', ru: 'Неизвестный исход Darkheart.' } });
    var env = inp.environment || (c.environmentById && c.environmentById.get(inp.environmentId));
    if (!env) errors.push({ code: 'invalid-environment', text: { en: 'The selected environment is not in the catalogue.', ru: 'Выбранного окружения нет в каталоге.' } });
    if (errors.length) return { schema: SCHEMA, component: 'encounter', status: 'invalid', errors: errors, adversaries: [], warnings: [], reasoning: [] };

    var warnings = [];
    var reasoning = [];
    var gmTheme = !!(inp.scene && inp.scene.gmTheme);
    var pcs = BattlePoints.clampPcs(inp.partySize);
    if (pcs !== Number(inp.partySize)) warnings.push(note('party-size-clamped', { value: pcs }, { severity: 'info' }));
    var style = STYLE_FOR[difficulty];
    var rng = makeRng(inp.seed);

    /* ---- locked lines ---- */
    var lockedLines = [];
    var seenLocked = new Set();
    (inp.locked || []).forEach(function (raw) {
      var id = typeof raw === 'string' ? raw : raw && raw.id;
      var adv = c.adversaryById.get(id);
      if (!adv) { warnings.push(note('locked-missing', { id: id }, { severity: 'warning' })); return; }
      if (seenLocked.has(id)) { warnings.push(note('locked-duplicate', { id: id }, { severity: 'info' })); return; }
      seenLocked.add(id);
      var q = typeof raw === 'object' && Number.isInteger(raw.quantity) && raw.quantity > 0 ? raw.quantity : 1;
      lockedLines.push(adv.type === 'minion'
        ? { id: id, qty: 0, minionGroups: Math.max(1, Math.round(q / pcs)), source: 'locked', locked: true }
        : { id: id, qty: q, minionGroups: 0, source: 'locked', locked: true });
      if (adv.tier > tier) warnings.push(note('locked-higher-tier', { name: nameOf(adv, 'en'), nameRu: nameOf(adv, 'ru') }, { severity: 'warning', id: id }));
    });

    var combat = policy.combat;
    var generate = combat !== 'none';
    if (!generate && lockedLines.length) warnings.push(note('locked-no-combat', {}, { severity: 'info' }));
    reasoning.push(note(generate ? 'combat-' + combat : 'combat-none'));

    /* ---- pools ---- */
    var fragment = fragmentFeatures(env, inp.featureNames, warnings);
    var sceneText = textOfScene(env, fragment);
    var pool = new Map(); // id -> { adv, source, themes }
    var higher = [], tooLow = [];
    function consider(id, source, themes) {
      var adv = c.adversaryById.get(id);
      if (!adv || seenLocked.has(id) || pool.has(id)) return;
      var rel = tierRelation(adv.tier, tier);
      if (rel === 'higher') { higher.push(nameOf(adv, 'en')); return; }
      if (rel === 'too-low') { tooLow.push(nameOf(adv, 'en')); return; }
      if (source === 'role-filler' && rel !== 'same') return; // fillers are same tier only
      pool.set(id, { adv: adv, source: source, themes: themes || [], rel: rel });
    }

    if (generate) {
      /* The scene decides what is relevant (PD-099). `scene` = { adversaries: 'source'|'none',
       * themes: [...] } from the manifest; without it the call is a plain whole-environment one. */
      var scene = inp.scene || { adversaries: 'source', themes: [] };
      var themes = (scene.themes || []).filter(function (t) { return c.affinity.themes[t]; });
      var themeListOf = function (id) { return c.affinity.adversaries[id] || []; };
      var matches = function (id, wanted) { return themeListOf(id).some(function (t) { return wanted.indexOf(t) !== -1; }); };
      var envIds = PAU.environmentSupportedAdversaryIds(env, c.nameIndex);
      var named = fragment.length ? fragmentMentionedNames(sceneText, c) : [];

      // 1. Source adversaries, only where they stay relevant to what the scene shows.
      //    A whole environment shown with its list keeps all of it; a hidden list or a fragment
      //    keeps only what the shown text names or what the scene's own themes claim. An adversary
      //    whose source material was left out is never assumed to fit.
      var firstPick = [];
      if (!fragment.length) firstPick = scene.adversaries === 'source' ? envIds : envIds.filter(function (id) { return matches(id, themes); });
      else firstPick = named.concat(envIds.filter(function (id) { return named.indexOf(id) === -1 && matches(id, themes); }));
      firstPick.forEach(function (id) { consider(id, 'environment'); });
      if (!firstPick.length) warnings.push(note('no-environment-adversaries', {}, { severity: 'info' }));

      // 2. Catalogue adversaries the affinity layer files under the scene's themes.
      Object.keys(c.affinity.adversaries).forEach(function (id) {
        if (matches(id, themes)) consider(id, 'narrative', themeListOf(id).filter(function (t) { return themes.indexOf(t) !== -1; }));
      });

      // 3. Role fillers: related themes, same tier, only where combat is more than a possibility.
      if (!policy.thematicOnly) {
        var related = [];
        themes.forEach(function (t) { ((c.affinity.themes[t] || {}).related || []).forEach(function (r) { if (themes.indexOf(r) === -1 && related.indexOf(r) === -1) related.push(r); }); });
        Object.keys(c.affinity.adversaries).forEach(function (id) {
          if (matches(id, related)) consider(id, 'role-filler', themeListOf(id).filter(function (t) { return related.indexOf(t) !== -1; }));
        });
      }
      if (!pool.size && !themes.length && !firstPick.length) warnings.push(note('no-encounter-theme', {}, { severity: 'info' }));
      if (higher.length) warnings.push(note('higher-tier-excluded', { names: higher.slice(0, 6).join(', ') }, { severity: 'info' }));
      if (tooLow.length) warnings.push(note('too-low-tier-excluded', { names: tooLow.slice(0, 6).join(', ') }, { severity: 'info' }));
    }

    /* ---- search ---- */
    // A recommended fight for a larger party may use one more distinct adversary.
    var maxLines = Math.min(MAX_LINES, (policy.maxLines || MAX_LINES) + (combat === 'recommended' && pcs >= 5 ? 1 : 0));
    maxLines = Math.max(maxLines, lockedLines.length);
    var candidates = Array.from(pool.values());

    function violates(lines) {
      if (lines.length > maxLines) return true;
      var nonMinion = 0, groups = 0, leaders = 0, solos = 0;
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i], a = c.adversaryById.get(l.id);
        if (a.type === 'minion') groups += l.minionGroups; else nonMinion += l.qty;
        if (a.type === 'leader') leaders += l.qty;
        if (a.type === 'solo') solos += l.qty;
        if (l.locked) continue;
        if (a.type === 'minion' ? l.minionGroups > MAX_MINION_GROUPS : l.qty > MAX_QTY_NON_MINION[a.type] + (candidates.length < 3 ? 1 : 0)) return true;
      }
      if (nonMinion > pcs + 1 || groups > MAX_MINION_GROUPS) return true;
      // At most one Leader and one Solo of the Master's own choosing; locked ones are the Master's call.
      var added = lines.filter(function (l) { return !l.locked; }).map(function (l) { return c.adversaryById.get(l.id).type; });
      if (leaders > 1 && added.indexOf('leader') !== -1) return true;
      if (solos > 1 && added.indexOf('solo') !== -1) return true;
      return false;
    }

    function attempt() {
      var lines = lockedLines.map(function (l) { return Object.assign({}, l); });
      if (!generate) return lines;
      var guard = 0;
      while (guard++ < 12) {
        var current = evaluate(lines, c, pcs, style, tier);
        var roles = new Set(lines.map(function (l) { return c.adversaryById.get(l.id).type; }));
        var options = [];
        candidates.forEach(function (cand) {
          if (lines.some(function (l) { return l.id === cand.adv.id; })) return;
          var isMinion = cand.adv.type === 'minion';
          var next = lines.concat([{ id: cand.adv.id, qty: isMinion ? 0 : 1, minionGroups: isMinion ? 1 : 0, source: cand.source, themes: cand.themes, rel: cand.rel }]);
          options.push({ lines: next, weight: SOURCE_WEIGHT[cand.source] + (roles.has(cand.adv.type) ? -3 : 2) + (cand.rel === 'lower' ? -1.5 : 0) });
        });
        lines.forEach(function (l, idx) {
          if (l.locked) return;
          var next = lines.map(function (x) { return Object.assign({}, x); });
          if (next[idx].minionGroups) next[idx].minionGroups += 1; else next[idx].qty += 1;
          options.push({ lines: next, weight: SOURCE_WEIGHT[l.source] - 3 });
        });
        var best = null, bestScore = -Infinity;
        options.forEach(function (o) {
          if (violates(o.lines)) return;
          var r = evaluate(o.lines, c, pcs, style, tier);
          if (r.spent > r.available) return;
          if (r.spent <= current.spent) return;
          // prefer options that land close to the budget; jitter breaks ties reproducibly
          var score = o.weight - 1.2 * (r.available - r.spent) + rng() * 2.5;
          if (score > bestScore) { bestScore = score; best = o.lines; }
        });
        if (!best) break;
        lines = best;
      }
      return lines;
    }

    function scoreLines(lines) {
      if (!lines.length) return -Infinity;
      var r = evaluate(lines, c, pcs, style, tier);
      var roles = new Set(lines.map(function (l) { return c.adversaryById.get(l.id).type; }));
      var weights = lines.reduce(function (s, l) { return s + SOURCE_WEIGHT[l.source]; }, 0);
      var repeats = lines.filter(function (l) { return l.qty > 1 || l.minionGroups > 1; }).length;
      return 12 * (r.spent / Math.max(1, r.available)) + 0.5 * weights + 1.5 * roles.size - 2 * repeats - (r.spent > r.available ? 50 : 0);
    }

    var chosen = lockedLines.map(function (l) { return Object.assign({}, l); });
    if (generate && candidates.length) {
      var bestLines = null, bestAttemptScore = -Infinity;
      for (var k = 0; k < 40; k++) {
        var lines = attempt();
        var s = scoreLines(lines);
        if (s > bestAttemptScore) { bestAttemptScore = s; bestLines = lines; }
      }
      if (bestLines) chosen = bestLines;
    }

    /* ---- result ---- */
    var calc = evaluate(chosen, c, pcs, style, tier);
    var adversaries = chosen.map(function (l) {
      var adv = c.adversaryById.get(l.id);
      var qty = lineQuantity(l, pcs);
      var line = {
        id: adv.id,
        name: { en: nameOf(adv, 'en'), ru: nameOf(adv, 'ru') },
        tier: adv.tier,
        role: adv.type,
        quantity: qty,
        source: l.source,
        locked: !!l.locked,
        crossTier: adv.tier < tier ? 'lower' : (adv.tier > tier ? 'higher' : null),
        unitCost: lineCost(adv, 1, pcs),
        lineCost: lineCost(adv, qty, pcs),
      };
      if (adv.type === 'minion') { line.minionGroups = l.minionGroups; line.groupSize = pcs; }
      var p = { name: line.name.en, nameRu: line.name.ru, role: adv.type, themes: (l.themes || []).join(', ') };
      line.reason = say(l.source === 'locked' ? 'pick-locked' : l.source === 'environment' ? 'pick-environment' : l.source === 'narrative' ? (gmTheme ? 'pick-gm-theme' : 'pick-narrative') : 'pick-filler', p);
      return line;
    });
    adversaries.forEach(function (a) {
      reasoning.push({ code: 'pick-' + (a.source === 'role-filler' ? 'filler' : a.source), id: a.id, text: a.reason });
      if (a.crossTier === 'lower') reasoning.push(note('cross-tier', { name: a.name.en, nameRu: a.name.ru }, { id: a.id }));
      if (a.role === 'minion') reasoning.push(note('minion-group', { name: a.name.en, nameRu: a.name.ru, groups: a.minionGroups, size: a.groupSize }, { id: a.id }));
    });

    var base = calc.baseBudget;
    var modifiers = [
      { id: 'difficulty', value: calc.styleAdjustment, applied: calc.styleAdjustment !== 0 },
      { id: 'lower-tier', value: calc.lowerTierAdjustment || 1, applied: calc.lowerTierAdjustment !== 0 },
      { id: 'multiple-solos', value: -2, applied: calc.multipleSolos },
      { id: 'no-heavy-type', value: 1, applied: calc.noHeavy },
      { id: 'boosted-damage', value: -2, applied: false }, // the engine never boosts damage
    ];
    var battlePoints = {
      partySize: pcs, style: style, baseBudget: base, modifiers: modifiers,
      available: calc.available, spent: calc.spent, remaining: calc.remaining, overBudget: calc.overBudget,
      costLines: calc.costLines,
    };
    if (adversaries.length) reasoning.push(note('budget', { available: BattlePoints.formatBP(calc.available), base: base, spent: BattlePoints.formatBP(calc.spent) }));

    var status = 'complete';
    if (!generate) status = lockedLines.length ? 'complete' : 'none';
    else if (!adversaries.length) {
      status = 'empty';
      warnings.push(note(candidates.length ? 'nothing-fits' : 'no-candidates', {}, { severity: 'warning' }));
    } else if (calc.overBudget) {
      status = 'partial';
      warnings.push(note('over-budget', { over: BattlePoints.formatBP(calc.spent - calc.available) }, { severity: 'warning' }));
    } else if (calc.remaining > BUDGET_SLACK && combat !== 'prepared') {
      // Budget left over: either the thematic pool ran dry (partial) or only the variety limits stopped us.
      var usedIds = new Set(chosen.map(function (l) { return l.id; }));
      var couldFit = candidates.some(function (cand) {
        if (usedIds.has(cand.adv.id)) return false;
        var m = cand.adv.type === 'minion';
        var r = evaluate(chosen.concat([{ id: cand.adv.id, qty: m ? 0 : 1, minionGroups: m ? 1 : 0 }]), c, pcs, style, tier);
        return r.spent <= r.available;
      });
      if (couldFit) warnings.push(note('variety-limits', { remaining: BattlePoints.formatBP(calc.remaining) }, { severity: 'info' }));
      else {
        status = 'partial';
        warnings.push(note('insufficient-thematic-candidates', { remaining: BattlePoints.formatBP(calc.remaining) }, { severity: 'warning' }));
      }
    }
    if (adversaries.some(function (a) { return a.crossTier === 'lower'; }) && combat !== 'none') {
      warnings.push({ code: 'cross-tier-used', severity: 'info', text: { en: 'Includes lower-tier adversaries; check they still threaten this party.', ru: 'В составе есть противники низшего ранга; проверьте, что они всё ещё угрожают отряду.' } });
    }

    return {
      schema: SCHEMA,
      component: 'encounter',
      status: status,
      input: {
        tier: tier, partySize: pcs, difficulty: difficulty, outcome: inp.outcome,
        environmentId: env.id, featureNames: fragment.map(function (f) { return f.name.en; }),
        seed: inp.seed == null ? null : inp.seed,
        locked: lockedLines.map(function (l) { return l.id; }),
      },
      combat: combat,
      adversaries: adversaries,
      battlePoints: battlePoints,
      reasoning: reasoning,
      warnings: warnings,
      builder: encounterBuilderEntries({ adversaries: adversaries }, c),
    };
  }

  /* ---------------- "Open in Encounter Builder" ---------------- */

  /** The flat, FreshCutGrass-ready view of a result: canonical English names
   * (the catalogue's own spelling, which is what FreshCutGrass recognizes) and
   * quantities. A name the supported index does not hold is reported, never
   * sent. */
  function encounterBuilderEntries(result, ctx) {
    var index = FCG.buildSupportedAdversaryIndex(ctx.adversaries);
    var entries = [], unsupported = [];
    (result.adversaries || []).forEach(function (a) {
      var name = FCG.isFreshCutGrassSupported(a.name.en, index) ? a.name.en : null;
      if (name) entries.push({ id: a.id, name: name, quantity: a.quantity });
      else unsupported.push(a.id);
    });
    return { entries: entries, unsupported: unsupported };
  }

  /** The Encounter Builder URL for a result, through the app's single encoder
   * (FreshCutGrassUtils). null when there is nothing to send. */
  function encounterBuilderUrl(result, encounterName, ctx) {
    var b = encounterBuilderEntries(result, ctx);
    if (!b.entries.length) return null;
    return FCG.buildFreshCutGrassEncounterUrl(
      encounterName,
      b.entries.map(function (e) { return e.name; }),
      b.entries.map(function (e) { return e.quantity; }),
    );
  }

  return {
    SCHEMA: SCHEMA,
    OUTCOME_POLICY: OUTCOME_POLICY,
    OUTCOME_KEYS: OUTCOME_KEYS,
    DIFFICULTIES: DIFFICULTIES,
    createContext: createContext,
    assembleEncounter: assembleEncounter,
    encounterBuilderEntries: encounterBuilderEntries,
    encounterBuilderUrl: encounterBuilderUrl,
  };
});
