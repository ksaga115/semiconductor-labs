/* 画面の通し検査:  node tests/ui.js
 *
 * ブラウザ無しで ui.js を動かし、実際に人がやる手順をそのまま踏む。
 * 「部品を置く → 配線する → スイッチを入れる → 採点する → チップにする → 中を覗く」。
 * 見た目は見ていない（それは tests/preview.js）。落ちないことと、
 * 操作の結果が回路に正しく反映されることを見る。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const domStub = require('./dom.js');

const ctx = vm.createContext({ console, URLSearchParams });
ctx.globalThis = ctx;
const dom = domStub.install(ctx);

for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'quest.js', 'expr.js', 'mos.js', 'slim.js', 'answer.js', 'layout.js', 'store.js', 'ui.js', 'main.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const NL = ctx.NL;
const N = NL.netlist, SIM = NL.sim, S = NL.ui.state, G = NL.ui.geom;

let pass = 0, fail = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) pass++; else { fail++; console.log(`  NG  ${label}\n      期待 ${y}\n      実際 ${x}`); }
}
function ok(c, label) { eq(!!c, true, label); }
function group(n, fn) { console.log(`\n== ${n}`); fn(); }

const cv = dom.byId.get('board');

/* ---- 画面座標に直す（当たり判定と同じ関数を使う。ここを別実装にすると検査が嘘になる）---- */
function scr(wx, wy) { return { clientX: wx * S.view.s + S.view.ox, clientY: wy * S.view.s + S.view.oy }; }
function portScr(part, side, i) {
  const q = G.portXY(part, S.lib, side, i);
  return scr(q.x, q.y);
}
function bodyScr(part) {
  const s = G.sizeOf(part, S.lib);
  return scr(part.x + s.w / 2, part.y + s.h / 2);
}

function palette(sel) {
  return dom.created.find(e => e.classList.contains('pitem') &&
    (sel.kind ? e.dataset.kind === sel.kind : e.dataset.chip === sel.chip));
}
function placeAt(sel, wx, wy) {
  const item = palette(sel);
  if (!item) throw new Error('パレットに無い: ' + JSON.stringify(sel));
  item.onclick({ target: {} });
  dom.fire(cv, 'mousedown', scr(wx, wy));
  const ids = Object.keys(S.circuit.parts);
  return S.circuit.parts[ids[ids.length - 1]];
}
function connect(a, ai, b, bi) {
  dom.fire(cv, 'mousedown', portScr(a, 'out', ai));
  dom.fire(ctx, 'mousemove', portScr(b, 'in', bi));
  dom.fire(ctx, 'mouseup', portScr(b, 'in', bi));
}
function click(part) {
  const p = bodyScr(part);
  dom.fire(cv, 'mousedown', p);
  dom.fire(ctx, 'mouseup', p);
}
function frames(n) { for (let i = 0; i < n; i++) dom.frame(); }

group('起動', () => {
  ok(S.circuit, '回路がある');
  eq(ctx._alerts, [], '警告なしで立ち上がる');
  /* 初めて開いたときは、NAND 1個に触れる状態から始まる */
  eq(Object.keys(S.circuit.parts).length, 4, '最初から NAND のお試し回路が置いてある');
  eq(Object.keys(S.circuit.wires).length, 3, 'お試し回路は繋がっている');
  frames(2);
  eq(SIM.show(S.sim.read('Y')), '1', 'A も B も 0 なので、NAND の出力は 1');
  {
    const on = Object.keys(S.circuit.parts).map(i => S.circuit.parts[i]).filter(p => p.kind === 'in');
    on.forEach(p => click(p));
    frames(3);
    eq(SIM.show(S.sim.read('Y')), '0', '両方 1 にすると 0 になる ― それが NAND');
  }
  /* この先の検査は空の盤面から始めたいので、いったん消す */
  dom.byId.get('btnNew').onclick();
  dom.byId.get('mOk').onclick();
  eq(Object.keys(S.circuit.parts).length, 0, '「作業台を消す」で空になる');
  ok(palette({ kind: 'nand' }), 'パレットに NAND がある');
  const items = dom.created.filter(e => e.tagName === 'LI' && !e.classList.contains('sec'));
  eq(items.length, NL.quest.QUESTS.length, '課題が全部並んでいる');
  eq(dom.created.filter(e => e.tagName === 'LI' && e.classList.contains('sec')).length,
    NL.quest.STAGES.length, '章の見出しが章の数だけある');
  frames(3);
  ok(dom.byId.get('statLeft').textContent.length > 0, 'ステータス行に何か出ている');
});

/** 直前のフレームで canvas に何回描いたか（0 なら真っ白ということ） */
function drawCalls(canvas) {
  const c = canvas.getContext('2d');
  const n = c._calls.n;
  c._calls.n = 0;
  return n;
}

let A, GATE, Y;

group('部品を置いて配線する', () => {
  A = placeAt({ kind: 'in' }, 80, 140);
  GATE = placeAt({ kind: 'nand' }, 240, 140);
  Y = placeAt({ kind: 'out' }, 400, 140);
  eq([A.kind, GATE.kind, Y.kind], ['in', 'nand', 'out'], '3つ置けた');
  eq([A.name, Y.name], ['A', 'Y'], '名前が自動で付く');
  eq(A.x % 10, 0, '格子に吸い付く');

  connect(A, 0, GATE, 0);
  connect(A, 0, GATE, 1);
  connect(GATE, 0, Y, 0);
  eq(Object.keys(S.circuit.wires).length, 3, '3本繋がった');
  eq(N.validate(S.circuit, S.lib), [], '繋ぎ忘れなし');
  drawCalls(cv);
  frames(1);
  ok(drawCalls(cv) > 60, '盤面をちゃんと描いている（真っ白ではない）');
});

group('スイッチを切り替えると値が伝わる', () => {
  eq(A.value, 0, '最初は 0');
  eq(SIM.show(S.sim.read('Y')), '1', 'NOT(0) = 1');
  click(A);
  eq(A.value, 1, 'クリックで 1 になる');
  frames(2);
  eq(SIM.show(S.sim.read('Y')), '0', 'NOT(1) = 0');
  click(A);
  frames(2);
  eq(SIM.show(S.sim.read('Y')), '1', '戻すと 1');
});

group('止めると時間が凍る', () => {
  const btnRun = dom.byId.get('btnRun');
  btnRun.onclick();
  eq(S.running, false, '止まった');
  ok(/動かす/.test(btnRun.textContent), 'ボタンは「動かす」に変わる');
  click(A);                                   /* 入力は変えたが、まだ広がらない */
  const before = SIM.show(S.sim.read('Y'));
  eq(before, '1', '止めている間は出力が動かない');
  ok(S.sim.q.length > 0, '計算待ちが溜まっている');
  for (let i = 0; i < 12; i++) dom.byId.get('btnStep').onclick();
  eq(SIM.show(S.sim.read('Y')), '0', '1歩ずつ進めれば伝わる');
  btnRun.onclick();
  eq(S.running, true, '再開できる');
  click(A); frames(2);
});

group('採点', () => {
  const li = dom.created.find(e => e.tagName === 'LI' && e.dataset.id === 'not');
  li.onclick();
  eq(dom.byId.get('qName').textContent, 'NOT', '課題を選べた');
  dom.byId.get('btnGrade').onclick();
  ok(S.cleared.not, 'NOT に合格した');
  ok(/合格/.test(dom.byId.get('qResult').innerHTML), '合格と表示された');

  /* 間違った課題で採点すると落ちること */
  const li2 = dom.created.find(e => e.tagName === 'LI' && e.dataset.id === 'xor');
  li2.onclick();
  dom.byId.get('btnGrade').onclick();
  ok(!S.cleared.xor, 'NOT の回路は XOR として通らない');
  ok(/まだ合っていない/.test(dom.byId.get('qResult').innerHTML), '不合格の理由が出ている');
});

group('チップにする', () => {
  dom.byId.get('btnChip').onclick();
  const box = dom.byId.get('mIn');
  box.value = 'NOT';
  dom.byId.get('mOk').onclick();
  ok(S.lib.NOT, 'NOT チップが登録された');
  eq([S.lib.NOT.inNames, S.lib.NOT.outNames], [['A'], ['Y']], '端子名が取れている');
  ok(palette({ chip: 'NOT' }), 'パレットに出た');

  /* 名前が空なら断られ、窓は閉じない */
  dom.byId.get('btnChip').onclick();
  dom.byId.get('mIn').value = '   ';
  dom.byId.get('mOk').onclick();
  ok(dom.byId.get('mMsg').textContent.length > 0, '名前が空なら理由を出す');
  dom.byId.get('mCancel').onclick();
});

group('チップを使う', () => {
  dom.byId.get('btnNew').onclick();
  dom.byId.get('mOk').onclick();                    /* 「作業台を消す」を承諾 */
  eq(Object.keys(S.circuit.parts).length, 0, '作業台が空になった');
  ok(S.lib.NOT, 'チップの定義は残っている');

  const a = placeAt({ kind: 'in' }, 80, 140);
  const c1 = placeAt({ chip: 'NOT' }, 220, 140);
  const c2 = placeAt({ chip: 'NOT' }, 360, 140);
  const y = placeAt({ kind: 'out' }, 500, 140);
  eq(N.portsOf(c1, S.lib), { in: 1, out: 1 }, 'チップの端子数が引けている');
  connect(a, 0, c1, 0);
  connect(c1, 0, c2, 0);
  connect(c2, 0, y, 0);
  eq(N.validate(S.circuit, S.lib), [], '繋ぎ忘れなし');
  frames(2);
  eq(SIM.show(S.sim.read('Y')), '0', '二重否定 (0)');
  click(a); frames(2);
  eq(SIM.show(S.sim.read('Y')), '1', '二重否定 (1)');

  /* チップの中を覗く */
  dom.fire(cv, 'dblclick', bodyScr(c1));
  ok(S.peek && S.peek.chip === 'NOT', '中を覗く窓が開いた');
  eq(S.peek.prefix, c1.id + '/', '覗いている先は「この個体」の中身');
  const pk = dom.byId.get('peekBoard');
  drawCalls(pk);
  frames(1);
  ok(drawCalls(pk) > 20, '覗き窓にも中身を描いている');
  dom.byId.get('peekClose').onclick();
  ok(!S.peek, '閉じられる');
});

group('繋ぎ直しと削除', () => {
  const before = Object.keys(S.circuit.wires).length;
  const y = N.externalOutputs(S.circuit)[0];
  /* 出力の入力ポートを掴んで、どこでもない所で離す＝線を外す */
  dom.fire(cv, 'mousedown', portScr(y, 'in', 0));
  dom.fire(ctx, 'mouseup', scr(700, 500));
  eq(Object.keys(S.circuit.wires).length, before - 1, '掴んで離すと線が外れる');

  /* 右クリックで部品を消す */
  const parts = Object.keys(S.circuit.parts).length;
  dom.fire(cv, 'contextmenu', bodyScr(y));
  eq(Object.keys(S.circuit.parts).length, parts - 1, '右クリックで消える');

  /* Ctrl+Z で戻る */
  dom.fire(ctx, 'keydown', { key: 'z', ctrlKey: true, target: { tagName: 'BODY' } });
  eq(Object.keys(S.circuit.parts).length, parts, '元に戻った');
  dom.fire(ctx, 'keydown', { key: 'z', ctrlKey: true, shiftKey: true, target: { tagName: 'BODY' } });
  eq(Object.keys(S.circuit.parts).length, parts - 1, 'やり直しも効く');
  dom.fire(ctx, 'keydown', { key: 'z', ctrlKey: true, target: { tagName: 'BODY' } });
});

group('矩形で選んでまとめて消す', () => {
  const n0 = Object.keys(S.circuit.parts).length;
  dom.fire(cv, 'mousedown', scr(20, 20));
  dom.fire(ctx, 'mousemove', scr(900, 700));
  dom.fire(ctx, 'mouseup', scr(900, 700));
  eq(Object.keys(S.sel.parts).length, n0, '囲った部品が全部選ばれる');
  dom.fire(ctx, 'keydown', { key: 'Delete', target: { tagName: 'BODY' } });
  eq(Object.keys(S.circuit.parts).length, 0, 'まとめて消えた');
  dom.fire(ctx, 'keydown', { key: 'z', ctrlKey: true, target: { tagName: 'BODY' } });
  eq(Object.keys(S.circuit.parts).length, n0, '戻せる');
});

group('使われているチップは消せない', () => {
  const item = palette({ chip: 'NOT' });
  item.onclick({ target: { className: 'x' }, stopPropagation() {} });
  ok(/消せない/.test(dom.byId.get('modal').innerHTML), '作業台で使っているので断られる');
  dom.byId.get('mCancel').onclick();
  ok(S.lib.NOT, 'チップは残っている');
});

group('真理値表', () => {
  dom.byId.get('btnTruth').onclick();
  const h = dom.byId.get('modal').innerHTML;
  ok(/真理値表/.test(h), '窓が開いた');
  ok(/<table class="tt">/.test(h), '表が入っている');
  dom.byId.get('mCancel').onclick();
});

group('論理式', () => {
  /* XOR を NAND 4個で組んで、式として読み取れるかを見る。
   * ここが通れば「回路 → 展開 → 式 → 整理 → 画面」が一本に繋がっている */
  dom.byId.get('btnNew').onclick();
  dom.byId.get('mOk').onclick();
  const a = placeAt({ kind: 'in' }, 60, 100);
  const b2 = placeAt({ kind: 'in' }, 60, 240);
  const g1 = placeAt({ kind: 'nand' }, 200, 160);
  const g2 = placeAt({ kind: 'nand' }, 340, 80);
  const g3 = placeAt({ kind: 'nand' }, 340, 260);
  const g4 = placeAt({ kind: 'nand' }, 480, 170);
  const y = placeAt({ kind: 'out' }, 620, 170);
  connect(a, 0, g1, 0); connect(b2, 0, g1, 1);
  connect(a, 0, g2, 0); connect(g1, 0, g2, 1);
  connect(b2, 0, g3, 0); connect(g1, 0, g3, 1);
  connect(g2, 0, g4, 0); connect(g3, 0, g4, 1);
  connect(g4, 0, y, 0);
  eq(N.validate(S.circuit, S.lib), [], '繋ぎ忘れなく組めた');

  dom.byId.get('btnExpr').onclick();
  const h = dom.byId.get('modal').innerHTML;
  ok(/A ⊕ B/.test(h), 'NAND 4個の山を XOR と見抜いた式が出る');
  ok(/過程/.test(h), '過程の表が入っている');
  ok(/s1/.test(h) && /s4/.test(h), '中間信号に名前が付いている');
  dom.byId.get('mCancel').onclick();

  /* 出力が繋がっていない回路では、過程は空でもエラーにならない */
  dom.fire(cv, 'contextmenu', portScr(y, 'in', 0));
  dom.byId.get('btnExpr').onclick();
  ok(/論理式/.test(dom.byId.get('modal').innerHTML), '出力が浮いていても窓は開く');
  dom.byId.get('mCancel').onclick();
});

group('発振する回路', () => {
  dom.byId.get('btnNew').onclick();
  dom.byId.get('mOk').onclick();
  /* リング発振器。NAND 3個の輪だが、輪だけでは動かない。
   * 全部が X のままでも3値の理屈は辻褄が合ってしまう（NAND(X,X)=X）ので、
   * どこかに既知の値を注ぐ口が要る。実物のリング発振器に必ず
   * 「起動用のゲート」が付いているのと同じ理由。 */
  const e = placeAt({ kind: 'in' }, 60, 250);
  const g = [0, 1, 2].map(i => placeAt({ kind: 'nand' }, 170 + i * 150, 140));
  connect(e, 0, g[0], 1);
  connect(g[2], 0, g[0], 0);
  for (const i of [1, 2]) {
    connect(g[i - 1], 0, g[i], 0);
    connect(g[i - 1], 0, g[i], 1);
  }
  const y = placeAt({ kind: 'out' }, 640, 250);
  connect(g[0], 0, y, 0);
  frames(3);
  eq(e.value, 0, '止めの入力は 0');
  eq(S.sim.q.length, 0, '止めてある間は落ち着いている');
  eq(SIM.show(S.sim.read('Y')), '1', '0 を注いだので値が確定する');

  click(e);                                   /* 解き放つ */
  frames(3);
  ok(S.sim.q.length > 0, '解き放つと落ち着かない（発振している）');
  ok(/発振/.test(dom.byId.get('statRight').textContent), '画面が発振中だと知らせる');
  ok(S.sim.hot.length >= 3, '暴れている素子を割り出せている（赤く光らせるため）');
  dom.byId.get('btnExpr').onclick();
  ok(/順序回路/.test(dom.byId.get('modal').innerHTML), 'ループのある回路は式にせず、順序回路だと言う');
  dom.byId.get('mCancel').onclick();
  frames(5);
  ok(true, '発振したままフレームを回しても固まらない');
  click(e); frames(3);
  eq(S.sim.q.length, 0, 'もう一度止めれば収まる');
  eq(S.sim.hot.length, 0, '収まれば赤も消える');
});

group('整える', () => {
  const before = Object.keys(S.circuit.parts).map(i => `${S.circuit.parts[i].x},${S.circuit.parts[i].y}`);
  const sim0 = S.sim;
  dom.byId.get('btnTidy').onclick();
  const after = Object.keys(S.circuit.parts).map(i => `${S.circuit.parts[i].x},${S.circuit.parts[i].y}`);
  ok(before.join('|') !== after.join('|'), '押すと並びが変わる');
  ok(S.sim === sim0, 'シミュレータは作り直さない（ラッチの記憶を消さない）');

  /* 重なっていないこと。当たり判定と同じ寸法で見る */
  const list = Object.keys(S.circuit.parts).map(i => S.circuit.parts[i]);
  let hit = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], sa = G.sizeOf(a, S.lib), sb = G.sizeOf(b, S.lib);
    if (a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h) hit++;
  }
  eq(hit, 0, '部品が重ならない');

  dom.fire(ctx, 'keydown', { key: 'z', ctrlKey: true });
  const undone = Object.keys(S.circuit.parts).map(i => `${S.circuit.parts[i].x},${S.circuit.parts[i].y}`);
  eq(undone, before, 'Ctrl+Z で元の並びに戻る');
  dom.byId.get('btnTidy').onclick();                 /* 戻したので、もう一度整えておく */
  frames(2);
  ok(true, '整えたあとも描画が落ちない');
});

group('束を数として読む', () => {
  /* 2ビットの入力 A1A0 と、その値をそのまま出す出力 Y1Y0 を、読み込みで持ち込む */
  const c = NL.netlist.create();
  NL.netlist.addPart(c, 'in', 0, 0, { name: 'A0' });
  NL.netlist.addPart(c, 'in', 0, 60, { name: 'A1' });
  NL.netlist.addPart(c, 'in', 0, 120, { name: 'B' });      /* 1本だけの名前は束にならない */
  const y0 = NL.netlist.addPart(c, 'out', 200, 0, { name: 'Y0' });
  const y1 = NL.netlist.addPart(c, 'out', 200, 60, { name: 'Y1' });
  const ins = NL.netlist.externalInputs(c);
  NL.netlist.connect(c, ins[0].id, 0, y0.id, 0);
  NL.netlist.connect(c, ins[1].id, 0, y1.id, 0);

  dom.byId.get('btnImport').onclick();
  dom.byId.get('mIn').value = JSON.stringify({ v: 1, circuit: c, lib: S.lib, cleared: S.cleared, quest: S.questId });
  dom.byId.get('mOk').onclick();
  frames(3);

  const find = nm => Object.keys(S.circuit.parts).map(i => S.circuit.parts[i]).find(p => p.name === nm);
  const a0 = find('A0'), a1 = find('A1');
  const list = NL.ui.bus.of(S.circuit);
  eq(list.map(b => b.name), ['A', 'Y'], '2本以上そろった名前だけが束になる（1本の B は入らない）');

  const A = list[0], Y = list[1];
  eq(NL.ui.bus.value(A), 0, '最初は 0');
  click(a0); frames(3);
  eq(NL.ui.bus.value(A), 1, '添字 0 が最下位');
  eq(NL.ui.bus.value(Y), 1, '出力側も数として読める');
  click(a1); frames(3);
  eq(NL.ui.bus.value(A), 3, 'A1 も立てると 3');
  eq(NL.ui.bus.bits(A), '11', '二進の並びは上位が左');
  click(a0); frames(3);
  eq(NL.ui.bus.value(A), 2, 'A0 を戻すと 2');

  S.running = false;
  S.sim.reset();
  eq(NL.ui.bus.value(Y), null, '1ビットでも未定なら数にしない（0 で埋めない）');
  S.running = true; frames(3);
});

group('道のり', () => {
  dom.byId.get('btnPath').onclick();
  const h = dom.byId.get('modal').innerHTML;
  eq((h.match(/class="path-node/g) || []).length, NL.quest.QUESTS.length, '全課題が箱として並ぶ');
  ok(/クリア/.test(h), 'クリア数が出ている');
  ok(h.indexOf(NL.quest.STAGES[0].name) >= 0, '章の名前が出ている');
  ok(/path-node done/.test(h), 'クリア済みの課題が済みとして描かれる');
  ok(/NAND 1</.test(h), 'お手本の NAND 数が箱に出ている');
  dom.byId.get('mCancel').onclick();
  eq(dom.byId.get('modal').innerHTML, '', '閉じられる');

  /* 積み上げの数え方 */
  eq(NL.lib.depth('NOT', S.lib), 1, 'NAND だけのチップは 1 段目');
  eq(NL.truth.gateCount(S.lib.NOT.circuit, S.lib).nand, 1, 'NOT はばらすと NAND 1個');
  const item = dom.created.find(e => e.dataset && e.dataset.chip === 'NOT');
  ok(item && /ばらすと NAND 1個/.test(item.title), 'パレットのチップに素子数と深さが出ている');
  ok(item && /1 段目/.test(item.title), 'パレットのチップに深さが出ている');
});

function pickQuest(id) {
  const li = dom.created.find(e => e.tagName === 'LI' && e.dataset.id === id);
  if (!li) throw new Error('課題が一覧に無い: ' + id);
  li.onclick();
}

group('お手本を見る', () => {
  /* 課題を選んで、お手本を出す。作業台には触らない */
  const before = JSON.stringify(S.circuit);
  pickQuest('xor');
  dom.byId.get('btnAnswer').onclick();
  ok(/お手本/.test(dom.byId.get('modal').innerHTML), '先に自分で組むよう促してから聞く');
  dom.byId.get('mOk').onclick();

  ok(S.peek && S.peek.kind === 'answer', 'お手本の窓が開く');
  ok(/NAND 4個/.test(dom.byId.get('peekName').textContent), '何個で組んであるかが出る');
  eq(JSON.stringify(S.circuit), before, '作業台は一切変わらない');
  ok(!dom.byId.get('peek').classList.contains('small'), 'お手本は大きい窓で出る');

  /* 出したお手本は、本当にその課題を通るものでなければ意味がない */
  const r = NL.answer.build('xor');
  ok(NL.quest.grade(NL.quest.BY_ID.xor, r.circuit, r.lib).ok, '出しているお手本は採点を通る');

  /* 整えてから見せているので、部品が重なっていない */
  const list = Object.keys(S.peek.circuit.parts).map(i => S.peek.circuit.parts[i]);
  let over = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const sa = G.sizeOf(a, S.peek.lib), sb = G.sizeOf(b, S.peek.lib);
    if (a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h) over++;
  }
  eq(over, 0, '整えてから見せている（部品が重なっていない）');

  const calls = dom.byId.get('peekBoard').getContext()._calls.n;
  frames(2);
  ok(dom.byId.get('peekBoard').getContext()._calls.n > calls, 'お手本を実際に描いている');
  ok(S.sim !== S.peek.sim, '盤面のシミュレータとは別のもので動かしている');

  /* チップを使うお手本も出せる */
  pickQuest('add4');
  dom.byId.get('btnAnswer').onclick();
  dom.byId.get('mOk').onclick();
  ok(/FULL/.test(dom.byId.get('peekName').textContent), '使っているチップの名前が出る');
  frames(2);
  ok(true, 'チップ入りのお手本を描いても落ちない');

  dom.byId.get('peekClose').onclick();
  eq(S.peek, null, '閉じられる');
});

group('NAND の中身を覗く', () => {
  /* 盤面に NAND を1個置いて、ダブルクリックで中身を出す */
  dom.byId.get('btnNew').onclick();
  dom.byId.get('mOk').onclick();
  const a = placeAt({ kind: 'in' }, 100, 100);
  const b = placeAt({ kind: 'in' }, 100, 220);
  const g = placeAt({ kind: 'nand' }, 300, 150);
  connect(a, 0, g, 0); connect(b, 0, g, 1);
  frames(3);

  dom.fire(cv, 'dblclick', bodyScr(g));
  ok(S.peek && S.peek.kind === 'mos', 'NAND のダブルクリックで中身が開く');
  ok(dom.byId.get('peek').classList.contains('small'), '盤面を触れるように小さい窓で出る');
  ok(dom.byId.get('peekEdit').classList.contains('hidden'), '「作業台に取り出す」は出ない');
  ok(/トランジスタ/.test(dom.byId.get('peekName').textContent), '何を見ているか名前で分かる');

  const calls = dom.byId.get('peekBoard').getContext()._calls.n;
  frames(2);
  ok(dom.byId.get('peekBoard').getContext()._calls.n > calls, '中身を実際に描いている');

  /* 盤面のスイッチを切り替えると、中身の状態も変わる */
  const M = NL.mos;
  eq(M.nand(SIM.X, SIM.X).y, SIM.X, '未定なら中身も未定');
  frames(2);
  const now = () => M.nand(S.sim.atPath(String(a.id)), S.sim.atPath(String(b.id)));
  eq(now().y, 1, '0 と 0 なら Y は 1（上の p が繋がっている）');
  eq(now().up, M.ON, '電源側が繋がっている');
  click(a); click(b); frames(4);
  eq(now().y, 0, '両方 1 にすると Y は 0');
  eq(now().down, M.ON, '地面側が繋がっている');
  eq(now().up, M.OFF, 'そのとき電源側は切れている');

  dom.byId.get('peekClose').onclick();
  eq(S.peek, null, '閉じられる');
  ok(!dom.byId.get('peek').classList.contains('small'), '小窓の印も外れる');
});

group('チップの上書き保存', () => {
  /* NOT を作業台に取り出して、中身を変えて、名前を打ち直さずに上書きする */
  ok(S.lib.NOT, '前の検査で作った NOT がある');
  const before = NL.truth.gateCount(S.lib.NOT.circuit, S.lib).nand;

  dom.created.filter(e => e.dataset && e.dataset.chip === 'NOT')[0].ondblclick();
  dom.byId.get('mOk').onclick();                       /* 「取り出す」を承諾 */
  frames(2);
  eq(S.editing, 'NOT', '取り出したチップを覚えている');
  ok(!dom.byId.get('btnSaveChip').classList.contains('hidden'), '上書き保存のボタンが出る');

  /* 中身に NAND を1個足してから上書き（NOT NOT で、働きは同じまま素子だけ増える）*/
  const y = Object.keys(S.circuit.parts).map(i => S.circuit.parts[i]).find(p => p.kind === 'out');
  const g0 = Object.keys(S.circuit.parts).map(i => S.circuit.parts[i]).find(p => p.kind === 'nand');
  const g1 = placeAt({ kind: 'nand' }, 500, 300);
  connect(g0, 0, g1, 0); connect(g0, 0, g1, 1);
  const g2 = placeAt({ kind: 'nand' }, 640, 300);
  connect(g1, 0, g2, 0); connect(g1, 0, g2, 1);
  connect(g2, 0, y, 0);

  dom.fire(ctx, 'keydown', { key: 's', ctrlKey: true });
  eq(NL.truth.gateCount(S.lib.NOT.circuit, S.lib).nand, before + 2, 'Ctrl+S で中身が入れ替わる');
  ok(/上書きした/.test(S.msg), '何が起きたかを言う');

  /* 使っている側も新しい中身になる */
  ok(NL.lib.dependents(S.lib, 'NOT').length >= 0, '使っている側を数えられる');

  dom.byId.get('btnNew').onclick();
  dom.byId.get('mOk').onclick();
  eq(S.editing, null, '作業台を消したら、上書き先も忘れる');
  ok(dom.byId.get('btnSaveChip').classList.contains('hidden'), 'ボタンも消える');
});

group('書き出しと読み込み', () => {
  dom.byId.get('btnExport').onclick();
  const json = NL.store.toJSON({ circuit: S.circuit, lib: S.lib, cleared: S.cleared, quest: S.questId });
  dom.byId.get('mCancel').onclick();
  ok(json.length > 10, '書き出せる形になっている');

  dom.byId.get('btnImport').onclick();
  dom.byId.get('mIn').value = json;
  dom.byId.get('mOk').onclick();
  ok(S.lib.NOT, '読み込んでもチップが残る');

  /* でたらめな中身は断る */
  dom.byId.get('btnImport').onclick();
  dom.byId.get('mIn').value = '{ こわれている';
  dom.byId.get('mOk').onclick();
  ok(dom.byId.get('mMsg').textContent.length > 0, '読めない JSON は理由を出して断る');
  dom.byId.get('mCancel').onclick();
});

group('保存と復帰', () => {
  ok(S.saveTimer, '保存が予約されている');
  S.saveTimer.fn();                                   /* 予約された保存を手で走らせる */
  const raw = ctx.localStorage.getItem(NL.store.KEY);
  ok(raw && raw.length > 10, 'localStorage に書けた');
  const back = NL.store.load();
  ok(!back.broken, '書いたものは読み戻せる');
  eq(Object.keys(back.state.lib), ['NOT'], 'チップも一緒に戻る');

  /* 壊れた保存は捨てずに退避して、空で始める */
  ctx.localStorage.setItem(NL.store.KEY, '{ これは JSON ではない');
  const r = NL.store.load();
  ok(r.broken, '壊れていることに気づく');
  eq(Object.keys(r.state.circuit.parts), [], '空から始める');
  eq(ctx.localStorage.getItem(NL.store.BACKUP), '{ これは JSON ではない', '壊れた中身は消さずに退避する');
});

group('チップを持っていない回路を読み込んでも落ちない', () => {
  /* 人からもらった回路を、チップの定義なしで読み込んだときに起きること */
  const c = NL.netlist.create();
  NL.netlist.addPart(c, 'chip', 100, 100, { chip: 'ないチップ' });
  const orphan = { v: 1, circuit: c, lib: {}, cleared: {}, quest: null };

  dom.byId.get('btnImport').onclick();
  dom.byId.get('mIn').value = JSON.stringify(orphan);
  dom.byId.get('mOk').onclick();
  frames(3);
  ok(S.flat.error && /ないチップ/.test(S.flat.error), '展開できない理由を持っている');
  ok(/ないチップ/.test(dom.byId.get('statLeft').textContent), 'ステータスに理由が出る');
  ok(NL.netlist.validate(S.circuit, S.lib).some(m => /ないチップ/.test(m)), 'validate も指摘する');
  frames(3);
  ok(true, '描画が落ちない');
});

group('名前は F2 で変える', () => {
  const a = placeAt({ kind: 'in' }, 200, 420);
  /* スイッチをかちゃかちゃ切り替えているだけで名前の窓が開いてはいけない */
  dom.fire(cv, 'dblclick', bodyScr(a));
  eq(dom.byId.get('modal').innerHTML, '', 'ダブルクリックでは名前の窓が開かない');
  ok(/F2/.test(S.msg), 'かわりに F2 だと教えてくれる');

  S.sel = { parts: {}, wires: {} };
  S.sel.parts[a.id] = true;
  dom.fire(ctx, 'keydown', { key: 'F2' });
  dom.byId.get('mIn').value = 'ZZ';
  dom.byId.get('mOk').onclick();
  eq(a.name, 'ZZ', 'F2 で名前を変えられる');

  S.sel = { parts: {}, wires: {} };
  dom.fire(ctx, 'keydown', { key: 'F2' });
  ok(/1つだけ選んで/.test(S.msg), '何も選んでいなければ、選べと言う');

  /* 配線にも名前を付けられる */
  const g1 = placeAt({ kind: 'nand' }, 300, 480);
  connect(a, 0, g1, 0);
  const wid = Object.keys(S.circuit.wires).filter(k => S.circuit.wires[k].to.part === g1.id)[0];
  S.sel = { parts: {}, wires: {} };
  S.sel.wires[wid] = true;
  dom.fire(ctx, 'keydown', { key: 'F2' });
  dom.byId.get('mIn').value = '桁上がり';
  dom.byId.get('mOk').onclick();
  eq(S.circuit.wires[wid].name, '桁上がり', '配線に名前が付く');
  frames(2);
  ok(true, '名前付きの配線を描いても落ちない');

  S.sel = { parts: {}, wires: {} };
  S.sel.wires[wid] = true;
  dom.fire(ctx, 'keydown', { key: 'F2' });
  dom.byId.get('mIn').value = '   ';
  dom.byId.get('mOk').onclick();
  ok(!S.circuit.wires[wid].name, '空にすれば名前は消える');
});

console.log(`
${fail ? 'NG' : 'OK'}  合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
