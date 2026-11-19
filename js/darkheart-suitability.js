/* ============================================================
   Bacchus's Atlas — darkheart-suitability.js
   Which environments may serve a Darkheart traversal outcome, decided by the
   PLACE and not by what its source text happens to mention (PD-104).

   The model has four separate responsibilities:
     Environment   — location, atmosphere, terrain, source features. Judged here,
                     from explicit character tags in data/darkheart-suitability.json.
     Outcome       — the situation and its Darkheart rule (js/darkheart-expedition.js).
     Participants  — NPCs and thematic adversaries, generated separately
                     (js/darkheart-npc.js, js/darkheart-encounter.js).
     GM guidance   — optional suggestions tying the two to the place
                     (js/darkheart-guidance.js).

   An environment needs no written resource, enemy, NPC, campfire or countdown to
   serve an outcome. What it needs is the right character: each outcome has a small
   rule over the tags (`any` of these, `none` of those), which keeps the thematic
   limits explainable. Nothing here is a keyword scan of environment text; a
   per-outcome `overrides` record is the explicit, reasoned exception.

   Pure, deterministic and dependency-free (no DOM, storage, fs or network).
   Catalogue records are never edited: a scene is synthesised at this adaptation
   boundary and refers to its environment by id.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DarkheartSuitability = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var B = function (en, ru) { return { en: en, ru: ru }; };

  /* The vocabulary of a place's character. Each is a plain statement about the
   * location, never about a creature the source may list. */
  var TAG_LABELS = {
    wild:     B('wild ground', 'дикая местность'),
    outlaw:   B('outlaw haunt', 'логово разбойников'),
    haunted:  B('haunted', 'нечистое место'),
    fey:      B('fey', 'волшебное место'),
    dark:     B('ominous', 'зловещее'),
    serene:   B('calm', 'спокойное'),
    refuge:   B('shelter', 'приют'),
    lair:     B('a lair', 'логово'),
    ruin:     B('ruined or abandoned', 'руины или запустение'),
    folk:     B('people pass or live here', 'здесь бывают люди'),
    hard:     B('hard going', 'трудный путь'),
    deadly:   B('severe terrain', 'опасная местность'),
    bog:      B('marsh or mire', 'трясина'),
    water:    B('water crossing', 'переправа'),
    fire:     B('fire', 'огонь'),
    uncanny:  B('uncanny', 'странное место'),
    tragic:   B('marked by loss', 'отмечено утратой'),
    crisis:   B('a crisis already under way', 'кризис уже идёт'),
  };
  var TAGS = Object.keys(TAG_LABELS);

  /* The twelve outcomes' environment rules. `any`: the place must carry at least one of these tags
   * ('*' = any profiled place); `none`: and none of these; `travel`: a traversal-type environment also
   * qualifies. The contract column in docs/data-contracts/darkheart-suitability.md states each in words. */
  var OUTCOME_RULES = {
    'creature-fail-fear':    { any: ['wild', 'outlaw', 'haunted', 'lair', 'deadly'], none: ['refuge', 'serene'] },
    'creature-fail-hope':    { any: ['folk', 'fey', 'wild', 'outlaw', 'refuge', 'serene', 'lair', 'ruin'], none: ['deadly', 'crisis'] },
    'creature-success-fear': { any: ['wild', 'hard', 'deadly', 'bog', 'fire', 'ruin', 'haunted', 'lair', 'outlaw', 'crisis'], none: ['refuge', 'serene'] },
    'creature-success-hope': { any: ['folk', 'fey', 'serene', 'refuge', 'wild', 'ruin', 'tragic'], none: ['deadly', 'crisis'] },
    'landmark-fail-fear':    { any: ['dark', 'haunted'], none: ['refuge'] },
    'landmark-fail-hope':    { any: ['ruin', 'haunted', 'tragic'], none: ['crisis'] },
    'landmark-success-fear': { any: '*', none: [] },
    'landmark-success-hope': { any: ['serene', 'refuge', 'folk', 'fey', 'wild', 'ruin', 'bog', 'hard', 'uncanny'], none: ['dark', 'deadly', 'haunted', 'crisis', 'lair', 'outlaw'] },
    'hazard-fail-fear':      { any: ['deadly', 'hard', 'bog', 'fire', 'water'], none: ['refuge', 'serene'], travel: true },
    'hazard-fail-hope':      { any: ['hard', 'bog', 'wild', 'fire', 'uncanny', 'water', 'deadly'], none: ['refuge', 'serene'], travel: true },
    'resource-success-fear': { any: ['ruin', 'lair', 'wild', 'fey', 'haunted', 'outlaw'], none: ['refuge', 'serene', 'crisis'] },
    'resource-success-hope': { any: ['wild', 'ruin', 'serene', 'fey', 'folk', 'bog', 'haunted', 'hard', 'tragic', 'refuge', 'uncanny'], none: ['deadly', 'crisis'] },
  };
  var OUTCOME_KEYS = Object.keys(OUTCOME_RULES);

  /* Outcomes that bring generated participants into the scene (an NPC, a roster). A source feature
   * that names its own creatures is adapted for these (featurePlan). */
  var PARTICIPANT_OUTCOMES = ['creature-fail-fear', 'creature-fail-hope', 'creature-success-fear', 'creature-success-hope', 'resource-success-fear'];

  var OVERRIDE_MODES = ['add', 'remove'];
  var EXCLUSION_CATEGORIES = ['home-base', 'war-scale', 'not-a-place', 'urban', 'interior', 'planar', 'terrain'];

  /* ---------------- adversary themes ---------------- */

  /* What a place's tags suggest about WHO belongs there, as themes of data/darkheart-affinity.json.
   * A place with no such tag suggests none; the Master may still choose a theme. */
  var TAG_THEMES = { wild: ['beasts'], bog: ['vermin'], haunted: ['undead'], ruin: ['undead'], fey: ['sylvan'], outlaw: ['outlaws'], hard: ['sylvan'], water: ['beasts'] };
  var NEUTRAL_THEMES = ['beasts', 'sylvan', 'outlaws', 'folk'];     // never undead, vermin or demons: a neutral group is not a horror
  var NEUTRAL_FOLK_TAGS = ['folk', 'refuge', 'serene', 'ruin', 'outlaw', 'lair'];

  function tagSet(profile) { return new Set((profile && profile.tags) || []); }

  function unique(list) { return list.filter(function (x, i) { return list.indexOf(x) === i; }); }

  /** The adversary themes for this place and outcome (only ids in `known`, when given). */
  function themesFor(profile, outcome, known) {
    var tags = (profile && profile.tags) || [];
    var out = [];
    var own = profile && Array.isArray(profile.themes) && profile.themes.length ? profile.themes.slice() : null;
    if (outcome === 'creature-fail-hope') {
      tags.forEach(function (t) { (TAG_THEMES[t] || []).forEach(function (th) { if (NEUTRAL_THEMES.indexOf(th) !== -1) out.push(th); }); });
      // Prefer humanoid or socially interactive groups where the place supports them; a preference, not a restriction.
      if (tags.some(function (t) { return NEUTRAL_FOLK_TAGS.indexOf(t) !== -1; }) || !out.length) out.unshift('folk');
      if (own) out = own.filter(function (x) { return NEUTRAL_THEMES.indexOf(x) !== -1; }).concat(['folk']);
    } else {
      tags.forEach(function (t) { (TAG_THEMES[t] || []).forEach(function (th) { out.push(th); }); });
      if (own) out = own;
      if (!out.length) out = ['beasts'];
    }
    out = unique(out).slice(0, 3);
    return known ? out.filter(function (t) { return known.indexOf(t) !== -1; }) : out;
  }

  /* ---------------- NPC situations ---------------- */

  /* In-peril and side-quest situations that fit a place's character (js/darkheart-npc.js SITUATIONS keys).
   * Order is a preference; the NPC's own seed picks among them, so a regenerated NPC varies without leaving the place. */
  var PERIL_BY_TAG = { bog: 'bog', water: 'bog', fire: 'fire', ruin: 'collapse', hard: 'roots', wild: 'beast', lair: 'snare', outlaw: 'snare', haunted: 'spirit', dark: 'lost', uncanny: 'lost', deadly: 'lost' };
  var QUEST_BY_TAG = { ruin: ['lost-item', 'missing-person'], wild: ['missing-person', 'lost-item'], haunted: ['curse', 'missing-person'], dark: ['curse', 'missing-person'], fey: ['lost-item', 'message'], serene: ['lost-item', 'message'], folk: ['message', 'missing-person'], refuge: ['message', 'errand'], tragic: ['missing-person', 'lost-item'], hard: ['missing-person'], bog: ['missing-person', 'lost-item'] };

  function npcSituations(profile, role) {
    var tags = (profile && profile.tags) || [];
    var out = [];
    if (role === 'in-peril') {
      tags.forEach(function (t) { if (PERIL_BY_TAG[t]) out.push(PERIL_BY_TAG[t]); });
      if (!out.length) out = ['lost', 'beast'];
    } else if (role === 'side-quest') {
      tags.forEach(function (t) { (QUEST_BY_TAG[t] || []).forEach(function (s) { out.push(s); }); });
      if (!out.length) out = ['lost-item', 'missing-person', 'message'];
    } else if (role === 'neutral-creature') {
      // The neutral group's own manner follows the place: a hunter in wild ground, a toll in a crossroads, a watch in a ruin.
      if (tags.indexOf('wild') !== -1) out.push('hunting');
      if (tags.indexOf('folk') !== -1 || tags.indexOf('outlaw') !== -1) out.push('bargain');
      if (tags.indexOf('ruin') !== -1 || tags.indexOf('lair') !== -1 || tags.indexOf('haunted') !== -1) out.push('guarding');
      if (tags.indexOf('dark') !== -1 || tags.indexOf('deadly') !== -1) out.push('fleeing');
      if (!out.length) out = ['guarding', 'bargain'];
    }
    return unique(out);
  }

  /* ---------------- eligibility ---------------- */

  function override(data, envId, outcome) {
    var found = null;
    ((data && data.overrides) || []).forEach(function (o) { if (o.envId === envId && o.outcome === outcome) found = o; });
    return found;
  }

  /**
   * Whether this place suits `outcome`.
   *   data: the parsed data/darkheart-suitability.json   env: the catalogue record
   * Returns { ok, via }, via being 'rule' (the tag rule), 'override' (an explicit record) or null.
   */
  function suits(data, env, outcome) {
    var rule = OUTCOME_RULES[outcome];
    var profile = data && data.profiles && data.profiles[env.id];
    if (!rule || !profile) return { ok: false, via: null };
    var o = override(data, env.id, outcome);
    if (o) return { ok: o.mode === 'add', via: 'override' };
    var tags = tagSet(profile);
    var hit = rule.any === '*' || rule.any.some(function (t) { return tags.has(t); }) || (rule.travel === true && env.type === 'traversal');
    var blocked = rule.none.some(function (t) { return tags.has(t); });
    return { ok: hit && !blocked, via: hit && !blocked ? 'rule' : null };
  }

  /** Every outcome this place suits, in the vocabulary's order. */
  function suitedOutcomes(data, env) { return OUTCOME_KEYS.filter(function (o) { return suits(data, env, o).ok; }); }

  /* ---------------- scene synthesis ---------------- */

  var TITLES = {
    'creature-fail-fear':    function (n) { return B(n.en + ' — hostile ground', n.ru + ' — враждебные земли'); },
    'creature-fail-hope':    function (n) { return B(n.en + ' — a formidable meeting', n.ru + ' — грозная, но не враждебная встреча'); },
    'creature-success-fear': function (n) { return B(n.en + ' — someone in peril', n.ru + ' — кто-то в беде'); },
    'creature-success-hope': function (n) { return B(n.en + ' — a stranger with a request', n.ru + ' — незнакомец с просьбой'); },
    'landmark-fail-fear':    function (n) { return B(n.en + ' — an ominous place', n.ru + ' — зловещее место'); },
    'landmark-fail-hope':    function (n) { return B(n.en + ' — a place of loss', n.ru + ' — место утраты'); },
    'landmark-success-fear': function (n) { return B(n.en + ' — a warning ahead', n.ru + ' — предостережение впереди'); },
    'landmark-success-hope': function (n) { return B(n.en + ' — the Traveler’s campfire', n.ru + ' — костёр Путника'); },
    'hazard-fail-fear':      function (n) { return B(n.en + ' — a deadly passage', n.ru + ' — смертельный путь'); },
    'hazard-fail-hope':      function (n) { return B(n.en + ' — an obstacle in the way', n.ru + ' — препятствие на пути'); },
    'resource-success-fear': function (n) { return B(n.en + ' — a guarded find', n.ru + ' — охраняемая находка'); },
    'resource-success-hope': function (n) { return B(n.en + ' — a useful discovery', n.ru + ' — полезная находка'); },
  };
  var SUMMARIES = {
    'creature-fail-fear':    B('The place suits an opposition that wants the party gone: a hostile encounter, built from the participants below.', 'Место подходит для противника, который хочет избавиться от отряда: враждебная встреча из участников ниже.'),
    'creature-fail-hope':    B('The place suits a meeting with a neutral but formidable party. Nothing forces a fight; the encounter below is only what the Master may need.', 'Место подходит для встречи с нейтральной, но грозной силой. Бой не навязан; встреча ниже — лишь то, что может понадобиться Мастеру.'),
    'creature-success-fear': B('Someone has run into trouble here, and the place is the trouble. The NPC below is in immediate peril.', 'Здесь кто-то попал в беду, и беда — само место. NPC ниже в непосредственной опасности.'),
    'creature-success-hope': B('The place suits an NPC encounter. The character below has a request or side quest that points back into it.', 'Место подходит для встречи с NPC. У персонажа ниже просьба или побочное задание, ведущее обратно в это место.'),
    'landmark-fail-fear':    B('A landmark that unsettles: the party reads the place as a dark omen, and rest is denied.', 'Приметное место, от которого тревожно: отряд читает его как дурное предзнаменование, отдых невозможен.'),
    'landmark-fail-hope':    B('A landmark of loss or abandonment: the party works out what happened here.', 'Приметное место утраты или запустения: отряд выясняет, что здесь произошло.'),
    'landmark-success-fear': B('A landmark that warns: signs of a danger still to come, with no attack yet.', 'Приметное место-предостережение: знаки грядущей опасности, но нападения ещё нет.'),
    'landmark-success-hope': B('A calm landmark where the Traveler’s magical campfire can be found, and a safe rest taken.', 'Спокойное приметное место, где можно найти магический костёр Путника и безопасно отдохнуть.'),
    'hazard-fail-fear':      B('The way through is a deadly environmental threat. Use the place’s own terrain to present it.', 'Путь вперёд — смертельная угроза среды. Подайте её через рельеф самого места.'),
    'hazard-fail-hope':      B('The way is blocked by an inconvenient but surmountable obstacle in the place’s own terrain.', 'Путь перегорожен неудобным, но преодолимым препятствием из рельефа самого места.'),
    'resource-success-fear': B('Something useful lies here, and something guards it: a creature, or the place itself. A guard is not a fight until the party provokes it.', 'Здесь лежит нечто полезное, и его что-то охраняет: существо или само место. Охрана — ещё не бой, пока отряд её не потревожит.'),
    'resource-success-hope': B('Something useful can be found here, plainly and without a guard: loot, a boon, or a quest clue.', 'Здесь можно просто найти нечто полезное, без охраны: добычу, дар или зацепку для задания.'),
  };

  function sceneIdFor(envId) { return 'suit-' + envId; }

  /** Per-outcome encounter wiring for a derived entry: the themes, and whether the environment's own
   * Potential Adversaries list is a candidate (hostile opposition only; otherwise the themes decide). */
  function encounterEntry(profile, outcome, known) {
    return { themes: themesFor(profile, outcome, known), adversaries: outcome === 'creature-fail-fear' ? 'source' : 'none' };
  }

  /**
   * One synthesised scene per environment, covering only the outcomes `skip` has no authored scene for.
   *   ctx: { environments, affinityThemes?, covered?: Map(envId -> Set(outcome)) }  (covered = outcomes the authored scenes already map)
   * A derived scene is a whole-environment scene (no features/excluded; the source is shown untouched)
   * with `derived: true`, `match: 'suitable'`; each outcome entry carries its own framing and encounter wiring.
   */
  function buildScenes(data, ctx) {
    var envs = (ctx && ctx.environments) || [];
    var covered = (ctx && ctx.covered) || new Map();
    var known = ctx && ctx.affinityThemes;
    var scenes = [];
    envs.forEach(function (env) {
      var profile = data && data.profiles && data.profiles[env.id];
      if (!profile) return;
      var have = covered.get(env.id) || new Set();
      var outcomes = suitedOutcomes(data, env).filter(function (o) { return !have.has(o); });
      if (!outcomes.length) return;
      scenes.push({
        id: sceneIdFor(env.id), envId: env.id, match: 'suitable', status: 'approved', derived: true, terrain: 'any',
        adversaries: 'none', profile: profile,
        outcomes: outcomes.map(function (o) {
          return { outcome: o, framing: { title: TITLES[o](env.name), summary: SUMMARIES[o] }, encounter: encounterEntry(profile, o, known), via: suits(data, env, o).via };
        }),
      });
    });
    return scenes;
  }

  /* ---------------- source features in an active scene ---------------- */

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Catalogue adversaries (by id) whose English name appears in `text`, singular or plural. */
  function namedAdversaries(text, adversaries) {
    var hay = String(text || '');
    var ids = [];
    (adversaries || []).forEach(function (a) {
      var n = a && a.name && a.name.en;
      if (!n || n.length < 3) return;
      if (new RegExp('\\b' + escapeRe(n) + '(?:s|es)?\\b', 'i').test(hay)) ids.push(a.id);
    });
    return ids;
  }

  /**
   * How an environment's own features read in an active derived scene for `outcome`.
   *   env, outcome, adversaries (the catalogue), rosterIds (ids of the generated encounter's adversaries, optional)
   * Returns { active: [feature…], adapted: [{ feature, reason: 'actors', actors: [ids] }…] }.
   *
   * Active features are the source text as printed (a source feature's own check results are ordinary text and stay).
   * Only a feature that names catalogue adversaries other than the generated participants is NOT shown as an
   * instruction: the scene shows an adapted line in its place and the original wording stays, untouched, under
   * "Source & Adaptation".
   */
  function featurePlan(env, outcome, adversaries, rosterIds) {
    var roster = new Set(rosterIds || []);
    var participants = PARTICIPANT_OUTCOMES.indexOf(outcome) !== -1;
    var active = [], adapted = [];
    ((env && env.features) || []).forEach(function (f) {
      var text = (f.name && f.name.en ? f.name.en + ' ' : '') + ((f.description && f.description.en) || '');
      if (participants) {
        var actors = namedAdversaries(text, adversaries);
        var foreign = actors.filter(function (id) { return !roster.has(id); });
        if (foreign.length) { adapted.push({ feature: f, reason: 'actors', actors: foreign }); return; }
      }
      active.push(f);
    });
    return { active: active, adapted: adapted };
  }

  /* ---------------- validation ---------------- */

  /**
   * data/darkheart-suitability.json against the catalogue.
   *   ctx: { environments, affinityThemes? }
   * Returns { problems: [{ severity, path, message, code, id }], coverage }.
   */
  function analyze(data, ctx) {
    var problems = [];
    var add = function (severity, path, message, code, id) { problems.push({ severity: severity, path: path, message: message, code: code, id: id == null ? null : String(id) }); };
    var envs = (ctx && ctx.environments) || [];
    var byId = new Map(envs.map(function (e) { return [e.id, e]; }));
    var themes = ctx && ctx.affinityThemes;
    var coverage = { profiles: 0, exclusions: 0, overrides: 0, byOutcome: {}, environments: envs.length };
    if (!data || typeof data !== 'object' || Array.isArray(data)) { add('error', '$', 'The suitability file must be a JSON object.', 'shape'); return { problems: problems, coverage: coverage }; }
    var allowedTop = ['_comment', 'schema', 'profiles', 'exclusions', 'overrides'];
    Object.keys(data).forEach(function (k) { if (allowedTop.indexOf(k) === -1) add('error', '$.' + k, 'Unknown key "' + k + '".', 'unknown-key'); });
    if (data.schema !== 1) add('error', '$.schema', 'Unsupported schema ' + JSON.stringify(data.schema) + ' (expected 1).', 'schema');
    var profiles = data.profiles && typeof data.profiles === 'object' && !Array.isArray(data.profiles) ? data.profiles : null;
    if (!profiles) { add('error', '$.profiles', 'profiles must be an object keyed by environment id.', 'shape'); profiles = {}; }

    Object.keys(profiles).forEach(function (id) {
      var p = '$.profiles.' + id, prof = profiles[id];
      coverage.profiles += 1;
      if (!byId.has(id)) { add('error', p, 'Unknown environment id "' + id + '".', 'unknown-env', id); return; }
      if (!prof || typeof prof !== 'object' || Array.isArray(prof)) { add('error', p, 'A profile must be an object.', 'shape', id); return; }
      Object.keys(prof).forEach(function (k) { if (['tags', 'themes'].indexOf(k) === -1) add('error', p + '.' + k, 'Unknown key "' + k + '".', 'unknown-key', id); });
      if (!Array.isArray(prof.tags) || prof.tags.length < 2 || prof.tags.length > 6) add('error', p + '.tags', 'A profile needs between 2 and 6 character tags.', 'tags', id);
      else {
        prof.tags.forEach(function (t) { if (TAGS.indexOf(t) === -1) add('error', p + '.tags', 'Unknown tag "' + t + '" (allowed: ' + TAGS.join(', ') + ').', 'tags', id); });
        if (new Set(prof.tags).size !== prof.tags.length) add('error', p + '.tags', 'Repeated tag.', 'tags', id);
      }
      if (prof.themes !== undefined) {
        if (!Array.isArray(prof.themes) || !prof.themes.length) add('error', p + '.themes', 'themes must be a non-empty array of affinity theme ids.', 'themes', id);
        else if (themes) prof.themes.forEach(function (t) { if (themes.indexOf(t) === -1) add('error', p + '.themes', 'Unknown affinity theme "' + t + '".', 'themes', id); });
      }
    });

    var excluded = new Set();
    (Array.isArray(data.exclusions) ? data.exclusions : []).forEach(function (x, i) {
      var p = '$.exclusions[' + i + ']';
      coverage.exclusions += 1;
      if (!x || typeof x !== 'object') { add('error', p, 'Exclusion must be an object.', 'shape'); return; }
      Object.keys(x).forEach(function (k) { if (['envId', 'category', 'reason'].indexOf(k) === -1) add('error', p + '.' + k, 'Unknown key "' + k + '".', 'unknown-key'); });
      if (!byId.has(x.envId)) add('error', p + '.envId', 'Unknown environment id "' + x.envId + '".', 'unknown-env', x.envId);
      if (EXCLUSION_CATEGORIES.indexOf(x.category) === -1) add('error', p + '.category', 'Unknown exclusion category "' + x.category + '".', 'exclusion', x.envId);
      if (typeof x.reason !== 'string' || x.reason.trim().length < 12) add('error', p + '.reason', 'An exclusion needs a reason a reviewer can read.', 'exclusion', x.envId);
      if (profiles[x.envId]) add('error', p, 'Environment "' + x.envId + '" is both profiled and excluded.', 'exclusion-conflict', x.envId);
      if (excluded.has(x.envId)) add('error', p, 'Environment "' + x.envId + '" is excluded twice.', 'exclusion-conflict', x.envId);
      excluded.add(x.envId);
    });

    var seenOverride = new Set();
    (Array.isArray(data.overrides) ? data.overrides : []).forEach(function (o, i) {
      var p = '$.overrides[' + i + ']';
      coverage.overrides += 1;
      if (!o || typeof o !== 'object') { add('error', p, 'Override must be an object.', 'shape'); return; }
      Object.keys(o).forEach(function (k) { if (['envId', 'outcome', 'mode', 'reason'].indexOf(k) === -1) add('error', p + '.' + k, 'Unknown key "' + k + '".', 'unknown-key'); });
      if (!profiles[o.envId]) add('error', p + '.envId', 'An override needs a profiled environment ("' + o.envId + '" is not).', 'override', o.envId);
      if (OUTCOME_KEYS.indexOf(o.outcome) === -1) add('error', p + '.outcome', 'Unknown outcome "' + o.outcome + '".', 'override', o.envId);
      if (OVERRIDE_MODES.indexOf(o.mode) === -1) add('error', p + '.mode', 'mode must be add or remove.', 'override', o.envId);
      if (typeof o.reason !== 'string' || o.reason.trim().length < 12) add('error', p + '.reason', 'An override needs a reason a reviewer can read.', 'override', o.envId);
      var key = o.envId + '|' + o.outcome;
      if (seenOverride.has(key)) add('error', p, 'Duplicate override for ' + key + '.', 'override', o.envId);
      seenOverride.add(key);
      // An override that merely restates the rule is noise.
      var env = byId.get(o.envId);
      if (env && profiles[o.envId] && OUTCOME_RULES[o.outcome]) {
        var viaRule = suits({ profiles: profiles, overrides: [] }, env, o.outcome).ok;
        if ((o.mode === 'add') === viaRule) add('warning', p, 'This override repeats what the rule already decides for "' + o.envId + '"; remove it.', 'override-redundant', o.envId);
      }
    });

    // Terrain: every forest-tagged environment is a decision, never an accident.
    envs.forEach(function (e) {
      if ((e.biomes || []).indexOf('forest') !== -1 && !profiles[e.id] && !excluded.has(e.id)) add('error', '$.profiles', 'Forest environment "' + e.id + '" has neither a profile nor an exclusion.', 'forest-unreviewed', e.id);
    });

    OUTCOME_KEYS.forEach(function (o) { coverage.byOutcome[o] = envs.filter(function (e) { return profiles[e.id] && suits(data, e, o).ok; }).length; });
    return { problems: problems, coverage: coverage };
  }

  return {
    TAGS: TAGS, TAG_LABELS: TAG_LABELS, OUTCOME_RULES: OUTCOME_RULES, OUTCOME_KEYS: OUTCOME_KEYS, PARTICIPANT_OUTCOMES: PARTICIPANT_OUTCOMES,
    EXCLUSION_CATEGORIES: EXCLUSION_CATEGORIES, OVERRIDE_MODES: OVERRIDE_MODES,
    suits: suits, suitedOutcomes: suitedOutcomes, themesFor: themesFor, npcSituations: npcSituations,
    buildScenes: buildScenes, sceneIdFor: sceneIdFor, featurePlan: featurePlan, namedAdversaries: namedAdversaries, analyze: analyze,
  };
});
