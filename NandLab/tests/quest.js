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
  console.log(`  OK  ${padW(quest.name, 18)} ${Q.unitOf(quest).padEnd(4)} ${String(r.gates).padStart(3)}個${mark}`);

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

/* ---------------- 第7章 計測のロジック: 間違えた回路は落ちる ---------------- */

console.log('\n== 第7章 ― わざと間違えた回路は落ちる');
{
  /* グレイ符号のつもりで素通し（G = B）― 変わる行で落ちる */
  const b = new Builder(lib);
  [0, 1, 2, 3].forEach(i => b.output('G' + i, b.input('B' + i)));
  check(!Q.grade(Q.BY_ID.b2g, b.c, lib).ok, '素通しはグレイ符号の変換として通らない');
}
{
  /* 戻すほうを「上の桁と XOR」だけで作る（鎖にしない）― B1・B0 がずれて落ちる */
  const b = new Builder(lib);
  const G = [0, 1, 2, 3].map(i => b.input('G' + i));
  b.output('B3', G[3]);
  for (let i = 0; i < 3; i++) b.output('B' + i, b.chipn('XOR', { A: G[i], B: G[i + 1] }).Y);
  check(!Q.grade(Q.BY_ID.g2b, b.c, lib).ok, '鎖にしない XOR はグレイ符号を戻せない（それは 2進 → グレイの式）');
}
{
  /* 「101」検出器のつもりで、直前の 1 回だけを覚える（Z = Q0）― 「1」を見ただけで Z が立って落ちる */
  const b = new Builder(lib);
  const x = b.input('X'), c = b.input('C');
  b.output('Z', b.chipn('DFF', { D: x, C: c }).Q);
  check(!Q.grade(Q.BY_ID.det101, b.c, lib).ok, '1 を覚えるだけの回路は「101」検出器として通らない');
}

/* ---------------- 素子を混ぜない（第6章 NOR の世界） ---------------- */

console.log('\n== 素子を混ぜると落ちる');

{
  /* NOR の章に、NAND の世界の NOT チップを持ち込む ― 振る舞いは合っていても落ちる */
  const b = new Builder(lib);
  const a = b.input('A');
  b.output('Y', b.chip('NOT', [a])[0]);
  const r = Q.grade(Q.BY_ID.n_not, b.c, lib);
  check(!r.ok && /NOR だけ/.test(r.error || ''), 'NOR の章に NAND を持ち込むと落ちる');
}
{
  /* NAND の章の「NOR」課題に NOR 素子を1個置く ― 振る舞いは合っていても落ちる */
  const b = new Builder(lib);
  const a = b.input('A'), c = b.input('B');
  b.output('Y', b.nor(a, c));
  const r = Q.grade(Q.BY_ID.nor, b.c, lib);
  check(!r.ok && /第6章/.test(r.error || ''), 'NAND の章に NOR 素子を持ち込むと落ちる');
  /* 同じ回路でも、NOR の章の課題（NOR で OR の否定＝NOR そのもの…は無いので NOT で確かめる）なら素子の種類では落ちない */
  const b2 = new Builder(lib);
  const a2 = b2.input('A');
  b2.output('Y', b2.nor(a2, a2));
  const r2 = Q.grade(Q.BY_ID.n_not, b2.c, lib);
  check(r2.ok && r2.gates === 1 && r2.unit === 'NOR', 'NOR 1個の NOT は NOR の章で通り、NOR 1個と数える');
}
{
  /* 双対: NAND 4個の XOR と同じ配線を NOR でやると、XOR ではなく XNOR になる */
  const b = new Builder(lib);
  const a = b.input('A'), c = b.input('B');
  const t = b.nor(a, c);
  b.output('Y', b.nor(b.nor(a, t), b.nor(c, t)));
  check(Q.grade(Q.BY_ID.n_xnor, b.c, lib).ok, 'NAND の XOR と同じ配線の NOR は XNOR として通る');
  const nandXor = Q.BY_ID.xor;
  check(!Q.grade(Object.assign({}, nandXor, { prim: 'nor' }), b.c, lib).ok, '同じ回路は XOR としては通らない');
}
{
  /* NOR の SR ラッチは「1 で効く」― NAND のラッチ（0 で効く）の手順では落ちる */
  const r = Q.grade(Object.assign({}, Q.BY_ID.srlatch, { prim: 'nor' }), all.circuits.n_sr, lib);
  check(!r.ok, 'NOR のラッチは、0 で効く NAND のラッチの手順では通らない');
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
