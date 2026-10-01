/* ============================================================
   Bacchus's Atlas — prep-share-utils.js
   Pure, dependency-free encoding/decoding of a shareable Prep link payload.
   A shared link carries only a snapshot of one Prep (title, Session Notes,
   and the selected environment/adversary/item ids) as compact JSON, UTF-8
   encoded and written as unpadded URL-safe Base64. Everything arriving from a
   URL is untrusted: decodePrep() never throws, and reports a structured
   { ok: false, reason } instead.

   Dependency-free on purpose (no window/document/state; only the standard
   TextEncoder/TextDecoder), so the same file loads as a plain <script> and is
   required() from a Node test — see tests/prep-share-utils.test.js and the
   shape of js/route-utils.js.
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PrepShareUtils = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PAYLOAD_VERSION = 1;
  /** Longest encoded `prep` value decodePrep() will even look at. */
  var MAX_ENCODED_LENGTH = 16000;
  /** Longest complete share URL the app will hand to the clipboard. Kept
   * below MAX_ENCODED_LENGTH so every link the app produces can be opened. */
  var MAX_URL_LENGTH = 8000;
  /** Sanity bound on each id array of an untrusted payload. */
  var MAX_IDS_PER_LIST = 500;

  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var LOOKUP = (function () {
    var map = Object.create(null);
    for (var i = 0; i < ALPHABET.length; i++) map[ALPHABET.charAt(i)] = i;
    return map;
  })();

  /* ---------------- Base64url over bytes (never btoa on a string) ---------------- */

  function bytesToBase64Url(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : -1;
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : -1;
      out += ALPHABET.charAt(b0 >> 2);
      out += ALPHABET.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
      if (b1 >= 0) out += ALPHABET.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
      if (b2 >= 0) out += ALPHABET.charAt(b2 & 63);
    }
    return out;
  }

  /** Returns a Uint8Array, or null for anything that is not unpadded base64url. */
  function base64UrlToBytes(text) {
    if (typeof text !== 'string' || !text.length) return null;
    if (text.length % 4 === 1) return null;
    var values = [];
    for (var i = 0; i < text.length; i++) {
      var v = LOOKUP[text.charAt(i)];
      if (v === undefined) return null;
      values.push(v);
    }
    var bytes = [];
    for (var j = 0; j < values.length; j += 4) {
      var c0 = values[j], c1 = values[j + 1];
      var c2 = j + 2 < values.length ? values[j + 2] : -1;
      var c3 = j + 3 < values.length ? values[j + 3] : -1;
      bytes.push(((c0 << 2) | (c1 >> 4)) & 255);
      if (c2 >= 0) bytes.push((((c1 & 15) << 4) | (c2 >> 2)) & 255);
      if (c3 >= 0) bytes.push((((c2 & 3) << 6) | c3) & 255);
    }
    return new Uint8Array(bytes);
  }

  /* ---------------- payload normalization ---------------- */

  function dedupe(ids) {
    var seen = Object.create(null);
    var out = [];
    ids.forEach(function (id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function readIdList(obj, key) {
    if (!has(obj, key)) return { reason: 'missing-field' };
    var list = obj[key];
    if (!Array.isArray(list)) return { reason: 'invalid-type' };
    if (list.length > MAX_IDS_PER_LIST) return { reason: 'too-large' };
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i] !== 'string') return { reason: 'invalid-type' };
    }
    return { ids: dedupe(list) };
  }

  /** Validates a parsed compact payload ({ v, t, n, e, a, i }) and returns
   * { ok: true, value: { version, title, notes, environmentIds, adversaryIds,
   * itemIds } } or { ok: false, reason }. Title and notes are returned
   * verbatim — never trimmed or truncated here. Id arrays are de-duplicated in
   * first-occurrence order; whether an id exists in a catalogue is the
   * caller's concern. */
  function normalizeSharedPrep(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, reason: 'invalid-shape' };
    }
    if (!has(value, 'v')) return { ok: false, reason: 'missing-field' };
    if (value.v !== PAYLOAD_VERSION) return { ok: false, reason: 'unsupported-version' };
    if (!has(value, 't') || !has(value, 'n')) return { ok: false, reason: 'missing-field' };
    if (typeof value.t !== 'string' || typeof value.n !== 'string') {
      return { ok: false, reason: 'invalid-type' };
    }
    var env = readIdList(value, 'e');
    if (!env.ids) return { ok: false, reason: env.reason };
    var adv = readIdList(value, 'a');
    if (!adv.ids) return { ok: false, reason: adv.reason };
    var items = readIdList(value, 'i');
    if (!items.ids) return { ok: false, reason: items.reason };
    return {
      ok: true,
      value: {
        version: PAYLOAD_VERSION,
        title: value.t,
        notes: value.n,
        environmentIds: env.ids,
        adversaryIds: adv.ids,
        itemIds: items.ids,
      },
    };
  }

  /* ---------------- encode / decode ---------------- */

  /** Serializes the shareable part of `prep` — and nothing else — to an
   * unpadded URL-safe Base64 string. Never truncates the title or notes. */
  function encodePrep(prep) {
    var source = prep || {};
    var list = function (ids) { return dedupe(Array.isArray(ids) ? ids.filter(function (x) { return typeof x === 'string'; }) : []); };
    var payload = {
      v: PAYLOAD_VERSION,
      t: typeof source.title === 'string' ? source.title : '',
      n: typeof source.notes === 'string' ? source.notes : '',
      e: list(source.environmentIds),
      a: list(source.adversaryIds),
      i: list(source.itemIds),
    };
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  }

  /** Decodes an untrusted `prep` query value. Never throws. Returns
   * { ok: true, value } (see normalizeSharedPrep) or { ok: false, reason }
   * with reason one of: 'too-large', 'invalid-base64', 'invalid-utf8',
   * 'invalid-json', 'invalid-shape', 'missing-field', 'invalid-type',
   * 'unsupported-version'. */
  function decodePrep(encoded) {
    try {
      if (typeof encoded !== 'string' || !encoded) return { ok: false, reason: 'invalid-base64' };
      if (encoded.length > MAX_ENCODED_LENGTH) return { ok: false, reason: 'too-large' };
      var bytes = base64UrlToBytes(encoded);
      if (!bytes) return { ok: false, reason: 'invalid-base64' };
      var text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (err) {
        return { ok: false, reason: 'invalid-utf8' };
      }
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        return { ok: false, reason: 'invalid-json' };
      }
      return normalizeSharedPrep(parsed);
    } catch (err) {
      return { ok: false, reason: 'invalid-base64' };
    }
  }

  return {
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    MAX_ENCODED_LENGTH: MAX_ENCODED_LENGTH,
    MAX_URL_LENGTH: MAX_URL_LENGTH,
    MAX_IDS_PER_LIST: MAX_IDS_PER_LIST,
    encodePrep: encodePrep,
    decodePrep: decodePrep,
    normalizeSharedPrep: normalizeSharedPrep,
  };
});
