/* ============================================================
   Daggerheart Atlas — app.js
   Vanilla JS, no build step. All state persisted to localStorage
   except the bundled builtin environment data (data/environments.json)
   which stays read-only on disk; user edits layer on top of it.
   ============================================================ */

const LS_KEYS = {
  lang: 'dhcodex_lang',
  customEnvs: 'dhcodex_custom_envs',
  hiddenBuiltin: 'dhcodex_hidden_builtin',
  lists: 'dhcodex_lists',
  envLists: 'dhcodex_env_lists',
  storageNoticeDismissed: 'dhcodex_storage_notice_dismissed',
  journeyRegions: 'dhcodex_journey_regions',
  journeySanctuaries: 'dhcodex_journey_sanctuaries',
};

const BIOMES = ['underground', 'aquatic', 'wetland', 'grassland', 'tropical', 'forest', 'drylands', 'rolling', 'mountain', 'frozen', 'badlands', 'settlement', 'universal'];
const TYPES = ['traversal', 'social', 'event', 'exploration'];

/* Shape of data/journey.json, so the generator page can be reached before — or
 * instead of — that file landing, and read empty tables rather than throwing. */
const JOURNEY_EMPTY = { habitat: [], encounter: [], terrain: [], rumors: [], sanctuary: [], nameElements: [] };

function normalizeLang(v) { return v === 'en' ? 'en' : 'ru'; }

/* The language is written through persist(), so what comes back out is JSON —
 * `"en"`, quote marks and all, which never equals `en`. Parsing it here keeps
 * the write side symmetric with every other key; the fallback covers a value
 * left in storage by a build that wrote the bare string. */
function storedLang() {
  const raw = localStorage.getItem(LS_KEYS.lang);
  if (!raw) return 'ru';
  try { return normalizeLang(JSON.parse(raw)); }
  catch { return normalizeLang(raw); }
}

const state = {
  lang: storedLang(),
  i18n: null,
  builtinEnvs: [],
  regions: [],
  itemCatalog: { items: {}, itemUrl: '', imageUrl: '' },
  itemIndex: new Map(),
  adversaryCatalog: new Map(),
  journey: JOURNEY_EMPTY,
  journeyRegions: JSON.parse(localStorage.getItem(LS_KEYS.journeyRegions) || '[]'),
  journeySanctuaries: JSON.parse(localStorage.getItem(LS_KEYS.journeySanctuaries) || '[]'),
  /* The roll on screen that has not been kept yet. Deliberately not persisted:
   * an unsaved roll is a suggestion the GM is still looking at, and it should
   * not outlive the visit the way a saved one does. */
  journeyDraft: { region: null, sanctuary: null },
  customEnvs: JSON.parse(localStorage.getItem(LS_KEYS.customEnvs) || '[]'),
  hiddenBuiltin: JSON.parse(localStorage.getItem(LS_KEYS.hiddenBuiltin) || '[]'),
  lists: JSON.parse(localStorage.getItem(LS_KEYS.lists) || '[]'),
  envLists: JSON.parse(localStorage.getItem(LS_KEYS.envLists) || '{}'),
  storageNoticeDismissed: localStorage.getItem(LS_KEYS.storageNoticeDismissed) === '1',
  filters: { search: '', tiers: new Set(), types: new Set(), sources: new Set(), biomes: new Set(), regionOnly: false },
  // Whether the phone-width filter disclosure is open. Purely presentational,
  // so it lives here rather than in localStorage and survives a re-render only.
  filtersOpen: false,
  route: parseRoute(),
};

/* An open environment card is a "/env/<id>" suffix on whichever route is
 * behind it, rather than a route of its own: the card is an overlay, and the
 * catalog or list underneath it keeps its own address. That gives the card a
 * link worth sharing and, on a phone, makes the Back gesture close the sheet
 * instead of leaving the site. */
function parseRoute() {
  let hash = location.hash;
  let env = null;
  const em = hash.match(/\/env\/([^/]+)$/);
  if (em) { env = decodeURIComponent(em[1]); hash = hash.slice(0, em.index) || '#'; }
  const m = hash.match(/^#\/lists\/(.+)$/);
  if (m) return { name: 'list', id: decodeURIComponent(m[1]), env };
  if (hash === '#/lists') return { name: 'lists', env };
  if (hash === '#/journey') return { name: 'journey', env };
  return { name: 'catalog', env };
}

/** The address of the route behind the card, without any card on it. */
function baseHash(route = state.route) {
  if (route.name === 'list') return '#/lists/' + encodeURIComponent(route.id);
  if (route.name === 'lists') return '#/lists';
  if (route.name === 'journey') return '#/journey';
  return '';
}

function envHash(envId, route = state.route) {
  return (baseHash(route) || '#') + '/env/' + encodeURIComponent(envId);
}

function sameBase(a, b) { return a.name === b.name && a.id === b.id; }

function navigate(hash) {
  if (location.hash === hash) { state.route = parseRoute(); render(); }
  else { location.hash = hash; }
}

/* Opening or closing a card only moves the overlay. Re-rendering the page
 * underneath would rebuild the grid and destroy the button the card was opened
 * from, which is the element focus has to return to when it closes. */
window.addEventListener('hashchange', () => {
  const next = parseRoute();
  const onlyCardChanged = sameBase(next, state.route);
  state.route = next;
  if (!next.env) cardEntryPushed = false;
  if (onlyCardChanged) { syncDetail(); document.title = routeTitle(); }
  else render();
});

function persist(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function t(key) {
  const dict = state.i18n[state.lang] || {};
  return dict[key] || key;
}

function allEnvs() {
  const builtin = state.builtinEnvs.filter(e => !state.hiddenBuiltin.includes(e.id));
  return [...builtin, ...state.customEnvs];
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
/** Region members that actually exist right now (a hidden or removed builtin
 * environment drops out of the button row rather than rendering a dead button). */
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
 * instead ("Adversary Duelist’s Difficulty") still says something. */
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

/* A potential_adversaries entry is plain text — "Beasts (Bear, Dire Wolf,
 * Glass Snake)", a named group followed by its members in parentheses — or,
 * with no parentheses, a single adversary named by itself (e.g. "Sellsword").
 * Parsing that text, rather than hand-listing monster names per environment,
 * is what lets the encounter builder below stay generic: it reads the same
 * data the "Potential Adversaries" line already renders from. */
function parsePotentialAdversaryEntry(entry) {
  const text = String(entry || '').trim();
  const match = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!match) return { label: text, members: text ? [text] : [], isGroup: false };
  return { label: match[1].trim(), members: match[2].split(',').map(s => s.trim()).filter(Boolean), isGroup: true };
}

/* A handful of Potential Adversaries entries don't name an adversary at all:
 * "Any" (the GM picks whatever fits) or a citation like
 * 'ghostly versions of other adversaries (see "Ghostly Form")' pointing at a
 * feature instead of naming a creature. Neither is something FreshCutGrass's
 * bestiary can look up, so both are filtered out here rather than becoming a
 * broken link or a fake entry in the whole-environment payload. Checked only
 * on the section's own text ("see …", quote marks, the bare word "any"), so
 * it holds for any environment's data rather than one hand-picked id. */
function looksLikeAdversaryName(name) {
  const text = String(name || '').trim();
  if (!text) return false;
  if (/^any$/i.test(text)) return false;
  if (/[“”"]/.test(text)) return false;
  if (/\bsee\b/i.test(text)) return false;
  return true;
}

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
};

/** The FreshCutGrass-recognizable name for one member of a Potential
 * Adversaries group — see ADVERSARY_GROUP_MEMBER_ALIASES and
 * ADVERSARY_GROUP_NAME_PREFIXES above. */
function fullAdversaryName(groupLabel, memberName) {
  const alias = ADVERSARY_GROUP_MEMBER_ALIASES[groupLabel]?.[memberName];
  if (alias) return alias;
  const prefix = ADVERSARY_GROUP_NAME_PREFIXES[groupLabel];
  return prefix ? `${prefix} ${memberName}` : memberName;
}

/** Every adversary named anywhere in an environment's Potential Adversaries
 * text, in English — FreshCutGrass has no notion of the site's other
 * languages — deduplicated but kept in the order they first appear. */
function envAdversaryNames(env) {
  const entries = env.potential_adversaries?.en || [];
  const seen = new Set();
  entries.forEach(entry => {
    const parsed = parsePotentialAdversaryEntry(entry);
    parsed.members.filter(looksLikeAdversaryName).forEach(name => {
      seen.add(parsed.isGroup ? fullAdversaryName(parsed.label, name) : name);
    });
  });
  return [...seen];
}

/** UTF-16 JS string -> Unicode-safe base64. atob/btoa only round-trip Latin1,
 * so the string is routed through its UTF-8 bytes first — an accented or
 * non-Latin encounter/adversary name added later still encodes correctly
 * instead of throwing. */
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

/** Builds a FreshCutGrass encounter URL at runtime from an encounter name and
 * a flat list of adversary names. Nothing here is specific to Abandoned Grove
 * or even to environments — the same call works for a single adversary, a
 * named group, or an entire environment's roster, all through one payload
 * shape and one encoder. */
function buildFreshCutGrassEncounterUrl(encounterName, adversaryNames) {
  const payload = {
    n: encounterName,
    d: adversaryNames.map(name => ({
      n: name,
      a: '',
      q: 1,
      u: 0,
      i: [{ n: null }],
    })),
  };
  const base64 = utf8ToBase64(JSON.stringify(payload));
  return `https://freshcutgrass.app/encounter?data=${encodeURIComponent(base64)}`;
}

/** The whole-environment encounter URL for an environment, or null for one
 * whose Potential Adversaries names nothing buildFreshCutGrassEncounterUrl()
 * could use — e.g. "Any". Every environment is eligible, current or future:
 * nothing here reads env.source or any other opt-in list. */
function envEncounterUrl(env) {
  const names = envAdversaryNames(env);
  return names.length ? buildFreshCutGrassEncounterUrl(env.name?.en || envName(env), names) : null;
}

/** One inline link for a name in "Potential Adversaries" — a group such as
 * "Beasts" or a single adversary — that opens that name's own FreshCutGrass
 * encounter. An ordinary link, not a button: it reads as part of the sentence,
 * the same as any other link on the page. The visible text stays in the
 * page's own language; the encounter itself is always built from the English
 * counterpart, the same way envAdversaryNames() only ever reads .en — a name a
 * third-party service has to recognize is not something the UI language
 * should get to change. The tooltip names this specific link's target rather
 * than saying "this encounter", so hovering "Bear" and hovering "Beasts" don't
 * read the same. */
function potentialAdversaryLinkHtml(visibleLabel, encounterName, adversaryNames) {
  const url = buildFreshCutGrassEncounterUrl(encounterName, adversaryNames);
  const tip = t('open_encounter_builder_tip').replace('{n}', visibleLabel);
  return `<a class="adversary-encounter-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer"
            data-tip="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}">${escapeHtml(visibleLabel)}</a>`;
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
 * not worth a link, whole or half. */
function potentialAdversaryEntryHtml(localizedText, englishText) {
  const shown = parsePotentialAdversaryEntry(localizedText);
  const canonical = parsePotentialAdversaryEntry(englishText);
  const canonicalNames = canonical.isGroup ? [canonical.label, ...canonical.members] : [canonical.label];
  if (!canonicalNames.every(looksLikeAdversaryName)) return escapeHtml(localizedText);
  if (!shown.isGroup) {
    return potentialAdversaryLinkHtml(shown.label, canonical.label, [canonical.label]);
  }
  const fullMemberNames = canonical.members.map(name => fullAdversaryName(canonical.label, name));
  const groupLink = potentialAdversaryLinkHtml(shown.label, canonical.label, fullMemberNames);
  const memberLinks = shown.members.map((memberLabel, i) => {
    const englishName = fullMemberNames[i] || memberLabel;
    return potentialAdversaryLinkHtml(memberLabel, englishName, [englishName]);
  }).join(', ');
  return `${groupLink} (${memberLinks})`;
}

/* ---------------- init ---------------- */

/* Cache buster for the JSON under data/. index.html versions the stylesheet and
   this script the same way; the data files are fetched from here instead, so
   bump this whenever anything in data/ changes or browsers serve stale copies. */
const DATA_VERSION = 66;

function getJSON(path) {
  return fetch(path).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${path}`);
    return r.json();
  });
}

/* The dictionary comes first and alone: it is 8KB against the catalogue's 1.4MB,
 * and every string on the loading screen is in it. Once it lands the header and
 * a skeleton grid go up immediately, so the first paint is the shape of the page
 * rather than an empty near-black rectangle. */
async function init() {
  const v = `?v=${DATA_VERSION}`;
  try {
    state.i18n = await getJSON(`data/i18n.json${v}`);
  } catch (err) {
    renderFatalError(err);
    return;
  }
  renderHeader();
  renderFooter();
  mountToTop();
  renderLoadingState();
  try {
    const [envs, regions, items, journey, adversaries] = await Promise.all([
      getJSON(`data/environments.json${v}`),
      getJSON(`data/regions.json${v}`).catch(() => ({ regions: [] })),
      getJSON(`data/items.json${v}`).catch(() => ({ items: {}, aliases: {} })),
      getJSON(`data/journey.json${v}`).catch(() => JOURNEY_EMPTY),
      getJSON(`data/adversaries.json${v}`).catch(() => ({ adversaries: [] })),
    ]);
    state.builtinEnvs = envs.environments;
    state.regions = regions.regions || [];
    setItemCatalog(items);
    state.journey = { ...JOURNEY_EMPTY, ...journey };
    setAdversaryCatalog(adversaries);
  } catch (err) {
    renderLoadError(err);
    return;
  }
  render();
}

function renderLoadingState() {
  document.getElementById('toolbar').innerHTML = `
    <div class="skeleton-toolbar" aria-hidden="true">
      <div class="sk sk-field wide"></div>
      <div class="sk sk-field"></div>
      <div class="sk sk-field"></div>
      <div class="sk sk-field"></div>
    </div>`;
  document.getElementById('result-count').textContent = t('loading');
  document.getElementById('grid-wrap').innerHTML =
    Array.from({ length: 6 }, () => '<div class="sk sk-card" aria-hidden="true"></div>').join('');
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
  document.getElementById('retry-load').addEventListener('click', e => {
    e.currentTarget.dataset.loading = 'true';
    location.reload();
  });
}

/* The dictionary itself failed, so there are no strings to say so with. */
function renderFatalError(err) {
  console.error('[atlas] i18n load failed', err);
  document.getElementById('grid-wrap').innerHTML = emptyStateHtml({
    icon: ICON_ALERT,
    title: 'Не удалось загрузить атлас. / The atlas could not be loaded.',
    hint: 'Проверьте соединение и обновите страницу. / Check your connection and reload.',
    error: true,
  });
}

/* ---------------- shared UI primitives ---------------- */

const ICON_ALERT = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 22 20H2L12 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="m8 12.2 2.7 2.6L16 9.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CHEVRON_UP = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 15 6-6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_SEARCH_EMPTY = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="m15.5 15.5 4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 10.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_BOOKMARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 6.5h15M9.8 6.5V4.9a1 1 0 0 1 1-1h2.4a1 1 0 0 1 1 1v1.6M6.8 6.5l.8 12.3a1 1 0 0 0 1 .9h6.8a1 1 0 0 0 1-.9l.8-12.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.4 10.2v6M13.6 10.2v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_COMPASS =`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="m15 9-2.1 4.9L8 16l2.1-4.9L15 9z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const ICON_HEX = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.6 20.1 7v10L12 21.4 3.9 17V7L12 2.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const ICON_REROLL = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

function showToast(message, kind = 'success') {
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
  toast.innerHTML = `${kind === 'error' ? ICON_ALERT : ICON_CHECK}<span></span>`;
  toast.querySelector('span').textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
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

function showTip(target) {
  const text = target.dataset.tip;
  if (!text) return;
  const el = tipNode();
  el.textContent = text;
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
  const target = e.target.closest?.('[data-tip]');
  if (!target || target === tipTarget) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(target), TIP_DELAY_MS);
});
document.addEventListener('pointerout', e => {
  if (e.target.closest?.('[data-tip]')) hideTip();
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
  const target = e.target.closest?.('[data-tip]');
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
  return float ? [...focusableIn(overlay), ...focusableIn(float)] : focusableIn(overlay);
}

function trapHolds(overlay, node) {
  const float = document.getElementById('lang-float');
  return overlay.contains(node) || !!(float && float.contains(node));
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
  let el = document.getElementById('lang-float');
  if (openDetailId === null || blocked) {
    el?.remove();
    document.body.classList.remove('has-lang-float');
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
  const scroller = document.getElementById('detail-modal')?.closest('.modal-overlay');
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
  renderHeader();
  if (state.route.name === 'lists') {
    renderListsHome();
  } else if (state.route.name === 'journey') {
    renderJourneyPage();
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
    state.route = parseRoute();
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
  if (state.route.name === 'catalog') return t('app_title');
  if (state.route.name === 'journey') return `${t('journey_title')} — ${t('app_title')}`;
  if (state.route.name === 'list') {
    const list = state.lists.find(l => l.id === state.route.id);
    if (list) return `${list.name} — ${t('app_title')}`;
  }
  return `${t('lists_title')} — ${t('app_title')}`;
}

function renderHeader() {
  const el = document.getElementById('header');
  /* Named routes, not "anything but the catalog" — with a third section that
   * test marked Lists as the current page while the generators were open. */
  const onLists = state.route.name === 'lists' || state.route.name === 'list';
  const onJourney = state.route.name === 'journey';
  el.innerHTML = `
    <a class="skip-link" href="#grid-wrap">${t('skip_to_content')}</a>
    <div class="header-inner">
      <div class="brand">
        <img class="brand-mark" src="img/brand-logo.png?v=2" alt="" aria-hidden="true">
        <span class="brand-text">
          <h1><button type="button" id="brand-home">${t('app_title')}</button></h1>
          <p>${t('app_subtitle')}</p>
        </span>
      </div>
      <div class="header-actions">
        <div class="lang-switch">${langButtonsHtml()}</div>
        <nav class="header-nav" aria-label="${t('main_nav')}">
          <button type="button" class="btn nav-btn ${onLists ? 'active' : ''}" id="btn-lists"
                  aria-label="${t('nav_lists')}"
                  ${onLists ? 'aria-current="page"' : ''}>${ICON_BOOKMARK}<span>${t('nav_lists')}</span></button>
          <button type="button" class="btn nav-btn ${onJourney ? 'active' : ''}" id="btn-journey"
                  aria-label="${t('nav_journey')}"
                  ${onJourney ? 'aria-current="page"' : ''}>${ICON_COMPASS}<span>${t('nav_journey')}</span></button>
        </nav>
      </div>
    </div>`;
  bindLangSwitch(el);
  document.getElementById('btn-lists').addEventListener('click', () => navigate('#/lists'));
  document.getElementById('btn-journey').addEventListener('click', () => navigate('#/journey'));
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
          <button type="button" class="search-clear-btn" id="f-search-clear" aria-label="${t('clear_filters')}" style="${state.filters.search ? '' : 'display:none;'}">×</button>
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
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    searchInput.focus();
    renderGrid();
  });
  el.querySelectorAll('#f-tiers .rank-icon').forEach(btn => btn.addEventListener('click', () => {
    const tier = Number(btn.dataset.tier);
    toggleSetValue(state.filters.tiers, tier);
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

/* Shared behavior behind the Type, Biome and Source dropdowns: instant
 * checkbox filtering that never auto-closes on its own, closing only on an
 * explicit exit (trigger re-click, outside click, Escape, focus leaving the
 * field, another dropdown opening, or the toolbar being rebuilt).
 *
 * `onToggle(checkbox)` applies one changed checkbox to state.filters;
 * `updateLabel(trigger)` recomputes that trigger's "Label (n)" text from
 * state.filters afterwards. Both run before renderGrid() so the trigger label
 * and the grid never fall out of sync with each other. */
function bindMultiSelectField({ field, trigger, panel, onToggle, updateLabel }) {
  const controller = { close, isOpen: () => !panel.hidden };

  function open() {
    closeActiveMultiSelect();
    panel.hidden = false;
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
    updateLabel(trigger);
    renderGrid();
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

// Searching any term in a group also searches every other term in the group,
// so "магазин" finds Магическая Лавка and "tavern" finds Магический город.
// Both languages sit in one group because the haystack holds EN and RU text.
// Terms are stems matched at word start, which covers Russian inflections
// (лавк → лавка, лавке). Keep them long and unambiguous: a stem also fires
// inside longer words, so "порт" would drag in Город Порталов and "бар" every
// барьер. Verify a new term against the data before adding it.
//
// A group holds names for one and the same place, nothing looser. Everything a
// wider reading used to sweep in has been taken back out:
// - the person standing in the place ("торгов"/"merchant" matched 21 of 188
//   environments, nearly all of them a feast or a casino that merely lists a
//   Merchant among its adversaries; likewise innkeeper, bartender, barkeep),
// - the thing kept inside it ("книг"/"book" put Лаборатория, Магическая буря
//   and Оживлённый рынок under "библиотека"; "алтар"/"altar" put Туманная
//   Пустошь under "храм"),
// - a neighbouring but different place — a market is not a shop, a cave is not
//   a dungeon, a crypt is not a graveyard, so those now sit in groups of their
//   own,
// - a word the data only ever uses in another sense ("store" appears solely as
//   the verb, "store that roll"),
// - a synonym the data never uses at all, which only lengthens the table.
const SEARCH_ALIASES = [
  ['магазин', 'лавк', 'shop'],
  ['рынок', 'базар', 'market'],
  ['таверн', 'трактир', 'кабак', 'tavern'],
  ['кладбищ', 'погост', 'graveyard', 'cemetery'],
  ['склеп', 'гробниц', 'tomb', 'crypt'],
  ['храм', 'церк', 'temple', 'church'],
  ['пещер', 'cave', 'cavern'],
  ['библиотек', 'library'],
];

// Below this length a query is too generic to expand — "ба" would otherwise
// pull in the whole tavern group.
const MIN_ALIAS_QUERY = 3;

const aliasRegexCache = new Map();

function wordStartRegex(term) {
  let re = aliasRegexCache.get(term);
  if (!re) {
    re = new RegExp('(^|[^\\p{L}\\p{N}])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu');
    aliasRegexCache.set(term, re);
  }
  return re;
}

// A query expands only as a whole: it must be a prefix of a group term (user
// typed a stem, "таверн") or start with one (user typed an inflection,
// "таверной"). Multi-word queries stay literal — someone narrowing to
// "магазин товаров" wants fewer results than "магазин", not the whole group.
function aliasTermsFor(query) {
  if (query.length < MIN_ALIAS_QUERY || /\s/.test(query)) return [];
  const terms = new Set();
  for (const group of SEARCH_ALIASES) {
    if (!group.some(term => term.startsWith(query) || query.startsWith(term))) continue;
    for (const term of group) terms.add(term);
  }
  return [...terms];
}

// Literal substring first, so every match that worked before still works; the
// alias pass only ever widens the result set. It runs against a narrower
// haystack than the literal pass: the adversary list is a roster of stock NPCs
// that says nothing about what the place is, so a lone Merchant there must not
// answer for "рынок" — but typing "торговец" outright still finds it literally.
function matchesSearch(hay, aliasHay, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (hay.includes(q)) return true;
  return aliasTermsFor(q).some(term => wordStartRegex(term).test(aliasHay));
}

function envMatchesFilters(env) {
  const f = state.filters;
  if (f.search) {
    const featureText = (env.features || []).flatMap(feat => [
      feat.name?.en, feat.name?.ru, feat.description?.en, feat.description?.ru, feat.prompt?.en, feat.prompt?.ru,
    ]);
    const rawText = env.rawText ? [env.rawText.en, env.rawText.ru] : [];
    const loreText = env.lore ? [env.lore.en, env.lore.ru] : [];
    const adversaries = env.potential_adversaries
      ? [...(env.potential_adversaries.en || []), ...(env.potential_adversaries.ru || [])]
      : [];
    const aliasHay = [
      env.name.en, env.name.ru,
      ...(env.impulses ? [...(env.impulses.en || []), ...(env.impulses.ru || [])] : []),
      ...featureText, ...rawText, ...loreText,
    ].filter(Boolean).join(' ').toLowerCase();
    const hay = adversaries.length
      ? aliasHay + ' ' + adversaries.join(' ').toLowerCase()
      : aliasHay;
    if (!matchesSearch(hay, aliasHay, f.search)) return false;
  }
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
 * rung is alphabetical in whichever language is on screen. */
function sortedFilteredEnvs() {
  const collator = new Intl.Collator(state.lang, { sensitivity: 'base', numeric: true });
  return currentEnvs()
    .filter(envMatchesFilters)
    .sort((a, b) => a.tier - b.tier || collator.compare(envName(a), envName(b)));
}

function renderGrid() {
  const el = document.getElementById('grid-wrap');
  const total = currentEnvs().length;
  const list = sortedFilteredEnvs();

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
    return;
  }

  el.innerHTML = list.map(cardHtml).join('');
  bindGridDelegation(el);
}

/* One listener on the container instead of two per card. With ~190 cards that
 * was ~380 registrations rebuilt on every filter change. */
function bindGridDelegation(el) {
  if (el._delegated) return;
  el._delegated = true;
  el.addEventListener('click', e => {
    const add = e.target.closest('[data-add-to-list]');
    if (add) { e.preventDefault(); openAddToListPopup(add.dataset.addToList); return; }
    const open = e.target.closest('[data-open-env]');
    if (open) { e.preventDefault(); showEnv(open.dataset.openEnv); return; }
    const clear = e.target.closest('[data-clear-filters]');
    if (clear) clearAllFilters();
  });
}

function clearAllFilters() {
  state.filters = { search: '', tiers: new Set(), types: new Set(), sources: new Set(), biomes: new Set(), regionOnly: false };
  renderToolbar();
  renderGrid();
  const search = document.getElementById('f-search');
  if (search) search.focus();
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
    env.builtin ? '' : `<span class="badge custom">${t('custom_badge')}</span>`,
    isTranslated(env) ? '' : `<span class="badge pending">${t('untranslated_badge')}</span>`,
  ].join('');
  // The whole card is still the click target — the stretched ::after on
  // .card-open covers it — but the tab stop and the accessible name now sit on
  // one real button, so the catalog is reachable from the keyboard.
  return `
    <article class="card" data-id="${env.id}">
      <span class="rank-icon rank-icon-sm active card-tier-badge" role="img" aria-label="${t('tier_label')} ${env.tier}" data-tip="${t('tier_label')} ${env.tier}"><span aria-hidden="true">${env.tier}</span></span>
      ${biomeArtHtml(env)}
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-title"><button type="button" class="card-open" data-open-env="${env.id}">${escapeHtml(envName(env))}</button></h3>
          <button
            type="button"
            class="card-add-btn card-add-btn--catalog"
            data-add-to-list="${env.id}"
            aria-label="${escapeAttr(t('add_to_list'))}"
            data-tip="${escapeAttr(t('add_to_list'))}"
            aria-haspopup="dialog"
          >${ICON_BOOKMARK}</button>
        </div>
        ${loreText ? `<p class="card-lore">${escapeHtml(loreText)}</p>` : ''}
        ${impulses.length ? `<div class="card-impulses"><span class="card-impulses-label">${t('impulses_label')}:</span> ${escapeHtml(impulses.join(', '))}</div>` : ''}
        <div class="card-meta">${typeChip}${biomeChips}${regionChip}</div>
        ${badges}
      </div>
    </article>`;
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
];

function renderFooter() {
  const el = document.getElementById('footer');
  const showReset = state.route.name === 'lists';
  // The note carries a {sources} slot rather than a finished sentence, so each
  // language can put the link wherever its own grammar wants it.
  const [before, after = ''] = t('footer_note').split('{sources}');
  el.innerHTML = `
    <span>${before}<button type="button" class="link-btn" id="btn-sources">${t('sources_link')}</button>${after}</span>
    ${showReset ? `<button type="button" class="btn btn-sm btn-ghost" id="btn-reset">${t('reset_data')}</button>` : ''}`;
  document.getElementById('btn-sources').addEventListener('click', openSourcesPopup);
  if (showReset) {
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (confirm(t('reset_confirm'))) {
        localStorage.removeItem(LS_KEYS.customEnvs);
        localStorage.removeItem(LS_KEYS.hiddenBuiltin);
        state.customEnvs = []; state.hiddenBuiltin = [];
        render();
      }
    });
  }
}

/* ---------------- lists ---------------- */

/* An environment that belongs to no list leaves no key behind. An empty array
 * is a membership record that records nothing, and it would sit in storage for
 * good once the list that put it there is gone. Callers persist. */
function setEnvLists(envId, listIds) {
  if (listIds.length) state.envLists[envId] = listIds;
  else delete state.envLists[envId];
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
        <button type="button" class="storage-notice-close" id="storage-notice-close"
                aria-label="${t('dismiss')}" data-tip="${t('dismiss')}">×</button>
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
    localStorage.setItem(LS_KEYS.storageNoticeDismissed, '1');
    const notice = noticeClose.closest('.storage-notice');
    if (notice) notice.remove();
  });

  const newListInput = document.getElementById('new-list-input');
  const newListError = document.getElementById('new-list-error');

  function createList() {
    const name = newListInput.value.trim();
    // An empty name used to fail silently — the button simply did nothing.
    if (!name) {
      newListError.hidden = false;
      newListInput.setAttribute('aria-invalid', 'true');
      newListInput.focus();
      return;
    }
    state.lists.push({ id: 'list-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name });
    persist(LS_KEYS.lists, state.lists);
    renderListsHome();
    showToast(t('list_created').replace('{n}', name));
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

  el.querySelectorAll('.list-rename').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.closest('.list-card').dataset.list;
      const list = state.lists.find(l => l.id === id);
      if (list && input.value.trim()) { list.name = input.value.trim(); persist(LS_KEYS.lists, state.lists); }
    });
  });
  el.querySelectorAll('[data-del-list]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delList;
      if (!confirm(t('delete_list_confirm'))) return;
      state.lists = state.lists.filter(l => l.id !== id);
      Object.keys(state.envLists).forEach(envId => {
        setEnvLists(envId, (state.envLists[envId] || []).filter(lid => lid !== id));
      });
      persist(LS_KEYS.lists, state.lists);
      persist(LS_KEYS.envLists, state.envLists);
      renderListsHome();
    });
  });
  el.querySelectorAll('[data-open-list]').forEach(btn => {
    btn.addEventListener('click', () => navigate('#/lists/' + encodeURIComponent(btn.dataset.openList)));
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
  return `
    <div class="list-card${cover ? ' has-cover' : ''}" data-list="${list.id}">${cover}
      <div class="list-card-top">
        <input type="text" value="${escapeAttr(list.name)}" class="list-rename" aria-label="${t('new_list_name')}">
        <button type="button" class="list-card-del" data-del-list="${list.id}"
                aria-label="${t('delete')}" data-tip="${t('delete')}">${ICON_TRASH}</button>
      </div>
      ${countLine}
      <button type="button" class="btn btn-sm list-card-open" data-open-list="${list.id}">${t('open_list')}</button>
    </div>`;
}

/* How long the popup stands there having done its job. Long enough that the
 * ticked checkbox and the new row are read as the answer, short enough that the
 * card leaving still feels like a consequence of the click. */
const ATL_CLOSE_DELAY_MS = 450;

function openAddToListPopup(envId) {
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

  overlay.innerHTML = `
    <div class="modal modal-sm" data-overlay-card
         role="dialog" aria-modal="true" aria-labelledby="atl-title">
      <div class="modal-header">
        <h2 id="atl-title">${t('add_to_list')}</h2>
        <button type="button" class="modal-close" aria-label="${t('close')}">&times;</button>
      </div>
      <div class="modal-body">
        <div id="atl-list">${listRowsHtml()}</div>
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
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => closeOverlayAnimated(overlay, close), ATL_CLOSE_DELAY_MS);
  }

  function bindToggle(cb) {
    cb.addEventListener('change', () => {
      const listId = cb.dataset.listToggle;
      const list = state.lists.find(l => l.id === listId);
      const set = new Set(state.envLists[envId] || []);
      if (cb.checked) set.add(listId); else set.delete(listId);
      setEnvLists(envId, [...set]);
      persist(LS_KEYS.envLists, state.envLists);
      // Membership is otherwise a silent toggle with nothing to confirm it.
      showToast((cb.checked ? t('added_to_list') : t('removed_from_list')).replace('{n}', list ? list.name : ''));
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
    overlay.remove();
    teardown();
    // Only the list routes show anything that membership changes; re-rendering
    // the catalog here would throw away the focus teardown just restored.
    if (state.route.name !== 'catalog') render();
  }

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const newInput = overlay.querySelector('#atl-new-input');
  const newError = overlay.querySelector('#atl-new-error');

  function createAndAdd() {
    const name = newInput.value.trim();
    if (!name) {
      newError.hidden = false;
      newInput.setAttribute('aria-invalid', 'true');
      newInput.focus();
      return;
    }
    const list = { id: 'list-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name };
    state.lists.push(list);
    persist(LS_KEYS.lists, state.lists);
    const set = new Set(state.envLists[envId] || []);
    set.add(list.id);
    setEnvLists(envId, [...set]);
    persist(LS_KEYS.envLists, state.envLists);
    newInput.value = '';
    const container = overlay.querySelector('#atl-list');
    container.innerHTML = listRowsHtml();
    container.querySelectorAll('[data-list-toggle]').forEach(bindToggle);
    showToast(t('added_to_list').replace('{n}', name));
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
  persist(journeyLsKey(kind), journeySaved(kind));
  renderJourneyPage(journeySel(kind, null, '[data-roll-new]'));
  showToast(t(kind === 'region' ? 'journey_region_saved' : 'journey_sanctuary_saved'));
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
  state.filters = { search: '', tiers: new Set(), types: new Set(), biomes: new Set([biome]), regionOnly: false };
  state.filtersOpen = true;
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
        <button type="button" class="jr-icon-btn" data-roll-name
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
              <button type="button" class="jr-icon-btn jr-reroll" data-reroll="${row.key}"
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
        <button type="button" class="modal-close" aria-label="${t('close')}">&times;</button>
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

/** A number tuned for `fromTier` (a difficulty, or a single check's DC), read at
 * `toTier`. The deviation from the tier's own printed difficulty is authored
 * tuning and is carried over rather than snapping to the flat table value: a
 * tier 2 number one below the table reads one below the table at tier 3 too. */
function retierValue(value, fromTier, toTier) {
  if (toTier === fromTier) return value;
  const shifted = value + TIER_TABLE[toTier].difficulty - TIER_TABLE[fromTier].difficulty;
  return Math.min(DIFFICULTY_CEIL, Math.max(DIFFICULTY_FLOOR, shifted));
}

/** Descriptive difficulties ("Special (see Relative Strength)") never scale. */
function retierDifficulty(env, tier) {
  if (typeof env.difficulty !== 'number') return envDifficulty(env);
  return retierValue(env.difficulty, env.tier, tier);
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
function retierDamage(from, to, roll) {
  if (to === from) return { count: roll.count, sides: roll.sides, mod: roll.mod, changed: false };
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
  state.route = parseRoute();
  syncDetail();
  document.title = routeTitle();
}

/** A neighbour opened from the region block takes the place of the card that
 * offered it, so Escape still means "back to the grid" rather than walking
 * back through every card visited along the way. */
function replaceEnv(envId) {
  history.replaceState(null, '', envHash(envId));
  state.route = parseRoute();
  syncDetail();
  document.title = routeTitle();
}

function openDetailOverlay(envId, carry = null) {
  const env = allEnvs().find(e => e.id === envId);
  if (!env) return;
  const impulses = envField(env, 'impulses');
  const adversaries = envField(env, 'potential_adversaries');
  const encounterUrl = envEncounterUrl(env);

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
  /* "Any" ("Любой") means the GM picks whatever fits — it names nothing, so
   * the whole Potential Adversaries block is noise rather than information.
   * Checked against the English text (or the localized text when English is
   * unavailable) so the block hides regardless of the card's display language. */
  const adversaryCanonical = englishAdversaryEntries.length ? englishAdversaryEntries : adversaries;
  const hasRealAdversaries = adversaryCanonical.some(name => !/^any$/i.test(parsePotentialAdversaryEntry(name).label));
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
          <button type="button" class="card-add-btn" id="detail-add-to-list" aria-label="${t('add_to_list')}" data-tip="${t('add_to_list')}">${ICON_BOOKMARK}</button>
        </div>
        <div class="rank-pills detail-tier-pills" id="detail-tier-pills" role="group" aria-label="${t('view_as_tier')}">${tierPillsHtml}</div>
        <button type="button" class="modal-close" aria-label="${t('close')}">&times;</button>
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
          ${encounterUrl ? (() => {
            const tip = t('open_encounter_builder_tip').replace('{n}', envName(env));
            return `<a class="encounter-builder-link" href="${escapeAttr(encounterUrl)}" target="_blank" rel="noopener noreferrer"
                data-tip="${escapeAttr(tip)}">${ITEM_EXT_ICON}<span>${t('open_encounter_builder')}</span><span class="sr-only"> — ${tip}</span></a>`;
          })() : ''}
        </div>
        <p class="adversary-hint">${escapeHtml(t('adversaries_hint'))}</p>
        <p class="adversary-list">${adversariesHtml}</p>` : ''}
        ${featuresHtml ? `<span class="section-label">${t('features_label')}</span>${featuresHtml}` : ''}
        ${featuredAdversaryHtml}
        ${storySeedsHtml}
        ${rawHtml}
        ${regionHtml}

        <div class="detail-footer">
          ${biomesHtml}
          ${sourceHtml}
          <button type="button" class="btn" id="detail-add-to-list-bottom">${t('add_to_list')}</button>
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
    const retier = viewTier === env.tier ? null : { from: env.tier, to: viewTier };
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
  overlay.querySelector('#detail-add-to-list-bottom').addEventListener('click', () => openAddToListPopup(env.id));
}

/* ---------------- item card ---------------- */

/* This card is a copy of the one the loot generator shows, down to its palette,
 * type and spacing — square art on top, the badge row, the name, the text and
 * the craft chain, on that site's plum surface rather than our parchment. It is
 * quoting another site's card, and the seam is the point: everything inside is
 * theirs. The artwork is served from there too, so a picture that will not load
 * simply drops out of the card. */
const ITEM_CRAFT_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 11h11.2l-3.6-3.6L13 6l6 6-6 6-1.4-1.4 3.6-3.6H4v-2z"/></svg>`;
/* The generator's own icons, so a reader who knows that card recognises these
 * controls as the same ones. The chain means "the link to this entry" there and
 * here; the arrow out of the box is ours, and keeps the button that leaves the
 * site from wearing the same icon as the button that copies its address. */
const ITEM_LINK_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.9 12a5.1 5.1 0 0 1 5.1-5.1h4V5H9a7 7 0 0 0 0 14h4v-1.9H9A5.1 5.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm7-8v1.9h4a5.1 5.1 0 0 1 0 10.2h-4V19h4a7 7 0 0 0 0-14h-4z"/></svg>`;
const ITEM_EXT_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3h-7zM5 5h5V3H3v18h18v-7h-2v5H5V5z"/></svg>`;
const ITEM_SHARE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.1c.5.5 1.2.8 2 .8a3 3 0 1 0-3-3c0 .3 0 .5.1.7L8 9.9a3 3 0 1 0 0 4.2l7.1 4.2c-.1.2-.1.4-.1.6a2.9 2.9 0 1 0 3-2.8z"/></svg>`;
const ITEM_IMAGE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>`;
const ITEM_COPY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>`;

/* The quoted card is set in Inter, which is not one of the atlas's three
 * faces. Requesting it up front would put a fourth family on every page load
 * for an overlay most visitors never open, and leaving it out of the request
 * — as it was — meant the quotation silently fell through to the system sans
 * on almost every machine. So it is fetched the first time an item card is
 * actually opened, and never otherwise. */
/* The quoted card is only ever opened from a link inside an environment card,
 * so it sits on top of one — and bakes its text in the same way. Rebuilding the
 * card underneath has to take this one with it, or the language switch would
 * leave a stale item card stranded beneath the card it was opened from. */
let openItemId = null;
let closeOpenItemDetail = () => {};

let lootFontRequested = false;
function ensureLootFont() {
  if (lootFontRequested) return;
  lootFontRequested = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap';
  document.head.appendChild(link);
}

/* `quiet` is set when this card is being put back on top of a stat block that
 * was rebuilt for the language: the pop-in belongs to opening a card, not to
 * the same card coming back with translated text. */
function openItemDetail(itemId, { quiet = false } = {}) {
  const item = itemById(itemId);
  if (!item) return;
  ensureLootFont();

  const name = itemField(item, 'name');
  const art = itemImageUrl(item);
  const kind = item.kind === 'consumable' ? 'consumable' : 'item';

  const craftHtml = itemCraftRows(itemId).map(row => `
    <p>${ITEM_CRAFT_ICON}<span class="loot-craft-l">${row.label}</span>
       <button type="button" class="loot-craft-a" data-craft-item="${escapeAttr(row.id)}">${escapeHtml(itemField(itemById(row.id), 'name'))}</button></p>`).join('');

  const overlay = document.createElement('div');
  overlay.className = quiet ? 'modal-overlay loot-overlay is-rebuild' : 'modal-overlay loot-overlay';
  overlay.dataset.overlayKind = 'item';
  overlay.innerHTML = `
    <div class="loot-modal-card" data-overlay-card role="dialog" aria-modal="true" aria-label="${escapeAttr(name)}">
      <button type="button" class="loot-x" aria-label="${t('close')}">&times;</button>
      <article class="loot-card">
        ${art ? `<div class="loot-media"><img src="${escapeAttr(art)}" alt="${escapeAttr(name)}"></div>` : ''}
        <div class="loot-body">
          <div class="loot-meta">
            ${item.roll ? `<span class="loot-badge num">${item.roll}</span>` : ''}
            <span class="loot-badge ${kind === 'consumable' ? 'cons' : 'thing'}">${t('item_kind_' + kind)}</span>
            <span class="loot-badge src">${t('item_src_' + item.src)}</span>
          </div>
          <h2 class="loot-name">
            <span>${escapeHtml(name)}</span>
            <button type="button" class="loot-name-act" data-copy-link
                    data-tip="${escapeAttr(t('copy_link'))}" aria-label="${escapeAttr(t('copy_link'))}">${ITEM_LINK_ICON}</button>
          </h2>
          <div class="loot-desc" data-item-desc></div>
          ${craftHtml ? `<div class="loot-craft">${craftHtml}</div>` : ''}
          <div class="loot-acts">
            <button type="button" class="loot-btn" data-share-item
                    aria-label="${escapeAttr(t('share_item'))}">${ITEM_SHARE_ICON}<span>${escapeHtml(t('share_item'))}</span></button>
            ${art ? `<button type="button" class="loot-btn" data-copy-image
                    data-tip="${escapeAttr(t('copy_image'))}" aria-label="${escapeAttr(t('copy_image'))}">${ITEM_IMAGE_ICON}<span>${escapeHtml(t('copy_image_label'))}</span></button>` : ''}
            <button type="button" class="loot-btn" data-copy-text
                    data-tip="${escapeAttr(t('copy_text'))}" aria-label="${escapeAttr(t('copy_text'))}">${ITEM_COPY_ICON}<span>${escapeHtml(t('copy_text_label'))}</span></button>
          </div>
          <div class="loot-acts">
            <a class="loot-btn" href="${escapeAttr(itemUrl(itemId))}" target="_blank" rel="noopener">${ITEM_EXT_ICON}${t('open_in_loot')}</a>
          </div>
          <p class="loot-src-note">${t('loot_src_note')}</p>
        </div>
      </article>
    </div>`;
  document.body.appendChild(overlay);

  // Item text carries its own rolls ("clear 1d4 HP"), so it goes through the
  // same renderer as a feature — minus the tier scaling, which describes an
  // environment's damage and has nothing to say about a potion.
  renderFeatureBody(overlay.querySelector('[data-item-desc]'), itemField(item, 'description'), null);

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

  overlay.querySelector('.loot-x').addEventListener('click', closeItem);
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

  overlay.querySelector('[data-share-item]').addEventListener('click', () => {
    const body = itemBodyForCopy(overlay.querySelector('[data-item-desc]'));
    shareItemCard({ title: shareName, text: shareName + (body.text ? `\n\n${body.text}` : ''), url: link, art });
  });

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

/* One button, three levels of browser support — the same three the generator
 * offers, for the same reason: on a phone the share sheet puts the picture and
 * the text into a chat in one step, a desktop browser with the Share API can
 * still pass the link along, and everything else copies it. The link carries
 * its own Open Graph tags either way, so Telegram and Discord unfurl it into
 * picture, name and text on the far end. */
function shareItemCard({ title, text, url, art }) {
  if (!navigator.share) { copyPlainText(url, t('link_copied')); return; }
  const withoutFile = () => navigator.share({ title, text, url });
  if (!art || !(navigator.canShare && window.File)) { withoutFile().catch(() => {}); return; }
  itemImageBlob(art).then(
    blob => {
      const file = new File([blob], itemImageFileName(title), { type: 'image/png' });
      return navigator.canShare({ files: [file] }) ? navigator.share({ files: [file], text }) : withoutFile();
    },
    // Only the picture failed; the card is still worth passing on.
    () => withoutFile()
  ).catch(() => {}); // dismissing the sheet is not an error
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

/** `retier` is `{ from, to }` while the card is being read at another tier, or
 * null at the environment's own tier. Only damage rolls and check DCs follow
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
      const scaled = retier && match.isDamage ? retierDamage(retier.from, retier.to, match) : null;
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
      const scaled = retier ? retierValue(match.value, retier.from, retier.to) : match.value;
      container.appendChild(document.createTextNode(String(scaled)));
    } else {
      container.appendChild(makeCountdownButton(match.value, match.label));
    }
    lastIndex = match.end;
  }
  if (lastIndex < text.length) container.appendChild(document.createTextNode(text.slice(lastIndex)));
}

const BULLET_LINE_RE = /^[-•]\s+/;

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
    if (BULLET_LINE_RE.test(line)) {
      flushPara();
      const ul = document.createElement('ul');
      ul.className = 'feature-bullets';
      while (i < lines.length && BULLET_LINE_RE.test(lines[i].trim())) {
        const li = document.createElement('li');
        renderBulletBody(li, lines[i].trim().replace(BULLET_LINE_RE, ''), retier);
        ul.appendChild(li);
        i++;
      }
      container.appendChild(ul);
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
    <button type="button" class="countdown-overlay-close" aria-label="${t('close')}">&times;</button>
    <div class="countdown-overlay-value">${btn.dataset.count}</div>
    <div class="countdown-overlay-actions">
      <button type="button" class="countdown-overlay-btn" data-op="dec" aria-label="-">&minus;</button>
      <button type="button" class="countdown-overlay-btn" data-op="inc" aria-label="+">+</button>
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
