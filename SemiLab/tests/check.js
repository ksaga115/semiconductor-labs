/* 検査の道具 ― 数え方と比べ方（SemiLab と ProcessLab で共用）
 *
 * ProcessLab の tests/harness.js もこれを読む。以前は両方に同じものを書いていた。
 * 1つのプロセスの中では数を共有する（tests/*.js は1本ずつ別プロセスで走る）。
 */
'use strict';

let pass = 0, fail = 0, group = '';
const failures = [];

/** まとまり1つ。中で例外が出たら、そのまとまりを1件の失敗として数えて続ける */
function T(name, fn) {
  group = name;
  const t0 = Date.now(), before = pass + fail;
  try { fn(); } catch (e) {
    fail++;
    failures.push(`[${group}] 例外: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e}`);
  }
  console.log(`  ${name}  ${pass + fail - before} 件  ${Date.now() - t0}ms`);
}

function bad(label, got, want) {
  fail++;
  failures.push(`[${group}] ${label}` + (want !== undefined ? `\n        出た: ${got}\n        欲しい: ${want}` : ''));
}

function ok(label, cond) { if (cond) pass++; else bad(label, 'false', 'true'); }

function eq(label, got, want) {
  if (got === want) pass++; else bad(label, JSON.stringify(got), JSON.stringify(want));
}

/** 絶対誤差で比べる */
function near(label, got, want, tol) {
  if (typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= tol) pass++;
  else bad(label, got, `${want} ± ${tol}`);
}

/** 何倍以内かで比べる（桁で変わる量はこちら） */
function within(label, got, want, factor) {
  if (typeof got === 'number' && isFinite(got) && got !== 0 && want !== 0
      && got / want <= factor && want / got <= factor) pass++;
  else bad(label, got, `${want} の ${factor} 倍以内`);
}

function report() {
  console.log('');
  if (failures.length) {
    console.log('落ちたもの:');
    failures.forEach((f) => console.log('  ✗ ' + f));
    console.log('');
  }
  console.log(`通った ${pass} / 落ちた ${fail}`);
  if (fail) process.exitCode = 1;
}

function counts() { return { pass, fail }; }

module.exports = { T, ok, eq, near, within, report, counts };
