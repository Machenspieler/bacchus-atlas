#!/usr/bin/env node
/* ============================================================
   Bacchus's Atlas — apply-text-patches.js
   Dev tool for proofreading passes (see .claude/skills/audit-environments).
   Applies exact-match text replacements to data/environments.json, so a
   reviewer can hand over a patch file instead of editing a 2.5 MB JSON by
   hand. It is the only script besides data imports that writes the file,
   and it never runs in CI.

   Usage:  node scripts/apply-text-patches.js [--write] patch.json [...]
   Default is a dry run; --write saves the file (same 2-space JSON layout).

   A patch file is an array of
     { "id": "<environment id>", "path": "features[1].description.en",
       "from": "<exact substring>", "to": "<replacement>", "all": true? }
   `path` is the full path inside the environment, language included
   ("impulses.ru[0]", "name.ru", "story_seeds[0].body.en"). `from` must occur
   exactly once in that string unless "all" is set; anything else is reported
   as FAIL and nothing about that entry is applied. Exit code 1 on any FAIL.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'environments.json');

const parsePath = p => [...p.matchAll(/([^.[\]]+)|\[(\d+)\]/g)]
  .map(m => (m[2] !== undefined ? Number(m[2]) : m[1]));

function applyPatches(data, patches, label) {
  const byId = new Map(data.environments.map(e => [e.id, e]));
  const result = { ok: 0, failures: [] };
  for (const p of patches) {
    const fail = why => result.failures.push(
      `FAIL ${label} ${p.id} ${p.path}: ${why} | ${JSON.stringify(p.from).slice(0, 80)}`);
    const env = byId.get(p.id);
    if (!env) { fail('no such id'); continue; }
    const keys = parsePath(p.path);
    let holder = env;
    for (const k of keys.slice(0, -1)) holder = holder == null ? holder : holder[k];
    const last = keys[keys.length - 1];
    const current = holder == null ? undefined : holder[last];
    if (typeof current !== 'string') { fail('path is not a string'); continue; }
    if (!p.from || p.from === p.to) { fail('empty or no-op'); continue; }
    const n = current.split(p.from).length - 1;
    if (n === 0) { fail('from not found'); continue; }
    if (n > 1 && !p.all) { fail(`from occurs ${n}x (lengthen it or set "all": true)`); continue; }
    holder[last] = current.split(p.from).join(p.to);
    result.ok++;
  }
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const files = args.filter(a => a !== '--write');
  if (!files.length) { console.error('usage: node scripts/apply-text-patches.js [--write] patch.json [...]'); process.exit(2); }
  const raw = fs.readFileSync(FILE, 'utf8');
  const data = JSON.parse(raw);
  let ok = 0;
  const failures = [];
  for (const f of files) {
    const r = applyPatches(data, JSON.parse(fs.readFileSync(f, 'utf8')), path.basename(f));
    ok += r.ok;
    failures.push(...r.failures);
  }
  failures.forEach(l => console.log(l));
  console.log(`${write ? 'write' : 'dry'}: ${ok} ok, ${failures.length} failed`);
  if (write) fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  process.exit(failures.length ? 1 : 0);
}

module.exports = { applyPatches, parsePath };
