/* Dev-only RFC 4180 CSV serializer/parser for the Journey 2 measurement exports.
   Cell ids are "q,r" (they contain the delimiter), so every string field goes through
   field(); a naive join(',') is what produced the unquotable 9-field rows in Stage 0. */
'use strict';

/** One field -> text. Numbers/booleans are written bare; strings containing , " CR or LF are quoted ("" escapes "). */
function field(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** rows: array of arrays. Returns text with \n line ends and a trailing newline. */
function serialize(rows) { return rows.map(r => r.map(field).join(',')).join('\n') + '\n'; }

/** Strict parser: returns array of string arrays. Throws on an unterminated quote or a stray quote inside an unquoted field. */
function parse(text) {
  const rows = []; let row = [], cur = '', i = 0, quoted = false, started = false;
  const endField = () => { row.push(cur); cur = ''; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue; } quoted = false; i++; if (i < text.length && !/[,\r\n]/.test(text[i])) throw new Error('CSV: text after closing quote at offset ' + i); continue; }
      cur += ch; i++; continue;
    }
    if (ch === '"') { if (started) throw new Error('CSV: quote inside unquoted field at offset ' + i); quoted = true; started = true; i++; continue; }
    if (ch === ',') { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    cur += ch; started = true; i++;
  }
  if (quoted) throw new Error('CSV: unterminated quoted field');
  if (cur !== '' || started || row.length) endRow();
  return rows;
}

/** Parsed rows -> objects keyed by the header row; throws if any row's field count differs from the header's. */
function parseObjects(text) {
  const rows = parse(text);
  const head = rows.shift() || [];
  return rows.map((r, n) => {
    if (r.length !== head.length) throw new Error('CSV: row ' + (n + 2) + ' has ' + r.length + ' fields, header has ' + head.length);
    const o = {}; head.forEach((h, k) => { o[h] = r[k]; }); return o;
  });
}

module.exports = { field, serialize, parse, parseObjects };
