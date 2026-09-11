/* 検査の土台
 *
 * src/*.js は IIFE でグローバル SL に生やしている（ブラウザに触るのは ui.js・chart.js・main.js だけ）。
 * vm で読み込めば Node からそのまま使える ― ブラウザは要らない。
 * 数え方・比べ方は check.js（ProcessLab と共用）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const check = require('./check.js');

const ROOT = path.join(__dirname, '..');

/** ブラウザに触らない src を読み込む。names を渡せばその順で読む */
function load(names) {
  names = names || ['phys', 'stack', 'poisson', 'band', 'dev', 'light', 'parse', 'quest', 'answer', 'store'];
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  /* store.js は localStorage を触るので、最小の受け皿を置く */
  const mem = new Map();
  sandbox.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };
  vm.createContext(sandbox);
  for (const n of names) {
    const src = fs.readFileSync(path.join(ROOT, 'src', n + '.js'), 'utf8');
    vm.runInContext(src, sandbox, { filename: 'src/' + n + '.js' });
  }
  return sandbox.SL;
}

module.exports = Object.assign({ load, ROOT }, check);
