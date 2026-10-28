/* ============================================================
   Bacchus's Atlas — journey2-nav.js
   Pure, DOM-free rule for the player map's bottom navigation (PD-083): at most ONE destination is active at a time.
   The route is persistent map state; Legend and Display are the sheet the user is looking at. They are independent, and a sheet
   outranks the route only for as long as it is open:

     - activeDestination   ({ legendOpen, menu, routeActive }) -> 'legend' | 'display' | 'route' | null
   Nothing here touches the camera, the route or the document.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Journey2Nav = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** `menu` is the name of the open rail menu ('display' on the player map) or null; Legend and a menu never stack, but if both were ever reported the menu, opened last, wins. */
  function activeDestination(s) {
    if (s && s.menu === 'display') return 'display';
    if (s && s.legendOpen) return 'legend';
    if (s && s.routeActive) return 'route';
    return null;
  }

  return { activeDestination: activeDestination };
});
