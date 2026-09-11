/* 検査を全部走らせる
 *
 *   node tests/all.js
 *
 * それぞれ別のプロセスで走らせる ― 一本が落ちても残りが走る。
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const files = ['run.js', 'quest.js', 'ui.js'];
let bad = 0;

for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) bad++;
}

console.log('\n' + (bad ? `${bad} 本が落ちた` : 'ぜんぶ通った'));
process.exitCode = bad ? 1 : 0;
