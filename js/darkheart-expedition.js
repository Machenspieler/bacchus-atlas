/* ============================================================
   Bacchus's Atlas — darkheart-expedition.js
   Pure, dependency-free model of a Darkheart Forest expedition: the party,
   the GM's Fear, the Forest Difficulty, one Wayfinder roll, and every command
   that changes them. No DOM, no storage, no clock, no randomness — the view
   (js/darkheart-view.js) holds the dice the Master types and calls these
   functions; js/safe-storage.js persists the result.

   The mechanics are the printed Darkheart Hexcrawl's and the standard
   Duality Dice rules (docs/product-decisions.md PD-099):
   - the Wayfinder makes an action roll, Hope d12 + Fear d12 + modifier, against
     the Forest Difficulty (FD): it succeeds on a total of at least FD, or on
     matching dice (a critical success);
   - "with Hope" is a higher Hope die, "with Fear" a higher Fear die; matching
     dice are a success with Hope, and keep their parity;
   - parity of the two dice picks the category: both odd Creature, both even
     Landmark, mixed Hazard on a failure or Resource on a success;
   - arriving at a new hex raises FD by 1; FD never falls below 15 and at 30 the
     party is trapped for all eternity;
   - a Landmark of a failed roll costs +2 FD (fail with Fear) or +1 FD (fail
     with Hope), or the same number of GM Fear instead (the players choose).

   Rolling is a pure PREVIEW. Only confirmArrival() changes the campaign, and it
   cannot be applied twice: it consumes the dice, so a second call has nothing
   to confirm. Every committed change keeps the state before it, so undo() is
   exact. Every function returns a new state; none mutates its argument.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.DarkheartExpedition = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA = 1;
  var FD_START = 15;
  var FD_TRAPPED = 30;
  var FEAR_MAX = 12;       // the GM's Fear pool in Daggerheart holds at most 12 tokens
  var DIE_MAX = 12;
  var MOD_MIN = -20, MOD_MAX = 20;
  var HEROES_MIN = 1, HEROES_MAX = 8;
  var UNDO_LIMIT = 20;
  var LOG_LIMIT = 40;

  var DIFFICULTIES = ['easier', 'standard', 'harder'];

  /* ---------------- the authoritative encounter rules ---------------- */

  /* The twelve outcomes' Darkheart text. This is the book's own rule, shown
   * apart from any environment text and never altered by a scene. `rest`:
   *   normal | none (cannot rest) | no-fd-reduction | one-move | safe
   * `penalty` is the +FD (or +Fear, the players choose) a Landmark costs.
   * `countdown` is shown as the rule prints it. */
  var OUTCOME_RULES = {
    'creature-fail-fear':    { category: 'creature', rest: 'normal', penalty: 0, countdown: null,
      title: { en: 'Hostile adversary', ru: 'Враждебный противник' },
      rule: { en: 'A hostile and deadly Adversary (or Adversaries) lurks here.', ru: 'Здесь затаился враждебный и смертельно опасный противник (или несколько).' } },
    'creature-fail-hope':    { category: 'creature', rest: 'normal', penalty: 0, countdown: null,
      title: { en: 'Neutral but formidable adversary', ru: 'Нейтральный, но грозный противник' },
      rule: { en: 'They cross paths with a neutral but formidable Adversary (or Adversaries).', ru: 'Отряд пересекается с нейтральным, но грозным противником (или несколькими).' } },
    'creature-success-fear': { category: 'creature', rest: 'normal', penalty: 0, countdown: null,
      title: { en: 'An NPC in peril', ru: 'NPC в беде' },
      rule: { en: 'An NPC is in peril and will perish if the party doesn’t intervene quickly.', ru: 'NPC в беде и погибнет, если отряд не вмешается быстро.' } },
    'creature-success-hope': { category: 'creature', rest: 'normal', penalty: 0, countdown: null,
      title: { en: 'An NPC with a side quest', ru: 'NPC с побочным заданием' },
      rule: { en: 'An NPC needs assistance with a task and has a side quest.', ru: 'NPC нужна помощь с одним делом: у него есть побочное задание.' } },
    'landmark-fail-fear':    { category: 'landmark', rest: 'none', penalty: 2, countdown: null,
      title: { en: 'A dark omen', ru: 'Дурное знамение' },
      rule: { en: 'A dark omen casts a shadow on this place (+2 Forest Difficulty, or the GM gains 2 additional Fear; the players choose). You cannot rest here.', ru: 'Дурное знамение бросает тень на это место (+2 к Сложности леса или Мастер получает 2 дополнительных Страха — выбирают игроки). Здесь нельзя отдыхать.' } },
    'landmark-fail-hope':    { category: 'landmark', rest: 'no-fd-reduction', penalty: 1, countdown: null,
      title: { en: 'A tragic place', ru: 'Трагичное место' },
      rule: { en: 'Something tragic happened here (+1 Forest Difficulty, or the GM gains 1 additional Fear). The Forest Difficulty cannot be reduced while resting here.', ru: 'Здесь случилось нечто трагичное (+1 к Сложности леса или Мастер получает 1 дополнительный Страх). Пока отряд отдыхает здесь, Сложность леса снизить нельзя.' } },
    'landmark-success-fear': { category: 'landmark', rest: 'one-move', penalty: 0, countdown: null,
      title: { en: 'Danger foreshadowed', ru: 'Предвестие опасности' },
      rule: { en: 'This place foreshadows danger ahead. You may rest here, but can only take 1 downtime move.', ru: 'Это место предвещает опасность впереди. Здесь можно отдохнуть, но только с 1 Ходом Отдыха.' } },
    'landmark-success-hope': { category: 'landmark', rest: 'safe', penalty: 0, countdown: null,
      title: { en: 'A Traveler’s campfire', ru: 'Костёр Путника' },
      rule: { en: 'A light in the darkness. You find a Traveler’s magic campfire. You can rest here without fear.', ru: 'Свет во тьме. Вы находите волшебный костёр Путника. Здесь можно спокойно отдохнуть.' } },
    'hazard-fail-fear':      { category: 'hazard', rest: 'normal', penalty: 0, countdown: '6',
      title: { en: 'A deadly hazard', ru: 'Смертельная опасность' },
      rule: { en: 'A deadly hazard with a Countdown 6 must be avoided to continue the journey. When triggered, the players must either take severe damage and continue to the next hex, or retreat to Bastion.', ru: 'Смертельную опасность с Отсчётом 6 нужно обойти, чтобы продолжить путь. Когда Отсчёт сработает, игроки либо получают тяжёлый урон и идут в следующий гекс, либо отступают в Бастион.' } },
    'hazard-fail-hope':      { category: 'hazard', rest: 'normal', penalty: 0, countdown: '3',
      title: { en: 'An obstacle', ru: 'Препятствие' },
      rule: { en: 'An inconvenient obstacle with a Countdown 3 must be avoided to continue the journey. When triggered, the players must either take minor damage and continue to the next hex, or retreat to a Landmark already cleared during this expedition.', ru: 'Неудобное препятствие с Отсчётом 3 нужно обойти, чтобы продолжить путь. Когда Отсчёт сработает, игроки либо получают лёгкий урон и идут в следующий гекс, либо отступают к Ориентиру, уже расчищенному в этой экспедиции.' } },
    'resource-success-fear': { category: 'resource', rest: 'normal', penalty: 0, countdown: '1d6',
      title: { en: 'A guarded resource', ru: 'Охраняемый ресурс' },
      rule: { en: 'Something useful lies guarded by a creature or hazard (Countdown 1d6) that must first be dealt with.', ru: 'Нечто полезное охраняет существо или опасность (Отсчёт 1d6), с которыми нужно сначала разобраться.' } },
    'resource-success-hope': { category: 'resource', rest: 'normal', penalty: 0, countdown: null,
      title: { en: 'A useful resource', ru: 'Полезный ресурс' },
      rule: { en: 'Something useful presents itself to you. This can be a single item, a boon that lasts until you return to Bastion, or clues that help you navigate closer to a Quest.', ru: 'Вам попадается нечто полезное: предмет, дар, действующий до возвращения в Бастион, или подсказки, приближающие к Заданию.' } },
  };
  var OUTCOME_KEYS = Object.keys(OUTCOME_RULES);

  /* ---------------- small helpers ---------------- */

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function isDie(v) { return isInt(v) && v >= 1 && v <= DIE_MAX; }

  function defaults() {
    return {
      schema: SCHEMA,
      tier: 1, heroes: 4,
      fear: 0, fd: FD_START, hexes: 0, trapped: false,
      phase: 'roll',
      dice: { hope: null, fear: null, modifier: 0 },
      difficulty: 'standard',
      envTier: null,                 // null = read the environment at the Party Tier; 1-4 = the GM's override (PD-100)
      expedition: 1,                 // which expedition of this campaign (Bastion trips and new expeditions raise it)
      shortRests: 0,                 // consecutive Short Rests since the last Long Rest (SRD: after three, the next rest is long)
      lastRest: null,                // what the last rest on this hex did, for the panel
      retreat: null,                 // { from: 'roll'|'arrived', danger: null|true|false } while phase is 'retreat'
      settings: defaultSettings(),   // the GM's explicit, reversible house-rule switches (PD-101)
      arrival: null,
      scene: emptyScene(),
      log: [],
      undo: [],
    };
  }

  /* House-rule switches. Each is a rule the printed book or the SRD states but a table may run differently, so
   * each is explicit and reversible (never silent): fearOnRoll = a roll with Fear gives the GM 1 Fear;
   * fearOnRest = a rest gives the GM Fear (1d4 short, 1d4 + heroes long); shortRestLimit = after 3 Short Rests
   * in a row the next rest must be long. */
  function defaultSettings() { return { fearOnRoll: true, fearOnRest: true, shortRestLimit: true }; }

  function emptyScene() {
    return {
      outcome: null,
      seed: 0, sceneId: null,
      dealt: {},                       // outcome key -> scene ids dealt so far (no repeats until the pool is spent)
      npc: { seed: 0, locked: false, value: null },
      encounter: { seed: 0, locked: [], gmTheme: null },   // locked: [{ id, quantity }]; gmTheme: the Master's own theme for a scene that names none
    };
  }

  /** The state without its undo stack — what an undo entry keeps. */
  function snapshot(state) {
    var copy = clone(state);
    delete copy.undo;
    return copy;
  }

  /** Records the state as it was, then returns the working copy with the stack grown. */
  function withUndo(state) {
    var next = clone(state);
    var stack = (state.undo || []).concat([snapshot(state)]);
    if (stack.length > UNDO_LIMIT) stack = stack.slice(stack.length - UNDO_LIMIT);
    next.undo = stack;
    return next;
  }

  /* ---------------- the roll (a pure preview) ---------------- */

  /**
   * Reads the typed dice against the Forest Difficulty. Never changes anything.
   * dice: { hope, fear, modifier } — each may be null / '' while still being typed.
   * Returns { status: 'incomplete'|'invalid'|'ok', errors: [code], ... }; when ok:
   *   total, difficulty, success, critical, rolledWith ('hope'|'fear'|'critical'),
   *   parity ('creature'|'landmark'|'mixed'), category, outcome (one of the twelve keys),
   *   margin (total − difficulty), gainsFear (a roll with Fear gives the GM 1 Fear).
   */
  function previewRoll(dice, fd) {
    var d = dice || {};
    var difficulty = isInt(fd) ? fd : FD_START;
    var hopeRaw = d.hope, fearRaw = d.fear;
    var blank = function (v) { return v === null || v === undefined || v === ''; };
    var errors = [];
    if (!blank(hopeRaw) && !isDie(hopeRaw)) errors.push('hope-range');
    if (!blank(fearRaw) && !isDie(fearRaw)) errors.push('fear-range');
    var modifier = blank(d.modifier) ? 0 : d.modifier;
    if (!isInt(modifier) || modifier < MOD_MIN || modifier > MOD_MAX) errors.push('modifier-range');
    if (errors.length) return { status: 'invalid', errors: errors };
    if (blank(hopeRaw) || blank(fearRaw)) return { status: 'incomplete', errors: [] };

    var hope = hopeRaw, fear = fearRaw;
    var total = hope + fear + modifier;
    var critical = hope === fear;
    var success = critical || total >= difficulty;
    var rolledWith = critical ? 'critical' : (hope > fear ? 'hope' : 'fear');
    var withHope = critical || hope > fear;
    var bothOdd = hope % 2 === 1 && fear % 2 === 1;
    var bothEven = hope % 2 === 0 && fear % 2 === 0;
    var category = bothOdd ? 'creature' : bothEven ? 'landmark' : (success ? 'resource' : 'hazard');
    var outcome = category + '-' + (success ? 'success' : 'fail') + '-' + (withHope ? 'hope' : 'fear');
    return {
      status: 'ok', errors: [],
      hope: hope, fear: fear, modifier: modifier,
      total: total, difficulty: difficulty, margin: total - difficulty,
      success: success, critical: critical, rolledWith: rolledWith,
      parity: bothOdd ? 'creature' : bothEven ? 'landmark' : 'mixed',
      category: category, outcome: outcome,
      gainsFear: rolledWith === 'fear',
    };
  }

  /* ---------------- commands ---------------- */

  function result(state, ok, reason) { return { ok: ok, reason: reason || null, state: state }; }

  /** Types into the dice fields. Only while a roll or a retreat roll is being made; never a committed change. */
  function setDice(state, patch) {
    if (state.phase !== 'roll' && state.phase !== 'retreat') return result(state, false, 'not-rolling');
    var next = clone(state);
    var p = patch || {};
    ['hope', 'fear', 'modifier'].forEach(function (k) {
      if (!(k in p)) return;
      var v = p[k];
      if (v === '' || v === null || v === undefined) next.dice[k] = k === 'modifier' ? 0 : null;
      else if (isInt(v)) next.dice[k] = v;       // out-of-range stays visible so the field can say so; previewRoll refuses it
    });
    return result(next, true);
  }

  /** Party Tier, number of heroes and the encounter difficulty: settings, not campaign events. */
  function setParty(state, patch) {
    var next = clone(state);
    var p = patch || {};
    if ('tier' in p && isInt(p.tier)) next.tier = clamp(p.tier, 1, 4);
    if ('heroes' in p && isInt(p.heroes)) next.heroes = clamp(p.heroes, HEROES_MIN, HEROES_MAX);
    if ('difficulty' in p && DIFFICULTIES.indexOf(p.difficulty) !== -1) next.difficulty = p.difficulty;
    return result(next, true);
  }

  /** The tier the environment's text is read at (damage dice scale to it): the GM's override, else the Party Tier.
   * Never a filter and never a campaign change. */
  function setEnvTier(state, tier) {
    var next = clone(state);
    next.envTier = isInt(tier) && tier >= 1 && tier <= 4 ? tier : null;
    return result(next, true);
  }
  function envReadTier(state) { return state.envTier || state.tier; }

  /** A house-rule switch (see defaultSettings). Reversible and not a campaign event. */
  function setSettings(state, patch) {
    var next = clone(state);
    var base = Object.assign(defaultSettings(), state.settings || {});
    ['fearOnRoll', 'fearOnRest', 'shortRestLimit'].forEach(function (k) { if (patch && typeof patch[k] === 'boolean') base[k] = patch[k]; });
    next.settings = base;
    return result(next, true);
  }

  /** What a traversal does to the counters, shared by an arrival and by a failed retreat (both enter a new hex). */
  function applyTraversal(state, preview, choices, viaRetreat) {
    var c = choices || {};
    var rule = OUTCOME_RULES[preview.outcome];
    var next = withUndo(state);
    var fdBefore = state.fd, fearBefore = state.fear;
    var fd = state.fd + 1;            // the roll was made against FD as it stood; only now does the new hex raise it
    var fear = state.fear;
    var penaltyChoice = null;
    if (rule.penalty > 0) {
      penaltyChoice = c.penalty === 'fear' ? 'fear' : 'fd';
      if (penaltyChoice === 'fd') fd += rule.penalty; else fear += rule.penalty;
    }
    var fearRule = !state.settings || state.settings.fearOnRoll !== false;
    var gainedFear = preview.gainsFear && c.gainFear !== false && fearRule;
    if (gainedFear) fear += 1;
    next.fd = clamp(fd, FD_START, FD_TRAPPED);
    next.fear = clamp(fear, 0, FEAR_MAX);
    next.hexes = state.hexes + 1;
    next.trapped = next.fd >= FD_TRAPPED;
    next.phase = 'arrived';
    next.retreat = null;
    next.lastRest = null;
    next.arrival = {
      n: next.hexes, outcome: preview.outcome,
      hope: preview.hope, fear: preview.fear, modifier: preview.modifier,
      total: preview.total, difficulty: preview.difficulty, rolledWith: preview.rolledWith,
      fdBefore: fdBefore, fdAfter: next.fd, fearBefore: fearBefore, fearAfter: next.fear,
      penaltyChoice: penaltyChoice, gainedFear: gainedFear, viaRetreat: !!viaRetreat,
    };
    next.dice = { hope: null, fear: null, modifier: preview.modifier };   // consumed: a second confirm has nothing to confirm
    next.scene = Object.assign(clone(state.scene), { outcome: preview.outcome });
    // The scene the party arrived at is spent: it is not dealt again for this outcome until the pool is.
    if (next.scene.sceneId) {
      var seen = (next.scene.dealt[preview.outcome] || []).filter(function (id) { return id !== next.scene.sceneId; });
      next.scene.dealt[preview.outcome] = seen.concat([next.scene.sceneId]).slice(-60);
    }
    next.log = (state.log || []).concat([{ n: next.hexes, outcome: preview.outcome, kind: viaRetreat ? 'retreat-failed' : 'arrival', fd: next.fd }]).slice(-LOG_LIMIT);
    return result(next, true);
  }

  /**
   * THE one commit for travel. Confirms travel to a new hex for the previewed roll:
   *   - FD +1 for the new hex (the roll itself was against FD before the increase);
   *   - a Landmark of a failed roll costs +2 / +1 FD, or that much GM Fear instead (choices.penalty 'fd'|'fear');
   *   - a roll with Fear gives the GM 1 Fear (choices.gainFear, default true; settings.fearOnRoll off disables it);
   *     a critical never does.
   * Refused (nothing changes) when the roll is not a complete valid preview, when the party has
   * already arrived (the dice were consumed by the first confirmation), or when it is trapped.
   */
  function confirmArrival(state, choices) {
    if (state.phase !== 'roll') return result(state, false, 'already-arrived');
    if (state.trapped) return result(state, false, 'trapped');
    var preview = previewRoll(state.dice, state.fd);
    if (preview.status !== 'ok') return result(state, false, preview.status);
    return applyTraversal(state, preview, choices, false);
  }

  /** Back to rolling: the arrival is closed, the next roll starts from clean dice. Not a campaign change. */
  function nextTraversal(state) {
    if (state.phase !== 'arrived') return result(state, false, 'not-arrived');
    var next = clone(state);
    next.phase = 'roll';
    next.arrival = null;
    next.lastRest = null;
    next.dice = { hope: null, fear: null, modifier: state.dice.modifier || 0 };
    var dealt = state.scene.dealt;
    next.scene = emptyScene();
    next.scene.dealt = clone(dealt);
    next.scene.seed = state.scene.seed;
    return result(next, true);
  }

  /** The GM's own correction of the Fear counter: committed (undoable), clamped to the pool's 0-12. */
  function adjustFear(state, delta) {
    if (!isInt(delta) || delta === 0) return result(state, false, 'no-change');
    var fear = clamp(state.fear + delta, 0, FEAR_MAX);
    if (fear === state.fear) return result(state, false, 'no-change');
    var next = withUndo(state);
    next.fear = fear;
    return result(next, true);
  }

  /** The GM's own correction of the Forest Difficulty: committed, never below 15; reaching 30 traps the party. */
  function adjustFd(state, delta) {
    if (!isInt(delta) || delta === 0) return result(state, false, 'no-change');
    var fd = clamp(state.fd + delta, FD_START, FD_TRAPPED);
    if (fd === state.fd) return result(state, false, 'no-change');
    var next = withUndo(state);
    next.fd = fd;
    next.trapped = fd >= FD_TRAPPED;
    return result(next, true);
  }

  /* ---------------- resting ---------------- */

  /**
   * A rest on the hex the party has arrived at.
   *   opts: { kind: 'short'|'long', fearRoll: 1-4 (the GM's 1d4), fdRoll: 1-2 (a long rest's 1d2),
   *           whisper: bool (take Whisper in the Dark), gainFear: bool }
   * The caller rolls the dice (the model has no randomness) and may pass the GM's own numbers instead.
   *
   * - Whisper in the Dark is the campaign's ADDITIONAL downtime move, and it is where the Forest Difficulty drops:
   *   a short rest by 1, a long rest by 1d2+1, never below 15. It is not a separate Bastion reduction.
   * - Standard Daggerheart: a rest gives the GM Fear, 1d4 for a short rest and 1d4 + the number of heroes for a
   *   long one (pool capped at 12); after three Short Rests in a row the next rest must be long. Both can be
   *   switched off in the house-rule settings.
   * - By outcome: a dark omen forbids resting; a tragic place allows it but FD cannot be reduced (Whisper off);
   *   foreshadowed danger allows only 1 downtime move, so the Whisper is the GM's explicit choice there
   *   (opts.whisper, which the page defaults to on); a campfire and every other hex rest normally.
   */
  function rest(state, opts) {
    var o = opts || {};
    if (state.phase !== 'arrived' || !state.arrival) return result(state, false, 'not-arrived');
    // QA-007: FD 30 is the end of the game (PD-099). No rest, so no Whisper in the Dark can lift it; only Undo or the GM's counter correction.
    if (state.trapped) return result(state, false, 'trapped');
    var kind = o.kind;
    if (kind !== 'short' && kind !== 'long') return result(state, false, 'bad-kind');
    var policy = OUTCOME_RULES[state.arrival.outcome].rest;
    if (policy === 'none') return result(state, false, 'no-rest-here');
    var settings = Object.assign(defaultSettings(), state.settings || {});
    if (kind === 'short' && settings.shortRestLimit && (state.shortRests || 0) >= 3) return result(state, false, 'long-rest-required');
    var whisper = o.whisper !== false && policy !== 'no-fd-reduction';
    var fearOn = settings.fearOnRest && o.gainFear !== false;
    if (fearOn && !(isInt(o.fearRoll) && o.fearRoll >= 1 && o.fearRoll <= 4)) return result(state, false, 'need-fear-roll');
    if (whisper && kind === 'long' && !(isInt(o.fdRoll) && o.fdRoll >= 1 && o.fdRoll <= 2)) return result(state, false, 'need-fd-roll');
    var fdBy = !whisper ? 0 : (kind === 'short' ? 1 : o.fdRoll + 1);
    var next = withUndo(state);
    var fdAfter = clamp(state.fd - fdBy, FD_START, FD_TRAPPED);
    var fearBy = fearOn ? o.fearRoll + (kind === 'long' ? state.heroes : 0) : 0;
    var fearAfter = clamp(state.fear + fearBy, 0, FEAR_MAX);
    next.fd = fdAfter;
    next.fear = fearAfter;
    next.trapped = fdAfter >= FD_TRAPPED;
    next.shortRests = kind === 'short' ? (state.shortRests || 0) + 1 : 0;
    next.lastRest = {
      kind: kind, whisper: whisper, fdBy: state.fd - fdAfter, fearBy: fearAfter - state.fear,
      fdRoll: kind === 'long' && whisper ? o.fdRoll : null, fearRoll: fearOn ? o.fearRoll : null, fearCapped: fearOn && fearAfter - state.fear < fearBy,
    };
    return result(next, true);
  }

  /* ---------------- retreat, Bastion, expeditions ---------------- */

  /**
   * "The party may retreat to Bastion at any time." Opens the retreat flow (not yet a change to the campaign):
   * no danger -> declaring it is enough; danger present -> a Group Roll against the Forest Difficulty. On a
   * failed roll the roll is used as a traversal roll for a random ADJACENT hex (confirmRetreatFailure).
   * Only from a hex (arrived) or between hexes (roll, once at least one hex is behind the party), and not while trapped.
   */
  function beginRetreat(state) {
    if (state.phase !== 'arrived' && state.phase !== 'roll') return result(state, false, 'cannot-retreat-now');
    if (state.hexes < 1) return result(state, false, 'no-hex-yet');
    if (state.trapped) return result(state, false, 'trapped');
    var next = clone(state);
    next.retreat = { from: state.phase, danger: null };
    next.phase = 'retreat';
    next.dice = { hope: null, fear: null, modifier: state.dice.modifier || 0 };
    return result(next, true);
  }

  /** Whether a danger is still present: the Master's call, never inferred. */
  function setRetreatDanger(state, danger) {
    if (state.phase !== 'retreat' || !state.retreat) return result(state, false, 'not-retreating');
    var next = clone(state);
    next.retreat.danger = danger === true ? true : danger === false ? false : null;
    return result(next, true);
  }

  /** Changed their mind: back to where the party was. Nothing was applied, so nothing to undo. */
  function cancelRetreat(state) {
    if (state.phase !== 'retreat' || !state.retreat) return result(state, false, 'not-retreating');
    var next = clone(state);
    next.phase = state.retreat.from;
    next.retreat = null;
    next.dice = { hope: null, fear: null, modifier: state.dice.modifier || 0 };
    return result(next, true);
  }

  /**
   * The party reaches Bastion: by declaration (no danger) or by a successful Group Roll. Committed and undoable.
   * Expedition progress is not wiped here (the hex count and FD stay visible until a new expedition begins; FD
   * is 15 again "when you enter the forest"), and GM Fear is never touched by the trip itself; a Group Roll
   * with Fear is an action roll, so it gives the GM 1 Fear like any other (choices.gainFear, settings.fearOnRoll).
   */
  function completeRetreat(state, choices) {
    if (state.phase !== 'retreat' || !state.retreat) return result(state, false, 'not-retreating');
    var danger = state.retreat.danger;
    if (danger === null) return result(state, false, 'danger-unknown');
    var fearGain = 0;
    if (danger) {
      var p = previewRoll(state.dice, state.fd);
      if (p.status !== 'ok') return result(state, false, p.status);
      if (!p.success) return result(state, false, 'roll-failed');
      var fearRule = !state.settings || state.settings.fearOnRoll !== false;
      if (p.gainsFear && (choices || {}).gainFear !== false && fearRule) fearGain = 1;
    }
    var next = withUndo(state);
    next.fear = clamp(state.fear + fearGain, 0, FEAR_MAX);
    next.phase = 'bastion';
    next.retreat = null;
    next.arrival = null;
    next.lastRest = null;
    next.dice = { hope: null, fear: null, modifier: state.dice.modifier || 0 };
    next.log = (state.log || []).concat([{ n: state.hexes, outcome: null, kind: 'bastion', fd: state.fd }]).slice(-LOG_LIMIT);
    return result(next, true);
  }

  /** A failed Group Roll: its result is used on the Traversal tables for a random adjacent hex, so the party enters a NEW hex. */
  function confirmRetreatFailure(state, choices) {
    if (state.phase !== 'retreat' || !state.retreat || state.retreat.danger !== true) return result(state, false, 'not-retreating');
    var p = previewRoll(state.dice, state.fd);
    if (p.status !== 'ok') return result(state, false, p.status);
    if (p.success) return result(state, false, 'roll-succeeded');
    return applyTraversal(state, p, choices, true);
  }

  /**
   * Another expedition of the same campaign: leave Bastion for the forest. FD is 15 again, the hex count and
   * the map-side progress start over; GM Fear, the party, the house-rule switches, the Short Rest tally and the
   * scenes already shown (so they are not repeated) carry on. Also usable mid-forest to abandon an expedition.
   * Committed and undoable.
   */
  function startExpedition(state) {
    var next = withUndo(state);
    var fresh = defaults();
    ['tier', 'heroes', 'difficulty', 'envTier', 'fear', 'shortRests', 'settings'].forEach(function (k) { fresh[k] = clone(state[k]); });
    fresh.expedition = (state.expedition || 1) + 1;
    fresh.scene.dealt = clone(state.scene.dealt || {});
    fresh.scene.seed = state.scene.seed || 0;
    fresh.undo = next.undo;
    return result(fresh, true);
  }

  /** An entirely new campaign: everything resets, GM Fear included. The party and the switches stay (they are the table's, not the campaign's). Undoable. */
  function newCampaign(state) {
    var next = withUndo(state);
    var fresh = defaults();
    ['tier', 'heroes', 'difficulty', 'envTier', 'settings'].forEach(function (k) { fresh[k] = clone(state[k]); });
    fresh.undo = next.undo;
    return result(fresh, true);
  }

  /** Undoes the last committed action exactly (confirm, rest, retreat, a counter correction or a new expedition/campaign). */
  function undo(state) {
    var stack = state.undo || [];
    if (!stack.length) return result(state, false, 'nothing-to-undo');
    var restored = clone(stack[stack.length - 1]);
    // QA-003: party, encounter difficulty, the environment-tier override and the house-rule switches are settings, not campaign events
    // (setParty/setEnvTier/setSettings), so undoing a campaign action never reverts them.
    ['tier', 'heroes', 'difficulty', 'envTier', 'settings'].forEach(function (k) { restored[k] = clone(state[k]); });
    restored.undo = stack.slice(0, -1);
    return result(restored, true);
  }

  /** The scene composition changes (a deal, a regeneration, a lock) are not campaign actions, so never undoable. */
  function setScene(state, scene) {
    var next = clone(state);
    next.scene = clone(scene);
    return result(next, true);
  }

  return {
    SCHEMA: SCHEMA, FD_START: FD_START, FD_TRAPPED: FD_TRAPPED, FEAR_MAX: FEAR_MAX,
    DIE_MAX: DIE_MAX, MOD_MIN: MOD_MIN, MOD_MAX: MOD_MAX, HEROES_MIN: HEROES_MIN, HEROES_MAX: HEROES_MAX,
    UNDO_LIMIT: UNDO_LIMIT, DIFFICULTIES: DIFFICULTIES,
    OUTCOME_RULES: OUTCOME_RULES, OUTCOME_KEYS: OUTCOME_KEYS,
    defaults: defaults, defaultSettings: defaultSettings, emptyScene: emptyScene,
    previewRoll: previewRoll,
    setDice: setDice, setParty: setParty, setEnvTier: setEnvTier, envReadTier: envReadTier, setSettings: setSettings,
    confirmArrival: confirmArrival, nextTraversal: nextTraversal,
    adjustFear: adjustFear, adjustFd: adjustFd, rest: rest,
    beginRetreat: beginRetreat, setRetreatDanger: setRetreatDanger, cancelRetreat: cancelRetreat,
    completeRetreat: completeRetreat, confirmRetreatFailure: confirmRetreatFailure,
    startExpedition: startExpedition, newCampaign: newCampaign,
    undo: undo, setScene: setScene,
  };
});
