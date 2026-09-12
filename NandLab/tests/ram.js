/* ram16（実装部品）の検査:  node tests/ram.js
 *
 * 見るのは3つ。
 *   1. ふつうの使い方 ― C の立ち上がりで書き、番地で読む。電源投入直後は X
 *   2. X の正直さ ― 「書いたかもしれない」ときにセルが X になる（嘘をつかない）
 *   3. まわりの道具との折り合い ― 課題の採点は断る・式は断る・「小さくする」はまとめない
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON, Int8Array, Int32Array, Uint8Array, Array, Object, String, Number });
ctx.window = ctx;
ctx.globalThis = ctx;
for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'quest.js', 'expr.js', 'slim.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const NL = ctx.NL;
const N = NL.netlist, L = NL.lib, S = NL.sim, T = NL.truth;
const X = S.X;

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++;
  else { fail++; console.log(`  NG  ${label}\n      期待 ${e}\n      実際 ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }
function group(name, fn) { console.log(`\n== ${name}`); fn(); }

function circ() { return N.create(); }
function put(c, kind, opt) { return N.addPart(c, kind, 0, 0, opt); }
function join(c, a, ap, b, bp, lib) { return N.connect(c, a.id, ap, b.id, bp, lib); }

const PORTS = N.RAM_PORTS;   /* ['A0','A1','A2','A3','D','W','C'] */

/** 全端子をスイッチで直接握る RAM 一式 */
function ramCircuit() {
  const c = circ(), sw = {};
  PORTS.forEach(nm => { sw[nm] = put(c, 'in', { name: nm }); });
  const r = put(c, 'ram16');
  const y = put(c, 'out', { name: 'Q' });
  PORTS.forEach((nm, i) => join(c, sw[nm], 0, r, i));
  join(c, r, 0, y, 0);
  return c;
}
function simOf(c, lib) {
  const flat = L.flatten(c, lib || {});
  if (flat.error) throw new Error(flat.error);
  const sim = new S.Sim(flat);
  sim.settle();
  return sim;
}
function setAddr(sim, a) { for (let i = 0; i < 4; i++) sim.setInput('A' + i, (a >> i) & 1); }
function pulse(sim) {
  sim.setInput('C', 1); sim.settle();
  sim.setInput('C', 0); sim.settle();
}
/** 番地 a に v を書く（W=1 で C を一往復） */
function write(sim, a, v) {
  setAddr(sim, a); sim.setInput('D', v); sim.setInput('W', 1); sim.settle();
  pulse(sim);
  sim.setInput('W', 0); sim.settle();
}
function readAt(sim, a) { setAddr(sim, a); sim.settle(); return sim.read('Q'); }

group('端子と展開', () => {
  eq(N.portsOf({ kind: 'ram16' }), { in: 7, out: 1 }, 'ram16 は入力7・出力1');
  eq(PORTS.length, 7, '端子名は7つ');
  const c = ramCircuit();
  const flat = L.flatten(c, {});
  ok(!flat.error, '展開できる');
  const rams = flat.gates.filter(g => g.kind === 'ram16');
  eq(rams.length, 1, 'ram16 のゲートが1つできる');
  eq(rams[0].ins.length, 7, '入力ネットが7本');
  ok(rams[0].ins.every(i => i >= 0), '7本とも繋がっている');
});

group('ふつうの使い方 ― 書いて、読む', () => {
  const sim = simOf(ramCircuit());
  eq(readAt(sim, 0), X, '電源投入直後は X（書くまで読めない）');
  eq(readAt(sim, 15), X, '番地 15 も X');

  write(sim, 3, 1);
  eq(readAt(sim, 3), 1, '番地 3 に書いた 1 が読める');
  eq(readAt(sim, 4), X, '書いていない番地 4 は X のまま');

  write(sim, 3, 0);
  eq(readAt(sim, 3), 0, '上書きできる');

  write(sim, 12, 1);
  eq(readAt(sim, 12), 1, '別の番地にも書ける');
  eq(readAt(sim, 3), 0, '番地 3 は無事');

  /* 読み出しは組み合わせ ― クロックを動かさず番地だけ変える */
  setAddr(sim, 12); sim.settle();
  eq(sim.read('Q'), 1, '番地を変えるだけで Q が変わる（読みにクロックは要らない）');

  /* W=0 の立ち上がりでは書かない */
  setAddr(sim, 5); sim.setInput('D', 1); sim.setInput('W', 0); sim.settle();
  pulse(sim);
  eq(readAt(sim, 5), X, 'W=0 の C 立ち上がりでは書かれない');

  /* C を上げっぱなしでもう一度 settle しても二重には書かれない（エッジは一度だけ） */
  setAddr(sim, 6); sim.setInput('D', 1); sim.setInput('W', 1); sim.settle();
  sim.setInput('C', 1); sim.settle();
  sim.setInput('D', 0); sim.settle();          /* C=1 のまま D を変える */
  eq(readAt(sim, 6), 1, 'レベルではなくエッジで書く（C=1 の間の D の変化は入らない）');
  sim.setInput('C', 0); sim.setInput('W', 0); sim.settle();
});

group('クロック部品と組み合わせる', () => {
  /* C だけ clock 部品。clockCycle で1周期＝1回書く */
  const c = circ(), sw = {};
  ['A0', 'A1', 'A2', 'A3', 'D', 'W'].forEach(nm => { sw[nm] = put(c, 'in', { name: nm }); });
  const ck = put(c, 'clock');
  const r = put(c, 'ram16');
  const y = put(c, 'out', { name: 'Q' });
  ['A0', 'A1', 'A2', 'A3', 'D', 'W'].forEach((nm, i) => join(c, sw[nm], 0, r, i));
  join(c, ck, 0, r, 6);
  join(c, r, 0, y, 0);
  const sim = simOf(c);
  sim.setInputs({ D: 1, W: 1 }); sim.settle();
  sim.clockCycle();
  eq(sim.read('Q'), 1, 'clockCycle 1回で番地 0 に書ける');
});

group('X の正直さ ― 書いたかもしれない', () => {
  /* W を「s=0 なら 1、s=1 なら X」にする: W ← NAND(s, 未接続) */
  const c = circ(), sw = {};
  PORTS.forEach(nm => { if (nm !== 'W') sw[nm] = put(c, 'in', { name: nm }); });
  const s = put(c, 'in', { name: 'S' });
  const g = put(c, 'nand');            /* 入力1は未接続 → s=0 で 1、s=1 で X */
  const r = put(c, 'ram16');
  const y = put(c, 'out', { name: 'Q' });
  PORTS.forEach((nm, i) => { if (nm !== 'W') join(c, sw[nm], 0, r, i); });
  join(c, s, 0, g, 0);
  join(c, g, 0, r, 5);
  join(c, r, 0, y, 0);
  const sim = simOf(c);

  /* s=0（W=1 確定）で番地 0 に 0 を書いておく */
  setAddr(sim, 0); sim.setInput('D', 0); sim.settle();
  pulse(sim);
  eq(readAt(sim, 0), 0, '準備: W が確定していれば普通に書ける');

  /* s=1（W=X）で D=0 の立ち上がり ― 書いたとしても同じ値なので壊れない */
  sim.setInput('S', 1); sim.settle();
  pulse(sim);
  eq(readAt(sim, 0), 0, 'W=X でも、書かれる値が今と同じなら壊れない');

  /* s=1（W=X）で D=1 の立ち上がり ― 書いたかどうか分からないので X になる */
  sim.setInput('D', 1); sim.settle();
  pulse(sim);
  eq(readAt(sim, 0), X, 'W=X で違う値が来たら、そのセルは X（嘘をつかない）');
});

group('X の正直さ ― どの番地に書いたか分からない', () => {
  /* A0 を「s=0 なら 1、s=1 なら X」にする */
  const c = circ(), sw = {};
  PORTS.forEach(nm => { if (nm !== 'A0') sw[nm] = put(c, 'in', { name: nm }); });
  const s = put(c, 'in', { name: 'S' });
  const g = put(c, 'nand');
  const r = put(c, 'ram16');
  const y = put(c, 'out', { name: 'Q' });
  PORTS.forEach((nm, i) => { if (nm !== 'A0') join(c, sw[nm], 0, r, i); });
  join(c, s, 0, g, 0);
  join(c, g, 0, r, 0);
  join(c, r, 0, y, 0);
  const sim = simOf(c);

  /* s=0 → A0=1。番地 1 に 0 を書いておく */
  sim.setInput('D', 0); sim.setInput('W', 1); sim.settle();
  pulse(sim);
  sim.setInput('W', 0); sim.settle();
  eq(sim.read('Q'), 0, '準備: 番地 1（A0=1）に 0 が入った');

  /* s=1 → A0=X。W=1・D=1 で立ち上げると、どのセルに書いたか分からない */
  sim.setInput('S', 1); sim.setInput('D', 1); sim.setInput('W', 1); sim.settle();
  pulse(sim);
  sim.setInput('W', 0); sim.setInput('S', 0); sim.settle();
  eq(sim.read('Q'), X, '番地が X の書き込みのあと、巻き添えのセルは X');
});

group('番地が X の読み出し', () => {
  /* 全セルが同じ値なら、番地が分からなくてもその値。1つでも違えば X */
  const c = circ(), sw = {};
  PORTS.forEach(nm => { if (nm !== 'A0') sw[nm] = put(c, 'in', { name: nm }); });
  const s = put(c, 'in', { name: 'S' });
  const g = put(c, 'nand');
  const r = put(c, 'ram16');
  const y = put(c, 'out', { name: 'Q' });
  PORTS.forEach((nm, i) => { if (nm !== 'A0') join(c, sw[nm], 0, r, i); });
  join(c, s, 0, g, 0);
  join(c, g, 0, r, 0);
  join(c, r, 0, y, 0);
  const sim = simOf(c);
  sim.setInput('S', 1); sim.settle();
  eq(sim.read('Q'), X, '全セル X のときは（当然）X');

  /* 全16セルに 1 を書き込む（A0 は s=0 で 1 に固定 → 奇数番地、を2周に分けられないので
   * ここでは s=0 に戻して A0=1 の8セル、それから…は書けない。
   * 代わりに「1つでも違えば X」を見る: 奇数番地だけ 1 を書いて、番地 X で読む */
  sim.setInput('S', 0); sim.setInput('D', 1); sim.setInput('W', 1); sim.settle();
  for (let a = 0; a < 8; a++) {
    sim.setInput('A1', a & 1); sim.setInput('A2', (a >> 1) & 1); sim.setInput('A3', (a >> 2) & 1);
    sim.settle();
    pulse(sim);
  }
  sim.setInput('W', 0); sim.setInput('S', 1); sim.settle();
  eq(sim.read('Q'), X, 'セルの値が揃っていなければ、番地 X の読み出しは X');
});

group('まわりの道具との折り合い', () => {
  const c = ramCircuit();

  /* 真理値表: ループは無いが、順序回路として扱われる */
  const t = T.table(c, {});
  ok(!t.error, '真理値表そのものは出せる（ただの X だらけの表になる）');
  eq(t.sequential, true, 'ループが無くても sequential 扱い（記憶を持つため）');

  /* 論理式: 断る */
  const ex = NL.expr.analyze(c, {});
  ok(ex.error && ex.error.indexOf('RAM16') >= 0, '論理式は RAM16 を理由に断る');

  /* NAND の数: ram16 は NAND として数えない */
  const gc = T.gateCount(c, {});
  eq(gc.nand, 0, 'ram16 は NAND の数に入らない（正直な数え方）');
  ok(gc.total > 0, '素子の総数には入る');

  /* 課題の採点: NOT の回路に ram16 が置いてあるだけで断られる */
  const nc = circ();
  const a = put(nc, 'in'), gg = put(nc, 'nand'), yy = put(nc, 'out');
  join(nc, a, 0, gg, 0); join(nc, a, 0, gg, 1); join(nc, gg, 0, yy, 0);
  put(nc, 'ram16');                      /* 置いただけ（未接続） */
  const r1 = NL.quest.grade(NL.quest.BY_ID.not, nc, {});
  ok(!r1.ok && r1.error.indexOf('RAM16') >= 0, '課題の採点は RAM16 を理由に断る');

  /* 「小さくする」: ram16 入りのチップは、入力が同じでもまとめる助言を出さない */
  const mc = circ();
  const md = put(mc, 'in', { name: 'D' }), mk = put(mc, 'in', { name: 'C' });
  const mr = put(mc, 'ram16');
  const my = put(mc, 'out', { name: 'Q' });
  join(mc, md, 0, mr, 4); join(mc, mk, 0, mr, 6); join(mc, mr, 0, my, 0);
  const made = L.makeChip('MEM', mc, {});
  ok(made.chip, 'ram16 入りの回路もチップにできる');
  const lib = { MEM: made.chip };
  const top = circ();
  const td = put(top, 'in', { name: 'D' }), tc = put(top, 'in', { name: 'C' });
  const u1 = put(top, 'chip', { chip: 'MEM' }), u2 = put(top, 'chip', { chip: 'MEM' });
  const o1 = put(top, 'out', { name: 'Y' }), o2 = put(top, 'out', { name: 'Z' });
  join(top, td, 0, u1, 0, lib); join(top, tc, 0, u1, 1, lib);
  join(top, td, 0, u2, 0, lib); join(top, tc, 0, u2, 1, lib);
  join(top, u1, 0, o1, 0, lib); join(top, u2, 0, o2, 0, lib);
  const hints = NL.slim.hints(top, lib);
  ok(!hints.some(h => h.kind === 'same'), '同じ入力の MEM ×2 を「まとめよ」とは言わない（中身の状態が違い得る）');
});

console.log(`\n${fail ? 'NG' : 'OK'}  合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
