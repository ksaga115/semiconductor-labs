/* 論理式の検査:  node tests/expr.js
 *
 * NAND を積んだだけの回路が、人が書くのと同じ式まで戻ることを確かめる。
 * ここが通らないと「論理式」ボタンは ¬(¬(A·B)·¬(A·B)) のような読めないものを出す。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Date, JSON, Int8Array, Int32Array, Uint8Array });
ctx.window = ctx;
ctx.globalThis = ctx;
for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'expr.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const NL = ctx.NL;
const N = NL.netlist, L = NL.lib, E = NL.expr;

let pass = 0, fail = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) pass++; else { fail++; console.log(`  NG  ${label}\n      期待 ${y}\n      実際 ${x}`); }
}
function ok(c, label) { eq(!!c, true, label); }
function group(n, fn) { console.log(`\n== ${n}`); fn(); }

/* ---- 回路を組む道具。信号は {p, k} ---- */
function circ() { return N.create(); }
function put(c, kind, opt) { return N.addPart(c, kind, 0, 0, opt); }
function join(c, a, ai, b, bi, lib) { return N.connect(c, a.id, ai, b.id, bi, lib); }

function nandCirc(build) {
  const c = circ();
  build({
    c: c,
    in: n => ({ p: put(c, 'in', { name: n }), k: 0 }),
    konst: v => ({ p: put(c, 'const', { value: v }), k: 0 }),
    out: (n, s) => { const p = put(c, 'out', { name: n }); join(c, s.p, s.k, p, 0); },
    nand: (a, b) => {
      const g = put(c, 'nand');
      join(c, a.p, a.k, g, 0); join(c, b.p, b.k, g, 1);
      return { p: g, k: 0 };
    }
  });
  return c;
}

/** 出力名 → 式 の連想配列にして比べやすくする */
function formulas(c, lib) {
  const r = E.analyze(c, lib || {});
  if (r.error) return { error: r.error };
  if (r.sequential) return { sequential: true };
  const out = {};
  r.outputs.forEach(o => { out[o.name] = o.text; });
  return out;
}

const NOT_ = '¬', AND_ = ' · ', XOR_ = ' ⊕ ';

group('NAND の山が人の書く式に戻る', () => {
  eq(formulas(nandCirc(b => { const a = b.in('A'); b.out('Y', b.nand(a, a)); })),
    { Y: NOT_ + 'A' }, 'NOT');

  eq(formulas(nandCirc(b => {
    const a = b.in('A'), c = b.in('B'), t = b.nand(a, c);
    b.out('Y', b.nand(t, t));
  })), { Y: 'A' + AND_ + 'B' }, 'AND');

  eq(formulas(nandCirc(b => {
    const a = b.in('A'), c = b.in('B');
    b.out('Y', b.nand(b.nand(a, a), b.nand(c, c)));
  })), { Y: 'A + B' }, 'OR（ド・モルガンで戻る）');

  eq(formulas(nandCirc(b => {
    const a = b.in('A'), c = b.in('B'), t = b.nand(a, c);
    b.out('Y', b.nand(b.nand(a, t), b.nand(c, t)));
  })), { Y: 'A' + XOR_ + 'B' }, 'XOR（共通因子でくくってから XOR と気づく）');

  eq(formulas(nandCirc(b => {
    const a = b.in('A'), c = b.in('B'), s = b.in('S'), ns = b.nand(s, s);
    b.out('Y', b.nand(b.nand(a, ns), b.nand(c, s)));
  })), { Y: 'A' + AND_ + NOT_ + 'S + B' + AND_ + 'S' }, '2:1 セレクタ');

  eq(formulas(nandCirc(b => {
    const a = b.in('A'), c = b.in('B'), t = b.nand(a, c);
    b.out('S', b.nand(b.nand(a, t), b.nand(c, t)));
    b.out('Y', b.nand(t, t));
  })), { S: 'A' + XOR_ + 'B', Y: 'A' + AND_ + 'B' }, '半加算器は和と桁上げに分かれる');
});

group('定数と繋ぎ忘れ', () => {
  eq(formulas(nandCirc(b => {
    const a = b.in('A');
    b.out('Y', b.nand(a, b.konst(0)));
  })), { Y: '1' }, '片方が定数 0 なら、もう片方によらず 1');

  eq(formulas(nandCirc(b => {
    const a = b.in('A'), t = b.nand(a, b.konst(1));
    b.out('Y', b.nand(t, t));
  })), { Y: 'A' }, '定数 1 との NAND は否定になり、二重否定で戻る');

  /* 繋ぎ忘れた入力は X として式に残る。0 で埋めたことにしない */
  const c = circ();
  const a = put(c, 'in'), g = put(c, 'nand'), y = put(c, 'out');
  join(c, a, 0, g, 0); join(c, g, 0, y, 0);
  eq(formulas(c), { Y: NOT_ + '(A' + AND_ + 'X)' }, '繋ぎ忘れは X のまま式に出る');
});

group('過程', () => {
  const r = E.analyze(nandCirc(b => {
    const a = b.in('A'), c = b.in('B'), t = b.nand(a, c);
    b.out('Y', b.nand(b.nand(a, t), b.nand(c, t)));
  }), {});
  eq(r.steps.map(s => s.name), ['s1', 's2', 's3', 's4'], '上流から順に名前が付く');
  eq(r.steps[0].raw, NOT_ + '(A' + AND_ + 'B)', '1行目は回路のとおり');
  eq(r.steps[3].simple, 'A' + XOR_ + 'B', '最後の行が答えになっている');
  /* 2箇所以上から使われる信号は、以降の式でその名前に置き換わって短くなる */
  eq(r.steps[1].simple, NOT_ + '(A' + AND_ + 's1)', '使い回される s1 は名前のまま出る');
  eq(r.vars, ['A', 'B'], '入力が並ぶ');
});

group('チップを展開して読む', () => {
  const notC = nandCirc(b => { const a = b.in('A'); b.out('Y', b.nand(a, a)); });
  const lib = { NOT: L.makeChip('NOT', notC, {}).chip };
  const c = circ();
  const a = put(c, 'in'), n1 = put(c, 'chip', { chip: 'NOT' }), n2 = put(c, 'chip', { chip: 'NOT' }), y = put(c, 'out');
  join(c, a, 0, n1, 0, lib); join(c, n1, 0, n2, 0, lib); join(c, n2, 0, y, 0, lib);
  eq(formulas(c, lib), { Y: 'A' }, 'チップの中まで展開して二重否定を消す');
});

group('ループがあると式にならない', () => {
  /* NAND 2個の SR ラッチ */
  const c = circ();
  const s = put(c, 'in', { name: 'S' }), r0 = put(c, 'in', { name: 'R' });
  const g1 = put(c, 'nand'), g2 = put(c, 'nand');
  const q = put(c, 'out', { name: 'Q' });
  join(c, s, 0, g1, 0); join(c, g2, 0, g1, 1);
  join(c, r0, 0, g2, 0); join(c, g1, 0, g2, 1);
  join(c, g1, 0, q, 0);

  const r = E.analyze(c, {});
  ok(r.sequential, 'SR ラッチは順序回路だと申告する');
  ok(r.loops.length >= 1, 'ループの場所を持っている');
  ok(!r.outputs, '式は出さない（出したら嘘になる）');

  const plain = nandCirc(b => { const a = b.in('A'); b.out('Y', b.nand(a, a)); });
  ok(!E.analyze(plain, {}).sequential, '組み合わせ回路は素直に式になる');
});

group('読めないときは理由を返す', () => {
  const c = circ();
  put(c, 'in');
  ok(E.analyze(c, {}).error, '出力部品が無ければ理由を返す');

  const c2 = circ();
  put(c2, 'chip', { chip: 'ないチップ' });
  put(c2, 'out');
  ok(E.analyze(c2, {}).error, '知らないチップがあれば理由を返す');
});

group('大きい回路でも式が破裂しない', () => {
  /* 全加算器を半加算器2つと OR で組む。式が長くなりすぎたら中間信号の名前で縮める */
  const r = E.analyze(nandCirc(b => {
    const a = b.in('A'), c = b.in('B'), ci = b.in('C');
    const half = (x, y) => {
      const t = b.nand(x, y);
      return { s: b.nand(b.nand(x, t), b.nand(y, t)), c: b.nand(t, t) };
    };
    const h1 = half(a, c), h2 = half(h1.s, ci);
    b.out('S', h2.s);
    b.out('Y', b.nand(b.nand(h1.c, h1.c), b.nand(h2.c, h2.c)));
  }), {});
  const byName = {};
  r.outputs.forEach(o => { byName[o.name] = o.text; });
  eq(byName.S, 'A' + XOR_ + 'B' + XOR_ + 'C', '和は3つの XOR にまとまる');
  ok(byName.Y.length < 120, '桁上げの式も読める長さに収まる（実際: ' + byName.Y + '）');
  ok(r.steps.length === 13, '過程は NAND の数だけ並ぶ（13行）');
});

console.log(`\n${fail ? 'NG' : 'OK'}  合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
