/* 全部まとめて走らせる:  node tests/all.js */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const files = ['run.js', 'expr.js', 'quest.js', 'layout.js', 'ui.js', 'ram.js'];
let bad = 0;
for (const f of files) {
  console.log('\n──────── ' + f);
  try {
    process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' }));
  } catch (e) {
    process.stdout.write(e.stdout || '');
    process.stderr.write(e.stderr || '');
    bad++;
  }
}
console.log('\n════════ ' + (bad ? bad + ' 本の検査が失敗' : 'すべて合格'));
process.exit(bad ? 1 : 0);
