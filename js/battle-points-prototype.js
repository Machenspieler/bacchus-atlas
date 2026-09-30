/* ============================================================
   Bacchus's Atlas — battle-points-prototype.js
   EPHEMERAL design prototypes for the Prep "Adversaries" header: three
   variants (A inline stepper, B segmented control, C summary-first) of the
   same Battle Points summary + one shared breakdown popover.

   Only active on "#/prep?battlePointsPrototype=1". Everything here is
   component state: nothing is written to the saved Prep, to SafeStorage, or
   to the FreshCutGrass export, and with the flag off every hook below
   returns '' / does nothing, so the ordinary Prep page is unchanged.

   This file is deliberately one removable unit. It reads app.js globals
   (t, state, activePrep, escapeHtml, escapeAttr, renderPrepPage) lazily,
   at call time, and calls nothing else in the app.

   Structure vs values: the controls are rendered once (structure) and are
   afterwards only patched in place (update()), so typing in or clicking a
   stepper never destroys the element that holds focus or is mid-click.
   ============================================================ */
(function () {
  'use strict';

  const BP = BattlePoints;
  const DEMO_ENTRIES = ['bruiser', 'standard', 'minion', 'solo'];

  /* Ephemeral. A refresh resets this to exactly these values. */
  const proto = {
    variant: 'A', data: 'demo', empty: 'always',
    pcs: BP.DEFAULT_PCS, style: 'standard', boosted: false, lowerTier: false,
  };
  let flag = RouteUtils.hasBattlePointsPrototypeFlag(location.hash);
  let popover = null;
  let listenersBound = false;

  const $ = sel => document.querySelector(sel);

  function enabled() { return flag; }

  function entries() {
    if (proto.data === 'empty') return [];
    if (proto.data === 'demo') return DEMO_ENTRIES;
    const prep = activePrep();
    return (prep ? prep.adversaryIds : [])
      .map(id => state.prepCatalog.adversaryById.get(id))
      .filter(Boolean)
      .map(adv => adv.type);
  }

  function result() {
    return BP.calculate({
      pcs: proto.pcs, entries: entries(), style: proto.style,
      boostedDamage: proto.boosted, lowerTier: proto.lowerTier,
    });
  }

  function isVisible(r) { return flag && (proto.empty === 'always' || r.adversaryCount > 0); }
  function typeName(type) { return t('adversary_type_' + type); }
  const fmt = BP.formatBP;
  const fill = (key, map) => Object.keys(map).reduce((s, k) => s.replace('{' + k + '}', map[k]), t(key));

  /* ---------------- markup ---------------- */

  function stripHtml() {
    if (!flag) return '';
    const group = (field, label, options) => `
      <div class="bp-proto-group" role="group" aria-label="${label}">
        <span class="bp-proto-label" aria-hidden="true">${label}</span>
        ${options.map(([value, text]) => `<button type="button" class="bp-proto-btn" data-bp-proto="${field}" data-value="${value}" aria-pressed="false">${text}</button>`).join('')}
      </div>`;
    return `
      <div class="bp-proto" id="bp-proto-strip" role="group" aria-label="Prototype controls">
        <span class="bp-proto-tag">Prototype controls</span>
        ${group('variant', 'Variant', [['A', 'A'], ['B', 'B'], ['C', 'C']])}
        ${group('data', 'Data', [['current', 'Current encounter'], ['demo', 'Demo encounter'], ['empty', 'Empty encounter']])}
        ${group('empty', 'When empty', [['always', 'Always show'], ['hide', 'Hide when empty']])}
      </div>`;
  }

  function stepperHtml(where, { withLabel = false } = {}) {
    const dec = t('bp_characters_dec'), inc = t('bp_characters_inc'), name = t('bp_characters_input');
    const input = `<input type="number" class="bp-pc-input" data-bp-pcs min="${BP.MIN_PCS}" max="${BP.MAX_PCS}" step="1" inputmode="numeric" aria-label="${escapeAttr(name)}">`;
    const middle = withLabel
      ? `<label class="bp-pc-field">${input}<span class="bp-pc-unit">${escapeHtml(t('bp_characters'))}</span></label>`
      : input;
    return `
      <div class="bp-stepper" role="group" aria-label="${escapeAttr(t('bp_characters_group'))}" data-where="${where}">
        <button type="button" class="bp-step" data-bp-act="dec" aria-label="${escapeAttr(dec)}">${ICON_MINUS}</button>
        ${middle}
        <button type="button" class="bp-step" data-bp-act="inc" aria-label="${escapeAttr(inc)}">${ICON_PLUS}</button>
      </div>`;
  }

  const ICON_MINUS = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 12h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  const TRIGGER_ATTRS = 'id="bp-trigger" data-bp-act="toggle" aria-haspopup="dialog" aria-expanded="false" aria-controls="bp-popover"';

  function variantHtml() {
    if (proto.variant === 'B') {
      return `
        <div class="bp bp--b">
          ${stepperHtml('hdr', { withLabel: true })}
          <button type="button" class="bp-summary" ${TRIGGER_ATTRS}></button>
        </div>`;
    }
    if (proto.variant === 'C') {
      return `
        <div class="bp bp--c">
          <button type="button" class="bp-summary" ${TRIGGER_ATTRS}></button>
        </div>`;
    }
    return `
      <div class="bp bp--a">
        <div class="bp-pc"><span class="bp-pc-label">${escapeHtml(t('bp_characters'))}</span>${stepperHtml('hdr')}</div>
        <button type="button" class="bp-summary" ${TRIGGER_ATTRS}></button>
      </div>`;
  }

  /** Slot between the adversary count and the FreshCutGrass link. */
  function slotHtml() {
    return flag ? '<div class="bp-slot" id="bp-slot"></div>' : '';
  }

  function summaryInner(r) {
    const over = r.overBudget;
    const figures = `<span class="bp-abbr">${escapeHtml(t('bp_abbr'))}</span><span class="bp-spent">${fmt(r.spent)}</span><span class="bp-sep">/</span><span class="bp-avail">${fmt(r.available)}</span>`;
    if (proto.variant === 'B') {
      const rest = over
        ? fill('bp_over_short', { n: fmt(-r.remaining) })
        : fill('bp_remaining_short', { n: fmt(r.remaining) });
      return `${figures}<span class="bp-rem"><span aria-hidden="true">·</span> ${escapeHtml(rest)}</span>`;
    }
    if (proto.variant === 'C') {
      return `<span class="bp-c-lines"><span class="bp-c-main">${figures}</span><span class="bp-c-sub">${escapeHtml(t('bp_characters_count')).replace('{n}', `<span class="bp-num2">${proto.pcs}</span>`)}</span></span><span class="bp-c-caret">${ICON_CHEVRON_DOWN}</span>`;
    }
    return figures;
  }

  /* ---------------- shared popover ---------------- */

  function popoverHtml() {
    const styleOption = key => `
      <label class="bp-seg"><input type="radio" class="sr-only" name="bp-style" value="${key}" data-bp-style>
        <span>${escapeHtml(t('bp_style_' + key))}</span></label>`;
    return `
      <div class="bp-pop-head">
        <h3 class="bp-pop-title">${escapeHtml(t('bp_title'))}</h3>
        <button type="button" class="bp-pop-close" data-bp-act="close" aria-label="${escapeAttr(t('close'))}">&times;</button>
      </div>
      <div class="bp-pop-row bp-pop-row--pc"><span>${escapeHtml(t('bp_characters'))}</span>${stepperHtml('pop')}</div>
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
    set('base', row(escapeHtml(t('bp_base_budget')) + `<span class="bp-formula">(3 × ${r.pcs}) + 2</span>`, r.baseBudget));
    const signed = v => BP.formatSigned(v);
    const setSigned = (name, v) => {
      const el = popover.querySelector(`[data-bp-dyn="${name}"]`);
      if (!el) return;
      el.textContent = signed(v);
      el.classList.toggle('is-idle', !v);
    };
    setSigned('style-adj', r.styleAdjustment);
    // The checkbox rows show the adjustment they WOULD apply until ticked.
    const boosted = popover.querySelector('[data-bp-dyn="boosted-adj"]');
    boosted.textContent = signed(-2); boosted.classList.toggle('is-idle', !proto.boosted);
    const lower = popover.querySelector('[data-bp-dyn="lower-adj"]');
    lower.textContent = signed(1); lower.classList.toggle('is-idle', !proto.lowerTier);

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

    popover.querySelectorAll('[data-bp-style]').forEach(input => { input.checked = input.value === proto.style; });
    popover.querySelector('[data-bp-boosted]').checked = proto.boosted;
    popover.querySelector('[data-bp-lower]').checked = proto.lowerTier;
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

  function position() {
    const trigger = $('#bp-trigger');
    if (!popover || popover.hidden || !trigger) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const width = Math.min(380, vw - 16);
    const left = Math.max(8, Math.min(r.right - width, vw - width - 8));
    let top = r.bottom + 6;
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

  function update() {
    const slot = $('#bp-slot');
    const r = result();
    document.querySelectorAll('[data-bp-proto]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(proto[btn.dataset.bpProto] === btn.dataset.value));
    });
    if (!slot) return;
    const show = isVisible(r);
    const sig = proto.variant + '|' + show;
    if (slot.dataset.bpSig !== sig) {
      closePopover(false);
      slot.innerHTML = show ? variantHtml() : '';
      slot.dataset.bpSig = sig;
      slot.dataset.variant = proto.variant;
    }
    if (!show) { syncTitleTip(); return; }

    const scope = popover && !popover.hidden ? [slot, popover] : [slot];
    scope.forEach(el => {
      el.querySelectorAll('[data-bp-pcs]').forEach(input => { input.value = String(proto.pcs); });
      el.querySelectorAll('[data-bp-act="dec"]').forEach(b => { b.disabled = proto.pcs <= BP.MIN_PCS; });
      el.querySelectorAll('[data-bp-act="inc"]').forEach(b => { b.disabled = proto.pcs >= BP.MAX_PCS; });
    });
    const trigger = $('#bp-trigger');
    if (trigger) {
      trigger.innerHTML = summaryInner(r);
      trigger.classList.toggle('is-over', r.overBudget);
      trigger.setAttribute('aria-label', fill('bp_summary_aria', { spent: fmt(r.spent), available: fmt(r.available), characters: proto.pcs }));
    }
    if (popover && !popover.hidden) { fillPopover(r); position(); }
    syncTitleTip();
  }

  /** The section title ellipsizes when the slot crowds it; never leave that
   * without a tooltip carrying the full text (same data-tip the cards use). */
  function syncTitleTip() {
    const span = $('#prep-central-adv-title span');
    if (!span) return;
    if (span.scrollWidth > span.clientWidth + 1) span.dataset.tip = span.textContent;
    else delete span.dataset.tip;
  }

  function setPcs(next) {
    if (next === proto.pcs) return;
    proto.pcs = BP.clampPcs(next);
    update();
  }

  function commitTypedPcs(input) {
    const parsed = BP.parsePcsInput(input.value);
    if (parsed === null) { input.value = String(proto.pcs); return; }
    setPcs(parsed);
  }

  /* ---------------- events (bound once) ---------------- */

  function bindListeners() {
    if (listenersBound) return;
    listenersBound = true;

    document.addEventListener('click', e => {
      if (!flag) return;
      const target = e.target;
      const inPopover = popover && popover.contains(target);
      const trigger = $('#bp-trigger');
      if (popover && !popover.hidden && !inPopover && !(trigger && trigger.contains(target))) closePopover(false);

      const protoBtn = target.closest('[data-bp-proto]');
      if (protoBtn) {
        proto[protoBtn.dataset.bpProto] = protoBtn.dataset.value;
        update();
        return;
      }
      const act = target.closest('[data-bp-act]');
      if (!act || act.disabled) return;
      const kind = act.dataset.bpAct;
      if (kind === 'dec') setPcs(proto.pcs - 1);
      else if (kind === 'inc') setPcs(proto.pcs + 1);
      else if (kind === 'toggle') { if (popover && !popover.hidden) closePopover(false); else openPopover(); }
      else if (kind === 'close') closePopover(true);
    });

    document.addEventListener('change', e => {
      if (!flag) return;
      const el = e.target;
      if (el.matches('[data-bp-pcs]')) commitTypedPcs(el);
      else if (el.matches('[data-bp-style]')) { proto.style = el.value; update(); }
      else if (el.matches('[data-bp-boosted]')) { proto.boosted = el.checked; update(); }
      else if (el.matches('[data-bp-lower]')) { proto.lowerTier = el.checked; update(); }
    });

    // Blur with an empty/invalid value never fires `change` when the field
    // is left as-is, so restore on focusout too.
    document.addEventListener('focusout', e => {
      if (flag && e.target.matches && e.target.matches('[data-bp-pcs]')) commitTypedPcs(e.target);
    });

    document.addEventListener('keydown', e => {
      if (!flag) return;
      if (e.key === 'Escape' && popover && !popover.hidden) { e.preventDefault(); closePopover(true); return; }
      if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-bp-pcs]')) {
        e.preventDefault();
        commitTypedPcs(e.target);
      }
    });

    window.addEventListener('resize', position);
    window.addEventListener('resize', syncTitleTip);
    // Capture: the central panel is its own scroller, scroll doesn't bubble.
    window.addEventListener('scroll', position, true);
  }

  /** Called at the end of renderPrepPage(): the DOM was just rebuilt, so the
   * slot is empty and any popover belongs to a destroyed trigger. */
  function mount() {
    bindListeners();
    if (popover) { popover.remove(); popover = null; }
    if (flag) ensurePopover();
    update();
  }

  /* Flag upkeep is bound at load, not at first mount: the page may be entered
   * from another route, and the flag must be right before the first Prep
   * render builds its HTML. Plain "#/prep" clears it; an environment overlay
   * opened from a flagged page ("#/prep/env/x") keeps it. */
  window.addEventListener('hashchange', () => {
    const before = flag;
    const hash = location.hash;
    if (RouteUtils.hasBattlePointsPrototypeFlag(hash)) flag = true;
    else if (!/^#\/prep\/env\//.test(hash)) flag = false;
    if (before === flag) return;
    closePopover(false);
    // app.js's own hashchange handler doesn't re-render a same-base (#/prep)
    // change, so re-render once it has updated the route.
    setTimeout(() => { if (state.route.name === 'prep') renderPrepPage(); }, 0);
  });

  window.BattlePointsPrototype = { enabled, stripHtml, slotHtml, mount, refresh: update };
})();
