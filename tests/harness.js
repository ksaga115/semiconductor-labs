/* 検査の土台 ― SemiLab の物理（../SemiLab/src）と、このラボの src を vm で読む
 * 数え方・比べ方は SemiLab の tests/check.js を共用する */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SEMI = path.join(ROOT, '..', 'SemiLab', 'src');
const check = require(path.join(ROOT, '..', 'SemiLab', 'tests', 'check.js'));
const SEMI_FILES = ['phys', 'stack', 'poisson', 'band', 'dev', 'light', 'parse'];
const OWN = ['grid', 'implant', 'oxide', 'diffuse', 'recipe', 'measure', 'quest', 'answer', 'store'];

function load() {
  const sb = { console };
  sb.window = sb; sb.globalThis = sb;
  const mem = new Map();
  sb.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  vm.createContext(sb);
  for (const n of SEMI_FILES) vm.runInContext(fs.readFileSync(path.join(SEMI, n + '.js'), 'utf8'), sb, { filename: 'SemiLab/src/' + n + '.js' });
  for (const n of OWN) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8'), sb, { filename: 'src/' + n + '.js' });
  return { PL: sb.PL, SL: sb.SL };
}

module.exports = Object.assign({ load, ROOT, SEMI, SEMI_FILES, OWN }, check);
