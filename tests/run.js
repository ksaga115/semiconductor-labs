/* エンジンの単体テスト:  node tests/run.js
 * ブラウザ用の classic script をそのまま vm で読み込んで検証する（ブラウザ不要）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON, Int8Array, Int32Array, Uint8Array, Array, Object, String, Number });
ctx.window = ctx;
ctx.globalThis = ctx;
for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'quest.js', 'expr.js']) {
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

/* ---- 回路をさっと組むための道具 ---- */
function circ() { return N.create(); }
function put(c, kind, opt) { return N.addPart(c, kind, 0, 0, opt); }
function join(c, a, ap, b, bp, lib) { return N.connect(c, a.id, ap, b.id, bp, lib); }

/** NAND 1個を NOT として使う回路 */
function notCircuit() {
  const c = circ();
  const a = put(c, 'in'), g = put(c, 'nand'), y = put(c, 'out');
  join(c, a, 0, g, 0); join(c, a, 0, g, 1); join(c, g, 0, y, 0);
  return c;
}

/** NAND 2個の SR ラッチ（負論理）。出力 Q と P（反転） */
function srLatch() {
  const c = circ();
  const s = put(c, 'in', { name: 'S' }), r = put(c, 'in', { name: 'R' });
  /* S・R は負論理。スイッチの初期値 0 は「両方効かせた」禁止入力なので、
   * 電源投入直後を見たいならスイッチを 1 にしておく */
  s.value = 1; r.value = 1;
  const g1 = put(c, 'nand'), g2 = put(c, 'nand');
  const q = put(c, 'out', { name: 'Q' }), p = put(c, 'out', { name: 'P' });
  join(c, s, 0, g1, 0); join(c, g2, 0, g1, 1);
  join(c, r, 0, g2, 0); join(c, g1, 0, g2, 1);
  join(c, g1, 0, q, 0); join(c, g2, 0, p, 0);
  return c;
}

group('netlist ― 部品と配線', () => {
  const c = circ();
  const a = put(c, 'in'), b = put(c, 'in'), g = put(c, 'nand');
  eq([a.name, b.name], ['A', 'B'], '入力の名前は A, B と自動で振られる');
  eq(put(c, 'out').name, 'Y', '出力の名前は Y から');

  ok(join(c, a, 0, g, 0), '出力→入力は繋がる');
  ok(!join(c, a, 0, g, 5), '存在しないポートには繋がらない');
  ok(!join(c, g, 0, g, 0), '自分の出力を自分の入力へは繋げない');
  ok(!join(c, g, 0, a, 0), '入力部品に入力ポートは無い');

  /* 入力ポートは1本だけ。2本目を繋いだら1本目が外れる */
  join(c, b, 0, g, 0);
  eq(Object.keys(c.wires).length, 1, '同じ入力ポートに繋ぎ直すと前の線は消える');
  eq(N.wireAtInput(c, g.id, 0).from.part, b.id, '後から繋いだ方が生きている');

  N.removePart(c, b.id);
  eq(Object.keys(c.wires).length, 0, '部品を消すと配線も道連れ');
});

group('netlist ― 端子の並び順', () => {
  eq(['A10', 'A2', 'A1'].sort(N.natCmp), ['A1', 'A2', 'A10'], '自然順で A10 は A2 より後ろ');
  const c = circ();
  const p2 = put(c, 'in', { name: 'A2' });
  const p10 = put(c, 'in', { name: 'A10' });
  const p1 = put(c, 'in', { name: 'A1' });
  eq(N.externalInputs(c).map(p => p.name), ['A1', 'A2', 'A10'], '外部入力は名前の自然順');
  /* 座標を動かしても順序は変わらない（これが座標順を採らなかった理由） */
  p1.x = 9999; p10.x = -9999;
  eq(N.externalInputs(c).map(p => p.name), ['A1', 'A2', 'A10'], '部品を動かしても順序は不変');
});

group('sim ― NAND の3値表', () => {
  eq([S.nand3(0, 0), S.nand3(0, 1), S.nand3(1, 0), S.nand3(1, 1)], [1, 1, 1, 0], '0/1 の普通の NAND');
  eq(S.nand3(0, X), 1, '片方が 0 なら、もう片方が未定でも 1 で確定する');
  eq(S.nand3(X, 0), 1, '順番を入れ替えても同じ');
  eq([S.nand3(1, X), S.nand3(X, 1), S.nand3(X, X)], [X, X, X], 'それ以外の未定は未定のまま');
});

group('sim ― 組み合わせ回路', () => {
  const c = notCircuit();
  const flat = L.flatten(c, {});
  eq(flat.error, null, '展開できる');
  eq(S.evaluate(flat, [0]).out, [1], 'NOT(0) = 1');
  eq(S.evaluate(flat, [1]).out, [0], 'NOT(1) = 0');

  /* 未接続の入力は X。0 で埋めたことにすると、繋ぎ忘れが動いてしまう */
  const c2 = circ();
  const a = put(c2, 'in'), g = put(c2, 'nand'), y = put(c2, 'out');
  join(c2, a, 0, g, 0); join(c2, g, 0, y, 0);
  eq(S.evaluate(L.flatten(c2, {}), [1]).out, [X], '入力を繋ぎ忘れた NAND は X を出す');
  eq(S.evaluate(L.flatten(c2, {}), [0]).out, [1], 'ただし片方が 0 なら未接続でも 1 で確定する');
});

group('sim ― 何度やっても同じ答えになる', () => {
  const c = notCircuit();
  const flat = L.flatten(c, {});
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(S.evaluate(flat, [i % 2]).out[0]);
  eq(runs, [1, 0, 1, 0, 1], '同じ入力なら同じ出力（前の回の状態を引きずらない）');
});

group('sim ― 記憶と発振', () => {
  const flat = L.flatten(srLatch(), {});
  const sim = new S.Sim(flat);
  sim.reset(); sim.settle();
  eq([sim.read('Q'), sim.read('P')], [X, X], '電源投入直後は未定。0 から始まったりしない');

  sim.setInputs({ S: 0, R: 1 }); sim.settle();
  eq([sim.read('Q'), sim.read('P')], [1, 0], 'S を効かせると Q=1');

  sim.setInputs({ S: 1, R: 1 }); sim.settle();
  eq([sim.read('Q'), sim.read('P')], [1, 0], '入力を戻しても覚えている');

  sim.setInputs({ S: 1, R: 0 }); sim.settle();
  eq([sim.read('Q'), sim.read('P')], [0, 1], 'R を効かせると Q=0');
  sim.setInputs({ S: 1, R: 1 }); sim.settle();
  eq([sim.read('Q'), sim.read('P')], [0, 1], 'やはり覚えている');

  /* 禁止入力 (S=R=0) から一斉に戻すと、行き先が決まらず発振する */
  sim.setInputs({ S: 0, R: 0 }); sim.settle();
  eq([sim.read('Q'), sim.read('P')], [1, 1], '禁止入力では両方 1 になる');
  sim.setInputs({ S: 1, R: 1 });
  const r = sim.settle();
  ok(!r.settled, '禁止入力から戻すと落ち着かない（発振）');
  ok(sim.hot.length >= 2, '暴れている素子が特定できている');
});

group('truth ― ループの検出', () => {
  ok(!T.hasFeedback(L.flatten(notCircuit(), {})), 'NOT にループは無い');
  ok(T.hasFeedback(L.flatten(srLatch(), {})), 'SR ラッチにはループがある');
  const t = T.table(srLatch(), {});
  ok(t.sequential, '真理値表も「順序回路である」と申告する');
});

group('truth ― 真理値表', () => {
  const t = T.table(notCircuit(), {});
  eq(t.inNames, ['A'], '入力名');
  eq(t.outNames, ['Y'], '出力名');
  eq(t.rows.map(r => r.in.concat(r.out)), [[0, 1], [1, 0]], 'NOT の表');
  eq(T.gateCount(notCircuit(), {}).nand, 1, 'NAND 1個');
});

/* ---- ここからチップ ---- */

/** NOT チップを作ってライブラリに入れる */
function libWithNot() {
  const lib = {};
  const r = L.makeChip('NOT', notCircuit(), lib);
  ok(!r.error, 'NOT をチップにできる (' + (r.error || '') + ')');
  lib.NOT = r.chip;
  return lib;
}

group('lib ― チップ化と展開', () => {
  const lib = libWithNot();
  eq(lib.NOT.inNames, ['A'], 'チップの入力端子名');
  eq(lib.NOT.outNames, ['Y'], 'チップの出力端子名');

  /* NOT チップを2つ直列に。二重否定なので入力がそのまま出るはず */
  const c = circ();
  const a = put(c, 'in'), n1 = put(c, 'chip', { chip: 'NOT' }), n2 = put(c, 'chip', { chip: 'NOT' }), y = put(c, 'out');
  join(c, a, 0, n1, 0, lib); join(c, n1, 0, n2, 0, lib); join(c, n2, 0, y, 0, lib);
  eq(N.portsOf(n1, lib), { in: 1, out: 1 }, 'チップの端子数はライブラリから引く');
  const flat = L.flatten(c, lib);
  eq(flat.error, null, '展開できる');
  eq(S.evaluate(flat, [0]).out, [0], '二重否定 (0)');
  eq(S.evaluate(flat, [1]).out, [1], '二重否定 (1)');
  eq(T.gateCount(c, lib).nand, 2, '展開すると NAND は2個');

  /* チップは登録した時点のコピー。あとで元の回路をいじっても定義は変わらない */
  const src = notCircuit();
  const lib2 = { NOT2: L.makeChip('NOT2', src, {}).chip };
  N.removePart(src, N.externalOutputs(src)[0].id);
  eq(lib2.NOT2.outNames, ['Y'], '元の回路を壊してもチップ定義は無事');
});

group('lib ― 階層を深くする', () => {
  const lib = libWithNot();
  /* AND = NOT(NAND(A,B)) を NOT チップを使って作る */
  const and = circ();
  {
    const a = put(and, 'in'), b = put(and, 'in'), g = put(and, 'nand');
    const n = put(and, 'chip', { chip: 'NOT' }), y = put(and, 'out');
    join(and, a, 0, g, 0); join(and, b, 0, g, 1);
    join(and, g, 0, n, 0, lib); join(and, n, 0, y, 0, lib);
  }
  lib.AND = L.makeChip('AND', and, lib).chip;

  /* AND3 = AND(AND(A,B), C) */
  const and3 = circ();
  {
    const a = put(and3, 'in'), b = put(and3, 'in'), c3 = put(and3, 'in');
    const x1 = put(and3, 'chip', { chip: 'AND' }), x2 = put(and3, 'chip', { chip: 'AND' });
    const y = put(and3, 'out');
    join(and3, a, 0, x1, 0, lib); join(and3, b, 0, x1, 1, lib);
    join(and3, x1, 0, x2, 0, lib); join(and3, c3, 0, x2, 1, lib);
    join(and3, x2, 0, y, 0, lib);
  }
  const t = T.table(and3, lib);
  eq(t.rows.map(r => r.out[0]), [0, 0, 0, 0, 0, 0, 0, 1], '3入力 AND（チップの中のチップの中の NAND まで展開されている）');
  eq(T.gateCount(and3, lib).nand, 4, 'NAND は 2個×2 で 4個');
});

group('lib ― 自分自身を含むチップは作れない', () => {
  const lib = libWithNot();
  const c = circ();
  const a = put(c, 'in'), n = put(c, 'chip', { chip: 'NOT' }), y = put(c, 'out');
  join(c, a, 0, n, 0, lib); join(c, n, 0, y, 0, lib);
  const r = L.makeChip('NOT', c, lib);
  ok(r.error, '「NOT」を含む回路を「NOT」として登録しようとすると断られる');

  /* 直接ではなく、間に1枚はさんだ循環も見つける */
  lib.WRAP = L.makeChip('WRAP', c, lib).chip;
  const c2 = circ();
  const a2 = put(c2, 'in'), w = put(c2, 'chip', { chip: 'WRAP' }), y2 = put(c2, 'out');
  join(c2, a2, 0, w, 0, lib); join(c2, w, 0, y2, 0, lib);
  ok(L.makeChip('NOT', c2, lib).error, 'WRAP 越しの循環も見つける');
});

group('lib ― 壊れたライブラリでも落ちない', () => {
  const c = circ();
  const a = put(c, 'in'), y = put(c, 'out');
  const g = N.addPart(c, 'chip', 0, 0, { chip: 'ないやつ' });
  const flat = L.flatten(c, {});
  ok(flat.error && flat.error.indexOf('ないやつ') >= 0, '知らないチップは例外ではなくエラー文言になる');
  ok(N.validate(c, {}).some(m => m.indexOf('ないやつ') >= 0), 'validate も知らせてくれる');
});

group('lib ― 画面に値を出すための索引', () => {
  const c = notCircuit();
  const flat = L.flatten(c, {});
  const sim = new S.Sim(flat);
  const g = Object.values(c.parts).find(p => p.kind === 'nand');
  const a = N.externalInputs(c)[0];
  sim.setInputs({ A: 1 }); sim.settle();
  eq(sim.portValue(a.id, 0), 1, '入力スイッチの出力が読める');
  eq(sim.portValue(g.id, 0), 0, 'NAND の出力が読める');
  eq(sim.atPath(String(g.id)), 0, '経路からも読める');
});

group('truth ― 期待表との突き合わせ', () => {
  const spec = { inputs: ['A'], outputs: ['Y'], rows: [[0, 1], [1, 0]] };
  ok(T.check(notCircuit(), {}, spec).ok, '正しい NOT は通る');

  /* わざと間違える: NOT ではなく素通し */
  const c = circ();
  const a = put(c, 'in'), y = put(c, 'out');
  join(c, a, 0, y, 0);
  const bad = T.check(c, {}, spec);
  ok(!bad.ok, '素通しは NOT として通らない');
  eq(bad.bad, { in: [0], want: [1], got: [0], settled: true }, '最初に食い違った行を教えてくれる');

  /* 端子の名前が違う */
  const c2 = notCircuit();
  N.externalOutputs(c2)[0].name = 'Z';
  ok(!T.check(c2, {}, spec).ok, '出力名が違えば通らない');
});

console.log(`\n${fail ? 'NG' : 'OK'}  合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
