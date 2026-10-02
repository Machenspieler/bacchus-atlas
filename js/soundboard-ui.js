/* ============================================================
   Bacchus's Atlas — soundboard-ui.js
   The global soundboard's panel and its header trigger. Mounted once at the
   application-shell level: the panel is a child of <body>, outside #header
   (which renderHeader() rebuilds on every render) and outside every page, so
   navigating or switching language never recreates it, and the engine behind
   it (js/soundboard-engine.js) keeps playing whatever the panel is doing.

   The panel's DOM is built once and afterwards only has attributes updated
   (applyLabels() for language, applyState() for the engine) — never rebuilt
   while it is on screen, so a slider mid-drag or a focused button survives
   every state change.

   The only things in the panel that carry a sound's name are `aria-label`s:
   the sound buttons show an icon and nothing else.

   Depends on (all loaded before it): SoundboardManifest, SoundboardIcons,
   SoundboardEngine. Persistence, i18n and toasts are handed in by app.js —
   this file touches no storage itself.
   ============================================================ */
'use strict';

const SoundboardUI = (function () {
  const TRIGGER_ID = 'btn-soundboard';
  const PANEL_ID = 'soundboard-panel';
  const GAP_PX = 8;

  const M = SoundboardManifest;
  const Icons = SoundboardIcons;

  let opts = null;
  let engine = null;
  let prefs = null;
  let panel = null;
  let isOpen = false;
  let settingsOpen = false;
  let loadFailureToastShown = false;

  const AudioCtor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

  function t(key) { return opts.t(key); }
  function trigger() { return document.getElementById(TRIGGER_ID); }
  function pct(v) { return Math.round(v * 100); }

  /** Static attributes the header template writes itself; kept here so the
   * label, the tooltip and the icon of the trigger have one definition. */
  function triggerHtml() {
    const label = t('sb_open');
    return `<button type="button" class="btn sb-trigger" id="${TRIGGER_ID}"
              aria-label="${label}" data-tip="${label}"
              aria-expanded="false" aria-controls="${PANEL_ID}">${Icons.ICONS.waveform}<span class="sb-trigger-dot" aria-hidden="true"></span></button>`;
  }

  /* ---------------- panel construction ---------------- */

  function buildPanel() {
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.className = 'sb-panel';
    el.setAttribute('role', 'group');
    el.tabIndex = -1;
    el.hidden = true;
    el.dataset.settings = 'false';
    const cells = M.SOUNDS.map(s => `
      <div class="sb-cell">
        <button type="button" class="sb-sound" data-sound="${s.id}" data-state="idle">
          ${Icons.iconFor(s.icon)}
          <span class="sb-sound-alert" aria-hidden="true">${Icons.ICONS.alert}</span>
        </button>
        <input type="range" class="sb-slider sb-sound-volume" min="0" max="100" step="1" data-sound-volume="${s.id}">
      </div>`).join('');
    el.innerHTML = `
      <div class="sb-grid">${cells}</div>
      <div class="sb-controls">
        <input type="range" class="sb-slider sb-master" min="0" max="100" step="1" data-master-volume>
        <button type="button" class="sb-ctl" data-act="settings" aria-pressed="false">${Icons.ICONS.sliders}</button>
        <button type="button" class="sb-ctl sb-stop" data-act="stop" aria-disabled="true">${Icons.ICONS.stop}</button>
        <button type="button" class="sb-ctl" data-act="close">${Icons.ICONS.close}</button>
      </div>`;
    el.addEventListener('click', onPanelClick);
    el.addEventListener('input', onPanelInput);
    el.addEventListener('change', onPanelChange);
    document.body.appendChild(el);
    return el;
  }

  function ensurePanel() {
    if (!panel) {
      panel = buildPanel();
      applyLabels();
      applyState();
    }
    return panel;
  }

  /* ---------------- labels and state ---------------- */

  function soundName(sound) { return t(sound.nameKey); }

  function setTip(el, text) {
    el.setAttribute('aria-label', text);
    el.dataset.tip = text;
  }

  /** Everything language-dependent. Called after every header render, so a
   * language switch relabels the open or closed panel without touching the
   * engine, the loaded buffers, the levels or anything playing. */
  function applyLabels() {
    if (!panel) return;
    panel.setAttribute('aria-label', t('sb_panel_label'));
    const states = engine.getState().sounds;
    M.SOUNDS.forEach(s => {
      const btn = panel.querySelector(`[data-sound="${s.id}"]`);
      const status = states[s.id].status;
      const suffix = status === 'failed' ? ` (${t('sb_state_unavailable')})`
        : status === 'loading' || states[s.id].pending ? ` (${t('sb_state_loading')})` : '';
      // aria-label only — never a tooltip, never visible text.
      btn.setAttribute('aria-label', soundName(s) + suffix);
      panel.querySelector(`[data-sound-volume="${s.id}"]`)
        .setAttribute('aria-label', t('sb_volume_for').replace('{name}', soundName(s)));
    });
    setTip(panel.querySelector('[data-master-volume]'), t('sb_master_volume'));
    setTip(panel.querySelector('[data-act="settings"]'), t(settingsOpen ? 'sb_settings_done' : 'sb_settings'));
    setTip(panel.querySelector('[data-act="stop"]'), t('sb_stop_all'));
    setTip(panel.querySelector('[data-act="close"]'), t('sb_close'));
    const trg = trigger();
    if (trg) setTip(trg, t('sb_open'));
  }

  /** Mirrors the engine's snapshot onto the DOM. Pure attribute updates. */
  function applyState() {
    const snap = engine.getState();
    const trg = trigger();
    if (trg) trg.dataset.playing = snap.anyActive ? 'true' : 'false';
    if (!panel) return;
    M.SOUNDS.forEach(s => {
      const st = snap.sounds[s.id];
      const btn = panel.querySelector(`[data-sound="${s.id}"]`);
      const busy = st.status === 'loading' || st.pending;
      const prev = btn.dataset.state;
      btn.dataset.state = st.status;
      btn.dataset.playing = st.playing ? 'true' : 'false';
      btn.setAttribute('aria-disabled', st.status === 'ready' ? 'false' : 'true');
      if (busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
      if (prev !== st.status) applyLabels();
      const slider = panel.querySelector(`[data-sound-volume="${s.id}"]`);
      if (Number(slider.value) !== pct(st.volume)) slider.value = pct(st.volume);
      slider.setAttribute('aria-valuetext', `${pct(st.volume)}%`);
    });
    const master = panel.querySelector('[data-master-volume]');
    if (Number(master.value) !== pct(snap.master)) master.value = pct(snap.master);
    master.setAttribute('aria-valuetext', `${pct(snap.master)}%`);
    panel.querySelector('[data-act="stop"]').setAttribute('aria-disabled', snap.anyActive ? 'false' : 'true');
  }

  /** Called by renderHeader() after it rebuilds the header: re-applies the
   * trigger's dynamic state to the fresh button and relabels for the current
   * language. */
  function sync() {
    if (!engine) return;
    const trg = trigger();
    if (trg) trg.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    applyLabels();
    applyState();
    position();
  }

  /* ---------------- open / close / position ---------------- */

  function position() {
    if (!isOpen || !panel) return;
    const trg = trigger();
    if (!trg) return;
    const r = trg.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const left = Math.max(GAP_PX, Math.min(r.right - w, vw - w - GAP_PX));
    const top = Math.max(GAP_PX, Math.min(r.bottom + GAP_PX, vh - h - GAP_PX));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function openPanel(fromKeyboard) {
    ensurePanel();
    // From the click that opened the panel — the user activation the browser
    // needs before it lets a context run. No sound is played here.
    engine.ensureContext();
    isOpen = true;
    loadFailureToastShown = false;
    panel.hidden = false;
    const trg = trigger();
    if (trg) trg.setAttribute('aria-expanded', 'true');
    applyLabels();
    applyState();
    position();
    if (!AudioCtor) opts.showToast(t('sb_unsupported'), 'error');
    engine.load().then(() => {
      const failed = M.SOUNDS.some(s => engine.getState().sounds[s.id].status === 'failed');
      if (failed && isOpen && AudioCtor && !loadFailureToastShown) {
        loadFailureToastShown = true;
        opts.showToast(t('sb_load_failed'), 'error');
      }
    });
    if (fromKeyboard) firstSoundButton().focus({ preventScroll: true });
  }

  function closePanel(returnFocus) {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    const trg = trigger();
    if (trg) {
      trg.setAttribute('aria-expanded', 'false');
      if (returnFocus) trg.focus({ preventScroll: true });
    }
  }

  function firstSoundButton() { return panel.querySelector('.sb-sound'); }

  /* ---------------- events ---------------- */

  function onPanelClick(e) {
    const sound = e.target.closest('[data-sound]');
    if (sound) { playSound(sound.dataset.sound); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'close') closePanel(true);
    else if (act.dataset.act === 'stop') {
      if (act.getAttribute('aria-disabled') !== 'true') engine.stopAll();
    } else if (act.dataset.act === 'settings') {
      settingsOpen = !settingsOpen;
      panel.dataset.settings = settingsOpen ? 'true' : 'false';
      act.setAttribute('aria-pressed', settingsOpen ? 'true' : 'false');
      applyLabels();
      position();
    }
  }

  function playSound(id) {
    const st = engine.getState().sounds[id];
    if (!st) return;
    if (st.status === 'failed') { opts.showToast(t('sb_load_failed'), 'error'); return; }
    // Loading (or not yet started): refused, never queued.
    if (st.status !== 'ready') return;
    engine.play(id);
  }

  // Sliders change the level only — they never start or restart a sound.
  function onPanelInput(e) {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    const value = Number(el.value) / 100;
    if (el.hasAttribute('data-master-volume')) engine.setMasterVolume(value);
    else if (el.dataset.soundVolume) engine.setSoundVolume(el.dataset.soundVolume, value);
  }

  function onPanelChange(e) {
    if (e.target instanceof HTMLInputElement) savePrefs();
  }

  function savePrefs() {
    const snap = engine.getState();
    const sounds = {};
    M.SOUNDS.forEach(s => { sounds[s.id] = snap.sounds[s.id].volume; });
    prefs = { schemaVersion: M.SCHEMA_VERSION, master: snap.master, sounds };
    // A failed write is reported by app.js's persist(); playback never
    // depends on it.
    opts.savePrefs(prefs);
  }

  function onDocumentClick(e) {
    const trg = e.target.closest && e.target.closest(`#${TRIGGER_ID}`);
    if (!trg) return;
    if (isOpen) closePanel(false);
    // detail === 0 is a keyboard activation (Enter/Space) — only then is
    // focus moved into the panel.
    else openPanel(e.detail === 0);
  }

  /* A press anywhere else dismisses the panel without taking focus back —
   * the user has deliberately moved on. */
  function onPointerDownOutside(e) {
    if (!isOpen) return;
    if (panel.contains(e.target) || (e.target.closest && e.target.closest(`#${TRIGGER_ID}`))) return;
    closePanel(false);
  }

  /* Capture phase on window, so it runs before the overlay and menu Escape
   * handlers on document. It only acts when focus is on the panel or its
   * trigger — i.e. when this is the layer the user is in — and then consumes
   * the key, so an environment card or dialog underneath stays open. */
  function onKeyDown(e) {
    if (!isOpen) return;
    const active = document.activeElement;
    const trg = trigger();
    if (e.key === 'Escape' && active && (panel.contains(active) || active === trg)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closePanel(true);
      return;
    }
    // The panel lives at the end of <body>; these two keep Tab order natural
    // (trigger → panel → on, and back).
    if (e.key === 'Tab' && !e.shiftKey && active === trg) {
      e.preventDefault();
      firstSoundButton().focus();
    } else if (e.key === 'Tab' && e.shiftKey && active === firstSoundButton() && trg) {
      e.preventDefault();
      trg.focus();
    }
  }

  /* ---------------- init ---------------- */

  /**
   * opts: { t, prefs, savePrefs(prefs), showToast(message, kind) }
   * Nothing here starts audio, creates an AudioContext or fetches a file.
   */
  function init(options) {
    if (engine) return;
    opts = options;
    prefs = M.normalizePrefs(options.prefs);
    engine = SoundboardEngine.create({
      sounds: M.SOUNDS,
      createContext: () => new AudioCtor(),
      fetchFn: url => fetch(url),
      // Relative to the document, so the files resolve under the GitHub
      // Pages project base path rather than the domain root.
      resolveUrl: src => new URL(src, document.baseURI).href,
      master: prefs.master,
      volumes: prefs.sounds,
      onChange: applyState,
      onError: () => opts.showToast(t('sb_playback_failed'), 'error'),
    });
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('pointerdown', onPointerDownOutside, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', position);
    const header = document.getElementById('header');
    if (header && typeof ResizeObserver !== 'undefined') new ResizeObserver(position).observe(header);
  }

  return { init, sync, triggerHtml };
})();
