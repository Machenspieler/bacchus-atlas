/* ============================================================
   Bacchus's Atlas — soundboard-icons.js
   Inline SVGs for the global soundboard: the eight sound icons (keyed by the
   `icon` field of js/soundboard-manifest.js) and the panel's own controls.
   Same house style as the ICON_* constants in js/app.js — 24px grid,
   currentColor strokes, round caps and joins, `aria-hidden` — with a
   low-opacity currentColor fill on the silhouettes so they read at the
   ~32px size the panel shows them at. Custom drawings, no icon library.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SoundboardIcons = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HEAD = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">';
  var STROKE = 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  var SOFT = 'fill="currentColor" fill-opacity="0.22"';
  var SOLID = 'fill="currentColor" stroke="none"';

  function svg(body) { return HEAD + body + '</svg>'; }
  function path(d, extra) { return '<path d="' + d + '" ' + STROKE + (extra ? ' ' + extra : '') + '/>'; }
  function mirrored(inner) { return '<g transform="matrix(-1 0 0 1 24 0)">' + inner + '</g>'; }

  var ICONS = {
    /* Burning torch: flame with a hot core, cup, and a handle that is
     * clearly a stick. */
    torch: svg(
      path('M12 1.6c.2 2.4 3.3 4.2 3.3 7.5a3.3 3.3 0 0 1-6.6 0c0-1.6.8-2.7 1.6-3.7.1.9.5 1.5 1 1.8-.4-2.2-.1-4.2.7-5.6z', SOFT) +
      path('M12 9.4c1 .8 1.6 1.7 1.6 2.6a1.6 1.6 0 0 1-3.2 0c0-.9.6-1.8 1.6-2.6z', 'fill="currentColor" fill-opacity="0.55"') +
      path('M7.6 12.9h8.8l-1.5 3H9.1z', SOFT) +
      path('M10.2 15.9h3.6l.6 5.8c0 .3-.2.5-.5.5h-4.2c-.3 0-.5-.2-.5-.5z', SOFT) +
      path('M9.6 18.6h4.8')),

    /* Thundercloud with a lightning bolt breaking out of its underside. */
    thunder: svg(
      path('M7.4 14.6a4.2 4.2 0 0 1-.5-8.3 5.6 5.6 0 0 1 10.7 1.6 3.4 3.4 0 0 1-.4 6.7', SOFT) +
      path('M12.9 10.4 9.3 16.3h3.2l-1.5 5.4 4.5-7h-3.3l1.4-4.3z', 'fill="currentColor" fill-opacity="0.55"')),

    /* Plain explosion: an irregular starburst with a hot core. */
    explosion: svg(
      path('M12 2.5l1.8 4.6 5.6-3.9-2.9 6.2 6.4.7-5.8 2.8 4 4.4-5.8-1.3.1 5.4-3.4-4.2-3.2 3.7-.1-4.9-6.7 1.8 4.9-4.9-5.8-2.8 6.4-.7-2.2-5.4 4.9 3.1z', SOFT) +
      path('M12 8.6l1.2 2.4 2.6.3-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.3z', 'fill="currentColor" fill-opacity="0.5"')),

    /* Explosion with debris: a smaller burst, and four angular rocks flung
     * out to the corners with their speed lines — the rocks are what set it
     * apart from `explosion`. */
    explosionDebris: svg(
      path('M12 6.2l1.5 2.7 4-1.3-2.2 3.6 3.3 2.3-3.9.6.1 3.7-2.8-2.4-2.6 2.1-.1-3.4-2.9-.8 2.3-2.2-2.1-3.6 4 1.3z', SOFT) +
      path('M2.2 3.8l3.4-1.5 2.2 2.2-1 3.3-3.5.3-1.6-2.3z', 'fill="currentColor" fill-opacity="0.45"') +
      path('M17 2.4l3.9.9 1.2 3.2-2.7 1.9-3-1.6z', 'fill="currentColor" fill-opacity="0.45"') +
      path('M1.9 16.7l3.3-.9 2 2.8-1.6 3-3.5-.3z', 'fill="currentColor" fill-opacity="0.45"') +
      path('M17.2 17.6l3.3-.7 2 2.9-2.2 2.4-3.4-1.2z', 'fill="currentColor" fill-opacity="0.45"') +
      path('M10.4 3.2v1.6M3.4 12h2M20.6 12h-2')),

    /* Footsteps: two bootprints, one behind the other, each a waisted
     * sole plus a heel. */
    footsteps: svg(
      '<g transform="rotate(-12 8 11)">' +
        path('M8 2.6c2 0 3.1 1.6 3.1 3.7 0 1.9-.9 3.1-1.5 4.3H6.4C5.8 9.4 4.9 8.2 4.9 6.3 4.9 4.2 6 2.6 8 2.6z', SOFT) +
        '<ellipse cx="8" cy="13.4" rx="1.9" ry="1.8" ' + STROKE + ' ' + SOFT + '/>' +
      '</g>' +
      '<g transform="rotate(10 16.4 15)">' +
        path('M16.4 9.4c2 0 3.1 1.6 3.1 3.7 0 1.9-.9 3.1-1.5 4.3h-3.2c-.6-1.2-1.5-2.4-1.5-4.3 0-2.1 1.1-3.7 3.1-3.7z', SOFT) +
        '<ellipse cx="16.4" cy="20.4" rx="1.9" ry="1.8" ' + STROKE + ' ' + SOFT + '/>' +
      '</g>'),

    /* Hawk: the head of a bird of prey in profile — hooked beak, heavy
     * brow over a fierce eye, ruffled nape feathers. */
    hawk: svg(
      path('M2.2 11.8C2 9.4 4.4 7.6 7.4 7.2 8.4 4.8 11 3.2 13.8 3.8c3.8.8 6.2 4 6 7.8-.2 3.8-1.8 7-4.4 9.4H9.4c1.2-2.2 1-4.6-.8-6.2-1-.9-2.2-1.2-3.4-1.1-.8-.9-1.9-1.1-3-1.9z', SOFT) +
      path('M7.4 7.2c-.1 2.4-1 5.1-2.2 6.5') +
      path('M2.2 11.8c.9-.7 2-.9 3-.3', 'stroke-width="1.2"') +
      path('M8 6.7l4.2 1.6', 'stroke-width="1.9"') +
      '<circle cx="10" cy="10" r="1.15" ' + SOLID + '/>' +
      path('M14.2 12.6l2.4 1.5M13.4 16.2l2.5 1.2M17 9.8l1.8 1.6')),

    /* Thick wooden door: arched top, vertical planks, iron straps and a ring. */
    door: svg(
      path('M5.5 21.5V10a6.5 6.5 0 0 1 13 0v11.5z', SOFT) +
      path('M10 3.8v17.7M14 3.8v17.7') +
      path('M5.5 8.6h13M5.5 16.4h13', 'stroke-width="2"') +
      '<circle cx="16.4" cy="13" r="1.1" ' + STROKE + '/>' +
      path('M3.5 21.5h17')),

    /* Rock golem: lumpy faceted stone — a slab head with a brow ridge and
     * two glowing eyes, boulder shoulders, block fists, cracked torso. Nothing
     * soft or symmetrical, so it cannot be taken for a person or a robot. */
    golem: svg(
      path('M8.6 3.6l3.3-1.2 3.7 1.3 1.1 2.8-1 3-3.5.6-3.6-.5-1.1-3z', SOFT) +
      path('M9.2 5.9l2 .6M14.6 5.9l-2 .6', 'stroke-width="1.8"') +
      path('M8.2 10.6l7.8-.2 1.5 4.4-.9 2.2.3 4.6h-3.3l-.5-2.6h-1.5l-.4 2.6H8.3l.1-4.6-1-2.2z', SOFT) +
      path('M3.4 8.8l3.5-1.2 2 2.4-.5 3.2-3.6.5-2-2.2z', SOFT) +
      path('M20.6 8.8l-3.5-1.2-2 2.4.5 3.2 3.6.5 2-2.2z', SOFT) +
      path('M2.6 14.4l3.2-.6 1.2 2.6-1 3-3.4.2-1.2-2.8zM21.4 14.4l-3.2-.6-1.2 2.6 1 3 3.4.2 1.2-2.8z', SOFT) +
      path('M11 12.4l1.2 1.7-1.2 1.5 1 1.6')),

    /* ---- panel chrome ---- */
    waveform: svg(path('M3.5 10v4M7.5 6.5v11M11.5 3.5v17M15.5 7.5v9M19.5 10.5v3')),
    sliders: svg(path('M4 7h8M16 7h4M4 17h3M11 17h9') +
      '<circle cx="14" cy="7" r="2" ' + STROKE + '/><circle cx="9" cy="17" r="2" ' + STROKE + '/>'),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.6" ' + STROKE + ' ' + SOFT + '/>'),
    close: svg(path('M6 6l12 12M18 6 6 18')),
    alert: svg(path('M12 3.5 22 20H2L12 3.5z') + path('M12 10v4.5M12 17.2v.1')),
  };

  return {
    ICONS: ICONS,
    iconFor: function (key) { return ICONS[key] || ''; },
  };
});
