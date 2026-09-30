/* ============================================================
   Bacchus's Atlas — battle-points-ui.js
   The Battle Points summary in the Prep "Adversaries" section header: a
   character stepper, a "BP spent / available" button, and the breakdown
   popover it opens. Arithmetic lives in the pure js/battle-points.js
   (BattlePoints); this file is only the DOM layer over it. See PD-007 in
   docs/product-decisions.md and "Battle Points" in docs/architecture.md.

   State: the character count is persisted (LS_KEYS.battlePointsPcs, a raw
   integer through persistRaw()/SafeStorage.readRawFlag()); encounter
   style and the two manual-adjustment checkboxes are per-session view state
   and reset on reload. Nothing here touches the saved Prep, and Battle
   Points are advisory — going over budget never blocks, disables, or
   confirms anything.

   It reads app.js globals (t, state, activePrep, lsStorage, LS_KEYS,
   persistRaw, escapeHtml, escapeAttr, ICON_PLUS, ICON_ALERT) lazily, at call
   time.

   Structure vs values: the controls are rendered once (slotHtml()) and are
   afterwards only patched in place (update()), so typing in or clicking the
   stepper never destroys the element that holds focus or is mid-click.
   Every changing figure sits in a fixed-width box so the right-aligned
   summary never resizes (see the .bp-* rules in css/styles.css).
   ============================================================ */
(function () {
  'use strict';

  const BP = BattlePoints;

  const view = { style: 'standard', boosted: false, lowerTier: false };
  let pcs = BP.DEFAULT_PCS;
  let popover = null;
  let loaded = false;
  let listenersBound = false;

  const $ = sel => document.querySelector(sel);
  const fmt = BP.formatBP;
  const fill = (key, map) => Object.keys(map).reduce((s, k) => s.replace('{' + k + '}', map[k]), t(key));
  const typeName = type => t('adversary_type_' + type);

  const ICON_MINUS = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 12h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  /** The persisted character count; anything unreadable is the default. */
  function loadPcs() {
    const parsed = BP.parsePcsInput(SafeStorage.readRawFlag(lsStorage, LS_KEYS.battlePointsPcs));
    pcs = parsed === null ? BP.DEFAULT_PCS : parsed;
  }

  function result() {
    const prep = activePrep();
    const types = (prep ? prep.adversaryIds : [])
      .map(id => state.prepCatalog.adversaryById.get(id))
      .filter(Boolean)
      .map(adv => adv.type);
    return BP.calculate({
      pcs, entries: types, style: view.style,
      boostedDamage: view.boosted, lowerTier: view.lowerTier,
    });
  }

  /* ---------------- markup ---------------- */

  function stepperHtml() {
    const name = t('bp_characters_input');
    return `
      <div class="bp-stepper" role="group" aria-label="${escapeAttr(t('bp_characters_group'))}">
        <button type="button" class="bp-step" data-bp-act="dec" aria-label="${escapeAttr(t('bp_characters_dec'))}">${ICON_MINUS}</button>
        <input type="number" class="bp-pc-input" data-bp-pcs min="${BP.MIN_PCS}" max="${BP.MAX_PCS}" step="1" inputmode="numeric" aria-label="${escapeAttr(name)}">
        <button type="button" class="bp-step" data-bp-act="inc" aria-label="${escapeAttr(t('bp_characters_inc'))}">${ICON_PLUS}</button>
      </div>`;
  }

  /** Slot between the adversary count and the FreshCutGrass link. Always
   * present on the Prep page, including with no adversaries selected. */
  function slotHtml() {
    return `
      <div class="bp-slot" id="bp-slot">
        <div class="bp">
          <div class="bp-pc"><span class="bp-pc-label">${escapeHtml(t('bp_characters'))}</span>${stepperHtml()}</div>
          <button type="button" class="bp-summary" id="bp-trigger" data-bp-act="toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="bp-popover"></button>
        </div>
      </div>`;
  }

  function summaryInner(r) {
    return `<span class="bp-abbr">${escapeHtml(t('bp_abbr'))}</span><span class="bp-spent">${fmt(r.spent)}</span><span class="bp-sep">/</span><span class="bp-avail">${fmt(r.available)}</span>`;
  }

  /* ---------------- popover ---------------- */

  function popoverHtml() {
    const styleOption = key => `
      <label class="bp-seg"><input type="radio" class="sr-only" name="bp-style" value="${key}" data-bp-style>
        <span>${escapeHtml(t('bp_style_' + key))}</span></label>`;
    return `
      <div class="bp-pop-head">
        <h3 class="bp-pop-title">${escapeHtml(t('bp_title'))}</h3>
        <button type="button" class="bp-pop-close" data-bp-act="close" aria-label="${escapeAttr(t('close'))}">&times;</button>
      </div>
      <div class="bp-pop-row bp-pop-row--pc"><span>${escapeHtml(t('bp_characters'))}</span>${stepperHtml()}</div>
      <div class="bp-pop-sec" data-bp-dyn="base"></div>
      <div class="bp-pop-sec">
        <div class="bp-pop-row"><span class="bp-pop-h">${escapeHtml(t('bp_style'))}</span><span class="bp-val" data-bp-dyn="style-adj"></span></div>
        <div class="bp-segs" role="radiogroup" aria-label="${escapeAttr(t('bp_style'))}">
          ${styleOption('easier')}${styleOption('standard')}${styleOption('dangerous')}
        </div>
        <label class="bp-check"><input type="checkbox" data-bp-boosted><span class="bp-check-text">${escapeHtml(t('bp_boosted_damage'))}</span><span class="bp-val" data-bp-dyn="boosted-adj"></span></label>
        <label class="bp-check"><input type="checkbox" data-bp-lower><span class="bp-check-text">${escapeHtml(t('bp_lower_tier'))}</span><span class="bp-val" data-bp-dyn="lower-adj"></span></label>
      </div>
      <div class="bp-pop-sec" data-bp-dyn="auto"></div>
      <div class="bp-pop-sec" data-bp-dyn="cost"></div>
      <div class="bp-pop-sec bp-pop-totals" data-bp-dyn="totals"></div>
      <p class="bp-pop-note">${escapeHtml(t('bp_advisory'))}</p>`;
  }

  const row = (label, value, cls = '') =>
    `<div class="bp-pop-row ${cls}"><span class="bp-pop-label">${label}</span><span class="bp-val">${value}</span></div>`;
  const signedCls = v => (v ? ' is-active' : ' is-idle');

  function fillPopover(r) {
    const set = (name, html) => { const el = popover.querySelector(`[data-bp-dyn="${name}"]`); if (el) el.innerHTML = html; };
    const signed = v => BP.formatSigned(v);
    const setSigned = (name, v, active) => {
      const el = popover.querySelector(`[data-bp-dyn="${name}"]`);
      el.textContent = signed(v);
      el.classList.toggle('is-idle', !active);
    };
    set('base', row(escapeHtml(t('bp_base_budget')) + `<span class="bp-formula">(3 × ${r.pcs}) + 2</span>`, r.baseBudget));
    setSigned('style-adj', r.styleAdjustment, r.styleAdjustment !== 0);
    // The checkbox rows show the adjustment they WOULD apply until ticked.
    setSigned('boosted-adj', -2, view.boosted);
    setSigned('lower-adj', 1, view.lowerTier);

    set('auto', `
      <div class="bp-pop-h">${escapeHtml(t('bp_auto'))}</div>
      ${row(escapeHtml(t('bp_auto_solos')), signed(r.multipleSolosAdjustment), signedCls(r.multipleSolosAdjustment))}
      ${row(escapeHtml(fill('bp_auto_no_heavy', { types: t('bp_auto_no_heavy_types') })), signed(r.noHeavyAdjustment), signedCls(r.noHeavyAdjustment))}`);

    const costRows = r.costLines.length
      ? r.costLines.map(line => row(
          `${escapeHtml(typeName(line.type))} × ${line.quantity}` +
          (line.type === 'minion' ? `<span class="bp-formula">${line.quantity} ÷ ${r.pcs}</span>` : ''),
          fmt(line.cost))).join('')
      : `<p class="bp-pop-empty">${escapeHtml(t('prep_no_adversaries'))}</p>`;
    set('cost', `<div class="bp-pop-h">${escapeHtml(t('bp_cost'))}</div>${costRows}`);

    const remainingRow = r.overBudget
      ? row(`<span class="bp-warn-icon">${ICON_ALERT}</span>${escapeHtml(t('bp_over'))}`, fmt(-r.remaining), 'is-over')
      : row(escapeHtml(t('bp_remaining')), fmt(r.remaining));
    set('totals', row(escapeHtml(t('bp_available')), fmt(r.available)) + row(escapeHtml(t('bp_spent')), fmt(r.spent)) + remainingRow);

    popover.querySelectorAll('[data-bp-style]').forEach(input => { input.checked = input.value === view.style; });
    popover.querySelector('[data-bp-boosted]').checked = view.boosted;
    popover.querySelector('[data-bp-lower]').checked = view.lowerTier;
  }

  function ensurePopover() {
    if (popover && popover.isConnected) return popover;
    popover = document.createElement('div');
    popover.id = 'bp-popover';
    popover.className = 'bp-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', t('bp_title'));
    popover.tabIndex = -1;
    popover.hidden = true;
    popover.innerHTML = popoverHtml();
    document.body.appendChild(popover);
    return popover;
  }

  /** position: fixed, anchored under the summary button and clamped to the
   * viewport, so opening it never shifts the header or the page. */
  function position() {
    const trigger = $('#bp-trigger');
    if (!popover || popover.hidden || !trigger) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const width = Math.min(380, vw - 16);
    const left = Math.max(8, Math.min(r.right - width, vw - width - 8));
    const top = r.bottom + 6;
    popover.style.width = width + 'px';
    popover.style.left = left + 'px';
    popover.style.top = top + 'px';
    popover.style.maxHeight = Math.max(160, vh - top - 8) + 'px';
  }

  function openPopover() {
    const trigger = $('#bp-trigger');
    if (!trigger) return;
    ensurePopover();
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    update();
    position();
    popover.focus({ preventScroll: true });
  }

  function closePopover(returnFocus) {
    if (!popover || popover.hidden) return;
    popover.hidden = true;
    const trigger = $('#bp-trigger');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus({ preventScroll: true });
    }
  }

  /* ---------------- patching ---------------- */

  /** The section title ellipsizes when the slot crowds it; never leave that
   * without a tooltip carrying the full text (same data-tip the cards use). */
  function syncTitleTip() {
    const span = $('#prep-central-adv-title span');
    if (!span) return;
    if (span.scrollWidth > span.clientWidth + 1) span.dataset.tip = span.textContent;
    else delete span.dataset.tip;
  }

  function update() {
    const slot = $('#bp-slot');
    if (!slot) return;
    const r = result();
    const scope = popover && !popover.hidden ? [slot, popover] : [slot];
    scope.forEach(el => {
      el.querySelectorAll('[data-bp-pcs]').forEach(input => { input.value = String(pcs); });
      el.querySelectorAll('[data-bp-act="dec"]').forEach(b => { b.disabled = pcs <= BP.MIN_PCS; });
      el.querySelectorAll('[data-bp-act="inc"]').forEach(b => { b.disabled = pcs >= BP.MAX_PCS; });
    });
    const trigger = $('#bp-trigger');
    trigger.innerHTML = summaryInner(r);
    trigger.classList.toggle('is-over', r.overBudget);
    trigger.setAttribute('aria-label', fill('bp_summary_aria', { spent: fmt(r.spent), available: fmt(r.available), characters: pcs }));
    if (popover && !popover.hidden) { fillPopover(r); position(); }
    syncTitleTip();
  }

  function setPcs(next) {
    const clamped = BP.clampPcs(next);
    if (clamped === pcs) return;
    pcs = clamped;
    persistRaw(LS_KEYS.battlePointsPcs, String(pcs));
    update();
  }

  function commitTypedPcs(input) {
    const parsed = BP.parsePcsInput(input.value);
    if (parsed === null) { input.value = String(pcs); return; }
    setPcs(parsed);
  }

  /* ---------------- events (bound once) ---------------- */

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;

    document.addEventListener('click', e => {
      if (!$('#bp-slot')) return;
      const target = e.target;
      const trigger = $('#bp-trigger');
      const inPopover = popover && popover.contains(target);
      if (popover && !popover.hidden && !inPopover && !(trigger && trigger.contains(target))) closePopover(false);

      const act = target.closest('[data-bp-act]');
      if (!act || act.disabled) return;
      const kind = act.dataset.bpAct;
      if (kind === 'dec') setPcs(pcs - 1);
      else if (kind === 'inc') setPcs(pcs + 1);
      else if (kind === 'toggle') { if (popover && !popover.hidden) closePopover(false); else openPopover(); }
      else if (kind === 'close') closePopover(true);
    });

    document.addEventListener('change', e => {
      if (!$('#bp-slot')) return;
      const el = e.target;
      if (el.matches('[data-bp-pcs]')) commitTypedPcs(el);
      else if (el.matches('[data-bp-style]')) { view.style = el.value; update(); }
      else if (el.matches('[data-bp-boosted]')) { view.boosted = el.checked; update(); }
      else if (el.matches('[data-bp-lower]')) { view.lowerTier = el.checked; update(); }
    });

    // Leaving the field with an empty/invalid value never fires `change` when
    // the text is unchanged, so restore on focusout too.
    document.addEventListener('focusout', e => {
      if (e.target.matches && e.target.matches('[data-bp-pcs]')) commitTypedPcs(e.target);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && popover && !popover.hidden) { e.preventDefault(); closePopover(true); return; }
      if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-bp-pcs]')) {
        e.preventDefault();
        commitTypedPcs(e.target);
      }
    });

    window.addEventListener('resize', () => { position(); syncTitleTip(); });
    // Capture: the central panel is its own scroller, scroll doesn't bubble.
    window.addEventListener('scroll', position, true);
  }

  /** Called at the end of renderPrepPage(): the DOM was just rebuilt, so the
   * slot is unfilled and any popover belongs to a destroyed trigger. */
  function mount() {
    bindListeners();
    // Once per page load: a failed write must not be undone by re-reading.
    if (!loaded) { loadPcs(); loaded = true; }
    if (popover) { popover.remove(); popover = null; }
    ensurePopover();
    update();
  }

  window.BattlePointsUI = { slotHtml, mount, refresh: update };
})();
