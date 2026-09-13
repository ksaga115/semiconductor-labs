/* 検査を全部走らせる（それぞれ別プロセス）
 *
 *   node tests/all.js
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
let bad = 0;
for (const f of ['run.js', 'quest.js', 'ui.js']) {
  console.log('\n=== ' + f + ' ===');
  if (spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' }).status !== 0) bad++;
}
console.log('\n' + (bad ? `${bad} 本が落ちた` : 'ぜんぶ通った'));
process.exitCode = bad ? 1 : 0;
