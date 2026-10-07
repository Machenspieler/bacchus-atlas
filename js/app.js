/* ============================================================
   Bacchus's Atlas — app.js
   Vanilla JS, no build step. All state persisted to localStorage
   except the environment data (data/environments.json), which stays
   read-only on disk.
   ============================================================ */

const LS_KEYS = {
  lang: 'dhcodex_lang',
  lists: 'dhcodex_lists',
  envLists: 'dhcodex_env_lists',
  storageNoticeDismissed: 'dhcodex_storage_notice_dismissed',
  journeyRegions: 'dhcodex_journey_regions',
  journeySanctuaries: 'dhcodex_journey_sanctuaries',
  prep: 'dhcodex_session_prep',
  prepHeaderMode: 'dhcodex_session_prep_header_mode',
  prepSessionHintSeen: 'dhcodex_session_prep_hint_seen',
  battlePointsPcs: 'dhcodex_battle_points_pcs',
  soundboard: 'dhcodex_soundboard',
};

const BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'settlement', 'universal'];
const TYPES = ['traversal', 'social', 'event', 'exploration'];

/* Shape of data/journey.json, so the generator page can be reached before — or
 * instead of — that file landing, and read empty tables rather than throwing. */
const JOURNEY_EMPTY = { habitat: [], encounter: [], terrain: [], rumors: [], sanctuary: [], nameElements: [] };

function normalizeLang(v) { return v === 'en' ? 'en' : 'ru'; }

/* Every persisted value is read through SafeStorage (js/safe-storage.js),
 * loaded before this script, so corrupt or wrong-shaped browser storage can
 * never stop startup — see the "Safe browser storage" section in
 * CLAUDE.md. `lsStorage` is resolved once: null when localStorage cannot be
 * used at all, in which case every read below quietly returns its fallback. */
const lsStorage = SafeStorage.getStorage();

/* The language is written through persist(), so what comes back out is JSON —
 * `"en"`, quote marks and all, which never equals `en`. Parsing it here keeps
 * the write side symmetric with every other key; the fallback covers a value
 * left in storage by a build that wrote the bare string. */
function storedLang() {
  return SafeStorage.loadStoredJson(lsStorage, LS_KEYS.lang, {
    fallback: () => 'ru',
    parse: raw => {
      try { return normalizeLang(JSON.parse(raw)); }
      catch { return normalizeLang(raw); }
    },
  });
}

const state = {
  lang: storedLang(),
  i18n: null,
  builtinEnvs: [],
  // Built once by setEnvironmentCatalog() alongside builtinEnvs — never
  // rebuilt on language switch, filter change, or list navigation. See the
  // "Environment search index" section in CLAUDE.md.
  environmentSearchIndex: new Map(),
  regions: [],
  itemCatalog: { items: {}, itemUrl: '', imageUrl: '' },
  itemIndex: new Map(),
  adversaryCatalog: new Map(),
  // Prep's own minimal adversary picker catalogue (data/prep.json)
  // — deliberately separate from adversaryCatalog above, which holds full
  // featured-adversary stat blocks. Its items are just ids into itemCatalog
  // above (the complete item encyclopedia); see the "Prep" sections
  // in CLAUDE.md.
  prepCatalog: { adversaries: [], itemIds: [], adversaryById: new Map() },
  // The FreshCutGrass-supported adversaries (normalized English name -> its
  // FreshCutGrass spelling), derived from the Prep catalogue by
  // setPrepCatalog(). Empty until that lands — and if it never does — which
  // means "nothing is supported": every FreshCutGrass link stays off.
  fcgSupportIndex: new Map(),
  // The compact "All Adversaries" toolbar's own precomputed search index
  // (name/Tier-alias/Type, EN+RU at once) — built once in
  // setPrepCatalog(), the same "built once alongside the catalogue
  // it indexes" pattern environmentPrepSearchIndex uses above. See
  // "Prep's compact 'All Adversaries' toolbar" in docs/architecture.md.
  adversaryPrepSearchIndex: new Map(),
  // Environment id -> supported Prep adversary ids (the ids in data/prep.json
  // that the environment's Potential Adversaries text resolves to). Derived,
  // never persisted; rebuilt by rebuildPrepRecommendationIndex() only when the
  // environment catalogue or the Prep catalogue is replaced — never per row or
  // per Prep change. See "Environment → Recommended Adversaries" in
  // docs/architecture.md.
  prepRecommendationIndex: new Map(),
  // The compact "All Items" toolbar's own precomputed search index (name +
  // Kind/Source alias words, EN+RU at once) — same "built once alongside
  // the catalogue it indexes" pattern as environmentPrepSearchIndex/
  // adversaryPrepSearchIndex above, built in setPrepCatalog().
  itemBrowserSearchIndex: new Map(),
  prepLoadFailed: false,
  prep: SafeStorage.loadStoredJson(lsStorage, LS_KEYS.prep, {
    fallback: () => PrepUtils.createDefaultStore(),
    validate: SafeStorage.validators.prep,
  }),
  // Search text per picker, the adversary Tier/Type/Selected-only filters,
  // the item category/source filters, and the last successful/failed save,
  // for the single active preparation. Transient UI state, never persisted
  // — see the "Transient UI state and rerendering" section of the Prep
  // Prep spec. advFilters.tiers/types are plain Sets, matching the main
  // catalog toolbar's own state.filters shape.
  prepUI: {
    envSearch: '', advSearch: '', itemSearch: '',
    // Tier multiselect for the compact "All Environments" toolbar — OR
    // within the set, empty means no restriction, ANDed with envSearch.
    // Same Set-based shape as advFilters.tiers below.
    envFilters: { tiers: new Set() },
    // Same shape for the compact "All Adversaries" toolbar's Tier/Type
    // multiselects — OR within each set, ANDed with advSearch and each
    // other. No "Selected only"/disclosure state here anymore (retired —
    // see the compact-toolbar redesign in docs/architecture.md).
    advFilters: { tiers: new Set(), types: new Set() },
    // Compact "All Items" toolbar: Kind ('item'/'consumable') and Source
    // ('core'/'hnf') multiselects, same OR-within-set/AND-across-groups
    // shape as envFilters/advFilters above. itemRollFilter is the active
    // dice-roll-and-filter result ({diceCount, total} or null);
    // itemTransientRoll is the ~1.2s on-button display of the same roll —
    // kept as a separate field on purpose (see js/prep-utils.js
    // and docs/architecture.md) so clearing the transient display after
    // its timeout never accidentally clears the still-active filter.
    // itemViewMode is Gallery/Compact — transient, never persisted, same
    // as every other field here.
    itemTypes: new Set(), itemSources: new Set(),
    itemRollFilter: null, itemTransientRoll: null,
    itemViewMode: 'gallery',
    lastSavedAt: null, saveFailed: false,
  },
  journey: JOURNEY_EMPTY,
  journeyRegions: SafeStorage.loadStoredJson(lsStorage, LS_KEYS.journeyRegions, {
    fallback: () => [],
    validate: SafeStorage.validators.journeyRegions,
  }),
  journeySanctuaries: SafeStorage.loadStoredJson(lsStorage, LS_KEYS.journeySanctuaries, {
    fallback: () => [],
    validate: SafeStorage.validators.journeySanctuaries,
  }),
  /* The roll on screen that has not been kept yet. Deliberately not persisted:
   * an unsaved roll is a suggestion the GM is still looking at, and it should
   * not outlive the visit the way a saved one does. */
  journeyDraft: { region: null, sanctuary: null },
  lists: SafeStorage.loadStoredJson(lsStorage, LS_KEYS.lists, {
    fallback: () => [],
    validate: SafeStorage.validators.lists,
  }),
  envLists: SafeStorage.loadStoredJson(lsStorage, LS_KEYS.envLists, {
    fallback: () => ({}),
    validate: SafeStorage.validators.envLists,
  }),
  /* Global soundboard levels (master + per sound), never part of a Prep
   * session. Normalized against the manifest in SoundboardUI.init(). */
  soundboard: SafeStorage.loadStoredJson(lsStorage, LS_KEYS.soundboard, {
    fallback: () => SoundboardManifest.defaultPrefs(),
    validate: SafeStorage.validators.soundboard,
  }),
  storageNoticeDismissed: SafeStorage.readRawFlag(lsStorage, LS_KEYS.storageNoticeDismissed) === '1',
  filters: { search: '', tiers: new Set(), types: new Set(), sources: new Set(), biomes: new Set(), regionOnly: false },
  // Whether the phone-width filter disclosure is open. Purely presentational,
  // so it lives here rather than in localStorage and survives a re-render only.
  filtersOpen: false,
  // Main catalog "Show more" progressive loading — how many of the current
  // search/filter results are actually rendered, and the grid column count
  // that count was last computed against. Purely presentational view state:
  // null means "(re)compute the initial six-row count on next render", never
  // persisted, and reset to null on a genuine search/filter change but left
  // alone by a language switch, a route revisit, or a resize. See
  // resetCatalogVisibility()/renderGrid()/renderCatalogMore() below.
  catalogVisibleCount: null,
  catalogLastColumnCount: null,
  route: readCurrentRoute(),
};

/* An open environment card is a "/env/<id>" suffix on whichever route is
 * behind it, rather than a route of its own: the card is an overlay, and the
 * catalog or list underneath it keeps its own address. That gives the card a
 * link worth sharing and, on a phone, makes the Back gesture close the sheet
 * instead of leaving the site.
 *
 * location.hash is untrusted input — a manually edited, copied, or truncated
 * link can carry malformed percent encoding — so it is never decoded here
 * directly. js/route-utils.js (RouteUtils) is the one place that happens,
 * safely; this file only reads the current route through readCurrentRoute()
 * below. See the "Hash routing" section in CLAUDE.md. */

/** The address of the route behind the card, without any card on it. */
function baseHash(route = state.route) { return RouteUtils.baseHash(route); }

function envHash(envId, route = state.route) { return RouteUtils.envHash(envId, route); }

function sameBase(a, b) { return a.name === b.name && a.id === b.id; }

/** Parses location.hash through the safe pure parser and, when it carries a
 * malformed segment, repairs the address in place before returning the safe
 * fallback route. The one boundary every call site that needs the current
 * route reads through — initial state, hashchange, navigate(), and the
 * replaceEnv()/dismissDetail() replaceState() call sites below. */
function readCurrentRoute() {
  const parsed = RouteUtils.parseRouteHash(location.hash);
  if (parsed.malformed || parsed.canonicalHash) repairHash(parsed.canonicalHash);
  return parsed.route;
}

/** Best-effort: replaces the current history entry's hash with a safe
 * canonical one, preserving origin/pathname/query/history.state and adding
 * no new history entry. A failure here (a hardened browser rejecting
 * replaceState, say) must not resurrect the URIError this exists to avoid —
 * the in-memory route from parseRouteHash() is already safe either way. */
function repairHash(canonicalHash) {
  try {
    const url = new URL(location.href);
    url.hash = canonicalHash;
    history.replaceState(history.state, '', url.href);
  } catch (err) {
    // Best-effort cleanup only; the safe in-memory route stands regardless.
  }
}

function navigate(hash) {
  if (location.hash === hash) { state.route = readCurrentRoute(); render(); }
  else { location.hash = hash; }
}

/* Opening or closing a card only moves the overlay. Re-rendering the page
 * underneath would rebuild the grid and destroy the button the card was opened
 * from, which is the element focus has to return to when it closes. */
window.addEventListener('hashchange', () => {
  const next = readCurrentRoute();
  const onlyCardChanged = sameBase(next, state.route);
  state.route = next;
  if (!next.env) cardEntryPushed = false;
  if (onlyCardChanged) { syncDetail(); document.title = routeTitle(); }
  else render();
});

function t(key) {
  const dict = state.i18n[state.lang] || {};
  return dict[key] || key;
}

function allEnvs() {
  return state.builtinEnvs;
}

/* The one lifecycle boundary for the environment catalog: assigning it and
 * building its search index always happen together, so the two can never
 * drift apart. See the "Environment search index" section in CLAUDE.md. */
function setEnvironmentCatalog(environments) {
  state.builtinEnvs = environments;
  state.environmentSearchIndex = SearchIndex.buildEnvironmentSearchIndex(environments);
  // Prep's compact "All Environments" toolbar search — name/tier/
  // type/biome only, both languages at once regardless of state.lang. Built
  // once here (state.i18n is already loaded by the time init() calls this —
  // see js/app.js's init()), never rebuilt per keystroke or language switch.
  state.environmentPrepSearchIndex = PrepUtils.buildEnvironmentSearchIndex(
    environments, state.i18n.en, state.i18n.ru);
  rebuildPrepRecommendationIndex();
}

/* The members of a list, in catalog order. Taken off the catalog rather than off
 * state.envLists because that record is keyed by environment and grows in the
 * order things were first bookmarked anywhere — walking it would order one
 * list's members by what happened in the others. */
function envsInList(listId) {
  return allEnvs().filter(e => (state.envLists[e.id] || []).includes(listId));
}

function currentEnvs() {
  if (state.route.name === 'list') return envsInList(state.route.id);
  return allEnvs();
}

function envName(env) { return env.name[state.lang] || env.name.en || env.name.ru || '(untitled)'; }
function envField(env, field) {
  const v = env[field];
  if (!v) return state.lang === 'ru' ? [] : [];
  return v[state.lang] && v[state.lang].length ? v[state.lang] : (v.en || v.ru || []);
}
function isTranslated(env) {
  return !!(env.name && env.name.ru && env.name.ru.trim());
}

/* ---------------- regions ---------------- */

/** Environments that belong to the same connected place are grouped into a
 * region in data/regions.json. An environment belongs to at most one region. */
function regionOfEnv(envId) {
  return state.regions.find(r => (r.environments || []).includes(envId)) || null;
}
function regionName(region) {
  return region.name?.[state.lang] || region.name?.en || region.name?.ru || '';
}
/** Region members that actually exist right now (a removed environment drops
 * out of the button row rather than rendering a dead button). */
function regionMembers(region) {
  const byId = new Map(allEnvs().map(e => [e.id, e]));
  return (region.environments || []).map(id => byId.get(id)).filter(Boolean);
}

/* ---------------- item catalogue ---------------- */

/* Stat blocks name loot by the plant or object the party harvests — "Nursewood",
 * not "Nursewood Sap" — so a name is looked up through an alias table as well as
 * through the catalogue's own names. Both sides go through the same normaliser,
 * which drops case, punctuation and spacing so a stray apostrophe or hyphen in a
 * stat block never costs a link. */
function normalizeItemKey(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function setItemCatalog(data) {
  const items = data.items || {};
  state.itemCatalog = { items, itemUrl: data.item_url || '', imageUrl: data.image_url || '' };
  const index = new Map();
  const names = [];
  const add = (text, id) => {
    const key = normalizeItemKey(text);
    if (key && !index.has(key)) { index.set(key, id); names.push({ name: String(text), id }); }
  };
  // Aliases win over catalogue names: they are the deliberate mapping, and a
  // stat block's wording is what the reader is actually clicking on.
  Object.entries(data.aliases || {}).forEach(([name, id]) => { if (items[id]) add(name, id); });
  Object.entries(items).forEach(([id, item]) => {
    ['en', 'ru'].forEach(lang => add(item[lang]?.name, id));
  });
  state.itemIndex = index;
  // Longest names first so e.g. "Minor Health Potion" wins over a shorter
  // substring before a shorter catalogue entry gets a chance to claim it.
  state.itemNames = names.sort((a, b) => b.name.length - a.name.length);
}

function itemById(id) { return state.itemCatalog.items[id] || null; }
function itemIdFor(text) { return state.itemIndex.get(normalizeItemKey(text)) || null; }
function itemField(item, field) { return item[state.lang]?.[field] || item.en?.[field] || item.ru?.[field] || ''; }
function itemUrl(id) { return state.itemCatalog.itemUrl.replace('{id}', id); }
function itemImageUrl(item) {
  return item.img && state.itemCatalog.imageUrl ? state.itemCatalog.imageUrl.replace('{img}', item.img) : '';
}
/** The other end of a craft chain: what this entry becomes, and what becomes it. */
function itemCraftRows(id) {
  const item = itemById(id);
  const rows = [];
  if (item?.craft && itemById(item.craft)) rows.push({ label: t('craft_into'), id: item.craft });
  const from = Object.keys(state.itemCatalog.items).find(other => state.itemCatalog.items[other].craft === id);
  if (from) rows.push({ label: t('craft_from'), id: from });
  return rows;
}

/** Difficulty is usually a plain number, but a few environments (e.g. duel
 * events whose difficulty depends on the chosen adversary) store a bilingual
 * descriptive string instead: { en, ru }. */
function envDifficulty(env) {
  const d = env.difficulty;
  if (d && typeof d === 'object') return d[state.lang] || d.en || d.ru || '';
  return d;
}
/** A descriptive difficulty that only points at one of the environment's own
 * features — "Special (see “Relative Strength”)" — carries no value of its own;
 * the Features block below prints the rule in full. One that names a value
 * instead still says something. */
function difficultyDefersToFeature(env) {
  const d = env.difficulty;
  if (!d || typeof d !== 'object') return false;
  const pointsAt = Object.values(d)
    .map(text => String(text).match(/[“«"]([^”»"]+)[”»"]/))
    .filter(Boolean)
    .map(m => m[1].trim().toLowerCase());
  if (!pointsAt.length) return false;
  return (env.features || []).some(f => Object.values(f.name || {})
    .some(n => pointsAt.includes(String(n).trim().toLowerCase())));
}

/** Whether there is a difficulty to print at all. */
function hasDifficulty(env) {
  const d = env.difficulty;
  if (d === null || d === undefined || d === '') return false;
  if (typeof d === 'object') return Boolean(envDifficulty(env)) && !difficultyDefersToFeature(env);
  return true;
}

/** Only a numeric difficulty follows the card to another tier. */
function difficultyScales(env) { return typeof env.difficulty === 'number'; }

/* ---------------- adversaries (data/adversaries.json) ---------------- */

/* A reusable stat block for a "featured adversary" embedded inline in an
 * Environment card — a monster the environment cannot be run without (e.g. the
 * Progenitor Mind in its lair). Kept in its own file rather than duplicated
 * into environments.json, and looked up by id through env.featured_adversaries;
 * an id with no matching entry here is simply skipped, never an error. */
function setAdversaryCatalog(data) {
  const map = new Map();
  (data.adversaries || []).forEach(a => { if (a && a.id) map.set(a.id, a); });
  state.adversaryCatalog = map;
}

function adversaryById(id) { return state.adversaryCatalog.get(id) || null; }
function adversaryName(adv) { return adv.name?.[state.lang] || adv.name?.en || adv.name?.ru || adv.id; }
function bilingual(field) { return field?.[state.lang] || field?.en || field?.ru || ''; }

/* ---------------- FreshCutGrass encounter builder ---------------- */

/* Parsing and resolving an environment's Potential Adversaries text — groups,
 * aliases, adversary families, "Tier N:" entries — lives in
 * js/potential-adversary-utils.js (PotentialAdversaryUtils), the one parser in
 * the app. The environment card's FreshCutGrass links below and Prep's
 * recommended adversaries both read the same canonical English names through
 * it. */
const {
  parsePotentialAdversaryEntry, looksLikeAdversaryName, anyAdversaryFamily,
  resolveAdversaryNames, envAdversaryNames, beastTierGroups, normalizeAdversaryName,
} = PotentialAdversaryUtils;

/** The one FreshCutGrass URL builder for the whole app. Whether an adversary
 * may go to FreshCutGrass at all is decided by
 * FreshCutGrassUtils.isFreshCutGrassSupported() (js/freshcutgrass-utils.js)
 * against state.fcgSupportIndex — never by an adversary's source or tier.
 * Unsupported adversaries are dropped before encoding, and null comes back
 * when none are left — callers render no link then, never an empty
 * encounter. */
function buildFreshCutGrassEncounterUrl(encounterName, adversaryNames) {
  return FreshCutGrassUtils.buildSupportedEncounterUrl(encounterName, adversaryNames, state.fcgSupportIndex);
}

/** The label the reader sees for each canonical adversary name in an
 * environment's Potential Adversaries, keyed by normalized English name. Read
 * from the localized entry at the same index as the English one, and only
 * where the two line up one-to-one; any name not in the map is shown in
 * English. Display only — never part of a compatibility decision. */
function envAdversaryDisplayNames(env) {
  const labels = new Map();
  const english = env?.potential_adversaries?.en || [];
  const localized = env?.potential_adversaries?.[state.lang] || [];
  english.forEach((entry, i) => {
    const canonical = parsePotentialAdversaryEntry(entry);
    const shown = parsePotentialAdversaryEntry(localized[i] ?? entry);
    if (beastTierGroups(canonical) || shown.members.length !== canonical.members.length) return;
    const groupLabel = canonical.isGroup ? canonical.label : null;
    canonical.members.forEach((member, j) => {
      const names = resolveAdversaryNames(groupLabel, member);
      if (names.length === 1) labels.set(normalizeAdversaryName(names[0]), shown.members[j]);
    });
  });
  return labels;
}

/** What the environment's "Open Encounter" action exports: the whole-
 * environment URL (null when no adversary is supported, or the environment
 * names none), how many adversaries it holds, and the readable names of the
 * ones left out. Every environment is eligible, current or future: nothing
 * here reads env.source or any other opt-in list. */
function envEncounterExport(env) {
  const names = envAdversaryNames(env);
  const supported = FreshCutGrassUtils.getFreshCutGrassSupportedAdversaries(names, state.fcgSupportIndex);
  const unsupported = FreshCutGrassUtils.getFreshCutGrassUnsupportedAdversaries(names, state.fcgSupportIndex);
  const url = buildFreshCutGrassEncounterUrl(env.name?.en || envName(env), supported);
  if (!url) return { url: null, supportedCount: 0, total: names.length, unsupportedLabels: [] };
  const labels = unsupported.length ? envAdversaryDisplayNames(env) : null;
  return {
    url,
    supportedCount: supported.length,
    total: names.length,
    unsupportedLabels: unsupported.map(name => labels.get(normalizeAdversaryName(name)) || name),
  };
}

/** Longest list of left-out names the partial-export tooltip spells out. */
const ENCOUNTER_TIP_MAX_NAMES = 4;

/** The tooltip for a mixed environment's "Open Encounter": how many adversaries
 * will be added and which ones will not. Empty when everything is exported. */
function encounterPartialTip(exp) {
  if (!exp.unsupportedLabels.length) return '';
  const head = t('encounter_partial_tip').replace('{n}', exp.supportedCount).replace('{total}', exp.total);
  const labels = exp.unsupportedLabels;
  if (labels.length === 1) return `${head} ${t('encounter_partial_one').replace('{name}', () => labels[0])}`;
  const shown = labels.slice(0, ENCOUNTER_TIP_MAX_NAMES);
  const rest = labels.length - shown.length;
  const list = rest > 0 ? `${shown.join(', ')}, ${t('encounter_partial_more').replace('{n}', rest)}` : shown.join(', ');
  return `${head} ${t('encounter_partial_many').replace('{names}', () => list)}`;
}

const WORD_JOINER = String.fromCharCode(0x2060);

/** THE external-link icon of the encounter integration — the only one: the
 * individual/group adversary links, Prep's picker and selected rows, and both
 * "Open Encounter" actions all render it through here (sizes differ by CSS
 * token only, see .ext-icon). Always present, never swapped, so a link's
 * geometry is identical in every interaction state. */
function extIconHtml(extraClass = '') {
  return `<span class="ext-icon${extraClass ? ' ' + extraClass : ''}" aria-hidden="true">${ITEM_EXT_ICON}</span>`;
}

/** The same icon inside running text: word joiners on both sides stop a wrap
 * from stranding it on a line of its own after a name, or from pushing the
 * following "," / ";" onto the next line. Only for inline text — in a flex
 * row the joiner would become a stray flex item (and an extra gap). */
function inlineExtIconHtml() {
  return `${WORD_JOINER}${extIconHtml()}${WORD_JOINER}`;
}

/** The one tooltip + accessible-name sentence for a link that opens a named
 * adversary or group as an encounter ("Open “Bear” as an encounter in
 * FreshCutGrass"). The aggregate "Open Encounter" actions use
 * t('encounter_open_tip') instead. */
function encounterLinkTip(name) {
  return t('encounter_link_tip').replace('{name}', () => name);
}

/** One inline link for a name in "Potential Adversaries" — a group such as
 * "Beasts" or a single adversary — that opens that name's own FreshCutGrass
 * encounter. An ordinary link, not a button: it reads as part of the sentence,
 * the same as any other link on the page. The visible text stays in the
 * page's own language; the encounter itself is always built from the English
 * counterpart, the same way envAdversaryNames() only ever reads .en — a name a
 * third-party service has to recognize is not something the UI language
 * should get to change. The link carries no tooltip of its own. */
function potentialAdversaryLinkHtml(visibleLabel, encounterName, adversaryNames) {
  const url = buildFreshCutGrassEncounterUrl(encounterName, adversaryNames);
  // Nothing FreshCutGrass knows: ordinary text — not a link, an icon or a
  // greyed-out entity; the adversary is fine, only the integration is absent.
  if (!url) return escapeHtml(visibleLabel);
  // No tooltip and no aria-label: the link styling + icon already say "this
  // opens something", the section hint explains what, and the visible name is
  // the accessible name.
  return `<a class="adversary-encounter-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(visibleLabel)}${inlineExtIconHtml()}</a>`;
}

/** Renders one full potential_adversaries entry — "Beasts (Bear, Dire Wolf,
 * Glass Snake)" — with the group name and every member linked, each to its
 * own encounter. localizedText is what the reader sees; englishText is the
 * same entry's English form, read at the same index, used only to look up the
 * names FreshCutGrass needs. A bare name with no group (e.g. "Sellsword")
 * renders as a single link rather than a label plus a one-item group. An
 * entry that doesn't actually name an adversary — "Any", or a citation such as
 * 'ghostly versions of other adversaries (see "Ghostly Form")' — falls back to
 * the plain text it would have been without this feature, same as an
 * environment that hasn't opted in at all: a name FreshCutGrass can't use is
 * not worth a link, whole or half. A "Tier N: Name, Name" entry (see
 * parsePotentialAdversaryEntry's `style`) renders the same way but joined
 * with ": " instead of wrapped in parens. A parenthetical tier/role
 * annotation ("Bandits (tier 2)") isn't a group at all — the single link
 * covers just the name before it, with the annotation kept as plain text
 * after it. */
function potentialAdversaryEntryHtml(localizedText, englishText) {
  const shown = parsePotentialAdversaryEntry(localizedText);
  const canonical = parsePotentialAdversaryEntry(englishText);
  const beastTiers = beastTierGroups(canonical);
  if (beastTiers) {
    /* "Beasts (any)": one link per tier, each its own encounter. */
    return beastTiers.map(({ tier, names }) => potentialAdversaryLinkHtml(
      `${shown.label} ${t('tier_label')} ${tier}`, `${canonical.label} Tier ${tier}`, names)).join(', ');
  }
  if (!canonical.isGroup) {
    const names = resolveAdversaryNames(null, canonical.label);
    if (!names.length) return escapeHtml(localizedText);
    const link = potentialAdversaryLinkHtml(shown.label, anyAdversaryFamily(canonical.label) || canonical.label, names);
    return shown.annotation ? `${link} (${escapeHtml(shown.annotation)})` : link;
  }
  if (!looksLikeAdversaryName(canonical.label)) return escapeHtml(localizedText);
  const memberNameLists = canonical.members.map(name => resolveAdversaryNames(canonical.label, name));
  if (memberNameLists.some(names => !names.length)) return escapeHtml(localizedText);
  const groupLink = potentialAdversaryLinkHtml(shown.label, canonical.label, memberNameLists.flat());
  const memberLinks = shown.members.map((memberLabel, i) => {
    const names = memberNameLists[i];
    const encounterName = anyAdversaryFamily(canonical.members[i]) || names[0];
    return potentialAdversaryLinkHtml(memberLabel, encounterName, names);
  }).join(', ');
  return canonical.style === 'tier' ? `${groupLink}: ${memberLinks}` : `${groupLink} (${memberLinks})`;
}

/* ---------------- init ---------------- */

function getJSON(path) {
  return fetch(path).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${path}`);
    return r.json();
  });
}

/* The generic shell (toolbar/status/grid skeletons) already ships in
 * index.html — see "Initial loading shell" in CLAUDE.md. i18n and the
 * application data requests are started together rather than one after the
 * other, since the shell no longer needs i18n to be visible; only the
 * translated status text and the final render wait on it. */
async function init() {
  beginInitialLoading();
  const dataPromise = Promise.all([
    getJSON(versionedDataUrl('data/environments.json')),
    getJSON(versionedDataUrl('data/regions.json')).catch(() => ({ regions: [] })),
    getJSON(versionedDataUrl('data/items.json')).catch(() => ({ items: {}, aliases: {} })),
    getJSON(versionedDataUrl('data/journey.json')).catch(() => JOURNEY_EMPTY),
    getJSON(versionedDataUrl('data/adversaries.json')).catch(() => ({ adversaries: [] })),
    // null (not a fallback catalogue) marks a real load failure, so Prep
    // Prep can show its own retry state instead of silently rendering empty
    // adversary/item pickers — see setPrepCatalog() and
    // renderPrepPage() below.
    getJSON(versionedDataUrl('data/prep.json')).catch(() => null),
  ]);
  // Settled immediately so its rejection is handled here, not left dangling
  // while init() is still busy awaiting i18n below.
  const dataResult = dataPromise.then(
    value => ({ ok: true, value }),
    error => ({ ok: false, error })
  );

  try {
    state.i18n = await getJSON(versionedDataUrl('data/i18n.json'));
  } catch (err) {
    renderFatalError(err);
    return;
  }
  SoundboardUI.init({
    t,
    prefs: state.soundboard,
    savePrefs: prefs => persist(LS_KEYS.soundboard, prefs),
    showToast,
  });
  renderHeader();
  renderFooter();
  mountToTop();
  localizeInitialLoading();

  const result = await dataResult;
  if (!result.ok) {
    renderLoadError(result.error);
    return;
  }
  const [envs, regions, items, journey, adversaries, prepData] = result.value;
  setEnvironmentCatalog(envs.environments);
  state.regions = regions.regions || [];
  setItemCatalog(items);
  state.journey = { ...JOURNEY_EMPTY, ...journey };
  setAdversaryCatalog(adversaries);
  if (prepData) setPrepCatalog(prepData);
  else state.prepLoadFailed = true;
  routeSharedPrepLink();
  render();
  finishInitialLoading();
  reportStorageRecovery();
  handleSharedPrepLink();
  initCatalogGridObserver();
}

/* ---------------- initial loading shell lifecycle ---------------- */
/* The only place the static shell's aria-busy state and accessible status
 * get touched. The shell markup itself (index.html) is never recreated —
 * these just localize its status text and clear busy state once, on every
 * success and failure path. */

function beginInitialLoading() {
  document.getElementById('main').setAttribute('aria-busy', 'true');
  document.getElementById('toolbar').setAttribute('aria-busy', 'true');
  document.getElementById('grid-wrap').setAttribute('aria-busy', 'true');
}

function localizeInitialLoading() {
  document.getElementById('result-count').textContent = t('loading');
}

function finishInitialLoading() {
  document.getElementById('main').removeAttribute('aria-busy');
  document.getElementById('toolbar').removeAttribute('aria-busy');
  const grid = document.getElementById('grid-wrap');
  grid.removeAttribute('aria-busy');
  grid.classList.remove('is-loading');
  // The boot-route skeleton flag only styles the shell until the app has
  // rendered; left on <html> it keeps overriding #grid-wrap on every route.
  delete document.documentElement.dataset.bootRoute;
}

function failInitialLoading() {
  document.getElementById('main').setAttribute('aria-busy', 'false');
  document.getElementById('toolbar').setAttribute('aria-busy', 'false');
  const grid = document.getElementById('grid-wrap');
  grid.setAttribute('aria-busy', 'false');
  grid.classList.remove('is-loading');
}

function renderLoadError(err) {
  console.error('[atlas] data load failed', err);
  document.getElementById('toolbar').innerHTML = '';
  document.getElementById('result-count').textContent = '';
  document.getElementById('grid-wrap').innerHTML = emptyStateHtml({
    icon: ICON_ALERT,
    title: t('load_error'),
    hint: t('load_error_hint'),
    action: `<button type="button" class="btn btn-primary" id="retry-load">${t('retry')}</button>`,
    error: true,
  });
  failInitialLoading();
  document.getElementById('retry-load').addEventListener('click', e => {
    e.currentTarget.dataset.loading = 'true';
    location.reload();
  });
}

/* The dictionary itself failed, so there are no strings to say so with. */
function renderFatalError(err) {
  console.error('[atlas] i18n load failed', err);
  document.getElementById('toolbar').innerHTML = '';
  document.getElementById('result-count').textContent = '';
  document.getElementById('grid-wrap').innerHTML = emptyStateHtml({
    icon: ICON_ALERT,
    title: 'Не удалось загрузить атлас. / The atlas could not be loaded.',
    hint: 'Проверьте соединение и обновите страницу. / Check your connection and reload.',
    error: true,
  });
  failInitialLoading();
}

/* ---------------- shared UI primitives ---------------- */

const ICON_ALERT = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 22 20H2L12 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_MINUS = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="m8 12.2 2.7 2.6L16 9.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CHEVRON_UP = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 15 6-6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CHEVRON_DOWN = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SEARCH_EMPTY = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="m15.5 15.5 4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 10.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_BOOKMARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
// The one close glyph: dismiss, clear-value and remove-entry controls all use it
// (the semantic role is carried by the button's class/hover, not by a different glyph).
const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_PLUS = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_MORE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor"/></svg>`;
const ICON_CHECK_PLAIN = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 12.5 4.3 4.3 8.7-9.3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 6.5h15M9.8 6.5V4.9a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v1.6M6.8 6.5l.8 12.3a1 1 0 0 0 1 .9h6.8a1 1 0 0 0 1-.9l.8-12.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.4 10.2v6M13.6 10.2v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_COMPASS =`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="m15 9-2.1 4.9L8 16l2.1-4.9L15 9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const ICON_HEX = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.6 20.1 7v10L12 21.4 3.9 17V7L12 2.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const ICON_REROLL = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CHECKLIST = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M9 4V3.3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m7.8 9.6 1.1 1.1 1.7-1.9M7.8 14.3l1.1 1.1 1.7-1.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 9.4h4.2M13 14.1h4.2M8 17.9h9.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_ADVERSARY_FALLBACK = `<img src="img/adv_fallback.png" alt="" loading="lazy" decoding="async" draggable="false">`;
const ICON_ITEM_FALLBACK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 10.5h15v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5H4V8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10.5v9" stroke="currentColor" stroke-width="1.4"/></svg>`;
// Prep table-header section icons, decorative — the adjacent <span> title names
// the section. Adversaries and Items are illustrated raster assets (img/ui/,
// trimmed square derivatives); Environments is the inline SVG symbol below.
// Distinct from the thumbnail-fallback icons above.
const tableIconHtml = name => `<img class="prep-central-icon" src="img/ui/section-${name}.png" alt="" aria-hidden="true" draggable="false">`;
/* The canonical Environment symbol: a simplified, action-ready adaptation of
 * the Environments section illustration — an incomplete compass ring with three
 * points (N, W, E), a main and a smaller mountain, and one broad winding road.
 * 24x24, transparent, currentColor only: no gradients/filters/raster, so it holds at 16-20px. The ring is deliberately
 * open at the lower right: that gap is where the stateful action icon seats its
 * plus/check badge without covering any of the symbol. One body, two uses —
 * the neutral Prep section icon (below) and the quick add-to-current-Prep
 * action (envPrepButtonHtml()). */
const ENV_SYMBOL_BODY = `<path d="M12.75 20.57A8.6 8.6 0 1 1 20.57 12.75" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12 .8l1.6 2.6h-3.2zM.8 12l2.6-1.6v3.2zM23.2 12l-2.6-1.6v3.2z" fill="currentColor"/><path d="M5.2 14.4 10.2 6.6l5 7.8zM12.2 14.4l2.4-3.8 2.4 3.8z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M10.2 15.9c3 .7-.6 2.5-2.4 4.2l4.2.5c-1.6-1.8 2-3.2-.1-4.7z" fill="currentColor" stroke="currentColor" stroke-width=".8" stroke-linejoin="round"/>`;
/* Neutral: no badge, decorative. Sized/coloured by .prep-central-icon--env. With
 * no badge to seat, the ring's lower-right gap would just look clipped, so this
 * variant closes the ring. */
const ICON_TABLE_ENVIRONMENTS = `<svg class="prep-central-icon prep-central-icon--env" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${ENV_SYMBOL_BODY}<path d="M20.57 12.75A8.6 8.6 0 0 1 12.75 20.57" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
/* Stateful: the same body plus a lower-right badge that carries both glyphs;
 * CSS shows the plus or the check from the button's own state class, so a
 * state change never rebuilds the SVG. */
const ICON_ENV_ACTION = `<svg class="env-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${ENV_SYMBOL_BODY}<circle class="env-badge-dot" cx="19" cy="19" r="4.3"/><path class="env-badge-glyph env-badge-plus" d="M19 17v4M17 19h4"/><path class="env-badge-glyph env-badge-check" d="m16.9 19.2 1.5 1.5 2.7-3"/></svg>`;
const ICON_TABLE_ADVERSARIES = tableIconHtml('adversaries');
const ICON_TABLE_ITEMS = tableIconHtml('items');
// Items panel's Gallery/Compact view switch — a plain 2x2 grid vs. a
// three-line list, the same visual shorthand grid/list icons use
// elsewhere on the web; no icon package, matching every other ICON_* here.
const ICON_VIEW_GALLERY = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/></svg>`;
const ICON_VIEW_COMPACT = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

/** One empty/error state for the whole app: an icon, a headline, a line of help
 * and — the part the old dashed box was missing — the action that resolves it. */
function emptyStateHtml({ icon, title, hint, action = '', error = false }) {
  return `
    <div class="empty-state${error ? ' is-error' : ''}"${error ? ' role="alert"' : ''}>
      ${icon}
      <p>${escapeHtml(title)}</p>
      ${hint ? `<p>${escapeHtml(hint)}</p>` : ''}
      ${action}
    </div>`;
}

/** Returns { el, timer } so a caller that needs to dedupe (see
 * reportStorageWriteFailure below) can clear the pending removal and reuse
 * the element instead of stacking a second toast. Callers that don't need
 * that just ignore the return value, same as before. */
function showToast(message, kind = 'success', durationMs = 3200) {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = kind === 'error' ? 'toast is-error' : 'toast';
  toast.innerHTML = `${kind === 'error' ? ICON_ALERT : kind === 'removed' ? ICON_MINUS : ICON_CHECK}<span></span>`;
  toast.querySelector('span').textContent = message;
  stack.appendChild(toast);
  const timer = setTimeout(() => toast.remove(), durationMs);
  return { el: toast, timer };
}

/* Longer than the default toast: this warning matters more than a routine
 * confirmation and needs time to actually be read. */
const STORAGE_WARNING_TOAST_MS = 8000;

/** Shown once, after i18n and the first render are ready — never during
 * state construction, since t() has nothing to translate with yet. Reads
 * only the key/reason recovery summary SafeStorage kept; never the raw
 * stored values it recovered from. */
function reportStorageRecovery() {
  const summary = SafeStorage.getRecoverySummary();
  if (!summary.hasIssues) return;
  SafeStorage.logRecoverySummary();
  const keys = SafeStorage.recoveryMessageKeys(summary);
  if (!keys) return;
  const message = keys.backupNote ? `${t(keys.main)} ${t(keys.backupNote)}` : t(keys.main);
  showToast(message, 'error', STORAGE_WARNING_TOAST_MS);
}

/* Separate from reportStorageRecovery() above: that one is about data that
 * was already broken before this page load, this one is about a user action
 * just now failing to persist. Kept as its own toast handle so several
 * failures in a row (e.g. rapid Journey edits while storage is blocked)
 * refresh one visible warning instead of stacking duplicates. */
let storageWriteWarningToast = null;

/** Never receives — and never logs — the value that failed to persist, only
 * the key name, the structured failure reason, and whether rollback (for a
 * batch write) succeeded. */
function reportStorageWriteFailure(result) {
  console.warn('[atlas] Browser storage write failed', {
    key: result.failedKey,
    reason: result.reason,
    rollbackSucceeded: result.rollbackSucceeded,
  });
  const message = t('storage_write_failed_warning');
  if (storageWriteWarningToast && storageWriteWarningToast.el.isConnected) {
    clearTimeout(storageWriteWarningToast.timer);
    storageWriteWarningToast.el.querySelector('span').textContent = message;
    storageWriteWarningToast.timer = setTimeout(() => storageWriteWarningToast.el.remove(), STORAGE_WARNING_TOAST_MS);
    return;
  }
  storageWriteWarningToast = showToast(message, 'error', STORAGE_WARNING_TOAST_MS);
}

/* ---------------- persistence boundary ----------------
   The only functions in this file allowed to reach into browser storage.
   Everything else in app.js works with state and calls these — see the
   "Safe browser storage" section in CLAUDE.md. Each returns the structured
   SafeStorage result so a caller can decide whether a success toast is
   honest to show; reportStorageWriteFailure() above handles the failure
   side once, here, so no call site has to. */

function persist(key, value) {
  const result = SafeStorage.writeJson(lsStorage, key, value);
  if (!result.ok) reportStorageWriteFailure({ ...result, failedKey: key });
  return result;
}

function persistRaw(key, value) {
  const result = SafeStorage.writeRaw(lsStorage, key, value);
  if (!result.ok) reportStorageWriteFailure({ ...result, failedKey: key });
  return result;
}

/** entries: [{ key, value }, …] — see SafeStorage.writeJsonBatch. One failed
 * batch produces exactly one warning, not one per key. */
function persistBatch(entries) {
  const result = SafeStorage.writeJsonBatch(lsStorage, entries);
  if (!result.ok) reportStorageWriteFailure(result);
  return result;
}

/* ---------------- tooltip ---------------- */

/* One element for the whole page, driven by data-tip. The native title it
 * replaces waits ~700ms, cannot be styled and never shows on a keyboard
 * focus. Presentational only: every trigger carries its own accessible name,
 * so the tooltip stays out of the accessibility tree rather than
 * double-announcing it. */
const TIP_DELAY_MS = 200;
let tipEl = null;
let tipTimer = null;
let tipTarget = null;

function tipNode() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'tooltip';
    tipEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function placeTip(target, el) {
  const r = target.getBoundingClientRect();
  const t = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - 8));
  // Above by preference; below when there is no room, so it never leaves the screen.
  const above = r.top - t.height - 8;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(above < 8 ? r.bottom + 8 : above)}px`;
}

/** Plain text (`data-tip`, the common case) is set via textContent, same
 * as always. `data-tip-rich` opts a trigger into a multi-paragraph HTML
 * rendering instead (used only by the item browser's dice buttons, whose
 * rarity-guidance tooltip needs bold headings and separate paragraphs —
 * see itemDiceTooltipHtml()); its value is always built from static
 * i18n strings through escapeAttr()/escapeHtml() before reaching here,
 * never from user input, the same trust boundary every other innerHTML
 * call site in this file already relies on. */
function showTip(target) {
  const rich = target.dataset.tipRich;
  const text = target.dataset.tip;
  if (!rich && !text) return;
  const el = tipNode();
  el.classList.toggle('tooltip-rich', !!rich);
  if (rich) el.innerHTML = rich;
  else el.textContent = text;
  placeTip(target, el);
  el.classList.add('is-open');
  tipTarget = target;
}

function hideTip() {
  clearTimeout(tipTimer);
  tipTarget = null;
  if (tipEl) tipEl.classList.remove('is-open');
}

// Mouse only: on a touch screen pointerover fires with the tap and the tooltip
// would stick around with nothing to dismiss it.
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const target = e.target.closest?.('[data-tip], [data-tip-rich]');
  if (!target || target === tipTarget) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(target), TIP_DELAY_MS);
});
// Moving between a trigger's own children (label → badge → icon) is not
// leaving it: only hide when the pointer actually exits the trigger.
document.addEventListener('pointerout', e => {
  const target = e.target.closest?.('[data-tip], [data-tip-rich]');
  if (target && !target.contains(e.relatedTarget)) hideTip();
});
// No delay for the keyboard: focus is already a deliberate act. Deferred to
// the end of the task because moving focus can scroll the element into view,
// and the scroll handler below would otherwise dismiss the tooltip as it
// appeared. A timeout rather than a frame: nothing here needs to line up with
// a paint, and rAF does not run at all in a background tab. Guarded on the
// focus target rather than on document.activeElement, which does not reliably
// track programmatic focus while the window is in the background.
let tipFocusTarget = null;
document.addEventListener('focusin', e => {
  const target = e.target.closest?.('[data-tip], [data-tip-rich]');
  if (!target) return;
  clearTimeout(tipTimer);
  tipFocusTarget = target;
  setTimeout(() => { if (tipFocusTarget === target) showTip(target); }, 0);
});
document.addEventListener('focusout', () => { tipFocusTarget = null; hideTip(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
// A focused trigger keeps its tooltip and takes it along; a hovered one loses
// it, since the pointer has effectively left the element.
document.addEventListener('scroll', () => {
  if (tipTarget && tipTarget === tipFocusTarget) placeTip(tipTarget, tipNode());
  else hideTip();
}, true);

/* ---------------- overlay plumbing ---------------- */

/* Every overlay in the app — the environment card, the add-to-list popup and
 * the item card — goes through this. It is what gives them Escape, a focus
 * trap, focus restored to whatever opened them, and a page behind that stays
 * put instead of scrolling under the wheel. */
const overlayStack = [];
let scrollLockY = 0;

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusableIn(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
}

/** What Tab may reach while `overlay` is on top. The floating language switch
 * sits outside every overlay but has to stay reachable, so it joins the ring —
 * at the end, matching its place as the last thing in the document. */
function trapItems(overlay) {
  const float = document.getElementById('lang-float');
  const sb = SoundboardUI.openPanelElement();
  return [...focusableIn(overlay), ...(float ? focusableIn(float) : []), ...(sb ? focusableIn(sb) : [])];
}

function trapHolds(overlay, node) {
  const float = document.getElementById('lang-float');
  const sb = SoundboardUI.openPanelElement();
  return overlay.contains(node) || !!(float && float.contains(node)) || !!(sb && sb.contains(node));
}

/* position:fixed rather than overflow:hidden — iOS Safari ignores the latter on
 * body once a nested element is scrolling. The offset is restored on unlock so
 * the catalog is exactly where it was left. */
function lockScroll() {
  if (overlayStack.length !== 1) return;
  scrollLockY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollLockY}px`;
  document.body.style.insetInline = '0';
}

function unlockScroll() {
  if (overlayStack.length) return;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.insetInline = '';
  window.scrollTo(0, scrollLockY);
}

/** Wires an overlay up and returns its teardown. `closeFn` is the caller's own
 * close routine, so Escape and the trap stay in step with the click handlers. */
function registerOverlay(overlay, closeFn) {
  const previouslyFocused = document.activeElement;
  overlayStack.push(overlay);
  lockScroll();
  syncToTop();

  function onKeyDown(e) {
    if (overlayStack[overlayStack.length - 1] !== overlay) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFn(); return; }
    if (e.key !== 'Tab') return;
    const items = trapItems(overlay);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const inside = trapHolds(overlay, document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
      e.preventDefault(); first.focus();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  const card = overlay.querySelector('[data-overlay-card]');
  if (card) {
    card.setAttribute('tabindex', '-1');
    card.focus({ preventScroll: true });
  }
  syncLangFloat();

  return function teardown() {
    document.removeEventListener('keydown', onKeyDown);
    const i = overlayStack.indexOf(overlay);
    if (i !== -1) overlayStack.splice(i, 1);
    unlockScroll();
    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus({ preventScroll: true });
    }
    // After unlockScroll, which puts the catalog back where it was — the
    // button's threshold is read off the restored offset, not off zero.
    syncToTop();
    syncLangFloat();
  };
}

/* Belt to the animationend braces: a browser that fires no event at all must
 * still not leave the overlay stuck mid-exit. Comfortably longer than --t-base. */
const OVERLAY_EXIT_MAX_MS = 400;

/** Plays the exit animation, then hands over to the overlay's own `closeFn`.
 * For a close the user did not ask for — one they have to see happening.
 * animationend rather than a duration copied out of the stylesheet, so the two
 * cannot drift apart, and so prefers-reduced-motion (which squashes every
 * animation to nothing) lands the event at once instead of pausing on a card
 * already faded out. */
function closeOverlayAnimated(overlay, closeFn) {
  overlay.classList.add('is-closing');
  const card = overlay.querySelector('[data-overlay-card]');
  if (card) {
    card.addEventListener('animationend', function onEnd(e) {
      // animationend bubbles — anything inside the card that happens to be
      // animating must not be taken for the card's own exit finishing.
      if (e.target !== card) return;
      card.removeEventListener('animationend', onEnd);
      closeFn();
    });
  }
  setTimeout(closeFn, OVERLAY_EXIT_MAX_MS);
}

/* ---------------- language ---------------- */

function langButtonsHtml() {
  return ['ru', 'en'].map(l => `
    <button type="button" data-lang="${l}" aria-pressed="${state.lang === l}"
            class="${state.lang === l ? 'active' : ''}">${l.toUpperCase()}</button>`).join('');
}

function bindLangSwitch(root) {
  root.querySelectorAll('[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
}

function markLangSwitch(root) {
  root.querySelectorAll('[data-lang]').forEach(btn => {
    const on = btn.dataset.lang === state.lang;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function setLang(lang) {
  if (state.lang === lang) return;
  /* The card is rebuilt in the new language and takes the focus with it, so a
   * switch made from the floating control would otherwise cost the reader
   * their place on it — and the first thing they want next is usually the way
   * back. */
  const fromFloat = document.getElementById('lang-float')?.contains(document.activeElement);
  state.lang = lang;
  persist(LS_KEYS.lang, state.lang);
  render();
  // render() → syncDetail() → applyDetailRoute() already restacks an item
  // card that sits on top of an environment overlay (its own stale check,
  // gated on state.route.env). A standalone one — no environment overlay
  // beneath it, e.g. opened from Prep's item picker — is outside
  // that path, so it would otherwise be left showing the old language.
  if (openItemId && openDetailId === null) {
    const id = openItemId;
    closeOpenItemDetail();
    openItemDetail(id, { quiet: true });
  }
  if (fromFloat) {
    document.getElementById('lang-float')?.querySelector(`[data-lang="${lang}"]`)?.focus();
  }
}

/** A second language switch, pinned to the top-right corner, for as long as a
 * stat block is open: the header's own switch is behind the backdrop, and
 * checking the English wording of a feature is something readers do mid-card,
 * not before they open one.
 *
 * It stands down while a popup over the card owns the screen — a switch
 * rebuilds the card underneath, which would leave the popup stranded above a
 * card that is no longer the one it was opened from. */
function syncLangFloat() {
  const blocked = overlayStack.some(o => o.dataset.overlayKind === 'popup');
  // Read off the stack rather than openDetailId/openItemId: an item card opened
  // from Prep has no environment card beneath it, and those variables are set
  // only after registerOverlay() has already called this.
  const cardOpen = overlayStack.some(o => o.dataset.overlayKind === 'detail' || o.dataset.overlayKind === 'item');
  let el = document.getElementById('lang-float');
  if (!cardOpen || blocked) {
    el?.remove();
    document.body.classList.remove('has-lang-float');
    SoundboardUI.syncFloat(null);
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'lang-float';
    el.className = 'lang-switch lang-float';
    el.innerHTML = langButtonsHtml();
    bindLangSwitch(el);
    document.body.appendChild(el);
    document.body.classList.add('has-lang-float');
  }
  markLangSwitch(el);
  SoundboardUI.syncFloat(el);
  // Kept last in the document — an overlay opened on top of the card is
  // appended after it, and the focus ring in trapItems() follows DOM order.
  if (el.nextSibling) document.body.appendChild(el);
  updateLangFloatOffset();
}

/** Measures the scrollbar of the card's overlay — the one bar that reaches the
 * right edge of the screen, whatever else is stacked on top — and hands the
 * width to CSS, which keeps the switch beside it rather than on it. Anything
 * that can change whether that overlay scrolls has to call this. */
function updateLangFloatOffset() {
  const el = document.getElementById('lang-float');
  if (!el) return;
  const scroller = document.getElementById('detail-modal')?.closest('.modal-overlay')
    ?? overlayStack.find(o => o.dataset.overlayKind === 'item');
  const width = scroller ? scroller.offsetWidth - scroller.clientWidth : 0;
  el.style.setProperty('--sbw', `${Math.max(0, width)}px`);
}

// A card that fits the window has no scrollbar, and resizing is what decides
// that. Cheap: it does nothing at all unless a card is open.
window.addEventListener('resize', updateLangFloatOffset);

/* ---------------- environment backdrop ---------------- */

/* Environments with a painting to be read against. Every file is named after the
 * id, so a new one is a line here, img/env/<id>.jpg for the backdrop, and the
 * img/env/thumb/<id>-{200,400,800}.avif plus -400.webp that a list cover is
 * served from. Listed rather than probed: the environments without a picture are
 * the majority, and none of them should spend a 404 finding that out. */
const ENV_ART = new Set([
  'cauldera-valley',
  'field-of-dreams',
  'ouroborean-pass',
]);

/* Which band of a painting to keep when its frame is wider than it is. A cover
 * tile the card wide shows the whole width and about two fifths of the height,
 * and the middle two fifths is a mechanical choice rather than a composed one:
 * the pass wants its coiling road, so it sits a little high, and the field
 * wants its stones and flowers rather than more sky, so it sits a little low.
 * Cauldera Valley reads from the middle and is not listed. The backdrop takes
 * the same figure, so a painting is cut the same way wherever it is shown. */
const ENV_ART_FOCUS = {
  'field-of-dreams': '58%',
  'ouroborean-pass': '42%',
};

/* Below this the stat block stops being a card in a margin and becomes a sheet
 * filling the screen — there is no ground left behind it to show a picture on,
 * so a phone is not asked to fetch one. Same breakpoint as that rule. */
const ENV_ART_ROOM = window.matchMedia('(min-width: 641px)');

/** Hangs the open card's painting behind it, and takes it down with the card.
 * Driven by the card that is open rather than by the one being opened, so a card
 * rebuilt in the other language keeps the same picture on screen the whole way
 * through: the layer is reused and never arrives twice. */
function syncEnvBackdrop() {
  const wanted = openDetailId !== null && ENV_ART.has(openDetailId) && ENV_ART_ROOM.matches
    ? `img/env/${openDetailId}.jpg`
    : null;
  let el = document.getElementById('env-backdrop');
  if (!wanted) {
    el?.remove();
    document.body.classList.remove('has-env-backdrop');
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'env-backdrop';
    el.className = 'env-backdrop';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<img alt="" decoding="async">';
    /* Before the floating switch, which has to stay the last thing in the
     * document — insertBefore against a switch that is not there yet appends,
     * which is where this belongs anyway. */
    document.body.insertBefore(el, document.getElementById('lang-float'));
    document.body.classList.add('has-env-backdrop');
  }
  const img = el.firstElementChild;
  if (img.getAttribute('src') === wanted) return;
  img.classList.remove('is-on');
  img.addEventListener('load', () => img.classList.add('is-on'), { once: true });
  img.style.setProperty('--focus', ENV_ART_FOCUS[openDetailId] || '50%');
  img.src = wanted;
}

// A window widened past the sheet breakpoint uncovers ground the picture should
// be on; narrowed back, the sheet covers it again and the layer stands down.
ENV_ART_ROOM.addEventListener('change', syncEnvBackdrop);

/* ---------------- back to top ---------------- */

/* The catalog and a saved list are both long enough to lose the header in, and
 * the search field is up there. One full screen of scrolling is the threshold:
 * any less and the header is a flick away, so the button would be covering
 * cards for nothing.
 *
 * It stands down while any overlay is open. The page behind one is scroll
 * locked, so there would be nothing for it to scroll, and the card is what the
 * reader is looking at. */
function toTopShown() {
  return !overlayStack.length && window.scrollY > window.innerHeight;
}

/** Visibility and label in one pass, so a scroll, an overlay and a language
 * switch can all just call this. */
function syncToTop() {
  const el = document.getElementById('to-top');
  if (!el) return;
  const shown = toTopShown();
  el.classList.toggle('is-on', shown);
  // The toast stack shares this corner and has to know to step over it.
  document.body.classList.toggle('has-to-top', shown);
  el.setAttribute('aria-label', t('back_to_top'));
  el.dataset.tip = t('back_to_top');
}

function mountToTop() {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = 'to-top';
  el.className = 'to-top';
  el.innerHTML = ICON_CHEVRON_UP;
  el.addEventListener('click', () => {
    /* The reduced-motion rule in the stylesheet cannot reach this: an explicit
     * `behavior` in the options beats the computed scroll-behavior. */
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    // Sending focus back to the top of the page as well, so a keyboard user
    // carries on from where the button took them rather than from the corner.
    document.getElementById('main')?.focus({ preventScroll: true });
  });
  document.body.appendChild(el);
  window.addEventListener('scroll', syncToTop, { passive: true });
  window.addEventListener('resize', syncToTop);
  syncToTop();
}

/* ---------------- rendering ---------------- */

function render() {
  document.documentElement.lang = state.lang;
  if (state.route.name === 'list' && !state.lists.some(l => l.id === state.route.id)) {
    state.route = { name: 'lists' };
    if (location.hash !== '#/lists') location.hash = '#/lists';
  }
  document.body.dataset.route = state.route.name;
  document.title = routeTitle();
  // The Journey 2 diagnostic map owns listeners, observers and a large raster;
  // this is the one place it is released when any other route renders.
  if (state.route.name !== 'journey2') Journey2View.unmount();
  renderHeader();
  renderJourneyVersionSwitch();
  // renderPrepPage() owns creating/destroying the item strip and the
  // top-chrome controller for its own re-renders; this is the one place
  // that tears both down when navigating to any *other* route.
  if (state.route.name !== 'prep') {
    destroyPrepItemNav();
    destroyPrepItemDice();
    destroyPrepChrome();
  }
  // Progressive loading is main-catalog-only (never Lists, Journey, or
  // Prep) — renderGrid() only runs for 'catalog'/'list' below, so
  // any other route has to clear the control itself rather than leaving it
  // showing a stale count from whichever route was open before.
  if (state.route.name !== 'catalog') {
    const more = document.getElementById('catalog-more');
    if (more) more.innerHTML = '';
  }
  if (state.route.name === 'lists') {
    renderListsHome();
  } else if (state.route.name === 'journey') {
    renderJourneyPage();
  } else if (state.route.name === 'journey2') {
    renderJourney2Page();
  } else if (state.route.name === 'prep') {
    renderPrepPage();
  } else {
    renderToolbar();
    renderGrid();
  }
  renderFooter();
  syncToTop();
  syncDetail();
}

/** Brings the open card into line with the address, and the two layers that
 * belong to a card — its painting and the floating language switch — into line
 * with the card. Every open and close runs through here, so this is the one
 * place any of the three has to be kept in step. */
function syncDetail() {
  applyDetailRoute();
  syncEnvBackdrop();
  syncLangFloat();
}

/** Opens the card the URL names and closes one it no longer does. The only
 * place a detail card is created or destroyed, so the two can never
 * disagree. */
function applyDetailRoute() {
  const wanted = state.route.env;
  // A language switch leaves the same card at the same address holding the old
  // language's text. Rebuilding is the only way to change it, since the card is
  // written out in one piece.
  const stale = openDetailId !== null && openDetailLang !== state.lang;
  if (wanted === openDetailId && !stale) return;
  /* Rebuilt for the language alone, the card should come back the way the
   * reader left it rather than as a freshly opened one. */
  const carry = stale && wanted === openDetailId ? detailViewState() : null;
  // Taken down before the card it stands on and put back after it, so it keeps
  // its place at the top of the stack.
  const restackItem = carry ? openItemId : null;
  if (restackItem) closeOpenItemDetail();
  if (openDetailId) closeDetailOverlay();
  if (!wanted) return;
  if (!allEnvs().some(e => e.id === wanted)) {
    // A link to an environment that is not in the catalog: drop the suffix
    // rather than leave the address pointing at nothing.
    history.replaceState(null, '', baseHash() || location.pathname + location.search);
    state.route = readCurrentRoute();
    document.title = routeTitle();
    return;
  }
  openDetailOverlay(wanted, carry);
  if (restackItem) openItemDetail(restackItem, { quiet: true });
}

/** What the reader has done to the open card that its address does not record:
 * the tier they are reading it at, and how far down they have scrolled. Read
 * off the DOM, so it costs nothing while no card needs rebuilding. */
function detailViewState() {
  const overlay = document.getElementById('detail-modal')?.closest('.modal-overlay');
  if (!overlay) return null;
  const activeTier = overlay.querySelector('[data-view-tier].active');
  return {
    viewTier: activeTier ? Number(activeTier.dataset.viewTier) : null,
    scrollTop: overlay.scrollTop,
    /* A tracker part-way through a scene is play state, not text: the same
     * countdowns stand in both languages, so their values — and any panel left
     * open on screen — ride across the rebuild rather than resetting under a
     * reader who only wanted to check the wording. */
    countdowns: [...overlay.querySelectorAll('.countdown-btn')].map(btn => ({
      count: btn.dataset.count,
      open: !!(btn._countdownOverlay && document.body.contains(btn._countdownOverlay)),
    })),
  };
}

/** An open list names itself in the tab, so several of them are tellable apart
 * in a tab strip or a history list. */
function routeTitle() {
  // An open card names itself, so a shared link and a history entry both say
  // which environment they lead to.
  const env = state.route.env && allEnvs().find(e => e.id === state.route.env);
  if (env) return `${envName(env)} — ${t('app_title')}`;
  if (state.route.name === 'catalog') return t('browser_title');
  if (state.route.name === 'journey') return `${t('journey_title')} — ${t('app_title')}`;
  if (state.route.name === 'journey2') return `${t('journey2_title')} — ${t('app_title')}`;
  if (state.route.name === 'prep') return `${t('prep_title')} — ${t('app_title')}`;
  if (state.route.name === 'list') {
    const list = state.lists.find(l => l.id === state.route.id);
    if (list) return `${list.name} — ${t('app_title')}`;
  }
  return `${t('lists_title')} — ${t('app_title')}`;
}

/** Corner [V1][V2] switch shown only on #/journey (V1) and #/journey2 (V2, the default
 * Journey entry point). A plain body-level control so it survives the page redraws. */
function renderJourneyVersionSwitch() {
  let el = document.getElementById('journey-version-switch');
  const name = state.route.name;
  if (name !== 'journey' && name !== 'journey2') { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'journey-version-switch';
    el.className = 'journey-version-switch';
    el.setAttribute('role', 'group');
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-href]');
      if (b) navigate(b.dataset.href);
    });
    document.body.appendChild(el);
  }
  el.setAttribute('aria-label', t('journey_version_label'));
  el.innerHTML = [['V1', '#/journey', 'journey'], ['V2', '#/journey2', 'journey2']].map(([label, href, id]) =>
    `<button type="button" data-href="${href}" aria-pressed="${name === id}" class="${name === id ? 'active' : ''}">${label}</button>`).join('');
}

function renderHeader() {
  const el = document.getElementById('header');
  /* Named routes, not "anything but the catalog" — with a third section that
   * test marked Lists as the current page while the generators were open. */
  const onLists = state.route.name === 'lists' || state.route.name === 'list';
  const onJourney = state.route.name === 'journey' || state.route.name === 'journey2';
  const onPrep = state.route.name === 'prep';
  el.innerHTML = `
    <a class="skip-link" href="#grid-wrap">${t('skip_to_content')}</a>
    <div class="header-inner">
      <div class="brand">
        <img class="brand-mark" src="img/brand-logo.png?v=2" alt="" aria-hidden="true">
        <span class="brand-text">
          <h1><button type="button" id="brand-home" aria-label="${t('app_title')}"><span class="brand-title-text">${t('app_title')}</span></button></h1>
          <span class="brand-meta">
            <span class="brand-subtitle">${t('app_subtitle_compact')}</span>
            <span class="brand-separator" aria-hidden="true">·</span>
            <span class="compat-label">${t('compatibility_label')}</span>
          </span>
        </span>
      </div>
      <div class="header-actions">
        <nav class="header-nav" aria-label="${t('main_nav')}">
          <button type="button" class="btn nav-btn ${onLists ? 'active' : ''}" id="btn-lists"
                  aria-label="${t('nav_lists')}"
                  ${onLists ? 'aria-current="page"' : ''}>${ICON_BOOKMARK}<span>${t('nav_lists')}</span></button>
          <button type="button" class="btn nav-btn ${onPrep ? 'active' : ''}" id="btn-prep"
                  aria-label="${t('nav_prep')}"
                  ${onPrep ? 'aria-current="page"' : ''}>${ICON_CHECKLIST}<span>${t('nav_prep')}</span></button>
          <button type="button" class="btn nav-btn ${onJourney ? 'active' : ''}" id="btn-journey"
                  aria-label="${t('nav_journey')}"
                  ${onJourney ? 'aria-current="page"' : ''}>${ICON_COMPASS}<span>${t('nav_journey')}</span></button>
        </nav>
        <div class="header-utils">
          ${SoundboardUI.triggerHtml()}
          <div class="lang-switch">${langButtonsHtml()}</div>
        </div>
      </div>
    </div>`;
  bindLangSwitch(el);
  SoundboardUI.sync();
  document.getElementById('btn-lists').addEventListener('click', () => navigate('#/lists'));
  document.getElementById('btn-prep').addEventListener('click', () => navigate('#/prep'));
  document.getElementById('btn-journey').addEventListener('click', () => navigate('#/journey2'));
  // A real <button> now, so Enter and Space come for free — the old div carried
  // role="button" and tabindex but no key handler, and did nothing when focused.
  document.getElementById('brand-home').addEventListener('click', () => navigate(''));
  // The route lives in location.hash, so letting the anchor write "#grid-wrap"
  // there would parse as the catalog and navigate away from the lists page.
  // Move focus by hand and leave the hash alone.
  el.querySelector('.skip-link').addEventListener('click', e => {
    e.preventDefault();
    const target = document.getElementById('grid-wrap');
    target.setAttribute('tabindex', '-1');
    target.focus();
    target.scrollIntoView({ block: 'start' });
  });
}

// Long enough to swallow a burst of typing, short enough that the grid still
// feels like it is following the keyboard.
const SEARCH_DEBOUNCE_MS = 120;

// The trigger always reads as the group's own name, with a running count
// beside it once something is picked — never the picks themselves, so the
// button doesn't reflow every time a selection changes.
function typesTriggerLabel(types) {
  const count = types.filter(type => state.filters.types.has(type)).length
    + (state.filters.regionOnly ? 1 : 0);
  return count ? `${t('filter_type')} (${count})` : t('filter_type');
}

function biomesTriggerLabel(biomes) {
  const count = biomes.filter(biome => state.filters.biomes.has(biome)).length;
  return count ? `${t('filter_biome')} (${count})` : t('filter_biome');
}

function sourcesTriggerLabel(sources) {
  const count = sources.filter(source => state.filters.sources.has(source)).length;
  return count ? `${t('filter_source')} (${count})` : t('filter_source');
}

function renderToolbar() {
  // The toolbar is about to be torn down and rebuilt; any open dropdown's
  // listeners would otherwise reference DOM nodes this innerHTML replace is
  // just about to detach.
  closeActiveMultiSelect();
  const el = document.getElementById('toolbar');
  const envs = currentEnvs();
  /* Every group offers only what the environments in front of you actually
   * carry. On the catalog that is the full set, so nothing changes there; on a
   * list it stops the toolbar promising ranks, types and biomes the list has
   * none of, and an empty list drops the groups altogether. Canonical order is
   * kept by filtering the reference arrays rather than collecting a Set. */
  const has = { tiers: new Set(), types: new Set(), sources: new Set(), biomes: new Set() };
  envs.forEach(e => {
    has.tiers.add(e.tier);
    has.types.add(e.type);
    if (e.source) has.sources.add(e.source);
    (e.biomes || []).forEach(b => has.biomes.add(b));
  });
  const usedTiers = [1, 2, 3, 4].filter(tier => has.tiers.has(tier));
  const types = TYPES.filter(type => has.types.has(type));
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  const usedSources = [...has.sources].sort(collator.compare);
  const usedBiomes = BIOMES.filter(biome => has.biomes.has(biome));
  /* A filter left pointing at something the current route cannot show would
   * empty the grid with no control still on screen to undo it. */
  state.filters.tiers.forEach(v => { if (!has.tiers.has(v)) state.filters.tiers.delete(v); });
  state.filters.types.forEach(v => { if (!has.types.has(v)) state.filters.types.delete(v); });
  state.filters.sources.forEach(v => { if (!has.sources.has(v)) state.filters.sources.delete(v); });
  state.filters.biomes.forEach(v => { if (!has.biomes.has(v)) state.filters.biomes.delete(v); });
  // The region pill sits alongside the type pills but filters on region
  // membership, not env.type. Regions only make sense on the full catalog, so
  // the pill — and any filter left over from it — is dropped elsewhere.
  const showRegionPill = state.route.name === 'catalog';
  if (!showRegionPill) state.filters.regionOnly = false;

  const listBar = state.route.name === 'list' ? (() => {
    const list = state.lists.find(l => l.id === state.route.id);
    return `<div class="list-context-bar">
      <button class="btn btn-sm btn-ghost" id="btn-back-to-lists">${t('back_to_lists')}</button>
      <h2 class="list-context-title">${escapeHtml(list ? list.name : '')}</h2>
    </div>`;
  })() : '';

  // How many filter groups are narrowing the list right now. Only shown next to
  // the phone-width disclosure, where the filters themselves are out of sight.
  const activeGroups = (state.filters.tiers.size ? 1 : 0) + (state.filters.types.size ? 1 : 0)
    + (state.filters.sources.size ? 1 : 0) + (state.filters.biomes.size ? 1 : 0) + (state.filters.regionOnly ? 1 : 0);

  el.innerHTML = listBar + `
    <div class="toolbar" data-filters-open="${state.filtersOpen}">
      <div class="field search-field">
        <div class="search-input-wrap">
          <svg class="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/>
            <line x1="13.6" y1="13.6" x2="18" y2="18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          <input type="text" id="f-search" aria-label="${t('search_label')}" placeholder="${t('search_placeholder')}" value="${escapeAttr(state.filters.search)}">
          <button type="button" class="icon-btn icon-btn--reach search-clear-btn" id="f-search-clear" aria-label="${t('clear_filters')}" style="${state.filters.search ? '' : 'display:none;'}">${ICON_CLOSE}</button>
        </div>
      </div>
      <button type="button" class="btn filter-toggle" id="f-toggle"
              aria-expanded="${state.filtersOpen}" aria-controls="toolbar-filters">
        ${t('filters_label')}
        ${activeGroups ? `<span class="filter-count" aria-label="${t('filters_active').replace('{n}', activeGroups)}">${activeGroups}</span>` : ''}
      </button>
      <div class="toolbar-filters" id="toolbar-filters">
        ${usedTiers.length ? `
        <div class="field">
          <div class="rank-pills field-control" id="f-tiers" role="group" aria-label="${t('filter_tier')}">
            ${usedTiers.map(tier => `<button type="button" class="rank-icon ${state.filters.tiers.has(tier) ? 'active' : ''}" data-tier="${tier}" aria-pressed="${state.filters.tiers.has(tier)}" aria-label="${t('tier_label')} ${tier}"><span>${tier}</span></button>`).join('')}
          </div>
        </div>` : ''}
        ${types.length || showRegionPill ? `
        <div class="field ms-field" id="f-types-field">
          <button type="button" class="ms-trigger field-control" id="f-types-btn"
                  aria-expanded="false" aria-controls="f-types-panel">
            <span class="ms-trigger-label">${typesTriggerLabel(types)}</span>
          </button>
          <div class="ms-panel" id="f-types-panel" role="group" aria-label="${t('filter_type')}" hidden>
            ${types.map(type => `
            <label class="ms-row">
              <input type="checkbox" class="ms-checkbox sr-only" data-type="${type}" ${state.filters.types.has(type) ? 'checked' : ''}>
              <span class="ms-row-label">${t('type_' + type)}</span>
            </label>`).join('')}
            ${showRegionPill ? `
            <label class="ms-row">
              <input type="checkbox" class="ms-checkbox sr-only" data-type="region" ${state.filters.regionOnly ? 'checked' : ''}>
              <span class="ms-row-label">${t('region_label')}</span>
            </label>` : ''}
          </div>
        </div>` : ''}
        ${usedBiomes.length ? `
        <div class="field ms-field" id="f-biomes-field">
          <button type="button" class="ms-trigger field-control" id="f-biomes-btn"
                  aria-expanded="false" aria-controls="f-biomes-panel">
            <span class="ms-trigger-label">${biomesTriggerLabel(usedBiomes)}</span>
          </button>
          <div class="ms-panel" id="f-biomes-panel" role="group" aria-label="${t('filter_biome')}" hidden>
            ${usedBiomes.map(biome => `
            <label class="ms-row">
              <input type="checkbox" class="ms-checkbox sr-only" data-biome="${biome}" ${state.filters.biomes.has(biome) ? 'checked' : ''}>
              <span class="ms-row-label">${t('biome_' + biome)}</span>
            </label>`).join('')}
          </div>
        </div>` : ''}
        ${usedSources.length ? `
        <div class="field ms-field" id="f-sources-field">
          <button type="button" class="ms-trigger field-control" id="f-sources-btn"
                  aria-expanded="false" aria-controls="f-sources-panel">
            <span class="ms-trigger-label">${sourcesTriggerLabel(usedSources)}</span>
          </button>
          <div class="ms-panel" id="f-sources-panel" role="group" aria-label="${t('filter_source')}" hidden>
            ${usedSources.map(source => `
            <label class="ms-row">
              <input type="checkbox" class="ms-checkbox sr-only" data-source="${escapeAttr(source)}" ${state.filters.sources.has(source) ? 'checked' : ''}>
              <span class="ms-row-label">${escapeHtml(source)}</span>
            </label>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>`;

  const searchInput = document.getElementById('f-search');
  const searchClearBtn = document.getElementById('f-search-clear');
  // Debounced: the grid rebuild is ~190 cards' worth of markup and listeners,
  // and running it per keystroke put that on the typing path.
  let searchTimer = null;
  searchInput.addEventListener('input', e => {
    state.filters.search = e.target.value;
    resetCatalogVisibility();
    searchClearBtn.style.display = e.target.value ? '' : 'none';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderGrid, SEARCH_DEBOUNCE_MS);
  });

  document.getElementById('f-toggle').addEventListener('click', () => {
    state.filtersOpen = !state.filtersOpen;
    renderToolbar();
    document.getElementById('f-toggle').focus();
  });
  searchClearBtn.addEventListener('click', () => {
    clearTimeout(searchTimer);
    state.filters.search = '';
    resetCatalogVisibility();
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    searchInput.focus();
    renderGrid();
  });
  el.querySelectorAll('#f-tiers .rank-icon').forEach(btn => btn.addEventListener('click', () => {
    const tier = Number(btn.dataset.tier);
    toggleSetValue(state.filters.tiers, tier);
    resetCatalogVisibility();
    renderToolbar(); renderGrid();
  }));
  const typesField = document.getElementById('f-types-field');
  if (typesField) {
    bindMultiSelectField({
      field: typesField,
      trigger: document.getElementById('f-types-btn'),
      panel: document.getElementById('f-types-panel'),
      onToggle(cb) {
        if (cb.dataset.type === 'region') state.filters.regionOnly = cb.checked;
        else setSetValue(state.filters.types, cb.dataset.type, cb.checked);
      },
      updateLabel(trigger) { trigger.querySelector('.ms-trigger-label').textContent = typesTriggerLabel(types); },
      onChange: renderGrid,
    });
  }
  const biomesField = document.getElementById('f-biomes-field');
  if (biomesField) {
    bindMultiSelectField({
      field: biomesField,
      trigger: document.getElementById('f-biomes-btn'),
      panel: document.getElementById('f-biomes-panel'),
      onToggle(cb) { setSetValue(state.filters.biomes, cb.dataset.biome, cb.checked); },
      updateLabel(trigger) { trigger.querySelector('.ms-trigger-label').textContent = biomesTriggerLabel(usedBiomes); },
      onChange: renderGrid,
    });
  }
  const sourcesField = document.getElementById('f-sources-field');
  if (sourcesField) {
    bindMultiSelectField({
      field: sourcesField,
      trigger: document.getElementById('f-sources-btn'),
      panel: document.getElementById('f-sources-panel'),
      onToggle(cb) { setSetValue(state.filters.sources, cb.dataset.source, cb.checked); },
      updateLabel(trigger) { trigger.querySelector('.ms-trigger-label').textContent = sourcesTriggerLabel(usedSources); },
      onChange: renderGrid,
    });
  }
  const backBtn = document.getElementById('btn-back-to-lists');
  if (backBtn) backBtn.addEventListener('click', () => navigate('#/lists'));
}

function toggleSetValue(set, value) { set.has(value) ? set.delete(value) : set.add(value); }

// A checkbox's `checked` after a user interaction already IS the wanted
// membership, so the multiselect dropdowns sync directly instead of toggling.
function setSetValue(set, value, on) { on ? set.add(value) : set.delete(value); }

// At most one Type/Biome/Source dropdown is open at a time; this holds its
// controller so opening another (or rebuilding the toolbar) can close it and
// tear down the document-level listeners it added, instead of leaking them.
let activeMultiSelect = null;
function closeActiveMultiSelect() {
  if (activeMultiSelect) activeMultiSelect.close();
}

/** A panel inside a clipping ancestor (Prep's overflow:hidden columns) would
 * lose its lower rows to the clip, so cap it to the room left above that
 * ancestor's bottom edge — the panel then scrolls instead. With no clipping
 * ancestor nothing is set and the CSS max-height alone applies. */
function capMultiSelectRoom(panel) {
  panel.style.removeProperty('--ms-room');
  let limit = Infinity;
  for (let el = panel.parentElement; el && el !== document.body; el = el.parentElement) {
    if (getComputedStyle(el).overflowY !== 'visible') limit = Math.min(limit, el.getBoundingClientRect().bottom);
  }
  if (limit === Infinity) return;
  panel.style.setProperty('--ms-room', `${Math.max(120, Math.floor(limit - panel.getBoundingClientRect().top - 8))}px`);
}

/* Shared behavior behind the Type, Biome and Source dropdowns (and Prep
 * Prep's own adversary Type dropdown): instant checkbox filtering that never
 * auto-closes on its own, closing only on an explicit exit (trigger re-click,
 * outside click, Escape, focus leaving the field, another dropdown opening,
 * or the toolbar being rebuilt).
 *
 * `onToggle(checkbox)` applies one changed checkbox to the caller's own
 * filter state; `updateLabel(trigger)` recomputes that trigger's "Label (n)"
 * text afterwards; `onChange` re-renders whatever result list depends on
 * that state (`renderGrid` for the main catalog, `refreshAdvPicker` for
 * Prep) — deliberately not a full toolbar rebuild, so the open
 * panel itself survives the change. */
function bindMultiSelectField({ field, trigger, panel, onToggle, updateLabel, onChange }) {
  const controller = { close, isOpen: () => !panel.hidden };

  function open() {
    closeActiveMultiSelect();
    panel.hidden = false;
    capMultiSelectRoom(panel);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onDocKeydown);
    activeMultiSelect = controller;
  }
  function close(returnFocus) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeydown);
    if (activeMultiSelect === controller) activeMultiSelect = null;
    if (returnFocus) trigger.focus();
  }
  function onDocClick(e) { if (!field.contains(e.target)) close(); }
  function onDocKeydown(e) { if (e.key === 'Escape') close(true); }

  trigger.addEventListener('click', () => { controller.isOpen() ? close() : open(); });
  // Delegated: one listener for every checkbox in the panel, native Space/click
  // toggling included, rather than one per row.
  panel.addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    onToggle(cb);
    resetCatalogVisibility();
    updateLabel(trigger);
    onChange();
  });
  // Tab/Shift+Tab off the end of the field closes it — checked only on an
  // actual Tab keydown, never on a generic focusout. A mouse click on
  // anything non-focusable inside the row (the row's own padding, a native
  // scrollbar thumb) blurs whatever last had focus *before* that click's own
  // effect (forwarding to the checkbox, or just scrolling) plays out, and a
  // real mouse gesture leaves tens of milliseconds between that blur and the
  // matching click — plenty of time for a deferred focusout check to run
  // first and close the panel out from under the click it was reacting to.
  // Gating on Tab avoids that: only a real Tab keypress reaches here, and its
  // own focus move is already synchronous with the keydown, so a same-tick
  // deferred check is safe. A click leaving the field entirely is handled by
  // onDocClick above regardless.
  field.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    setTimeout(() => {
      if (controller.isOpen() && !field.contains(document.activeElement)) close();
    }, 0);
  });

  return controller;
}

/* Environment search text is precomputed once by js/search-index.js
 * (SearchIndex) rather than rebuilt on every filter pass — see the
 * "Environment search index" section in CLAUDE.md. The alias groups,
 * MIN_ALIAS_QUERY, and the word-start alias-matching rules that used to
 * live here moved there unchanged; envMatchesFilters() below only looks
 * index records up, and must never traverse features, join text,
 * lowercase environment content, or expand aliases itself. */

/* Under normal operation every environment already has an index record,
 * built by setEnvironmentCatalog() at load time. If one is unexpectedly
 * missing, it's built once, inserted, and reused from then on — never
 * rebuilt on every lookup — and only the environment id is logged. */
function getSearchRecord(env) {
  let record = state.environmentSearchIndex.get(env.id);
  if (!record) {
    record = SearchIndex.buildEnvironmentSearchRecord(env);
    state.environmentSearchIndex.set(env.id, record);
    console.warn('[search-index] missing record repaired for environment id', env.id);
  }
  return record;
}

function envMatchesFilters(env, preparedQuery) {
  const f = state.filters;
  if (!preparedQuery.empty && !SearchIndex.matches(getSearchRecord(env), preparedQuery)) return false;
  if (f.tiers.size && !f.tiers.has(env.tier)) return false;
  if (f.types.size && !f.types.has(env.type)) return false;
  if (f.sources.size && !f.sources.has(env.source)) return false;
  if (f.regionOnly && !regionOfEnv(env.id)) return false;
  if (f.biomes.size) {
    const envBiomeSet = new Set(env.biomes || []);
    let match = false;
    for (const b of f.biomes) if (envBiomeSet.has(b)) match = true;
    if (!match) return false;
  }
  return true;
}

/* Tier first, then the displayed name — so the grid reads as a ladder and each
 * rung is alphabetical in whichever language is on screen. The query is
 * normalized and alias-expanded exactly once here, before iterating
 * environments — not once per environment inside envMatchesFilters(). */
function sortedFilteredEnvs() {
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  const preparedQuery = SearchIndex.prepareSearchQuery(state.filters.search);
  return currentEnvs()
    .filter(env => envMatchesFilters(env, preparedQuery))
    .sort((a, b) => a.tier - b.tier || collator.compare(envName(a), envName(b)));
}

/* ---------------- main catalog progressive loading ("Show more") ----------------
 * Main catalog only (state.route.name === 'catalog') — never Lists, Journey,
 * or Prep, and never the single-list view (state.route.name ===
 * 'list'), which stays fully rendered like before. The arithmetic (initial
 * count, next-batch count, resize reconciliation) is pure and lives in
 * js/catalog-progressive.js (CatalogProgressive) so it's testable without a
 * DOM; only the column-count read and the render/observe wiring live here.
 * See docs/architecture.md, "Main catalog progressive loading". */

// A computed grid-template-columns the browser hasn't resolved yet (or can't)
// falls back to this rather than a guessed breakpoint table.
const CATALOG_COLUMN_FALLBACK = 3;
const CATALOG_RESIZE_DEBOUNCE_MS = 150;

/** The grid's actual rendered column count, read off its own resolved
 * `grid-template-columns` rather than duplicating the auto-fill/minmax
 * breakpoints from css/styles.css in JS. */
function getRenderedColumnCount(gridEl) {
  if (!gridEl) return CATALOG_COLUMN_FALLBACK;
  const value = getComputedStyle(gridEl).gridTemplateColumns;
  const count = CatalogProgressive.countColumnsFromTemplate(value);
  return count > 0 ? count : CATALOG_COLUMN_FALLBACK;
}

/** Marks the next renderGrid() as a genuine new result set (search/filter
 * change) rather than a re-render of the same one (language switch, a
 * "Show more" activation, a resize) — see the state.catalogVisibleCount
 * comment above. Call this right where state.filters is mutated, not from
 * renderGrid() itself. */
function resetCatalogVisibility() { state.catalogVisibleCount = null; }

function handleCatalogShowMore() {
  const columnCount = state.catalogLastColumnCount ?? getRenderedColumnCount(document.getElementById('grid-wrap'));
  const total = sortedFilteredEnvs().length;
  state.catalogVisibleCount = CatalogProgressive.calculateNextVisibleCount(state.catalogVisibleCount ?? 0, total, columnCount);
  renderGrid();
}

/** Fills (or, given null, empties) #catalog-more, the status/button pair
 * below the grid. `view` is null off the main catalog or when there are no
 * results; otherwise { visible, total, columnCount } for the just-rendered
 * slice. A result set of 30 or fewer never shows this control at all — the
 * top #result-count bar already says how many match. */
function renderCatalogMore(view) {
  const el = document.getElementById('catalog-more');
  if (!el) return;
  if (!view || view.total <= CatalogProgressive.SHOW_ALL_THRESHOLD) { el.innerHTML = ''; return; }

  const { visible, total, columnCount } = view;
  const showButton = visible < total;
  const statusText = showButton
    ? t('catalog_shown_of_total').replace('{n}', visible).replace('{total}', total)
    : t('catalog_all_shown').replace('{total}', total);
  const nextCount = CatalogProgressive.calculateNextVisibleCount(visible, total, columnCount) - visible;

  el.innerHTML = `
    <p class="catalog-more-status" role="status" aria-live="polite">${escapeHtml(statusText)}</p>
    ${showButton ? `<button type="button" class="btn btn-sm" id="catalog-more-btn" aria-controls="grid-wrap">${escapeHtml(t('catalog_show_more').replace('{n}', nextCount))}</button>` : ''}`;
  if (showButton) document.getElementById('catalog-more-btn').addEventListener('click', handleCatalogShowMore);
}

/** Attached once to the persistent #grid-wrap element (never recreated —
 * only its innerHTML changes across routes), so this never needs a
 * teardown pair the way the Prep item nav does. The callback is a
 * no-op off the main catalog and debounced so a dragged window edge doesn't
 * rebuild ~200 cards' worth of markup on every intermediate frame. */
function initCatalogGridObserver() {
  const grid = document.getElementById('grid-wrap');
  if (!grid) return;
  let resizeTimer = null;
  const onResize = () => {
    if (state.route.name !== 'catalog') return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.route.name !== 'catalog') return;
      if (getRenderedColumnCount(grid) !== state.catalogLastColumnCount) renderGrid();
    }, CATALOG_RESIZE_DEBOUNCE_MS);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(grid);
  else window.addEventListener('resize', onResize);
}

function renderGrid() {
  const el = document.getElementById('grid-wrap');
  const total = currentEnvs().length;
  const list = sortedFilteredEnvs();
  const onCatalog = state.route.name === 'catalog';

  const countBar = document.getElementById('result-count');
  countBar.innerHTML = `${t('count_showing').replace('{n}', list.length).replace('{total}', total)}` +
    (hasActiveFilters() ? `<button id="clear-filters-btn">${t('clear_filters')}</button>` : '');
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearAllFilters);

  if (!list.length) {
    el.innerHTML = (state.route.name === 'list' && total === 0)
      ? emptyStateHtml({ icon: ICON_BOOKMARK, title: t('list_empty'), hint: t('list_empty_hint') })
      : emptyStateHtml({
          icon: ICON_SEARCH_EMPTY,
          title: t('no_results'),
          hint: t('no_results_hint'),
          // The way out of the state belongs inside it, not only up in the count bar.
          action: hasActiveFilters()
            ? `<button type="button" class="btn" data-clear-filters>${t('clear_filters')}</button>`
            : '',
        });
    bindGridDelegation(el);
    renderCatalogMore(null);
    return;
  }

  let cardsToRender = list;
  if (onCatalog) {
    const columnCount = getRenderedColumnCount(el);
    if (state.catalogVisibleCount === null) {
      state.catalogVisibleCount = CatalogProgressive.calculateInitialVisibleCount(list.length, columnCount);
    } else if (columnCount !== state.catalogLastColumnCount) {
      state.catalogVisibleCount = CatalogProgressive.calculateResizeVisibleCount(state.catalogVisibleCount, list.length, columnCount);
    } else {
      state.catalogVisibleCount = Math.min(state.catalogVisibleCount, list.length);
    }
    state.catalogLastColumnCount = columnCount;
    // The Random Environment card is a grid cell too: while more remain, it
    // takes one of the visible slots so the last row stays full (29 + random
    // = 30). Once everything is shown there is nothing to align, so no reserve.
    const reserved = state.catalogVisibleCount < list.length ? 1 : 0;
    cardsToRender = list.slice(0, state.catalogVisibleCount - reserved);
  }

  el.innerHTML = (onCatalog ? randomCardHtml(list) : '') + cardsToRender.map(cardHtml).join('');
  bindGridDelegation(el);
  renderCatalogMore(onCatalog ? { visible: cardsToRender.length, total: list.length, columnCount: state.catalogLastColumnCount } : null);
}

/* One listener on the container instead of two per card. With ~190 cards that
 * was ~380 registrations rebuilt on every filter change. */
function bindGridDelegation(el) {
  if (el._delegated) return;
  el._delegated = true;
  el.addEventListener('click', e => {
    const random = e.target.closest('[data-random-activate]');
    if (random) { e.preventDefault(); handleRandomCardActivate(); return; }
    const add = e.target.closest('[data-add-to-list]');
    if (add) { e.preventDefault(); openAddToListPopup(add.dataset.addToList); return; }
    const prepToggle = e.target.closest('[data-env-prep-toggle]');
    if (prepToggle) { e.preventDefault(); handleEnvPrepToggleClick(prepToggle); return; }
    const open = e.target.closest('[data-open-env]');
    if (open) {
      // A plain left click drives the in-page router; ctrl/cmd/shift-click and
      // middle-click fall through to the anchor's own href so the browser can
      // open the card in a new tab or window as normal.
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault(); showEnv(open.dataset.openEnv); return;
    }
    const clear = e.target.closest('[data-clear-filters]');
    if (clear) clearAllFilters();
  });
}

function clearAllFilters() {
  state.filters = { search: '', tiers: new Set(), types: new Set(), sources: new Set(), biomes: new Set(), regionOnly: false };
  resetCatalogVisibility();
  renderToolbar();
  renderGrid();
}

function hasActiveFilters() {
  const f = state.filters;
  return f.search || f.tiers.size || f.types.size || f.sources.size || f.biomes.size || f.regionOnly;
}

/* Biomes that only get to supply a card picture when nothing else is on offer.
 * "universal" ("Other") says nothing about the place, and "settlement" is worn
 * by a quarter of the catalog, so a more specific biome always outranks them.
 * Ordered least specific first, since each one is dropped in turn. */
const GENERIC_BIOMES = ['universal', 'settlement'];

/* Which biome's picture a card shows. A stat block lists its biomes most to least
 * characteristic, so the survivor closest to the front wins — position, not the
 * translated name, which keeps the picture put when the language changes. */
function artBiome(env) {
  let pool = (env.biomes || []).filter(b => BIOMES.includes(b));
  for (const generic of GENERIC_BIOMES) {
    if (pool.length < 2) break;
    pool = pool.filter(b => b !== generic);
  }
  return pool[0] || null;
}

/* The picture panel is a fixed width, so the browser can be told exactly how
 * many pixels it will draw and pick the tier that matches the screen: 100 for
 * an ordinary display, 200 at 2x, 300 at 3x. Keep in step with .card-art. */
const ART_SIZES = '(max-width: 640px) 88px, 95px';
const ART_WIDTHS = [100, 200, 250, 300];

function biomeArtHtml(env) {
  const biome = artBiome(env);
  if (!biome) return '';
  const base = 'img/biomes/' + biome;
  const avif = ART_WIDTHS.map(w => `${base}-${w}.avif ${w}w`).join(', ');
  // AVIF holds the detail these landscapes need at a fraction of the weight;
  // the WebP is only there for a browser too old to decode it.
  return `
      <div class="card-art">
        <picture>
          <source type="image/avif" sizes="${ART_SIZES}" srcset="${avif}">
          <img src="${base}-200.webp" alt="" loading="lazy" decoding="async">
        </picture>
      </div>`;
}

function cardHtml(env) {
  const impulses = envField(env, 'impulses');
  const loreText = bilingual(env.lore);
  const typeChip = `<span class="environment-type-chip"><span class="sr-only">${escapeHtml(t('filter_type'))}: </span>${escapeHtml(t('type_' + env.type))}</span>`;
  const biomeChips = (env.biomes || []).map(b => `<span class="biome-chip">${t('biome_' + b)}</span>`).join('');
  // Environments that belong to a region carry its name alongside the biomes.
  // Regions are optional, so most cards show biome chips only.
  const region = regionOfEnv(env.id);
  const regionChip = region
    ? `<span class="region-chip" data-tip="${t('region_label')}"><span class="sr-only">${t('region_label')}: </span>${escapeHtml(regionName(region))}</span>`
    : '';
  const badges = [
    isTranslated(env) ? '' : `<span class="badge pending">${t('untranslated_badge')}</span>`,
  ].join('');
  // The whole card is still the click target — the stretched ::after on
  // .card-open covers it — but the tab stop and the accessible name sit on a
  // real anchor with a real href, so the catalog is reachable from the
  // keyboard and a card opens in a new tab on a middle-click or ctrl-click.
  return `
    <article class="card" data-id="${env.id}">
      <span class="rank-icon rank-icon-sm active card-tier-badge" role="img" aria-label="${t('tier_label')} ${env.tier}" data-tip="${t('tier_label')} ${env.tier}"><span aria-hidden="true">${env.tier}</span></span>
      ${biomeArtHtml(env)}
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-title"><a class="card-open" href="${envHash(env.id)}" data-open-env="${env.id}">${escapeHtml(envName(env))}</a></h3>
          <div class="env-actions">
            ${envPrepButtonHtml(env)}
            <button
              type="button"
              class="card-add-btn${isEnvInAnyList(env.id) ? ' is-listed' : ''}"
              data-add-to-list="${env.id}"
              data-env-list-indicator="${env.id}"
              aria-label="${escapeAttr(t('add_to_list'))}"
              data-tip="${escapeAttr(t('add_to_list'))}"
              aria-haspopup="dialog"
            >${ICON_BOOKMARK}</button>
          </div>
        </div>
        ${loreText ? `<p class="card-lore">${escapeHtml(loreText)}</p>` : ''}
        ${impulses.length ? `<div class="card-impulses"><span class="card-impulses-label">${t('impulses_label')}:</span> ${escapeHtml(impulses.join(', '))}</div>` : ''}
        <div class="card-meta">${typeChip}${biomeChips}${regionChip}</div>
        ${badges}
      </div>
    </article>`;
}

/* The "Random Environment" action card — always the first grid item on the
 * main catalog, never a real environment record. It never enters
 * state.builtinEnvs/state.environmentSearchIndex and never participates in
 * search, filtering, sorting, bookmarks, lists, counts, or storage; the
 * candidate pool passed in here is always sortedFilteredEnvs() itself, so
 * "Show more" truncation and the result counter never see it. See
 * docs/architecture.md, "Random Environment card". */
function randomCardHtml(pool) {
  const tierLabel = RandomEnvironmentUtils.computeTierBadge(pool);
  return `
    <article class="card card-random" data-random-card>
      <span class="rank-icon rank-icon-sm active card-tier-badge" aria-hidden="true"><span>${escapeHtml(tierLabel)}</span></span>
      <div class="card-art card-random-art" aria-hidden="true"><span class="card-random-mark">?</span></div>
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-title">
            <button type="button" class="card-open" data-random-activate aria-label="${escapeAttr(t('random_card_aria_label'))}">${escapeHtml(t('random_card_title'))}</button>
          </h3>
        </div>
        <p class="card-lore">${escapeHtml(t('random_card_subtitle'))}</p>
      </div>
    </article>`;
}

/** Reads the pool fresh at click time (not off anything rendered earlier),
 * per spec — filters/search may have changed between render and click only
 * in theory, but recomputing costs nothing and keeps this from ever
 * opening a stale selection. */
function handleRandomCardActivate() {
  const env = RandomEnvironmentUtils.pickRandomEnvironment(sortedFilteredEnvs());
  if (env) showEnv(env.id);
}

/* Every book the catalog draws on. Titles are proper names, so they are the
 * same in both languages and live here rather than twice in i18n.json. */
const SOURCES = [
  'Daggerheart SRD 2.0',
  'Shalassa Desert',
  'Dread GM Toolbox',
  'Incredible Creatures',
  'Archibald’s Almanac of Adversaries',
  'Wondrous Environments',
  'Dungeons of Drakkenheim Campaign Frame Beta',
  'City of the Black Rose',
  'Court & Shadow',
  'Pistol Heart',
  'StarHeart',
  'Atlas of Adventure',
];

function renderFooter() {
  const el = document.getElementById('footer');
  // The note carries a {sources} slot rather than a finished sentence, so each
  // language can put the link wherever its own grammar wants it.
  const [before, after = ''] = t('footer_note').split('{sources}');
  el.innerHTML = `
    <span>${before}<button type="button" class="link-btn" id="btn-sources">${t('sources_link')}</button>${after}</span>`;
  document.getElementById('btn-sources').addEventListener('click', openSourcesPopup);
}

/* ---------------- lists ---------------- */

/* An environment that belongs to no list leaves no key behind. An empty array
 * is a membership record that records nothing, and it would sit in storage for
 * good once the list that put it there is gone. Callers persist. */
function setEnvLists(envId, listIds) {
  if (listIds.length) state.envLists[envId] = listIds;
  else delete state.envLists[envId];
  syncEnvListIndicators(envId);
}

function isEnvInAnyList(envId) {
  return (state.envLists[envId] || []).length > 0;
}

/* Keeps the catalog card bookmark and the detail-overlay title bookmark in
 * step without a catalog re-render, which would throw away the focus
 * teardown the add-to-list popup relies on. */
function syncEnvListIndicators(envId) {
  const listed = isEnvInAnyList(envId);
  document.querySelectorAll(`[data-env-list-indicator="${CSS.escape(envId)}"]`)
    .forEach(button => button.classList.toggle('is-listed', listed));
}

/* ---------------- quick "current Prep" action for an environment ----------------
 * Entry points outside the Prep picker: the catalog/Lists card, the detail
 * overlay's title row, and the expanded "Add to…" dialog. All of them mutate
 * through toggleEnvironmentInActivePrep() and stay in step through
 * syncEnvPrepControls() — see docs/architecture.md, "Quick add to the current
 * Prep". */

/** What one quick-action button should currently say and do, from the pure
 * PrepUtils.environmentActionState(). `disabled` is the full state: rendered as
 * aria-disabled (not the disabled attribute) so the reason stays reachable by
 * keyboard focus, with an explicit activation guard in the click handler. */
function envPrepActionView(env, prep) {
  const status = PrepUtils.environmentActionState(prep, env.id);
  const tip = status === 'selected' ? t('prep_env_remove_current')
    : status === 'full' ? envPrepFullText(prep)
    : t('prep_env_add_current');
  return {
    status,
    selected: status === 'selected',
    disabled: status === 'full',
    tip,
    label: t('prep_env_action_label').replace('{action}', () => tip).replace('{name}', () => envName(env)),
  };
}

function envPrepFullText(prep) {
  return t('prep_env_full')
    .replace('{n}', prep.environmentIds.length)
    .replace('{max}', PrepUtils.MAX_ENVIRONMENTS);
}

function envPrepButtonClass(view) {
  return 'env-prep-btn' + (view.selected ? ' is-selected' : '') + (view.disabled ? ' is-unavailable' : '');
}

function envPrepButtonHtml(env) {
  const prep = activePrep();
  if (!prep) return '';
  const view = envPrepActionView(env, prep);
  return `<button type="button" class="${envPrepButtonClass(view)}" data-env-prep-toggle="${escapeAttr(env.id)}"
            aria-pressed="${view.selected}" aria-disabled="${view.disabled}"
            aria-label="${escapeAttr(view.label)}" data-tip="${escapeAttr(view.tip)}">${ICON_ENV_ACTION}</button>`;
}

/** The dialog's Prep row repaints itself through this while it is open, so a
 * toggle from anywhere reaches it without the dialog knowing about the
 * others. Null whenever no expanded dialog is up. */
let repaintAtlPrepRow = null;

/** Re-evaluates every rendered quick-action control from the active Prep.
 * Deliberately global rather than per-environment: adding the last free slot
 * (or freeing one) changes the availability of every *other* unselected
 * environment too. No re-render — attributes and classes only — so focus,
 * scroll and the overlay lifecycle are untouched. */
function syncEnvPrepControls() {
  const prep = activePrep();
  if (!prep) return;
  const buttons = document.querySelectorAll('[data-env-prep-toggle]');
  if (buttons.length) {
    const byId = new Map(allEnvs().map(e => [e.id, e]));
    buttons.forEach(btn => {
      const env = byId.get(btn.dataset.envPrepToggle);
      if (!env) return;
      const view = envPrepActionView(env, prep);
      btn.className = envPrepButtonClass(view);
      btn.setAttribute('aria-pressed', String(view.selected));
      btn.setAttribute('aria-disabled', String(view.disabled));
      btn.setAttribute('aria-label', view.label);
      btn.dataset.tip = view.tip;
      // A tooltip already up (hovered or focused) would keep the old wording.
      if (tipTarget === btn) showTip(btn);
    });
  }
  if (repaintAtlPrepRow) repaintAtlPrepRow();
}

/** A button's activation guard: an aria-disabled button is still focusable and
 * clickable, so the click is swallowed here and nothing mutates. */
function handleEnvPrepToggleClick(btn) {
  if (btn.getAttribute('aria-disabled') === 'true') return;
  toggleEnvironmentInActivePrep(btn.dataset.envPrepToggle);
}

/** The one application-level path that adds/removes an environment in the
 * active Prep from outside the Prep picker. Persists through updatePrep()
 * (SafeStorage), then brings every dependent surface into line; the success
 * toast is only shown if the write actually succeeded — a failed write has
 * already reported itself. */
function toggleEnvironmentInActivePrep(envId) {
  const prep = activePrep();
  const env = allEnvs().find(e => e.id === envId);
  if (!prep || !env) return null;
  const outcome = PrepUtils.toggleEnvironment(prep, envId);
  if (outcome.limitReached) {
    // Only reachable from a stale control: re-sync it and say why.
    syncEnvPrepControls();
    showToast(envPrepFullText(prep), 'error');
    return null;
  }
  const { prep: saved, result } = updatePrep(() => outcome.prep);
  updateSaveStatusDisplay(result);
  const selected = saved.environmentIds.includes(envId);
  syncEnvPrepControls();
  syncPrepPageForEnvironment(envId, selected);
  if (result.ok) {
    const key = selected ? 'prep_env_added_toast' : 'prep_env_removed_toast';
    showToast(t(key)
      .replace('{environment}', () => envName(env))
      .replace('{prep}', () => prepDisplayTitle(saved)), selected ? 'success' : 'removed');
  }
  return { selected, result };
}

/** The Prep page's own view of one environment — central list, count, the
 * picker checkbox and its label, and every other row's disabled state — for
 * when the change came from an overlay opened above #/prep. Each piece is a
 * no-op when its element is not currently rendered. */
function syncPrepPageForEnvironment(envId, selected) {
  // The checkbox first: refreshCentralEnvironments() re-derives every picker
  // row's disabled state from each checkbox's own `checked`, so the one that
  // just changed has to already read correctly.
  syncPickerCheckbox('data-sp-toggle-env', envId, selected);
  const env = allEnvs().find(e => e.id === envId);
  if (env) updatePrepToggleLabel('data-sp-toggle-env', envId, selected, envName(env));
  if (document.getElementById('prep-central-env-list')) refreshCentralEnvironments();
}

function listEnvCount(listId) {
  return Object.values(state.envLists).filter(ids => (ids || []).includes(listId)).length;
}


function renderListsHome() {
  document.getElementById('toolbar').innerHTML = '';
  document.getElementById('result-count').innerHTML = '';
  const el = document.getElementById('grid-wrap');
  el.innerHTML = `
    <div class="lists-home-wrap" style="grid-column:1/-1">
      <h2 class="page-title">${t('lists_title')}</h2>
      ${state.storageNoticeDismissed ? '' : `
      <div class="storage-notice" role="status">
        <span class="storage-notice-icon" aria-hidden="true">!</span>
        <p class="storage-notice-text">${t('storage_notice')}</p>
        <button type="button" class="icon-btn icon-btn--reach storage-notice-close" id="storage-notice-close"
                aria-label="${t('dismiss')}" data-tip="${t('dismiss')}">${ICON_CLOSE}</button>
      </div>`}
      <div>
        <div class="new-list-row">
          <input type="text" id="new-list-input" placeholder="${t('new_list_name')}"
                 aria-label="${t('new_list_name')}" aria-describedby="new-list-error">
          <button type="button" class="btn btn-primary" id="new-list-btn">${t('create')}</button>
        </div>
        <p class="field-error" id="new-list-error" hidden>${ICON_ALERT}<span>${t('list_name_required')}</span></p>
      </div>
      ${state.lists.length
        ? `<div class="list-cards-grid">${listsCoveredFirst().map(listCardHtml).join('')}</div>`
        : emptyStateHtml({ icon: ICON_BOOKMARK, title: t('no_lists_yet'), hint: t('no_lists_hint') })}
    </div>`;

  const noticeClose = document.getElementById('storage-notice-close');
  if (noticeClose) noticeClose.addEventListener('click', () => {
    state.storageNoticeDismissed = true;
    persistRaw(LS_KEYS.storageNoticeDismissed, '1');
    const notice = noticeClose.closest('.storage-notice');
    if (notice) notice.remove();
  });

  const newListInput = document.getElementById('new-list-input');
  const newListError = document.getElementById('new-list-error');

  function createList() {
    const name = ListUtils.normalizeName(newListInput.value);
    // An empty name used to fail silently — the button simply did nothing.
    if (!name) {
      newListError.hidden = false;
      newListInput.setAttribute('aria-invalid', 'true');
      newListInput.focus();
      return;
    }
    state.lists.push({ id: 'list-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name });
    const result = persist(LS_KEYS.lists, state.lists);
    renderListsHome();
    if (result.ok) showToast(t('list_created').replace('{n}', name));
    const input = document.getElementById('new-list-input');
    if (input) input.focus();
  }

  newListInput.addEventListener('input', () => {
    newListError.hidden = true;
    newListInput.removeAttribute('aria-invalid');
  });
  newListInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); createList(); }
  });
  document.getElementById('new-list-btn').addEventListener('click', createList);

  el.querySelectorAll('.list-rename').forEach(bindListRename);
  el.querySelectorAll('[data-del-list]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delList;
      if (!confirm(t('delete_list_confirm'))) return;
      state.lists = state.lists.filter(l => l.id !== id);
      Object.keys(state.envLists).forEach(envId => {
        setEnvLists(envId, (state.envLists[envId] || []).filter(lid => lid !== id));
      });
      persistBatch([
        { key: LS_KEYS.lists, value: state.lists },
        { key: LS_KEYS.envLists, value: state.envLists },
      ]);
      renderListsHome();
    });
  });
  el.querySelectorAll('[data-open-list]').forEach(btn => {
    btn.addEventListener('click', () => navigate('#/lists/' + encodeURIComponent(btn.dataset.openList)));
  });
}

/* The one place a list-rename input's edit is resolved, for both a
 * blur-triggered "change" and Enter — see ListUtils.resolveListRename() in
 * js/list-utils.js for the pure invalid/unchanged/changed decision this
 * wraps. Escape has its own short-circuit below: it never resolves through
 * this, since cancelling never persists or validates.
 *
 * No separate "already committed" flag is needed to keep Enter-then-blur
 * from writing twice: commitListRename() always resolves against the
 * list's current in-memory name, and once Enter has committed a change that
 * name already matches the input's value, so the following blur/change
 * resolves to "unchanged" and persists nothing. */
function showRenameError(input, errorEl) {
  errorEl.hidden = false;
  input.classList.add('has-validation-error');
  input.setAttribute('aria-invalid', 'true');
}

function clearRenameError(input, errorEl) {
  errorEl.hidden = true;
  input.classList.remove('has-validation-error');
  input.removeAttribute('aria-invalid');
}

function restoreCommittedName(input, list) {
  input.value = list.name;
}

function bindListRename(input) {
  const card = input.closest('.list-card');
  const listId = card.dataset.list;
  const errorEl = card.querySelector('.list-rename-error');

  function commitListRename() {
    const list = state.lists.find(l => l.id === listId);
    if (!list) return null;
    const result = ListUtils.resolveListRename(list.name, input.value);
    if (result.status === 'invalid') {
      restoreCommittedName(input, list);
      showRenameError(input, errorEl);
      return result;
    }
    input.value = result.value;
    clearRenameError(input, errorEl);
    if (result.status === 'changed') {
      list.name = result.value;
      persist(LS_KEYS.lists, state.lists);
    }
    return result;
  }

  input.addEventListener('input', () => clearRenameError(input, errorEl));
  input.addEventListener('change', commitListRename);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const result = commitListRename();
      if (result && result.status === 'invalid') input.select();
      else input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const list = state.lists.find(l => l.id === listId);
      if (list) restoreCommittedName(input, list);
      clearRenameError(input, errorEl);
      input.blur();
    }
  });
}

/* A cover shows at most three pictures. Beyond that the tiles are too narrow to
 * be a painting rather than a stripe, and the count line under them already says
 * how much is in the list. */
const COVER_MAX = 3;

/* What a cover tile is asked to draw. The tiles split the card between them, so
 * the slot depends on how many there are: one is the card wide, three are a
 * third of it each. Desktop figures are the 320px cap on .list-cards-grid
 * columns divided down — keep them in step with it. */
const COVER_SIZES = {
  1: '(max-width: 640px) 100vw, 320px',
  2: '(max-width: 640px) 50vw, 160px',
  3: '(max-width: 640px) 33vw, 107px',
};
const ENV_THUMB_WIDTHS = [200, 400, 800];

/* The env pictures a list's members own, hung across the top of its card. Only
 * env pictures: biome art is not used to pad a row of two out to three, because
 * a cover says "these paintings are in here" and a stand-in would say something
 * else. Most lists hold none of the three and get no cover at all. */
function listCoverHtml(list) {
  const ids = envsInList(list.id).map(e => e.id).filter(id => ENV_ART.has(id)).slice(0, COVER_MAX);
  if (!ids.length) return '';
  const sizes = COVER_SIZES[ids.length];
  // The full-size env picture is a backdrop for a whole window — three of them
  // behind a 112px strip would be the heaviest page on the site, so the cover
  // is served from the thumbnails cut for it.
  const tiles = ids.map(id => {
    const base = 'img/env/thumb/' + id;
    const avif = ENV_THUMB_WIDTHS.map(w => `${base}-${w}.avif ${w}w`).join(', ');
    const focus = ENV_ART_FOCUS[id] ? ` style="--focus:${ENV_ART_FOCUS[id]}"` : '';
    return `<picture>
            <source type="image/avif" sizes="${sizes}" srcset="${avif}">
            <img src="${base}-400.webp" alt="" loading="lazy" decoding="async"${focus}>
          </picture>`;
  }).join('');
  /* No click handler of its own: the Open button's stretched ::after covers the
   * whole card, cover included. Out of the tab order and out of the
   * accessibility tree too — that button is the real control, and a screen
   * reader has no use for a decorative crop of a painting. */
  return `
      <div class="list-card-cover" aria-hidden="true">${tiles}</div>`;
}

/* Lists with a cover first. A cover makes a card 90px taller than a plain one,
 * and the two shapes interleaved leave the grid ragged wherever they meet — in
 * this order the seam happens once instead of in every row. Stable within each
 * group, and for the rendering only: state.lists keeps the order the lists were
 * made in, which is the order a rename or a delete is written against. */
function listsCoveredFirst() {
  const covered = list => envsInList(list.id).some(e => ENV_ART.has(e.id));
  return [...state.lists.filter(covered), ...state.lists.filter(l => !covered(l))];
}

function listCardHtml(list) {
  const cover = listCoverHtml(list);
  const count = listEnvCount(list.id);
  /* A list with nothing in it read as "Окружений: 0" — a count of a thing rather
   * than an empty shelf, and easy to skim straight past next to a card wearing
   * three paintings. It says so in words instead. */
  const countLine = count
    ? `<div class="list-card-count">${t('list_env_count').replace('{n}', count)}</div>`
    : `<div class="list-card-count empty">${t('list_card_empty')}</div>`;
  /* list.id is app-generated (see createList()/createAndAdd()) and never
   * derived from user text, so it's safe to use directly as a DOM id — the
   * rename error needs one of its own to associate via aria-describedby. */
  const errorId = 'list-rename-error-' + list.id;
  return `
    <div class="list-card${cover ? ' has-cover' : ''}" data-list="${list.id}">${cover}
      <div class="list-card-top">
        <input type="text" value="${escapeAttr(list.name)}" class="list-rename" aria-label="${t('rename_list_label')}" aria-describedby="${errorId}">
        <button type="button" class="icon-btn icon-btn--danger icon-btn--reach list-card-del" data-del-list="${list.id}"
                aria-label="${t('delete')}" data-tip="${t('delete')}">${ICON_TRASH}</button>
      </div>
      <p class="field-error list-rename-error" id="${errorId}" role="alert" hidden>${ICON_ALERT}<span>${t('list_rename_required')}</span></p>
      ${countLine}
      <button type="button" class="btn btn-sm list-card-open" data-open-list="${list.id}">${t('open_list')}</button>
    </div>`;
}

/* How long the popup stands there having done its job. Long enough that the
 * ticked checkbox and the new row are read as the answer, short enough that the
 * card leaving still feels like a consequence of the click. */
const ATL_CLOSE_DELAY_MS = 450;

/* Two modes, one renderer. The compact bookmark buttons open the list-only
 * popup, which still gets out of the way once the environment lands in a list.
 * The detail card's bottom "Add to…" button opens the expanded destination
 * dialog — a "Current Prep" row above the lists — which never closes itself:
 * the point is to let one visit put the environment in the Prep *and* in
 * several lists. It closes only by its × button, Escape or the backdrop. */
function openAddToListPopup(envId, { expanded = false } = {}) {
  const env = allEnvs().find(e => e.id === envId);
  const prep = expanded ? activePrep() : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // Named so syncLangFloat() knows to stand the floating switch down while this
  // is up: a language switch rebuilds the card this popup was opened from.
  overlay.dataset.overlayKind = 'popup';

  function listRowsHtml() {
    const membership = new Set(state.envLists[envId] || []);
    return state.lists.map(l => `
      <label class="atl-row">
        <input type="checkbox" data-list-toggle="${l.id}" ${membership.has(l.id) ? 'checked' : ''}>
        <span>${escapeHtml(l.name)}</span>
      </label>`).join('') || `<p class="hint">${t('no_lists_yet')}</p>`;
  }

  const title = expanded && env
    ? t('add_env_dialog_title').replace('{name}', () => envName(env))
    : t('add_to_list');

  /* The "Current Prep" row: the same three-slot Prep the picker edits, shown
   * as one checkbox row with the active Prep's title and its n/max count. */
  const prepSectionHtml = prep ? `
        <section class="atl-section" aria-labelledby="atl-prep-heading">
          <h3 class="atl-section-label" id="atl-prep-heading">${t('atl_section_prep')}</h3>
          <label class="atl-row atl-prep-row" id="atl-prep-row">
            <input type="checkbox" id="atl-prep-toggle">
            <span class="atl-prep-title" id="atl-prep-title"></span>
            <span class="atl-prep-count" id="atl-prep-count"></span>
          </label>
          <p class="atl-hint" id="atl-prep-hint" hidden></p>
        </section>
        <hr class="atl-sep">` : '';

  overlay.innerHTML = `
    <div class="modal modal-sm" data-overlay-card
         role="dialog" aria-modal="true" aria-labelledby="atl-title">
      <div class="modal-header">
        <h2 id="atl-title">${escapeHtml(title)}</h2>
        <button type="button" class="icon-btn icon-btn--reach modal-close" aria-label="${t('close')}">${ICON_CLOSE}</button>
      </div>
      <div class="modal-body">
        ${prepSectionHtml}
        <section class="atl-section"${expanded ? ' aria-labelledby="atl-lists-heading"' : ''}>
          ${expanded ? `<h3 class="atl-section-label" id="atl-lists-heading">${t('atl_section_lists')}</h3>` : ''}
          <div id="atl-list">${listRowsHtml()}</div>
        </section>
        <div style="margin-top:var(--s-4)">
          <div class="new-list-row">
            <input type="text" id="atl-new-input" placeholder="${t('new_list_name')}"
                   aria-label="${t('new_list_name')}" aria-describedby="atl-new-error">
            <button type="button" class="btn btn-primary" id="atl-new-btn">${t('create')}</button>
          </div>
          <p class="field-error" id="atl-new-error" hidden>${ICON_ALERT}<span>${t('list_name_required')}</span></p>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const teardown = registerOverlay(overlay, close);

  // close() is reachable twice over — the Escape key, the backdrop, the close
  // button and the self-close race, and closeOverlayAnimated deliberately fires
  // its callback from both the animation and its fallback timer.
  let closed = false;
  let closeTimer = null;

  /* The popup's whole job is done the moment the environment lands in a list,
   * so it gets out of the way rather than waiting to be dismissed. The pause is
   * for the checkbox to be seen ticking and the toast to arrive under it. */
  function closeAfterAdd() {
    if (expanded) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => closeOverlayAnimated(overlay, close), ATL_CLOSE_DELAY_MS);
  }

  /* Expanded mode only: keeps the Prep row a mirror of the active Prep. Reached
   * through syncEnvPrepControls() after any toggle from anywhere, and once here
   * to paint the initial state. A full Prep leaves the row visible but
   * unavailable, with the reason as text (and a tooltip); a selected
   * environment stays removable even at the cap. */
  function paintPrepRow() {
    const current = activePrep();
    const cb = overlay.querySelector('#atl-prep-toggle');
    if (!current || !cb) return;
    const status = PrepUtils.environmentActionState(current, envId);
    const full = status === 'full';
    const max = PrepUtils.MAX_ENVIRONMENTS;
    const count = current.environmentIds.length;
    cb.checked = status === 'selected';
    cb.disabled = full;
    if (full) cb.setAttribute('aria-describedby', 'atl-prep-hint'); else cb.removeAttribute('aria-describedby');
    const row = overlay.querySelector('#atl-prep-row');
    row.classList.toggle('is-unavailable', full);
    if (full) row.dataset.tip = envPrepFullText(current); else delete row.dataset.tip;
    overlay.querySelector('#atl-prep-title').textContent = prepDisplayTitle(current);
    overlay.querySelector('#atl-prep-count').innerHTML =
      `<span aria-hidden="true">${count}/${max}</span><span class="sr-only">${escapeHtml(t('prep_env_count_label').replace('{n}', count).replace('{max}', max))}</span>`;
    const hint = overlay.querySelector('#atl-prep-hint');
    hint.hidden = !full;
    hint.textContent = full ? envPrepFullText(current) : '';
  }
  if (prep) {
    paintPrepRow();
    repaintAtlPrepRow = paintPrepRow;
    overlay.querySelector('#atl-prep-toggle').addEventListener('change', () => {
      toggleEnvironmentInActivePrep(envId);
      // A refused or failed toggle leaves state unchanged; repaint so the
      // checkbox can never show something the Prep does not hold.
      paintPrepRow();
    });
  }

  function bindToggle(cb) {
    cb.addEventListener('change', () => {
      const listId = cb.dataset.listToggle;
      const list = state.lists.find(l => l.id === listId);
      const set = new Set(state.envLists[envId] || []);
      if (cb.checked) set.add(listId); else set.delete(listId);
      setEnvLists(envId, [...set]);
      const result = persist(LS_KEYS.envLists, state.envLists);
      // Membership is otherwise a silent toggle with nothing to confirm it.
      // A failed write already reported its own warning inside persist() —
      // showing "Added"/"Removed" on top of that would be a false success.
      if (result.ok) {
        showToast((cb.checked ? t('added_to_list') : t('removed_from_list')).replace('{n}', list ? list.name : ''), cb.checked ? 'success' : 'removed');
      }
      // Unticking is not the job finishing, and it also undoes a tick that has
      // a close already pending — either way the popup stays up.
      if (cb.checked) closeAfterAdd(); else clearTimeout(closeTimer);
    });
  }
  overlay.querySelectorAll('[data-list-toggle]').forEach(bindToggle);

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(closeTimer);
    if (repaintAtlPrepRow === paintPrepRow) repaintAtlPrepRow = null;
    overlay.remove();
    teardown();
    // Only the list routes show anything that membership changes; re-rendering
    // the catalog here would throw away the focus teardown just restored, and
    // Prep is kept current in place by syncPrepPageForEnvironment().
    if (state.route.name !== 'catalog' && state.route.name !== 'prep') render();
  }

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const newInput = overlay.querySelector('#atl-new-input');
  const newError = overlay.querySelector('#atl-new-error');

  function createAndAdd() {
    const name = ListUtils.normalizeName(newInput.value);
    if (!name) {
      newError.hidden = false;
      newInput.setAttribute('aria-invalid', 'true');
      newInput.focus();
      return;
    }
    const list = { id: 'list-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name };
    state.lists.push(list);
    const set = new Set(state.envLists[envId] || []);
    set.add(list.id);
    setEnvLists(envId, [...set]);
    const result = persistBatch([
      { key: LS_KEYS.lists, value: state.lists },
      { key: LS_KEYS.envLists, value: state.envLists },
    ]);
    newInput.value = '';
    const container = overlay.querySelector('#atl-list');
    container.innerHTML = listRowsHtml();
    container.querySelectorAll('[data-list-toggle]').forEach(bindToggle);
    if (result.ok) showToast(t('added_to_list').replace('{n}', name));
    newInput.focus();
    closeAfterAdd();
  }

  newInput.addEventListener('input', () => {
    newError.hidden = true;
    newInput.removeAttribute('aria-invalid');
  });
  newInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); createAndAdd(); }
  });
  overlay.querySelector('#atl-new-btn').addEventListener('click', createAndAdd);
}

/* ---------------- Journey to Horizon ---------------- */

/* The book's two mapping procedures: "Filling Wilderness Hexes" on the left and
 * "Creating Sanctuaries" on the right. A kept entry stores the numbers that came
 * up rather than the sentences they printed, so a saved map reads back in either
 * language — and picks up the Russian the moment data/journey.json carries it.
 *
 * The habitat table is, row for row, the atlas's own eleven biomes, so a rolled
 * habitat can hand the GM straight over to the catalog filtered to it. */

function rollDie(sides) { return 1 + Math.floor(Math.random() * sides); }

/** A bilingual cell from journey.json. Falls through to whichever side is
 * filled in if the current language's own text is missing. */
function jText(pair) {
  if (!pair) return '';
  const own = pair[state.lang];
  return own && own.trim() ? own : (pair.en || pair.ru || '');
}

/* The page is reachable before — or instead of — its data file landing, so every
 * table is checked rather than assumed. */
function journeyReady() {
  const j = state.journey;
  return !!(j.habitat.length && j.encounter.length && j.terrain.length
            && j.rumors.length && j.sanctuary.length && j.nameElements.length);
}

function habitatRow(roll) { return state.journey.habitat.find(r => roll >= r.min && roll <= r.max) || null; }
function sanctuaryTable(key) { return state.journey.sanctuary.find(tb => tb.key === key) || null; }
function tableRow(rows, roll) { return (rows || []).find(r => r.roll === roll) || null; }

/* ---- the rolls ---- */

/** Roll 1 is not a habitat of its own: it blights one rolled again. A second 1
 * means the region has been wholly overtaken and so has no habitat under the
 * blight at all. Only the rolls are kept; everything shown is derived. */
function rollHabitat() {
  const first = rollDie(20);
  if (!habitatRow(first)?.shadowblight) return { rolls: [first] };
  return { rolls: [first, rollDie(20)] };
}

function habitatView(habitat) {
  const rows = habitat.rolls.map(habitatRow);
  const blighted = !!rows[0]?.shadowblight;
  const terrain = blighted ? rows[1] : rows[0];
  return {
    blighted,
    overtaken: blighted && !!terrain?.shadowblight,
    biome: terrain?.biome || null,
    examples: terrain ? jText(terrain.examples) : '',
  };
}

/* A rolled 2 is "roll on this table twice and combine", and either of those two
 * can come up 2 in its turn. The cap stops a chain that keeps splitting; four 2s
 * running is about one journey in five million, so it costs nothing real. */
const ENCOUNTER_COMBINE_CAP = 4;

function rollEncounter() {
  const entries = [];
  let combines = 0;
  (function draw(depth) {
    let pair = [rollDie(8), rollDie(6)];
    if (pair[0] + pair[1] === 2) {
      if (depth < ENCOUNTER_COMBINE_CAP) {
        combines++;
        draw(depth + 1);
        draw(depth + 1);
        return;
      }
      do { pair = [rollDie(8), rollDie(6)]; } while (pair[0] + pair[1] === 2);
    }
    entries.push(pair);
  })(0);
  return { entries, combines };
}

/* Roll 8 is "roll twice and combine", and a sub-roll of 8 combines a third
 * system. Every system drawn is a different one — combining a merchant guild
 * with a merchant guild combines nothing — so the draw comes from a pool. */
const POLITICS_COMBINE_CAP = 2;

function rollPolitics() {
  const pool = [1, 2, 3, 4, 5, 6, 7];
  const rolls = [];
  (function draw(depth) {
    if (!pool.length) return;
    if (rollDie(8) === 8 && depth < POLITICS_COMBINE_CAP && pool.length > 1) {
      draw(depth + 1);
      draw(depth + 1);
      return;
    }
    /* Drawn again from what is left rather than reusing the roll above: that
     * roll may name a system an earlier draw already took. */
    rolls.push(pool.splice(rollDie(pool.length) - 1, 1)[0]);
  })(0);
  return { rolls };
}

/* ---- settlement names (d100 x 2) ---- */

/** Parentheses mark an optional tail: "Axe(l)" offers both "Axe" and "Axel",
 * "H(e)aven" both "Haven" and "Heaven". */
function nameVariants(part) {
  const m = part.match(/^(.*)\(([^)]+)\)(.*)$/);
  return m ? [m[1] + m[3], m[1] + m[2] + m[3]] : [part];
}

/** The book's own examples lowercase the trailing element and elide a letter
 * shared across the seam — Head and Dale make "Headale", not "Headdale". */
function joinNameParts(a, b) {
  const tail = b.charAt(0).toLowerCase() + b.slice(1);
  return a.slice(-1).toLowerCase() === tail.charAt(0) ? a + tail.slice(1) : a + tail;
}

/** Two d100 rolls, then one element from each combined. Which element and which
 * way round is the GM's call in the book, so every reading is generated and one
 * is offered; the field stays editable and the die can be thrown again. */
function rollSettlementName() {
  const els = state.journey.nameElements;
  if (!els.length) return '';
  const a = els[rollDie(els.length) - 1];
  const b = els[rollDie(els.length) - 1];
  const names = new Set();
  a.parts.forEach(pa => nameVariants(pa).forEach(va => {
    b.parts.forEach(pb => nameVariants(pb).forEach(vb => {
      names.add(joinNameParts(va, vb));
      names.add(joinNameParts(vb, va));
    }));
  }));
  const list = [...names];
  return list[rollDie(list.length) - 1];
}

/* ---- entries ---- */

function newJourneyId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function rollRegion() {
  return {
    id: newJourneyId('reg'),
    name: '',
    habitat: rollHabitat(),
    size: rollDie(12),
    encounter: rollEncounter(),
    terrain: rollDie(4),
    rumor: rollDie(100),
  };
}

function rollSanctuary() {
  return {
    id: newJourneyId('san'),
    name: rollSettlementName(),
    trade: rollDie(20),
    quirk: rollDie(12),
    crisis: rollDie(10),
    drive: rollDie(10),
    politics: rollPolitics(),
    size: rollDie(6),
    population: rollDie(4),
  };
}

/** One table of one entry thrown again, leaving the rest of it standing. */
function rerollRow(kind, entry, key) {
  if (kind === 'region') {
    if (key === 'habitat') entry.habitat = rollHabitat();
    else if (key === 'size') entry.size = rollDie(12);
    else if (key === 'encounter') entry.encounter = rollEncounter();
    else if (key === 'terrain') entry.terrain = rollDie(4);
    else if (key === 'rumor') entry.rumor = rollDie(100);
    return;
  }
  if (key === 'politics') { entry.politics = rollPolitics(); return; }
  const table = sanctuaryTable(key);
  if (table) entry[key] = rollDie(table.die);
}

/* ---- storage ---- */

function journeySaved(kind) { return kind === 'region' ? state.journeyRegions : state.journeySanctuaries; }
function journeyLsKey(kind) { return kind === 'region' ? LS_KEYS.journeyRegions : LS_KEYS.journeySanctuaries; }

function journeyEntryById(kind, id) {
  const draft = state.journeyDraft[kind];
  if (draft && draft.id === id) return draft;
  return journeySaved(kind).find(e => e.id === id) || null;
}

/** A draft lives in memory only, so editing one writes nothing; a kept entry is
 * written through on every change. */
function persistJourney(kind, entry) {
  if (state.journeyDraft[kind] === entry) return;
  persist(journeyLsKey(kind), journeySaved(kind));
}

function saveJourneyDraft(kind) {
  const draft = state.journeyDraft[kind];
  if (!draft) return;
  journeySaved(kind).push(draft);
  state.journeyDraft[kind] = null;
  const result = persist(journeyLsKey(kind), journeySaved(kind));
  renderJourneyPage(journeySel(kind, null, '[data-roll-new]'));
  if (result.ok) showToast(t(kind === 'region' ? 'journey_region_saved' : 'journey_sanctuary_saved'));
}

function deleteJourneyEntry(kind, id) {
  if (!confirm(t('journey_delete_confirm'))) return;
  if (kind === 'region') state.journeyRegions = state.journeyRegions.filter(e => e.id !== id);
  else state.journeySanctuaries = state.journeySanctuaries.filter(e => e.id !== id);
  persist(journeyLsKey(kind), journeySaved(kind));
  renderJourneyPage(journeySel(kind, null, '[data-roll-new]'));
}

/** The habitat table and the atlas's biome filter are the same eleven terrains,
 * so a rolled habitat can produce the stat blocks that suit it. The disclosure
 * is opened along with it: on a phone the filter that did this would otherwise
 * be hidden, leaving a short catalog with no visible reason for being short. */
function showBiomeInCatalog(biome) {
  state.filters = { search: '', tiers: new Set(), types: new Set(), sources: new Set(), biomes: new Set([biome]), regionOnly: false };
  state.filtersOpen = true;
  resetCatalogVisibility();
  navigate('');
}

/* ---- rendering ---- */

/* Which die stands behind each sanctuary row, in the order the book rolls them.
 * The size table is the settlement's own, not the region's hex count, so it
 * carries a label of its own. */
const SANCTUARY_ROWS = [
  ['trade', 'journey_k_trade'],
  ['quirk', 'journey_k_quirk'],
  ['crisis', 'journey_k_crisis'],
  ['drive', 'journey_k_drive'],
  ['politics', 'journey_k_politics'],
  ['size', 'journey_k_settlement_size'],
  ['population', 'journey_k_population'],
];

function journeySel(kind, id, inner) {
  return id ? `.journey-entry[data-id="${id}"] ${inner}`
            : `.journey-panel[data-kind="${kind}"] ${inner}`;
}

/** `focus` names the element to hand focus back to. The page is redrawn whole on
 * every roll, which throws away the button that was clicked, so without this a
 * keyboard user is dropped back at the top of the document each time. */
function renderJourneyPage(focus = null) {
  document.getElementById('toolbar').innerHTML = '';
  document.getElementById('result-count').innerHTML = '';
  const el = document.getElementById('grid-wrap');
  if (!journeyReady()) {
    el.innerHTML = `<div class="journey-wrap">${emptyStateHtml({
      icon: ICON_ALERT, title: t('load_error'), hint: t('load_error_hint'), error: true,
    })}</div>`;
    return;
  }
  el.innerHTML = `
    <div class="journey-wrap">
      <h2 class="page-title">${t('journey_title')}</h2>
      <p class="journey-intro">${t('journey_intro')}</p>
      <div class="journey-cols">
        ${journeyPanelHtml('region')}
        ${journeyPanelHtml('sanctuary')}
      </div>
    </div>`;
  bindJourneyDelegation(el);
  if (focus) document.querySelector(focus)?.focus();
}

/** #/journey2 — the Journey 2 map editor (js/journey2-view.js).
 * Mounted once into #grid-wrap and kept across re-renders (a language switch
 * only re-localizes it), so the camera, selection and unsaved text survive.
 * It owns its own dhcodex_journey2_* storage keys (js/journey2-store.js) and
 * never reads or writes #/journey's state or storage keys. */
function renderJourney2Page() {
  document.getElementById('toolbar').innerHTML = '';
  document.getElementById('result-count').innerHTML = '';
  Journey2View.mount(document.getElementById('grid-wrap'), {
    t, lang: state.lang, generator: journey2Generator, toast: showToast, storage: lsStorage,
    environmentsForBiome: journey2EnvironmentsForBiome,
  });
}

/** The environments a Journey 2 region card lists for its biome: every catalog environment whose `biomes` carries that
 * id, in catalog order (tier, then name). Each `href` is the overlay address on #/journey2, so opening one is a plain
 * link and the map underneath is never re-rendered. */
function journey2EnvironmentsForBiome(biome) {
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  return allEnvs()
    .filter(env => env.biomes.includes(biome))
    .sort((a, b) => a.tier - b.tier || collator.compare(envName(a), envName(b)))
    .map(env => ({ id: env.id, name: envName(env), tier: env.tier, href: envHash(env.id, { name: 'journey2' }) }));
}

/** The Journey 2 region generator: the SAME rolls and tables as #/journey (rollHabitat, rollEncounter,
 * rollDie, state.journey), exposed through a small adapter so the map editor never calls the legacy page
 * renderer and never copies the tables. Every value is rolled — the editor has no way to choose or override
 * one — following the official sequence d20 habitat, d12 size, d8+d6 encounter, d4 terrain, d100 rumor.
 * Returns plain data; nothing is shared with a saved #/journey entry. */
const journey2Generator = {
  ready() { return journeyReady(); },
  roll() {
    const rolled = rollHabitat();
    const view = habitatView(rolled);
    return {
      habitat: { biome: view.biome, blighted: view.blighted, overtaken: view.overtaken, source: 'rolled', rolls: rolled.rolls },
      size: rollDie(12),
      encounter: rollEncounter(),
      terrain: { value: rollDie(4), source: 'rolled' },
      rumor: rollDie(100),
    };
  },
  /** One settlement from the SAME rolls as #/journey's sanctuary generator (rollSanctuary): the name from two d100 name
   * elements and one die per table. Plain numbers only — what the book's tables print is looked up again on display. */
  rollSanctuary() {
    const s = rollSanctuary();
    return { name: s.name, trade: s.trade, quirk: s.quirk, crisis: s.crisis, drive: s.drive, politics: { rolls: s.politics.rolls.slice() }, size: s.size, population: s.population };
  },
  /** The seven rows of a stored sanctuary in the current language, in the order the book rolls them. `label` is an i18n key. */
  describeSanctuary(entry) {
    return SANCTUARY_ROWS.map(([key, labelKey]) => {
      const table = sanctuaryTable(key);
      const rolls = key === 'politics' ? entry.politics.rolls : [entry[key]];
      return {
        key, label: labelKey, die: 'd' + (table ? table.die : ''), combined: rolls.length > 1,
        results: rolls.map(r => ({ roll: r, text: jText(tableRow(table?.rows, r)?.text) })),
      };
    });
  },
  /** Display text (current language) for a stored batch, read from the same tables the roll came from. */
  describe(batch) {
    const j = state.journey;
    const terrain = tableRow(j.terrain, batch.terrain.value);
    const habitatRowForBiome = j.habitat.find(r => r.biome === batch.habitat.biome);
    const combined = batch.encounter.combines > 0;
    return {
      examples: habitatRowForBiome ? jText(habitatRowForBiome.examples) : '',
      combined,
      encounter: batch.encounter.entries.map(pair => ({ text: jText(tableRow(j.encounter, pair[0] + pair[1])?.text) })),   // text only: the dice sum is never shown
      terrain: terrain ? { name: jText(terrain.name), days: terrain.days, text: jText(terrain.text) } : null,
      rumor: jText(tableRow(j.rumors, batch.rumor)?.text),
    };
  },
};

function journeyPanelHtml(kind) {
  const region = kind === 'region';
  const saved = journeySaved(kind);
  const draft = state.journeyDraft[kind];
  return `
    <section class="journey-panel" data-kind="${kind}">
      <h3 class="journey-panel-title">
        ${region ? ICON_HEX : ICON_COMPASS}
        <span>${t(region ? 'journey_wilderness_title' : 'journey_sanctuaries_title')}</span>
      </h3>
      <p class="hint journey-panel-hint">${t(region ? 'journey_wilderness_hint' : 'journey_sanctuaries_hint')}</p>
      <button type="button" class="btn btn-primary journey-roll" data-roll-new>
        ${diceIconSVG()}<span>${t(region ? 'journey_roll_region' : 'journey_roll_sanctuary')}</span>
      </button>
      ${draft ? `<div class="journey-draft">${journeyEntryHtml(kind, draft, false, 0)}</div>` : ''}
      <div class="journey-saved">
        <h4 class="journey-saved-title">
          <span>${t(region ? 'journey_saved_regions' : 'journey_saved_sanctuaries')}</span>
          <span class="journey-count">${saved.length}</span>
        </h4>
        ${saved.length
          ? saved.map((e, i) => journeyEntryHtml(kind, e, true, i + 1)).join('')
          : `<p class="journey-empty">${t(region ? 'journey_no_regions' : 'journey_no_sanctuaries')}</p>`}
      </div>
    </section>`;
}

function journeyEntryHtml(kind, entry, saved, index) {
  const rows = kind === 'region' ? regionRows(entry) : sanctuaryRows(entry);
  const fallback = t(kind === 'region' ? 'journey_region_fallback' : 'journey_sanctuary_fallback')
    .replace('{n}', index);
  return `
    <article class="journey-entry${saved ? ' is-saved' : ''}" data-kind="${kind}" data-id="${escapeAttr(entry.id)}">
      <div class="jr-name-row">
        <input type="text" class="jr-name" value="${escapeAttr(entry.name || '')}"
               placeholder="${escapeAttr(saved ? fallback : t('journey_name_placeholder'))}"
               aria-label="${escapeAttr(t('journey_name_placeholder'))}">
        <button type="button" class="icon-btn icon-btn--utility jr-icon-btn" data-roll-name
                aria-label="${escapeAttr(t('journey_roll_name'))}"
                data-tip="${escapeAttr(t('journey_roll_name'))}">${diceIconSVG()}</button>
      </div>
      <dl class="jr-rows">
        ${rows.map(row => `
          <div class="jr-row">
            <dt class="jr-k"><span>${escapeHtml(row.label)}</span><span class="jr-die">${escapeHtml(row.die)}</span></dt>
            <dd class="jr-v">
              <span class="jr-roll">${escapeHtml(row.roll)}</span>
              <div class="jr-body">${row.html}</div>
              <button type="button" class="icon-btn icon-btn--utility jr-icon-btn jr-reroll" data-reroll="${row.key}"
                      aria-label="${escapeAttr(t('journey_reroll'))}"
                      data-tip="${escapeAttr(t('journey_reroll'))}">${ICON_REROLL}</button>
            </dd>
          </div>`).join('')}
      </dl>
      <div class="jr-foot">
        ${saved
          ? `<button type="button" class="btn btn-sm btn-danger" data-delete>${t('delete')}</button>`
          : `<button type="button" class="btn btn-sm btn-primary" data-save>${t('journey_save')}</button>
             <button type="button" class="btn btn-sm btn-ghost" data-discard>${t('journey_discard')}</button>`}
      </div>
    </article>`;
}

function regionRows(r) {
  const habitat = habitatView(r.habitat);
  const terrain = tableRow(state.journey.terrain, r.terrain);
  const rumor = tableRow(state.journey.rumors, r.rumor);
  return [
    { key: 'habitat', label: t('journey_k_habitat'), die: 'd20',
      roll: r.habitat.rolls.join(' → '), html: habitatValueHtml(habitat) },
    { key: 'size', label: t('journey_k_size'), die: 'd12', roll: String(r.size),
      html: `<span class="jr-strong">${escapeHtml(t('journey_hexes').replace('{n}', r.size))}</span>` },
    { key: 'encounter', label: t('journey_k_encounter'), die: 'd8+d6',
      roll: r.encounter.combines ? '2' : String(r.encounter.entries[0][0] + r.encounter.entries[0][1]),
      html: encounterValueHtml(r.encounter) },
    { key: 'terrain', label: t('journey_k_terrain'), die: 'd4', roll: String(r.terrain),
      html: terrainValueHtml(terrain) },
    { key: 'rumor', label: t('journey_k_rumor'), die: 'd100', roll: String(r.rumor),
      html: `<span class="jr-text">${escapeHtml(jText(rumor?.text))}</span>` },
  ];
}

function sanctuaryRows(s) {
  return SANCTUARY_ROWS.map(([key, labelKey]) => {
    const table = sanctuaryTable(key);
    const label = t(labelKey);
    const die = 'd' + (table ? table.die : '');
    if (key !== 'politics') {
      return { key, label, die, roll: String(s[key]),
               html: `<span class="jr-strong">${escapeHtml(jText(tableRow(table?.rows, s[key])?.text))}</span>` };
    }
    /* A combined result keeps "8" in the roll column and hangs each system's own
     * roll off the system instead. Listing them all in the column would widen it
     * and push this one row's text out of line with every other row's. */
    const rolls = s.politics.rolls;
    if (rolls.length === 1) {
      return { key, label, die, roll: String(rolls[0]),
               html: `<span class="jr-strong">${escapeHtml(jText(tableRow(table?.rows, rolls[0])?.text))}</span>` };
    }
    return {
      key, label, die, roll: '8',
      html: `<span class="jr-note">${escapeHtml(t('journey_politics_combined'))}</span>`
        + rolls.map(r => `<span class="jr-strong"><span class="jr-subroll">${r}</span>`
            + `${escapeHtml(jText(tableRow(table?.rows, r)?.text))}</span>`).join(''),
    };
  });
}

function habitatValueHtml(habitat) {
  const bits = [];
  if (habitat.blighted) bits.push(`<span class="jr-blight">${escapeHtml(t('journey_shadowblighted'))}</span>`);
  if (habitat.overtaken) {
    bits.push(`<span class="jr-text">${escapeHtml(t('journey_overtaken'))}</span>`);
  } else if (habitat.biome) {
    bits.push(`<button type="button" class="biome-chip jr-biome" data-biome="${escapeAttr(habitat.biome)}"
                       data-tip="${escapeAttr(t('journey_show_in_catalog'))}">${escapeHtml(t('biome_' + habitat.biome))}</button>`);
    if (habitat.examples) bits.push(`<span class="jr-examples">${escapeHtml(habitat.examples)}</span>`);
  }
  return bits.join('');
}

/* Combined results carry their own roll, for the same reason the political
 * systems do: the roll column stays one width down the whole card. */
function encounterValueHtml(encounter) {
  const combined = encounter.combines > 0;
  const bits = encounter.entries.map(pair => {
    const sum = pair[0] + pair[1];
    return `<span class="jr-text">${combined ? `<span class="jr-subroll">${sum}</span>` : ''}`
      + `${escapeHtml(jText(tableRow(state.journey.encounter, sum)?.text))}</span>`;
  });
  if (combined) bits.unshift(`<span class="jr-note">${escapeHtml(t('journey_encounter_combined'))}</span>`);
  return bits.join('');
}

function terrainValueHtml(row) {
  if (!row) return '';
  return `<span class="jr-strong">${escapeHtml(jText(row.name))}</span>`
       + `<span class="jr-days">${escapeHtml(t('journey_travel_days').replace('{n}', row.days))}</span>`
       + `<span class="jr-text">${escapeHtml(jText(row.text))}</span>`;
}

/* One listener for the whole page, kept across re-renders the way the grid's is
 * — every roll rebuilds every entry, so per-button binding would re-register the
 * lot each time. */
function bindJourneyDelegation(el) {
  if (el._journeyDelegated) return;
  el._journeyDelegated = true;

  el.addEventListener('click', e => {
    const fresh = e.target.closest('[data-roll-new]');
    if (fresh) {
      const kind = fresh.closest('.journey-panel').dataset.kind;
      state.journeyDraft[kind] = kind === 'region' ? rollRegion() : rollSanctuary();
      renderJourneyPage(journeySel(kind, null, '[data-roll-new]'));
      return;
    }
    const entryEl = e.target.closest('.journey-entry');
    if (!entryEl) return;
    const { kind, id } = entryEl.dataset;
    const entry = journeyEntryById(kind, id);
    if (!entry) return;

    const biome = e.target.closest('[data-biome]');
    if (biome) { showBiomeInCatalog(biome.dataset.biome); return; }
    if (e.target.closest('[data-roll-name]')) {
      entry.name = rollSettlementName();
      persistJourney(kind, entry);
      renderJourneyPage(journeySel(kind, id, '[data-roll-name]'));
      return;
    }
    const reroll = e.target.closest('[data-reroll]');
    if (reroll) {
      const key = reroll.dataset.reroll;
      rerollRow(kind, entry, key);
      persistJourney(kind, entry);
      renderJourneyPage(journeySel(kind, id, `[data-reroll="${key}"]`));
      return;
    }
    if (e.target.closest('[data-save]')) { saveJourneyDraft(kind); return; }
    if (e.target.closest('[data-discard]')) {
      state.journeyDraft[kind] = null;
      renderJourneyPage(journeySel(kind, null, '[data-roll-new]'));
      return;
    }
    if (e.target.closest('[data-delete]')) deleteJourneyEntry(kind, id);
  });

  /* A typed name is the one thing on this page that is the GM's own text rather
   * than a roll, so it is written through on commit instead of on a re-render. */
  el.addEventListener('change', e => {
    const input = e.target.closest('.jr-name');
    if (!input) return;
    const entryEl = input.closest('.journey-entry');
    const { kind, id } = entryEl.dataset;
    const entry = journeyEntryById(kind, id);
    if (!entry) return;
    entry.name = input.value.trim();
    persistJourney(kind, entry);
  });
}

/* ---------------- Prep (#/prep) ----------------
   MVP: one active preparation, three binary-selection catalogs (no primary
   environment, no quantity anywhere). Pure selection/search logic lives in
   js/prep-utils.js (PrepUtils); this section is the DOM layer
   over it, following the same render-into-#grid-wrap architecture as
   renderListsHome()/renderJourneyPage() above. See the "Prep"
   sections in CLAUDE.md for the full contract.

   Rendering is split deliberately: renderPrepPage() builds the whole
   page once (route entry, language switch, catalogue retry); every
   selection action afterwards goes through a targeted refresh*() that
   replaces only the list/count it affects, so a source panel's search text,
   scroll position and focus are never disturbed by picking something —
   see "Transient UI state and rerendering" in CLAUDE.md. */

function setPrepCatalog(data) {
  const adversaries = (data.adversaries || []).filter(a => a && a.id);
  const itemIds = (data.items || []).filter(id => typeof id === 'string' && id);
  state.prepCatalog = {
    adversaries,
    itemIds,
    adversaryById: new Map(adversaries.map(a => [a.id, a])),
  };
  // state.i18n is already loaded by the time init()/retryPrepCatalog()
  // call this — same guarantee setEnvironmentCatalog() relies on for its own
  // environmentPrepSearchIndex.
  state.adversaryPrepSearchIndex = PrepUtils.buildAdversarySearchIndex(
    adversaries, state.i18n.en, state.i18n.ru);
  state.fcgSupportIndex = FreshCutGrassUtils.buildSupportedAdversaryIndex(adversaries);
  state.prepLoadFailed = false;
  // prepItems() below resolves itemIds against the already-loaded
  // itemCatalog (setItemCatalog() always runs first in init()), so the
  // Items toolbar's own search index can be built here too, right
  // alongside the adversary one above.
  state.itemBrowserSearchIndex = PrepUtils.buildItemSearchIndex(prepItems());
  rebuildPrepRecommendationIndex();
}

/** Re-derives which supported Prep adversaries each environment recommends.
 * Needs both catalogues, so it runs from whichever of setEnvironmentCatalog()
 * and setPrepCatalog() lands last (and again on a catalogue retry) — a pure
 * parse through PotentialAdversaryUtils, matched on canonical English names
 * against data/prep.json, which is the whitelist of what can be recommended.
 * Unknown/custom names simply fall out; nothing is logged or rendered for them. */
function rebuildPrepRecommendationIndex() {
  const nameIndex = PotentialAdversaryUtils.buildCatalogueNameIndex(state.prepCatalog.adversaries);
  state.prepRecommendationIndex = PotentialAdversaryUtils.buildEnvironmentRecommendationIndex(
    state.builtinEnvs, nameIndex);
}

/** The active Prep's recommendations with provenance — Map { adversaryId =>
 * { environmentIds, sourceCount } } — derived from its selected environments
 * on demand. Cheap (at most MAX_ENVIRONMENTS index lookups) and never stored,
 * so it can't go stale against the selection. */
function prepRecommendations(prep = activePrep()) {
  return PotentialAdversaryUtils.aggregateRecommendations(
    prep ? prep.environmentIds : [], state.prepRecommendationIndex);
}

/** Prep's items are ids into the shared item catalog (see itemById()
 * below), resolved to `{ id, ...item }` at render time rather than kept as
 * their own copy — an id an item load failure (or a stale build) left
 * dangling is dropped rather than rendered as a blank card. */
function prepItems() {
  return state.prepCatalog.itemIds
    .map(id => { const item = itemById(id); return item ? Object.assign({ id }, item) : null; })
    .filter(Boolean);
}

function spName(entry) { return entry.name?.[state.lang] || entry.name?.en || entry.name?.ru || entry.id; }

function activePrep() { return PrepUtils.getActivePrep(state.prep); }

/** The one place a Prep mutation is applied: runs `mutator` against
 * the active prep, stamps updatedAt, writes the whole store back through
 * persist() (which already reports a write failure via the app's one shared
 * toast — see reportStorageWriteFailure()), and hands back the structured
 * result so the caller can also refresh the inline save-status line. */
function updatePrep(mutator) {
  const current = activePrep();
  if (!current) return { prep: null, result: { ok: false, reason: 'no-prep' } };
  const mutated = Object.assign({}, mutator(current), { updatedAt: new Date().toISOString() });
  state.prep = PrepUtils.withActivePrep(state.prep, mutated);
  const result = persist(LS_KEYS.prep, state.prep);
  return { prep: mutated, result };
}

/** The save-status line is never blank and only ever reflects a real
 * persist() outcome: before the first mutation this visit it says autosave is
 * on (`ready`), after a successful write it shows when (`ok`), and after a
 * failed one it says so (`error`). "Saving…" is only ever the real pending
 * state of a debounced Session Notes write (`prepNotesDirty`): plain
 * SafeStorage writes are synchronous, so nothing else could show it. */
function prepSaveStatusView() {
  const ui = state.prepUI;
  const kind = PrepUtils.sessionSaveKind(ui.saveFailed, prepNotesDirty, ui.lastSavedAt);
  if (kind === 'error') return { kind, text: t('prep_save_failed'), tip: t('prep_save_failed_tip') };
  if (kind === 'saving') return { kind, text: t('prep_session_saving'), tip: t('prep_saved_local_tip') };
  if (kind === 'ready') return { kind, text: t('prep_autosave_ready'), tip: t('prep_autosave_ready_tip') };
  const time = ui.lastSavedAt.toLocaleTimeString(state.lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return { kind, text: `${t('prep_saved_local')} · ${time}`, tip: t('prep_saved_local_tip') };
}

/** Fills the status element from prepSaveStatusView(): a 14px state icon
 * (check / alert / spinner while a notes edit is pending / a neutral dot
 * before the first save) plus the text. Never colour-only — the icon and the
 * wording both change with the state. The element sits inside the session
 * selector button, so it is aria-hidden; the header control's live region
 * (paintSessionControl) is what announces a save. */
function paintSaveStatus(el) {
  const view = prepSaveStatusView();
  const icon = view.kind === 'ok' ? ICON_CHECK
    : view.kind === 'error' ? ICON_ALERT
    : view.kind === 'saving' ? '<span class="sp-session-spin"></span>'
    : '<span class="prep-save-dot"></span>';
  el.dataset.state = view.kind;
  el.dataset.tip = view.tip;
  el.innerHTML = `<span class="prep-save-icon" aria-hidden="true">${icon}</span><span class="prep-save-text">${escapeHtml(view.text)}</span>`;
}

/** Only ever called right after a persist() attempt — never speculatively —
 * so "Saved" never appears before SafeStorage has actually reported success.
 * The status line lives in the Prep Bar (see prepBarHtml()), directly
 * under the prep title. */
function updateSaveStatusDisplay(result) {
  state.prepUI.saveFailed = !result.ok;
  if (result.ok) state.prepUI.lastSavedAt = new Date();
  const statusEl = document.getElementById('prep-save-status');
  if (statusEl) paintSaveStatus(statusEl);
  paintSessionControl();
}

/* ---------------- Session Notes (per-prep scratchpad) ----------------
 * `prep.notes` is a plain string on each prep, edited in the Prep Bar's
 * textarea. A keystroke updates state.prep immediately (so a switch, a
 * language re-render or a duplicate always sees the latest text) but the
 * localStorage write is debounced — SafeStorage writes the whole store, so
 * one write per pause beats one per keystroke. flushPrepNotesSave() is the
 * single drain: it runs on the timer, on textarea blur, before every prep
 * lifecycle change, when the bar is collapsed or the route is left, and on
 * pagehide/visibilitychange/beforeunload, so a pending edit is never lost.
 * It reuses the one save-status line; there is no notes-specific indicator. */

const PREP_NOTES_SAVE_DELAY_MS = 400;
let prepNotesSaveTimer = null;
let prepNotesDirty = false;

/** Applies a notes edit to the active prep in memory only and schedules the
 * write. The text is stored exactly as typed — never trimmed. */
function setPrepNotes(value) {
  const prep = activePrep();
  if (!prep) return;
  const next = PrepUtils.setPrepNotes(state.prep, prep.id, value);
  if (next === state.prep) return;
  state.prep = next;
  prepNotesDirty = true;
  const pendingStatusEl = document.getElementById('prep-save-status');
  if (pendingStatusEl) paintSaveStatus(pendingStatusEl);
  paintSessionControl();
  clearTimeout(prepNotesSaveTimer);
  prepNotesSaveTimer = setTimeout(flushPrepNotesSave, PREP_NOTES_SAVE_DELAY_MS);
}

/** Writes a pending notes edit now. A no-op when nothing is pending, so it
 * is safe to call from every trigger above without extra writes. */
function flushPrepNotesSave() {
  clearTimeout(prepNotesSaveTimer);
  prepNotesSaveTimer = null;
  if (!prepNotesDirty) return;
  prepNotesDirty = false;
  updateSaveStatusDisplay(persist(LS_KEYS.prep, state.prep));
}

window.addEventListener('pagehide', flushPrepNotesSave);
window.addEventListener('beforeunload', flushPrepNotesSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPrepNotesSave();
});

/* ---------------- prep lifecycle (create / switch / rename / duplicate / delete) ----------------
 * Centralizes every operation that changes *which* preps exist or which
 * one is active — as opposed to updatePrep() above, which only
 * ever edits the active prep's own fields. Each of these mutates
 * state.prep exactly once and persists it exactly once, mirroring
 * updatePrep()'s own contract, so callers always follow the
 * same pattern: call one of these, then updateSaveStatusDisplay(result),
 * then a full renderPrepPage() (never a targeted refresh*() — the
 * active prep itself changed, not just one of its fields). */

/** Not cryptographically unique, only collision-resistant enough for a
 * client-only id a GM's own browser generates — the same shape list ids
 * already use (see createList() above). */
function generatePrepId() {
  return 'prep-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function prepDisplayTitle(prep) {
  return PrepUtils.resolvePrepTitle(prep && prep.title, t('prep_name_placeholder'));
}

function createPrep() {
  flushPrepNotesSave();
  const now = new Date().toISOString();
  const prep = PrepUtils.createDefaultPrep(generatePrepId(), now);
  state.prep = PrepUtils.addPrep(state.prep, prep);
  return persist(LS_KEYS.prep, state.prep);
}

/** Returns `null` (no-op, nothing to persist) when `prepId` is already
 * active or doesn't exist — same "identity means no-op" contract as
 * PrepUtils.setActivePrep() itself. */
function switchPrep(prepId) {
  flushPrepNotesSave();
  const next = PrepUtils.setActivePrep(state.prep, prepId);
  if (next === state.prep) return null;
  state.prep = next;
  return persist(LS_KEYS.prep, state.prep);
}

/** Copies the active prep's selections into a brand-new prep (new id,
 * new createdAt/updatedAt, a "<title> — copy" title) and makes it active.
 * Slices every id array so editing the duplicate can never mutate the
 * source prep's arrays; `notes` is a string, so the copy carries the source's
 * text by value. Returns `null` if there is no active prep to
 * duplicate. */
function duplicatePrep(prepId) {
  flushPrepNotesSave();
  const source = state.prep.sessions.find(s => s.id === prepId);
  if (!source) return null;
  const now = new Date().toISOString();
  const duplicate = Object.assign({}, source, {
    id: generatePrepId(),
    title: t('prep_copy_of').replace('{name}', prepDisplayTitle(source)),
    createdAt: now,
    updatedAt: now,
    environmentIds: source.environmentIds.slice(),
    adversaryIds: source.adversaryIds.slice(),
    itemIds: source.itemIds.slice(),
  });
  state.prep = PrepUtils.addPrep(state.prep, duplicate);
  return persist(LS_KEYS.prep, state.prep);
}

/** Deletes `prepId`, letting PrepUtils.removePrep() pick the
 * next active prep (or none, if it was the last one) — then, only here,
 * enforces the one invariant that helper deliberately leaves to its caller:
 * Prep must never be left with zero preps. A GM who deletes their
 * last saved prep gets a fresh empty one instead of an unusable page. */
function deletePrep(prepId) {
  flushPrepNotesSave();
  let next = PrepUtils.removePrep(state.prep, prepId);
  if (!next.sessions.length) {
    const now = new Date().toISOString();
    next = PrepUtils.addPrep(next, PrepUtils.createDefaultPrep(generatePrepId(), now));
  }
  state.prep = next;
  return persist(LS_KEYS.prep, state.prep);
}

function escapeSelectorAttrValue(value) { return String(value).replace(/(["\\])/g, '\\$1'); }

/** Keeps a source picker's checkbox in sync after the central list removes
 * an entry. A no-op if that row isn't currently rendered (filtered out by
 * search) — nothing to sync in that case, and the checkbox will read
 * correctly from state next time it is. */
function syncPickerCheckbox(attr, id, checked) {
  const cb = document.querySelector(`[${attr}="${escapeSelectorAttrValue(id)}"]`);
  if (cb) cb.checked = checked;
}

/** Every selection checkbox's accessible label describes what it currently
 * *does* ("Add …" / "Remove …"), not just the entry's name — see
 * prepToggleLabel() — so it has to be refreshed wherever the checked state
 * changes without a full picker rebuild (a toggle elsewhere, or a removal
 * from the central list). `attr` is the checkbox's own data attribute
 * (`data-sp-toggle-env`/`-adv`/`-item`). A no-op if that checkbox isn't
 * currently rendered (filtered out by search) — nothing to update in that
 * case, and it will read correctly from state next time it is. */
function updatePrepToggleLabel(attr, id, checked, name) {
  const cb = document.querySelector(`[${attr}="${escapeSelectorAttrValue(id)}"]`);
  if (cb) cb.setAttribute('aria-label', prepToggleLabel(name, checked));
}

/* ---------------- environments picker ---------------- */

function prepFilteredEnvs() {
  const filtered = PrepUtils.filterEnvironmentsByToolbar(allEnvs(), state.environmentPrepSearchIndex, {
    tiers: state.prepUI.envFilters.tiers,
    search: state.prepUI.envSearch,
  });
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  return PrepUtils.sortByTierThenName(filtered, env => env.tier, (a, b) => collator.compare(envName(a), envName(b)));
}

function envCountText() {
  return t('prep_results_count').replace('{n}', prepFilteredEnvs().length).replace('{total}', allEnvs().length);
}

/** A small biome-art thumbnail — the same per-biome fallback picture the
 * catalog card's <picture> falls back to (img/biomes/*-200.webp; no smaller
 * width is served), downscaled by CSS into a compact row here. No thumbnail
 * exists per-environment, only per-biome, so an environment with no terrain
 * biome (a settlement/universal-only entry) falls back to a plain icon
 * rather than a wrong or blank image. */
function prepEnvThumbHtml(env) {
  const biome = artBiome(env);
  if (!biome) return `<span class="prep-thumb prep-thumb-fallback" aria-hidden="true">${ICON_HEX}</span>`;
  return `<img class="prep-thumb" src="img/biomes/${biome}-200.webp" alt="" loading="lazy" decoding="async">`;
}

function envPickerRowHtml(env, prep) {
  const checked = prep.environmentIds.includes(env.id);
  const atLimit = !checked && prep.environmentIds.length >= PrepUtils.MAX_ENVIRONMENTS;
  const name = envName(env);
  const biome = artBiome(env);
  return `
    <div class="prep-row prep-env-row" data-env-id="${escapeAttr(env.id)}">
      ${prepSelectionCellHtml('data-sp-toggle-env', env.id, checked, name, atLimit)}
      <button type="button" class="prep-row-open" data-sp-open-env="${escapeAttr(env.id)}">
        ${prepEnvThumbHtml(env)}
        <span class="prep-row-text">
          <span class="prep-row-name">${escapeHtml(name)}</span>
          <span class="prep-row-meta">${t('tier_label')} ${env.tier} · ${escapeHtml(t('type_' + env.type))}${biome ? ' · ' + escapeHtml(t('biome_' + biome)) : ''}</span>
        </span>
      </button>
    </div>`;
}

function envPickerListHtml(prep) {
  const envs = prepFilteredEnvs();
  if (!envs.length) return `<p class="prep-empty">${escapeHtml(t('prep_environment_no_results'))}</p>`;
  return envs.map(env => envPickerRowHtml(env, prep)).join('');
}

/** The four pentagonal Tier toggle buttons in the compact toolbar — reuses
 * the .rank-icon control the main catalog toolbar and the Prep
 * adversary picker both already use for the same OR-multiselect Tier
 * filter, so this is the third caller of that same visual language rather
 * than a new one. Multi-selection: no button pressed means every Tier is
 * allowed (see filterEnvironmentsByToolbar()). */
function envTierButtonsHtml() {
  const active = state.prepUI.envFilters.tiers;
  return PrepUtils.ADVERSARY_TIERS.map(tier => `
    <button type="button" class="rank-icon rank-icon-sm${active.has(tier) ? ' active' : ''}"
            data-sp-env-tier="${tier}" aria-pressed="${active.has(tier)}"
            aria-label="${escapeAttr(t('tier_label'))} ${tier}"><span>${tier}</span></button>`).join('');
}

/** The compact "All Environments" toolbar: a search field, the four Tier
 * buttons, flexible space, and a "{n} of {total}" counter — replaces the
 * separate visible heading + search row the picker used to have (the
 * heading survives as an .sr-only <h2>, still the section's accessible
 * name via aria-labelledby). Lives as the sticky first child inside
 * .prep-picker-list itself (see the CSS) rather than above it, so it stays
 * visible while the row list scrolls underneath — refreshEnvPicker() below
 * only ever replaces #prep-env-list/#prep-env-count, never this toolbar
 * wrapper, so the search input and Tier buttons never lose focus or get
 * rebuilt out from under an in-progress interaction. */
function envPickerColumnHtml(prep) {
  return `
    <section class="prep-col prep-col-env" aria-labelledby="prep-env-heading">
      <h2 id="prep-env-heading" class="sr-only">${t('prep_all_environments')}</h2>
      <div class="prep-picker-list">
        <div class="prep-env-toolbar">
          <div class="field search-field prep-search prep-env-search">
            <input type="search" id="prep-env-search" aria-label="${escapeAttr(t('prep_environment_search'))}"
                   placeholder="${escapeAttr(t('prep_environment_search'))}" value="${escapeAttr(state.prepUI.envSearch)}">
          </div>
          <div class="rank-pills prep-env-tiers" role="group" aria-label="${escapeAttr(t('filter_tier'))}">
            ${envTierButtonsHtml()}
          </div>
          <span class="prep-count" id="prep-env-count" role="status" aria-live="polite">${escapeHtml(envCountText())}</span>
        </div>
        <div id="prep-env-list" role="list" aria-labelledby="prep-env-heading">${envPickerListHtml(prep)}</div>
      </div>
    </section>`;
}

function refreshEnvPicker() {
  const prep = activePrep();
  const list = document.getElementById('prep-env-list');
  if (list) list.innerHTML = envPickerListHtml(prep);
  const count = document.getElementById('prep-env-count');
  if (count) count.textContent = envCountText();
}

/* ---------------- adversaries picker ---------------- */

/** Tier/Type (each OR within its own set) ANDed with the tokenized free-text
 * search against the precomputed adversaryPrepSearchIndex — see
 * PrepUtils.filterAdversariesByToolbar() for the exact contract. */
function prepFilteredAdversaries() {
  const filtered = PrepUtils.filterAdversariesByToolbar(
    state.prepCatalog.adversaries, state.adversaryPrepSearchIndex, {
      search: state.prepUI.advSearch,
      tiers: state.prepUI.advFilters.tiers,
      types: state.prepUI.advFilters.types,
    });
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  return PrepUtils.sortByTierThenName(filtered, adv => adv.tier, (a, b) => collator.compare(spName(a), spName(b)));
}

function advCountText() {
  return t('prep_results_count').replace('{n}', prepFilteredAdversaries().length).replace('{total}', state.prepCatalog.adversaries.length);
}

function advTypesTriggerLabel() {
  const count = state.prepUI.advFilters.types.size;
  return count ? `${t('filter_type')} (${count})` : t('filter_type');
}

/** Localized "Tier N · Type" meta line shared by the adversary picker row
 * and the central selected-adversary row — see the "ADVERSARY ROWS AND
 * SELECTED LIST" section of the Prep spec in CLAUDE.md. */
function advMetaText(adv) {
  return `${t('tier_label')} ${adv.tier} · ${t('adversary_type_' + adv.type)}`;
}

/** The single-adversary FreshCutGrass link for a picker row's name/meta
 * zone: a one-adversary encounter built from that name alone, the same
 * pattern potentialAdversaryLinkHtml() already uses for a single name in an
 * environment's Potential Adversaries text (FreshCutGrass exposes no stable
 * per-adversary detail route — confirmed against its own adversary data
 * export, which has no id/slug field). Always built from the canonical
 * English name, regardless of the active UI language. */
function adversaryFreshCutGrassUrl(adv) {
  const enName = adv && adv.name && adv.name.en;
  return enName ? buildFreshCutGrassEncounterUrl(enName, [enName]) : null;
}

/** The external-link cue for adversary names — shared by the central
 * selected-adversary row and the "All Adversaries" picker row. It is the same
 * extIconHtml() every encounter link uses; .prep-sel-ext only sets its size
 * and alignment inside Prep's flex rows. */
function adversaryExtIconHtml() {
  return extIconHtml('prep-sel-ext');
}

/** Area 2 (artwork) of an adversary picker row: a real, focusable `<button>`
 * when local art exists (opens the art overlay), or the same non-interactive
 * fallback icon `<span>` as before when it doesn't — never a button with
 * nothing to open. A present-but-broken thumbnail at runtime (the delegated
 * 'error' listener below) swaps this same button's contents for the
 * fallback and strips the id that makes it clickable, so a broken image
 * never opens an empty overlay either. */
function prepAdvThumbHtml(adv, name) {
  if (!adv.art) return `<span class="prep-adv-thumb prep-thumb-fallback" aria-hidden="true">${ICON_ADVERSARY_FALLBACK}</span>`;
  const label = t('prep_open_adversary_image').replace('{name}', name);
  return `<button type="button" class="prep-adv-thumb prep-adv-thumb-btn" data-sp-open-adv-art="${escapeAttr(adv.id)}" aria-label="${escapeAttr(label)}">
    <img src="${escapeAttr(adv.art.thumb)}" alt="" loading="lazy" decoding="async" data-adv-thumb-img>
  </button>`;
}

/** Three isolated action zones — checkbox (selection), artwork button (the
 * art overlay), and one link wrapping name+meta (FreshCutGrass) — never a
 * whole-row click target. See the "All Adversaries" row spec in CLAUDE.md. */
function advPickerRowHtml(adv, prep, recommendedFor = null) {
  const checked = prep.adversaryIds.includes(adv.id);
  const name = spName(adv);
  const fcgUrl = adversaryFreshCutGrassUrl(adv);
  const fcgLabel = encounterLinkTip(name);
  const nameHtml = `<span class="prep-row-name">${escapeHtml(name)}</span>`;
  const metaHtml = `<span class="prep-row-meta">${escapeHtml(advMetaText(adv))}</span>`;
  // No FreshCutGrass URL: plain text, no link and no icon — never a broken link.
  const text = fcgUrl
    ? `<a class="prep-row-text prep-adv-link" href="${escapeAttr(fcgUrl)}" target="_blank" rel="noopener noreferrer"
         data-tip="${escapeAttr(fcgLabel)}" aria-label="${escapeAttr(fcgLabel)}">
        <span class="prep-adv-title">${nameHtml}${adversaryExtIconHtml()}</span>
        ${metaHtml}
      </a>`
    : `<div class="prep-row-text prep-adv-link">${nameHtml}${metaHtml}</div>`;
  return `
    <div class="prep-row prep-adv-row${recommendedFor ? ' is-recommended' : ''}" data-adv-id="${escapeAttr(adv.id)}" role="listitem">
      ${prepSelectionCellHtml('data-sp-toggle-adv', adv.id, checked, name)}
      ${prepAdvThumbHtml(adv, name)}
      ${recommendedFor ? recommendedStarHtml(recommendedFor) : ''}
      ${text}
    </div>`;
}

/** The "Recommended for: Bastion, Faestone Wode" text for a recommended row —
 * localized environment names, in the order the Prep selected them. */
function recommendedForText(recommendation, envNameById) {
  const names = recommendation.environmentIds.map(id => envNameById.get(id)).filter(Boolean);
  return t('prep_recommended_for').replace('{environments}', () => names.join(', '));
}

/** A non-interactive status marker, never a button: a sibling of the three
 * action zones (checkbox, artwork, name link), outside the name <a> — whose
 * own aria-label would otherwise swallow it — and out of the tab order. The
 * sources are in both the tooltip and the accessible name (role="img"), so
 * the gold colour is never the only carrier of the meaning. */
function recommendedStarHtml(sourcesText) {
  return `<span class="prep-rec-star" role="img" data-tip="${escapeAttr(sourcesText)}" aria-label="${escapeAttr(sourcesText)}"><span aria-hidden="true">★</span></span>`;
}

/** The filtered adversaries, recommended ones first. Search, Tier and Type
 * stay authoritative: they run first (prepFilteredAdversaries()) and the
 * result is only then partitioned, so a recommendation the filters hide is
 * never force-shown and nothing appears twice. With no supported
 * recommendation the picker is the plain flat list it always was. */
function advPickerListHtml(prep) {
  const advs = prepFilteredAdversaries();
  if (!advs.length) return `<p class="prep-empty">${escapeHtml(t('prep_adversary_no_results'))}</p>`;
  const recommendations = prepRecommendations(prep);
  const listLabel = ` aria-labelledby="prep-adv-heading"`;
  if (!recommendations.size) {
    return `<div role="list"${listLabel}>${advs.map(adv => advPickerRowHtml(adv, prep)).join('')}</div>`;
  }
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  const { recommended, rest } = PrepUtils.partitionRecommendedAdversaries(
    advs, recommendations, adv => adv.tier, (a, b) => collator.compare(spName(a), spName(b)));
  const envNameById = new Map(allEnvs().map(env => [env.id, envName(env)]));
  const restHtml = rest.length
    ? `<div role="list"${listLabel}>${rest.map(adv => advPickerRowHtml(adv, prep)).join('')}</div>`
    : '';
  if (!recommended.length) return restHtml;
  const label = t('prep_recommended_group');
  return `
    <section class="prep-rec-group" aria-labelledby="prep-rec-heading">
      <div class="prep-rec-head">
        <h3 class="prep-rec-title" id="prep-rec-heading"><span class="prep-rec-title-star" aria-hidden="true">★</span><span>${escapeHtml(label)}</span><span class="sr-only">: ${recommended.length}</span></h3>
        <span class="prep-rec-count" aria-hidden="true">${recommended.length}</span>
      </div>
      <div role="list" aria-labelledby="prep-rec-heading">${recommended.map(adv => advPickerRowHtml(adv, prep, recommendedForText(recommendations.get(adv.id), envNameById))).join('')}</div>
    </section>
    ${rest.length ? '<div class="prep-rec-divider" role="presentation"></div>' : ''}
    ${restHtml}`;
}

/** The four pentagonal Tier toggle buttons — same OR-multiselect control and
 * visual language as envTierButtonsHtml()'s own copy for the environment
 * toolbar (and the main catalog toolbar before that). */
function advTierButtonsHtml() {
  const active = state.prepUI.advFilters.tiers;
  return PrepUtils.ADVERSARY_TIERS.map(tier => `
    <button type="button" class="rank-icon rank-icon-sm${active.has(tier) ? ' active' : ''}"
            data-sp-adv-tier="${tier}" aria-pressed="${active.has(tier)}"
            aria-label="${escapeAttr(t('tier_label'))} ${tier}"><span>${tier}</span></button>`).join('');
}

/** The compact "All Adversaries" toolbar: search, the four Tier buttons, the
 * Type multiselect trigger, and the "{n} of {total}" count — replaces the
 * old visible heading + search row + Filters disclosure + Selected-only +
 * Clear filters entirely (see docs/architecture.md). Lives as the sticky
 * first child inside .prep-picker-list, same pattern envPickerColumnHtml()
 * uses. refreshAdvPicker() below only ever replaces #prep-adv-list/
 * #prep-adv-count, never this toolbar, so the search input, Tier buttons,
 * and an open Type dropdown all survive a filter/search change — a Tier
 * click updates its own pressed state directly in
 * bindPrepDelegation() rather than through a rebuild, for the same
 * reason the environment toolbar's Tier buttons do. */
function advToolbarHtml() {
  const f = state.prepUI.advFilters;
  return `
    <div class="prep-adv-toolbar">
      <div class="field search-field prep-search prep-adv-search">
        <input type="text" id="prep-adv-search" aria-label="${escapeAttr(t('prep_adversary_search'))}"
               placeholder="${escapeAttr(t('prep_adversary_search'))}" value="${escapeAttr(state.prepUI.advSearch)}">
        <button type="button" class="icon-btn icon-btn--reach search-clear-btn" id="prep-adv-search-clear" data-sp-clear-search="adv"
                aria-label="${escapeAttr(t('prep_clear_adversary_search'))}"
                style="${state.prepUI.advSearch ? '' : 'display:none;'}">${ICON_CLOSE}</button>
      </div>
      <div class="rank-pills prep-adv-tiers" role="group" aria-label="${escapeAttr(t('filter_tier'))}">
        ${advTierButtonsHtml()}
      </div>
      <div class="field ms-field" id="sp-adv-types-field">
        <button type="button" class="ms-trigger field-control" id="sp-adv-types-btn"
                aria-expanded="false" aria-controls="sp-adv-types-panel">
          <span class="ms-trigger-label">${escapeHtml(advTypesTriggerLabel())}</span>
        </button>
        <div class="ms-panel" id="sp-adv-types-panel" role="group" aria-label="${escapeAttr(t('filter_type'))}" hidden>
          ${PrepUtils.ADVERSARY_TYPES.map(type => `
          <label class="ms-row">
            <input type="checkbox" class="ms-checkbox sr-only" data-sp-adv-type="${type}" ${f.types.has(type) ? 'checked' : ''}>
            <span class="ms-row-label">${escapeHtml(t('adversary_type_' + type))}</span>
          </label>`).join('')}
          <button type="button" class="btn btn-ghost btn-sm ms-clear" id="sp-adv-clear-types"
                  style="${f.types.size ? '' : 'display:none;'}">${escapeHtml(t('prep_clear_adversary_types'))}</button>
        </div>
      </div>
      <span class="prep-count" id="prep-adv-count" role="status" aria-live="polite">${escapeHtml(advCountText())}</span>
    </div>`;
}

function advPickerColumnHtml(prep) {
  return `
    <section class="prep-col prep-col-adv" aria-labelledby="prep-adv-heading">
      <h2 id="prep-adv-heading" class="sr-only">${t('prep_all_adversaries')}</h2>
      <div class="prep-picker-list">
        ${advToolbarHtml()}
        <div id="prep-adv-list">${advPickerListHtml(prep)}</div>
      </div>
    </section>`;
}

function refreshAdvPicker() {
  const prep = activePrep();
  const list = document.getElementById('prep-adv-list');
  if (list) list.innerHTML = advPickerListHtml(prep);
  const count = document.getElementById('prep-adv-count');
  if (count) count.textContent = advCountText();
}

/** Binds the adversary Type multiselect. Rebound once per full
 * renderPrepPage() (the only time the toolbar's own markup is
 * (re)created) — the Tier buttons and search field need no separate bind
 * call here: Tier clicks are handled by the delegated listener in
 * bindPrepDelegation() (bound once, outlives any refreshAdvPicker()),
 * and the search input goes through bindPrepSearchField('adv'). */
function bindAdvToolbarControls() {
  const typesField = document.getElementById('sp-adv-types-field');
  if (typesField) {
    bindMultiSelectField({
      field: typesField,
      trigger: document.getElementById('sp-adv-types-btn'),
      panel: document.getElementById('sp-adv-types-panel'),
      onToggle(cb) { setSetValue(state.prepUI.advFilters.types, cb.dataset.spAdvType, cb.checked); },
      updateLabel(trigger) {
        trigger.querySelector('.ms-trigger-label').textContent = advTypesTriggerLabel();
        const clearBtn = document.getElementById('sp-adv-clear-types');
        if (clearBtn) clearBtn.style.display = state.prepUI.advFilters.types.size ? '' : 'none';
      },
      onChange: refreshAdvPicker,
    });
  }
}

/* ---------------- adversary artwork overlay ---------------- */

/** A focused artwork viewer only — close button, the large image, a
 * caption — never the adversary's stat block (Prep's adversary
 * catalogue is picker metadata only, see docs/product-decisions.md PD-005).
 * Reuses registerOverlay() for focus trap/Escape/scroll-lock/focus-restore
 * (same primitive openItemDetail() above uses) rather than duplicating that
 * lifecycle; styled as its own small card rather than reusing
 * .loot-modal's share/craft/copy chrome, none of which applies here. */
function openAdversaryArtOverlay(advId) {
  const adv = state.prepCatalog.adversaryById.get(advId);
  if (!adv || !adv.art) return;
  const name = spName(adv);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay adv-art-overlay';
  overlay.dataset.overlayKind = 'adv-art';
  overlay.innerHTML = `
    <div class="adv-art-modal-card" data-overlay-card role="dialog" aria-modal="true" aria-label="${escapeAttr(name)}">
      <button type="button" class="icon-btn icon-btn--overlay icon-btn--reach adv-art-close" aria-label="${escapeAttr(t('close'))}">${ICON_CLOSE}</button>
      <div class="adv-art-media">
        <img src="${escapeAttr(adv.art.full)}" alt="${escapeAttr(name)}" data-adv-art-img>
      </div>
      <p class="adv-art-caption">
        <span>${escapeHtml(name)}</span>
        <button type="button" class="icon-btn icon-btn--utility adv-art-copy" data-copy-adv-art
                data-tip="${escapeAttr(t('copy_image'))}" aria-label="${escapeAttr(t('copy_image'))}">${ITEM_IMAGE_ICON}</button>
      </p>
    </div>`;
  document.body.appendChild(overlay);

  const media = overlay.querySelector('.adv-art-media');
  // A picture that failed to load takes its copy button with it: there is
  // nothing left for the button to put on the clipboard.
  media.querySelector('img').addEventListener('error', () => {
    media.innerHTML = `<span class="adv-art-fallback">${ICON_ADVERSARY_FALLBACK}<span>${escapeHtml(t('prep_adversary_art_unavailable'))}</span></span>`;
    overlay.querySelector('.adv-art-copy')?.remove();
  });

  const teardown = registerOverlay(overlay, close);
  function close() { overlay.remove(); teardown(); }

  overlay.querySelector('.adv-art-close').addEventListener('click', close);
  overlay.querySelector('.adv-art-copy').addEventListener('click', () => copyItemImage(adv.art.full, name));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

/* ---------------- items panel ---------------- */

/** The compact "All Items" toolbar's full filter, read off
 * `state.prepUI` — types/sources (Sets), the raw search text, and
 * the active dice-roll filter's total (or null). Threaded through
 * PrepUtils.filterItemsByToolbar() against the precomputed
 * state.itemBrowserSearchIndex. */
function itemBrowserFilterOptions() {
  const ui = state.prepUI;
  return {
    types: ui.itemTypes,
    sources: ui.itemSources,
    search: ui.itemSearch,
    rollTotal: ui.itemRollFilter ? ui.itemRollFilter.total : null,
  };
}

/** Type/Source/search/roll only narrow the set; the surviving items are
 * then ordered by PrepUtils.sortItemsForPrep() — book roll number
 * (1 -> 99), then Source (core -> Hope and Fear), then Kind (item ->
 * consumable), then alphabetically — see
 * PrepUtils.filterItemsByToolbar() for the filter itself. */
function prepFilteredItems() {
  const filtered = PrepUtils.filterItemsByToolbar(
    prepItems(), state.itemBrowserSearchIndex, itemBrowserFilterOptions());
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  return PrepUtils.sortItemsForPrep(filtered, (a, b) => collator.compare(itemField(a, 'name'), itemField(b, 'name')));
}

/** "{n} of {total}" — {total} is always the grand 240-item Prep
 * catalogue, unaffected by any active filter (a deliberate simplification
 * from the old Category/Source-scoped count: see docs/architecture.md). */
function itemCountText() {
  return t('prep_results_count').replace('{n}', prepFilteredItems().length).replace('{total}', prepItems().length);
}

/** Stable catalogue totals for the two Type buttons' own labels
 * ("Items — 120"/"Consumables — 120") — never affected by Source/search/
 * roll, per the compact toolbar's own requirement that these counts stay
 * put while every other filter changes. */
function itemCategoryTotalCount(category) {
  return prepItems().filter(i => i.kind === category).length;
}

/** True while any of search/Type/Source/roll narrows the Items panel —
 * drives the one combined clear control living inside the search field
 * (see clearItemBrowserFilters() below). Reads the search input's live
 * value when the DOM element already exists (covers a keystroke not yet
 * debounced into state.prepUI.itemSearch), falling back to state
 * for the very first render before that element exists. */
function itemNonSearchItemFiltersActive() {
  const ui = state.prepUI;
  return !!(ui.itemTypes.size || ui.itemSources.size || ui.itemRollFilter);
}
function itemBrowserHasActiveFilters() {
  const input = document.getElementById('prep-item-search');
  const hasSearchText = input ? !!input.value : !!state.prepUI.itemSearch;
  return hasSearchText || itemNonSearchItemFiltersActive();
}

/** Independent multiselect: aria-pressed reflects Set membership, not a
 * single active value — "Items"/"Consumables" (or "Core"/"Hope & Fear"
 * below) can both be pressed, one, or neither (no restriction) at once. */
function itemTypeButtonHtml(type, label) {
  const active = state.prepUI.itemTypes.has(type);
  return `<button type="button" class="btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}"
                   data-sp-item-type="${type}" aria-pressed="${active}">${escapeHtml(label)} — ${itemCategoryTotalCount(type)}</button>`;
}

function itemSourceToggleButtonHtml(source, label) {
  const active = state.prepUI.itemSources.has(source);
  return `<button type="button" class="btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}"
                   data-sp-item-source="${source}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
}

/** The five roll-and-filter dice buttons. `itemRollFilter` (the active,
 * persistent filter) and `itemTransientRoll` (the ~1.2s on-button reveal)
 * are deliberately separate fields — see js/prep-utils.js and
 * docs/architecture.md — so this button can be "active" (gold, holding
 * the current filter) independently of whether it's also mid-reveal right
 * now. */
const ITEM_DICE_COUNTS = [1, 2, 3, 4, 5];

/** The rarity-guidance tooltip body for one dice count (data/i18n.json's
 * prep_dice_rarity_1..5, already a small rich-HTML fragment: bold
 * headings, separate paragraphs), plus a trailing "Last roll: N" line
 * when this exact button currently holds the active roll filter. */
function itemDiceTooltipHtml(diceCount) {
  const active = state.prepUI.itemRollFilter;
  const rarity = t('prep_dice_rarity_' + diceCount);
  if (active && active.diceCount === diceCount) {
    return rarity + `<p><strong>${escapeHtml(t('prep_dice_last_roll').replace('{n}', active.total))}</strong></p>`;
  }
  return rarity;
}

function itemDiceAriaLabel(diceCount) {
  const active = state.prepUI.itemRollFilter;
  if (active && active.diceCount === diceCount) {
    return t('prep_dice_roll_label_active').replace('{n}', diceCount).replace('{result}', active.total);
  }
  return t('prep_dice_roll_label').replace('{n}', diceCount);
}

function itemDiceLabelText(diceCount) {
  const transient = state.prepUI.itemTransientRoll;
  if (transient && transient.diceCount === diceCount) return String(transient.total);
  return `${diceCount}d12`;
}

/** Fixed-size button (`.dice-roll-btn`, see css/styles.css) so a two-digit
 * transient result never shifts the row; the icon is the one illustrated
 * d12 (img/ui/d12-roll.png) on all five buttons — decorative, the count
 * lives in the label. `data-tip-rich` (not `data-tip`) opts this trigger into
 * the tooltip system's rich/multi-paragraph rendering — see showTip(). */
function itemDiceButtonHtml(diceCount) {
  const ui = state.prepUI;
  const active = !!(ui.itemRollFilter && ui.itemRollFilter.diceCount === diceCount);
  const transient = !!(ui.itemTransientRoll && ui.itemTransientRoll.diceCount === diceCount);
  return `<button type="button" class="btn btn-sm dice-roll-btn${active ? ' is-active' : ''}${transient ? ' is-rolling' : ''}"
                   data-sp-item-dice="${diceCount}" data-tip-rich="${escapeAttr(itemDiceTooltipHtml(diceCount))}"
                   aria-label="${escapeAttr(itemDiceAriaLabel(diceCount))}">
            <img class="dice-roll-icon" src="img/ui/d12-roll.png" alt="" draggable="false">
            <span class="dice-roll-label">${escapeHtml(itemDiceLabelText(diceCount))}</span>
          </button>`;
}

function itemDiceGroupHtml() {
  return `<div class="item-toolbar-group dice-group" id="sp-item-dice-group" role="group" aria-label="${escapeAttr(t('prep_dice_group_label'))}">
            ${ITEM_DICE_COUNTS.map(itemDiceButtonHtml).join('')}
          </div>`;
}

function itemViewToggleButtonHtml(mode, label, icon) {
  const active = state.prepUI.itemViewMode === mode;
  return `<button type="button" class="btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'} item-view-btn"
                   data-sp-item-view="${mode}" aria-pressed="${active}" aria-label="${escapeAttr(label)}"
                   data-tip="${escapeAttr(label)}">${icon}</button>`;
}

function itemViewToggleGroupHtml() {
  return `<div class="item-toolbar-group view-toggle-group" role="group" aria-label="${escapeAttr(t('prep_view_mode_label'))}">
            ${itemViewToggleButtonHtml('gallery', t('prep_view_gallery'), ICON_VIEW_GALLERY)}
            ${itemViewToggleButtonHtml('compact', t('prep_view_compact'), ICON_VIEW_COMPACT)}
          </div>`;
}

/** The compact "All Items" toolbar: Type multiselect, Source multiselect,
 * search, five dice buttons, the Gallery/Compact switch, and a "{n} of
 * {total}" counter — one CSS-grid row, same structural pattern as
 * advToolbarHtml()/envPickerColumnHtml()'s own toolbars (see
 * "Prep's compact 'All Items' toolbar" in docs/architecture.md).
 * Unlike those two, this toolbar is not nested inside a scrolling
 * `.prep-picker-list` — the Items panel has no vertical list to scroll
 * past, only the horizontal gallery/compact strip below it — but the same
 * "toolbar controls mutate themselves directly, refresh*() never touches
 * them" discipline applies: refreshItemGrid() below only ever replaces
 * the active grid + the counter, never this toolbar. */
function itemToolbarHtml() {
  return `
    <div class="item-toolbar" id="sp-item-toolbar">
      <div class="item-toolbar-group" role="group" aria-label="${escapeAttr(t('prep_category_label'))}">
        ${itemTypeButtonHtml('item', t('prep_category_items'))}
        ${itemTypeButtonHtml('consumable', t('prep_category_consumables'))}
      </div>
      <div class="item-toolbar-group" role="group" aria-label="${escapeAttr(t('filter_source'))}">
        ${itemSourceToggleButtonHtml('core', t('item_src_core'))}
        ${itemSourceToggleButtonHtml('hnf', t('item_src_hnf'))}
      </div>
      <div class="field search-field prep-search item-toolbar-search">
        <input type="text" id="prep-item-search" aria-label="${escapeAttr(t('prep_item_search'))}"
               placeholder="${escapeAttr(t('prep_item_search'))}" value="${escapeAttr(state.prepUI.itemSearch)}">
      </div>
      <button type="button" class="btn btn-ghost item-clear-btn" id="prep-item-search-clear" data-sp-clear-search="item"
              aria-label="${escapeAttr(t('prep_clear_item_filters'))}" data-tip="${escapeAttr(t('prep_clear_item_filters'))}"
              ${itemBrowserHasActiveFilters() ? '' : 'disabled'}>${ICON_CLOSE}</button>
      ${itemDiceGroupHtml()}
      ${itemViewToggleGroupHtml()}
      <span class="prep-count item-toolbar-count" id="prep-item-total-count" role="status" aria-live="polite">${escapeHtml(itemCountText())}</span>
    </div>`;
}

function prepItemThumbHtml(item) {
  const url = itemImageUrl(item);
  if (!url) return `<span class="prep-item-thumb prep-thumb-fallback" aria-hidden="true">${ICON_ITEM_FALLBACK}</span>`;
  return `<span class="prep-item-thumb"><img src="${escapeAttr(url)}" alt="" loading="lazy" decoding="async" data-item-thumb-img></span>`;
}

/** Localized label for a selection checkbox, reflecting what the action
 * currently does ("Add …"/"Remove …") rather than a static name — kept in
 * sync with the checkbox's own `checked` state everywhere that state can
 * change without a full grid rebuild (see updatePrepToggleLabel() below).
 * Shared by all three pickers (environments, adversaries, items). */
function prepToggleLabel(name, checked) {
  return t(checked ? 'prep_remove_from_prep' : 'prep_add_to_prep').replace('{name}', name);
}

/** The one selection cell every picker shares (environment rows, adversary
 * rows, compact item rows, gallery item tiles): a `.prep-checkbox-hit`
 * label — the whole ~32px area toggles — around the 18px checkbox. Sizing
 * lives in the --sel-* tokens in css/styles.css, never per picker. `attr`
 * is our own literal (data-sp-toggle-env/adv/item), matched by the
 * delegated 'change' handler. */
function prepSelectionCellHtml(attr, id, checked, name, disabled = false) {
  return `<label class="prep-checkbox-hit">
        <input type="checkbox" class="prep-select-checkbox" ${attr}="${escapeAttr(id)}"
               ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} aria-label="${escapeAttr(prepToggleLabel(name, checked))}">
      </label>`;
}

/* Item metadata (name, kind, source, roll, image, description) all live in
 * data/items.json — see itemById()/itemField() near the top of the file —
 * so this card is just a thin picker skin over that catalog. Clicking the
 * icon opens the very same openItemDetail() overlay the main Items page
 * uses; Prep keeps no item-detail code of its own.
 *
 * Art-first tile: the name only appears as a bottom overlay, and the
 * "kind · source · #roll" line (no name — the overlay already gives that)
 * only in the data-tip tooltip (both on hover/focus, see css/styles.css's
 * .prep-item-name-overlay) — the artwork itself is the permanent content.
 * This is the one Prep
 * picker where the selection checkbox (.prep-checkbox-hit) is hidden until
 * hover/:focus-within rather than always visible, an intentional exception
 * scoped to `.prep-item-card` alone (env/adv rows keep the always-visible
 * checkbox described in CLAUDE.md's "Prep" section). The preview
 * button (opens detail) and the checkbox (selects) stay two separate
 * sibling controls either way — never one toggling the other. */
/** "#19 · Consumable · Core" — the single item meta line, used by the
 * gallery tile's data-tip tooltip, the compact picker row's second line and
 * the selected item card. Order and its rationale (roll-first so truncation
 * eats Source, not the roll) live in PrepUtils.formatItemMeta(). */
function itemMetaText(item) {
  const kind = item.kind === 'consumable' ? 'consumable' : 'item';
  return PrepUtils.formatItemMeta(item.roll, t('item_kind_' + kind), t('item_src_' + item.src));
}

function itemCardHtml(item, prep) {
  const checked = prep.itemIds.includes(item.id);
  const name = itemField(item, 'name');
  return `
    <div class="prep-item-card${checked ? ' is-selected' : ''}" data-item-id="${escapeAttr(item.id)}">
      <button type="button" class="prep-item-icon-btn" data-sp-open-item="${escapeAttr(item.id)}"
              data-tip="${escapeAttr(itemMetaText(item))}" aria-label="${escapeAttr(t('prep_open_item_detail').replace('{name}', name))}">
        ${prepItemThumbHtml(item)}
        <span class="prep-item-name-overlay">${escapeHtml(name)}</span>
      </button>
      ${prepSelectionCellHtml('data-sp-toggle-item', item.id, checked, name)}
    </div>`;
}

function itemCardsHtml(prep) {
  const items = prepFilteredItems();
  if (!items.length) return `<p class="prep-empty">${escapeHtml(t('prep_item_no_results'))}</p>`;
  return items.map(item => itemCardHtml(item, prep)).join('');
}

/** Compact view's two-line record: thumbnail + name (ellipsis, with a
 * native `title` for the full name on hover/focus — no second tooltip
 * system needed for that) on the first line, "Item · Core · #1" on the
 * second. Reuses data-sp-open-item/data-sp-toggle-item, so the existing
 * delegated handlers in bindPrepDelegation() need no change to
 * support this view — clicking the name opens the same openItemDetail()
 * overlay the gallery card's icon button does; the checkbox is a
 * separate, always-visible sibling control, same convention as the
 * environment/adversary picker rows (there is no hover-art surface to
 * hide it behind here, unlike the gallery tile). */
function compactItemRowHtml(item, prep) {
  const checked = prep.itemIds.includes(item.id);
  const name = itemField(item, 'name');
  return `
    <div class="prep-row prep-item-compact-row" data-item-id="${escapeAttr(item.id)}">
      ${prepSelectionCellHtml('data-sp-toggle-item', item.id, checked, name)}
      <button type="button" class="prep-row-open" data-sp-open-item="${escapeAttr(item.id)}"
              aria-label="${escapeAttr(t('prep_open_item_detail').replace('{name}', name))}">
        ${prepItemThumbHtml(item)}
        <span class="prep-row-text">
          <span class="prep-row-name" title="${escapeAttr(name)}">${escapeHtml(name)}</span>
          <span class="prep-row-meta">${escapeHtml(itemMetaText(item))}</span>
        </span>
      </button>
    </div>`;
}

function compactItemGridHtml(prep) {
  const items = prepFilteredItems();
  if (!items.length) return `<p class="prep-empty">${escapeHtml(t('prep_item_no_results'))}</p>`;
  return items.map(item => compactItemRowHtml(item, prep)).join('');
}

/** The Items panel: an .sr-only heading (the visible heading was retired
 * along with the old stacked filters/search rows — see itemToolbarHtml()),
 * the compact toolbar, and both view strips as siblings — only one
 * visible at a time (`hidden`, toggled by setItemViewMode()), each with
 * its own prev/next nav-arrow pair so initPrepItemNav() can target
 * whichever is active without the two interfering. Gallery
 * (`#prep-item-grid`) is untouched from before this redesign; Compact
 * (`#prep-item-compact-grid`) is new. */
function itemsPanelHtml(prep) {
  const galleryHidden = state.prepUI.itemViewMode !== 'gallery';
  const compactHidden = state.prepUI.itemViewMode !== 'compact';
  return `
    <section class="prep-items-panel" aria-labelledby="prep-items-heading">
      <h2 id="prep-items-heading" class="sr-only">${t('prep_items')}</h2>
      ${itemToolbarHtml()}
      <div class="prep-item-strip-wrap" id="sp-item-gallery-wrap" ${galleryHidden ? 'hidden' : ''}>
        <button type="button" class="edge-nav" data-sp-item-nav="prev" aria-label="${escapeAttr(t('prep_item_nav_prev'))}">${ICON_CHEVRON_UP}</button>
        <div class="prep-item-grid" id="prep-item-grid">${itemCardsHtml(prep)}</div>
        <button type="button" class="edge-nav" data-sp-item-nav="next" aria-label="${escapeAttr(t('prep_item_nav_next'))}">${ICON_CHEVRON_UP}</button>
      </div>
      <div class="prep-item-strip-wrap prep-item-compact-wrap" id="sp-item-compact-wrap" ${compactHidden ? 'hidden' : ''}>
        <button type="button" class="edge-nav" data-sp-item-nav="prev" aria-label="${escapeAttr(t('prep_item_nav_prev'))}">${ICON_CHEVRON_UP}</button>
        <div class="prep-item-compact-grid" id="prep-item-compact-grid">${compactItemGridHtml(prep)}</div>
        <button type="button" class="edge-nav" data-sp-item-nav="next" aria-label="${escapeAttr(t('prep_item_nav_next'))}">${ICON_CHEVRON_UP}</button>
      </div>
    </section>`;
}

/** Which of the two view strips' grid element is currently active — the
 * one refreshItemGrid()/initPrepItemNav() should target. */
function activeItemGridId() {
  return state.prepUI.itemViewMode === 'compact' ? 'prep-item-compact-grid' : 'prep-item-grid';
}

/** Rebuilds only the currently active grid (gallery or compact) plus the
 * toolbar's counter — never the toolbar itself, same discipline
 * refreshEnvPicker()/refreshAdvPicker() already follow — so the search
 * input, Type/Source/dice/view buttons never lose focus or get rebuilt
 * out from under an in-progress interaction. Called after every
 * filter-affecting change: Type/Source toggle, a committed search edit,
 * a dice roll, or Clear. */
function refreshItemGrid(opts) {
  const prep = activePrep();
  const grid = document.getElementById(activeItemGridId());
  if (grid) {
    grid.innerHTML = state.prepUI.itemViewMode === 'compact'
      ? compactItemGridHtml(prep) : itemCardsHtml(prep);
  }
  const count = document.getElementById('prep-item-total-count');
  if (count) count.textContent = itemCountText();
  syncCompactRows(opts);
  refreshPrepItemNav();
}

/** Picks the Compact strip's one of two deterministic heights (data-rows
 * "1" or "2", animated by CSS) from the *rendered* capacity: how many
 * minimum-width columns fit the wrap's full width (arrows excluded, so
 * their visibility never feeds back into the height). Records fit one row
 * when there are no more than that many; the strip never goes beyond two
 * rows. Only writes on an actual change, so the ResizeObserver that fires
 * while the height transitions settles immediately. `animate: false`
 * applies the state without a transition (first paint, view switch). */
function syncCompactRows({ animate = true } = {}) {
  const grid = document.getElementById('prep-item-compact-grid');
  const wrap = grid && grid.parentElement;
  if (!wrap || wrap.hidden) return;
  const width = wrap.clientWidth;
  if (!width) return;
  // The scrollbar track the strip reserves is browser-defined (thin ≠ 8px
  // everywhere, 0 for overlay scrollbars): read it once and feed it to the
  // two fixed heights, so neither state clips the rows' bottom padding.
  const track = grid.offsetHeight - grid.clientHeight;
  if (track >= 0 && grid.dataset.track !== String(track)) {
    grid.style.transition = 'none';
    grid.dataset.track = String(track);
    grid.style.setProperty('--prep-compact-scroll-h', track + 'px');
    void grid.offsetHeight;
    grid.style.transition = '';
  }
  const cs = getComputedStyle(grid);
  const gap = parseFloat(cs.columnGap) || 0;
  const colMin = parseFloat(cs.getPropertyValue('--prep-compact-col-min')) || 240;
  const capacity = Math.max(1, Math.floor((width + gap) / (colMin + gap)));
  const count = grid.querySelector('.prep-empty') ? 0 : grid.childElementCount;
  const rows = count <= capacity ? '1' : '2';
  if (grid.dataset.rows === rows) return;
  if (!animate) grid.style.transition = 'none';
  grid.dataset.rows = rows;
  if (!animate) {
    void grid.offsetHeight;
    grid.style.transition = '';
  }
}

/** Enables/disables the clear-all-filters button beside the search field —
 * called after every Type/Source/dice/Clear change (search itself is
 * handled inline by bindPrepSearchField('item')'s own input
 * listener, which already knows the field's live value). */
function updateItemClearButtonVisibility() {
  const btn = document.getElementById('prep-item-search-clear');
  if (btn) btn.disabled = !itemBrowserHasActiveFilters();
}

/** Switches Gallery/Compact: toggles both strips' `hidden`, the two view
 * buttons' pressed state, rebuilds the newly-active grid (filters may
 * have changed while it was hidden — refreshItemGrid() only ever
 * refreshes the *active* one) and re-points the nav-arrow controller at
 * it. Deliberately never touched by clearItemBrowserFilters() — the view
 * a GM is looking at is not itself a "filter". */
function setItemViewMode(mode) {
  if (state.prepUI.itemViewMode === mode) return;
  state.prepUI.itemViewMode = mode;
  const galleryWrap = document.getElementById('sp-item-gallery-wrap');
  const compactWrap = document.getElementById('sp-item-compact-wrap');
  if (galleryWrap) galleryWrap.hidden = mode !== 'gallery';
  if (compactWrap) compactWrap.hidden = mode !== 'compact';
  document.querySelectorAll('[data-sp-item-view]').forEach(btn => {
    const active = btn.dataset.spItemView === mode;
    btn.classList.toggle('btn-primary', active);
    btn.classList.toggle('btn-ghost', !active);
    btn.setAttribute('aria-pressed', String(active));
  });
  // The strip was display:none until a moment ago, so its height settles
  // without a transition.
  refreshItemGrid({ animate: false });
  initPrepItemNav(activeItemGridId());
}

/* ---------------- item dice roll-and-filter buttons ----------------
 * Rolling a die never rebuilds the toolbar or the item grid's DOM
 * identity beyond what refreshItemGrid() already does for any filter
 * change — only this one button's own label/aria-label/tooltip attribute
 * are mutated directly, so rapid repeat clicks (same or a different
 * button) never lose focus and never touch the search field. */

const ITEM_DICE_TRANSIENT_MS = 1200;
let itemDiceTimer = null;

function updateItemDiceButton(diceCount) {
  const btn = document.querySelector(`[data-sp-item-dice="${diceCount}"]`);
  if (!btn) return;
  const ui = state.prepUI;
  const active = !!(ui.itemRollFilter && ui.itemRollFilter.diceCount === diceCount);
  const transient = !!(ui.itemTransientRoll && ui.itemTransientRoll.diceCount === diceCount);
  btn.classList.toggle('is-active', active);
  btn.classList.toggle('is-rolling', transient);
  btn.dataset.tipRich = itemDiceTooltipHtml(diceCount);
  btn.setAttribute('aria-label', itemDiceAriaLabel(diceCount));
  const label = btn.querySelector('.dice-roll-label');
  if (label) label.textContent = itemDiceLabelText(diceCount);
}

function updateAllItemDiceButtons() {
  ITEM_DICE_COUNTS.forEach(updateItemDiceButton);
}

/** Rolls `diceCount`d12, replaces the active roll filter with the new
 * total, shows it in place of the clicked button's own label for
 * ITEM_DICE_TRANSIENT_MS, then reverts — the filter itself stays active
 * after reverting. Clicking the already-active button rerolls (no
 * special case: this always overwrites itemRollFilter/itemTransientRoll
 * and restarts the timer). Never disabled, never debounced. */
function rollPrepItemDice(diceCount) {
  clearTimeout(itemDiceTimer);
  const total = PrepUtils.rollNd12(diceCount);
  state.prepUI.itemRollFilter = { diceCount, total };
  state.prepUI.itemTransientRoll = { diceCount, total };
  updateAllItemDiceButtons();
  updateItemClearButtonVisibility();
  refreshItemGrid();
  itemDiceTimer = setTimeout(() => {
    state.prepUI.itemTransientRoll = null;
    itemDiceTimer = null;
    updateAllItemDiceButtons();
  }, ITEM_DICE_TRANSIENT_MS);
}

/** Clears the pending reveal timer — called wherever render() already
 * tears down destroyPrepItemNav() on leaving the prep
 * route, so no timer outlives the page. */
function destroyPrepItemDice() {
  clearTimeout(itemDiceTimer);
  itemDiceTimer = null;
}

/** The Items panel's one combined "reset everything" control (lives
 * inside the search field, reusing .search-clear-btn — see
 * itemToolbarHtml()): resets search, both multiselects, the active roll
 * filter, and any pending reveal timer, but deliberately leaves
 * itemViewMode untouched. Every toolbar control it affects is mutated
 * directly (same discipline as the rest of this toolbar), so this never
 * rebuilds the toolbar wrapper itself. */
function clearItemBrowserFilters() {
  const ui = state.prepUI;
  ui.itemSearch = '';
  ui.itemTypes.clear();
  ui.itemSources.clear();
  ui.itemRollFilter = null;
  ui.itemTransientRoll = null;
  clearTimeout(itemDiceTimer);
  itemDiceTimer = null;
  const input = document.getElementById('prep-item-search');
  if (input) input.value = '';
  document.querySelectorAll('[data-sp-item-type], [data-sp-item-source]').forEach(btn => {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-ghost');
    btn.setAttribute('aria-pressed', 'false');
  });
  updateAllItemDiceButtons();
  updateItemClearButtonVisibility();
  refreshItemGrid();
  // No refocus of the search input: this clears Type/Source/dice too, so
  // focusing the search field would light it up as if it were the active filter.
}

/* ---------------- item strip manual navigation ----------------
 *
 * The item strip never moves on its own. Native trackpad/wheel/touch/
 * scrollbar scrolling always works (plain CSS overflow-x); this controller
 * only adds the two prev/next arrow buttons around #prep-item-grid, shown
 * only while the strip actually overflows, and keeps their disabled state
 * in sync with the current scroll position after scrolling, searching,
 * resizing, and language changes.
 *
 * One controller instance lives in `itemNavState`, created by
 * initPrepItemNav() and torn down by destroyPrepItemNav() —
 * the only two functions here that touch that variable — so there is never
 * more than one set of listeners at a time, across language switches, full
 * re-renders, catalogue retries, and navigating away from and back to
 * Prep. */

let itemNavState = null;

/** Scrolls by ~80% of the strip's own visible width, smoothly unless the
 * reader has asked for reduced motion. */
function scrollPrepItemStrip(direction) {
  const s = itemNavState;
  if (!s || !s.el) return;
  const step = Math.max(1, Math.round(s.el.clientWidth * 0.8));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  s.el.scrollBy({ left: direction * step, behavior: reduceMotion ? 'auto' : 'smooth' });
}

/** Shows/hides each arrow (no overflow at all -> both hidden; each also
 * hides at its own scroll boundary). Called after the strip is built, after every
 * refreshItemGrid() re-filter, on scroll, and on resize. */
function refreshPrepItemNav() {
  const s = itemNavState;
  if (!s || !s.el) return;
  const max = Math.max(0, s.el.scrollWidth - s.el.clientWidth);
  // The arrows overlay the strip and take no space, so overflow is simply
  // "there is something to scroll"; each one shows only while scrolling in
  // its direction is possible. 1px tolerance for fractional scrollLeft.
  const overflowing = max > 0;
  if (s.prevBtn) s.prevBtn.dataset.visible = String(overflowing && s.el.scrollLeft > 1);
  if (s.nextBtn) s.nextBtn.dataset.visible = String(overflowing && s.el.scrollLeft < max - 1);
}

/** Builds the one controller instance for the *currently active* view's
 * grid (`gridId`: 'prep-item-grid' for Gallery, 'prep-item-compact-grid'
 * for Compact — see activeItemGridId()) and its two arrow buttons
 * (siblings within that grid's own .prep-item-strip-wrap — see
 * itemsPanelHtml()). Safe to call any number of times — it always tears
 * down a previous instance first. Called once from renderPrepPage()
 * (the only place these elements are (re)created) and again from
 * setItemViewMode() every time the active grid element itself changes. */
function initPrepItemNav(gridId = 'prep-item-grid') {
  destroyPrepItemNav();
  const el = document.getElementById(gridId);
  if (!el) return;
  const wrap = el.parentElement;
  const prevBtn = wrap && wrap.querySelector('[data-sp-item-nav="prev"]');
  const nextBtn = wrap && wrap.querySelector('[data-sp-item-nav="next"]');

  const s = { el, prevBtn, nextBtn };
  s.onScroll = () => refreshPrepItemNav();
  el.addEventListener('scroll', s.onScroll, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    s.ro = new ResizeObserver(() => { syncCompactRows(); refreshPrepItemNav(); });
    s.ro.observe(el);
  } else {
    s.onWindowResize = () => { syncCompactRows(); refreshPrepItemNav(); };
    window.addEventListener('resize', s.onWindowResize);
  }

  itemNavState = s;
  syncCompactRows({ animate: false });
  refreshPrepItemNav();
}

/** Disconnects the observer/listeners this controller added — called
 * before every (re)init, and whenever render() leaves the prep
 * route, so nothing from this controller outlives its page. */
function destroyPrepItemNav() {
  const s = itemNavState;
  if (!s) return;
  if (s.el) s.el.removeEventListener('scroll', s.onScroll);
  if (s.ro) s.ro.disconnect();
  if (s.onWindowResize) window.removeEventListener('resize', s.onWindowResize);
  itemNavState = null;
}

/* ---------------- central preparation ----------------
 *
 * One compact "prep manifest": three sections (environments, adversaries,
 * items) that share one selected-entity primitive (selectedEntityHtml() +
 * centralThumbHtml() → .prep-sel* in css/styles.css) — same thumbnail,
 * typography, remove button, radius, hover and focus treatment everywhere.
 * Only the layout differs: environments and items are cards in a grid,
 * adversaries are dense rows in one shared list surface.
 *
 * Environments are the only section with a configured limit
 * (PrepUtils.MAX_ENVIRONMENTS); adversaries and items are uncapped
 * (PD-002), so their header count is a plain number, never "n/max". */

const CENTRAL_THUMB_FALLBACK = { env: ICON_HEX, adv: ICON_ADVERSARY_FALLBACK, item: ICON_ITEM_FALLBACK };

/** Fixed-size, centered, object-fit:contain thumbnail wrapper for every
 * selected entity — the image can never affect its row's height, and a
 * missing/broken image falls back to the same wrapper with an icon (see the
 * delegated 'error' listener, `data-sel-thumb-img`). Decorative: the entity
 * name next to it is what assistive tech reads. `kind` is our own literal.
 *
 * `action` ({attr, id, label, tip}) turns the wrapper into a real sibling
 * <button> (the adversary art preview) instead of a decorative <span>: the
 * button itself stays in the accessibility tree with its own name while the
 * picture inside is hidden from it. A fallback thumbnail is never a button —
 * nothing to open — same rule as the catalog's prepAdvThumbHtml(). */
function centralThumbHtml(kind, src, action = null) {
  if (!src) return `<span class="prep-sel-thumb is-fallback" data-kind="${kind}" aria-hidden="true">${CENTRAL_THUMB_FALLBACK[kind]}</span>`;
  const img = `<img src="${escapeAttr(src)}" alt="" loading="lazy" decoding="async" data-sel-thumb-img>`;
  if (!action) return `<span class="prep-sel-thumb" data-kind="${kind}" aria-hidden="true">${img}</span>`;
  return `<button type="button" class="prep-sel-thumb prep-sel-thumb-btn" data-kind="${kind}" ${action.attr}="${escapeAttr(action.id)}"
            data-tip="${escapeAttr(action.tip)}" aria-label="${escapeAttr(action.label)}">${img}</button>`;
}

/** The shared selected-entity primitive: thumbnail, name (≤2 lines), meta
 * (1 line), semantic remove button. `layout` is 'card' (bordered tile —
 * environments, items) or 'row' (borderless list row — adversaries). Name
 * and meta carry `data-sel-clamp` so syncCentralTruncationTips() can attach
 * the full text as a tooltip when — and only when — the layout clipped it.
 * `removeAttr` is our own literal (data-sp-remove-env/adv/item), matched by
 * the delegated click handler.
 *
 * Interaction zones are always *sibling* elements, never nested and never
 * one big wrapper with stopPropagation() on its children:
 *  - card layout: one `.prep-sel-main` <button> (thumbnail + text + all the
 *    empty space in the card) carrying `openAttr`, plus the remove button.
 *    Opens the same overlay the catalog opens (environment route / item
 *    detail).
 *  - row layout: the thumbnail (its own art-preview button, see
 *    centralThumbHtml()), a `.prep-sel-main` <a> (`link`: {href, label,
 *    tip}) to FreshCutGrass with a secondary external-link icon, and the remove button.
 * DOM order is the tab order: primary action, external link, remove. */
function selectedEntityHtml({ layout, id, thumb, name, meta, removeAttr, removeLabel, removeTip, openAttr = '', openLabel = '', link = null, attrs = '' }) {
  const text = `
        <span class="prep-sel-body">
          <span class="prep-sel-title">
            <span class="prep-sel-name" data-sel-clamp>${escapeHtml(name)}</span>${link ? adversaryExtIconHtml() : ''}
          </span>
          <span class="prep-sel-meta" data-sel-clamp>${escapeHtml(meta)}</span>
        </span>`;
  let main;
  if (link) {
    main = `${thumb}
      <a class="prep-sel-main prep-sel-link" href="${escapeAttr(link.href)}" target="_blank" rel="noopener noreferrer"
         aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" data-tip="${escapeAttr(link.tip)}" aria-label="${escapeAttr(link.label)}">${text}
      </a>`;
  } else if (layout === 'row') {
    // An adversary with no FreshCutGrass URL: plain text, never a dead link.
    main = `<div class="prep-sel-main prep-sel-main--static" tabindex="0" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">${thumb}${text}</div>`;
  } else {
    main = `<button type="button" class="prep-sel-main" ${openAttr}="${escapeAttr(id)}" aria-label="${escapeAttr(openLabel)}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">
        ${thumb}${text}
      </button>`;
  }
  return `
    <li class="prep-sel prep-sel--${layout}" data-sel-id="${escapeAttr(id)}"${attrs}>
      ${main}
      <button type="button" class="icon-btn icon-btn--danger prep-sel-remove" ${removeAttr}="${escapeAttr(id)}"
              data-tip="${escapeAttr(removeTip)}" aria-label="${escapeAttr(removeLabel)}">${ICON_CLOSE}</button>
    </li>`;
}

/** Full text as a tooltip on any name/meta the layout has clipped (width
 * ellipsis or the two-line clamp); removed again once it fits. Reads layout,
 * so it runs after every central render, on resize, and once fonts settle. */
function syncCentralTruncationTips() {
  document.querySelectorAll('.prep-central [data-sel-clamp]').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) el.dataset.tip = el.textContent;
    else delete el.dataset.tip;
  });
}
window.addEventListener('resize', syncCentralTruncationTips);

/** Compact "3/3" (capped section) or "4" (uncapped) header counter. Visible
 * text is aria-hidden; screen readers get the localized "Selected: 3 of 3"
 * (plus the limit sentence at the cap) so the limit state never depends on
 * colour alone — sighted users additionally get the gold pill shape and the
 * tooltip. */
function centralCountHtml(id, count, max) {
  const atLimit = max != null && count >= max;
  const visible = max != null ? `${count}/${max}` : `${count}`;
  let spoken = max != null
    ? t('prep_selected_count_max').replace('{n}', count).replace('{max}', max)
    : t('prep_selected_count').replace('{n}', count);
  if (atLimit) spoken += `. ${t('prep_central_limit_reached')}`;
  const tip = atLimit ? ` data-tip="${escapeAttr(t('prep_central_limit_reached'))}"` : '';
  return `<span class="prep-central-count${atLimit ? ' is-limit' : ''}" id="${id}" role="status"${tip}><span aria-hidden="true">${visible}</span><span class="sr-only">${escapeHtml(spoken)}</span></span>`;
}

function setCentralCount(id, count, max) {
  const el = document.getElementById(id);
  if (el) el.outerHTML = centralCountHtml(id, count, max);
}

/** Tertiary "clear all" trash button for a category header; absent (never
 * disabled) when the category is empty. `kind` is environments|adversaries|items. */
function clearAllSlotHtml(kind, count) {
  const label = t('prep_clear_all_' + kind);
  const btn = count
    ? `<button type="button" class="icon-btn icon-btn--danger prep-central-clear" data-sp-clear-all="${kind}"
         aria-label="${escapeAttr(label)}" data-tip="${escapeAttr(label)}">${ICON_TRASH}</button>`
    : '';
  return `<span class="prep-central-clear-slot" id="prep-central-${kind}-clear">${btn}</span>`;
}

function refreshClearAllSlot(kind, count) {
  const el = document.getElementById(`prep-central-${kind}-clear`);
  if (el) el.outerHTML = clearAllSlotHtml(kind, count);
}

/** " · Roll 4–11" for the selected items; empty when none is selected.
 * Derived from prep.itemIds each time — never stored. */
function itemRollMetaHtml(prep) {
  const rolls = [];
  new Set(prep.itemIds).forEach(id => { const item = itemById(id); if (item) rolls.push(item.roll); });
  const range = PrepUtils.formatRollCoverage(rolls);
  const inner = range
    ? `<span class="prep-central-dot" aria-hidden="true">·</span><span class="prep-central-roll">${escapeHtml(t('prep_central_roll').replace('{range}', range))}</span>`
    : '';
  return `<span class="prep-central-roll-slot" id="prep-central-item-roll">${inner}</span>`;
}

function centralHeadHtml({ titleId, icon, title, countHtml, metaHtml = '', clearHtml = '', midHtml = '', actionHtml = '' }) {
  const titleHtml = `<h3 class="prep-central-title" id="${titleId}" tabindex="-1">${icon}<span>${escapeHtml(title)}</span></h3>`;
  // Title, a dot and the count share one baseline-aligned group, so the serif
  // title and the monospace count sit on the same line instead of each being
  // box-centred. The group takes the free space; `midHtml` (Battle Points
  // slot) and `actionHtml` sit after it.
  const lead = `<div class="prep-central-lead">${titleHtml}<span class="prep-central-dot" aria-hidden="true">·</span>${countHtml}${metaHtml}${clearHtml}</div>`;
  return `
    <div class="prep-central-head${midHtml ? ' prep-central-head--mid' : ''}">
      ${lead}${midHtml}${actionHtml}
    </div>`;
}

function centralEmptyHtml(key) {
  return `<p class="prep-empty">${escapeHtml(t(key))}</p>`;
}

function centralEnvCardHtml(env) {
  const name = envName(env);
  const biome = artBiome(env);
  return selectedEntityHtml({
    layout: 'card', id: env.id, name,
    thumb: centralThumbHtml('env', biome ? `img/biomes/${biome}-200.webp` : ''),
    meta: `${t('tier_label')} ${env.tier}`,
    openAttr: 'data-sp-open-env',
    openLabel: t('prep_open_environment_detail').replace('{name}', name),
    removeAttr: 'data-sp-remove-env',
    removeLabel: t('prep_remove_environment_named').replace('{name}', name),
    removeTip: t('prep_tip_remove_environment'),
    attrs: ` data-env-id="${escapeAttr(env.id)}"`,
  });
}

/** Selected environments render in exactly the order of prep.environmentIds —
 * the GM's own (manually reorderable) order, never re-sorted. The "All
 * Environments" picker keeps its Tier-then-name sort (prepFilteredEnvs()). */
function centralEnvListHtml(prep) {
  if (!prep.environmentIds.length) return centralEmptyHtml('prep_no_environments');
  const envs = prep.environmentIds.map(id => allEnvs().find(e => e.id === id)).filter(Boolean);
  return `<ul class="prep-sel-list prep-sel-grid prep-sel-grid--env">${envs.map(centralEnvCardHtml).join('')}</ul>`;
}

function centralEnvCountHtml(prep) {
  return centralCountHtml('prep-central-env-count', prep.environmentIds.length, PrepUtils.MAX_ENVIRONMENTS);
}

/** Disables every unselected environment checkbox currently rendered in the
 * picker once the prep is at the cap, and re-enables them the moment it
 * isn't — without rebuilding the picker list itself, so search text, scroll
 * position, and focus in that list are never disturbed by a selection
 * change elsewhere. */
function refreshEnvCheckboxDisabled(prep) {
  const atLimit = prep.environmentIds.length >= PrepUtils.MAX_ENVIRONMENTS;
  document.querySelectorAll('#prep-env-list [data-sp-toggle-env]').forEach(cb => {
    cb.disabled = atLimit && !cb.checked;
  });
}

function refreshCentralEnvironments() {
  const prep = activePrep();
  const list = document.getElementById('prep-central-env-list');
  if (list) list.innerHTML = centralEnvListHtml(prep);
  setCentralCount('prep-central-env-count', prep.environmentIds.length, PrepUtils.MAX_ENVIRONMENTS);
  refreshClearAllSlot('environments', prep.environmentIds.length);
  refreshEnvCheckboxDisabled(prep);
  syncCentralTruncationTips();
  syncPrepRecommendations();
}

/** The one place recommendation-dependent UI follows a change of the Prep's
 * selected environments. Every path that changes them — the picker checkbox,
 * the central × and trash, the catalog/Lists quick action, the detail overlay
 * and the Add to… dialog — already ends in refreshCentralEnvironments(), so
 * hooking it here covers them all (a full renderPrepPage(), used for
 * switching/creating/duplicating/deleting a prep and for language changes,
 * derives everything from scratch anyway). Rebuilds the All Adversaries rows
 * (stars, tooltips, the Recommended group) and the bulk button; selected
 * adversaries are never touched. */
function syncPrepRecommendations() {
  if (document.getElementById('prep-adv-list')) refreshAdvPicker();
  refreshRecommendBulkAction();
}

/** Non-blocking: a lot of selected adversaries is a play-experience
 * concern, not an error, so this never stops selection — just a heads-up
 * under the heading once the count passes ten. */
function advWarningHtml(prep) {
  if (prep.adversaryIds.length <= 10) return '';
  return `<p class="prep-warning" role="status">${escapeHtml(t('prep_adversary_large_warning').replace('{n}', prep.adversaryIds.length))}</p>`;
}

/** Selected adversaries render in exactly the order of prep.adversaryIds —
 * the GM's own (manually reorderable) order, never re-sorted. The "All
 * Adversaries" picker keeps its Tier-then-name sort (prepFilteredAdversaries()). */
function centralAdvListHtml(prep) {
  if (!prep.adversaryIds.length) return centralEmptyHtml('prep_no_adversaries');
  const advs = prep.adversaryIds.map(id => state.prepCatalog.adversaryById.get(id)).filter(Boolean);
  const rows = advs.map(adv => {
    const name = spName(adv);
    const fcgUrl = adversaryFreshCutGrassUrl(adv);
    return selectedEntityHtml({
      layout: 'row', id: adv.id, name,
      thumb: centralThumbHtml('adv', adv.art && adv.art.thumb, adv.art && {
        attr: 'data-sp-open-adv-art', id: adv.id,
        label: t('prep_open_adversary_image').replace('{name}', name),
        tip: t('prep_tip_open_adversary_image'),
      }),
      meta: advMetaText(adv),
      link: fcgUrl && {
        href: fcgUrl,
        label: encounterLinkTip(name),
        tip: encounterLinkTip(name),
      },
      removeAttr: 'data-sp-remove-adv',
      removeLabel: t('prep_remove_adversary_named').replace('{name}', name),
      removeTip: t('prep_tip_remove_adversary'),
    });
  }).join('');
  return `<ul class="prep-sel-list prep-sel-grid prep-sel-grid--adv">${rows}</ul>`;
}

/** The FreshCutGrass encounter name for the current prep: the GM's own
 * title when they've set one, or a localized generic default — see the
 * "FreshCutGrass export" section of CLAUDE.md. Always a non-empty plain
 * string, so the payload's own `n` field is never blank. */
function freshCutGrassEncounterTitle(prep) {
  const trimmed = (prep.title || '').trim();
  return trimmed || t('prep_freshcutgrass_default_title');
}

/** The export is adversaries only (see PD-002/the FreshCutGrass section):
 * never environments, never items, and always adversary.name.en — never
 * name.ru, a translated alias, or any other display text — since that's
 * the only name FreshCutGrass itself recognizes. Returns null when nothing
 * is selected, so the caller can hide the action entirely rather than
 * exporting an empty encounter. */
function freshCutGrassUrlForPrep(prep) {
  const names = prep.adversaryIds
    .map(id => state.prepCatalog.adversaryById.get(id))
    .filter(Boolean)
    .map(adv => adv.name.en);
  if (!names.length) return null;
  return buildFreshCutGrassEncounterUrl(freshCutGrassEncounterTitle(prep), names);
}

/** An ordinary link (not a button) so it behaves like every other
 * FreshCutGrass link in the app — opens in a new tab, `noopener noreferrer`,
 * and an accessible name that names the destination. The visible label is
 * service-agnostic ("Open Encounter" + the shared extIconHtml() icon); in the
 * dense laptop header CSS swaps it for the short form ("Encounter") — both are
 * contained in the aria-label, so the visible text is always part of the name.
 * The "…in FreshCutGrass" sentence lives in aria-label + tooltip.
 * Absent entirely (not just disabled) when no adversary is selected. */
function freshCutGrassLinkHtml(prep) {
  const url = freshCutGrassUrlForPrep(prep);
  if (!url) return '';
  const tip = t('encounter_open_tip');
  return `<a class="btn btn-ghost btn-sm prep-freshcutgrass-link encounter-action" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer"
             data-tip="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}"><span class="encounter-label-full">${escapeHtml(t('prep_open_freshcutgrass'))}</span><span class="encounter-label-short">${escapeHtml(t('prep_open_freshcutgrass_short'))}</span>${extIconHtml()}</a>`;
}

/** Refreshed after every adversary selection change and every prep-title
 * edit (see savePrepTitle()) — the encounter name and roster both feed
 * this link's href, so either one changing must recompute it. */
function refreshFreshCutGrassLink() {
  const prep = activePrep();
  const wrap = document.getElementById('prep-freshcutgrass-wrap');
  if (wrap) wrap.innerHTML = prep ? freshCutGrassLinkHtml(prep) : '';
}

function refreshCentralAdversaries() {
  const prep = activePrep();
  const list = document.getElementById('prep-central-adv-list');
  if (list) list.innerHTML = centralAdvListHtml(prep);
  setCentralCount('prep-central-adv-count', prep.adversaryIds.length, null);
  refreshClearAllSlot('adversaries', prep.adversaryIds.length);
  const warning = document.getElementById('prep-central-adv-warning');
  if (warning) warning.innerHTML = advWarningHtml(prep);
  refreshFreshCutGrassLink();
  refreshRecommendBulkAction();
  BattlePointsUI.refresh();
  syncCentralTruncationTips();
}

/* ---------------- recommended adversaries: bulk action ----------------
 * The "★ +N" button in the central Adversaries header is the only way a
 * recommendation ever becomes a selection — picking an environment never
 * selects anything, and removing one never deselects anything. It is derived
 * state all the way down: N is recomputed from the selected environments and
 * the current adversary selection every time, ignoring the picker's search/
 * Tier/Type filters. */

/** What the button should currently be, or null when the selected
 * environments recommend nothing supported (the button is then absent, not
 * disabled). `done` is the `★ ✓` state: every recommendation already
 * selected — still rendered and focusable, but inert (aria-disabled). */
function recommendBulkView(prep) {
  if (!prep) return null;
  const recommendations = prepRecommendations(prep);
  if (!recommendations.size) return null;
  const missing = PrepUtils.missingRecommendedIds(prep.adversaryIds, [...recommendations.keys()]);
  const n = missing.length;
  if (!n) {
    const tip = t('prep_recommend_all_selected');
    return { done: true, label: '★ ✓', tip };
  }
  return { done: false, label: `★ +${n}`, tip: t(n === 1 ? 'prep_recommend_add_one' : 'prep_recommend_add').replace('{n}', n) };
}

function recommendBulkHtml(prep) {
  const view = recommendBulkView(prep);
  if (!view) return '';
  return `<button type="button" class="btn btn-ghost btn-sm prep-recommend-btn${view.done ? ' is-done' : ''}" id="prep-recommend-btn"
             data-sp-add-recommended aria-disabled="${view.done}" data-tip="${escapeAttr(view.tip)}" aria-label="${escapeAttr(view.tip)}">${escapeHtml(view.label)}</button>`;
}

/** Brings the button in line with state without replacing it while it exists,
 * so a keyboard user who just pressed it keeps focus (it simply turns into
 * `★ ✓`). It appears/disappears only when the recommendations themselves
 * start/stop existing. */
function refreshRecommendBulkAction() {
  const wrap = document.getElementById('prep-recommend-wrap');
  if (!wrap) return;
  const view = recommendBulkView(activePrep());
  const btn = wrap.querySelector('#prep-recommend-btn');
  if (!view) { wrap.innerHTML = ''; return; }
  if (!btn) { wrap.innerHTML = recommendBulkHtml(activePrep()); return; }
  btn.classList.toggle('is-done', view.done);
  btn.setAttribute('aria-disabled', String(view.done));
  btn.setAttribute('aria-label', view.tip);
  btn.dataset.tip = view.tip;
  btn.textContent = view.label;
  // A tooltip already up (hovered or focused) would keep the old wording.
  if (tipTarget === btn) showTip(btn);
}

/** Appends every supported recommendation the Prep does not hold yet —
 * ignoring the picker's search/Tier/Type filters, keeping the existing
 * selection — through the same updatePrep() path as any other adversary
 * change, then syncs every surface that shows adversaries. The success toast
 * only follows a successful write. */
function addRecommendedAdversariesToActivePrep() {
  const prep = activePrep();
  if (!prep) return;
  const outcome = PrepUtils.addRecommendedAdversaries(prep, [...prepRecommendations(prep).keys()]);
  if (!outcome.changed) return;
  const { result } = updatePrep(() => outcome.prep);
  updateSaveStatusDisplay(result);
  // Central list, count, warning, FreshCutGrass link, Battle Points and the
  // bulk button itself.
  refreshCentralAdversaries();
  // The picker is synced in place rather than rebuilt: its active filters,
  // search text and scroll position are left exactly as they were.
  outcome.addedIds.forEach(id => {
    syncPickerCheckbox('data-sp-toggle-adv', id, true);
    const adv = state.prepCatalog.adversaryById.get(id);
    if (adv) updatePrepToggleLabel('data-sp-toggle-adv', id, true, spName(adv));
  });
  if (result.ok) {
    const n = outcome.addedIds.length;
    showToast(t(n === 1 ? 'prep_recommend_added_one' : 'prep_recommend_added').replace('{n}', n), 'success');
  }
}

/** Selected-item card: icon, name, "#roll · kind · source" meta line, remove
 * — items carry no quantity anywhere in Prep. */
function centralItemCardHtml(id, item) {
  const name = itemField(item, 'name');
  return selectedEntityHtml({
    layout: 'card', id, name,
    thumb: centralThumbHtml('item', itemImageUrl(item)),
    meta: itemMetaText(item),
    openAttr: 'data-sp-open-item',
    openLabel: t('prep_open_item_detail').replace('{name}', name),
    removeAttr: 'data-sp-remove-item',
    removeLabel: t('prep_remove_item_named').replace('{name}', name),
    removeTip: t('prep_tip_remove_item'),
  });
}

/** Selected items render in exactly the order of prep.itemIds — the GM's own
 * (manually reorderable) order, never re-sorted. The Items picker keeps its
 * roll/Source/Kind/name sort (prepFilteredItems()). */
function centralItemListHtml(prep) {
  if (!prep.itemIds.length) return centralEmptyHtml('prep_no_items');
  const items = prep.itemIds.map(id => { const item = itemById(id); return item ? Object.assign({ id }, item) : null; }).filter(Boolean);
  return `<ul class="prep-sel-list prep-sel-grid prep-sel-grid--item">${items.map(item => centralItemCardHtml(item.id, item)).join('')}</ul>`;
}

function refreshCentralItems() {
  const prep = activePrep();
  const list = document.getElementById('prep-central-item-list');
  if (list) list.innerHTML = centralItemListHtml(prep);
  setCentralCount('prep-central-item-count', prep.itemIds.length, null);
  const roll = document.getElementById('prep-central-item-roll');
  if (roll) roll.outerHTML = itemRollMetaHtml(prep);
  refreshClearAllSlot('items', prep.itemIds.length);
  syncCentralTruncationTips();
}

/* ---------------- manual ordering (drag-and-drop + Alt+Arrow) ----------------
 * The stored arrays prep.environmentIds / adversaryIds / itemIds ARE the
 * display order of the central panel (it never re-sorts them). The pointer
 * and keyboard handling lives in js/prep-reorder-ui.js (geometry in
 * js/prep-reorder-utils.js); this is only the bridge: it tells the controller
 * what is selected / addable and applies a finished drop through the same
 * updatePrep() path every other selection change uses. */
const PREP_ID_FIELD = { environments: 'environmentIds', adversaries: 'adversaryIds', items: 'itemIds' };

function prepReorderName(kind, id) {
  if (kind === 'environments') { const env = allEnvs().find(e => e.id === id); return env ? envName(env) : id; }
  if (kind === 'adversaries') { const adv = state.prepCatalog.adversaryById.get(id); return adv ? spName(adv) : id; }
  const item = itemById(id);
  return item ? itemField(item, 'name') : id;
}

/** A catalog entry can be dragged in only while it is unselected and (for
 * environments) the three-environment cap leaves room — the same rule the
 * picker checkboxes enforce. */
function prepReorderCanAdd(kind, id) {
  const prep = activePrep();
  if (!prep || !PREP_ID_FIELD[kind]) return false;
  if (kind === 'environments') return PrepUtils.environmentActionState(prep, id) === 'available';
  return prep[PREP_ID_FIELD[kind]].indexOf(id) === -1;
}

/** Brings the catalog's checkbox / selected tile into line after a drop-add,
 * mirroring what the checkbox change handler does for the same selection. */
function syncAddedSelection(kind, id) {
  const attr = { environments: 'data-sp-toggle-env', adversaries: 'data-sp-toggle-adv', items: 'data-sp-toggle-item' }[kind];
  syncPickerCheckbox(attr, id, true);
  updatePrepToggleLabel(attr, id, true, prepReorderName(kind, id));
  if (kind === 'environments') syncEnvPrepControls();
  if (kind === 'items') {
    document.querySelectorAll(`.prep-item-card[data-item-id="${escapeSelectorAttrValue(id)}"], .prep-item-compact-row[data-item-id="${escapeSelectorAttrValue(id)}"]`)
      .forEach(card => card.classList.add('is-selected'));
  }
}

function commitPrepOrder({ kind, ids, id, mode }) {
  const field = PREP_ID_FIELD[kind];
  if (!field) return;
  const { result } = updatePrep(prep => Object.assign({}, prep, { [field]: ids }));
  updateSaveStatusDisplay(result);
  if (kind === 'environments') refreshCentralEnvironments();
  else if (kind === 'adversaries') refreshCentralAdversaries();
  else refreshCentralItems();
  if (mode === 'add') syncAddedSelection(kind, id);
}

function announcePrepReorder(message) {
  const live = document.getElementById('prep-reorder-live');
  if (!live) return;
  live.textContent = '';
  setTimeout(() => { live.textContent = message; }, 30);
}

function initPrepReorder() {
  PrepReorderUI.init({
    isActive: () => state.route.name === 'prep' && !!activePrep(),
    getIds: kind => { const prep = activePrep(); return prep ? prep[PREP_ID_FIELD[kind]] : []; },
    canAdd: prepReorderCanAdd,
    nameOf: prepReorderName,
    commit: commitPrepOrder,
    announce: announcePrepReorder,
    text: (key, params) => t(key).replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? String(params[k]) : m)),
  });
}

/** Empties one category of the active prep through the same updatePrep() path
 * a single "×" removal uses, then brings the picker checkboxes into line. */
function clearPrepCategory(kind) {
  const field = { environments: 'environmentIds', adversaries: 'adversaryIds', items: 'itemIds' }[kind];
  const prep = activePrep();
  if (!field || !prep || !prep[field].length) return;
  const removed = prep[field];
  const { result } = updatePrep(p => Object.assign({}, p, { [field]: [] }));
  updateSaveStatusDisplay(result);
  if (kind === 'environments') {
    refreshCentralEnvironments();
    removed.forEach(id => {
      syncPickerCheckbox('data-sp-toggle-env', id, false);
      const env = allEnvs().find(e => e.id === id);
      if (env) updatePrepToggleLabel('data-sp-toggle-env', id, false, envName(env));
    });
    syncEnvPrepControls();
  } else if (kind === 'adversaries') {
    refreshCentralAdversaries();
    removed.forEach(id => {
      syncPickerCheckbox('data-sp-toggle-adv', id, false);
      const adv = state.prepCatalog.adversaryById.get(id);
      if (adv) updatePrepToggleLabel('data-sp-toggle-adv', id, false, spName(adv));
    });
  } else {
    refreshCentralItems();
    removed.forEach(id => {
      syncPickerCheckbox('data-sp-toggle-item', id, false);
      const item = itemById(id);
      if (item) updatePrepToggleLabel('data-sp-toggle-item', id, false, itemField(item, 'name'));
    });
    document.querySelectorAll('.prep-item-card.is-selected, .prep-item-compact-row.is-selected')
      .forEach(card => card.classList.remove('is-selected'));
  }
  // The trash button just left the DOM; keep keyboard focus in this section.
  const titleId = { environments: 'env', adversaries: 'adv', items: 'item' }[kind];
  document.getElementById('prep-central-' + titleId + '-title')?.focus({ preventScroll: true });
}

function centralSectionHtml(prep) {
  return `
    <section class="prep-central" aria-labelledby="prep-central-heading">
      <h2 id="prep-central-heading" class="sr-only">${t('prep_title')}</h2>
      <span class="sr-only" id="prep-reorder-live" role="status" aria-live="polite" aria-atomic="true"></span>
      <section class="prep-central-section" data-sp-section="environments" aria-labelledby="prep-central-env-title">
        ${centralHeadHtml({ titleId: 'prep-central-env-title', icon: ICON_TABLE_ENVIRONMENTS, title: t('prep_central_environments'), countHtml: centralEnvCountHtml(prep), clearHtml: clearAllSlotHtml('environments', prep.environmentIds.length) })}
        <div class="prep-central-body" id="prep-central-env-list">${centralEnvListHtml(prep)}</div>
      </section>
      <section class="prep-central-section" data-sp-section="adversaries" aria-labelledby="prep-central-adv-title">
        ${centralHeadHtml({ titleId: 'prep-central-adv-title', icon: ICON_TABLE_ADVERSARIES, title: t('prep_central_adversaries'),
          countHtml: centralCountHtml('prep-central-adv-count', prep.adversaryIds.length, null),
          clearHtml: clearAllSlotHtml('adversaries', prep.adversaryIds.length),
          midHtml: BattlePointsUI.slotHtml(),
          actionHtml: `<span class="prep-central-actions"><span class="prep-recommend-wrap" id="prep-recommend-wrap">${recommendBulkHtml(prep)}</span><span class="prep-freshcutgrass-wrap" id="prep-freshcutgrass-wrap">${freshCutGrassLinkHtml(prep)}</span></span>` })}
        <div id="prep-central-adv-warning">${advWarningHtml(prep)}</div>
        <div class="prep-central-body" id="prep-central-adv-list">${centralAdvListHtml(prep)}</div>
      </section>
      <section class="prep-central-section" data-sp-section="items" aria-labelledby="prep-central-item-title">
        ${centralHeadHtml({ titleId: 'prep-central-item-title', icon: ICON_TABLE_ITEMS, title: t('prep_central_items'),
          countHtml: centralCountHtml('prep-central-item-count', prep.itemIds.length, null),
          metaHtml: itemRollMetaHtml(prep), clearHtml: clearAllSlotHtml('items', prep.itemIds.length) })}
        <div class="prep-central-body" id="prep-central-item-list">${centralItemListHtml(prep)}</div>
      </section>
    </section>`;
}

/* ---------------- prep bar (title / switcher / rename / actions) ----------------
 *
 * One compact bar replaces the old switcher row + title field. The active
 * prep's name is shown exactly once, as a title-styled button that opens
 * the prep menu; the actions menu's "Rename" swaps that
 * title for an inline input; "+ New" is the only always-visible
 * collection-level action; Duplicate and Delete live only in the actions
 * menu, Delete behind a confirmation dialog.
 *
 * This is presentation only. Every state change goes through the existing
 * lifecycle functions above (createPrep/switchPrep/
 * duplicatePrep/deletePrep/updatePrep),
 * each followed by updateSaveStatusDisplay(result) and — for the ones that
 * change *which* prep is active — a full renderPrepPage(), exactly
 * as the old buttons did. */

const PREP_TITLE_MAX = 120;

function prepBarEl(id) { return document.getElementById(id); }

function prepBarHtml(prep) {
  const preps = state.prep.sessions;
  const title = prepDisplayTitle(prep);
  const onlyOne = preps.length <= 1;
  const prepItems = preps.map(s => {
    const current = s.id === prep.id;
    return `<button type="button" class="prep-menu-item" role="menuitemradio" tabindex="-1"
                    aria-checked="${current}" data-sp-switch="${escapeAttr(s.id)}">
              <span class="prep-menu-check" aria-hidden="true">${current ? ICON_CHECK_PLAIN : ''}</span>
              <span class="prep-menu-label">${escapeHtml(prepDisplayTitle(s))}</span>
            </button>`;
  }).join('');
  const deleteAttrs = onlyOne
    ? ` aria-disabled="true" data-tip="${escapeAttr(t('prep_delete_only_one'))}"`
    : '';
  return `
    <div class="prep-bar" id="prep-bar">
      <div class="prep-identity">
        <div class="prep-title-wrap" id="prep-title-wrap">
          <button type="button" class="prep-title-btn" id="prep-title-btn"
                  aria-haspopup="menu" aria-expanded="false" aria-controls="prep-menu"
                  aria-label="${escapeAttr(t('prep_open_selector') + ': ' + title)}">
            <span class="prep-title-line"><span class="prep-title-text">${escapeHtml(title)}</span>${ICON_CHEVRON_DOWN}</span>
            <span class="prep-save-status" id="prep-save-status" aria-hidden="true"></span>
          </button>
          <input type="text" class="prep-title-input" id="prep-title-input" hidden
                 maxlength="${PREP_TITLE_MAX}" autocomplete="off" spellcheck="false"
                 aria-label="${escapeAttr(t('prep_name_label'))}">
          <div class="prep-menu prep-menu" id="prep-menu" role="menu" hidden
               aria-labelledby="prep-title-btn">
            <div class="prep-menu-heading" id="prep-menu-heading">${escapeHtml(t('prep_list_heading'))}</div>
            <div class="prep-menu-list" role="group" aria-labelledby="prep-menu-heading">${prepItems}</div>
            <div class="prep-menu-sep" role="separator"></div>
            <button type="button" class="prep-menu-item prep-menu-new" role="menuitem" tabindex="-1" data-sp-new>
              <span class="prep-menu-check" aria-hidden="true">${ICON_PLUS}</span>
              <span class="prep-menu-label">${escapeHtml(t('prep_new'))}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="prep-notes">
        <label class="prep-notes-label sr-only" for="prep-notes-input">${escapeHtml(t('prep_notes_label'))}</label>
        <textarea class="prep-notes-input" id="prep-notes-input" rows="2"
                  autocomplete="off" placeholder="${escapeAttr(t('prep_notes_placeholder'))}"></textarea>
      </div>
      <div class="prep-actions">
        <button type="button" class="btn btn-ghost prep-new-btn" id="prep-new-btn"
                aria-label="${escapeAttr(t('prep_new_aria'))}" data-tip="${escapeAttr(t('prep_create_new'))}">${ICON_PLUS}<span>${escapeHtml(t('prep_new'))}</span></button>
        <div class="prep-more-wrap" id="prep-more-wrap">
          <button type="button" class="icon-btn icon-btn--utility prep-icon-btn prep-more-btn" id="prep-more-btn"
                  aria-haspopup="menu" aria-expanded="false" aria-controls="prep-actions-menu"
                  aria-label="${escapeAttr(t('prep_actions_open'))}" data-tip="${escapeAttr(t('prep_actions_open'))}">${ICON_MORE}</button>
          <div class="prep-menu prep-actions-menu" id="prep-actions-menu" role="menu" hidden
               aria-labelledby="prep-more-btn">
            <button type="button" class="prep-menu-item" role="menuitem" tabindex="-1" data-sp-menu-rename>
              <span class="prep-menu-label">${escapeHtml(t('prep_rename'))}</span>
            </button>
            <button type="button" class="prep-menu-item" role="menuitem" tabindex="-1" data-sp-menu-duplicate>
              <span class="prep-menu-label">${escapeHtml(t('prep_duplicate'))}</span>
            </button>
            <button type="button" class="prep-menu-item" role="menuitem" tabindex="-1" data-sp-menu-copy-summary>
              <span class="prep-menu-label">${escapeHtml(t('prep_copy_summary'))}</span>
            </button>
            <button type="button" class="prep-menu-item" role="menuitem" tabindex="-1" data-sp-menu-copy-link>
              <span class="prep-menu-label">${escapeHtml(t('prep_copy_link'))}</span>
            </button>
            <div class="prep-menu-sep" role="separator"></div>
            <button type="button" class="prep-menu-item is-danger${onlyOne ? ' is-disabled' : ''}" role="menuitem" tabindex="-1"
                    data-sp-menu-delete${deleteAttrs}>
              <span class="prep-menu-label">${escapeHtml(t('prep_delete'))}</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

/* -- menus: one open at a time, outside click / Escape / arrow keys -- */

let activePrepMenu = null;
function closeActivePrepMenu(returnFocus) {
  if (activePrepMenu) activePrepMenu.close(returnFocus);
}

/** Keeps an opened menu inside the viewport: nudged sideways if it would
 * overflow either edge, and capped to the room left below its top edge (the
 * CSS max-height — ~340px — still applies when there is more room). */
function positionPrepMenu(panel) {
  panel.style.translate = '';
  panel.style.removeProperty('--menu-room');
  const margin = 8;
  const r = panel.getBoundingClientRect();
  let shift = 0;
  if (r.right > window.innerWidth - margin) shift = window.innerWidth - margin - r.right;
  if (r.left + shift < margin) shift = margin - r.left;
  if (shift) panel.style.translate = `${Math.round(shift)}px 0`;
  panel.style.setProperty('--menu-room', `${Math.max(160, Math.floor(window.innerHeight - r.top - margin))}px`);
}

/** A tooltip carrying the full text, only for a label the layout has
 * actually truncated. Reads layout, so it must run while the element is
 * rendered (a `hidden` menu has zero widths). */
function syncTruncationTip(labelEl, holderEl, fullText) {
  if (!labelEl || !holderEl) return;
  if (labelEl.scrollWidth > labelEl.clientWidth) holderEl.dataset.tip = fullText;
  else delete holderEl.dataset.tip;
}

function syncPrepTitleTip() {
  const btn = prepBarEl('prep-title-btn');
  const prep = activePrep();
  if (!btn || !prep) return;
  syncTruncationTip(btn.querySelector('.prep-title-text'), btn, prepDisplayTitle(prep));
}

function syncPrepMenuTips() {
  const menu = prepBarEl('prep-menu');
  if (!menu) return;
  menu.querySelectorAll('[data-sp-switch]').forEach(item => {
    const label = item.querySelector('.prep-menu-label');
    syncTruncationTip(label, item, label.textContent);
  });
}

window.addEventListener('resize', syncPrepTitleTip);

/** `root` holds trigger + panel (an outside click is one that lands outside
 * it). `initialItem(items)` picks what receives focus when the menu opens. */
function bindPrepMenu({ root, trigger, panel, initialItem, onOpen }) {
  const controller = { close, isOpen: () => !panel.hidden };
  const items = () => Array.from(panel.querySelectorAll('[role^="menuitem"]'));

  function open() {
    closeActiveMultiSelect();
    closeActivePrepMenu();
    hideTip();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionPrepMenu(panel);
    if (onOpen) onOpen();
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onDocKeydown);
    activePrepMenu = controller;
    const list = items();
    const first = initialItem ? initialItem(list) : list[0];
    if (first) first.focus({ preventScroll: true });
    if (first && first.scrollIntoView) first.scrollIntoView({ block: 'nearest' });
  }
  function close(returnFocus) {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKeydown);
    if (activePrepMenu === controller) activePrepMenu = null;
    if (returnFocus) trigger.focus();
  }
  function onDocClick(e) { if (!root.contains(e.target)) close(); }
  function onDocKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'Tab') { close(true); return; }
    const list = items();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = list[i < 0 ? 0 : (i + 1) % list.length];
    else if (e.key === 'ArrowUp') next = list[i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    if (next) { e.preventDefault(); next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'nearest' }); }
  }

  trigger.addEventListener('click', () => { controller.isOpen() ? close() : open(); });
  trigger.addEventListener('keydown', e => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !controller.isOpen()) { e.preventDefault(); open(); }
  });
  return controller;
}

/* -- lifecycle wrappers: existing handlers + save status + full re-render -- */

function focusPrepTitleButton() {
  const btn = prepBarEl('prep-title-btn');
  if (btn) btn.focus({ preventScroll: true });
}

function prepBarCreate() {
  const result = createPrep();
  updateSaveStatusDisplay(result);
  renderPrepPage();
  beginPrepRename();
}

function prepBarSwitch(prepId) {
  const result = switchPrep(prepId);
  if (result) {
    updateSaveStatusDisplay(result);
    renderPrepPage();
  }
  focusPrepTitleButton();
}

/** "Copy session link": snapshots only the active prep (title, notes and the
 * three id lists — see js/prep-share-utils.js) into a `?prep=` URL built from
 * the current origin and pathname and writes it to the clipboard. The open
 * page's own address is never touched. The latest notes are already in memory,
 * so a failed flush (localStorage) never blocks link generation. Nothing is
 * truncated: an over-long link is refused with an explanation instead. */
function copyPrepShareLink() {
  flushPrepNotesSave();
  const prep = activePrep();
  if (!prep) return;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('prep', PrepShareUtils.encodePrep(prep));
  url.hash = '#/prep';
  const link = url.href;
  if (link.length > PrepShareUtils.MAX_URL_LENGTH) {
    showToast(t('prep_link_too_large'), 'error');
    return;
  }
  const hasNotes = typeof prep.notes === 'string' && prep.notes.trim() !== '';
  const done = () => showToast(t(hasNotes ? 'prep_link_copied_with_notes' : 'prep_link_copied'));
  const failed = () => showToast(t('prep_link_copy_failed'), 'error');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(link).then(done, () => legacyCopy(link, done, failed));
  } else legacyCopy(link, done, failed);
}

/** "Copy session summary": resolves the active prep in the central panel's
 * order (the stored prep.*Ids order — see centralEnvListHtml() & co), hands plain strings to the pure PrepUtils.buildSessionSummary(), and writes
 * the result to the clipboard. Session Notes are never read. */
function prepSummaryText(prep) {
  const envs = prep.environmentIds.map(id => allEnvs().find(e => e.id === id)).filter(Boolean);
  const advs = prep.adversaryIds.map(id => state.prepCatalog.adversaryById.get(id)).filter(Boolean);
  const items = prep.itemIds.map(id => { const item = itemById(id); return item ? Object.assign({ id }, item) : null; }).filter(Boolean);
  return {
    text: PrepUtils.buildSessionSummary({
      name: prepDisplayTitle(prep),
      headings: { environments: t('prep_central_environments'), adversaries: t('prep_central_adversaries'), items: t('prep_central_items') },
      environments: envs.map(envName),
      adversaries: advs.map(adv => `${spName(adv)} \u2014 ${advMetaText(adv).replace(' \u00b7 ', ' ')}`),
      items: items.map(item => itemField(item, 'name')),
    }),
    counts: { env: envs.length, adv: advs.length, item: items.length },
  };
}

function copyPrepSummary() {
  const prep = activePrep();
  if (!prep) return;
  const { text, counts } = prepSummaryText(prep);
  const plural = (key, n) => t(`prep_summary_${key}_${PrepUtils.pluralForm(n, state.lang)}`).replace('{n}', n);
  const detail = [plural('env', counts.env), plural('adv', counts.adv), plural('item', counts.item)].join(' \u00b7 ');
  const done = () => showToast(`${t('prep_summary_copied')}\n${detail}`);
  const failed = () => showToast(t('prep_summary_failed'), 'error');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => legacyCopy(text, done, failed));
  } else legacyCopy(text, done, failed);
}

function prepBarDuplicate() {
  const prep = activePrep();
  if (!prep) return;
  const result = duplicatePrep(prep.id);
  if (!result) return;
  updateSaveStatusDisplay(result);
  renderPrepPage();
  beginPrepRename();
}

/** Confirmation dialog for Delete prep — registerOverlay() supplies the
 * focus trap, Escape, scroll lock and focus restore (to `opener`, the actions
 * button, which the caller focused before opening this). Cancel gets initial
 * focus: the safe action. */
function openPrepDeleteConfirm(prep) {
  const name = prepDisplayTitle(prep);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.dataset.overlayKind = 'popup';
  overlay.innerHTML = `
    <div class="modal modal-sm" data-overlay-card role="alertdialog" aria-modal="true"
         aria-labelledby="prep-delete-title" aria-describedby="prep-delete-body">
      <div class="modal-header">
        <h2 id="prep-delete-title">${escapeHtml(t('prep_delete_confirm_title').replace('{name}', name))}</h2>
      </div>
      <div class="modal-body">
        <p class="prep-confirm-body" id="prep-delete-body">${escapeHtml(t('prep_delete_confirm_body'))}</p>
        <div class="prep-confirm-actions">
          <button type="button" class="btn btn-ghost" data-sp-confirm-cancel>${escapeHtml(t('cancel'))}</button>
          <button type="button" class="btn btn-danger" data-sp-confirm-delete>${escapeHtml(t('delete'))}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const teardown = registerOverlay(overlay, close);
  function close() { overlay.remove(); teardown(); }

  overlay.querySelector('[data-sp-confirm-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-sp-confirm-delete]').addEventListener('click', () => {
    const result = deletePrep(prep.id);
    close();
    updateSaveStatusDisplay(result);
    renderPrepPage();
    focusPrepTitleButton();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-sp-confirm-cancel]').focus();
}

/* -- opening a shared session link --
 * `?prep=<payload>` is read once, after every catalogue has loaded (init() and
 * retryPrepCatalog()). It never overwrites anything: a valid payload opens a
 * confirmation dialog, and only "Add session" appends a new, independent prep.
 * The parameter is stripped from the address on every outcome (confirm,
 * cancel, Escape, backdrop, invalid) through replaceState, so a refresh can
 * never import twice. */

let sharedPrepDialogOpen = false;

function readSharedPrepParam() {
  try { return new URL(location.href).searchParams.get('prep'); } catch (err) { return null; }
}

/** Removes `prep` from the address without adding a history entry, leaving
 * the user on #/prep. Best-effort, like repairHash(). */
function clearSharedPrepParam() {
  try {
    const url = new URL(location.href);
    url.searchParams.delete('prep');
    url.hash = '#/prep';
    history.replaceState(history.state, '', url.href);
  } catch (err) {
    // The in-memory state is already correct; the address cleanup is best-effort.
  }
}

/** Before the first render: a share link always lands on the Prep route. */
function routeSharedPrepLink() {
  if (readSharedPrepParam() === null || state.route.name === 'prep') return;
  try {
    const url = new URL(location.href);
    url.hash = '#/prep';
    history.replaceState(history.state, '', url.href);
  } catch (err) { /* best-effort */ }
  state.route = readCurrentRoute();
}

/** Drops ids the loaded catalogues don't know, enforces the environment cap,
 * and reports how many validly-encoded entries were omitted. */
function resolveSharedPrep(shared) {
  const envIds = new Set(allEnvs().map(e => e.id));
  const itemIds = new Set(state.prepCatalog.itemIds);
  const environmentIds = shared.environmentIds.filter(id => envIds.has(id));
  const adversaryIds = shared.adversaryIds.filter(id => state.prepCatalog.adversaryById.has(id));
  const items = shared.itemIds.filter(id => itemIds.has(id));
  const capped = environmentIds.slice(0, PrepUtils.MAX_ENVIRONMENTS);
  const total = shared.environmentIds.length + shared.adversaryIds.length + shared.itemIds.length;
  const kept = capped.length + adversaryIds.length + items.length;
  return {
    title: shared.title.slice(0, PREP_TITLE_MAX),
    notes: shared.notes,
    environmentIds: capped,
    adversaryIds,
    itemIds: items,
    omitted: total - kept,
  };
}

function handleSharedPrepLink() {
  const raw = readSharedPrepParam();
  if (raw === null || sharedPrepDialogOpen) return;
  // Without the Prep catalogue there is nothing to validate against; leave the
  // link in the address so a retry or reload can still open it.
  if (state.prepLoadFailed) return;
  const decoded = PrepShareUtils.decodePrep(raw);
  if (!decoded.ok) {
    clearSharedPrepParam();
    showToast(t('prep_share_invalid'), 'error');
    return;
  }
  openSharedPrepDialog(resolveSharedPrep(decoded.value));
}

function importSharedPrep(resolved) {
  flushPrepNotesSave();
  const now = new Date().toISOString();
  const prep = Object.assign(PrepUtils.createDefaultPrep(generatePrepId(), now), {
    title: resolved.title,
    notes: resolved.notes,
    environmentIds: resolved.environmentIds.slice(),
    adversaryIds: resolved.adversaryIds.slice(),
    itemIds: resolved.itemIds.slice(),
  });
  state.prep = PrepUtils.addPrep(state.prep, prep);
  return persist(LS_KEYS.prep, state.prep);
}

/** Confirmation dialog — same overlay infrastructure as openPrepDeleteConfirm();
 * Cancel gets initial focus (the safe action). */
function openSharedPrepDialog(resolved) {
  sharedPrepDialogOpen = true;
  const name = PrepUtils.resolvePrepTitle(resolved.title, t('prep_name_placeholder'));
  const plural = (key, n) => t(`prep_summary_${key}_${PrepUtils.pluralForm(n, state.lang)}`).replace('{n}', n);
  const counts = [
    plural('env', resolved.environmentIds.length),
    plural('adv', resolved.adversaryIds.length),
    plural('item', resolved.itemIds.length),
  ].join(' \u00b7 ');
  const hasNotes = resolved.notes.trim() !== '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.dataset.overlayKind = 'popup';
  overlay.innerHTML = `
    <div class="modal modal-sm" data-overlay-card role="alertdialog" aria-modal="true"
         aria-labelledby="prep-share-title" aria-describedby="prep-share-body">
      <div class="modal-header">
        <h2 id="prep-share-title">${escapeHtml(t('prep_share_import_title'))}</h2>
      </div>
      <div class="modal-body">
        <div class="prep-confirm-body" id="prep-share-body">
          <p>${escapeHtml(t('prep_share_import_body').replace('{name}', name))}<br>${escapeHtml(counts)}${hasNotes ? `<br>${escapeHtml(t('prep_share_import_notes_included'))}` : ''}</p>
          <p>${escapeHtml(t('prep_share_import_explain'))}</p>
        </div>
        <div class="prep-confirm-actions">
          <button type="button" class="btn btn-ghost" data-sp-share-cancel>${escapeHtml(t('cancel'))}</button>
          <button type="button" class="btn btn-primary" data-sp-share-confirm>${escapeHtml(t('prep_share_import_confirm'))}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const teardown = registerOverlay(overlay, close);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.remove();
    teardown();
    sharedPrepDialogOpen = false;
    clearSharedPrepParam();
  }

  overlay.querySelector('[data-sp-share-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-sp-share-confirm]').addEventListener('click', () => {
    const result = importSharedPrep(resolved);
    close();
    updateSaveStatusDisplay(result);
    if (state.route.name === 'prep') renderPrepPage();
    if (result.ok) {
      showToast(t('prep_share_imported'));
      if (resolved.omitted > 0) showToast(t('prep_share_partial_import'), 'error');
    }
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-sp-share-cancel]').focus();
}

/* -- inline rename -- */

/** Swaps the title button for an input holding the current name, at the same
 * line box so nothing below or beside it moves vertically. Used by the
 * actions menu's Rename, and right after New / Duplicate (so the GM can
 * type a name over the default/copied one, as before). */
function beginPrepRename() {
  const btn = prepBarEl('prep-title-btn');
  const input = prepBarEl('prep-title-input');
  const prep = activePrep();
  if (!btn || !input || !prep || !input.hidden) return;
  closeActivePrepMenu();
  hideTip();
  input.value = prepDisplayTitle(prep);
  btn.hidden = true;
  input.hidden = false;
  input.focus();
  input.select();
}

/** Enter/blur commit, Escape cancels. The input is hidden first so the blur
 * that hiding a focused element can fire finds nothing left to do. An empty
 * result never persists and never replaces the name with the placeholder —
 * the previous name simply stays (PrepUtils.resolvePrepRename()). */
function finishPrepRename(commit, returnFocus) {
  const btn = prepBarEl('prep-title-btn');
  const input = prepBarEl('prep-title-input');
  if (!btn || !input || input.hidden) return;
  const raw = input.value;
  input.hidden = true;
  btn.hidden = false;
  const prep = activePrep();
  if (commit && prep) {
    const outcome = PrepUtils.resolvePrepRename(prepDisplayTitle(prep), raw, PREP_TITLE_MAX);
    if (outcome.status === 'changed') savePrepTitle(outcome.value);
  }
  syncPrepTitleTip();
  if (returnFocus) btn.focus({ preventScroll: true });
}

/** Refreshes the bar's own copies of one prep's name (title text, the
 * button's accessible name, its menu row) after a rename, without a full
 * renderPrepPage() — the same targeted-refresh approach every other
 * Prep field change already uses. */
function refreshPrepBarTitle(prep) {
  const title = prepDisplayTitle(prep);
  const btn = prepBarEl('prep-title-btn');
  if (btn) {
    btn.querySelector('.prep-title-text').textContent = title;
    btn.setAttribute('aria-label', `${t('prep_open_selector')}: ${title}`);
  }
  const item = document.querySelector(`[data-sp-switch="${escapeSelectorAttrValue(prep.id)}"] .prep-menu-label`);
  if (item) item.textContent = title;
  syncPrepTitleTip();
  paintSessionControl();
}

function savePrepTitle(title) {
  const next = String(title == null ? '' : title).slice(0, PREP_TITLE_MAX);
  const prep = activePrep();
  if (!prep || prep.title === next) return;
  const { result, prep: saved } = updatePrep(s => Object.assign({}, s, { title: next }));
  updateSaveStatusDisplay(result);
  refreshFreshCutGrassLink();
  if (saved) refreshPrepBarTitle(saved);
}

function bindPrepBar() {
  const bar = prepBarEl('prep-bar');
  if (!bar) return;
  const statusEl = prepBarEl('prep-save-status');
  if (statusEl) paintSaveStatus(statusEl);

  const titleWrap = prepBarEl('prep-title-wrap');
  const titleBtn = prepBarEl('prep-title-btn');
  const menu = prepBarEl('prep-menu');
  bindPrepMenu({
    root: titleWrap, trigger: titleBtn, panel: menu,
    initialItem: list => list.find(el => el.getAttribute('aria-checked') === 'true') || list[0],
    onOpen: syncPrepMenuTips,
  });
  menu.addEventListener('click', e => {
    const item = e.target.closest('.prep-menu-item');
    if (!item) return;
    closeActivePrepMenu(true);
    if (item.dataset.spSwitch) prepBarSwitch(item.dataset.spSwitch);
    else if (item.hasAttribute('data-sp-new')) prepBarCreate();
  });

  const moreWrap = prepBarEl('prep-more-wrap');
  const moreBtn = prepBarEl('prep-more-btn');
  const actionsMenu = prepBarEl('prep-actions-menu');
  bindPrepMenu({ root: moreWrap, trigger: moreBtn, panel: actionsMenu });
  actionsMenu.addEventListener('click', e => {
    const item = e.target.closest('.prep-menu-item');
    if (!item) return;
    if (item.getAttribute('aria-disabled') === 'true') return;
    closeActivePrepMenu(true);
    if (item.hasAttribute('data-sp-menu-rename')) beginPrepRename();
    else if (item.hasAttribute('data-sp-menu-duplicate')) prepBarDuplicate();
    else if (item.hasAttribute('data-sp-menu-copy-summary')) copyPrepSummary();
    else if (item.hasAttribute('data-sp-menu-copy-link')) copyPrepShareLink();
    else if (item.hasAttribute('data-sp-menu-delete')) {
      const prep = activePrep();
      if (prep) openPrepDeleteConfirm(prep);
    }
  });

  prepBarEl('prep-new-btn').addEventListener('click', prepBarCreate);

  // Session Notes: a plain multiline field. The value is assigned here rather
  // than written into the markup because an HTML parser drops a textarea's
  // leading newline, which would silently alter the stored text. No keydown
  // handling on purpose — the page has no global hotkeys, and the document
  // listeners that exist (menu/overlay Escape and arrows) are only attached
  // while a menu or overlay is open, which a click into the field closes.
  const notesInput = prepBarEl('prep-notes-input');
  const prepNow = activePrep();
  notesInput.value = prepNow ? prepNow.notes || '' : '';
  notesInput.addEventListener('input', () => setPrepNotes(notesInput.value));
  notesInput.addEventListener('blur', flushPrepNotesSave);

  const input = prepBarEl('prep-title-input');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finishPrepRename(true, true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishPrepRename(false, true); }
  });
  input.addEventListener('blur', () => finishPrepRename(true, false));

  syncPrepTitleTip();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncPrepTitleTip);
}

const PREP_SEARCH_DEBOUNCE_MS = 200;

/** One entry per picker: which transient search-text field it writes to on
 * `state.prepUI`, and the DOM ids of its search input and clear
 * button. `data-sp-clear-search` values in the picker templates above (env/
 * adv/item) match these keys exactly. */
/** The env entry has no `clearId`: its compact toolbar uses a native
 * <input type="search">, whose own clear control already fires an `input`
 * event handled the same way a keystroke is — no custom button to track.
 * clearPrepSearch()/bindPrepSearchField() below both already
 * guard every clearBtn lookup, so an absent id here is a no-op, not a bug. */
const PREP_SEARCH_FIELDS = {
  env: { stateKey: 'envSearch', inputId: 'prep-env-search' },
  adv: { stateKey: 'advSearch', inputId: 'prep-adv-search', clearId: 'prep-adv-search-clear' },
  item: { stateKey: 'itemSearch', inputId: 'prep-item-search', clearId: 'prep-item-search-clear' },
};

function refreshPrepPicker(which) {
  if (which === 'env') refreshEnvPicker();
  else if (which === 'adv') refreshAdvPicker();
  else if (which === 'item') refreshItemGrid();
}

/** Clears one picker's search text immediately (no debounce), hides its
 * clear button, refreshes that picker's results/count, and returns focus to
 * the input — shared by the clear button's click (delegated, see
 * bindPrepDelegation()) and an Escape keypress in the field itself. */
function clearPrepSearch(which) {
  // Items has more to reset than a bare search field — Type/Source
  // multiselects and the active dice-roll filter too — see the request's
  // own "one combined clear control" requirement and
  // clearItemBrowserFilters()'s own doc comment.
  if (which === 'item') { clearItemBrowserFilters(); return; }
  const cfg = PREP_SEARCH_FIELDS[which];
  if (!cfg) return;
  state.prepUI[cfg.stateKey] = '';
  const input = document.getElementById(cfg.inputId);
  if (input) input.value = '';
  const clearBtn = document.getElementById(cfg.clearId);
  if (clearBtn) clearBtn.style.display = 'none';
  refreshPrepPicker(which);
  if (input) input.focus();
}

/** Rebound on every full renderPrepPage() call, since that's the only
 * time these input elements themselves are (re)created — unlike the
 * delegated click/change handlers in bindPrepDelegation(), which are
 * bound once and outlive any number of targeted refresh*() calls. Debounces
 * the actual filtering, but the clear button's own visibility and an
 * Escape-to-clear both act immediately. */
function bindPrepSearchField(which) {
  const cfg = PREP_SEARCH_FIELDS[which];
  const input = document.getElementById(cfg.inputId);
  if (!input) return;
  const clearBtn = document.getElementById(cfg.clearId);
  let timer = null;
  input.addEventListener('input', () => {
    // Items' clear button also has to stay visible when a Type/Source/
    // dice filter is active with no search text typed at all — see
    // itemBrowserHasActiveFilters()/itemNonSearchItemFiltersActive().
    if (clearBtn) {
      const show = !!(input.value || (which === 'item' && itemNonSearchItemFiltersActive()));
      // Items' clear control is a standalone toolbar button that is always
      // shown and merely disabled while there is nothing to clear; adv's
      // in-field × is display-toggled.
      if (which === 'item') clearBtn.disabled = !show;
      else clearBtn.style.display = show ? '' : 'none';
    }
    clearTimeout(timer);
    timer = setTimeout(() => { state.prepUI[cfg.stateKey] = input.value; refreshPrepPicker(which); }, PREP_SEARCH_DEBOUNCE_MS);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape' && input.value) {
      clearTimeout(timer);
      clearPrepSearch(which);
    }
  });
}

function bindPrepSearchAndTitle() {
  bindPrepSearchField('env');
  bindPrepSearchField('adv');
  bindPrepSearchField('item');
  bindPrepBar();
}

/* ---------------- catalogue load failure + retry ---------------- */

function retryPrepCatalog() {
  const btn = document.querySelector('[data-sp-retry]');
  if (btn) { btn.dataset.loading = 'true'; btn.disabled = true; }
  getJSON(versionedDataUrl('data/prep.json')).then(data => {
    setPrepCatalog(data);
    if (state.route.name === 'prep') renderPrepPage();
    handleSharedPrepLink();
  }).catch(() => {
    state.prepLoadFailed = true;
    if (btn) { btn.removeAttribute('data-loading'); btn.disabled = false; }
  });
}

/* ---------------- delegation ---------------- */

/** Bound once per #grid-wrap lifetime (delegated listeners survive any
 * number of innerHTML replacements of *its children*) — unlike
 * bindPrepSearchAndTitle() above, which rebinds every full render
 * because the input elements themselves get recreated then. */
function bindPrepDelegation(el) {
  if (el._prepDelegated) return;
  el._prepDelegated = true;

  el.addEventListener('change', e => {
    const envCb = e.target.closest('[data-sp-toggle-env]');
    if (envCb) {
      const envId = envCb.dataset.spToggleEnv;
      const outcome = PrepUtils.toggleEnvironment(activePrep(), envId);
      if (outcome.limitReached) {
        envCb.checked = false;
        showToast(t('prep_environment_limit'), 'error');
        return;
      }
      const { result } = updatePrep(() => outcome.prep);
      updateSaveStatusDisplay(result);
      refreshCentralEnvironments();
      const env = allEnvs().find(e => e.id === envId);
      if (env) updatePrepToggleLabel('data-sp-toggle-env', envId, envCb.checked, envName(env));
      syncEnvPrepControls();
      return;
    }
    const advCb = e.target.closest('[data-sp-toggle-adv]');
    if (advCb) {
      const advId = advCb.dataset.spToggleAdv;
      const { result } = updatePrep(prep => Object.assign({}, prep, {
        adversaryIds: PrepUtils.toggleId(prep.adversaryIds, advId),
      }));
      updateSaveStatusDisplay(result);
      refreshCentralAdversaries();
      const adv = state.prepCatalog.adversaryById.get(advId);
      if (adv) updatePrepToggleLabel('data-sp-toggle-adv', advId, advCb.checked, spName(adv));
      return;
    }
    const itemCb = e.target.closest('[data-sp-toggle-item]');
    if (itemCb) {
      const itemId = itemCb.dataset.spToggleItem;
      const { result } = updatePrep(prep => Object.assign({}, prep, {
        itemIds: PrepUtils.toggleId(prep.itemIds, itemId),
      }));
      updateSaveStatusDisplay(result);
      refreshCentralItems();
      const card = itemCb.closest('.prep-item-card, .prep-item-compact-row');
      if (card) card.classList.toggle('is-selected', itemCb.checked);
      const item = itemById(itemId);
      if (item) updatePrepToggleLabel('data-sp-toggle-item', itemId, itemCb.checked, itemField(item, 'name'));
    }
  });

  el.addEventListener('click', e => {
    // The compact toolbar's Tier buttons live outside #prep-env-list (never
    // touched by refreshEnvPicker()'s innerHTML replacement), so their
    // pressed state is toggled directly on the clicked element rather than
    // through a rebuild — the row list and counter still refresh below.
    const envTier = e.target.closest('[data-sp-env-tier]');
    if (envTier) {
      const tier = Number(envTier.dataset.spEnvTier);
      toggleSetValue(state.prepUI.envFilters.tiers, tier);
      const pressed = state.prepUI.envFilters.tiers.has(tier);
      envTier.classList.toggle('active', pressed);
      envTier.setAttribute('aria-pressed', String(pressed));
      refreshEnvPicker();
      return;
    }

    // Same no-rebuild pattern as the environment toolbar's Tier buttons
    // above: the adversary toolbar's Tier buttons live outside #prep-adv-list
    // (never touched by refreshAdvPicker()'s innerHTML replacement), so
    // pressed state is toggled directly here rather than through a rebuild.
    const advTier = e.target.closest('[data-sp-adv-tier]');
    if (advTier) {
      const tier = Number(advTier.dataset.spAdvTier);
      toggleSetValue(state.prepUI.advFilters.tiers, tier);
      const pressed = state.prepUI.advFilters.tiers.has(tier);
      advTier.classList.toggle('active', pressed);
      advTier.setAttribute('aria-pressed', String(pressed));
      refreshAdvPicker();
      return;
    }

    const clearAdvTypes = e.target.closest('#sp-adv-clear-types');
    if (clearAdvTypes) {
      state.prepUI.advFilters.types.clear();
      document.querySelectorAll('#sp-adv-types-panel .ms-checkbox').forEach(cb => { cb.checked = false; });
      const trigger = document.getElementById('sp-adv-types-btn');
      if (trigger) trigger.querySelector('.ms-trigger-label').textContent = advTypesTriggerLabel();
      clearAdvTypes.style.display = 'none';
      refreshAdvPicker();
      return;
    }

    const openAdvArt = e.target.closest('[data-sp-open-adv-art]');
    if (openAdvArt) { openAdversaryArtOverlay(openAdvArt.dataset.spOpenAdvArt); return; }

    const openEnv = e.target.closest('[data-sp-open-env]');
    if (openEnv) { navigate(envHash(openEnv.dataset.spOpenEnv, state.route)); return; }

    // aria-disabled (the `★ ✓` state) keeps the button focusable so its reason
    // is reachable, so the activation guard lives here.
    const addRecommended = e.target.closest('[data-sp-add-recommended]');
    if (addRecommended) {
      if (addRecommended.getAttribute('aria-disabled') !== 'true') addRecommendedAdversariesToActivePrep();
      return;
    }

    const clearAll = e.target.closest('[data-sp-clear-all]');
    if (clearAll) { clearPrepCategory(clearAll.dataset.spClearAll); return; }

    const removeEnv = e.target.closest('[data-sp-remove-env]');
    if (removeEnv) {
      const envId = removeEnv.dataset.spRemoveEnv;
      const outcome = PrepUtils.removeEnvironment(activePrep(), envId);
      const { result } = updatePrep(() => outcome.prep);
      updateSaveStatusDisplay(result);
      refreshCentralEnvironments();
      syncPickerCheckbox('data-sp-toggle-env', envId, false);
      const env = allEnvs().find(e => e.id === envId);
      if (env) updatePrepToggleLabel('data-sp-toggle-env', envId, false, envName(env));
      syncEnvPrepControls();
      return;
    }

    const removeAdv = e.target.closest('[data-sp-remove-adv]');
    if (removeAdv) {
      const advId = removeAdv.dataset.spRemoveAdv;
      const { result } = updatePrep(prep => Object.assign({}, prep, {
        adversaryIds: PrepUtils.removeId(prep.adversaryIds, advId),
      }));
      updateSaveStatusDisplay(result);
      refreshCentralAdversaries();
      syncPickerCheckbox('data-sp-toggle-adv', advId, false);
      const adv = state.prepCatalog.adversaryById.get(advId);
      if (adv) updatePrepToggleLabel('data-sp-toggle-adv', advId, false, spName(adv));
      return;
    }

    const openItem = e.target.closest('[data-sp-open-item]');
    if (openItem) { openItemDetail(openItem.dataset.spOpenItem); return; }

    const removeItem = e.target.closest('[data-sp-remove-item]');
    if (removeItem) {
      const itemId = removeItem.dataset.spRemoveItem;
      const { result } = updatePrep(prep => Object.assign({}, prep, {
        itemIds: PrepUtils.removeId(prep.itemIds, itemId),
      }));
      updateSaveStatusDisplay(result);
      refreshCentralItems();
      syncPickerCheckbox('data-sp-toggle-item', itemId, false);
      const item = itemById(itemId);
      if (item) updatePrepToggleLabel('data-sp-toggle-item', itemId, false, itemField(item, 'name'));
      document.querySelectorAll(`.prep-item-card[data-item-id="${escapeSelectorAttrValue(itemId)}"], .prep-item-compact-row[data-item-id="${escapeSelectorAttrValue(itemId)}"]`)
        .forEach(card => card.classList.remove('is-selected'));
      return;
    }

    // Independent multiselect, same direct-mutate-not-rebuild pattern as
    // the Tier buttons above: toggling a Type/Source button never touches
    // the toolbar itself, only the active grid + counter below it.
    const itemType = e.target.closest('[data-sp-item-type]');
    if (itemType) {
      const type = itemType.dataset.spItemType;
      toggleSetValue(state.prepUI.itemTypes, type);
      const pressed = state.prepUI.itemTypes.has(type);
      itemType.classList.toggle('btn-primary', pressed);
      itemType.classList.toggle('btn-ghost', !pressed);
      itemType.setAttribute('aria-pressed', String(pressed));
      updateItemClearButtonVisibility();
      refreshItemGrid();
      return;
    }

    const itemSource = e.target.closest('[data-sp-item-source]');
    if (itemSource) {
      const source = itemSource.dataset.spItemSource;
      toggleSetValue(state.prepUI.itemSources, source);
      const pressed = state.prepUI.itemSources.has(source);
      itemSource.classList.toggle('btn-primary', pressed);
      itemSource.classList.toggle('btn-ghost', !pressed);
      itemSource.setAttribute('aria-pressed', String(pressed));
      updateItemClearButtonVisibility();
      refreshItemGrid();
      return;
    }

    const itemDice = e.target.closest('[data-sp-item-dice]');
    if (itemDice) { rollPrepItemDice(Number(itemDice.dataset.spItemDice)); return; }

    const itemView = e.target.closest('[data-sp-item-view]');
    if (itemView) { setItemViewMode(itemView.dataset.spItemView); return; }

    const navBtn = e.target.closest('[data-sp-item-nav]');
    if (navBtn) { scrollPrepItemStrip(navBtn.dataset.spItemNav === 'next' ? 1 : -1); return; }

    const clearSearch = e.target.closest('[data-sp-clear-search]');
    if (clearSearch) { clearPrepSearch(clearSearch.dataset.spClearSearch); return; }

    const retry = e.target.closest('[data-sp-retry]');
    if (retry) retryPrepCatalog();
  });

  /* 'error' does not bubble, so it is only observable here via the capture
   * phase — the one deliberate exception to this file's usual bubble-phase
   * delegation. Swaps a failed adversary/item image for the same designed
   * fallback a missing `art`/url gets at build time; never a broken-image
   * icon on screen. The adversary thumb wrapper may be a real <button>
   * (art.thumb present) — a broken image at runtime gets the exact same
   * non-interactive fallback a missing art field gets, so it never opens an
   * empty overlay: the button loses its open-art id/label and its own class,
   * and an existing artwork overlay for this adversary (if the image failed
   * only after the overlay was already open) is closed rather than left
   * showing a broken full image. */
  el.addEventListener('error', e => {
    const target = e.target;
    if (!target || !target.matches) return;
    if (target.matches('[data-adv-thumb-img]')) {
      const wrap = target.closest('.prep-adv-thumb');
      if (wrap) {
        wrap.innerHTML = ICON_ADVERSARY_FALLBACK;
        wrap.classList.remove('prep-adv-thumb-btn');
        wrap.classList.add('prep-thumb-fallback');
        wrap.removeAttribute('data-sp-open-adv-art');
        wrap.removeAttribute('aria-label');
        if (wrap.tagName === 'BUTTON') wrap.disabled = true;
      }
    } else if (target.matches('[data-sel-thumb-img]')) {
      const wrap = target.closest('.prep-sel-thumb');
      if (wrap) {
        wrap.innerHTML = CENTRAL_THUMB_FALLBACK[wrap.dataset.kind] || ICON_HEX;
        wrap.classList.add('is-fallback');
        // The adversary art-preview button: a broken thumbnail never opens
        // an empty overlay — same treatment as the catalog's .prep-adv-thumb.
        if (wrap.tagName === 'BUTTON') {
          wrap.classList.remove('prep-sel-thumb-btn');
          wrap.removeAttribute('data-sp-open-adv-art');
          wrap.removeAttribute('data-tip');
          wrap.removeAttribute('aria-label');
          wrap.setAttribute('aria-hidden', 'true');
          wrap.tabIndex = -1;
          wrap.disabled = true;
        }
      }
    } else if (target.matches('[data-item-thumb-img]')) {
      const wrap = target.closest('.prep-item-thumb');
      if (wrap) wrap.innerHTML = ICON_ITEM_FALLBACK;
    }
  }, true);
}

/* ---------------- top chrome (compact workspace mode) ----------------
 *
 * #prep-chrome (index.html) wraps the shared site header. Only on
 * this route it can be switched, via the session control this controller
 * adds, between two CSS-driven variants of the *same* #header markup
 * renderHeader() always produces (see the "Prep chrome" rules in
 * css/styles.css) — never a second copy of the header. The one control also
 * drives the Prep Bar (title, save status, Session Notes, New/actions —
 * prepBarHtml(), in the workspace, not this chrome) out of layout
 * entirely — both areas read the single
 * `data-sp-header-mode` attribute this controller sets on <body>, so there
 * is exactly one source of truth for the mode, never two independent
 * states to fall out of sync.
 *
 * There is no automatic mode change of any kind: the chrome only ever
 * changes state when the reader deliberately clicks the control. The mode a
 * reader last chose is a global Prep-page preference (never stored on a
 * prep record), persisted as LS_KEYS.prepHeaderMode — a raw flag written
 * through persistRaw() the same way dhcodex_storage_notice_dismissed is, see
 * "Safe browser storage" in CLAUDE.md — and restored on every route entry. A
 * reader with no saved preference yet — or one whose storage is unavailable
 * or holds anything other than the literal string "compact" — starts
 * expanded (PrepUtils.resolveHeaderMode()).
 *
 * The control is a single <button> that sits in #header's .header-inner
 * between the brand and .header-actions (never a second row, never after the
 * language switch): "Session · <active prep title>", a save-status icon and
 * the expand/collapse chevron. Its title and status are painted from the
 * same sources as the Prep Bar (activePrep(), state.prepUI), by
 * paintSessionControl() — nothing about the session is cached on the button.
 * renderHeader() rebuilds #header's entire innerHTML on every render()
 * (including a language switch while still on this route), which would
 * otherwise silently detach the control from the page — initPrepChrome()
 * re-inserts the *same* slot element into the freshly-rendered
 * .header-inner every time it runs (render() always calls it, via
 * renderPrepPage(), after renderHeader() has already replaced #header), so
 * the button and its listener are created once but kept attached across any
 * number of re-renders.
 *
 * A one-time hint (a small absolutely-positioned popover anchored to the
 * control, so it can't shift layout) points compact-mode readers at the
 * control; its own "seen" flag is LS_KEYS.prepSessionHintSeen.
 *
 * One controller instance lives in `prepChromeState`, built by
 * initPrepChrome() and torn down by destroyPrepChrome() — the
 * only two functions that touch that variable. */

/** Reads the last mode the reader chose; see PrepUtils.resolveHeaderMode(). */
function storedPrepHeaderMode() {
  return PrepUtils.resolveHeaderMode(SafeStorage.readRawFlag(lsStorage, LS_KEYS.prepHeaderMode));
}

function storedPrepSessionHintSeen() {
  return SafeStorage.readRawFlag(lsStorage, LS_KEYS.prepSessionHintSeen) === '1';
}

let prepChromeState = null;

const PREP_SESSION_HINT_MS = 6000;

/** The header control's save-status view: icon kind and the tooltip/sr-only
 * wording. 'saving' is the real pending state of a debounced Session Notes
 * edit (prepNotesDirty) — the only write that isn't synchronous. */
function sessionControlStatusView() {
  const ui = state.prepUI;
  const kind = PrepUtils.sessionSaveKind(ui.saveFailed, prepNotesDirty, ui.lastSavedAt);
  if (kind === 'error') return { kind, text: t('prep_session_save_failed') };
  if (kind === 'saving') return { kind, text: t('prep_session_saving') };
  if (kind === 'ok') {
    const time = ui.lastSavedAt.toLocaleTimeString(state.lang === 'ru' ? 'ru-RU' : 'en-US', {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    return { kind, text: t('prep_session_saved_at').replace('{time}', time) };
  }
  return { kind, text: t('prep_autosave_ready') };
}

/** Paints the session control from the live sources of truth. Safe to call
 * at any time (no-op off the prep route); called on every mode change, every
 * renderPrepPage(), a rename, and every save-status update. */
function paintSessionControl() {
  const c = prepChromeState;
  if (!c || !c.toggleEl) return;
  const btn = c.toggleEl;
  const compact = c.mode === 'compact';
  const name = prepDisplayTitle(activePrep());
  const status = sessionControlStatusView();
  const action = t(compact ? 'prep_session_expand' : 'prep_session_collapse');
  const icon = status.kind === 'ok' ? ICON_CHECK
    : status.kind === 'error' ? ICON_ALERT
    : status.kind === 'saving' ? '<span class="sp-session-spin"></span>'
    : '<span class="prep-save-dot"></span>';
  btn.setAttribute('aria-expanded', compact ? 'false' : 'true');
  btn.setAttribute('aria-label', `${action} ${t('prep_session_for')} ${name}`);
  if (document.getElementById('prep-bar')) btn.setAttribute('aria-controls', 'prep-bar');
  else btn.removeAttribute('aria-controls');
  // While the one-time hint is up it owns the space under the control, so the
  // hover tooltip (which would land on top of it) is withheld.
  if (c.hintEl) delete btn.dataset.tip;
  else btn.dataset.tip = `${name} · ${status.text}`;
  // Expanded: the panel below already shows the session name, so the control
  // carries only the label. Collapsed: the name is the only on-screen cue.
  btn.innerHTML =
    `<span class="sp-session-label" aria-hidden="true">${escapeHtml(t('prep_session_label'))}${compact ? ' ·' : ''}</span>` +
    (compact ? `<span class="sp-session-name">${escapeHtml(name)}</span>` : '') +
    `<span class="sp-session-status" data-state="${status.kind}" aria-hidden="true">${icon}</span>` +
    `<span class="sp-session-chevron" aria-hidden="true">${compact ? ICON_CHEVRON_DOWN : ICON_CHEVRON_UP}</span>`;
  // The save status is conveyed to assistive tech as a polite live region
  // beside the button, not inside it (the aria-label above replaces the
  // button's content), so a save never re-announces the whole control.
  c.statusSrEl.textContent = status.text;
  if (c.hintEl) c.hintEl.textContent = t('prep_session_hint');
}

/** Reflects the current mode onto the DOM: the `data-sp-header-mode`
 * attribute on <body> (drives every compact-mode CSS rule in
 * css/styles.css, for both the global header and the Prep Bar) and the
 * session control. Called on every mode change and once more at the end of
 * every renderPrepPage(), so a language switch keeps the control's text
 * current without recreating the button. */
function applyPrepChromeDom() {
  const c = prepChromeState;
  if (!c) return;
  document.body.dataset.spHeaderMode = c.mode;
  paintSessionControl();
}

/* -- one-time hint -- */

function dismissPrepSessionHint() {
  const c = prepChromeState;
  if (!c || !c.hintEl) return;
  clearTimeout(c.hintTimer);
  document.removeEventListener('pointerdown', c.hintOnPointer, true);
  document.removeEventListener('keydown', c.hintOnKey, true);
  c.hintEl.remove();
  c.hintEl = null;
  c.toggleEl.classList.remove('is-hinted');
  paintSessionControl();
  persistRaw(LS_KEYS.prepSessionHintSeen, '1');
}

function showPrepSessionHint() {
  const c = prepChromeState;
  if (!c || c.hintEl || c.hintDone) return;
  c.hintDone = true;
  const el = document.createElement('div');
  el.className = 'sp-session-hint';
  el.setAttribute('role', 'status');
  el.textContent = t('prep_session_hint');
  c.slotEl.appendChild(el);
  c.hintEl = el;
  c.toggleEl.classList.add('is-hinted');
  hideTip();
  paintSessionControl();
  c.hintOnPointer = () => dismissPrepSessionHint();
  c.hintOnKey = e => { if (e.key === 'Escape') dismissPrepSessionHint(); };
  document.addEventListener('pointerdown', c.hintOnPointer, true);
  document.addEventListener('keydown', c.hintOnKey, true);
  c.hintTimer = setTimeout(dismissPrepSessionHint, PREP_SESSION_HINT_MS);
}

/** The only place the mode changes, and so the only place it is persisted —
 * this is always a direct result of the reader clicking the control, never
 * an automatic transition, so writing it here can't accidentally persist a
 * route-entry default. A failed write falls back to the same centralized
 * storage_write_failed_warning toast every other persisted action uses (see
 * persistRaw()); the in-memory mode still applies for the rest of the
 * visit either way. */
function prepChromeSetMode(next) {
  const c = prepChromeState;
  if (!c || c.mode === next) return;
  // Collapsing hides the textarea (display:none) without a render; drain any
  // pending note write first.
  flushPrepNotesSave();
  c.mode = next;
  applyPrepChromeDom();
  persistRaw(LS_KEYS.prepHeaderMode, next);
  if (PrepUtils.shouldShowSessionHint(next, storedPrepSessionHintSeen())) showPrepSessionHint();
}

/** Builds (once) and (re-)attaches the session control's slot into
 * #header's current .header-inner, between the brand and .header-actions.
 * Safe to call any number of times — every call after the first just moves
 * the existing slot into the current header DOM rather than recreating it —
 * but renderPrepPage() is the only call site, since that's the only place the
 * route is (re-)entered or the header is rebuilt. Starts from the reader's
 * saved preference (or the 'expanded' default) rather than a hardcoded mode. */
function initPrepChrome() {
  const headerInner = document.querySelector('#header .header-inner');
  const headerActions = headerInner && headerInner.querySelector('.header-actions');
  if (!headerInner || !headerActions) return;

  let c = prepChromeState;
  const fresh = !c;
  if (!c) {
    const slotEl = document.createElement('div');
    slotEl.className = 'sp-session-slot';
    const toggleEl = document.createElement('button');
    toggleEl.type = 'button';
    toggleEl.id = 'sp-chrome-toggle';
    toggleEl.className = 'sp-session-control';
    const statusSrEl = document.createElement('span');
    statusSrEl.className = 'sr-only';
    statusSrEl.setAttribute('role', 'status');
    slotEl.append(toggleEl, statusSrEl);
    c = { mode: storedPrepHeaderMode(), toggleEl, slotEl, statusSrEl, hintEl: null, hintDone: false };
    toggleEl.addEventListener('click', () => {
      prepChromeSetMode(c.mode === 'compact' ? 'expanded' : 'compact');
    });
    prepChromeState = c;
  }
  headerInner.insertBefore(c.slotEl, headerActions);

  applyPrepChromeDom();
  // A compact mode restored from storage is the other first-time case.
  if (fresh && PrepUtils.shouldShowSessionHint(c.mode, storedPrepSessionHintSeen())) showPrepSessionHint();
}

/** Removes the session control and resets <body>'s mode attribute — called
 * whenever render() leaves the prep route, so nothing here outlives
 * the page and a later re-entry starts clean (from the saved preference
 * again, via initPrepChrome() above). */
function destroyPrepChrome() {
  const c = prepChromeState;
  if (!c) return;
  flushPrepNotesSave();
  dismissPrepSessionHint();
  delete document.body.dataset.spHeaderMode;
  if (c.slotEl) c.slotEl.remove();
  prepChromeState = null;
}
/* ---------------- page render ---------------- */

/* Every call rebuilds #grid-wrap's innerHTML from scratch (a full render()
 * from the route entry, a language switch, or a successful catalogue
 * retry), which destroys any existing #prep-item-grid element along with
 * it — so the item strip controller is unconditionally torn down at the top
 * and, on the success path, rebuilt from the freshly-created element at the
 * end. This is the only place either happens. */
function renderPrepPage() {
  flushPrepNotesSave();
  destroyPrepItemNav();
  destroyPrepItemDice();
  initPrepChrome();
  document.getElementById('toolbar').innerHTML = '';
  document.getElementById('result-count').innerHTML = '';
  const el = document.getElementById('grid-wrap');
  if (state.prepLoadFailed) {
    // Matches the pre-existing behaviour of not showing the prep title
    // bar while the catalogue failed to load — the chrome toggle itself
    // still works (see initPrepChrome() above) since it doesn't
    // depend on this catalogue.
    el.innerHTML = `<div class="prep-wrap">${emptyStateHtml({
      icon: ICON_ALERT,
      title: t('prep_catalog_load_error'),
      action: `<button type="button" class="btn btn-primary" data-sp-retry>${t('prep_retry')}</button>`,
      error: true,
    })}</div>`;
    bindPrepDelegation(el);
    applyPrepChromeDom();
    return;
  }
  const prep = activePrep();
  // The Prep Bar is part of the workspace, not the site header chrome,
  // so it's the first child of .prep-wrap — but it is still hidden by the
  // same `data-sp-header-mode="compact"` switch as the header (see the
  // compact-mode rules in css/styles.css).
  el.innerHTML = `
    <div class="prep-wrap">
      ${prepBarHtml(prep)}
      <div class="prep-main">
        ${envPickerColumnHtml(prep)}
        ${centralSectionHtml(prep)}
        ${advPickerColumnHtml(prep)}
      </div>
      ${itemsPanelHtml(prep)}
    </div>`;
  bindPrepDelegation(el);
  initPrepReorder();
  bindPrepSearchAndTitle();
  bindAdvToolbarControls();
  initPrepItemNav(activeItemGridId());
  applyPrepChromeDom();
  BattlePointsUI.mount();
  syncCentralTruncationTips();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncCentralTruncationTips);
}

/* ---------------- sources ---------------- */

function openSourcesPopup() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // 'popup' rather than 'detail': like the add-to-list popup, this one stands
  // the floating language switch down while it is up.
  overlay.dataset.overlayKind = 'popup';

  overlay.innerHTML = `
    <div class="modal modal-sm" data-overlay-card
         role="dialog" aria-modal="true" aria-labelledby="sources-title">
      <div class="modal-header">
        <h2 id="sources-title">${t('sources_title')}</h2>
        <button type="button" class="icon-btn icon-btn--reach modal-close" aria-label="${t('close')}">${ICON_CLOSE}</button>
      </div>
      <div class="modal-body">
        <ul class="sources-list">
          ${SOURCES.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const teardown = registerOverlay(overlay, close);

  function close() {
    overlay.remove();
    teardown();
  }

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

/* ---------------- reading a stat block at another tier ---------------- */

/* "Environment Statistics by Tier" from the Core Rulebook. `difficulty` is the
 * printed value; `band` is the printed damage range expressed as average damage
 * (tier 1 runs 1d6+1 … 1d8+3, i.e. 4.5 … 7.5); `dice` are the die sizes that
 * range uses; `mid` is the band midpoint, used to scale damage the book never
 * prints. */
const TIER_TABLE = {
  1: { difficulty: 11, band: [4.5, 7.5], dice: [6, 8], mid: 6 },
  2: { difficulty: 14, band: [10, 13], dice: [6, 8, 10], mid: 11.5 },
  3: { difficulty: 17, band: [16.5, 17.5], dice: [8, 10], mid: 17 },
  4: { difficulty: 20, band: [21, 32], dice: [8, 10], mid: 26.5 },
};

// No environment in the book or in data/environments.json sits outside 10–20.
const DIFFICULTY_FLOOR = 10;
const DIFFICULTY_CEIL = 20;

const DIE_SIZES = [3, 4, 6, 8, 10, 12, 20, 100];

function diceAvg(count, sides, mod) { return count * (sides + 1) / 2 + mod; }

/* "Scaling" in Atlas of Adventure gives its own rule for moving one of its Tier 1
 * or Tier 2 environments between those two tiers: difficulty ±3, and the damage
 * pool of a feature goes from one die to two (up) or two to one (down). It
 * belongs to that book's environments alone (`source`) and to that one tier
 * pair alone — every other read, Atlas environment or not, uses the tier table
 * above. */
const ATLAS_SOURCE = 'Atlas of Adventure';
const ATLAS_TIER_DIFFICULTY_SHIFT = 3;

/** The `{ from, to }` a card read at `toTier` is scaled by, or null at the
 * environment's own tier. `atlas` marks the Atlas of Adventure Tier 1 ↔ 2 rule. */
function retierFor(env, toTier) {
  if (toTier === env.tier) return null;
  const atlas = env.source === ATLAS_SOURCE && [env.tier, toTier].every(n => n === 1 || n === 2);
  return { from: env.tier, to: toTier, atlas };
}

/** A number tuned for `fromTier` (a difficulty, or a single check's DC), read at
 * `toTier`. The deviation from the tier's own printed difficulty is authored
 * tuning and is carried over rather than snapping to the flat table value: a
 * tier 2 number one below the table reads one below the table at tier 3 too.
 * `atlas` swaps the table for the Atlas of Adventure flat ±3 (see above). */
function retierValue(value, fromTier, toTier, atlas = false) {
  if (toTier === fromTier) return value;
  if (atlas) return value + (toTier > fromTier ? 1 : -1) * ATLAS_TIER_DIFFICULTY_SHIFT;
  const shifted = value + TIER_TABLE[toTier].difficulty - TIER_TABLE[fromTier].difficulty;
  return Math.min(DIFFICULTY_CEIL, Math.max(DIFFICULTY_FLOOR, shifted));
}

/** Descriptive difficulties ("Special (see Relative Strength)") never scale. */
function retierDifficulty(env, tier) {
  if (typeof env.difficulty !== 'number') return envDifficulty(env);
  const retier = retierFor(env, tier);
  return retier ? retierValue(env.difficulty, retier.from, retier.to, retier.atlas) : env.difficulty;
}

const damageLadderCache = new Map();

/** Every XdY+Z the table allows for a tier: X equal to the tier, Y one of the
 * tier's die sizes, Z whatever keeps the average inside the printed band. */
function tierDamageLadder(tier) {
  let ladder = damageLadderCache.get(tier);
  if (!ladder) {
    const { band, dice } = TIER_TABLE[tier];
    ladder = [];
    for (const sides of dice) {
      for (let mod = 0; mod <= 15; mod++) {
        const avg = diceAvg(tier, sides, mod);
        if (avg >= band[0] && avg <= band[1]) ladder.push({ count: tier, sides, mod, avg });
      }
    }
    ladder.sort((a, b) => a.avg - b.avg || a.sides - b.sides);
    damageLadderCache.set(tier, ladder);
  }
  return ladder;
}

/** Damage that sits inside its own tier's printed range keeps its position in
 * that range: the tier 2 minimum (2d6+3) reads as the tier 3 minimum (3d8+3).
 * The result is always a roll the table itself allows. */
function mapDamageWithinTable(from, to, roll) {
  const [lo, hi] = TIER_TABLE[from].band;
  const pos = (diceAvg(roll.count, roll.sides, roll.mod) - lo) / (hi - lo || 1);
  const [tLo, tHi] = TIER_TABLE[to].band;
  const want = tLo + pos * (tHi - tLo);
  let best = null;
  for (const cand of tierDamageLadder(to)) {
    if (!best || Math.abs(cand.avg - want) < Math.abs(best.avg - want)) best = cand;
  }
  return best;
}

/** Damage the book never prints — 8d12 in Castle Of Wails, 3d20 in Scorching
 * Dungeon, 2d8+12 in Stop The Collapse Of Reality. Squeezing those into the
 * printed band would *lower* the damage when the tier goes up (8d12 averages 52,
 * the whole tier 3 range tops out at 17.5), so they scale against themselves
 * instead: the average moves by the ratio of the two tiers' midpoints and the
 * die type is kept, so an unusually brutal hazard stays unusually brutal. */
function scaleDamageOutsideTable(from, to, roll) {
  const ratio = TIER_TABLE[to].mid / TIER_TABLE[from].mid;
  const want = diceAvg(roll.count, roll.sides, roll.mod) * ratio;
  let count = Math.max(1, Math.round(roll.count * ratio));
  let sides = roll.sides;
  for (;;) {
    const mod = Math.round(want - diceAvg(count, sides, 0));
    if (mod >= 0) return { count, sides, mod };
    if (count > 1) { count--; continue; }        // drop a die before shrinking one
    const i = DIE_SIZES.indexOf(sides);
    if (i > 0) { sides = DIE_SIZES[i - 1]; continue; }
    return { count: 1, sides: DIE_SIZES[0], mod: 0 };
  }
}

/** Safety net for the two mappings above: a higher tier must hit harder and a
 * lower one softer, never the reverse. Both mappings already guarantee this for
 * every roll in the bundled data — this only catches rounding on hand-authored
 * environments. */
function enforceDamageDirection(from, to, roll, scaled) {
  const target = diceAvg(roll.count, roll.sides, roll.mod);
  const dir = to > from ? 1 : -1;
  let { count, sides, mod } = scaled;
  for (let i = 0; i < 40 && dir * (diceAvg(count, sides, mod) - target) <= 0; i++) {
    if (dir > 0) { mod++; continue; }
    if (mod > 0) { mod--; continue; }
    const idx = DIE_SIZES.indexOf(sides);
    if (idx > 0) { sides = DIE_SIZES[idx - 1]; continue; }
    if (count > 1) { count--; continue; }
    break;                                       // 1d3 is the floor
  }
  return { count, sides, mod };
}

/** The same damage roll read at another tier. The environment's own tier always
 * returns the authored roll untouched — nothing about a stat block is ever
 * rewritten at its native tier. */
function retierDamage(from, to, roll, atlas = false) {
  if (to === from) return { count: roll.count, sides: roll.sides, mod: roll.mod, changed: false };
  // Atlas of Adventure: exactly one die rises to two, exactly two fall to one,
  // the die size and the modifier untouched. A roll that is not that shape
  // (Raging Fire's 2d10+2 going up, Wretched Mire's 1d10 going down) is not
  // covered by the rule and takes the table scaling below.
  if (atlas && roll.count === (from < to ? 1 : 2)) {
    return { count: from < to ? 2 : 1, sides: roll.sides, mod: roll.mod, changed: true };
  }
  const avg = diceAvg(roll.count, roll.sides, roll.mod);
  const [lo, hi] = TIER_TABLE[from].band;
  const scaled = (avg >= lo && avg <= hi)
    ? mapDamageWithinTable(from, to, roll)
    : scaleDamageOutsideTable(from, to, roll);
  return { ...enforceDamageDirection(from, to, roll, scaled), changed: true };
}

/** A scaled roll always prints its count, even where the source wrote "d6":
 * the count is the part that carries the tier. */
function formatDamage(roll) {
  return `${roll.count}d${roll.sides}` + (roll.mod > 0 ? `+${roll.mod}` : '');
}

/* ---------------- detail modal ---------------- */

/* Which card is on screen, and how to take it away again. syncDetail() owns
 * both: nothing else opens or closes a detail card. */
let openDetailId = null;
/* A card's text is baked into its markup at open time, so the address alone no
 * longer says whether what is on screen is current — the language it was built
 * in has to be remembered alongside it. */
let openDetailLang = null;
let closeDetailOverlay = () => {};

/* Whether the card on screen was opened from this page, and so has a history
 * entry of its own to step back through, or arrived with the address — in
 * which case going back would walk off the site rather than close the card. */
let cardEntryPushed = false;

/** Opens a card by address. Everything that opens one — a grid click, a shared
 * link, the Forward button — arrives through the hash, so the card on screen
 * and the URL can never disagree. */
function showEnv(envId) {
  const target = envHash(envId);
  if (location.hash === target) return;
  cardEntryPushed = true;
  location.hash = target;
}

/** Closes the card the way the × and Escape mean it: back out of the entry
 * that opened it, or, for a card that arrived with the address, rewrite the
 * address to the route behind it without adding to the history. */
function dismissDetail() {
  if (cardEntryPushed) { cardEntryPushed = false; history.back(); return; }
  history.replaceState(null, '', baseHash() || location.pathname + location.search);
  state.route = readCurrentRoute();
  syncDetail();
  document.title = routeTitle();
}

/** A neighbour opened from the region block takes the place of the card that
 * offered it, so Escape still means "back to the grid" rather than walking
 * back through every card visited along the way. */
function replaceEnv(envId) {
  history.replaceState(null, '', envHash(envId));
  state.route = readCurrentRoute();
  syncDetail();
  document.title = routeTitle();
}

function openDetailOverlay(envId, carry = null) {
  const env = allEnvs().find(e => e.id === envId);
  if (!env) return;
  const impulses = envField(env, 'impulses');
  const adversaries = envField(env, 'potential_adversaries');
  const encounterExport = envEncounterExport(env);

  /* The tier the card is currently being read at. Deliberately modal-local: it
   * lives while this card is open and is gone the moment it closes, so nothing
   * outside — cards, filters, region badges, storage — ever sees an override.
   * Opening a neighbour from the region block opens it at its own tier; only a
   * card being rebuilt in place, for the language, carries its override over. */
  let viewTier = carry?.viewTier ?? env.tier;

  const featureHtml = f => {
    const fname = f.name[state.lang] || f.name.en || f.name.ru;
    const fdesc = f.description[state.lang] || f.description.en || f.description.ru || '';
    const fprompt = (f.prompt && (f.prompt[state.lang] || f.prompt.en || f.prompt.ru)) || '';
    return `
      <div class="feature">
        <div class="feature-head">
          <span class="feature-name">${escapeHtml(fname)}</span>
          <span class="feature-type ${f.type}">${t('feature_' + f.type)}</span>
        </div>
        <div class="feature-desc" data-rich-block="${encodeURIComponent(fdesc)}"></div>
        ${fprompt ? `<p class="feature-prompt">${escapeHtml(fprompt)}</p>` : ''}
      </div>`;
  };

  // Passive, then reaction, then action. The groups are told apart by the type
  // chip on each feature and by the gap between them, so there is no rule drawn
  // between them.
  const featuresHtml = ['passive', 'reaction', 'action']
    .map(type => (env.features || []).filter(f => f.type === type).map(featureHtml).join(''))
    .filter(Boolean)
    .map(group => `<div class="feature-group">${group}</div>`)
    .join('');

  const rawHtml = env.rawText && (env.rawText.en || env.rawText.ru) ? `
    <span class="section-label">${t('raw_text_label')}</span>
    <div class="feature-desc" data-rich-block="${encodeURIComponent(env.rawText[state.lang] || env.rawText.en || env.rawText.ru || '')}"></div>
  ` : '';

  /* A name in potential_adversaries becomes a button when it names an adversary
   * embedded in THIS environment (env.featured_adversaries) — clicking it opens
   * and scrolls to that stat block below rather than to a catalogue that does
   * not exist. That takes priority over the FreshCutGrass links below: a stat
   * block already on this card is more useful than sending the reader away.
   * Everywhere else, every environment's group names and adversary names get
   * linked to their own encounter. */
  const featuredEntries = (env.featured_adversaries || []).filter(e => e && adversaryById(e.id));
  const potentialAdvNameToId = new Map();
  featuredEntries.forEach(e => {
    const adv = adversaryById(e.id);
    ['en', 'ru'].forEach(l => { if (adv.name?.[l]) potentialAdvNameToId.set(adv.name[l].trim().toLowerCase(), e.id); });
  });
  const englishAdversaryEntries = env.potential_adversaries?.en || [];
  /* "Any" ("Любой") means the GM picks whatever fits and "None" ("Нет") means
   * there are none — neither names anything, so the whole Potential
   * Adversaries block is noise rather than information.
   * Checked against the English text (or the localized text when English is
   * unavailable) so the block hides regardless of the card's display language. */
  const adversaryCanonical = englishAdversaryEntries.length ? englishAdversaryEntries : adversaries;
  const hasRealAdversaries = adversaryCanonical.some(name => !/^(any|none|любой|нет)$/i.test(parsePotentialAdversaryEntry(name).label));
  const adversariesHtml = adversaries.map((name, i) => {
    const id = potentialAdvNameToId.get(name.trim().toLowerCase());
    if (id) return `<button type="button" class="adversary-link-btn" data-adversary-link="${escapeAttr(id)}">${escapeHtml(name)}</button>`;
    return potentialAdversaryEntryHtml(name, englishAdversaryEntries[i]);
  }).join('; ');

  const adversaryAttackHtml = atk => `
    <div class="adversary-attack-row">
      <span class="adversary-attack-name">${escapeHtml(bilingual(atk.name))}</span>
      <span class="adversary-range-badge">${t('range_' + atk.range)}</span>
      <span class="adversary-attack-damage" data-adv-dice="${encodeURIComponent(atk.damage)}"></span>
      <span class="adversary-damage-type-badge">${t('damage_' + atk.damage_type)}</span>
    </div>`;

  const adversaryExperienceHtml = exp => `
    <div class="adversary-experience-row">
      <span class="adversary-experience-name">${escapeHtml(bilingual(exp.name))}</span>
      <span class="adversary-experience-mod">${exp.modifier >= 0 ? '+' : ''}${exp.modifier}</span>
    </div>`;

  const adversaryFeatureHtml = f => `
    <div class="feature">
      <div class="feature-head">
        <span class="feature-name">${escapeHtml(bilingual(f.name))}</span>
        <span class="feature-type ${f.type}">${t('feature_' + f.type)}</span>
      </div>
      <div class="feature-desc" data-adv-rich="${encodeURIComponent(bilingual(f.description))}"></div>
    </div>`;

  /* One <details> per featured adversary, so an environment can embed more than
   * one. `expanded: true` is the only way in — an environment the party cannot
   * run without its adversary sets it, everything else starts collapsed. */
  const adversaryBlockHtml = entry => {
    const adv = adversaryById(entry.id);
    const attacksHtml = (adv.attacks || []).map(adversaryAttackHtml).join('');
    const expHtml = (adv.experiences || []).map(adversaryExperienceHtml).join('');
    const advFeaturesHtml = (adv.features || []).map(adversaryFeatureHtml).join('');
    return `
      <details class="adversary-block" data-adversary-id="${escapeAttr(adv.id)}" ${entry.expanded === true ? 'open' : ''}>
        <summary class="adversary-summary">
          <span class="adversary-name">${escapeHtml(adversaryName(adv))}</span>
          <span class="adversary-subtitle">${escapeHtml(t('role_' + adv.role) || adv.role)} — ${t('tier_label')} ${adv.tier}</span>
        </summary>
        <div class="adversary-body">
          <div class="adversary-stats">
            <div class="adversary-stat"><span class="dm-k">${t('difficulty_label')}</span><span class="dm-v">${adv.difficulty}</span></div>
            <div class="adversary-stat"><span class="dm-k">${t('thresholds_label')}</span><span class="dm-v">${adv.thresholds.major} / ${adv.thresholds.severe}</span></div>
            <div class="adversary-stat"><span class="dm-k">${t('hp_label')}</span><span class="dm-v">${adv.hp}</span></div>
            <div class="adversary-stat"><span class="dm-k">${t('stress_label')}</span><span class="dm-v">${adv.stress}</span></div>
            <div class="adversary-stat"><span class="dm-k">${t('atk_label')}</span><span class="dm-v">+${adv.attack_modifier}</span></div>
          </div>
          ${attacksHtml ? `<span class="section-label">${t('attacks_label')}</span><div class="adversary-attacks">${attacksHtml}</div>` : ''}
          ${expHtml ? `<span class="section-label">${t('experience_label')}</span><div class="adversary-experience">${expHtml}</div>` : ''}
          ${advFeaturesHtml ? `<span class="section-label">${t('adversary_features_label')}</span>${advFeaturesHtml}` : ''}
        </div>
      </details>`;
  };

  const featuredAdversaryHtml = featuredEntries.length ? `
    <span class="section-label">${t('featured_adversary_label')}</span>
    <div class="adversary-blocks">${featuredEntries.map(adversaryBlockHtml).join('')}</div>
  ` : '';

  /* Supplementary GM material, never mechanics: kept out of env.features and
   * out of the catalogue entirely, and collapsed by default behind one summary
   * that says how many are inside. */
  const storySeeds = (env.story_seeds || []).filter(s => s && s.title && s.body);
  const storySeedHtml = seed => {
    const prompt = bilingual(seed.prompt);
    return `
      <div class="story-seed">
        <p class="story-seed-title">${escapeHtml(bilingual(seed.title))}</p>
        <div class="story-seed-body" data-adv-rich="${encodeURIComponent(bilingual(seed.body))}"></div>
        ${prompt ? `<p class="feature-prompt story-seed-prompt">${escapeHtml(prompt)}</p>` : ''}
      </div>`;
  };
  const storySeedsHtml = storySeeds.length ? `
    <details class="story-seeds">
      <summary class="story-seeds-summary section-label">${t('story_seeds_label')} (${storySeeds.length})</summary>
      <div class="story-seeds-body">${storySeeds.map(storySeedHtml).join('')}</div>
    </details>
  ` : '';

  const loreText = bilingual(env.lore);
  const loreHtml = loreText ? `<p class="env-lore">${escapeHtml(loreText)}</p>` : '';

  const region = regionOfEnv(env.id);
  const members = region ? regionMembers(region) : [];
  const regionHtml = members.length > 1 ? `
    <div class="region-block">
      <span class="section-label">${t('region_label')}</span>
      <p class="region-name">${escapeHtml(regionName(region))}</p>
      <div class="region-envs">
        ${members.map(member => member.id === env.id
          ? `<button type="button" class="region-env-btn active" disabled aria-current="true">${escapeHtml(envName(member))}<span class="region-env-tier">${member.tier}</span></button>`
          : `<button type="button" class="region-env-btn" data-region-env="${member.id}">${escapeHtml(envName(member))}<span class="region-env-tier">${member.tier}</span></button>`
        ).join('')}
      </div>
    </div>` : '';

  /* The environment's own tier carries a dot, so an overridden card never hides
   * which tier the stat block was actually written for — and so the row reads as
   * something switchable rather than as a rating. */
  const tierPillsHtml = [1, 2, 3, 4].map(n => `
    <button type="button" class="rank-icon rank-icon-sm ${n === env.tier ? 'native' : ''}" data-view-tier="${n}"
            aria-label="${t('view_as_tier')} ${n}" data-tip="${n === env.tier ? t('native_tier') : t('view_as_tier') + ' ' + n}"
      ><span>${n}</span>${n === env.tier ? '<i class="rank-native-dot" aria-hidden="true"></i>' : ''}</button>`).join('');

  const biomesHtml = (env.biomes || []).length ? `
    <div class="detail-footer-biomes">
      <span class="dm-k">${t('filter_biome')}</span><span class="dm-dash">—</span>
      ${env.biomes.map(b => `<span class="biome-chip">${t('biome_' + b)}</span>`).join('')}
    </div>` : '<span></span>';

  const sourceHtml = `<span class="detail-footer-source">${env.source ? `${t('source_label')} ${escapeHtml(env.source)}` : ''}</span>`;

  const overlay = document.createElement('div');
  /* A card rebuilt in the other language is the same card with different words
   * on it, so it skips the entrance animation: replaying the fade would read as
   * the card blinking out and back rather than as the text changing. Removal
   * and insertion happen in one task, so nothing is painted in between. */
  overlay.className = carry ? 'modal-overlay is-rebuild' : 'modal-overlay';
  overlay.dataset.overlayKind = 'detail';
  overlay.innerHTML = `
    <div class="modal" id="detail-modal" data-overlay-card
         role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div class="modal-header">
        <div class="modal-title-row">
          <h2 id="detail-title">${escapeHtml(envName(env))}</h2>
          <div class="env-actions">
            ${envPrepButtonHtml(env)}
            <button type="button" class="card-add-btn${isEnvInAnyList(env.id) ? ' is-listed' : ''}" id="detail-add-to-list" data-env-list-indicator="${env.id}" aria-label="${t('add_to_list')}" data-tip="${t('add_to_list')}" aria-haspopup="dialog">${ICON_BOOKMARK}</button>
          </div>
        </div>
        <div class="rank-pills detail-tier-pills" id="detail-tier-pills" role="group" aria-label="${t('view_as_tier')}">${tierPillsHtml}</div>
        <button type="button" class="icon-btn icon-btn--reach modal-close" aria-label="${t('close')}">${ICON_CLOSE}</button>
      </div>
      <div class="modal-body">
        ${loreHtml}
        <div class="detail-meta">
          ${hasDifficulty(env) ? `
          <span class="dm-item">
            <span class="dm-k">${t('difficulty_label')}</span><span class="dm-dash">—</span>
            <span class="dm-v" id="detail-difficulty-value"></span>
          </span>
          <span class="dm-sep" aria-hidden="true">·</span>` : ''}
          <span class="dm-item">
            <span class="dm-k">${t('filter_type')}</span><span class="dm-dash">—</span>
            <span class="dm-v dm-v-text">${t('type_' + env.type)}</span>
          </span>
        </div>

        ${impulses.length ? `<span class="section-label">${t('impulses_label')}</span><p class="impulse-list">${escapeHtml(impulses.join(', '))}</p>` : ''}
        ${hasRealAdversaries ? `
        <div class="section-label-row">
          <span class="section-label">${t('adversaries_label')}</span>
          ${encounterExport.url ? (() => {
            // Mixed environment: a count badge and a tooltip say that only
            // part of the list is exported. All-supported: nothing extra.
            const partialTip = encounterPartialTip(encounterExport);
            const tip = partialTip || t('encounter_open_tip');
            const label = partialTip ? `${t('encounter_open_tip')}. ${partialTip}` : tip;
            const badge = partialTip ? `<span class="encounter-count" aria-hidden="true">${encounterExport.supportedCount}</span>` : '';
            return `<a class="encounter-builder-link encounter-action" href="${escapeAttr(encounterExport.url)}" target="_blank" rel="noopener noreferrer"
                data-tip="${escapeAttr(tip)}" aria-label="${escapeAttr(label)}"><span>${t('open_encounter_builder')}</span>${badge}${extIconHtml()}</a>`;
          })() : ''}
        </div>
        ${adversariesHtml.includes('adversary-encounter-link') ? `<p class="adversary-hint">${escapeHtml(t('adversaries_hint'))}</p>` : ''}
        <p class="adversary-list">${adversariesHtml}</p>` : ''}
        ${featuresHtml ? `<span class="section-label">${t('features_label')}</span>${featuresHtml}` : ''}
        ${featuredAdversaryHtml}
        ${storySeedsHtml}
        ${rawHtml}
        ${regionHtml}

        <div class="detail-footer">
          ${biomesHtml}
          ${sourceHtml}
          <button type="button" class="btn" id="detail-add-to-list-bottom" aria-haspopup="dialog">${t('add_to_ellipsis')}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  /* The featured adversary's own stat block, and any story seeds: rendered once,
   * outside the environment's tier-scaling system — a monster's stats are fixed,
   * not something "view as tier" should rescale. */
  overlay.querySelectorAll('[data-adv-rich]').forEach(node => {
    renderFeatureBody(node, decodeURIComponent(node.getAttribute('data-adv-rich')), null);
  });
  overlay.querySelectorAll('[data-adv-dice]').forEach(node => {
    renderRichText(node, decodeURIComponent(node.getAttribute('data-adv-dice')), null);
  });
  overlay.querySelectorAll('[data-adversary-link]').forEach(btn => btn.addEventListener('click', () => {
    const block = overlay.querySelector(`.adversary-block[data-adversary-id="${CSS.escape(btn.dataset.adversaryLink)}"]`);
    if (!block) return;
    block.open = true;
    block.scrollIntoView({ block: 'center', behavior: 'smooth' });
    block.querySelector('.adversary-summary')?.focus();
  }));

  const modalEl = overlay.querySelector('#detail-modal');
  const difficultyValueEl = overlay.querySelector('#detail-difficulty-value');

  /** Countdown panels whose button was replaced by a re-render would otherwise
   * linger over the card with nothing behind them. */
  function pruneCountdownOverlays() {
    (overlay._countdownOverlays || []).slice().forEach(panel => {
      if (panel._btn && !document.body.contains(panel._btn)) {
        panel.remove();
        overlay._countdownOverlays = overlay._countdownOverlays.filter(p => p !== panel);
      }
    });
  }

  // Renders dice- and countdown-enabled text, with bullet-list support. On a
  // tier switch only blocks that actually hold a damage roll or a check DC are
  // rebuilt, so a countdown tracker opened elsewhere in the card survives the
  // switch.
  function renderRichBlocks() {
    const retier = retierFor(env, viewTier);
    overlay.querySelectorAll('[data-rich-block]').forEach(node => {
      const text = decodeURIComponent(node.getAttribute('data-rich-block'));
      if (node._renderedTier === viewTier) return;
      if (node._renderedTier !== undefined && !hasDamageRoll(text) && !hasCheckDC(text)) return;
      node._renderedTier = viewTier;
      renderFeatureBody(node, text, retier);
    });
    pruneCountdownOverlays();
  }

  function applyViewTier() {
    const overridden = viewTier !== env.tier;
    // While a card is read at another tier it says so twice over: an amber rim
    // around the whole card, and the environment's own difficulty spelled out
    // next to the scaled one.
    modalEl.classList.toggle('retiered', overridden);
    // A descriptive difficulty reads the same at every tier, so it is never
    // annotated: there is no original to set it against.
    if (difficultyValueEl) {
      const annotate = overridden && difficultyScales(env);
      difficultyValueEl.textContent = String(retierDifficulty(env, viewTier));
      if (annotate) {
        difficultyValueEl.dataset.tip =
          t('retier_original').replace('{v}', `${t('tier_label')} ${env.tier}, ${t('difficulty_label')} ${envDifficulty(env)}`);
      } else {
        delete difficultyValueEl.dataset.tip;
      }
    }
    overlay.querySelectorAll('[data-view-tier]').forEach(btn => {
      const on = Number(btn.dataset.viewTier) === viewTier;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderRichBlocks();
  }

  overlay.querySelectorAll('[data-view-tier]').forEach(btn => btn.addEventListener('click', () => {
    viewTier = Number(btn.dataset.viewTier);
    applyViewTier();
  }));
  applyViewTier();

  /* Trackers from the card this one replaces, matched by position — and only
   * when both languages produced the same run of countdowns, since anything
   * else would land a count on the wrong feature. */
  const carriedCounts = carry?.countdowns || [];
  const countdownBtns = [...overlay.querySelectorAll('.countdown-btn')];
  if (carriedCounts.length && carriedCounts.length === countdownBtns.length) {
    countdownBtns.forEach((btn, i) => {
      btn.dataset.count = carriedCounts[i].count;
      if (carriedCounts[i].open) openCountdownOverlay(btn);
    });
  }

  const teardown = registerOverlay(overlay, dismissDetail);

  // After registerOverlay, which focuses the card: focusing it scrolls the
  // overlay back to the top, so restoring the position has to come last.
  if (carry?.scrollTop) overlay.scrollTop = carry.scrollTop;

  openDetailId = envId;
  openDetailLang = state.lang;
  /* The raw teardown, with no opinion about history. syncDetail() calls it once
   * the address stops naming this card — which is the only way a card ever
   * comes off the screen. */
  closeDetailOverlay = () => {
    (overlay._countdownOverlays || []).slice().forEach(p => p.remove());
    overlay.remove();
    teardown();
    openDetailId = null;
    openDetailLang = null;
    closeDetailOverlay = () => {};
  };

  overlay.querySelector('.modal-close').addEventListener('click', dismissDetail);
  overlay.addEventListener('click', e => { if (e.target === overlay) dismissDetail(); });

  overlay.querySelectorAll('[data-region-env]').forEach(btn => btn.addEventListener('click', () => {
    replaceEnv(btn.dataset.regionEnv);
  }));

  overlay.querySelector('#detail-add-to-list').addEventListener('click', () => openAddToListPopup(env.id));
  overlay.querySelector('#detail-add-to-list-bottom').addEventListener('click', () => openAddToListPopup(env.id, { expanded: true }));
  overlay.querySelectorAll('[data-env-prep-toggle]').forEach(btn => btn.addEventListener('click', () => handleEnvPrepToggleClick(btn)));
}

/* ---------------- item card ---------------- */

/* The item card is the atlas's own modal (same header, chips and buttons as an
 * environment's detail card) holding another site's content: square art on top,
 * the chip row, the text and the craft chain. The artwork is served by the loot
 * generator, so a picture that will not load simply drops out of the card. */
const ITEM_CRAFT_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 11h11.2l-3.6-3.6L13 6l6 6-6 6-1.4-1.4 3.6-3.6H4v-2z"/></svg>`;
/* The generator's own icons, so a reader who knows that card recognises these
 * controls as the same ones. The chain means "the link to this entry" there and
 * here; the arrow out of the box is ours, and keeps the button that leaves the
 * site from wearing the same icon as the button that copies its address. */
const ITEM_LINK_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.9 12a5.1 5.1 0 0 1 5.1-5.1h4V5H9a7 7 0 0 0 0 14h4v-1.9H9A5.1 5.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm7-8v1.9h4a5.1 5.1 0 0 1 0 10.2h-4V19h4a7 7 0 0 0 0-14h-4z"/></svg>`;
const ITEM_EXT_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7zM5 5h5V3H3v18h18v-7h-2v5H5V5z"/></svg>`;
const ITEM_IMAGE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>`;
const ITEM_COPY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>`;

/* The quoted card is only ever opened from a link inside an environment card,
 * so it sits on top of one — and bakes its text in the same way. Rebuilding the
 * card underneath has to take this one with it, or the language switch would
 * leave a stale item card stranded beneath the card it was opened from. */
let openItemId = null;
let closeOpenItemDetail = () => {};

/* `quiet` is set when this card is being put back on top of a stat block that
 * was rebuilt for the language: the pop-in belongs to opening a card, not to
 * the same card coming back with translated text. */
function openItemDetail(itemId, { quiet = false } = {}) {
  const item = itemById(itemId);
  if (!item) return;

  const name = itemField(item, 'name');
  const art = itemImageUrl(item);
  const kind = item.kind === 'consumable' ? 'consumable' : 'item';

  const craftHtml = itemCraftRows(itemId).map(row => `
    <p>${ITEM_CRAFT_ICON}<span class="loot-craft-l">${row.label}</span>
       <button type="button" class="loot-craft-a" data-craft-item="${escapeAttr(row.id)}">${escapeHtml(itemField(itemById(row.id), 'name'))}</button></p>`).join('');

  const overlay = document.createElement('div');
  overlay.className = quiet ? 'modal-overlay is-rebuild' : 'modal-overlay';
  overlay.dataset.overlayKind = 'item';
  overlay.innerHTML = `
    <div class="modal loot-modal" data-overlay-card role="dialog" aria-modal="true" aria-labelledby="item-title">
      <div class="modal-header">
        <div class="modal-title-row">
          <h2 id="item-title">${escapeHtml(name)}</h2>
          <button type="button" class="icon-btn icon-btn--utility loot-name-act" data-copy-link
                  data-tip="${escapeAttr(t('copy_link'))}" aria-label="${escapeAttr(t('copy_link'))}">${ITEM_LINK_ICON}</button>
        </div>
        <button type="button" class="icon-btn icon-btn--reach modal-close" aria-label="${t('close')}">${ICON_CLOSE}</button>
      </div>
      <div class="modal-body">
        ${art ? `<div class="loot-media"><img src="${escapeAttr(art)}" alt="${escapeAttr(name)}"></div>` : ''}
        <div class="loot-meta">
          ${item.roll ? `<span class="environment-type-chip loot-roll">${item.roll}</span>` : ''}
          <span class="${kind === 'consumable' ? 'biome-chip' : 'environment-type-chip loot-kind-item'}">${t('item_kind_' + kind)}</span>
          <span class="environment-type-chip">${t('item_src_' + item.src)}</span>
        </div>
        <div class="feature-desc loot-desc" data-item-desc></div>
        ${craftHtml ? `<div class="loot-craft">${craftHtml}</div>` : ''}
        <div class="loot-acts">
          ${art ? `<button type="button" class="btn btn-ghost btn-sm" data-copy-image
                  data-tip="${escapeAttr(t('copy_image'))}" aria-label="${escapeAttr(t('copy_image'))}">${ITEM_IMAGE_ICON}<span>${escapeHtml(t('copy_image_label'))}</span></button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-copy-text
                  data-tip="${escapeAttr(t('copy_text'))}" aria-label="${escapeAttr(t('copy_text'))}">${ITEM_COPY_ICON}<span>${escapeHtml(t('copy_text_label'))}</span></button>
          <a class="btn btn-sm" href="${escapeAttr(itemUrl(itemId))}" target="_blank" rel="noopener">${ITEM_EXT_ICON}${t('open_in_loot')}</a>
        </div>
        <p class="hint loot-src-note">${t('loot_src_note')}</p>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Item text carries its own rolls ("clear 1d4 HP"), so it goes through the
  // same renderer as a feature — minus the tier scaling, which describes an
  // environment's damage and has nothing to say about a potion.
  renderFeatureBody(overlay.querySelector('[data-item-desc]'), itemField(item, 'description'), null);
  // The text often names the item it belongs to ("a pouch of ball bearings");
  // a link back to the card you are already reading is just noise, so that
  // mention stays plain text. Mentions of other items keep their buttons.
  overlay.querySelectorAll('[data-item-desc] .item-btn').forEach(btn => {
    if (btn.dataset.itemId === itemId) btn.replaceWith(document.createTextNode(btn.textContent));
  });

  const media = overlay.querySelector('.loot-media');
  // A picture that will not load takes its copy button with it: there is
  // nothing left for the button to put on the clipboard.
  if (media) media.querySelector('img').addEventListener('error', () => {
    media.remove();
    overlay.querySelector('[data-copy-image]')?.remove();
  });

  const teardown = registerOverlay(overlay, closeItem);

  function closeItem() {
    (overlay._countdownOverlays || []).slice().forEach(p => p.remove());
    overlay.remove();
    teardown();
    if (closeOpenItemDetail === closeItem) {
      openItemId = null;
      closeOpenItemDetail = () => {};
    }
  }

  openItemId = itemId;
  closeOpenItemDetail = closeItem;

  overlay.querySelector('.modal-close').addEventListener('click', closeItem);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeItem(); });

  // Walking the craft chain replaces this card rather than stacking another one:
  // the chain is one entry read from a different end, not a second thing to close.
  overlay.querySelectorAll('[data-craft-item]').forEach(btn => btn.addEventListener('click', () => {
    const nextId = btn.dataset.craftItem;
    closeItem();
    openItemDetail(nextId);
  }));

  /* The three take the card somewhere else — a chat window, a document, another
   * app — so what they hand over is built from the card as rendered, not from
   * the raw entry: bullets, bold and the dice notation have already been
   * resolved by the time they are read back out. */
  const shareName = itemShareName(item);
  const link = itemUrl(itemId);

  overlay.querySelector('[data-copy-link]').addEventListener('click', () => copyPlainText(link, t('link_copied')));

  overlay.querySelector('[data-copy-image]')?.addEventListener('click', () => copyItemImage(art, shareName));

  overlay.querySelector('[data-copy-text]').addEventListener('click', () => {
    const body = itemBodyForCopy(overlay.querySelector('[data-item-desc]'));
    copyRichText(
      `<p><b>${escapeHtml(shareName)}</b></p>${body.html}`,
      shareName + (body.text ? `\n\n${body.text}` : ''),
      t('text_copied'));
  });
}

/* ---------------- item card: copying and sharing ---------------- */

/** The name a card travels under. A consumable says so, the way the generator's
 * own share text does — pasted into a chat, the card has lost the badge row
 * that carried that on screen. */
function itemShareName(item) {
  const name = itemField(item, 'name');
  return item.kind === 'consumable' ? `${name} (${t('item_kind_consumable').toLowerCase()})` : name;
}

/** Reads the rendered description back out in both clipboard flavours. The roll
 * and item buttons come out as the text they show: a die is worth pasting as
 * "1d4", but not as a control nobody on the other end can press. */
function itemBodyForCopy(descEl) {
  const clone = descEl.cloneNode(true);
  clone.querySelectorAll('button').forEach(btn => btn.replaceWith(document.createTextNode(btn.textContent)));
  const html = [];
  const text = [];
  [...clone.children].forEach(node => {
    if (node.tagName === 'UL') {
      const rows = [...node.children];
      html.push(`<ul>${rows.map(li => `<li>${li.innerHTML}</li>`).join('')}</ul>`);
      text.push(rows.map(li => `• ${li.textContent.trim()}`).join('\n'));
    } else {
      html.push(`<p>${node.innerHTML}</p>`);
      text.push(node.textContent.trim());
    }
  });
  return { html: html.join(''), text: text.filter(Boolean).join('\n\n') };
}

/* Writing anything richer than a string needs the async clipboard, which needs
 * a secure context. Every path below falls back rather than failing: a browser
 * that cannot take rich text gets the plain flavour, and one with no clipboard
 * API at all gets the old selection trick. */
function clipboardCanWriteBlobs() {
  return typeof ClipboardItem !== 'undefined' &&
         !!(navigator.clipboard && navigator.clipboard.write) && window.isSecureContext;
}

function copyPlainText(text, message) {
  const done = () => showToast(message);
  const failed = () => showToast(t('copy_failed'), 'error');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done, () => legacyCopy(text, done, failed));
  } else legacyCopy(text, done, failed);
}

function legacyCopy(text, done, failed) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-1000px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  ok ? done() : failed();
}

/** Bold travels in the text/html flavour. The plain flavour stays clean, so an
 * app that cannot take rich text gets readable text rather than stray asterisks. */
function copyRichText(html, plain, message) {
  if (!clipboardCanWriteBlobs()) { copyPlainText(plain, message); return; }
  navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' }),
  })]).then(() => showToast(message), () => copyPlainText(plain, message));
}

/* The artwork is served by the loot generator, which sends
 * Access-Control-Allow-Origin: *, so an anonymous request can be drawn onto a
 * canvas without tainting it. It goes through the canvas because the files are
 * WebP, which is not a format any browser will put on the clipboard. */
function itemImageBlob(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function itemImageFileName(name) {
  return `${String(name).replace(/[\\/:*?"<>|]/g, '').trim() || 'item'}.png`;
}

function downloadItemImage(src, name) {
  itemImageBlob(src).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = itemImageFileName(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast(t('image_saved'));
  }, () => showToast(t('image_failed'), 'error'));
}

function copyItemImage(src, name) {
  if (!clipboardCanWriteBlobs()) { downloadItemImage(src, name); return; }
  // Safari drops the user gesture unless the pending blob is handed straight to
  // ClipboardItem instead of being awaited first.
  navigator.clipboard.write([new ClipboardItem({ 'image/png': itemImageBlob(src) })])
    .then(() => showToast(t('image_copied')), () => downloadItemImage(src, name));
}

/* ---------------- dice parsing + rolling ---------------- */

/* Matches "2d6", "d20" and an optional flat modifier ("1d6+2", "3d6 - 1"). The
 * lookahead keeps the modifier from swallowing the first die of a following
 * roll, so "2d6 + 1d8" stays two separate buttons. English pluralises the
 * notation — "roll a number of d12s" — so a trailing "s" is allowed to end the
 * die but left out of the match, which keeps the button reading "d12" and the
 * "s" as the prose it belongs to. */
const DICE_RE = /\b(\d{0,2})d(2|3|4|6|8|10|12|20|100)(?=s?\b)(?:\s*([+-])\s*(\d+)\b(?!\s*d\s*\d))?/gi;
const COUNTDOWN_KEYWORD_RE = /(Countdown|Отсчёт\w*|Отсчет\w*|Счётчик\w*|Счетчик\w*)/gi;
const COUNTDOWN_PAREN_RE = /\(\s*(?:(?:Loop|Цикл)\s+)?(?:(\d*)d)?(\d+)\s*\)/gi;

/* A difficulty in parentheses is not a countdown. "…stop the countdown with a
 * successful Finesse Roll (20)" names a check the party makes against the
 * tracker, and the keyword sitting earlier in the same sentence is the only
 * reason it looks like one, so a roll word between the two disqualifies it. */
const COUNTDOWN_ROLL_WORD_RE = /\b(?:roll|check|DC)\b|Брос\w*|Провер\w*|Сложност\w*/i;

/** Finds "<...Countdown/Отсчёт...> (6)"-style spans in free text: scans for a
 * plain integer, optionally prefixed by a "Loop"/"Цикл" qualifier and/or dice
 * notation (e.g. "(6)", "(Loop 1d6)", "(Цикл d20)"), then walks back to the
 * nearest sentence boundary and takes the text from the closest preceding
 * countdown keyword up to the parens. A "Loop XdY" countdown starts at the
 * highest the dice can show (X times Y), not a roll, so this is matched ahead
 * of the plain dice-roll regex to keep it out of a roll button. */
function findCountdownMatches(text) {
  const matches = [];
  COUNTDOWN_PAREN_RE.lastIndex = 0;
  let m;
  while ((m = COUNTDOWN_PAREN_RE.exec(text))) {
    const parenStart = m.index;
    const parenEnd = m.index + m[0].length;
    const before = text.slice(0, parenStart);
    let boundary = -1;
    for (let i = before.length - 1; i >= 0; i--) {
      if ('.!?\n'.includes(before[i])) { boundary = i; break; }
    }
    const segmentStart = boundary + 1;
    const segment = text.slice(segmentStart, parenStart);
    let kwMatch = null, mm;
    COUNTDOWN_KEYWORD_RE.lastIndex = 0;
    while ((mm = COUNTDOWN_KEYWORD_RE.exec(segment))) kwMatch = mm;
    if (!kwMatch) continue;
    if (COUNTDOWN_ROLL_WORD_RE.test(segment.slice(kwMatch.index + kwMatch[0].length))) continue;
    // m[1] is the die count: absent for a plain "(6)", empty for "(d20)".
    const sides = parseInt(m[2], 10);
    const dieCount = m[1] === undefined ? 0 : (m[1] === '' ? 1 : parseInt(m[1], 10));
    const value = dieCount ? dieCount * sides : sides;
    const labelStart = segmentStart + kwMatch.index;
    matches.push({ start: labelStart, end: parenEnd, type: 'countdown', value, label: text.slice(labelStart, parenEnd) });
  }
  return matches;
}

/* A skill check's DC is the same number the card's own difficulty is tuned
 * against, so it follows the card to another tier exactly like the difficulty
 * does. The book spells it out in more shapes than the difficulty stat itself
 * does, so this only ever touches the bare digits — whatever parentheses,
 * "difficulty"/"сложность", or trailing words surround them are left exactly
 * as written:
 *  - "Strength Roll (11)" / english, right after the word that names the roll
 *  - "Бросок Реакции на Силу (11)" / russian always names the roll first, but
 *    the trait sits between "Бросок" and the parens, and "бросок" declines
 *    ("в броске", "броском", …), dropping the fleeting vowel it has in this
 *    nominative spelling
 *  - "Instinct (16) roll" / a handful of english entries put the number first
 *  - "Difficulty 16", "Difficulty of 15", "(Difficulty 16 for Commander
 *    Kaine)", "Сложность 20", "(Сложность 12)" / named directly, with no roll
 *    word at all
 *  - "Roll 17 to hang on", "бросок Силы 17, чтобы удержаться" / no
 *    parentheses either, told apart from the book's other bare numbers near
 *    "Roll"/"Бросок" by the purpose clause that follows a DC and nothing else
 * Countdown parens (matched above, and never reached here since they consume
 * the keyword first) are the one parenthesized number that never scales. */
const CHECK_DC_ROLL_KEYWORD_RE = /(?<!\p{L})(?:Roll(?!\p{L})|Брос(?:ок(?!\p{L})|к\p{L}*))/giu;
const CHECK_DC_BARE_PAREN_RE = /\((\d+)\)/;
const CHECK_DC_STOP_RE = /[.!?\n]/;
const CHECK_DC_SCAN_CHARS = 60;
/* "Instinct (16) roll" / "Знание (12) бросок" never actually happens in
 * Russian — the trait always follows "бросок" there — but the reverse does in
 * English, often enough to be worth its own pass. */
const CHECK_DC_NUMBER_BEFORE_ROLL_RE = /\((\d+)\)\s*roll\b/gi;
/* "Difficulty 16 for Commander Kaine", "difficulty 18 throw", "Difficulty of
 * 15", "Сложность до 19" name a DC directly. "of"/"to"/"до" is the one word
 * allowed between the keyword and the number — enough to skip "Difficulty of
 * 15" and "bump the Difficulty to 19" without also matching a relative
 * modifier like "Difficulty of the Environment equals" or "reduce their
 * Difficulty by 1", which put a different word (or nothing) there instead. */
const CHECK_DC_DIFFICULTY_RE = /(?:difficulty|сложност\p{L}*)\s+(?:of\s+|to\s+|до\s+)?(\d+)/giu;
/* "…отмечен в общей сложности 3 Стресса" is the Russian idiom for "a total
 * of 3", not a difficulty — "сложност" only reads as the mechanic here when
 * "общей"/"общем" isn't the word right before it. */
const CHECK_DC_TOTAL_IDIOM_RE = /(?<!\p{L})общ\p{L}*\s*$/iu;
/* "a difficulty equal to 5 + the party's total Tab Tokens" scales with game
 * state, not with tier — a number immediately followed by +/- is a formula's
 * base, not a flat DC, so it's left alone. */
const CHECK_DC_FORMULA_RE = /^\s*[+-]/;
/* "group Strength or Agility Roll 17 to hang on" / "бросок Силы или
 * Проворности 17, чтобы удержаться" name a DC with no parentheses at all — but
 * a bare number after "Roll"/"Бросок" is dangerous to match on its own: most
 * of the book's other bare numbers near those words are damage ("roll or take
 * 2d12 damage"), a raw die result ("on a roll of 1"), or a margin ("fail their
 * roll by 3 or more"). The purpose clause that follows a DC — "N to <verb>",
 * "N, чтобы …" — is what tells the two apart, so only that shape counts; a
 * clause like "adding 1 to the Difficulty" is a modifier rather than a DC and
 * is excluded by requiring a verb (not "the"/"a"/"an") right after "to". */
const CHECK_DC_BARE_PURPOSE_RE = /(?<=(?<!\p{L})(?:Roll(?!\p{L})|Брос(?:ок(?!\p{L})|к\p{L}*))[^.!?\n(]{0,30}?)\b(\d+)\b(?=\s*(?:,\s*чтобы(?!\p{L})|to\s+(?!the\b|a\b|an\b)\p{L}))/giu;

function findCheckDCMatches(text) {
  const raw = [];
  CHECK_DC_ROLL_KEYWORD_RE.lastIndex = 0;
  let km;
  while ((km = CHECK_DC_ROLL_KEYWORD_RE.exec(text))) {
    const searchStart = km.index + km[0].length;
    let window = text.slice(searchStart, searchStart + CHECK_DC_SCAN_CHARS);
    const stop = window.search(CHECK_DC_STOP_RE);
    if (stop !== -1) window = window.slice(0, stop);
    const pm = CHECK_DC_BARE_PAREN_RE.exec(window);
    if (!pm) continue;
    const start = searchStart + pm.index + 1; // + 1 to land past the "("
    raw.push({ start, end: start + pm[1].length, value: parseInt(pm[1], 10) });
  }
  CHECK_DC_NUMBER_BEFORE_ROLL_RE.lastIndex = 0;
  let nm;
  while ((nm = CHECK_DC_NUMBER_BEFORE_ROLL_RE.exec(text))) {
    const start = nm.index + 1;
    raw.push({ start, end: start + nm[1].length, value: parseInt(nm[1], 10) });
  }
  CHECK_DC_DIFFICULTY_RE.lastIndex = 0;
  let dm;
  while ((dm = CHECK_DC_DIFFICULTY_RE.exec(text))) {
    const before = text.slice(Math.max(0, dm.index - 12), dm.index);
    if (CHECK_DC_TOTAL_IDIOM_RE.test(before)) continue;
    const start = dm.index + dm[0].length - dm[1].length;
    const after = text.slice(start + dm[1].length, start + dm[1].length + 3);
    if (CHECK_DC_FORMULA_RE.test(after)) continue;
    raw.push({ start, end: start + dm[1].length, value: parseInt(dm[1], 10) });
  }
  CHECK_DC_BARE_PURPOSE_RE.lastIndex = 0;
  let bm;
  while ((bm = CHECK_DC_BARE_PURPOSE_RE.exec(text))) {
    raw.push({ start: bm.index, end: bm.index + bm[0].length, value: parseInt(bm[0], 10) });
  }
  raw.sort((a, b) => a.start - b.start);
  const matches = [];
  for (const m of raw) {
    if (matches.length && matches[matches.length - 1].end > m.start) continue; // same digits, found twice
    matches.push({ ...m, type: 'check-dc', label: text.slice(m.start, m.end) });
  }
  return matches;
}

function hasCheckDC(text) {
  return findCheckDCMatches(text).length > 0;
}

/* A roll counts as damage only when a damage word follows it in the same clause:
 * "3d8 physical damage", "3d8 магического урона". Everything else is left as
 * authored — "summon 2d4+2 Rotted Zombies", "roll 1d4 or choose a trap",
 * "1d3 prisoners". The scan stops at the next roll, so in "1d3+2 guards … doing
 * 1d8 physical damage" only the 1d8 is damage. */
const DAMAGE_WORD_RE = /(damage|уро[нм])/i;
const NEXT_DICE_RE = /\b\d{0,2}d(?:2|3|4|6|8|10|12|20|100)\b/i;
const DAMAGE_SCAN_CHARS = 70;

function isDamageRoll(text, from) {
  let clause = text.slice(from, from + DAMAGE_SCAN_CHARS).split(/[.!?;:]/)[0];
  const nextDice = clause.search(NEXT_DICE_RE);
  if (nextDice !== -1) clause = clause.slice(0, nextDice);
  return DAMAGE_WORD_RE.test(clause);
}

/* A die size next to a die noun names a die instead of calling for a roll:
 * "Demoralized PCs replace their Hope Die with a d8" resizes a die the player
 * already owns, and "you gain a d6 Judgment Die" hands them a new one. Both are
 * prose to read out — there is nothing to roll now — so they are set in bold
 * instead of getting a roll button.
 * Two things override that reading: a roll word between the notation and the
 * noun, or just past it, means the dice do get rolled ("a 1d4 penalty to their
 * Duality Dice rolls"), and an explicit "roll a d8" keeps its button whatever
 * noun follows ("roll a d8 as your disadvantage die"). */
const DIE_NOUN = '(?:^|[^\\p{L}])(?:dic?e|кост(?:ь|и|ью|ей|ями)|кубик(?:ов|ами|[аиове])?)(?![\\p{L}])';
const DIE_NOUN_BEFORE_RE = new RegExp(DIE_NOUN + '[^.!?;:]{0,40}$', 'iu');
const DIE_NOUN_AFTER_RE = new RegExp('^[^.!?;:]{0,25}?' + DIE_NOUN, 'iu');
const DIE_ROLL_WORD_RE = /roll|брос|кид/iu;
const ROLL_VERB_RE = /(?:roll|брос(?:ьте|айте|ай|ь)|кинь(?:те)?)\s+(?:a|an|one|the)?\s*$/iu;
const DIE_NOUN_TAIL_CHARS = 12;

function namesADie(text, start, end) {
  const before = text.slice(0, start);
  if (ROLL_VERB_RE.test(before)) return false;
  const nounBefore = before.match(DIE_NOUN_BEFORE_RE);
  if (nounBefore) {
    return !DIE_ROLL_WORD_RE.test(before.slice(nounBefore.index + nounBefore[0].length));
  }
  const after = text.slice(end, end + 60);
  const nounAfter = after.match(DIE_NOUN_AFTER_RE);
  if (nounAfter) {
    return !DIE_ROLL_WORD_RE.test(after.slice(0, nounAfter[0].length + DIE_NOUN_TAIL_CHARS).split(/[.!?;:]/)[0]);
  }
  return false;
}

function findDiceMatches(text) {
  const matches = [];
  DICE_RE.lastIndex = 0;
  let m;
  while ((m = DICE_RE.exec(text))) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    const sides = parseInt(m[2], 10);
    const mod = m[4] ? (m[3] === '-' ? -1 : 1) * parseInt(m[4], 10) : 0;
    const end = m.index + m[0].length;
    const type = namesADie(text, m.index, end) ? 'die-name' : 'dice';
    matches.push({
      start: m.index, end, type, count, sides, mod, label: m[0],
      isDamage: type === 'dice' && isDamageRoll(text, end),
    });
  }
  return matches;
}

function hasDamageRoll(text) {
  return findDiceMatches(text).some(m => m.isDamage);
}

/* Spending Fear is the GM's cost to pay, and the book sets it in bold wherever
 * it appears in a feature ("you can **spend a Fear** to summon…"), so it is
 * found in the text the same way dice and countdowns are, rather than being
 * marked up in the data. Only Fear — Hope is the players' currency and stays
 * plain. An amount named by a phrase rather than a number ("spend an amount of
 * Fear equal to…") is left alone — the bold would run past the cost. */
const FEAR_AMOUNT_EN = '(?:(?:an?|that|the|\\d+|X|additional|second)\\s+)?';
const FEAR_AMOUNT_RU = '(?:(?:этот|второй|дополнительн\\p{L}+|\\d+|X)\\s+)?';
const FEAR_COST_RE = new RegExp(
  '(?<!\\p{L})(?:spend(?:s|ing)?\\s+' + FEAR_AMOUNT_EN + FEAR_AMOUNT_EN + 'Fear'
  + '|(?:по)?трат(?:ьте|ить|ите|ив|ит|ят|я|ы|ь)\\s+' + FEAR_AMOUNT_RU + 'Страх\\p{L}*'
  + ')(?!\\p{L})',
  'giu',
);

function findFearCostMatches(text) {
  const matches = [];
  FEAR_COST_RE.lastIndex = 0;
  let m;
  while ((m = FEAR_COST_RE.exec(text))) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: 'emphasis', label: m[0] });
  }
  return matches;
}

/* Conditions are the states the rules name — the book sets them in italics
 * every time a feature hands one out or clears one ("become Restrained",
 * "While Restrained, …", "стать Обездвиженными") — so they are found in the
 * text the way dice and the Fear cost are, rather than being marked up in the
 * data. The Russian names decline, so each is matched by its stem, and the
 * "(а)" the translation appends for a feminine reading is taken with it. */
const CONDITION_NAMES = [
  // The three the rules name, then the ones single cards hand out.
  'Hidden', 'Restrained', 'Vulnerable',
  'Blinded', 'Frightened', 'Marked', 'Silenced', 'Demoralized', 'Engulfed', 'Younger', 'Older',
  'Скрыт\\p{L}*', 'Обездвижен\\p{L}*', 'Уязвим\\p{L}*',
  'Ослепл[ёе]нн?\\p{L}*', '(?:На|Ис)пуган\\p{L}*', 'Отмечен\\p{L}*', 'Заглуш[ёе]нн?\\p{L}*',
  'Деморализован\\p{L}*', 'Поглощ[ёе]нн?\\p{L}*', 'Моложе', 'Старше',
];
const CONDITION_RE = new RegExp(
  '(?<!\\p{L})(?:' + CONDITION_NAMES.join('|') + ')(?:\\(а\\))?(?!\\p{L})',
  'gu',
);

/* A condition name in front of another capitalised word is part of a proper
 * name instead — the Hidden Guardian of the standing stones, Скрытый Страж —
 * unless what follows is whoever the condition landed on, which the Russian
 * text capitalises ("Деморализованных Игроков"). */
const CONDITION_BEARERS = 'PCs?|Игрок\\p{L}*|Персонаж\\p{L}*|Существ\\p{L}*';
const PROPER_NAME_AFTER_RE = new RegExp('^\\s(?!(?:' + CONDITION_BEARERS + ')(?!\\p{L}))\\p{Lu}', 'u');
const SENTENCE_END_CHARS = '.!?:•';

/* "Hidden" is the one condition that is also an everyday word, and where the
 * data uses it as one it opens the sentence ("Hidden about are 1 Crimson Cap",
 * "Hidden is a Fey Cat"). The condition never does: it is always applied to
 * someone named earlier in the sentence. */
const SENTENCE_START_EXCLUDED = new Set(['Hidden']);

function isSentenceStart(text, index) {
  const before = text.slice(0, index).trimEnd();
  return !before || SENTENCE_END_CHARS.includes(before[before.length - 1]);
}

function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Catalogue item names named outright in a feature's prose (not just a bullet
 * head) become links too, e.g. "Gain a Minor Health Potion". Longest names are
 * tried first (see setItemCatalog) and a unicode-aware boundary check keeps a
 * Cyrillic name from matching as a substring of a longer word. */
function findItemMatches(text) {
  const matches = [];
  if (!state.itemNames || !state.itemNames.length) return matches;
  const used = new Array(text.length).fill(false);
  for (const { name, id } of state.itemNames) {
    if (!name) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu');
    let m;
    while ((m = re.exec(text))) {
      const start = m.index, end = start + m[0].length;
      let overlap = false;
      for (let i = start; i < end; i++) if (used[i]) { overlap = true; break; }
      if (!overlap) {
        matches.push({ start, end, type: 'item', id, label: m[0] });
        for (let i = start; i < end; i++) used[i] = true;
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return matches;
}

function findConditionMatches(text) {
  const matches = [];
  CONDITION_RE.lastIndex = 0;
  let m;
  while ((m = CONDITION_RE.exec(text))) {
    const end = m.index + m[0].length;
    if (PROPER_NAME_AFTER_RE.test(text.slice(end, end + 14))) continue;
    if (SENTENCE_START_EXCLUDED.has(m[0]) && isSentenceStart(text, m.index)) continue;
    matches.push({ start: m.index, end, type: 'condition', label: m[0] });
  }
  return matches;
}

/* Text the data sets in bold itself: the label a bullet opens with, and any
 * other phrase the printed card emphasises. Rendered around the spans below, so
 * a roll inside bold text still gets its button. */
const BOLD_RE = /\*\*([\s\S]+?)\*\*/g;

/** `retier` is `{ from, to, atlas }` (see retierFor) while the card is being read
 * at another tier, or null at the environment's own tier. Only damage rolls and check DCs follow
 * it; countdowns and every other roll in the text are left exactly as written. */
function renderRichText(container, text, retier) {
  container.textContent = '';
  let lastIndex = 0;
  BOLD_RE.lastIndex = 0;
  let bold;
  while ((bold = BOLD_RE.exec(text))) {
    if (bold.index > lastIndex) renderSpans(container, text.slice(lastIndex, bold.index), retier);
    const strong = document.createElement('strong');
    renderSpans(strong, bold[1], retier);
    container.appendChild(strong);
    lastIndex = bold.index + bold[0].length;
  }
  renderSpans(container, text.slice(lastIndex), retier);
}

/** Everything the app finds in the text itself — rolls, countdowns, die names,
 * the cost of a Fear, the conditions — turned into buttons, bold and italics. */
function renderSpans(container, text, retier) {
  const matches = [
    ...findDiceMatches(text), ...findCountdownMatches(text), ...findCheckDCMatches(text),
    ...findFearCostMatches(text), ...findConditionMatches(text), ...findItemMatches(text),
  ].sort((a, b) => a.start - b.start);

  let lastIndex = 0;
  for (const match of matches) {
    if (match.start < lastIndex) continue; // skip overlapping match
    if (match.start > lastIndex) container.appendChild(document.createTextNode(text.slice(lastIndex, match.start)));
    if (match.type === 'dice') {
      const scaled = retier && match.isDamage ? retierDamage(retier.from, retier.to, match, retier.atlas) : null;
      container.appendChild(scaled && scaled.changed
        ? makeDiceButton(scaled.count, scaled.sides, scaled.mod, formatDamage(scaled), match.label)
        : makeDiceButton(match.count, match.sides, match.mod, match.label));
    } else if (match.type === 'die-name' || match.type === 'emphasis') {
      const strong = document.createElement('strong');
      strong.textContent = match.label;
      container.appendChild(strong);
    } else if (match.type === 'condition') {
      const em = document.createElement('em');
      em.textContent = match.label;
      container.appendChild(em);
    } else if (match.type === 'item') {
      container.appendChild(makeItemButton(match.id, match.label));
    } else if (match.type === 'check-dc') {
      const scaled = retier ? retierValue(match.value, retier.from, retier.to, retier.atlas) : match.value;
      container.appendChild(document.createTextNode(String(scaled)));
    } else {
      container.appendChild(makeCountdownButton(match.value, match.label));
    }
    lastIndex = match.end;
  }
  if (lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
}

const BULLET_LINE_RE = /^[-•]\s+/;
const NUMBERED_LINE_RE = /^\d+\.\s+/;

/** Splits feature/raw text into paragraphs and "- "/"• "-prefixed bullet lists,
 * rendering dice/countdown spans within each line via renderRichText. */
function renderFeatureBody(container, text, retier) {
  container.innerHTML = '';
  const lines = text.split('\n');
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const p = document.createElement('p');
    renderRichText(p, para.join(' '), retier);
    container.appendChild(p);
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const listRe = BULLET_LINE_RE.test(line) ? BULLET_LINE_RE : NUMBERED_LINE_RE.test(line) ? NUMBERED_LINE_RE : null;
    if (listRe) {
      flushPara();
      const list = document.createElement(listRe === NUMBERED_LINE_RE ? 'ol' : 'ul');
      list.className = 'feature-bullets';
      while (i < lines.length && listRe.test(lines[i].trim())) {
        const li = document.createElement('li');
        renderBulletBody(li, lines[i].trim().replace(listRe, ''), retier);
        list.appendChild(li);
        i++;
      }
      container.appendChild(list);
      continue;
    }
    if (line) para.push(line);
    i++;
  }
  flushPara();
}

/* The harvesting features list what the party can find as bare bullets, and each
 * of those names an entry in the loot catalogue. The name has to stand alone —
 * either as the whole bullet, or as the label before a colon or dash — so a
 * bullet that merely mentions an item in passing stays prose. */
const BULLET_LABEL_RE = /^([^:—–]+?)\s*([:—–])\s*(.+)$/;
/* The same label, set in bold by the data. Tried first so the asterisks never
 * reach the item lookup or the button's text. */
const BOLD_LABEL_RE = /^\*\*([^*]+?)\s*([:—–])\*\*\s*([\s\S]+)$/;

function renderBulletBody(li, text, retier) {
  let id = itemIdFor(text);
  let label = text;
  let sep = '';
  let rest = '';
  if (!id) {
    const m = text.match(BOLD_LABEL_RE) || text.match(BULLET_LABEL_RE);
    const headId = m && itemIdFor(m[1]);
    if (headId) { id = headId; label = m[1]; sep = m[2]; rest = m[3]; }
  }
  if (!id) { renderRichText(li, text, retier); return; }
  li.className = 'has-item';
  li.appendChild(makeItemButton(id, label));
  if (rest) {
    li.appendChild(document.createTextNode(` ${sep} `));
    const tail = document.createElement('span');
    renderRichText(tail, rest, retier);
    li.appendChild(tail);
  }
}

function makeItemButton(id, label) {
  const btn = document.createElement('button');
  btn.className = 'item-btn';
  btn.type = 'button';
  btn.dataset.tip = t('open_item');
  btn.dataset.itemId = id;
  btn.innerHTML = `${itemIconSVG()}<span>${escapeHtml(label)}</span>`;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    openItemDetail(id);
  });
  return btn;
}

function itemIconSVG() {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M9.5 3v5.4L5.4 16.6A2.6 2.6 0 0 0 7.7 20.5h8.6a2.6 2.6 0 0 0 2.3-3.9L14.5 8.4V3" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.4 3h7.2M7.6 13.4h8.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function makeDiceButton(count, sides, mod, label, originalLabel) {
  const btn = document.createElement('button');
  btn.className = originalLabel ? 'dice-btn dice-btn-retiered' : 'dice-btn';
  btn.type = 'button';
  if (originalLabel) btn.dataset.tip = t('retier_original').replace('{v}', originalLabel);
  btn.innerHTML = `${diceIconSVG()}<span>${label}</span>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    rollDice(btn, count, sides, mod, label);
  });
  return btn;
}

function diceIconSVG() {
  return `<svg viewBox="0 0 24 24" fill="none"><polygon points="12,2 21,8 21,16 12,22 3,16 3,8" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

/* ---------------- countdown tracker ---------------- */

function makeCountdownButton(value, label) {
  const btn = document.createElement('button');
  btn.className = 'countdown-btn';
  btn.type = 'button';
  btn.dataset.count = String(value);
  btn.innerHTML = `${countdownIconSVG()}<span>${escapeHtml(label)}</span>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openCountdownOverlay(btn);
  });
  return btn;
}

function countdownIconSVG() {
  return `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
}

function openCountdownOverlay(btn) {
  if (btn._countdownOverlay && document.body.contains(btn._countdownOverlay)) {
    btn._countdownOverlay.querySelector('.countdown-overlay-close').focus();
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'countdown-overlay';
  panel.innerHTML = `
    <button type="button" class="icon-btn icon-btn--reach countdown-overlay-close" aria-label="${t('close')}">${ICON_CLOSE}</button>
    <div class="countdown-overlay-value">${btn.dataset.count}</div>
    <div class="countdown-overlay-actions">
      <button type="button" class="icon-btn icon-btn--circle countdown-overlay-btn" data-op="dec" aria-label="-">&minus;</button>
      <button type="button" class="icon-btn icon-btn--circle countdown-overlay-btn" data-op="inc" aria-label="+">+</button>
    </div>`;
  let stack = document.getElementById('countdown-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'countdown-stack';
    stack.className = 'countdown-stack';
    document.body.appendChild(stack);
  }
  stack.appendChild(panel);
  btn._countdownOverlay = panel;
  panel._btn = btn;

  const valueEl = panel.querySelector('.countdown-overlay-value');
  panel.querySelector('[data-op="inc"]').addEventListener('click', () => {
    btn.dataset.count = String(Number(btn.dataset.count) + 1);
    valueEl.textContent = btn.dataset.count;
  });
  panel.querySelector('[data-op="dec"]').addEventListener('click', () => {
    btn.dataset.count = String(Math.max(0, Number(btn.dataset.count) - 1));
    valueEl.textContent = btn.dataset.count;
  });

  function closePanel() {
    panel.remove();
    btn._countdownOverlay = null;
    const modalOverlay = btn.closest('.modal-overlay');
    if (modalOverlay && modalOverlay._countdownOverlays) {
      modalOverlay._countdownOverlays = modalOverlay._countdownOverlays.filter(p => p !== panel);
    }
  }
  panel.querySelector('.countdown-overlay-close').addEventListener('click', closePanel);

  const modalOverlay = btn.closest('.modal-overlay');
  if (modalOverlay) {
    if (!modalOverlay._countdownOverlays) modalOverlay._countdownOverlays = [];
    modalOverlay._countdownOverlays.push(panel);
  }
}

function rollDice(btn, count, sides, mod, label) {
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  showDiceResultPop(btn, label, rolls, mod, total);
}

let activeDicePop = null;

function dismissDiceResultPop() {
  if (!activeDicePop) return;
  clearTimeout(activeDicePop._timer);
  activeDicePop.remove();
  activeDicePop = null;
}

function showDiceResultPop(btn, label, rolls, mod, total) {
  /* Only one result at a time — a lingering wider bubble would show its edges
     behind a narrower new one rolled at the same spot. */
  dismissDiceResultPop();
  const rect = btn.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'dice-result-pop';
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 110)) + 'px';
  pop.style.top = (rect.bottom + 8) + 'px';
  pop.innerHTML = `<div class="notation">${label}</div><div class="value">${total}</div>`;
  if (rolls.length > 1 || mod) {
    const bd = document.createElement('div');
    bd.className = 'breakdown';
    let expr = rolls.join(' + ');
    if (mod) expr += (mod < 0 ? ' − ' : ' + ') + Math.abs(mod);
    bd.textContent = `${expr} = ${total}`;
    pop.appendChild(bd);
  }
  document.body.appendChild(pop);
  activeDicePop = pop;
  pop.addEventListener('click', dismissDiceResultPop);
  pop._timer = setTimeout(dismissDiceResultPop, 2600);
}

/* ---------------- utils ---------------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

init();
