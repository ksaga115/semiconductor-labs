/* 全課題のお手本を実際に組み立てて、採点が通ることを確かめる:  node tests/quest.js
 *
 * お手本そのものは `src/answer.js` にある（画面の「お手本を見る」と同じもの）。
 * ここでやるのは、それが本当に課題を満たすかの確認。
 *
 * 課題の期待表が正しいかの検算であり、同時にチップ機構（階層・展開・境界をまたぐ
 * フィードバック）の総合試験でもある。NOT から積み上げて 4ビット ALU まで、
 * 実際に人がやるのと同じ順に組む。
 *
 * 最後に各課題の NAND 数を出す。src/quest.js の goal はこの数字を写したもの。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON, Int8Array, Int32Array, Uint8Array, Array, Object, String, Number });
ctx.window = ctx;
ctx.globalThis = ctx;
for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'quest.js', 'answer.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const NL = ctx.NL;
const N = NL.netlist, L = NL.lib, Q = NL.quest, A = NL.answer;
const Builder = A.Builder, sig = A.sig;

let pass = 0, fail = 0;
const measured = {};

/** 全角を2文字分に数えて幅を揃える（等幅端末で表が崩れないように） */
function width(s) {
  let w = 0;
  for (const ch of s) w += /[　-鿿＀-｠←-⇿]/.test(ch) ? 2 : 1;
  return w;
}
function padW(s, n) { return s + ' '.repeat(Math.max(0, n - width(s))); }
function check(cond, label) {
  if (cond) pass++; else { fail++; console.log(`  NG  ${label}`); }
}

/* ---------------- お手本を下から順に組み上げる ---------------- */

console.log('\n== お手本を下から順に組み上げる');

const all = A.buildAll();
const lib = all.lib;

A.STEPS.forEach(st => {
  const quest = Q.BY_ID[st.id];
  if (!quest) { fail++; console.log(`  NG  課題 ${st.id} が見つからない`); return; }
  if (all.errors[st.id]) { fail++; console.log(`  NG  ${quest.name}: ${all.errors[st.id]}`); return; }

  const c = all.circuits[st.id];
  const bad = N.validate(c, lib);
  if (bad.length) { fail++; console.log(`  NG  ${quest.name}: ${bad[0]}`); return; }

  const r = Q.grade(quest, c, lib);
  if (!r.ok) {
    fail++;
    console.log(`  NG  ${quest.name}: ${r.error || ''} ${r.bad ? JSON.stringify(r.bad) : ''}`);
    return;
  }
  pass++;
  measured[st.id] = r.gates;
  const mark = r.gates === quest.goal ? '' : `   ← src/quest.js の goal は ${quest.goal}`;
  console.log(`  OK  ${padW(quest.name, 18)} NAND ${String(r.gates).padStart(3)}個${mark}`);

  if (st.chip) check(!!lib[st.chip], `${quest.name}: チップ ${st.chip} として登録できた`);
});

check(A.STEPS.length === Q.QUESTS.length, 'お手本が全課題ぶんそろっている');

/* ---------------- 課題の期待表そのものの検算 ---------------- */

console.log('\n== 課題の期待表が矛盾していないこと');

Q.QUESTS.forEach(q => {
  if (q.kind !== 'comb') return;
  const w = q.inputs.length + q.outputs.length;
  check(q.rows.length === (1 << q.inputs.length), `${q.name}: 行数が 2^入力数`);
  check(q.rows.every(r => r.length === w), `${q.name}: どの行も入力＋出力の長さ`);
  check(q.rows.every(r => r.every(v => v === 0 || v === 1)), `${q.name}: 値は 0 か 1 だけ`);
  const keys = new Set(q.rows.map(r => r.slice(0, q.inputs.length).join('')));
  check(keys.size === q.rows.length, `${q.name}: 入力の組み合わせに重複が無い`);
  check(new Set(q.inputs).size === q.inputs.length, `${q.name}: 入力名に重複が無い`);
  check(new Set(q.outputs).size === q.outputs.length, `${q.name}: 出力名に重複が無い`);
});

Q.QUESTS.filter(q => q.kind === 'seq').forEach(q => {
  check(q.steps.length > 0, `${q.name}: 手順がある`);
  check(q.steps.every(s => Object.keys(s.in).every(k => q.inputs.indexOf(k) >= 0)),
    `${q.name}: 手順が触る入力は全部 inputs に載っている`);
  check(q.steps.every(s => Object.keys(s.want).every(k => q.outputs.indexOf(k) >= 0)),
    `${q.name}: 手順が見る出力は全部 outputs に載っている`);
});

Q.QUESTS.forEach(q => {
  check(!!q.why, `${q.name}: 「これができると何ができるか」がある`);
  check(q.stage >= 1 && q.stage <= Q.STAGES.length, `${q.name}: 章に属している`);
  check((q.needs || []).every(id => Q.BY_ID[id]), `${q.name}: needs が実在する課題を指している`);
});

/* ---------------- 間違った回路がちゃんと落ちること ---------------- */

console.log('\n== わざと間違えた回路は落ちる');

{
  /* XOR のつもりで OR を出す */
  const b = new Builder(lib);
  const a = b.input('A'), c = b.input('B');
  b.output('Y', b.chip('OR', [a, c])[0]);
  const r = Q.grade(Q.BY_ID.xor, b.c, lib);
  check(!r.ok, 'OR は XOR として通らない');
  check(r.bad && r.bad.in.join('') === '11', '食い違う最初の行 (A=1,B=1) を指している');
}
{
  /* D ラッチのつもりで素通し（記憶しない）*/
  const b = new Builder(lib);
  const d = b.input('D'), e = b.input('E');
  b.output('Q', b.chip('AND', [d, e])[0]);
  const r = Q.grade(Q.BY_ID.dlatch, b.c, lib);
  check(!r.ok, '素通しは D ラッチとして通らない');
  check(r.step === 1, '「門を閉じる」手順で落ちている');
}
{
  /* SR ラッチのつもりで、たすき掛けを片方だけ繋いだ回路 */
  const b = new Builder(lib);
  const s = b.input('S'), r0 = b.input('R');
  const g1 = b.openNand(), g2 = b.openNand();
  b.link(s, g1, 0); b.link(sig(g2, 0), g1, 1);
  b.link(r0, g2, 0); b.link(r0, g2, 1);
  b.output('Q', sig(g1, 0));
  const r = Q.grade(Q.BY_ID.srlatch, b.c, lib);
  check(!r.ok, 'たすき掛けが片方だけなら記憶できず落ちる');
}
{
  /* D フリップフロップのつもりで D ラッチ（素通しの窓が開く）*/
  const b = new Builder(lib);
  const d = b.input('D'), c = b.input('C');
  b.output('Q', b.chipn('DLATCH', { D: d, E: c }).Q);
  const r = Q.grade(Q.BY_ID.dff, b.c, lib);
  check(!r.ok, 'D ラッチは D フリップフロップとして通らない');
  check(r.step === 2, 'C が 1 のあいだに D を変える手順で落ちている');
}

/* ---------------- 画面から見るお手本 ---------------- */

console.log('\n== 「お手本を見る」が返すもの');

{
  const r = A.build('xor');
  check(r && r.circuit, 'お手本を1つだけ取り出せる');
  check(Q.grade(Q.BY_ID.xor, r.circuit, r.lib).ok, '取り出したお手本はちゃんと採点を通る');
  check(A.build('add4').uses.indexOf('FULL') >= 0, '使っているチップの名前が分かる');
  check(A.build('not').uses.length === 0, 'NAND だけのお手本は、使っているチップが無い');
  check(A.build('ないもの') === null, '無い課題には null を返す');
}

/* ---------------- 実測した NAND 数 ---------------- */

console.log('\n== お手本の NAND 数（src/quest.js の goal に写す値）');
Q.QUESTS.forEach(q => {
  if (measured[q.id] === undefined) return;
  const same = measured[q.id] === q.goal;
  if (!same) fail++;
  console.log(`  ${q.id.padEnd(9)} 実測 ${String(measured[q.id]).padStart(3)}  /  goal ${String(q.goal).padStart(3)}  ${same ? '' : '← 要更新'}`);
});

console.log(`\n${fail ? 'NG' : 'OK'}  合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
