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
for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'quest.js', 'expr.js', 'mos.js', 'analog.js', 'slim.js']) {
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

group('NAND の中身（CMOS のトランジスタ4個）', () => {
  const M = NL.mos;
  /* いちばん大事なこと: 中身の絵と、シミュレータの NAND が食い違わないこと。
   * 食い違ったら「見せている物理」が嘘になる */
  [0, 1, X].forEach(a => [0, 1, X].forEach(b => {
    const r = M.nand(a, b);
    /* X の側はどこにも繋がない。繋いでいない入力が X になるのが本来の姿で、
     * 入力スイッチは 0 から始まるので「X を入れる」ことはできない */
    const c = circ();
    const g = put(c, 'nand');
    const y = put(c, 'out', { name: 'Y' });
    N.connect(c, g.id, 0, y.id, 0);
    if (a !== X) { const ia = put(c, 'in', { name: 'A' }); N.connect(c, ia.id, 0, g.id, 0); }
    if (b !== X) { const ib = put(c, 'in', { name: 'B' }); N.connect(c, ib.id, 0, g.id, 1); }
    const sim = new S.Sim(L.flatten(c, {}));
    sim.reset();
    if (a !== X) sim.setInput('A', a);
    if (b !== X) sim.setInput('B', b);
    sim.settle();
    eq(r.y, sim.read('Y'), '中身の出力とシミュレータが一致する (A=' + M.name(a) + ', B=' + M.name(b) + ')');
  }));

  /* 物理として辻褄が合っていること */
  [0, 1, X].forEach(a => [0, 1, X].forEach(b => {
    const r = M.nand(a, b);
    ok(!(r.up === M.ON && r.down === M.ON),
      '電源と地面が同時に繋がらない (A=' + M.name(a) + ', B=' + M.name(b) + ')');
  }));

  const both1 = M.nand(1, 1);
  eq([both1.n[0], both1.n[1]], [M.ON, M.ON], '両方 1 なら下の n は2つとも繋がる');
  eq([both1.p[0], both1.p[1]], [M.OFF, M.OFF], 'そのとき上の p は2つとも切れている');
  eq(both1.y, 0, 'Y は 0 に引き下げられる');

  const a0 = M.nand(0, 1);
  eq(a0.p[0], M.ON, 'A が 0 なら上の p（A）が繋がる');
  eq(a0.n[0], M.OFF, '同じ A で下の n は切れる（p と n は必ず逆）');
  eq(a0.y, 1, 'Y は 1 に引き上げられる');

  /* 片方が 0 なら、もう片方が未定でも出力は決まる ― 3値の要 */
  const half = M.nand(0, X);
  eq(half.up, M.ON, '片方が 0 なら、もう片方が X でも上は繋がっている');
  eq(half.y, 1, 'だから Y は 1 に決まる');
  eq(M.nand(1, X).y, X, '1 と X なら決まらない');
  ok(M.nand(1, X).story.join('').indexOf('決まらない') >= 0, '決まらない理由を言葉でも出す');
});


group('小さくする ― 減らす手がかり', () => {
  const SL = NL.slim;

  /* 同じ入力の NAND を2つ置いている */
  {
    const c = circ();
    const a = put(c, 'in', { name: 'A' }), b = put(c, 'in', { name: 'B' });
    const g1 = put(c, 'nand'), g2 = put(c, 'nand'), y = put(c, 'out', { name: 'Y' });
    N.connect(c, a.id, 0, g1.id, 0); N.connect(c, b.id, 0, g1.id, 1);
    N.connect(c, b.id, 0, g2.id, 0); N.connect(c, a.id, 0, g2.id, 1);   /* 左右を入れ替えただけ */
    N.connect(c, g1.id, 0, y.id, 0);
    const h = SL.hints(c, {});
    const same = h.filter(x => x.kind === 'same')[0];
    ok(same, '同じものを2つ作っていることに気づく');
    eq(same.save, 1, '1個減らせる');
    eq(same.parts.length, 2, '該当する2個を指せる');
    ok(same.msg.indexOf('まとめて') >= 0, 'どうすればよいかまで言う');
  }

  /* 入力の並びが違えば別物（チップは端子ごとに意味が違う） */
  {
    const c = circ();
    const a = put(c, 'in', { name: 'A' }), b = put(c, 'in', { name: 'B' });
    const g1 = put(c, 'nand'), g2 = put(c, 'nand'), y = put(c, 'out', { name: 'Y' });
    N.connect(c, a.id, 0, g1.id, 0); N.connect(c, a.id, 0, g1.id, 1);
    N.connect(c, b.id, 0, g2.id, 0); N.connect(c, b.id, 0, g2.id, 1);
    N.connect(c, g1.id, 0, y.id, 0);
    eq(SL.hints(c, {}).filter(x => x.kind === 'same').length, 0, '入力が違えばまとめない');
  }

  /* どこにも届いていない素子 */
  {
    const c = circ();
    const a = put(c, 'in', { name: 'A' }), y = put(c, 'out', { name: 'Y' });
    const g = put(c, 'nand'), lost = put(c, 'nand');
    N.connect(c, a.id, 0, g.id, 0); N.connect(c, a.id, 0, g.id, 1);
    N.connect(c, g.id, 0, y.id, 0);
    N.connect(c, a.id, 0, lost.id, 0); N.connect(c, a.id, 0, lost.id, 1);
    const h = SL.hints(c, {}).filter(x => x.kind === 'dead')[0];
    ok(h, '出力に届かない素子に気づく');
    ok(h.parts.indexOf(lost.id) >= 0, '置き忘れたほうを指している');
    ok(h.parts.indexOf(g.id) < 0, '使われている素子は巻き込まない');
  }

  /* NOT を2回かけて元に戻っている */
  {
    const c = circ();
    const a = put(c, 'in', { name: 'A' }), y = put(c, 'out', { name: 'Y' });
    const n1 = put(c, 'nand'), n2 = put(c, 'nand');
    N.connect(c, a.id, 0, n1.id, 0); N.connect(c, a.id, 0, n1.id, 1);
    N.connect(c, n1.id, 0, n2.id, 0); N.connect(c, n1.id, 0, n2.id, 1);
    N.connect(c, n2.id, 0, y.id, 0);
    const h = SL.hints(c, {}).filter(x => x.kind === 'twice')[0];
    ok(h, '打ち消し合う NOT に気づく');
    eq(h.save, 2, '2個減る');
  }

  /* 記憶を持つチップは、入力が同じでもまとめてはいけない */
  {
    const lib = {};
    const sr = circ();
    const s = put(sr, 'in', { name: 'S' }), r = put(sr, 'in', { name: 'R' });
    const g1 = put(sr, 'nand'), g2 = put(sr, 'nand');
    const q = put(sr, 'out', { name: 'Q' });
    N.connect(sr, s.id, 0, g1.id, 0); N.connect(sr, g2.id, 0, g1.id, 1);
    N.connect(sr, r.id, 0, g2.id, 0); N.connect(sr, g1.id, 0, g2.id, 1);
    N.connect(sr, g1.id, 0, q.id, 0);
    const made = L.makeChip('SR', sr, lib);
    ok(!made.error, 'SR ラッチをチップにできた');
    lib.SR = made.chip;

    const c = circ();
    const a = put(c, 'in', { name: 'A' }), b = put(c, 'in', { name: 'B' });
    const c1 = N.addPart(c, 'chip', 0, 0, { chip: 'SR' });
    const c2 = N.addPart(c, 'chip', 0, 0, { chip: 'SR' });
    const y = put(c, 'out', { name: 'Y' });
    /* 端子の並びは名前の自然順なので R, S */
    N.connect(c, a.id, 0, c1.id, 0, lib); N.connect(c, b.id, 0, c1.id, 1, lib);
    N.connect(c, a.id, 0, c2.id, 0, lib); N.connect(c, b.id, 0, c2.id, 1, lib);
    N.connect(c, c1.id, 0, y.id, 0, lib);
    eq(SL.hints(c, lib).filter(x => x.kind === 'same').length, 0,
      '記憶を持つチップは、入力が同じでもまとめない');
  }

  /* 繋がっていない素子は、比べようがないので放っておく */
  {
    const c = circ();
    const g1 = put(c, 'nand'), g2 = put(c, 'nand'), y = put(c, 'out', { name: 'Y' });
    N.connect(c, g1.id, 0, y.id, 0);
    eq(SL.hints(c, {}).filter(x => x.kind === 'same').length, 0, '入力が空の素子どうしは比べない');
  }

  ok(SL.ADVICE.length >= 3, '考え方のほうも用意してある');
});


group('0 と 1 の下にある連続量（analog.js）', () => {
  const A = NL.analog, VDD = A.VDD;
  const near = (x, y, t) => Math.abs(x - y) <= (t || 1e-6);

  /* NAND の表が、電圧でも出る */
  ok(near(A.solve(0, 0).vout, VDD), 'A も B も 0 → 出力は電源いっぱい');
  ok(near(A.solve(0, VDD).vout, VDD), 'A が 0 なら B が 1 でも 1');
  ok(near(A.solve(VDD, 0).vout, VDD), 'B が 0 なら A が 1 でも 1');
  ok(near(A.solve(VDD, VDD).vout, 0), '両方 1 → 出力は地面');

  /* 坂は一方向。上下が同時に強く通じることは無い */
  const c = A.curve(VDD, 80);
  let mono = true;
  for (let i = 1; i < c.length; i++) if (c[i].vout > c[i - 1].vout + 1e-9) mono = false;
  ok(mono, 'A を上げると出力は下がる一方（坂が戻らない）');

  /* 坂が急だから 0 と 1 で考えてよい ― 雑音余裕が電源の 1/4 以上ある */
  const m = A.margins(VDD);
  ok(m && m.vil < m.vih, '傾き −1 の点が2つ見つかる');
  ok(m.nml > VDD / 4 && m.nmh > VDD / 4, '雑音余裕が 0 側・1 側とも電源の 1/4 以上');
  let gain = 0;
  for (let i = 1; i < c.length; i++) gain = Math.min(gain, (c[i].vout - c[i - 1].vout) / (c[i].va - c[i - 1].va));
  ok(gain < -1, '坂の途中の利得が 1 を超える（汚れが押し戻される理由）');

  /* 電圧をデジタルに読む ― 坂の途中は X */
  eq(A.asDigit(0.2, m), 0, '低い電圧は 0');
  eq(A.asDigit(VDD - 0.2, m), 1, '高い電圧は 1');
  eq(A.asDigit((m.vil + m.vih) / 2, m), null, '坂の途中はどちらとも言えない（3 値の X）');

  /* 3 値の NAND（mos.js / sim.js）と、電圧で解いた答えが 0/1 の全4通りで一致する */
  for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    eq(A.asDigit(A.solve(a ? VDD : 0, b ? VDD : 0).vout, m), NL.mos.nand(a, b).y,
      `NAND(${a},${b}) が電圧でもスイッチでも同じ`);
  }

  /* B を弱くすると坂は右へ動く（下の n が直列だから） */
  const m2 = A.margins(2.0);
  ok(m2 && m2.vil > m.vil, 'B が 2.0V なら A の切り替わりは右へずれる');
});

group('analog ― SemiLab から nMOS を受け取る', () => {
  const A = NL.analog;
  const VDD = A.VDD;
  const m07 = A.margins(VDD);
  eq(A.device().vth, A.VTH, '受け取る前は既定値 0.7V');
  ok(A.setDevice({ vth: 0.5, from: 'SemiLab' }), 'Vth 0.5V は受け取れる');
  eq(A.device().vth, 0.5, 'device() が受け取った Vth を返す');
  eq(A.device().from, 'SemiLab', '出どころを覚えている');
  const m05 = A.margins(VDD);
  ok(m05 && m07 && m05.vil < m07.vil, 'Vth を下げると 0 と読める上限が左へ動く');
  ok(!A.setDevice({ vth: 5 }), '範囲外（VDD/2 超）は受け取らない');
  eq(A.device().vth, A.VTH, '受け取れなかったら既定値に戻る');
  ok(!A.setDevice(null), 'null でも既定値に戻る（読めなかったときの経路）');
});

console.log(`\n${fail ? 'NG' : 'OK'}  合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
