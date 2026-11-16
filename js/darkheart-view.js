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
  let onClick = null, onInput = null, onChange = null;
  let mountToken = 0;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const t = key => deps.t(key);
  const bi = v => (v && (v[deps.lang()] || v.en)) || '';
  const S = () => deps.get();

  function freshUi() { return { confirm: null, menuOpen: false, penalty: 'fd', gainFear: true, badDie: {}, restWhisper: true, restFear: true, manualFear: '', manualFd: '', npcOpen: false, encOpen: false }; }
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
    const value = DarkheartNpc.generateNpc({ outcome: s.scene.outcome, sceneId: s.scene.sceneId, seed });
    if (!value) return;
    deps.set(X.setScene(s, Object.assign({}, s.scene, { npc: { seed, locked: false, value } })).state);
  }

  /* ---------------- region renderers ---------------- */

  function region(id) { return host && host.querySelector('#dh-' + id); }
  function setRegion(id, html) { const el = region(id); if (el) el.innerHTML = html; }

  function renderAll() {
    syncComposition();
    renderStatus(); renderParty(); renderRoll(); renderScene(); renderNpc(); renderEncounter(); renderHistory();
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

  function renderStatus() {
    const s = S();
    const trapped = s.trapped;
    const fdDanger = s.fd >= 25;
    const canRetreat = s.hexes > 0 && (s.phase === 'roll' || s.phase === 'arrived') && !trapped;
    setRegion('status', `
      <div class="dh-stat dh-stat--fd${fdDanger ? ' is-danger' : ''}${trapped ? ' is-trapped' : ''}">
        <span class="dh-stat-label" id="dh-fd-label">${esc(t('dh_forest_difficulty'))}</span>
        <div class="dh-stat-row">
          <button type="button" class="dh-step-btn" data-dh-act="fd-" aria-label="${esc(t('dh_fd_down'))}"${s.fd <= X.FD_START ? ' disabled' : ''}>${I.minus}</button>
          <output class="dh-stat-num" aria-labelledby="dh-fd-label">${s.fd}</output>
          <button type="button" class="dh-step-btn" data-dh-act="fd+" aria-label="${esc(t('dh_fd_up'))}">${I.plus}</button>
        </div>
        <span class="dh-stat-note">${esc(t('dh_fd_note'))}</span>
      </div>
      <div class="dh-stat dh-stat--fear">
        <span class="dh-stat-label" id="dh-fear-label">${esc(t('dh_gm_fear'))}</span>
        <div class="dh-stat-row">
          <button type="button" class="dh-step-btn" data-dh-act="fear-" aria-label="${esc(t('dh_fear_down'))}"${s.fear <= 0 ? ' disabled' : ''}>${I.minus}</button>
          <output class="dh-stat-num" aria-labelledby="dh-fear-label">${s.fear}</output>
          <button type="button" class="dh-step-btn" data-dh-act="fear+" aria-label="${esc(t('dh_fear_up'))}"${s.fear >= X.FEAR_MAX ? ' disabled' : ''}>${I.plus}</button>
        </div>
        <span class="dh-stat-note">${esc(t('dh_fear_note'))}</span>
      </div>
      <div class="dh-stat dh-stat--hexes">
        <span class="dh-stat-label">${esc(t('dh_expedition'))} ${s.expedition}</span>
        <output class="dh-stat-num" aria-label="${esc(t('dh_hexes'))}">${s.hexes}</output>
        <span class="dh-stat-note">${esc(t('dh_hexes'))} · ${esc(t('dh_hexes_note'))}</span>
      </div>
      <div class="dh-status-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="undo"${s.undo.length ? '' : ' disabled'}>${I.undo}<span>${esc(t('dh_undo'))}</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="retreat-open"${canRetreat ? '' : ' disabled'} title="${esc(t(canRetreat ? 'dh_retreat_tip' : 'dh_retreat_unavailable'))}">${esc(t('dh_return_bastion'))}</button>
        <details class="dh-menu"${ui.menuOpen || ui.confirm ? ' open' : ''}><summary class="btn btn-ghost btn-sm">${esc(t('dh_expedition_menu'))}</summary>
          <div class="dh-menu-panel">
            <button type="button" class="btn btn-ghost btn-sm" data-dh-act="expedition-ask">${esc(t('dh_new_expedition'))}</button>
            <p class="dh-hint">${esc(t('dh_new_expedition_hint'))}</p>
            <button type="button" class="btn btn-ghost btn-sm" data-dh-act="campaign-ask">${esc(t('dh_new_campaign'))}</button>
            <p class="dh-hint">${esc(t('dh_new_campaign_hint'))}</p>
            ${confirmBlock()}
            ${settingsHtml(s)}
          </div></details>
      </div>
      ${trapped ? `<p class="dh-trapped" role="alert"><strong>${esc(t('dh_trapped_title'))}</strong> ${esc(t('dh_trapped_text'))}</p>` : ''}`);
    const d = region('status').querySelector('.dh-menu');
    if (d) d.addEventListener('toggle', () => { ui.menuOpen = d.open; });
  }

  function renderParty() {
    const s = S();
    const tiers = [1, 2, 3, 4].map(n => `<button type="button" role="radio" class="dh-seg${s.tier === n ? ' is-on' : ''}" aria-checked="${s.tier === n}" data-dh-act="tier" data-dh-value="${n}">${n}</button>`).join('');
    setRegion('party', `
      <div class="dh-field">
        <span class="dh-field-label" id="dh-tier-label">${esc(t('dh_party_tier'))}</span>
        <div class="dh-segs" role="radiogroup" aria-labelledby="dh-tier-label">${tiers}</div>
      </div>
      <div class="dh-field">
        <span class="dh-field-label" id="dh-heroes-label">${esc(t('dh_heroes'))}</span>
        ${stepper('heroes', s.heroes, t('dh_heroes'), t('dh_heroes_down'), t('dh_heroes_up'), X.HEROES_MIN, X.HEROES_MAX)}
      </div>`);
  }

  function rollBadge(p) {
    const withWhat = p.rolledWith === 'critical' ? t('dh_critical') : (p.rolledWith === 'hope' ? t('dh_with_hope') : t('dh_with_fear'));
    return `<span class="dh-badge ${p.success ? 'is-success' : 'is-fail'}">${esc(p.success ? t('dh_success') : t('dh_failure'))}</span><span class="dh-badge dh-badge--${p.rolledWith}">${esc(withWhat)}</span>`;
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
    if (title) title.textContent = s.phase === 'retreat' ? t('dh_retreat_title') : s.phase === 'bastion' ? t('dh_in_bastion') : t('dh_wayfinder');
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
    if (s.phase === 'arrived' && s.arrival) { el.innerHTML = arrivedHtml(s); return; }
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
      <div class="dh-result">
        <p class="dh-result-math"><span class="dh-mono">${p.hope} + ${p.fear}${modText(p.modifier)} = <strong>${p.total}</strong></span>
          <span class="dh-vs">${esc(t('dh_vs_fd'))} ${p.difficulty}</span></p>
        <p class="dh-result-badges">${rollBadge(p)}</p>`;
    // A successful Group Roll to retreat: the party gets away.
    if (retreat && p.success) {
      const gain = p.gainsFear && s.settings.fearOnRoll;
      const sim = X.completeRetreat(s, { gainFear: ui.gainFear });
      el.innerHTML = `${head}<p class="dh-result-kind"><strong>${esc(t('dh_retreat_escaped'))}</strong></p></div>
        ${gain ? `<ul class="dh-conseq"><li><label class="dh-check"><input type="checkbox" data-dh-gainfear${ui.gainFear ? ' checked' : ''}> ${esc(t('dh_gain_fear'))}</label></li>${sim.ok && sim.state.fear !== s.fear ? `<li>${esc(t('dh_gm_fear'))} ${s.fear} → <strong>${sim.state.fear}</strong></li>` : ''}</ul>` : ''}
        <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="retreat-escape">${I.arrive}<span>${esc(t('dh_return_bastion'))}</span></button>${cancel}`;
      return;
    }
    const choices = { penalty: ui.penalty, gainFear: ui.gainFear };
    const sim = retreat ? X.confirmRetreatFailure(s, choices) : X.confirmArrival(s, choices);
    const after = sim.ok ? sim.state : s;
    const consequences = [`<li>${esc(t(retreat ? 'dh_retreat_adjacent' : 'dh_new_hex'))}: ${esc(t('dh_forest_difficulty'))} ${s.fd} → <strong>${after.fd}</strong></li>`];
    if (rule.penalty > 0) {
      const who = p.outcome === 'landmark-fail-fear' ? 'dh_penalty_players_choose' : 'dh_penalty_gm_decides';
      consequences.push(`<li><fieldset class="dh-choice"><legend>${esc(t('dh_penalty_choose'))}</legend>
        <label><input type="radio" name="dh-penalty" value="fd"${ui.penalty === 'fd' ? ' checked' : ''}> +${rule.penalty} ${esc(t('dh_forest_difficulty'))}</label>
        <label><input type="radio" name="dh-penalty" value="fear"${ui.penalty === 'fear' ? ' checked' : ''}> +${rule.penalty} ${esc(t('dh_gm_fear'))}</label>
        <span class="dh-hint-inline">${esc(t(who))}</span>
      </fieldset></li>`);
    }
    if (p.gainsFear && s.settings.fearOnRoll) {
      consequences.push(`<li><label class="dh-check"><input type="checkbox" data-dh-gainfear${ui.gainFear ? ' checked' : ''}> ${esc(t('dh_gain_fear'))}</label></li>`);
    }
    if (after.fear !== s.fear) consequences.push(`<li>${esc(t('dh_gm_fear'))} ${s.fear} → <strong>${after.fear}</strong></li>`);
    const fdLine = after.trapped ? `<p class="dh-trapped" role="alert"><strong>${esc(t('dh_trapped_title'))}</strong> ${esc(t('dh_trapped_will'))}</p>` : '';
    el.innerHTML = `${head}
        <p class="dh-result-kind"><span class="dh-chip dh-chip--${rule.category}">${esc(t('dh_cat_' + rule.category))}</span> <strong>${esc(bi(rule.title))}</strong></p>
      </div>
      <ul class="dh-conseq">${consequences.join('')}</ul>
      ${fdLine}
      <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="${retreat ? 'retreat-fail' : 'confirm'}"${s.trapped ? ' disabled' : ''}>${I.arrive}<span>${esc(t(retreat ? 'dh_retreat_enter_adjacent' : 'dh_confirm_arrival'))}</span></button>
      <p class="dh-hint">${esc(t(retreat ? 'dh_retreat_failed_hint' : 'dh_preview_hint'))}</p>${cancel}`;
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
    return `
      <div class="dh-rest" role="group" aria-label="${esc(t('dh_rest'))}">
        <span class="dh-field-label">${esc(t('dh_rest'))}</span>
        <p class="dh-hint">${esc(t('dh_rest_' + policy))}</p>
        ${canRest ? `
        <label class="dh-check"><input type="checkbox" id="dh-rest-whisper"${whisperOff ? ' disabled' : (ui.restWhisper ? ' checked' : '')}> <span>${esc(t('dh_rest_whisper'))}</span></label>
        <p class="dh-hint dh-hint--tight">${esc(t('dh_rest_whisper_hint'))}</p>
        <label class="dh-check"><input type="checkbox" id="dh-rest-fear"${fearOn ? (ui.restFear ? ' checked' : '') : ' disabled'}> <span>${esc(fill('dh_rest_fear_label', { heroes: s.heroes }))}</span></label>
        <div class="dh-rest-btns">
          <button type="button" class="btn btn-ghost btn-sm" data-dh-act="rest" data-dh-value="short"${limited ? ' disabled' : ''}>${esc(t('dh_rest_short'))}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-dh-act="rest" data-dh-value="long">${esc(t('dh_rest_long'))}</button>
        </div>
        ${limited ? `<p class="dh-hint" role="status">${esc(t('dh_rest_limit_reached'))}</p>` : (s.shortRests > 0 && s.settings.shortRestLimit ? `<p class="dh-hint">${esc(fill('dh_rest_limit_count', { n: s.shortRests }))}</p>` : '')}
        <details class="dh-manual"><summary>${esc(t('dh_rest_manual'))}</summary>
          <div class="dh-manual-row">
            <label class="dh-die"><span class="dh-field-label">${esc(t('dh_rest_manual_fear'))}</span><input type="number" class="dh-input" id="dh-rest-mfear" min="1" max="4" inputmode="numeric" value="${esc(ui.manualFear)}"></label>
            <label class="dh-die"><span class="dh-field-label">${esc(t('dh_rest_manual_fd'))}</span><input type="number" class="dh-input" id="dh-rest-mfd" min="1" max="2" inputmode="numeric" value="${esc(ui.manualFd)}"></label>
          </div>
          <p class="dh-hint dh-hint--tight">${esc(t('dh_rest_manual_hint'))}</p>
        </details>` : ''}
        ${lastLine}
      </div>`;
  }

  function arrivedHtml(s) {
    const a = s.arrival;
    const rule = X.OUTCOME_RULES[a.outcome];
    const lines = [`${esc(t('dh_forest_difficulty'))} ${a.fdBefore} → <strong>${a.fdAfter}</strong>`];
    if (a.fearAfter !== a.fearBefore) lines.push(`${esc(t('dh_gm_fear'))} ${a.fearBefore} → <strong>${a.fearAfter}</strong>`);
    if (a.penaltyChoice) lines.push(esc(t(a.penaltyChoice === 'fd' ? 'dh_penalty_took_fd' : 'dh_penalty_took_fear')));
    return `
      <div class="dh-result is-arrived">
        <p class="dh-arrived-title">${I.arrive}<strong>${esc(t('dh_arrived_at'))} ${a.n}</strong>${a.viaRetreat ? ` <span class="dh-chip dh-chip--warn">${esc(t('dh_via_retreat'))}</span>` : ''}</p>
        <p class="dh-result-math"><span class="dh-mono">${a.hope} + ${a.fear}${modText(a.modifier)} = <strong>${a.total}</strong></span> <span class="dh-vs">${esc(t('dh_vs_fd'))} ${a.difficulty}</span></p>
        <p class="dh-result-badges">${rollBadge({ success: a.total >= a.difficulty || a.hope === a.fear, rolledWith: a.rolledWith })}</p>
        <p class="dh-result-kind"><span class="dh-chip dh-chip--${rule.category}">${esc(t('dh_cat_' + rule.category))}</span> <strong>${esc(bi(rule.title))}</strong></p>
        <ul class="dh-conseq">${lines.map(l => `<li>${l}</li>`).join('')}</ul>
      </div>
      <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="next">${I.dice}<span>${esc(t('dh_next_traversal'))}</span></button>
      ${restHtml(s)}`;
  }

  function bastionHtml(s) {
    return `
      <div class="dh-result is-arrived">
        <p class="dh-arrived-title">${I.arrive}<strong>${esc(t('dh_in_bastion'))}</strong></p>
        <p class="dh-hint">${esc(t('dh_bastion_text'))}</p>
        <ul class="dh-conseq">
          <li>${esc(t('dh_expedition'))} ${s.expedition} · ${esc(t('dh_hexes'))}: <strong>${s.hexes}</strong></li>
          <li>${esc(t('dh_gm_fear'))}: <strong>${s.fear}</strong> — ${esc(t('dh_bastion_fear_kept'))}</li>
          <li>${esc(t('dh_forest_difficulty'))}: <strong>${s.fd}</strong> → 15 ${esc(t('dh_bastion_fd_reset'))}</li>
        </ul>
      </div>
      <button type="button" class="btn btn-primary dh-confirm-btn" data-dh-act="expedition-yes">${I.dice}<span>${esc(t('dh_start_expedition'))}</span></button>
      <p class="dh-hint">${esc(t('dh_new_expedition_hint'))}</p>
      <button type="button" class="btn btn-ghost btn-sm" data-dh-act="campaign-ask">${esc(t('dh_new_campaign'))}</button>
      ${ui.confirm === 'campaign' ? confirmBlock() : ''}`;
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

  function renderScene() {
    const outcome = stageOutcome();
    const s = S();
    if (!outcome) {
      const msg = s.phase === 'bastion' ? 'dh_scene_bastion' : s.phase === 'retreat' ? 'dh_scene_retreat' : 'dh_scene_waiting';
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
    const pool = DarkheartComposer.eligibleScenes(data.selectable, outcome).length;
    const matchLabel = t('dh_match_' + scene.match);
    pendingText = [];
    const sourceBody = parts.whole
      ? `${env.lore ? `<p class="dh-lore">${esc(bi(env.lore))}</p>` : ''}${(env.features || []).map(f => featureHtml(f, env)).join('')}`
      : parts.features.map(f => featureHtml(f, env)).join('');
    const adaptation = entry.adaptation ? `
      <section class="dh-adapt" aria-labelledby="dh-adapt-h">
        <h4 id="dh-adapt-h" class="dh-block-label">${esc(t('dh_adapted_label'))}</h4>
        <p>${esc(bi(entry.adaptation.summary))}</p>
        <ul class="dh-changes">${entry.adaptation.changes.map(c => `<li><span class="dh-change-src">${esc(t('dh_source_says'))}: “${esc(c.source)}”</span><span class="dh-change-new">${esc(t('dh_use_instead'))}: ${esc(bi(c.adapted))}</span></li>`).join('')}</ul>
      </section>` : '';
    const guidance = entry.guidance ? `
      <section class="dh-guidance" aria-labelledby="dh-guid-h">
        <h4 id="dh-guid-h" class="dh-block-label">${esc(t('dh_guidance_label'))}</h4>
        <p>${esc(bi(entry.guidance.text))}</p>
        <p class="dh-adjust">${entry.guidance.adjust.map(a => `<span class="dh-chip">${esc(t('dh_adjust_' + a))}</span>`).join(' ')}</p>
      </section>` : '';
    const leftOut = !parts.whole && parts.leftOut.length ? `<p class="dh-hint">${esc(t('dh_left_out'))}: ${esc(parts.leftOut.join(', '))}</p>` : '';
    setRegion('scene', `
      <header class="dh-scene-head">
        <div>
          <h3 class="dh-scene-title">${esc(bi(entry.framing.title))}</h3>
          <p class="dh-scene-sub"><span class="dh-chip">${esc(matchLabel)}</span> ${esc(bi(env.name))}${env.source ? ` · <span class="dh-source">${esc(env.source)}</span>` : ''}</p>
        </div>
        <div class="dh-scene-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-dh-act="scene-regen"${pool > 1 ? '' : ' disabled'} title="${esc(t(pool > 1 ? 'dh_regen_scene_tip' : 'dh_regen_scene_one'))}">${I.refresh}<span>${esc(t('dh_regen_scene'))}</span></button>
          <a class="btn btn-ghost btn-sm" href="${esc(deps.envHref(env.id))}">${esc(t('dh_open_env'))}</a>
        </div>
      </header>
      <p class="dh-scene-summary">${esc(bi(entry.framing.summary))}</p>
      ${cur.cycled ? `<p class="dh-hint">${esc(t('dh_pool_cycled'))}</p>` : ''}
      <div class="dh-scene-grid">
        ${ruleBlock(outcome)}
        <section class="dh-source-block" aria-labelledby="dh-src-h">
          <h4 id="dh-src-h" class="dh-block-label">${esc(t('dh_source_label'))} — ${esc(bi(env.name))}</h4>
          <p class="dh-fd-note"><span class="dh-chip dh-chip--countdown">${esc(t('dh_fd_chip'))} ${s.fd}</span> ${esc(t('dh_fd_checks'))}</p>
          ${sourceBody}${leftOut}
          ${envTierControl(s)}
        </section>
      </div>
      ${adaptation}${guidance}`);
    fillPendingText();
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
  function avatarSvg(npc) {
    const c = DarkheartNpc.paletteColors(npc.avatar.palette);
    const feat = AVATAR[npc.avatar.shape] || '';
    return `<svg class="dh-avatar-svg" viewBox="0 0 64 64" role="img" aria-label="${esc(bi(npc.name))}" style="--av-skin:${c.skin};--av-shade:${c.shade}">
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
    if (!role) { setRegion('npc', ''); region('npc') && (region('npc').hidden = true); return; }
    region('npc').hidden = false;
    const npc = s.scene.npc.value;
    const heading = `<h3 class="dh-panel-title">${esc(t('dh_npc_title'))} <span class="dh-chip">${esc(t('dh_npc_role_' + role))}</span></h3>`;
    if (!npc) {
      setRegion('npc', `${heading}<p class="dh-hint">${esc(t('dh_npc_optional'))}</p>
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="npc-make">${esc(t('dh_npc_make'))}</button>`);
      return;
    }
    const locked = s.scene.npc.locked;
    setRegion('npc', `
      ${heading}
      <div class="dh-npc">
        <div class="dh-avatar">${avatarSvg(npc)}</div>
        <div class="dh-bubble"><p>“${esc(bi(npc.line))}”</p></div>
      </div>
      <p class="dh-npc-name"><strong>${esc(bi(npc.name))}</strong> <span class="dh-chip">${esc(bi(npc.ancestry))}</span></p>
      <p class="dh-npc-line"><span class="dh-field-label">${esc(t('dh_npc_look'))}</span> ${esc(bi(npc.look))}</p>
      <p class="dh-npc-line"><span class="dh-field-label">${esc(t('dh_npc_need'))}</span> ${esc(bi(npc.need))}</p>
      <div class="dh-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="npc-regen"${locked ? ' disabled' : ''}>${I.refresh}<span>${esc(t('dh_npc_regen'))}</span></button>
        <button type="button" class="btn btn-ghost btn-sm dh-lock${locked ? ' is-on' : ''}" data-dh-act="npc-lock" aria-pressed="${locked}">${locked ? I.lock : I.unlock}<span>${esc(t(locked ? 'dh_locked' : 'dh_lock'))}</span></button>
      </div>`);
  }

  /* ---------- encounter ---------- */

  function advName(a) { return bi(a.name); }

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
    const postureNote = `<p class="dh-hint">${esc(t('dh_enc_posture_' + posture))}</p>`;
    if (posture === 'none' && !r.adversaries.length) {
      el.innerHTML = `${heading}${postureNote}`;
      return;
    }
    const diff = ['easier', 'standard', 'harder'].map(d => `<button type="button" role="radio" class="dh-seg${s.difficulty === d ? ' is-on' : ''}" aria-checked="${s.difficulty === d}" data-dh-act="difficulty" data-dh-value="${d}">${esc(t('dh_diff_' + d))}</button>`).join('');
    const bp = r.battlePoints;
    const mods = bp.modifiers.filter(m => m.applied).map(m => `${esc(t('dh_mod_' + m.id.replace(/-/g, '_')))} ${m.value > 0 ? '+' : '−'}${Math.abs(m.value)}`);
    const lockedIds = new Set(s.scene.encounter.locked.map(l => l.id));
    const rows = r.adversaries.map(a => `
      <li class="dh-adv${a.locked ? ' is-locked' : ''}">
        <span class="dh-adv-qty dh-mono">${a.quantity}×</span>
        <span class="dh-adv-main"><strong>${esc(advName(a))}</strong>
          <span class="dh-adv-meta"><span class="dh-chip">${esc(t('adversary_type_' + a.role))}</span><span class="dh-chip">${esc(t('dh_tier'))} ${a.tier}</span>${a.crossTier ? `<span class="dh-chip dh-chip--warn">${esc(t('dh_cross_tier'))}</span>` : ''}${a.minionGroups ? `<span class="dh-chip">${esc(t('dh_minion_group'))} ×${a.minionGroups}</span>` : ''}</span>
          <span class="dh-adv-why">${esc(bi(a.reason))}</span></span>
        <span class="dh-adv-cost dh-mono" title="${esc(t('dh_bp'))}">${esc(fmt(a.lineCost))}</span>
        <button type="button" class="dh-icon-toggle${lockedIds.has(a.id) ? ' is-on' : ''}" data-dh-act="adv-lock" data-dh-value="${esc(a.id)}" data-dh-qty="${a.quantity}" aria-pressed="${lockedIds.has(a.id)}" aria-label="${esc(t(lockedIds.has(a.id) ? 'dh_unlock_adv' : 'dh_lock_adv'))}: ${esc(advName(a))}">${lockedIds.has(a.id) ? I.lock : I.unlock}</button>
      </li>`).join('');
    const warnings = r.warnings.filter(w => w.severity !== 'info' || ['cross-tier-used', 'variety-limits', 'higher-tier-excluded', 'no-encounter-theme'].includes(w.code))
      .map(w => `<li class="${w.severity === 'warning' ? 'is-warn' : ''}">${esc(bi(w.text))}</li>`).join('');
    const supported = r.builder.entries;
    const names = supported.map(e => e.name);
    const url = names.length ? deps.fcgUrl(bi(cur.scene.outcomes.find(o => o.outcome === outcome).framing.title), names) : null;
    const reasonLines = r.reasoning.filter(x => x.code === 'budget' || x.code === 'minion-group').map(x => `<li>${esc(bi(x.text))}</li>`).join('');
    const sceneThemes = (cur.scene.encounter && cur.scene.encounter.themes) || [];
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
      ${postureNote}
      <div class="dh-enc-bar">
        <div class="dh-segs" role="radiogroup" aria-label="${esc(t('dh_difficulty'))}">${diff}</div>
        <div class="dh-bp" aria-label="${esc(t('dh_bp'))}">
          <span class="dh-bp-num dh-mono"><strong>${esc(fmt(bp.spent))}</strong> / ${esc(fmt(bp.available))}</span>
          <span class="dh-bp-label">${esc(t('dh_bp_short'))}</span>
        </div>
      </div>
      <p class="dh-bp-detail">${esc(t('dh_bp_base'))} ${bp.baseBudget}${mods.length ? ' · ' + mods.join(' · ') : ''}</p>
      ${themePicker}
      ${rows ? `<ul class="dh-advs">${rows}</ul>` : `<p class="dh-hint">${esc(t('dh_enc_none'))}</p>`}
      ${warnings ? `<ul class="dh-warnings">${warnings}</ul>` : ''}
      ${reasonLines ? `<details class="dh-why"><summary>${esc(t('dh_enc_why'))}</summary><ul>${reasonLines}</ul></details>` : ''}
      <div class="dh-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-dh-act="enc-regen">${I.refresh}<span>${esc(t('dh_enc_regen'))}</span></button>
        ${url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${I.external}<span>${esc(t('dh_fcg'))}</span></a>` : ''}
      </div>
      ${url && supported.some(e => e.quantity > 1) ? `<p class="dh-hint">${esc(t('dh_fcg_qty_note'))}</p>` : ''}`;
    if (posture === 'recommended') el.innerHTML = `${heading}${body}`;
    else {
      // Optional / prepared: never forced — closed until the Master asks for it.
      el.innerHTML = `${heading}<details class="dh-opt"${ui.encOpen ? ' open' : ''}><summary>${esc(t('dh_enc_optional_summary'))}</summary>${body}</details>`;
      const d = el.querySelector('details');
      if (d) d.addEventListener('toggle', () => { ui.encOpen = d.open; });
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
      case 'undo': ui = Object.assign(freshUi(), { histOpen: ui.histOpen }); return apply(X.undo(s));
      case 'expedition-ask': ui.confirm = 'expedition'; return renderStatus();
      case 'campaign-ask': ui.confirm = 'campaign'; renderStatus(); return renderRoll();
      case 'confirm-no': ui.confirm = null; renderStatus(); return renderRoll();
      case 'expedition-yes': ui = Object.assign(freshUi(), { histOpen: ui.histOpen }); return apply(X.startExpedition(s));
      case 'campaign-yes': ui = Object.assign(freshUi(), { histOpen: ui.histOpen }); return apply(X.newCampaign(s));
      case 'retreat-open': ui.menuOpen = false; return apply(X.beginRetreat(s));
      case 'retreat-cancel': return apply(X.cancelRetreat(s));
      case 'retreat-danger': return apply(X.setRetreatDanger(s, value === 'yes'));
      case 'retreat-declare': case 'retreat-escape': {
        const res = X.completeRetreat(s, { gainFear: ui.gainFear });
        if (res.ok) { ui = Object.assign(freshUi(), { histOpen: ui.histOpen }); deps.set(res.state); renderAll(); focusRegion('preview'); } else announce(res.reason);
        return res.ok;
      }
      case 'retreat-fail': {
        const res = X.confirmRetreatFailure(s, { penalty: ui.penalty, gainFear: ui.gainFear });
        if (res.ok) { ui = Object.assign(freshUi(), { histOpen: ui.histOpen }); deps.set(res.state); renderAll(); focusRegion('preview'); } else announce(res.reason);
        return res.ok;
      }
      case 'confirm': {
        const res = X.confirmArrival(s, { penalty: ui.penalty, gainFear: ui.gainFear });
        if (res.ok) { deps.set(res.state); ui = Object.assign(freshUi(), { histOpen: ui.histOpen }); renderAll(); focusRegion('preview'); }
        else announce(res.reason);
        return res.ok;
      }
      case 'next': { const res = X.nextTraversal(s); if (res.ok) { deps.set(res.state); ui = Object.assign(freshUi(), { histOpen: ui.histOpen }); renderAll(); const first = host.querySelector('#dh-die-hope'); if (first) first.focus(); } return res.ok; }
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
        deps.set(X.setScene(s, Object.assign({}, s.scene, { encounter: Object.assign({}, s.scene.encounter, { seed: s.scene.encounter.seed + 1 }) })).state);
        return renderEncounter();
      }
      case 'adv-lock': {
        const list = s.scene.encounter.locked;
        const has = list.some(l => l.id === value);
        const next = has ? list.filter(l => l.id !== value) : list.concat([{ id: value, quantity: Number(el.dataset.dhQty) || 1 }]).slice(0, 8);
        deps.set(X.setScene(s, Object.assign({}, s.scene, { encounter: Object.assign({}, s.scene.encounter, { locked: next }) })).state);
        return renderEncounter();
      }
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

  function focusRegion(id) { const el = region(id); if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } }

  /* ---------------- events ---------------- */

  function bindEvents() {
    onClick = e => {
      const btn = e.target.closest('[data-dh-act]');
      if (!btn || !host.contains(btn) || btn.disabled) return;
      e.preventDefault();
      act(btn.dataset.dhAct, btn.dataset.dhValue, btn);
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
        <header class="dh-head">
          <h2 class="dh-title">${esc(t('dh_title'))}</h2>
          <p class="dh-lede">${esc(t('dh_lede'))}</p>
        </header>
        <section id="dh-status" class="dh-status" aria-label="${esc(t('dh_status_label'))}"></section>
        <div class="dh-layout">
          <aside class="dh-side">
            <section id="dh-party" class="dh-card dh-party" aria-label="${esc(t('dh_party_label'))}"></section>
            <section class="dh-card dh-roll" aria-labelledby="dh-roll-h">
              <h3 id="dh-roll-h" class="dh-panel-title">${I.dice}<span id="dh-roll-title">${esc(t('dh_wayfinder'))}</span></h3>
              <div id="dh-roll"></div>
            </section>
          </aside>
          <main class="dh-main">
            <section id="dh-scene" class="dh-card dh-scene" aria-live="polite" aria-label="${esc(t('dh_scene_label'))}"></section>
            <div class="dh-tools">
              <section id="dh-npc" class="dh-card dh-npc-card" hidden></section>
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
    host.removeEventListener('input', onInput);
    host.removeEventListener('change', onChange);
    host = null; deps = null;
  }

  return { mount, unmount };
})();
