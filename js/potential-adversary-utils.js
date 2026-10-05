/* ============================================================
   Bacchus's Atlas — potential-adversary-utils.js
   Pure, dependency-free parsing and resolution of an environment's
   `potential_adversaries` text, plus the Prep "recommended adversaries"
   derivation built on top of it.

   There is exactly one parser for that text in the whole app. Both the
   environment card's FreshCutGrass links (js/app.js) and Prep's
   Environment → Recommended Adversaries feature read the canonical English
   adversary names through envAdversaryNames() below; Prep only adds the
   step of matching those names against its own supported catalogue
   (data/prep.json). Nothing here knows about the DOM, application state or
   i18n — same shape as js/prep-utils.js, loaded as a plain <script> in the
   browser (before js/app.js) and required() as-is from a Node test (see
   tests/potential-adversary-utils.test.js and
   tests/prep-recommendations.test.js).
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PotentialAdversaryUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- parsing ---------------- */

  /* A potential_adversaries entry is plain text — "Beasts (Bear, Dire Wolf,
   * Glass Snake)", a named group followed by its members in parentheses — or,
   * with no parentheses, a single adversary named by itself (e.g. "Sellsword").
   * Parsing that text, rather than hand-listing monster names per environment,
   * is what lets the encounter builder stay generic: it reads the same data
   * the "Potential Adversaries" line already renders from. */
  /** Two more Potential Adversaries shapes fall outside the ordinary "Label
   * (Member, Member)" form, and neither needs the SRD to parse correctly —
   * both are pure punctuation, not creature names:
   *
   * - A whole entry can be "Tier N: Name, Name" (RU "Ранг N: …") instead of a
   *   single string with parens — the encounter table for a tiered event like
   *   a fighting arena. The names after the colon are already complete, so
   *   this parses exactly like a parenthetical group, just with ": " instead
   *   of " (" ... ")" as the wrapping punctuation (see `style` below).
   * - A parenthetical can hold a tier/role annotation instead of members —
   *   "Bandits (tier 2)", "Barbara Yaga, Barkeep (Tier 4 Solo)". That's
   *   metadata about the one adversary named before it, not a list of
   *   adversaries to look up, so it's kept for display (as `annotation`) but
   *   never treated as a member to resolve or link. */
  function parsePotentialAdversaryEntry(entry) {
    const text = String(entry || '').trim();
    const tierMatch = text.match(/^((?:Tier|Ранг)\s+\d+):\s*(.+)$/i);
    if (tierMatch) return { label: tierMatch[1].trim(), members: splitAdversaryMembers(tierMatch[2]), isGroup: true, style: 'tier' };
    const match = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!match) return { label: text, members: text ? [text] : [], isGroup: false };
    if (/^(?:tier|ранг)\s*\d+/i.test(match[2].trim())) {
      const label = match[1].trim();
      return { label, members: label ? [label] : [], isGroup: false, annotation: match[2].trim() };
    }
    return { label: match[1].trim(), members: splitAdversaryMembers(match[2]), isGroup: true, style: 'paren' };
  }

  /** Splits a group's parenthetical member list on commas, same as always —
   * except for the rare list that uses "or" before its last item instead of a
   * comma ("Green or Red Ooze", RU "Зелёная или Красная Слизь"). English (and
   * Russian) drop the shared trailing noun from every item but the last one, so
   * a plain split leaves the first item short a word ("Green" instead of
   * "Green Ooze"). When "or"/"или" is present, the last item's trailing words
   * (everything after its first word) are treated as that shared noun and
   * appended to any earlier item that doesn't already end with it. Plain
   * comma lists never hit this path, so multi-word distinct names in an
   * ordinary list ("Gobstalker, Green Ooze, Ravenous Mockery, Rust Eater")
   * are untouched. */
  function splitAdversaryMembers(text) {
    /* \b doesn't mark a boundary around Cyrillic letters in JS regex (\w is
     * ASCII-only), so "или" is matched by surrounding whitespace instead —
     * the same pattern the split below uses. */
    if (!/\s(?:or|или)\s/i.test(text)) return text.split(',').map(s => s.trim()).filter(Boolean);
    const parts = text.split(/\s*,\s*|\s+(?:or|или)\s+/i).map(s => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    const lastWords = last.split(/\s+/);
    if (lastWords.length < 2) return parts;
    const suffix = lastWords.slice(1).join(' ');
    return parts.map((p, i) => (i === parts.length - 1 || p.toLowerCase().endsWith(suffix.toLowerCase())) ? p : `${p} ${suffix}`);
  }

  /* A handful of Potential Adversaries entries don't name an adversary at all:
   * "Any"/"All" (the GM picks whatever fits) or a citation like
   * 'ghostly versions of other adversaries (see "Ghostly Form")' pointing at a
   * feature instead of naming a creature. Neither is something FreshCutGrass's
   * bestiary can look up, so both are filtered out here rather than becoming a
   * broken link or a fake entry in the whole-environment payload. Checked only
   * on the section's own text ("see …", quote marks, the bare word "any"/"all"),
   * so it holds for any environment's data rather than one hand-picked id. */
  function looksLikeAdversaryName(name) {
    const text = String(name || '').trim();
    if (!text) return false;
    if (/^(?:any|all)$/i.test(text)) return false;
    if (/[“”"]/.test(text)) return false;
    if (/\bsee\b/i.test(text)) return false;
    return true;
  }

  /* ---------------- group prefixes, aliases and families ---------------- */

  /** A handful of Potential Adversaries groups list their members as bare role
   * suffixes rather than full names — "Jagged Knife Bandits (Hexer, ...)" means
   * the FreshCutGrass bestiary entry "Jagged Knife Hexer", not "Hexer" on its
   * own — so the name FreshCutGrass needs is the group's own prefix plus the
   * member, not the member text as written. That prefix isn't always the full
   * group label either: "Outer Realms Monstrosities" names its members "Outer
   * Realms Abomination" etc., dropping "Monstrosities". A label absent here is
   * assumed to already list complete adversary names, e.g. "Beasts (Bear,
   * Glass Snake)", so it's passed through unchanged. */
  const ADVERSARY_GROUP_NAME_PREFIXES = {
    'Jagged Knife Bandits': 'Jagged Knife',
    'Jagged Knife': 'Jagged Knife',
    'Outer Realms Monstrosities': 'Outer Realms',
    'Outer Realms': 'Outer Realms',
    Skeletons: 'Skeleton',
    Spectral: 'Spectral',
    'Spectral Warriors': 'Spectral',
    Pirates: 'Pirate',
    Cultists: 'Cult',
    Demons: 'Demon of',
    'Vault Guardians': 'Vault Guardian',
    Hallowed: 'Hallowed',
    Fallen: 'Fallen',
  };

  /** A few groups don't follow the prefix pattern above at all — "Guards (Head,
   * Archer, Bladed)" names its members with the role first and "Guard" dropped,
   * so neither leaving the text alone nor prepending a prefix produces the
   * FreshCutGrass name ("Head Guard", not "Head" or "Guards Head"). Those need
   * an explicit member-by-member alias instead of a prefix or suffix rule.
   * "Captain" is an alias some source text uses for the same role as "Head" —
   * both map to the FreshCutGrass entry "Head Guard", since "Guard Captain"
   * isn't a bestiary entry of its own. The singular "Guard (...)" label (used
   * when a card lists only one guard-type group) shares the same member map as
   * the plural "Guards (...)". */
  const GUARD_GROUP_MEMBER_ALIASES = {
    Head: 'Head Guard',
    Captain: 'Head Guard',
    Archer: 'Archer Guard',
    Bladed: 'Bladed Guard',
  };
  const ADVERSARY_GROUP_MEMBER_ALIASES = {
    Guards: GUARD_GROUP_MEMBER_ALIASES,
    Guard: GUARD_GROUP_MEMBER_ALIASES,
    /* "Assassins" doesn't follow one uniform prefix or suffix: Apprentice and
     * Master take "Assassin" as a suffix, but Poisoner takes it as a prefix
     * ("Assassin Poisoner", not "Poisoner Assassin") — confirmed against
     * FreshCutGrass's own adversary list, which has no plain "Poisoner". */
    Assassins: {
      Apprentice: 'Apprentice Assassin',
      Master: 'Master Assassin',
      Poisoner: 'Assassin Poisoner',
    },
    /* "Sundry Ne'er-Do-Wells (Jagged Knife Bandit, Lackey)" already spells its
     * first member out in full; only "Lackey" is bare and needs disambiguating
     * to the "Jagged Knife Lackey" bestiary entry. */
    "Sundry Ne'er-Do-Wells": { Lackey: 'Jagged Knife Lackey' },
    /* Elemental groups wrap the bare member on both sides ("Minor" + member +
     * "Elemental"), which fullAdversaryName's single prefix can't express. */
    Elementals: { 'Greater Earth': 'Greater Earth Elemental' },
    'Greater Elementals': { Earth: 'Greater Earth Elemental', Water: 'Greater Water Elemental' },
    'Minor Elementals': { Fire: 'Minor Fire Elemental', Chaos: 'Minor Chaos Elemental' },
    /* "Fallen (Shock Troop, Sorcerer, Warlord)" — bare "Warlord" doesn't
     * prefix cleanly since the bestiary has no plain "Fallen Warlord", only
     * subtitled variants. Confirmed this environment (Fortress) means the
     * "Realm-Breaker" one specifically. */
    Fallen: { Warlord: 'Fallen Warlord: Realm-Breaker' },
  };

  /** The FreshCutGrass-recognizable name for one member of a Potential
   * Adversaries group — see ADVERSARY_GROUP_MEMBER_ALIASES and
   * ADVERSARY_GROUP_NAME_PREFIXES above. A member that's already spelled out in
   * full ("Cultists (Cult Adept, Cult Fang, Cult Initiate)") is left alone
   * rather than getting the prefix prepended a second time ("Cult Cult
   * Adept") — some environments mix bare roles and full names in the same
   * group, e.g. "Sundry Ne'er-Do-Wells (Jagged Knife Bandit, Lackey)". */
  function fullAdversaryName(groupLabel, memberName) {
    const alias = ADVERSARY_GROUP_MEMBER_ALIASES[groupLabel]?.[memberName];
    if (alias) return alias;
    const prefix = ADVERSARY_GROUP_NAME_PREFIXES[groupLabel];
    if (!prefix) return memberName;
    return memberName === prefix || memberName.startsWith(`${prefix} `) ? memberName : `${prefix} ${memberName}`;
  }

  const JAGGED_KNIFE_ROSTER = [
    'Jagged Knife Bandit', 'Jagged Knife Hexer', 'Jagged Knife Kneebreaker', 'Jagged Knife Lackey',
    'Jagged Knife Lieutenant', 'Jagged Knife Shadow', 'Jagged Knife Sniper',
  ];

  /** A handful of Potential Adversaries entries — grouped or standalone — don't
   * enumerate their members at all, instead naming a family and leaving the GM
   * to pick any of it: "Criminals (any Jagged Knife)", or the bare entry "any
   * Cult member". FreshCutGrass has no notion of "any", so these expand to the
   * family's full roster, taken from the same wording spelled out in full
   * elsewhere in the data — e.g. "Jagged Knife Bandits (Bandit, Hexer,
   * Kneebreaker, Lackey, Lieutenant, Shadow, Sniper)" and "Cultists (Adept,
   * Fang, Initiate)". Both the singular and plural family name are listed
   * since source text uses either ("any Vault Guardian" / "any Vault
   * Guardians").
   *
   * The Bandits rule is an explicit project rule, not a fuzzy guess: a generic
   * "Bandit"/"Bandits" reference (bare, "Bandits (tier 2)", "any Bandit(s)",
   * "Jagged Knife Bandits", "Jagged Knives") means the complete Jagged Knife family — the only
   * bandit gang the adversary catalogue has. The extra keys below are
   * what carry it; "any Jagged Knife [Bandit]" already reaches the roster
   * through the 'Jagged Knife' key. See docs/product-decisions.md PD-008. */
  const ADVERSARY_FAMILY_MEMBERS = {
    'Jagged Knife': JAGGED_KNIFE_ROSTER,
    Bandit: JAGGED_KNIFE_ROSTER,
    Bandits: JAGGED_KNIFE_ROSTER,
    'Jagged Knife Bandits': JAGGED_KNIFE_ROSTER,
    'Jagged Knives': JAGGED_KNIFE_ROSTER,
    'Vault Guardian': ['Vault Guardian Gaoler', 'Vault Guardian Sentinel', 'Vault Guardian Turret'],
    'Vault Guardians': ['Vault Guardian Gaoler', 'Vault Guardian Sentinel', 'Vault Guardian Turret'],
    'Outer Realms': ['Outer Realms Abomination', 'Outer Realms Corrupter', 'Outer Realms Thrall'],
    Cult: ['Cult Adept', 'Cult Fang', 'Cult Initiate'],
    Pirate: ['Pirate Captain', 'Pirate Raiders', 'Pirate Tough'],
    Pirates: ['Pirate Captain', 'Pirate Raiders', 'Pirate Tough'],
  };

  /** "Beasts (any)" — the GM may pick any beast — expands to the SRD 2.0
   * adversaries FreshCutGrass tags "Beasts" that data/prep.json also holds (plus
   * Glass Snake, Giant Scorpion and Giant Mosquitoes, which the environments'
   * own explicit Beasts lists use but FreshCutGrass leaves untagged),
   * split by tier so the card can offer one encounter link per tier (see
   * beastTierGroups). Tiers are the catalogue's own; tests/potential-adversary-
   * utils.test.js cross-checks every name and tier against data/prep.json so
   * this list can't drift from it. */
  const BEAST_TIER_ROSTERS = {
    1: ['Ahuizotl', 'Atototl', 'Bear', 'Dire Wolf', 'Elk', 'Falcon', 'Giant Mosquitoes', 'Giant Rat',
      'Giant Scorpion', 'Glass Snake', 'Octopus', 'Panther', 'Sawtoothed Gillbeast', 'Swarm of Rats', 'Viper'],
    2: ['Dire Pangolati', 'Electric Eels', 'Elephant', 'Fowlbear', 'Giant Eagle', 'Giant Octopus', 'Shark',
      'Triceratops', 'Tyrannosaurus'],
    3: ['Crimson Lepus', 'Dire Bat', 'Gargantuan Sea Turtle', 'Plesiosaurus', 'Roc', 'Stag Knight'],
    4: ['Griffin', 'Water Mother'],
  };

  /** For a parsed English entry that is exactly "Beasts (any)", the per-tier
   * groups [{ tier, names }] in tier order; null for any other entry. */
  function beastTierGroups(parsedEnglishEntry) {
    const e = parsedEnglishEntry;
    if (!e || !e.isGroup || e.style !== 'paren' || e.label.toLowerCase() !== 'beasts') return null;
    if (e.members.length !== 1 || e.members[0].toLowerCase() !== 'any') return null;
    return Object.keys(BEAST_TIER_ROSTERS).map(tier => ({ tier: Number(tier), names: BEAST_TIER_ROSTERS[tier] }));
  }

  /** The plural Bandit references that name the whole Jagged Knife family even
   * as a *member* of some other group — "Outlaws (Bandits, Pirates, …)",
   * "Desert Raiders (Jagged Knife Bandits)". Deliberately narrower than the
   * bare-entry rule above: the singular "Bandit" stays a specific adversary
   * inside a group, because "Jagged Knife Bandits (Bandit, Hexer, …)" lists
   * the one Jagged Knife Bandit. Other families (e.g. "Pirates") keep their
   * existing group-member behaviour. */
  const BANDIT_GROUP_MEMBER_FAMILY_ALIASES = new Set(['Bandits', 'Jagged Knife Bandits', 'Jagged Knives']);

  /** The text named by an "any X" (or "any X member"/"any X being") phrase —
   * "any Cult member" -> "Cult", "any Jagged Knife" -> "Jagged Knife", "any
   * Jagged Knife Bandit" -> "Jagged Knife Bandit". Returns null for text that
   * isn't an "any …" phrase at all. This is the raw named text, not
   * necessarily a family key by itself — see familyForAnyPhrase. */
  function anyAdversaryFamily(text) {
    const match = String(text).trim().match(/^any\s+(.+)$/i);
    if (!match) return null;
    return match[1].trim().replace(/\s+(members?|beings?)$/i, '').trim();
  }

  /** The ADVERSARY_FAMILY_MEMBERS key an "any X" phrase's named text refers
   * to. Usually X is the family name outright ("any Jagged Knife"), but
   * source text sometimes names one of the family's own members as a
   * stand-in for the whole family — "Hired goons (any Jagged Knife Bandit)"
   * means any Jagged Knife-gang member, not literally just the "Bandit" rank
   * — so a phrase that starts with a known family name still counts, even
   * with extra words after it. */
  function familyForAnyPhrase(phrase) {
    if (ADVERSARY_FAMILY_MEMBERS[phrase]) return phrase;
    return Object.keys(ADVERSARY_FAMILY_MEMBERS).find(family => phrase.startsWith(`${family} `)) || null;
  }

  /** Every FreshCutGrass-recognizable name a single Potential Adversaries
   * member (or, for a bare non-group entry, the whole entry) resolves to —
   * almost always exactly one, but an "any Jagged Knife" style family phrase
   * expands to every member of that family, and a name FreshCutGrass has
   * nothing to look up for ("Any", a "see …" citation) resolves to none.
   * groupLabel is null for a bare non-group entry, where no prefix applies.
   * "Vampires (all, including Lamia)" names one adversary through a citation
   * rather than stating it plainly — "including Lamia" means "Lamia" for
   * lookup purposes, same idea as "any X" naming a family instead of a member,
   * just for a single already-complete name instead of a whole roster. A bare
   * (non-grouped) entry that's itself a family name — "Pirates", no "any" and
   * no parenthetical members — means the whole family too: the SRD's "Pirates"
   * potential-adversary entry covers Pirate Captain/Raiders/Tough, not a single
   * bestiary entry called "Pirates". This only fires for bare entries
   * (groupLabel === null) and only on an exact family-key match, not the
   * startsWith fuzzy match familyForAnyPhrase does for "any X member" text —
   * that fuzzy match is safe there because "any" already signals "pick from
   * this family", but a bare full name like "Vault Guardian Turret" names one
   * specific adversary and must not expand to its whole family. */
  function resolveAdversaryNames(groupLabel, memberName) {
    const phrase = anyAdversaryFamily(memberName);
    if (phrase != null) {
      const familyKey = familyForAnyPhrase(phrase);
      if (familyKey) return ADVERSARY_FAMILY_MEMBERS[familyKey];
      return looksLikeAdversaryName(phrase) ? [phrase] : [];
    }
    const trimmed = String(memberName).trim();
    if (groupLabel == null) {
      const bareFamily = ADVERSARY_FAMILY_MEMBERS[trimmed];
      if (bareFamily) return bareFamily;
    } else if (BANDIT_GROUP_MEMBER_FAMILY_ALIASES.has(trimmed)) {
      return ADVERSARY_FAMILY_MEMBERS[trimmed];
    }
    const includingMatch = trimmed.match(/^including\s+(.+)$/i);
    const nameToResolve = includingMatch ? includingMatch[1].trim() : memberName;
    return looksLikeAdversaryName(nameToResolve) ? [fullAdversaryName(groupLabel, nameToResolve)] : [];
  }

  /** Every adversary named anywhere in an environment's Potential Adversaries
   * text, in English — FreshCutGrass has no notion of the site's other
   * languages, and Prep recommendations match on the same canonical English
   * names — deduplicated but kept in the order they first appear. */
  function envAdversaryNames(env) {
    const entries = env?.potential_adversaries?.en || [];
    const seen = new Set();
    entries.forEach(entry => {
      const parsed = parsePotentialAdversaryEntry(entry);
      const beastTiers = beastTierGroups(parsed);
      if (beastTiers) { beastTiers.forEach(g => g.names.forEach(n => seen.add(n))); return; }
      const groupLabel = parsed.isGroup ? parsed.label : null;
      parsed.members.forEach(name => {
        resolveAdversaryNames(groupLabel, name).forEach(n => seen.add(n));
      });
    });
    return [...seen];
  }

  /* ---------------- catalogue matching ---------------- */

  /** The conservative key two names are compared by — and nothing looser:
   * trim, Unicode NFKC (where available), case folding, collapsed
   * whitespace, and the apostrophe and dash look-alikes folded to ASCII.
   * Punctuation is otherwise kept, so "Fallen Warlord: Realm-Breaker" and a
   * plain "Fallen Warlord" stay distinct. No fuzzy matching, ever. */
  function normalizeAdversaryName(name) {
    let text = String(name == null ? '' : name);
    if (typeof text.normalize === 'function') text = text.normalize('NFKC');
    return text
      .replace(/[‘’‚‛ʼ′`´]/g, "'")
      .replace(/[‐‑‒–—―−]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** Canonical English name -> Prep adversary id, built once when data/prep.json
   * loads. Reads `name.en` only — a Russian display name never takes part. The
   * first entry wins if two ever normalize to the same key. */
  function buildCatalogueNameIndex(adversaries) {
    const index = new Map();
    (adversaries || []).forEach(adv => {
      const key = normalizeAdversaryName(adv && adv.name && adv.name.en);
      if (adv && adv.id && key && !index.has(key)) index.set(key, adv.id);
    });
    return index;
  }

  /** Resolves canonical English names against that index. Only names the
   * catalogue really holds come back as `ids` (deduplicated, in order); the
   * rest are returned as `unmatched` for tests and diagnostics — the UI never
   * shows or logs them. */
  function matchCatalogueIds(names, nameIndex) {
    const ids = [];
    const unmatched = [];
    const seen = new Set();
    (names || []).forEach(name => {
      const id = nameIndex && nameIndex.get(normalizeAdversaryName(name));
      if (!id) { unmatched.push(name); return; }
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    });
    return { ids, unmatched };
  }

  /** Supported Prep adversary ids one environment's Potential Adversaries
   * resolves to. Missing/empty potential_adversaries gives []. */
  function environmentSupportedAdversaryIds(env, nameIndex) {
    return matchCatalogueIds(envAdversaryNames(env), nameIndex).ids;
  }

  /** Environment id -> supported Prep adversary ids, for every environment
   * that has at least one. Derived once per catalogue pair (environments +
   * data/prep.json) and replaced wholesale whenever either is replaced; it
   * is never persisted. */
  function buildEnvironmentRecommendationIndex(environments, nameIndex) {
    const index = new Map();
    (environments || []).forEach(env => {
      if (!env || !env.id) return;
      const ids = environmentSupportedAdversaryIds(env, nameIndex);
      if (ids.length) index.set(env.id, ids);
    });
    return index;
  }

  /* ---------------- recommendation aggregation ---------------- */

  /** The active Prep's recommendations with provenance:
   *   Map { adversaryId => { environmentIds: [...], sourceCount } }
   * `environmentIds` lists every selected environment that recommends the
   * adversary, each once, in selection order; sourceCount is its length. An
   * id that is not in the index (a removed/unknown environment, or one with no
   * supported match) contributes nothing, and no environments at all gives an
   * empty Map. Pure derived state — never store this. */
  function aggregateRecommendations(selectedEnvironmentIds, environmentIndex) {
    const result = new Map();
    const visited = new Set();
    (selectedEnvironmentIds || []).forEach(envId => {
      if (visited.has(envId)) return;
      visited.add(envId);
      const ids = environmentIndex && environmentIndex.get(envId);
      if (!ids) return;
      new Set(ids).forEach(advId => {
        let entry = result.get(advId);
        if (!entry) { entry = { environmentIds: [], sourceCount: 0 }; result.set(advId, entry); }
        entry.environmentIds.push(envId);
        entry.sourceCount += 1;
      });
    });
    return result;
  }

  return {
    parsePotentialAdversaryEntry,
    splitAdversaryMembers,
    looksLikeAdversaryName,
    fullAdversaryName,
    anyAdversaryFamily,
    familyForAnyPhrase,
    resolveAdversaryNames,
    envAdversaryNames,
    ADVERSARY_GROUP_NAME_PREFIXES,
    ADVERSARY_GROUP_MEMBER_ALIASES,
    ADVERSARY_FAMILY_MEMBERS,
    BEAST_TIER_ROSTERS,
    beastTierGroups,
    normalizeAdversaryName,
    buildCatalogueNameIndex,
    matchCatalogueIds,
    environmentSupportedAdversaryIds,
    buildEnvironmentRecommendationIndex,
    aggregateRecommendations,
  };
});
