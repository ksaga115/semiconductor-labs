/* 全課題のお手本解答を実際に組み立てて、採点が通ることを確かめる:  node tests/quest.js
 *
 * 課題の期待表が正しいかの検算であり、同時にチップ機構（階層・展開・境界をまたぐ
 * フィードバック）の総合試験でもある。NOT から積み上げて D ラッチまで、
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
for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'quest.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const NL = ctx.NL;
const N = NL.netlist, L = NL.lib, T = NL.truth, Q = NL.quest;

/* ---------------- 回路を組むための小さな道具 ----------------
 * 信号 = { part, port }。nand(a,b) は信号を2つ受けて信号を1つ返す。
 * こう書けると、お手本の回路が数式そのままの見た目になる。
 */
function sig(part, port) { return { part: part, port: port || 0 }; }

function Builder(lib) { this.c = N.create(); this.lib = lib || {}; this.x = 0; }
Builder.prototype.link = function (s, part, port) {
  if (!N.connect(this.c, s.part.id, s.port, part.id, port, this.lib)) {
    throw new Error('繋げなかった: ' + N.labelOf(s.part) + '[' + s.port + '] → ' + N.labelOf(part) + '[' + port + ']');
  }
};
Builder.prototype.place = function (kind, opt) {
  this.x += 60;
  return N.addPart(this.c, kind, this.x % 900, 60 + (this.x % 400), opt);
};
Builder.prototype.input = function (name) { return sig(this.place('in', { name: name }), 0); };
Builder.prototype.output = function (name, s) { var p = this.place('out', { name: name }); this.link(s, p, 0); return p; };
Builder.prototype.konst = function (v) { return sig(this.place('const', { value: v }), 0); };
/** 入力を後から繋ぎたいとき（フィードバックのループを作るときに使う） */
Builder.prototype.openNand = function () { return this.place('nand'); };
Builder.prototype.nand = function (a, b) {
  var g = this.place('nand');
  this.link(a, g, 0); this.link(b, g, 1);
  return sig(g, 0);
};
/** 端子を名前で指定してチップを置く。戻り値も出力名をキーにした連想配列。
 * チップの端子順は「名前の自然順」なので、SRLATCH の入力は S,R ではなく R,S の順になる。
 * 配列で渡すと取り違えるので、紛らわしいものはこちらを使う。 */
Builder.prototype.chipn = function (name, argsByName) {
  var def = this.lib[name];
  if (!def) throw new Error('チップが無い: ' + name);
  var args = def.inNames.map(function (nm) { return argsByName[nm]; });
  var outs = this.chip(name, args), byName = {};
  def.outNames.forEach(function (nm, i) { byName[nm] = outs[i]; });
  return byName;
};

/** チップを1つ置いて、出力の信号を並べて返す */
Builder.prototype.chip = function (name, args) {
  var def = this.lib[name];
  if (!def) throw new Error('チップが無い: ' + name);
  var p = this.place('chip', { chip: name });
  var self = this;
  args.forEach(function (s, i) { if (s) self.link(s, p, i); });
  return def.outputs.map(function (_, i) { return sig(p, i); });
};

let pass = 0, fail = 0;
const measured = {};

/** 全角を2文字分に数えて幅を揃える（等幅端末で表が崩れないように） */
function width(s) {
  let w = 0;
  for (const ch of s) w += /[　-鿿＀-｠←-⇿]/.test(ch) ? 2 : 1;
  return w;
}
function padW(s, n) { return s + ' '.repeat(Math.max(0, n - width(s))); }

/** 組んだ回路を採点にかけ、通ったらチップとして登録する */
function solve(id, chipName, build) {
  const quest = Q.BY_ID[id];
  if (!quest) { fail++; console.log(`  NG  課題 ${id} が見つからない`); return; }
  const b = new Builder(lib);
  try { build(b); } catch (e) {
    fail++; console.log(`  NG  ${quest.name}: 組み立てに失敗 ― ${e.message}`); return;
  }
  const bad = N.validate(b.c, lib);
  if (bad.length) { fail++; console.log(`  NG  ${quest.name}: ${bad[0]}`); return; }

  const r = Q.grade(quest, b.c, lib);
  if (!r.ok) {
    fail++;
    console.log(`  NG  ${quest.name}: ${r.error || ''} ${r.bad ? JSON.stringify(r.bad) : ''}`);
    return;
  }
  pass++;
  measured[id] = r.gates;
  const mark = r.gates === quest.goal ? '' : `   ← src/quest.js の goal は ${quest.goal}`;
  console.log(`  OK  ${padW(quest.name, 18)} NAND ${String(r.gates).padStart(3)}個${mark}`);

  if (chipName) {
    const made = L.makeChip(chipName, b.c, lib);
    if (made.error) { fail++; console.log(`  NG  ${chipName} をチップにできない: ${made.error}`); return; }
    lib[chipName] = made.chip;
  }
}

const lib = {};

console.log('\n== お手本を下から順に組み上げる');

solve('not', 'NOT', b => {
  const a = b.input('A');
  b.output('Y', b.nand(a, a));
});

solve('and', 'AND', b => {
  const a = b.input('A'), c = b.input('B');
  b.output('Y', b.chip('NOT', [b.nand(a, c)])[0]);
});

solve('or', 'OR', b => {
  const a = b.input('A'), c = b.input('B');
  /* ド・モルガン: A + B = NOT(NOT A ・ NOT B) = NAND(NOT A, NOT B) */
  b.output('Y', b.nand(b.chip('NOT', [a])[0], b.chip('NOT', [c])[0]));
});

solve('xor', 'XOR', b => {
  const a = b.input('A'), c = b.input('B');
  const t = b.nand(a, c);
  b.output('Y', b.nand(b.nand(a, t), b.nand(c, t)));
});

solve('mux', 'MUX', b => {
  const a = b.input('A'), c = b.input('B'), s = b.input('S');
  const ns = b.chip('NOT', [s])[0];
  b.output('Y', b.nand(b.nand(a, ns), b.nand(c, s)));
});

solve('half', 'HALF', b => {
  const a = b.input('A'), c = b.input('B');
  /* XOR の途中で作る NAND(A,B) が、そのまま桁上げの元にもなる */
  const t = b.nand(a, c);
  b.output('S', b.nand(b.nand(a, t), b.nand(c, t)));
  b.output('Y', b.nand(t, t));
});

solve('full', 'FULL', b => {
  const a = b.input('A'), c = b.input('B'), ci = b.input('C');
  const h1 = b.chip('HALF', [a, c]);          /* [S, Y] */
  const h2 = b.chip('HALF', [h1[0], ci]);
  b.output('S', h2[0]);
  b.output('Y', b.chip('OR', [h1[1], h2[1]])[0]);
});

solve('dec24', 'DEC24', b => {
  const a = b.input('A'), c = b.input('B');
  const na = b.chip('NOT', [a])[0], nc = b.chip('NOT', [c])[0];
  b.output('Y0', b.chip('AND', [na, nc])[0]);
  b.output('Y1', b.chip('AND', [na, c])[0]);
  b.output('Y2', b.chip('AND', [a, nc])[0]);
  b.output('Y3', b.chip('AND', [a, c])[0]);
});

solve('add4', 'ADD4', b => {
  const A = [0, 1, 2, 3].map(i => b.input('A' + i));
  const B = [0, 1, 2, 3].map(i => b.input('B' + i));
  let carry = b.konst(0);
  for (let i = 0; i < 4; i++) {
    const f = b.chip('FULL', [A[i], B[i], carry]);   /* [S, Y] */
    b.output('S' + i, f[0]);
    carry = f[1];
  }
  b.output('Y', carry);
});

solve('mul2', 'MUL2', b => {
  const a0 = b.input('A0'), a1 = b.input('A1'), b0 = b.input('B0'), b1 = b.input('B1');
  /* 筆算そのまま
   *        a1 a0
   *   ×    b1 b0
   *   ------------
   *     a1b0 a0b0
   *  a1b1 a0b1
   */
  const p00 = b.chip('AND', [a0, b0])[0];
  const p10 = b.chip('AND', [a1, b0])[0];
  const p01 = b.chip('AND', [a0, b1])[0];
  const p11 = b.chip('AND', [a1, b1])[0];
  const h1 = b.chip('HALF', [p10, p01]);       /* [S, Y] */
  const h2 = b.chip('HALF', [p11, h1[1]]);
  b.output('P0', p00);
  b.output('P1', h1[0]);
  b.output('P2', h2[0]);
  b.output('P3', h2[1]);
});

solve('srlatch', 'SRLATCH', b => {
  const s = b.input('S'), r = b.input('R');
  /* 互い違いに繋ぐので、先にゲートを置いてから配線する */
  const g1 = b.openNand(), g2 = b.openNand();
  b.link(s, g1, 0);
  b.link(sig(g2, 0), g1, 1);
  b.link(r, g2, 0);
  b.link(sig(g1, 0), g2, 1);
  b.output('Q', sig(g1, 0));
  b.output('P', sig(g2, 0));
});

solve('dlatch', 'DLATCH', b => {
  const d = b.input('D'), e = b.input('E');
  /* SR ラッチチップをそのまま使う。チップの境界をまたいでフィードバックが
   * 成立していることの確認にもなっている */
  const nd = b.chip('NOT', [d])[0];
  const s = b.nand(d, e);
  const r = b.nand(nd, e);
  b.output('Q', b.chipn('SRLATCH', { S: s, R: r }).Q);
});

/* ---------------- 課題の期待表そのものの検算 ---------------- */

console.log('\n== 課題の期待表が矛盾していないこと');

function check(cond, label) {
  if (cond) pass++; else { fail++; console.log(`  NG  ${label}`); }
}

Q.QUESTS.forEach(q => {
  if (q.kind !== 'comb') return;
  const width = q.inputs.length + q.outputs.length;
  check(q.rows.length === (1 << q.inputs.length), `${q.name}: 行数が 2^入力数`);
  check(q.rows.every(r => r.length === width), `${q.name}: どの行も入力＋出力の長さ`);
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

/* ---------------- 実測した NAND 数 ---------------- */

console.log('\n== お手本の NAND 数（src/quest.js の goal に写す値）');
Q.QUESTS.forEach(q => {
  if (measured[q.id] === undefined) return;
  const same = measured[q.id] === q.goal;
  console.log(`  ${q.id.padEnd(9)} 実測 ${String(measured[q.id]).padStart(3)}  /  goal ${String(q.goal).padStart(3)}  ${same ? '' : '← 要更新'}`);
});

console.log(`\n${fail ? 'NG' : 'OK'}  合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
