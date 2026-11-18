/* ============================================================
   Bacchus's Atlas — darkheart-view.js
   The Darkheart Forest page (#/darkheart, PD-099): the GM's expedition
   workspace. A DOM layer only — every rule lives in the pure modules it calls:
   DarkheartExpedition (roll, Forest Difficulty, Fear, undo), DarkheartComposer
   (which scene may be dealt, the one encounter boundary), DarkheartEncounter
   (adversaries and Battle Points), DarkheartNpc.

   Hierarchy, top to bottom: expedition status and party; the Wayfinder roll;
   the generated scene (Darkheart rule apart from the environment's own text);
   the NPC and encounter tools; history. The roll is a preview until
   "Confirm Arrival"; typing never changes the campaign.

   Regions render independently (status, roll, scene, npc, encounter,
   history), so typing a die never rebuilds the field being typed in.
   Nothing here persists directly: the host hands in get/set, which persists
   through js/safe-storage.js.
   ============================================================ */
const DarkheartView = (function () {
  'use strict';

  const X = DarkheartExpedition;
  const OUTCOME_ORDER = X.OUTCOME_KEYS;

  let host = null;
  let deps = null;
  let data = { status: 'loading' };      // { status: 'loading'|'ready'|'error', selectable, withheld, ctx }
  let ui = null;                          // transient view state (never persisted)
  let onClick = null, onInput = null, onChange = null, onKey = null;
  let mountToken = 0;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = key => deps.t(key);
  const bi = v => (v && (v[deps.lang()] || v.en)) || '';
  const S = () => deps.get();

  function freshUi() { return { confirm: null, menuOpen: false, penalty: 'fd', gainFear: true, badDie: {}, restWhisper: true, restFear: true, manualFear: '', manualFd: '', npcOpen: false, encOpen: false, partyOpen: false, helpOpen: false, restOpen: false, sceneSig: '' }; }
  const fill = (key, vars) => Object.keys(vars).reduce((txt, k) => txt.split('{' + k + '}').join(String(vars[k])), t(key));

  /* ---------------- icons (inline, currentColor) ---------------- */
  const I = {
    minus: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 12h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dice: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4l8-4.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 7.4 12 12l8-4.6M12 12v9.2" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.2L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.2L20 15.5M20 20v-4.5h-4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="10.5" width="13" height="9.5" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.6-1.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    arrive: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.6 20.1 7v10L12 21.4 3.9 17V7L12 2.6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m8.6 12.2 2.4 2.4 4.4-4.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v13M6 13l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ---------------- derived state ---------------- */

  function previewNow() { const s = S(); return X.previewRoll(s.dice, s.fd); }
  /** The outcome the scene region is about: the arrival's, or the roll being previewed. */
  function stageOutcome() {
    const s = S();
    if (s.phase === 'arrived' && s.arrival) return s.arrival.outcome;
    if (s.phase === 'bastion' || s.phase === 'retreat') return null;     // no scene while the party is in Bastion or deciding to retreat
    const p = previewNow();
    return p.status === 'ok' ? p.outcome : null;
  }
  const outcomeSeed = outcome => (S().scene.seed || 0) * 13 + OUTCOME_ORDER.indexOf(outcome) + 1;

  /** The scene shown for `outcome`: the stored one while it is still selectable and dealable at the tier, else a fresh deal. */
  function currentScene(outcome) {
    if (!outcome || data.status !== 'ready') return { scene: null, noMatch: false, pending: !!outcome };
    const s = S();
    if (s.scene.outcome === outcome && s.scene.sceneId) {
      const kept = DarkheartComposer.findScene(data.selectable, s.scene.sceneId);
      if (kept && DarkheartComposer.sceneEntry(kept, outcome)) return { scene: kept, noMatch: false };
    }
    const dealt = DarkheartComposer.dealScene({ selectable: data.selectable, outcome, dealt: (s.scene.dealt || {})[outcome] || [], seed: outcomeSeed(outcome) });
    return { scene: dealt.scene, noMatch: dealt.noMatch, cycled: dealt.cycled, poolSize: dealt.poolSize };
  }

  /** Stores the composition for the staged outcome the first time it is shown (a scene change, never a campaign change). */
  function syncComposition() {
    const outcome = stageOutcome();
    if (!outcome || data.status !== 'ready') return;
    const s = S();
    const cur = currentScene(outcome);
    const id = cur.scene ? cur.scene.id : null;
    if (s.scene.outcome === outcome && s.scene.sceneId === id) return;
    const keep = s.scene.outcome === outcome;     // same outcome, scene replaced (tier change): keep NPC and locks
    const scene = Object.assign(X.emptyScene(), {
      outcome, seed: s.scene.seed, sceneId: id, dealt: s.scene.dealt,
      npc: keep ? s.scene.npc : { seed: 0, locked: false, value: null },
      encounter: keep ? s.scene.encounter : { seed: 0, locked: [], gmTheme: null },
    });
    deps.set(X.setScene(s, scene).state);
    ensureNpc();
  }

  function ensureNpc() {
    const s = S();
    const outcome = s.scene.outcome;
    const role = DarkheartNpc.roleForOutcome(outcome);
    if (!role || role === 'neutral-creature' || s.scene.npc.value) return;
    makeNpc(false);
  }
  function makeNpc(bump) {
    const s = S();
    if (s.scene.npc.locked && s.scene.npc.value) return;
    const seed = (s.scene.npc.seed || 0) + (bump ? 1 : 0);
    // The NPC's predicament belongs to the PLACE (PD-104): the situations its character supports, picked by the NPC's own seed.
    const scene = DarkheartComposer.findScene(data.selectable, s.scene.sceneId);
    const role = DarkheartNpc.roleForOutcome(s.scene.outcome);
    const situations = scene && data.profiles ? DarkheartSuitability.npcSituations(data.profiles[scene.envId], role) : [];
    const value = DarkheartNpc.generateNpc({ outcome: s.scene.outcome, sceneId: s.scene.sceneId, seed, situations });
    if (!value) return;
    deps.set(X.setScene(s, Object.assign({}, s.scene, { npc: { seed, locked: false, value } })).state);
  }

  /* ---------------- region renderers ---------------- */

  function region(id) { return host && host.querySelector('#dh-' + id); }
  function setRegion(id, html) { const el = region(id); if (el) el.innerHTML = html; }

  function renderAll() {
    syncComposition();
    syncHeroOutcome();
    renderStatus(); renderRoll(); renderScene(); renderNpc(); renderEncounter(); renderHistory();
  }

  function stepper(act, value, label, minusLabel, plusLabel, lo, hi) {
    return `<div class="dh-step" role="group" aria-label="${esc(label)}">
      <button type="button" class="dh-step-btn" data-dh-act="${act}-" aria-label="${esc(minusLabel)}"${value <= lo ? ' disabled' : ''}>${I.minus}</button>
      <output class="dh-step-val" aria-live="polite">${value}</output>
      <button type="button" class="dh-step-btn" data-dh-act="${act}+" aria-label="${esc(plusLabel)}"${value >= hi ? ' disabled' : ''}>${I.plus}</button>
    </div>`;
  }

  function confirmBlock() {
    if (!ui.confirm) return '';
    const kind = ui.confirm;
    return `<div class="dh-confirm" role="alertdialog" aria-label="${esc(t('dh_confirm_' + kind + '_title'))}">
      <span>${esc(t('dh_confirm_' + kind))}</span>
      <span class="dh-confirm-btns"><button type="button" class="btn btn-danger btn-sm" data-dh-act="${kind === 'campaign' ? 'campaign-yes' : 'expedition-yes'}">${esc(t('dh_confirm_' + kind + '_yes'))}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-dh-act="confirm-no">${esc(t('dh_cancel'))}</button></span></div>`;
  }

  function settingsHtml(s) {
    const row = (k, label, hint) => `<label class="dh-setting"><input type="checkbox" data-dh-setting="${k}"${s.settings[k] ? ' checked' : ''}><span><strong>${esc(label)}</strong><span class="dh-hint-inline">${esc(hint)}</span></span></label>`;
    return `<fieldset class="dh-rules"><legend>${esc(t('dh_house_rules'))}</legend>
      ${row('fearOnRoll', t('dh_rule_fear_roll'), t('dh_rule_fear_roll_hint'))}
      ${row('fearOnRest', t('dh_rule_fear_rest'), t('dh_rule_fear_rest_hint'))}
      ${row('shortRestLimit', t('dh_rule_short_limit'), t('dh_rule_short_limit_hint'))}
    </fieldset>`;
  }

  function partySummary(s) {
    return fill(s.heroes === 1 ? 'dh_party_summary_one' : 'dh_party_summary', { tier: s.tier, n: s.heroes });
  }

  function renderStatus() {
    const s = S();
    const trapped = s.trapped;
    const fdDanger = s.fd >= 25;
    const inBastion = s.phase === 'bastion';
    const canRetreat = s.hexes > 0 && (s.phase === 'roll' || s.phase === 'arrived') && !trapped;
    const fdNote = inBastion ? t('dh_fd_resets_note') : t('dh_fd_note');
    const counter = (kind, labelKey, value, down, up, lo, hi, cls) => `
        <div class="dh-counter dh-counter--${kind}${cls || ''}" role="group" aria-labelledby="dh-${kind}-label">
          <span class="dh-counter-label" id="dh-${kind}-label">${esc(t(labelKey))}</span>
          <div class="dh-counter-row">
            <button type="button" class="dh-step-btn" data-dh-act="${kind}-" aria-label="${esc(t(down))}"${value <= lo ? ' disabled' : ''}>${I.minus}</button>
            <output class="dh-counter-num" aria-labelledby="dh-${kind}-label">${value}</output>
            <button type="button" class="dh-step-btn" data-dh-act="${kind}+" aria-label="${esc(t(up))}"${value >= hi ? ' disabled' : ''}>${I.plus}</button>
          </div>
        </div>`;
    setRegion('status', `
      <div class="dh-toolbar-group dh-counters">
        ${counter('fd', 'dh_forest_difficulty', s.fd, 'dh_fd_down', 'dh_fd_up', X.FD_START, X.FD_TRAPPED, (fdDanger ? ' is-danger' : '') + (trapped ? ' is-trapped' : ''))}
        ${counter('fear', 'dh_gm_fear', s.fear, 'dh_fear_down', 'dh_fear_up', 0, X.FEAR_MAX, '')}
        <button type="button" class="dh-help-btn" data-dh-act="help-toggle" aria-expanded="${ui.helpOpen}" aria-controls="dh-help" aria-label="${esc(t('dh_help_label'))}">?</button>
      </div>
      <div class="dh-toolbar-group dh-trail">
        <p class="dh-trail-line"><span class="dh-trail-exp">${esc(t('dh_expedition'))} ${s.expedition}</span>
          <span class="dh-trail-hexes">${esc(t('dh_hexes_short'))}: <output class="dh-mono" aria-label="${esc(t('dh_hexes'))}">${s.hexes}</output></span></p>
        <button type="button" class="dh-party-btn" data-dh-act="party-toggle" aria-expanded="${ui.partyOpen}" aria-controls="dh-party"
                aria-label="${esc(t('dh_party_label'))}: ${esc(partySummary(s))}. ${esc(t('dh_party_edit'))}"><span>${esc(partySummary(s))}</span><span class="dh-party-edit" aria-hidden="true">${esc(t('dh_party_edit'))}</span></button>
      </div>
      <div class="dh-toolbar-group dh-status-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="undo"${s.undo.length ? '' : ' disabled'}>${I.undo}<span>${esc(t('dh_undo'))}</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="retreat-open"${canRetreat ? '' : ' disabled'} title="${esc(t(canRetreat ? 'dh_retreat_tip' : 'dh_retreat_unavailable'))}">${esc(t('dh_return_bastion'))}</button>
        <button type="button" class="btn btn-ghost btn-sm dh-menu-btn" data-dh-act="menu-toggle" aria-expanded="${ui.menuOpen}" aria-controls="dh-menu-panel">${esc(t('dh_expedition_menu'))}</button>
      </div>
      ${ui.helpOpen ? `<div id="dh-help" class="dh-help">
        <p><strong>${esc(t('dh_forest_difficulty'))}.</strong> ${esc(fdNote)}</p>
        <p><strong>${esc(t('dh_gm_fear'))}.</strong> ${esc(t('dh_fear_note'))}</p>
        <p><strong>${esc(t('dh_hexes'))}.</strong> ${esc(t('dh_hexes_note'))}</p>
      </div>` : ''}
      <div id="dh-party" class="dh-party"${ui.partyOpen ? '' : ' hidden'} role="group" aria-label="${esc(t('dh_party_label'))}"></div>
      ${ui.menuOpen ? `<div id="dh-menu-panel" class="dh-menu-panel">
        <div class="dh-menu-col">
          <h4 class="dh-block-label">${esc(t('dh_menu_resets'))}</h4>
          <button type="button" class="btn btn-ghost btn-sm" data-dh-act="expedition-ask">${esc(t('dh_new_expedition'))}</button>
          <p class="dh-hint">${esc(t('dh_new_expedition_hint'))}</p>
          <button type="button" class="btn btn-danger btn-sm" data-dh-act="campaign-ask">${esc(t('dh_new_campaign'))}</button>
          <p class="dh-hint">${esc(t('dh_new_campaign_hint'))}</p>
          ${confirmBlock()}
        </div>
        <div class="dh-menu-col">${settingsHtml(s)}</div>
      </div>` : ''}
      ${trapped ? `<p class="dh-trapped" role="alert"><strong>${esc(t('dh_trapped_title'))}</strong> ${esc(t('dh_trapped_text'))}</p>` : ''}`);
    renderParty();
  }

  function renderParty() {
    const s = S();
    const el = region('party');
    if (!el) return;
    const tiers = [1, 2, 3, 4].map(n => `<button type="button" role="radio" class="dh-seg${s.tier === n ? ' is-on' : ''}" aria-checked="${s.tier === n}" data-dh-act="tier" data-dh-value="${n}">${n}</button>`).join('');
    el.innerHTML = `
      <div class="dh-field">
        <span class="dh-field-label" id="dh-tier-label">${esc(t('dh_party_tier'))}</span>
        <div class="dh-segs" role="radiogroup" aria-labelledby="dh-tier-label">${tiers}</div>
      </div>
      <div class="dh-field">
        <span class="dh-field-label" id="dh-heroes-label">${esc(t('dh_heroes'))}</span>
        ${stepper('heroes', s.heroes, t('dh_heroes'), t('dh_heroes_down'), t('dh_heroes_up'), X.HEROES_MIN, X.HEROES_MAX)}
      </div>`;
  }

  /** The roll's one status line. A critical success is ONE badge (the old Success + Critical pair said the same thing twice);
   * every other roll keeps its Success/Failure badge and its Hope/Fear badge. Display only: p.success / p.rolledWith are the model's. */
  function rollBadge(p) {
    if (p.rolledWith === 'critical') return `<span class="dh-badge dh-badge--critical"><span aria-hidden="true">✓</span> ${esc(t('dh_critical'))}</span>`;
    const withWhat = p.rolledWith === 'hope' ? t('dh_with_hope') : t('dh_with_fear');
    return `<span class="dh-badge ${p.success ? 'is-success' : 'is-fail'}"><span aria-hidden="true">${p.success ? '✓' : '✕'}</span> ${esc(p.success ? t('dh_success') : t('dh_failure'))}</span><span class="dh-badge dh-badge--${p.rolledWith}">${esc(withWhat)}</span>`;
  }

  /** "7 + 7 = 14  vs FD 16": the roll, and the Forest Difficulty that roll was actually made against. */
  function mathHtml(r) {
    const fdName = esc(t('dh_forest_difficulty'));
    return `<p class="dh-result-math"><span class="dh-mono">${r.hope} + ${r.fear}${modText(r.modifier)} = <strong>${r.total}</strong></span>
      <span class="dh-vs">${esc(t('dh_vs'))} <abbr title="${fdName}"><span aria-hidden="true">${esc(t('dh_fd_short'))}</span><span class="sr-only">${fdName}</span></abbr> ${r.difficulty}</span></p>`;
  }
  /** Status badges and the event on one wrapping line: "[Failure] [with Fear]  Creature · Hostile adversary". */
  function outcomeLineHtml(r, rule) {
    return `<p class="dh-result-line"><span class="dh-result-badges">${rollBadge(r)}</span>
      <span class="dh-event"><span class="dh-event-cat">${esc(t('dh_cat_' + rule.category))}</span> · <strong>${esc(bi(rule.title))}</strong></span></p>`;
  }
  /** FD and Fear changes together: "Proposed  New hex: FD 16 → 17 · GM Fear 0 → 1". `state` says proposed vs applied. */
  function changesHtml(state, items) {
    return `<p class="dh-changes-line"><span class="dh-changes-state is-${state}">${esc(t('dh_changes_' + state))}</span>${items.map(i => `<span>${i}</span>`).join('')}</p>`;
  }

  function dieFields(s, disabled) {
    const dieField = (k, label) => `
      <label class="dh-die" for="dh-die-${k}">
        <span class="dh-field-label">${esc(label)}</span>
        <input type="number" id="dh-die-${k}" class="dh-input" inputmode="numeric" min="1" max="12" step="1" data-dh-die="${k}"
               value="${s.dice[k] == null ? '' : s.dice[k]}"${disabled} aria-describedby="dh-roll-errors">
      </label>`;
    return `<div class="dh-dice">
        ${dieField('hope', t('dh_hope_die'))}
        ${dieField('fear', t('dh_fear_die'))}
        <label class="dh-die dh-die--mod" for="dh-die-mod">
          <span class="dh-field-label">${esc(t('dh_modifier'))}</span>
          <input type="number" id="dh-die-mod" class="dh-input" inputmode="numeric" min="${X.MOD_MIN}" max="${X.MOD_MAX}" step="1" data-dh-die="modifier"
                 value="${s.dice.modifier}"${disabled} aria-describedby="dh-roll-errors">
        </label>
      </div>`;
  }

  function renderRoll() {
    const s = S();
    const title = document.getElementById('dh-roll-title');
    if (title) title.textContent = s.phase === 'retreat' ? t('dh_retreat_title') : s.phase === 'bastion' ? t('dh_bastion_next') : t('dh_wayfinder');
    const rollEl = region('roll');
    if (rollEl) rollEl.classList.toggle('is-arrived', s.phase === 'arrived' && !!s.arrival);   // lets a one-column layout drop the spent dice inputs
    if (s.phase === 'bastion') { setRegion('roll', bastionHtml(s)); return; }
    if (s.phase === 'retreat') {
      const d = s.retreat.danger;
      const q = `<p class="dh-hint dh-hint--lead">${esc(t('dh_retreat_question'))}</p>
        <div class="dh-segs" role="radiogroup" aria-label="${esc(t('dh_retreat_question'))}">
          <button type="button" role="radio" class="dh-seg${d === false ? ' is-on' : ''}" aria-checked="${d === false}" data-dh-act="retreat-danger" data-dh-value="no">${esc(t('dh_retreat_no_danger'))}</button>
          <button type="button" role="radio" class="dh-seg${d === true ? ' is-on' : ''}" aria-checked="${d === true}" data-dh-act="retreat-danger" data-dh-value="yes">${esc(t('dh_retreat_danger'))}</button>
        </div>`;
      setRegion('roll', `${q}${d === true ? `<p class="dh-hint">${esc(t('dh_retreat_group_roll'))}</p>${dieFields(s, '')}` : ''}<div id="dh-preview" aria-live="polite"></div>`);
      renderPreview();
      return;
    }
    const inputsDisabled = (s.phase === 'arrived' && s.arrival) || s.trapped ? ' disabled' : '';
    // Inputs are re-created only when the region is rebuilt for structure (phase/undo); typing patches the preview only.
    setRegion('roll', `${dieFields(s, inputsDisabled)}<div id="dh-preview" aria-live="polite"></div>`);
    renderPreview();
  }

  const modText = m => (m === 0 ? '' : m > 0 ? ` + ${m}` : ` − ${Math.abs(m)}`);

  /** Outcome preview and the Confirm control — re-rendered on every keystroke; the inputs above are untouched. */
  function renderPreview() {
    const el = region('preview');
    if (!el) return;
    const s = S();
    if (s.phase === 'arrived' && s.arrival) {
      el.innerHTML = arrivedHtml(s);
      const d = el.querySelector('#dh-rest-disc');
      if (d) d.addEventListener('toggle', () => { ui.restOpen = d.open; });
      return;
    }
    if (s.phase === 'bastion') { el.innerHTML = ''; return; }
    const retreat = s.phase === 'retreat';
    const cancel = retreat ? `<button type="button" class="btn btn-ghost btn-sm dh-cancel-retreat" data-dh-act="retreat-cancel">${esc(t('dh_retreat_cancel'))}</button>` : '';
    if (retreat && s.retreat.danger === null) { el.innerHTML = `<p class="dh-hint" id="dh-roll-errors">${esc(t('dh_retreat_pick'))}</p>${cancel}`; return; }
    if (retreat && s.retreat.danger === false) {
      el.innerHTML = `<span id="dh-roll-errors"></span><p class="dh-hint">${esc(t('dh_retreat_declare'))}</p>
        <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="retreat-declare">${I.arrive}<span>${esc(t('dh_return_bastion'))}</span></button>${cancel}`;
      return;
    }
    const p = previewNow();
    const errs = [];
    Object.keys(ui.badDie).forEach(k => { if (ui.badDie[k]) errs.push(t('dh_err_whole')); });
    if (p.status === 'invalid') p.errors.forEach(e => errs.push(t('dh_err_' + e.replace('-range', '_range'))));
    const errHtml = errs.length ? `<ul class="dh-errors" id="dh-roll-errors" role="alert">${[...new Set(errs)].map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '<span id="dh-roll-errors"></span>';
    if (p.status !== 'ok') {
      el.innerHTML = `${errHtml}<p class="dh-hint">${esc(t(errs.length ? 'dh_roll_fix' : (retreat ? 'dh_retreat_roll_prompt' : 'dh_roll_prompt')))}</p>${cancel}`;
      return;
    }
    const rule = X.OUTCOME_RULES[p.outcome];
    const head = `${errHtml}
      <div class="dh-result is-preview">
        <p class="dh-state"><span class="dh-state-chip is-preview">${esc(t('dh_state_preview'))}</span><span class="dh-state-note">${esc(t(retreat ? 'dh_state_preview_retreat_note' : 'dh_state_preview_note'))}</span></p>
        ${mathHtml(p)}`;
    // A successful Group Roll to retreat: the party gets away.
    if (retreat && p.success) {
      const gain = p.gainsFear && s.settings.fearOnRoll;
      const sim = X.completeRetreat(s, { gainFear: ui.gainFear });
      el.innerHTML = `${head}<p class="dh-result-line"><span class="dh-result-badges">${rollBadge(p)}</span><strong>${esc(t('dh_retreat_escaped'))}</strong></p></div>
        ${gain ? `<div class="dh-changes"><label class="dh-check"><input type="checkbox" data-dh-gainfear${ui.gainFear ? ' checked' : ''}> ${esc(t('dh_gain_fear'))}</label>${sim.ok && sim.state.fear !== s.fear ? changesHtml('proposed', [`${esc(t('dh_gm_fear'))} ${s.fear} → <strong>${sim.state.fear}</strong>`]) : ''}</div>` : ''}
        <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="retreat-escape">${I.arrive}<span>${esc(t('dh_return_bastion'))}</span></button>${cancel}`;
      return;
    }
    const choices = { penalty: ui.penalty, gainFear: ui.gainFear };
    const sim = retreat ? X.confirmRetreatFailure(s, choices) : X.confirmArrival(s, choices);
    const after = sim.ok ? sim.state : s;
    const choicesHtml = [];
    if (rule.penalty > 0) {
      const who = p.outcome === 'landmark-fail-fear' ? 'dh_penalty_players_choose' : 'dh_penalty_gm_decides';
      choicesHtml.push(`<fieldset class="dh-choice"><legend>${esc(t('dh_penalty_choose'))}</legend>
        <div class="dh-choice-opts">
        <label><input type="radio" name="dh-penalty" value="fd"${ui.penalty === 'fd' ? ' checked' : ''}> +${rule.penalty} <abbr title="${esc(t('dh_forest_difficulty'))}"><span aria-hidden="true">${esc(t('dh_fd_short'))}</span><span class="sr-only">${esc(t('dh_forest_difficulty'))}</span></abbr></label>
        <label><input type="radio" name="dh-penalty" value="fear"${ui.penalty === 'fear' ? ' checked' : ''}> +${rule.penalty} ${esc(t('dh_gm_fear'))}</label>
        </div>
        ${p.outcome === 'landmark-fail-fear' ? '' : `<span class="dh-hint-inline">${esc(t(who))}</span>`}
      </fieldset>`);
    }
    if (p.gainsFear && s.settings.fearOnRoll) {
      choicesHtml.push(`<label class="dh-check"><input type="checkbox" data-dh-gainfear${ui.gainFear ? ' checked' : ''}> ${esc(t('dh_gain_fear'))}</label>`);
    }
    const items = [`${esc(t(retreat ? 'dh_retreat_adjacent' : 'dh_new_hex'))}: ${esc(t('dh_fd_short'))} ${s.fd} → <strong>${after.fd}</strong>`];
    if (after.fear !== s.fear) items.push(`${esc(t('dh_gm_fear'))} ${s.fear} → <strong>${after.fear}</strong>`);
    const fdLine = after.trapped ? `<p class="dh-trapped" role="alert"><strong>${esc(t('dh_trapped_title'))}</strong> ${esc(t('dh_trapped_will'))}</p>` : '';
    el.innerHTML = `${head}
        ${outcomeLineHtml(p, rule)}
      </div>
      <div class="dh-changes">${choicesHtml.join('')}${changesHtml('proposed', items)}</div>
      ${fdLine}
      <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="${retreat ? 'retreat-fail' : 'confirm'}"${s.trapped ? ' disabled' : ''}>${I.arrive}<span>${esc(t(retreat ? 'dh_retreat_enter_adjacent' : 'dh_confirm_arrival'))}</span></button>
      ${retreat ? `<p class="dh-hint">${esc(t('dh_retreat_failed_hint'))}</p>` : ''}${cancel}`;
  }

  function restHtml(s) {
    const a = s.arrival;
    const rule = X.OUTCOME_RULES[a.outcome];
    const policy = rule.rest;
    const limited = s.settings.shortRestLimit && s.shortRests >= 3;
    const canRest = policy !== 'none';
    const whisperOff = policy === 'no-fd-reduction';
    const fearOn = s.settings.fearOnRest;
    const last = s.lastRest;
    const lastLine = last ? `<p class="dh-rest-last" role="status">${esc(fill('dh_rest_result_' + last.kind, {
      fd: last.fdBy, fear: last.fearBy, d4: last.fearRoll == null ? '–' : last.fearRoll, d2: last.fdRoll == null ? '–' : last.fdRoll, heroes: s.heroes,
    }))}${last.whisper ? '' : ' ' + esc(t('dh_rest_no_whisper'))}${last.fearCapped ? ' ' + esc(t('dh_rest_capped')) : ''}</p>` : '';
    // The whole Rest section is one closed-by-default disclosure: reading the confirmed scene never means scrolling past rest settings.
    // Its open state is view state (ui.restOpen), so a rest, a re-render or a resize never resets it, and it never touches the campaign.
    return `
      <details class="dh-rest" id="dh-rest-disc"${ui.restOpen ? ' open' : ''}>
        <summary><span class="dh-rest-name">${esc(t('dh_rest'))}</span><span class="dh-rest-sub">${esc(t(canRest ? 'dh_rest_sub' : 'dh_rest_none'))}</span></summary>
        <div class="dh-rest-body">
        <p class="dh-hint">${esc(t('dh_rest_' + policy))}</p>
        ${canRest ? `
        <div class="dh-rest-opts">
          <label class="dh-check"><input type="checkbox" id="dh-rest-whisper"${whisperOff ? ' disabled' : (ui.restWhisper ? ' checked' : '')}> <span>${esc(t('dh_rest_whisper'))}</span></label>
          <label class="dh-check"><input type="checkbox" id="dh-rest-fear"${fearOn ? (ui.restFear ? ' checked' : '') : ' disabled'}> <span>${esc(fill('dh_rest_fear_label', { heroes: s.heroes }))}</span></label>
        </div>
        <div class="dh-rest-btns">
          <button type="button" class="btn btn-ghost" data-dh-act="rest" data-dh-value="short"${limited ? ' disabled' : ''}>${esc(t('dh_rest_short'))}</button>
          <button type="button" class="btn btn-ghost" data-dh-act="rest" data-dh-value="long">${esc(t('dh_rest_long'))}</button>
        </div>
        ${limited ? `<p class="dh-hint" role="status">${esc(t('dh_rest_limit_reached'))}</p>` : (s.shortRests > 0 && s.settings.shortRestLimit ? `<p class="dh-hint">${esc(fill('dh_rest_limit_count', { n: s.shortRests }))}</p>` : '')}
        <details class="dh-manual"><summary>${esc(t('dh_rest_more'))}</summary>
          <p class="dh-hint dh-hint--tight">${esc(t('dh_rest_whisper_hint'))}</p>
          <p class="dh-hint dh-hint--tight">${esc(t('dh_rest_manual'))}</p>
          <div class="dh-manual-row">
            <label class="dh-die"><span class="dh-field-label">${esc(t('dh_rest_manual_fear'))}</span><input type="number" class="dh-input" id="dh-rest-mfear" min="1" max="4" inputmode="numeric" value="${esc(ui.manualFear)}"></label>
            <label class="dh-die"><span class="dh-field-label">${esc(t('dh_rest_manual_fd'))}</span><input type="number" class="dh-input" id="dh-rest-mfd" min="1" max="2" inputmode="numeric" value="${esc(ui.manualFd)}"></label>
          </div>
          <p class="dh-hint dh-hint--tight">${esc(t('dh_rest_manual_hint'))}</p>
        </details>` : ''}
        ${lastLine}
        </div>
      </details>`;
  }

  function arrivedHtml(s) {
    const a = s.arrival;
    const rule = X.OUTCOME_RULES[a.outcome];
    const items = [`${esc(t('dh_fd_short'))} ${a.fdBefore} → <strong>${a.fdAfter}</strong>`];
    if (a.fearAfter !== a.fearBefore) items.push(`${esc(t('dh_gm_fear'))} ${a.fearBefore} → <strong>${a.fearAfter}</strong>`);
    if (a.penaltyChoice) items.push(esc(t(a.penaltyChoice === 'fd' ? 'dh_penalty_took_fd' : 'dh_penalty_took_fear')));
    const r = { hope: a.hope, fear: a.fear, modifier: a.modifier, total: a.total, difficulty: a.difficulty, success: a.total >= a.difficulty || a.hope === a.fear, rolledWith: a.rolledWith };
    return `
      <div class="dh-result is-arrived">
        <p class="dh-state"><span class="dh-state-chip is-confirmed">${I.arrive}${esc(t('dh_state_confirmed'))}</span><strong class="dh-arrived-title">${esc(t('dh_arrived_at'))} ${a.n}</strong>${a.viaRetreat ? `<span class="dh-chip dh-chip--warn">${esc(t('dh_via_retreat'))}</span>` : ''}</p>
        ${mathHtml(r)}
        ${outcomeLineHtml(r, rule)}
        ${changesHtml('applied', items)}
      </div>
      <div class="dh-arrived-actions">
        <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="next">${I.dice}<span>${esc(t('dh_next_traversal'))}</span></button>
        <button type="button" class="btn btn-ghost dh-scene-link" data-dh-act="to-scene">${I.down}<span>${esc(t('dh_view_scene'))}</span></button>
      </div>
      ${restHtml(s)}`;
  }

  /** The workspace panel while the party is in Bastion: one clear next move. The recap of what carries over is the scene card's. */
  function bastionHtml(s) {
    return `
      <p class="dh-hint dh-hint--lead">${esc(t('dh_bastion_text'))}</p>
      <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="expedition-yes">${I.dice}<span>${esc(t('dh_start_expedition'))}</span></button>`;
  }

  /** Bastion as a deliberate pause between expeditions (not an empty dashboard): what the last expedition came to, what carries over,
   * and — apart, in the danger style — the one reset that does not. */
  function bastionSceneHtml(s) {
    const tile = (num, label, note) => `<div class="dh-tile"><span class="dh-tile-num dh-mono">${esc(num)}</span><span class="dh-tile-label">${esc(label)}</span>${note ? `<span class="dh-tile-note">${esc(note)}</span>` : ''}</div>`;
    return `
      <div class="dh-bastion">
        <p class="dh-kicker">${esc(t('dh_bastion_kicker'))}</p>
        <h3 class="dh-scene-title">${esc(t('dh_in_bastion'))}</h3>
        <p class="dh-scene-summary">${esc(fill('dh_bastion_recap', { n: s.expedition }))}</p>
        <div class="dh-tiles">
          ${tile(String(s.hexes), t('dh_hexes'), fill('dh_bastion_expedition', { n: s.expedition }))}
          ${tile(String(s.fear), t('dh_gm_fear'), t('dh_bastion_fear_kept'))}
          ${tile(String(s.fd) + ' → 15', t('dh_forest_difficulty'), t('dh_bastion_fd_reset'))}
        </div>
        <div class="dh-danger">
          <div><strong>${esc(t('dh_new_campaign'))}</strong><p class="dh-hint dh-hint--tight">${esc(t('dh_new_campaign_hint'))}</p></div>
          <button type="button" class="btn btn-danger btn-sm" data-dh-act="campaign-ask">${esc(t('dh_new_campaign'))}</button>
        </div>
        ${ui.confirm === 'campaign' && !ui.menuOpen ? confirmBlock() : ''}
      </div>`;
  }

  /* ---------- scene ---------- */

  /* The environment's own text is rendered by the shared card renderer (deps.renderEnvText), after the region's
   * markup is in place: damage read at the Party Tier (or the GM's override), every check DC replaced by the current
   * Forest Difficulty (PD-100). Nothing is copied into state or written back to the catalogue. */
  let pendingText = [];
  function featureHtml(f, env) {
    const idx = pendingText.push({ env, text: bi(f.description) }) - 1;
    return `<div class="dh-feature">
      <p class="dh-feature-head"><span class="dh-ftype dh-ftype--${esc(f.type)}">${esc(t('feature_' + f.type))}</span> <strong>${esc(bi(f.name))}</strong></p>
      <div class="dh-feature-text" data-dh-text="${idx}"></div>
    </div>`;
  }
  function fillPendingText() {
    const s = S();
    const tier = X.envReadTier(s);
    pendingText.forEach((p, i) => {
      const node = host && host.querySelector(`[data-dh-text="${i}"]`);
      if (node) deps.renderEnvText(node, p.env, p.text, tier, s.fd);
    });
    pendingText = [];
  }

  function envTierControl(s) {
    const cur = s.envTier;
    const btn = (value, label, on) => `<button type="button" role="radio" class="dh-seg dh-seg--sm${on ? ' is-on' : ''}" aria-checked="${on}" data-dh-act="env-tier" data-dh-value="${value}">${esc(label)}</button>`;
    return `<div class="dh-envtier"><span class="dh-field-label" id="dh-envtier-label">${esc(t('dh_env_tier'))}</span>
      <div class="dh-segs" role="radiogroup" aria-labelledby="dh-envtier-label">${btn('auto', t('dh_env_tier_party') + ' ' + s.tier, !cur)}${[1, 2, 3, 4].map(n => btn(n, String(n), cur === n)).join('')}</div></div>`;
  }

  function ruleBlock(outcome) {
    const rule = X.OUTCOME_RULES[outcome];
    return `<section class="dh-rule" aria-labelledby="dh-rule-h">
      <h4 id="dh-rule-h" class="dh-block-label">${esc(t('dh_rule_label'))}</h4>
      <p class="dh-rule-title">${esc(bi(rule.title))}${rule.countdown ? ` <span class="dh-chip dh-chip--countdown">${esc(t('dh_countdown'))} ${esc(rule.countdown)}</span>` : ''}</p>
      <p class="dh-rule-text">${esc(bi(rule.rule))}</p>
    </section>`;
  }

  /** The Forest Difficulty the checks INSIDE the staged hex use (PD-100). The Wayfinder roll is resolved against the FD as it
   * stood before entry; entering the new hex is what raises it, so a hex the party has only previewed already reads at the
   * value it will have once confirmed (the +1 for entering, never the optional Landmark penalty, which is a choice made at
   * confirmation). Once the arrival is confirmed it is simply the campaign's FD. */
  function sceneFd(s) {
    if (s.phase === 'arrived') return { fd: s.fd, pending: false };
    const sim = X.confirmArrival(s, { penalty: 'fear', gainFear: false });
    return { fd: sim.ok ? sim.state.fd : s.fd, pending: true };
  }

  /** The hero's artwork identity is the TRAVEL OUTCOME (the OUTCOME_RULES id, the one classification), never the environment, so
   * "New scene" cannot change it. The twelve future illustrations key off `data-outcome` on the hero; no valid outcome, no attribute. */
  function syncHeroOutcome() {
    const hero = region('hero');
    if (!hero) return;
    const outcome = stageOutcome();
    if (outcome) hero.dataset.outcome = outcome; else delete hero.dataset.outcome;
  }

  /** The note beside a source feature that names its own adversaries while this dashboard builds the encounter itself (`encounter.sourceRoster`). */
  function rosterNoteHtml(scene) {
    return scene.encounter && scene.encounter.sourceRoster
      ? `<p class="dh-roster-note"><span class="dh-chip dh-chip--countdown">${esc(t('dh_roster_chip'))}</span><span>${esc(t('dh_roster_note'))}</span></p>` : '';
  }

  /** Ids of the adversaries the encounter below currently lists, for a derived scene whose outcome brings participants: a source
   * feature that names a DIFFERENT creature is adapted (never shown as an instruction that contradicts the roster). */
  function rosterIds(scene, outcome) {
    if (!scene.derived || DarkheartSuitability.PARTICIPANT_OUTCOMES.indexOf(outcome) === -1 || !deps.adversaries().length) return [];
    const s = S();
    const r = DarkheartComposer.encounterFor({ scene, outcome, tier: s.tier, heroes: s.heroes, difficulty: s.difficulty, seed: s.scene.encounter.seed, locked: s.scene.encounter.locked, gmTheme: s.scene.encounter.gmTheme, ctx: data.ctx });
    return r.status === 'blocked' ? [] : r.adversaries.map(a => a.id);
  }

  /** A source feature the scene does not apply as written: one adapted line in its place; the original wording sits under Source and adaptation. */
  function adaptedFeatureHtml(a) {
    return `<div class="dh-feature dh-feature--adapted">
      <p class="dh-feature-head"><span class="dh-ftype dh-ftype--${esc(a.feature.type)}">${esc(t('feature_' + a.feature.type))}</span> <strong>${esc(bi(a.feature.name))}</strong> <span class="dh-chip dh-chip--adapted">${esc(t('dh_adapted_chip'))}</span></p>
      <p class="dh-feature-text">${esc(t('dh_adapted_actors'))} <span class="dh-hint-inline">${esc(t('dh_adapted_names'))} ${esc(a.actors.map(id => { const adv = deps.adversaries().find(x => x.id === id); return adv ? bi(adv.name) : id; }).join(', '))}.</span></p>
    </div>`;
  }
  function adaptedSourceHtml(adapted) {
    if (!adapted.length) return '';
    return `<div class="dh-src-adapted"><h5 class="dh-block-label">${esc(t('dh_src_adapted_h'))}</h5>
      ${adapted.map(a => `<blockquote class="dh-src-quote"><p class="dh-feature-head"><strong>${esc(bi(a.feature.name))}</strong></p><p><span class="dh-field-label">${esc(t('dh_src_orig'))}</span> ${esc(bi(a.feature.description))}</p></blockquote>`).join('')}
    </div>`;
  }

  /** The scene's GM Guidance (PD-104): short, optional, outcome-specific suggestions from DarkheartGuidance, with any authored
   * advice for this scene's outcome (`entry.guidance`) kept in the same block. */
  function shownFeatures(scene, env, outcome) {
    if (scene.derived) {
      const p = DarkheartSuitability.featurePlan(env, outcome, deps.adversaries(), rosterIds(scene, outcome));
      return p.active.length ? p.active : (env.features || []);
    }
    const parts = DarkheartComposer.sceneParts(scene, env);
    return parts.whole ? (env.features || []) : parts.features;
  }
  function guidanceHtml(scene, env, outcome, entry) {
    const profile = (data.profiles || {})[scene.envId];
    const role = DarkheartNpc.roleForOutcome(outcome);
    const npc = role && role !== 'neutral-creature' ? S().scene.npc.value : null;
    const g = DarkheartGuidance.guidanceFor({ outcome, env, profile, npc, features: shownFeatures(scene, env, outcome) });
    const authored = entry.guidance ? `
        <p class="dh-gm-authored">${esc(bi(entry.guidance.text))}</p>
        <p class="dh-adjust">${entry.guidance.adjust.map(a => `<span class="dh-chip">${esc(t('dh_adjust_' + a))}</span>`).join(' ')}</p>` : '';
    if (!g && !authored) return '';
    const items = g ? g.items.map(i => `<li><span class="dh-gm-label">${esc(bi(i.label))}</span><span class="dh-gm-text">${esc(bi(i.text))}</span></li>`).join('') : '';
    return `<section class="dh-guidance dh-gm" aria-labelledby="dh-guid-h">
        <h4 id="dh-guid-h" class="dh-block-label">${esc(t('dh_guidance_label'))} <span class="dh-chip">${esc(t('dh_gm_optional'))}</span></h4>
        ${g ? `<p class="dh-hint dh-hint--tight">${esc(bi(g.intro))}</p>` : ''}
        ${items ? `<ul class="dh-gm-list">${items}</ul>` : ''}${authored}
      </section>`;
  }
  function renderGuidance() {
    const slot = host && host.querySelector('#dh-gm');
    const outcome = stageOutcome();
    if (!slot || !outcome || data.status !== 'ready') return;
    const cur = currentScene(outcome);
    const env = cur.scene && deps.environments().find(e => e.id === cur.scene.envId);
    const entry = cur.scene && DarkheartComposer.sceneEntry(cur.scene, outcome);
    if (env && entry) slot.innerHTML = guidanceHtml(cur.scene, env, outcome, entry);
  }

  function renderScene() {
    syncHeroOutcome();
    const outcome = stageOutcome();
    const s = S();
    const el = region('scene');
    if (!el) return;
    const sf = outcome ? sceneFd(s) : null;
    const scenePeek = outcome && data.status === 'ready' ? currentScene(outcome).scene : null;
    const roster = scenePeek ? rosterIds(scenePeek, outcome) : [];
    const sig = [outcome, s.phase, data.status, deps.lang(), s.tier, s.envTier, s.scene.sceneId, s.scene.seed, sf && sf.fd, s.expedition, roster.join(','), s.phase === 'bastion' ? [s.fd, s.fear, s.hexes, ui.confirm, ui.menuOpen].join() : ''].join('|');
    // Typing a die re-renders the scene region; an unchanged scene is left alone, so its picture and text never flash or reflow.
    if (sig === ui.sceneSig && el.firstChild) return;
    ui.sceneSig = sig;
    if (!outcome) {
      if (s.phase === 'bastion') { setRegion('scene', bastionSceneHtml(s)); return; }
      const msg = s.phase === 'retreat' ? 'dh_scene_retreat' : 'dh_scene_waiting';
      setRegion('scene', `<div class="dh-empty"><div class="dh-empty-mark" aria-hidden="true">${I.dice}</div><p>${esc(t(msg))}</p></div>`);
      return;
    }
    if (data.status === 'loading') { setRegion('scene', `${ruleBlock(outcome)}<p class="dh-hint" role="status">${esc(t('dh_scenes_loading'))}</p>`); return; }
    if (data.status === 'error') {
      setRegion('scene', `${ruleBlock(outcome)}<div class="dh-nomatch" role="alert"><p>${esc(t('dh_scenes_error'))}</p><button type="button" class="btn btn-ghost btn-sm" data-dh-act="retry">${esc(t('dh_retry'))}</button></div>`);
      return;
    }
    const cur = currentScene(outcome);
    if (!cur.scene) {
      setRegion('scene', `${ruleBlock(outcome)}<div class="dh-nomatch"><p><strong>${esc(t('dh_nomatch_title'))}</strong></p><p>${esc(t('dh_nomatch_text'))}</p></div>`);
      return;
    }
    const scene = cur.scene;
    const env = deps.environments().find(e => e.id === scene.envId);
    if (!env) { setRegion('scene', `${ruleBlock(outcome)}<div class="dh-nomatch" role="alert"><p>${esc(t('dh_scenes_error'))}</p></div>`); return; }
    const entry = DarkheartComposer.sceneEntry(scene, outcome);
    const parts = DarkheartComposer.sceneParts(scene, env);
    const rule = X.OUTCOME_RULES[outcome];
    const pool = DarkheartComposer.eligibleScenes(data.selectable, outcome).length;
    const matchLabel = t('dh_match_' + scene.match);
    pendingText = [];
    // A derived scene shows the whole environment, with any feature that would contradict the participants adapted (PD-104).
    const plan = scene.derived ? DarkheartSuitability.featurePlan(env, outcome, deps.adversaries(), roster) : null;
    const features = plan ? plan.active : parts.whole ? (env.features || []) : parts.features;
    const featureList = features.map(f => featureHtml(f, env)).join('') + (plan ? plan.adapted.map(adaptedFeatureHtml).join('') : '');
    const profile = (data.profiles || {})[scene.envId];
    const suitRule = DarkheartSuitability.OUTCOME_RULES[outcome];
    const fitTags = scene.derived && profile && suitRule ? (profile.tags || []).filter(tg => suitRule.any === '*' || suitRule.any.indexOf(tg) !== -1) : [];
    const lore = parts.whole && env.lore ? `<p class="dh-lore">${esc(bi(env.lore))}</p>` : '';
    const fdLine = fill(sf.pending ? 'dh_fd_on_arrival' : 'dh_fd_checks_now', { fd: sf.fd })
      + (sf.pending && rule.penalty > 0 ? ' ' + fill('dh_fd_may_rise', { n: rule.penalty }) : '');
    const adaptation = entry.adaptation ? `
      <section class="dh-adapt" aria-labelledby="dh-adapt-h">
        <h4 id="dh-adapt-h" class="dh-block-label">${esc(t('dh_adapted_label'))}</h4>
        <p>${esc(bi(entry.adaptation.summary))}</p>
        <ul class="dh-changes">${entry.adaptation.changes.map(c => `<li><span class="dh-change-src">${esc(t('dh_source_says'))}: “${esc(c.source)}”</span><span class="dh-change-new">${esc(t('dh_use_instead'))}: ${esc(bi(c.adapted))}</span></li>`).join('')}</ul>
      </section>` : '';
    const guidance = '<div id="dh-gm">' + guidanceHtml(scene, env, outcome, entry) + '</div>';
    const leftOut = !parts.whole && parts.leftOut.length ? `<p class="dh-hint"><strong>${esc(t('dh_left_out'))}:</strong> ${esc(parts.leftOut.join(', '))}</p>` : '';
    setRegion('scene', `
      <header class="dh-scene-head">
        <div class="dh-scene-headtext">
          <p class="dh-kicker"><span class="dh-chip dh-chip--${rule.category}">${esc(t('dh_cat_' + rule.category))}</span></p>
          <h3 class="dh-scene-title">${esc(bi(entry.framing.title))}</h3>
        </div>
        <div class="dh-scene-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-dh-act="scene-regen"${pool > 1 ? '' : ' disabled'} title="${esc(t(pool > 1 ? 'dh_regen_scene_tip' : 'dh_regen_scene_one'))}">${I.refresh}<span>${esc(t('dh_regen_scene'))}</span></button>
          <a class="btn btn-ghost btn-sm" href="${esc(deps.envHref(env.id))}">${esc(t('dh_open_env'))}</a>
        </div>
      </header>
      <div class="dh-scene-meta">
        <p class="dh-scene-sub"><span class="dh-chip">${esc(matchLabel)}</span><span class="dh-scene-env">${esc(bi(env.name))}</span>${env.source ? `<span class="dh-source">${esc(env.source)}</span>` : ''}</p>
        ${fitTags.length ? `<p class="dh-fit"><span class="dh-field-label">${esc(t('dh_suit_because'))}</span> ${fitTags.map(tg => `<span class="dh-chip dh-chip--fit">${esc(bi(DarkheartSuitability.TAG_LABELS[tg]))}</span>`).join(' ')}</p>` : ''}
      </div>
      <p class="dh-scene-summary">${esc(bi(entry.framing.summary))}</p>
      ${cur.cycled ? `<p class="dh-hint">${esc(t('dh_pool_cycled'))}</p>` : ''}
      ${ruleBlock(outcome)}
      ${DarkheartNpc.roleForOutcome(outcome) ? '<section id="dh-npc" class="dh-npc-card" aria-label="' + esc(t('dh_npc_title')) + '" hidden></section>' : ''}
      <section class="dh-features${features.length > 1 ? ' is-multi' : ''}" aria-labelledby="dh-feat-h">
        <h4 id="dh-feat-h" class="dh-block-label">${esc(t('dh_features_label'))}</h4>
        <p class="dh-fd-note"><span class="dh-chip dh-chip--countdown">${esc(t('dh_fd_short'))} ${sf.fd}</span><span>${esc(fdLine)}</span></p>
        ${rosterNoteHtml(scene)}
        ${lore}
        <div class="dh-feature-list">${featureList}</div>
      </section>
      ${guidance}
      <details class="dh-src"><summary>${esc(t('dh_src_adapt'))}</summary>
        <div class="dh-src-body">
          <p class="dh-hint dh-hint--tight">${esc(t('dh_src_from'))} <strong>${esc(bi(env.name))}</strong>${env.source ? ` · ${esc(env.source)}` : ''}. ${esc(t('dh_src_untouched'))}</p>
          ${leftOut}${plan ? adaptedSourceHtml(plan.adapted) : ''}${adaptation}
          ${envTierControl(s)}
        </div>
      </details>`);
    const d = el.querySelector('.dh-src');
    if (d) { d.open = !!ui.srcOpen; d.addEventListener('toggle', () => { ui.srcOpen = d.open; }); }
    fillPendingText();
    renderNpc();      // the NPC card lives inside the scene card, right after the rule, so it is rebuilt with it
  }

  /* ---------- NPC ---------- */

  const AVATAR = {
    round: '', pointed: '<path d="M18 30 8 24l7 12zM46 30l10-6-7 12z" />', beard: '<path d="M22 38c2 14 18 14 20 0-4 4-16 4-20 0z" class="dh-av-hair"/>',
    curls: '<circle cx="24" cy="20" r="5" class="dh-av-hair"/><circle cx="32" cy="17" r="5" class="dh-av-hair"/><circle cx="40" cy="20" r="5" class="dh-av-hair"/>',
    bigears: '<ellipse cx="14" cy="30" rx="7" ry="4" transform="rotate(-18 14 30)"/><ellipse cx="50" cy="30" rx="7" ry="4" transform="rotate(18 50 30)"/>',
    tusks: '<path d="M26 40l-2 7 5-4zM38 40l2 7-5-4z" class="dh-av-tusk"/>',
    horns: '<path d="M22 19c-8-2-10-10-6-14 0 6 4 9 8 10zM42 19c8-2 10-10 6-14 0 6-4 9-8 10z" class="dh-av-horn"/>',
    cat: '<path d="M19 22 17 8l11 8zM45 22l2-14-11 8z"/>',
    wings: '<ellipse cx="14" cy="34" rx="9" ry="14" class="dh-av-wing" transform="rotate(-20 14 34)"/><ellipse cx="50" cy="34" rx="9" ry="14" class="dh-av-wing" transform="rotate(20 50 34)"/>',
    antlers: '<path d="M24 18 20 6M20 6l-6 2M20 6l4-3M40 18l4-12M44 6l6 2M44 6l-4-3" class="dh-av-antler"/>',
    cap: '<path d="M16 24c0-12 10-16 16-16s16 4 16 16z" class="dh-av-cap"/>',
    shell: '<path d="M10 56c0-16 10-22 22-22s22 6 22 22z" class="dh-av-shell"/>',
  };
  /* Backdrops for the portrait: the site's own washes, picked by the generated NPC's own seed and palette, so one NPC always has one look. */
  const AVATAR_GROUNDS = ['var(--ink-raised)', 'color-mix(in srgb, var(--teal) 30%, var(--ink-raised))', 'color-mix(in srgb, var(--hope) 16%, var(--ink-raised))', 'color-mix(in srgb, var(--fear) 24%, var(--ink-raised))'];
  function avatarSvg(npc) {
    const c = DarkheartNpc.paletteColors(npc.avatar.palette);
    const feat = AVATAR[npc.avatar.shape] || '';
    const ground = AVATAR_GROUNDS[((npc.seed || 0) + (npc.avatar.palette || 0)) % AVATAR_GROUNDS.length];
    return `<svg class="dh-avatar-svg" viewBox="0 0 64 64" role="img" aria-label="${esc(bi(npc.name))}" style="--av-skin:${c.skin};--av-shade:${c.shade};--av-ground:${ground}">
      <defs><clipPath id="dh-av-clip"><circle cx="32" cy="32" r="30"/></clipPath></defs>
      <g clip-path="url(#dh-av-clip)">
        <rect width="64" height="64" class="dh-av-bg"/>
        <g class="dh-av-feat">${feat}</g>
        <path d="M8 64c2-14 12-18 24-18s22 4 24 18z" class="dh-av-body"/>
        <circle cx="32" cy="29" r="12" class="dh-av-head"/>
        <circle cx="27.5" cy="28" r="1.5" class="dh-av-eye"/><circle cx="36.5" cy="28" r="1.5" class="dh-av-eye"/>
      </g>
      <circle cx="32" cy="32" r="30" class="dh-av-ring"/>
    </svg>`;
  }

  function renderNpc() {
    const s = S();
    const outcome = s.scene.outcome && stageOutcome() === s.scene.outcome ? s.scene.outcome : null;
    const role = DarkheartNpc.roleForOutcome(outcome);
    const slot = region('npc');
    if (!slot) return;
    if (!role) { slot.innerHTML = ''; slot.hidden = true; return; }
    slot.hidden = false;
    const npc = s.scene.npc.value;
    const heading = `<h3 class="dh-panel-title">${esc(t('dh_npc_title'))} <span class="dh-chip">${esc(t('dh_npc_role_' + role))}</span></h3>`;
    if (!npc) {
      setRegion('npc', `${heading}<p class="dh-hint">${esc(t('dh_npc_optional'))}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="npc-make">${esc(t('dh_npc_make'))}</button>`);
      return;
    }
    const locked = s.scene.npc.locked;
    renderGuidance();      // the NPC's situation decides where the guidance puts them
    setRegion('npc', `
      ${heading}
      <div class="dh-npc">
        <div class="dh-avatar">${avatarSvg(npc)}</div>
        <div class="dh-npc-id">
          <p class="dh-npc-name">${esc(bi(npc.name))}</p>
          <p class="dh-npc-anc"><span class="dh-chip">${esc(bi(npc.ancestry))}</span></p>
        </div>
      </div>
      <blockquote class="dh-quote"><p>“${esc(bi(npc.line))}”</p></blockquote>
      <dl class="dh-npc-facts">
        <div><dt class="dh-field-label">${esc(t('dh_npc_look'))}</dt><dd>${esc(bi(npc.look))}</dd></div>
        <div><dt class="dh-field-label">${esc(t('dh_npc_need'))}</dt><dd>${esc(bi(npc.need))}</dd></div>
      </dl>
      <div class="dh-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="npc-regen"${locked ? ' disabled' : ''}>${I.refresh}<span>${esc(t('dh_npc_regen'))}</span></button>
        <button type="button" class="btn btn-ghost btn-sm dh-lock${locked ? ' is-on' : ''}" data-dh-act="npc-lock" aria-pressed="${locked}">${locked ? I.lock : I.unlock}<span>${esc(t(locked ? 'dh_locked' : 'dh_lock'))}</span></button>
      </div>`);
  }

  /* ---------- encounter ---------- */

  function advName(a) { return bi(a.name); }

  /** The roster as a set of adversaries and quantities, ignoring order: two seeds that deal the same set are the same encounter. */
  const rosterSig = r => r.adversaries.map(a => a.id + ':' + a.quantity).sort().join('|');
  const ENC_SEED_PROBES = 12;
  /** The nearest later seed that deals a genuinely different roster (what "New encounter" will show), or null when the pool has no alternative. */
  function nextDistinctEncSeed(s, outcome, scene, current) {
    const base = s.scene.encounter.seed;
    const args = seed => ({ scene, outcome, tier: s.tier, heroes: s.heroes, difficulty: s.difficulty, seed, locked: s.scene.encounter.locked, gmTheme: s.scene.encounter.gmTheme, ctx: data.ctx });
    const now = rosterSig(current);
    for (let k = 1; k <= ENC_SEED_PROBES; k++) {
      const r = DarkheartComposer.encounterFor(args(base + k));
      if (r.status !== 'blocked' && rosterSig(r) !== now) return base + k;
    }
    return null;
  }

  function renderEncounter() {
    const el = region('encounter');
    const s = S();
    const outcome = s.scene.outcome && stageOutcome() === s.scene.outcome ? s.scene.outcome : null;
    if (!outcome || data.status !== 'ready') { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const cur = currentScene(outcome);
    const catalogReady = deps.adversaries().length > 0;
    const heading = `<h3 class="dh-panel-title">${esc(t('dh_enc_title'))}</h3>`;
    if (!cur.scene) { el.innerHTML = `${heading}<p class="dh-hint">${esc(t('dh_enc_nomatch'))}</p>`; return; }
    if (!catalogReady) { el.innerHTML = `${heading}<p class="dh-hint" role="alert">${esc(t('dh_enc_catalog_error'))}</p>`; return; }
    const r = DarkheartComposer.encounterFor({
      scene: cur.scene, outcome, tier: s.tier, heroes: s.heroes, difficulty: s.difficulty,
      seed: s.scene.encounter.seed, locked: s.scene.encounter.locked, gmTheme: s.scene.encounter.gmTheme, ctx: data.ctx,
    });
    if (r.status === 'blocked') { el.innerHTML = `${heading}<p class="dh-hint" role="alert">${esc(t('dh_enc_blocked'))}</p>`; return; }
    const posture = r.combat;
    const postureNote = `<p class="dh-hint dh-hint--tight">${esc(t('dh_enc_posture_' + posture))}</p>${cur.scene.encounter && cur.scene.encounter.sourceRoster ? `<p class="dh-hint dh-hint--tight dh-hint--source">${esc(t('dh_enc_source_hint'))}</p>` : ''}`;
    el.classList.remove('dh-card--slim');
    if (posture === 'none' && !r.adversaries.length) {
      el.classList.add('dh-card--slim');
      el.innerHTML = `<div class="dh-slim"><h3 class="dh-panel-title">${esc(t('dh_enc_title'))}</h3>${postureNote}</div>`;
      return;
    }
    const diff = ['easier', 'standard', 'harder'].map(d => `<button type="button" role="radio" class="dh-seg${s.difficulty === d ? ' is-on' : ''}" aria-checked="${s.difficulty === d}" data-dh-act="difficulty" data-dh-value="${d}">${esc(t('dh_diff_' + d))}</button>`).join('');
    const bp = r.battlePoints;
    const mods = bp.modifiers.filter(m => m.applied).map(m => `${esc(t('dh_mod_' + m.id.replace(/-/g, '_')))} ${m.value > 0 ? '+' : '−'}${Math.abs(m.value)}`);
    const over = bp.spent > bp.available;
    const fillPct = bp.available > 0 ? Math.max(0, Math.min(100, Math.round(bp.spent / bp.available * 100))) : 0;
    const lockedIds = new Set(s.scene.encounter.locked.map(l => l.id));
    const canRegen = nextDistinctEncSeed(s, outcome, cur.scene, r) != null;
    const rows = r.adversaries.map(a => `
      <li class="dh-adv${a.locked ? ' is-locked' : ''}">
        <span class="dh-adv-qty dh-mono">${a.quantity}×</span>
        <span class="dh-adv-main"><strong>${esc(advName(a))}</strong>
          <span class="dh-adv-meta"><span class="dh-chip">${esc(t('adversary_type_' + a.role))}</span><span class="dh-chip">${esc(t('dh_tier'))} ${a.tier}</span>${a.crossTier ? `<span class="dh-chip dh-chip--warn">${esc(t('dh_cross_tier'))}</span>` : ''}${a.minionGroups ? `<span class="dh-chip">${esc(t('dh_minion_group'))} ×${a.minionGroups}</span>` : ''}</span></span>
        <span class="dh-adv-cost" title="${esc(t('dh_bp'))}"><strong class="dh-mono">${esc(fmt(a.lineCost))}</strong> <span class="dh-adv-cost-unit">${esc(t('dh_bp_unit'))}</span></span>
        <button type="button" class="dh-icon-toggle${lockedIds.has(a.id) ? ' is-on' : ''}" data-dh-act="adv-lock" data-dh-value="${esc(a.id)}" data-dh-qty="${a.quantity}" aria-pressed="${lockedIds.has(a.id)}" aria-label="${esc(t(lockedIds.has(a.id) ? 'dh_unlock_adv' : 'dh_lock_adv'))}: ${esc(advName(a))}">${lockedIds.has(a.id) ? I.lock : I.unlock}</button>
      </li>`).join('');
    // Balance warnings stay in view; explanations of the pool (who was left out, why a pick) go behind "Why these adversaries".
    const KEEP = ['cross-tier-used', 'variety-limits'];
    const shown = r.warnings.filter(w => w.severity === 'warning' || KEEP.includes(w.code));
    const quiet = r.warnings.filter(w => !(w.severity === 'warning' || KEEP.includes(w.code)));
    const warnings = shown.map(w => `<li class="is-warn"><span aria-hidden="true">⚠</span> ${esc(bi(w.text))}</li>`).join('');
    const supported = r.builder.entries;
    const names = supported.map(e => e.name);
    const url = names.length ? deps.fcgUrl(bi(cur.scene.outcomes.find(o => o.outcome === outcome).framing.title), names) : null;
    const whyLines = r.adversaries.map(a => `<li><strong>${esc(advName(a))}:</strong> ${esc(bi(a.reason))}</li>`)
      .concat(r.reasoning.filter(x => x.code === 'budget' || x.code === 'minion-group').map(x => `<li>${esc(bi(x.text))}</li>`))
      .concat(quiet.map(w => `<li>${esc(bi(w.text))}</li>`)).join('');
    const entryWiring = DarkheartComposer.sceneEntry(cur.scene, outcome).encounter;
    const sceneThemes = entryWiring ? entryWiring.themes : (cur.scene.encounter && cur.scene.encounter.themes) || [];
    const affinityThemes = (data.ctx.affinity && data.ctx.affinity.themes) || {};
    const chosen = s.scene.encounter.gmTheme;
    // A scene with no adversary theme offers an explicit, optional choice instead of picking enemies itself.
    const themePicker = !sceneThemes.length && posture !== 'none' ? `
      <div class="dh-theme" role="group" aria-label="${esc(t('dh_gm_theme'))}">
        <span class="dh-field-label">${esc(t('dh_gm_theme'))}</span>
        <p class="dh-hint dh-hint--tight">${esc(t(chosen ? 'dh_gm_theme_chosen' : 'dh_gm_theme_hint'))}</p>
        <div class="dh-theme-chips">${Object.keys(affinityThemes).map(id => `<button type="button" class="dh-chip-btn${chosen === id ? ' is-on' : ''}" aria-pressed="${chosen === id}" data-dh-act="gm-theme" data-dh-value="${chosen === id ? '' : esc(id)}">${esc(bi(affinityThemes[id].name))}</button>`).join('')}</div>
      </div>` : '';
    const body = `
      <div class="dh-enc-bar">
        <div class="dh-segs" role="radiogroup" aria-label="${esc(t('dh_difficulty'))}">${diff}</div>
        <div class="dh-bp${over ? ' is-over' : ''}" role="group" aria-label="${esc(t('dh_bp'))}">
          <span class="dh-bp-num dh-mono"><strong>${esc(fmt(bp.spent))}</strong> / ${esc(fmt(bp.available))} <span class="dh-bp-label">${esc(t('dh_bp_unit'))}</span></span>
          <span class="dh-bp-bar" aria-hidden="true"><span style="width:${fillPct}%"></span></span>
          <span class="dh-bp-detail">${esc(t('dh_bp_base'))} ${bp.baseBudget}${mods.length ? ' · ' + mods.join(' · ') : ''}</span>
        </div>
      </div>
      ${themePicker}
      ${rows ? `<ul class="dh-advs">${rows}</ul>` : `<p class="dh-hint">${esc(t('dh_enc_none'))}</p>`}
      ${warnings ? `<ul class="dh-warnings">${warnings}</ul>` : ''}
      ${whyLines ? `<details class="dh-why"><summary>${esc(t('dh_enc_why'))}</summary><ul>${whyLines}</ul></details>` : ''}
      <div class="dh-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="enc-regen"${canRegen ? '' : ` disabled title="${esc(t('dh_enc_regen_none'))}"`}>${I.refresh}<span>${esc(t('dh_enc_regen'))}</span></button>
        ${url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${I.external}<span>${esc(t('dh_fcg'))}</span></a>` : ''}
      </div>
      ${url && supported.some(e => e.quantity > 1) ? `<p class="dh-hint">${esc(t('dh_fcg_qty_note'))}</p>` : ''}`;
    if (posture === 'recommended') el.innerHTML = `${heading}${postureNote}${body}`;
    else {
      // Optional / prepared: never forced — one slim row until the Master asks for it.
      el.classList.toggle('dh-card--slim', !ui.encOpen);
      el.innerHTML = `<details class="dh-opt"${ui.encOpen ? ' open' : ''}><summary><span class="dh-opt-title">${esc(t('dh_enc_title'))}</span><span class="dh-opt-sub">${esc(t('dh_enc_optional_summary'))}</span></summary>${postureNote}${body}</details>`;
      const d = el.querySelector('details');
      if (d) d.addEventListener('toggle', () => { ui.encOpen = d.open; el.classList.toggle('dh-card--slim', !d.open); });
    }
  }
  const fmt = n => BattlePoints.formatBP(n);

  /* ---------- history ---------- */

  function renderHistory() {
    const s = S();
    const item = e => e.kind === 'bastion'
      ? `<li><span class="dh-mono">#${e.n}</span> ${esc(t('dh_log_bastion'))} <span class="dh-hint-inline">${esc(t('dh_fd_short'))} ${e.fd}</span></li>`
      : `<li><span class="dh-mono">#${e.n}</span> ${esc(bi(X.OUTCOME_RULES[e.outcome].title))}${e.kind === 'retreat-failed' ? ` <span class="dh-chip dh-chip--warn">${esc(t('dh_via_retreat'))}</span>` : ''} <span class="dh-hint-inline">${esc(t('dh_fd_short'))} ${e.fd}</span></li>`;
    const items = s.log.slice().reverse().map(item).join('');
    setRegion('history', `<details class="dh-hist"><summary>${esc(t('dh_history'))} (${s.log.length})</summary>${items ? `<ol class="dh-log">${items}</ol>` : `<p class="dh-hint">${esc(t('dh_history_empty'))}</p>`}</details>`);
    const d = region('history').querySelector('details');
    if (d) { d.open = !!ui.histOpen; d.addEventListener('toggle', () => { ui.histOpen = d.open; }); }
  }

  /* ---------------- commands ---------------- */

  function apply(res, opts) {
    if (!res.ok) { announce(res.reason); return false; }
    deps.set(res.state);
    if (opts && opts.restructure) renderAll(); else renderAll();
    return true;
  }
  function announce(reason) {
    const key = { 'no-rest-here': 'dh_rest_none', 'long-rest-required': 'dh_rest_limit_reached', trapped: 'dh_trapped_text', 'cannot-retreat-now': 'dh_retreat_unavailable', 'no-hex-yet': 'dh_retreat_unavailable' }[reason];
    if (key) deps.toast(t(key), 'info');
  }

  function act(name, value, el) {
    const s = S();
    switch (name) {
      case 'tier': return apply(X.setParty(s, { tier: Number(value) }));
      case 'heroes-': return apply(X.setParty(s, { heroes: s.heroes - 1 }));
      case 'heroes+': return apply(X.setParty(s, { heroes: s.heroes + 1 }));
      case 'difficulty': return apply(X.setParty(s, { difficulty: value }));
      case 'env-tier': return apply(X.setEnvTier(s, value === 'auto' ? null : Number(value)));
      case 'fd-': return apply(X.adjustFd(s, -1));
      case 'fd+': return apply(X.adjustFd(s, 1));
      case 'fear-': return apply(X.adjustFear(s, -1));
      case 'fear+': return apply(X.adjustFear(s, 1));
      case 'undo': ui = Object.assign(freshUi(), { histOpen: ui.histOpen, partyOpen: ui.partyOpen }); return apply(X.undo(s));
      case 'help-toggle': ui.helpOpen = !ui.helpOpen; return renderStatus();
      case 'party-toggle': ui.partyOpen = !ui.partyOpen; return renderStatus();
      case 'menu-toggle': ui.menuOpen = !ui.menuOpen; if (!ui.menuOpen) ui.confirm = null; ui.sceneSig = ''; renderStatus(); return renderScene();
      case 'expedition-ask': ui.confirm = 'expedition'; ui.menuOpen = true; return renderStatus();
      case 'campaign-ask': ui.confirm = 'campaign'; ui.sceneSig = ''; renderStatus(); return renderScene();
      case 'confirm-no': ui.confirm = null; ui.sceneSig = ''; renderStatus(); return renderScene();
      case 'expedition-yes': ui = Object.assign(freshUi(), { histOpen: ui.histOpen, partyOpen: ui.partyOpen }); return apply(X.startExpedition(s));
      case 'campaign-yes': ui = Object.assign(freshUi(), { histOpen: ui.histOpen, partyOpen: ui.partyOpen }); return apply(X.newCampaign(s));
      case 'retreat-open': ui.menuOpen = false; return apply(X.beginRetreat(s));
      case 'retreat-cancel': return apply(X.cancelRetreat(s));
      case 'retreat-danger': return apply(X.setRetreatDanger(s, value === 'yes'));
      case 'retreat-declare': case 'retreat-escape': {
        const res = X.completeRetreat(s, { gainFear: ui.gainFear });
        if (res.ok) { ui = Object.assign(freshUi(), { histOpen: ui.histOpen, partyOpen: ui.partyOpen }); deps.set(res.state); renderAll(); focusRegion('preview'); } else announce(res.reason);
        return res.ok;
      }
      case 'retreat-fail': {
        const res = X.confirmRetreatFailure(s, { penalty: ui.penalty, gainFear: ui.gainFear });
        if (res.ok) { ui = Object.assign(freshUi(), { histOpen: ui.histOpen, partyOpen: ui.partyOpen }); deps.set(res.state); renderAll(); focusRegion('preview'); } else announce(res.reason);
        return res.ok;
      }
      case 'confirm': {
        const res = X.confirmArrival(s, { penalty: ui.penalty, gainFear: ui.gainFear });
        if (res.ok) { deps.set(res.state); ui = Object.assign(freshUi(), { histOpen: ui.histOpen, partyOpen: ui.partyOpen }); renderAll(); focusRegion('preview'); }
        else announce(res.reason);
        return res.ok;
      }
      case 'next': { const res = X.nextTraversal(s); if (res.ok) { deps.set(res.state); ui = Object.assign(freshUi(), { histOpen: ui.histOpen, partyOpen: ui.partyOpen }); renderAll(); const first = host.querySelector('#dh-die-hope'); if (first) first.focus(); } return res.ok; }
      case 'rest': {
        const q = id => host.querySelector(id);
        const manual = (el, lo, hi) => { const n = el && el.value.trim() !== '' ? Number(el.value) : NaN; return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
        const roll = n => deps.rollDie(n);
        const res = X.rest(s, {
          kind: value,
          whisper: !!(q('#dh-rest-whisper') && q('#dh-rest-whisper').checked),
          gainFear: !!(q('#dh-rest-fear') && q('#dh-rest-fear').checked),
          fearRoll: manual(q('#dh-rest-mfear'), 1, 4) || roll(4),
          fdRoll: manual(q('#dh-rest-mfd'), 1, 2) || roll(2),
        });
        if (res.ok) { ui.manualFear = ''; ui.manualFd = ''; }
        return apply(res);
      }
      case 'gm-theme': {
        const enc = Object.assign({}, s.scene.encounter, { gmTheme: value || null });
        deps.set(X.setScene(s, Object.assign({}, s.scene, { encounter: enc })).state);
        return renderEncounter();
      }
      case 'scene-regen': return regenScene();
      case 'npc-make': makeNpc(false); return renderAll();
      case 'npc-regen': makeNpc(true); return renderNpc();
      case 'npc-lock': {
        const n = s.scene.npc;
        deps.set(X.setScene(s, Object.assign({}, s.scene, { npc: Object.assign({}, n, { locked: !n.locked }) })).state);
        return renderNpc();
      }
      case 'enc-regen': {
        // Only a seed that really changes the roster: never a reshuffle of the same adversaries, never a no-op press.
        const outcome = s.scene.outcome && stageOutcome() === s.scene.outcome ? s.scene.outcome : null;
        const cur = outcome ? currentScene(outcome) : null;
        if (!cur || !cur.scene) return false;
        const now = DarkheartComposer.encounterFor({ scene: cur.scene, outcome, tier: s.tier, heroes: s.heroes, difficulty: s.difficulty, seed: s.scene.encounter.seed, locked: s.scene.encounter.locked, gmTheme: s.scene.encounter.gmTheme, ctx: data.ctx });
        const seed = nextDistinctEncSeed(s, outcome, cur.scene, now);
        if (seed == null) return false;
        deps.set(X.setScene(s, Object.assign({}, s.scene, { encounter: Object.assign({}, s.scene.encounter, { seed }) })).state);
        renderEncounter(); return renderScene();
      }
      case 'adv-lock': {
        const list = s.scene.encounter.locked;
        const has = list.some(l => l.id === value);
        const next = has ? list.filter(l => l.id !== value) : list.concat([{ id: value, quantity: Number(el.dataset.dhQty) || 1 }]).slice(0, 8);
        deps.set(X.setScene(s, Object.assign({}, s.scene, { encounter: Object.assign({}, s.scene.encounter, { locked: next }) })).state);
        renderEncounter(); return renderScene();
      }
      case 'to-scene': return goToScene();
      case 'retry': return deps.retryData().then(load);
      default: return false;
    }
  }

  function regenScene() {
    const s = S();
    const outcome = stageOutcome();
    if (!outcome || data.status !== 'ready') return;
    const shown = s.scene.sceneId;
    const dealt = Object.assign({}, s.scene.dealt);
    if (shown) dealt[outcome] = (dealt[outcome] || []).filter(id => id !== shown).concat([shown]);
    // Only the scene changes: the roll, the NPC and the adversary locks stay as they are.
    const scene = Object.assign({}, s.scene, { seed: (s.scene.seed || 0) + 1, dealt, sceneId: null });
    deps.set(X.setScene(s, scene).state);
    renderAll();
  }

  /** Moves the reader to the scene card: a view-only jump (no state, no regeneration). Smooth only when the user has not asked for reduced
   * motion; css `scroll-margin-top` keeps the sticky header off the destination; focus moves there without a second scroll. */
  function goToScene() {
    const el = region('scene');
    if (!el) return false;
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    return true;
  }

  function focusRegion(id) { const el = region(id); if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } }

  /* ---------------- events ---------------- */

  function bindEvents() {
    onClick = e => {
      const btn = e.target.closest('[data-dh-act]');
      if (!btn || !host.contains(btn) || btn.disabled) return;
      e.preventDefault();
      act(btn.dataset.dhAct, btn.dataset.dhValue, btn);
      // A control that was rebuilt under the pointer keeps keyboard focus (steppers, tier, toggles), unless the action moved focus on purpose.
      if (!document.contains(btn) && host && (document.activeElement === document.body || !host.contains(document.activeElement))) {
        const v = btn.dataset.dhValue;
        const again = host.querySelector(`[data-dh-act="${btn.dataset.dhAct}"]${v != null ? `[data-dh-value="${v}"]` : ''}`);
        if (again && !again.disabled) again.focus({ preventScroll: true });
      }
    };
    onKey = e => {
      if (e.key !== 'Escape') return;
      if (ui.menuOpen) { ui.menuOpen = false; ui.confirm = null; ui.sceneSig = ''; renderStatus(); renderScene(); const b = host.querySelector('.dh-menu-btn'); if (b) b.focus(); }
    };
    onInput = e => {
      const el = e.target;
      if (el.matches('[data-dh-die]')) {
        const k = el.dataset.dhDie;
        const raw = el.value.trim();
        let patch;
        ui.badDie[k] = false;
        if (raw === '') patch = { [k]: null };
        else if (/^-?\d+$/.test(raw)) patch = { [k]: Number(raw) };
        else { ui.badDie[k] = true; patch = { [k]: null }; }
        const res = X.setDice(S(), patch);
        if (res.ok) deps.set(res.state);
        syncComposition();
        renderPreview(); renderScene(); renderNpc(); renderEncounter();
      } else if (el.matches('[data-dh-gainfear]')) { ui.gainFear = el.checked; renderPreview(); }
      else if (el.id === 'dh-rest-mfear') ui.manualFear = el.value;
      else if (el.id === 'dh-rest-mfd') ui.manualFd = el.value;
    };
    onChange = e => {
      if (e.target.matches('input[name="dh-penalty"]')) { ui.penalty = e.target.value; renderPreview(); }
      else if (e.target.matches('[data-dh-setting]')) { const res = X.setSettings(S(), { [e.target.dataset.dhSetting]: e.target.checked }); deps.set(res.state); renderAll(); }
      else if (e.target.id === 'dh-rest-whisper') ui.restWhisper = e.target.checked;
      else if (e.target.id === 'dh-rest-fear') ui.restFear = e.target.checked;
    };
    host.addEventListener('click', onClick);
    host.addEventListener('keydown', onKey);
    host.addEventListener('input', onInput);
    host.addEventListener('change', onChange);
  }

  /* ---------------- mount ---------------- */

  async function load() {
    data = { status: 'loading' };
    renderAll();
    const token = mountToken;
    try {
      const loaded = await deps.loadData();
      if (token !== mountToken) return;
      data = Object.assign({ status: 'ready' }, loaded);
    } catch (err) {
      if (token !== mountToken) return;
      data = { status: 'error' };
    }
    renderAll();
  }

  function mount(el, dependencies) {
    unmount();
    host = el;
    deps = dependencies;
    ui = freshUi();
    mountToken += 1;
    host.innerHTML = `
      <div class="dh-page">
        <header id="dh-hero" class="dh-hero">
          <div class="dh-hero-art" aria-hidden="true"><span class="dh-hero-label">${esc(t('dh_art_placeholder'))}</span></div>
          <h2 class="dh-title">${esc(t('dh_title'))}</h2>
        </header>
        <section id="dh-status" class="dh-status" aria-label="${esc(t('dh_status_label'))}"></section>
        <div class="dh-layout">
          <aside class="dh-side">
            <section class="dh-card dh-roll" aria-labelledby="dh-roll-h">
              <h3 id="dh-roll-h" class="dh-panel-title">${I.dice}<span id="dh-roll-title">${esc(t('dh_wayfinder'))}</span></h3>
              <div id="dh-roll"></div>
            </section>
          </aside>
          <main class="dh-main">
            <section id="dh-scene" class="dh-card dh-scene" aria-live="polite" aria-label="${esc(t('dh_scene_label'))}"></section>
            <div class="dh-tools">
              <section id="dh-encounter" class="dh-card dh-enc-card" hidden></section>
            </div>
            <div id="dh-history"></div>
          </main>
        </div>
      </div>`;
    bindEvents();
    renderAll();
    load();
  }

  function unmount() {
    if (!host) return;
    mountToken += 1;
    host.removeEventListener('click', onClick);
    host.removeEventListener('keydown', onKey);
    host.removeEventListener('input', onInput);
    host.removeEventListener('change', onChange);
    host = null; deps = null;
  }

  return { mount, unmount };
})();
