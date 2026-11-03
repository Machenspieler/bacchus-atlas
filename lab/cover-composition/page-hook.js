/* ============================================================
   Cover Composition Lab V2 — page-hook.js  (DEV-ONLY, never loaded by index.html)
   Injected by scripts/shoot-cover-composition-lab.js into the REAL running app (a fresh browser profile
   seeded with fixture lists) so the full-page comparison is the genuine My Lists page — real header,
   navigation, grid and card — with only listCoverHtml swapped. Needs CoverCompositionCore / Bridge / Reviews
   loaded first, and reaches the app's own globals (ART_RUNTIME, envsInList, artBiome, COVER_SIZES).
   ============================================================ */
(function () {
  'use strict';
  if (!window.__labOrigCover) window.__labOrigCover = listCoverHtml;
  window.__labInstall = function (strategy, ratio) {
    const Core = window.CoverCompositionCore, Bridge = window.CoverCompositionBridge;
    const reviews = window.CoverCompositionReviews.REVIEWS;
    if (strategy === 'A') { window.listCoverHtml = window.__labOrigCover; return; }
    window.listCoverHtml = function (list) {
      const a = Core.analyse(envsInList(list.id).map(e => ({ id: e.id, artBiome: artBiome(e) })), ART_RUNTIME, ListCoverUtils);
      const k = Core.compose(strategy, a, ART_RUNTIME, { reviews, ratio });
      return Bridge.coverHtml(k, { COVER_SIZES }, ART_RUNTIME) || window.__labOrigCover(list);
    };
  };
})();
