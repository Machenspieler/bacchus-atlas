'use strict';
/* The illustrated Region Inspector header (PD-049): every Journey terrain has its 960x540 WebP, and the prototype ?hdr= switch is gone. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Model = require('../js/journey2-model.js');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('every Journey terrain (and Settlement) has a header WebP that is 960x540', () => {
  for (const id of Model.HABITAT_IDS.concat(['settlement'])) {
    const buf = fs.readFileSync(path.join(ROOT, 'img/journey2/headers', id + '.webp'));
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF', id);
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP', id);
    assert.equal(buf.toString('ascii', 12, 16), 'VP8 ', id + ': lossy bitstream');
    assert.equal(buf.readUInt16LE(26) & 0x3fff, 960, id + ' width');
    assert.equal(buf.readUInt16LE(28) & 0x3fff, 540, id + ' height');
    assert.ok(buf.length < 200 * 1024, id + ' stays under 200 KB');
  }
});

test('HEADER_ART lists every terrain and no prototype switch remains', () => {
  const view = read('js/journey2-view.js'), css = read('css/journey2.css');
  for (const id of Model.HABITAT_IDS) assert.match(view, new RegExp('\\b' + id + ': \\{'), id);
  assert.ok(!/hdr=|data-art-pos|data-art-h/.test(view + css));
});
