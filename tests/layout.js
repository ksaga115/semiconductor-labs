/* 自動整列の検査:  node tests/layout.js
 *
 * 「整えた」と言えるための条件を並べる。見た目は見られないので、
 * 見た目の代わりに次を測る:
 *   信号の向きに並んでいるか / 重なっていないか / 交差が減ったか /
 *   真横に引けるはずの線が真横になっているか / 格子に載っているか。
 *
 * 座標は ui.js の geom（＝画面の当たり判定と同じ関数）で測る。
 * ここで寸法を別に書くと、検査は通るのに画面ではずれる、が起きる。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const domStub = require('./dom.js');

const ctx = vm.createContext({ console, URLSearchParams });
ctx.globalThis = ctx;
domStub.install(ctx);
for (const f of ['netlist.js', 'lib.js', 'sim.js', 'truth.js', 'quest.js', 'expr.js', 'mos.js', 'slim.js', 'answer.js',
                 'layout.js', 'store.js', 'ui.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
}
const NL = ctx.NL;
const N = NL.netlist, LAY = NL.layout, G = NL.ui.geom;

let pass = 0, fail = 0;
function eq(a, b, label) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) pass++; else { fail++; console.log(`  NG  ${label}\n      期待 ${y}\n      実際 ${x}`); }
}
function ok(c, label) { eq(!!c, true, label); }
function group(n, fn) { console.log(`\n== ${n}`); fn(); }

/* ---- 道具 ---- */

const LIB = {};
function tidy(c, opts) {
  const r = LAY.arrange(c, LIB, G, opts);
  if (!r) return null;
  for (const id in r.parts) { c.parts[id].x = r.parts[id].x; c.parts[id].y = r.parts[id].y; }
  for (const id in c.wires) {
    if (r.wires[id]) c.wires[id].pts = r.wires[id]; else delete c.wires[id].pts;
  }
  return r.parts;
}
function box(c, p) { const s = G.sizeOf(p, LIB); return { x: p.x, y: p.y, w: s.w, h: s.h }; }
function overlaps(c) {
  const list = Object.keys(c.parts).map(i => c.parts[i]), bad = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = box(c, list[i]), b = box(c, list[j]);
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
      bad.push(N.labelOf(list[i]) + '×' + N.labelOf(list[j]));
    }
  }
  return bad;
}
/* 配線を線分として見たときの交差の数。折れ線ではなく端から端への直線で数える
 * （折れ方は routePath の都合。ここで見たいのは「絡まっているか」だけ） */
function crossings(c) {
  const seg = [];
  for (const w in c.wires) {
    const wr = c.wires[w];
    seg.push([G.portXY(c.parts[wr.from.part], LIB, 'out', wr.from.port),
              G.portXY(c.parts[wr.to.part], LIB, 'in', wr.to.port)]);
  }
  const side = (a, b, p) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  let n = 0;
  for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) {
    const [a, b] = seg[i], [p, q] = seg[j];
    if (side(a, b, p) * side(a, b, q) < 0 && side(p, q, a) * side(p, q, b) < 0) n++;
  }
  return n;
}
/* 実際に描かれる折れ線。ui.js の wirePath と同じ判断
 * （覚えた通り道が端子と合っていればそれ、合わなければ素直な折れ線）*/
function drawn(c, w) {
  const p1 = G.portXY(c.parts[w.from.part], LIB, 'out', w.from.port);
  const p2 = G.portXY(c.parts[w.to.part], LIB, 'in', w.to.port);
  const q = w.pts;
  if (q && q.length >= 2 && q[0].x === p1.x && q[0].y === p1.y &&
      q[q.length - 1].x === p2.x && q[q.length - 1].y === p2.y) return q;
  return G.routePath(p1, p2, w.to.port);
}

/* 線分が箱を突き抜けているか。端は触れていてよい（端子は箱の縁にあるので） */
function stabs(a, b, r) {
  const inside = p => p.x > r.x + .5 && p.x < r.x + r.w - .5 && p.y > r.y + .5 && p.y < r.y + r.h - .5;
  if (inside(a) || inside(b)) return true;
  const cut = (p, q, u, v) => {
    const d = (q.x - p.x) * (v.y - u.y) - (q.y - p.y) * (v.x - u.x);
    if (!d) return false;
    const t = ((u.x - p.x) * (v.y - u.y) - (u.y - p.y) * (v.x - u.x)) / d;
    const s = ((u.x - p.x) * (q.y - p.y) - (u.y - p.y) * (q.x - p.x)) / d;
    return t > 0 && t < 1 && s > 0 && s < 1;
  };
  const e = [[{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }],
             [{ x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }],
             [{ x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }],
             [{ x: r.x, y: r.y + r.h }, { x: r.x, y: r.y }]];
  return e.some(g => cut(a, b, g[0], g[1]));
}

/** 部品を突き抜けている配線の数 */
function stabbed(c) {
  let n = 0;
  for (const w in c.wires) {
    const wr = c.wires[w], pts = drawn(c, wr);
    for (const id in c.parts) {
      if (+id === wr.from.part || +id === wr.to.part) continue;
      const p = c.parts[id], s = G.sizeOf(p, LIB), r = { x: p.x, y: p.y, w: s.w, h: s.h };
      let bad = false;
      for (let i = 0; i + 1 < pts.length; i++) if (stabs(pts[i], pts[i + 1], r)) { bad = true; break; }
      if (bad) { n++; break; }
    }
  }
  return n;
}

function ports(c, w) {
  return { a: G.portXY(c.parts[w.from.part], LIB, 'out', w.from.port),
           b: G.portXY(c.parts[w.to.part], LIB, 'in', w.to.port) };
}

/* ---- 検査 ---- */

group('信号の向きに並ぶ', () => {
  const c = N.create();
  const a = N.addPart(c, 'in', 500, 300);
  const g = N.addPart(c, 'nand', 100, 90);
  const y = N.addPart(c, 'out', 300, 700);
  N.connect(c, a.id, 0, g.id, 0); N.connect(c, a.id, 0, g.id, 1);
  N.connect(c, g.id, 0, y.id, 0);
  tidy(c);
  ok(a.x < g.x, '入力は NAND より左');
  ok(g.x < y.x, 'NAND は出力より左');
  eq(overlaps(c), [], '重なっていない');
  eq([a.x % 10, a.y % 10, g.x % 10, g.y % 10, y.x % 10, y.y % 10], [0, 0, 0, 0, 0, 0], '格子に載っている');

  /* 出力の端子は部品の中心、NAND の出力も中心。間に何も無いのだから真横に引けるはず */
  const w = c.wires[Object.keys(c.wires).find(k => c.wires[k].to.part === y.id)];
  eq(ports(c, w).a.y, ports(c, w).b.y, '出力へ向かう線は真横になる');
});

group('出力は右端に揃う', () => {
  const c = N.create();
  const a = N.addPart(c, 'in', 0, 0);
  const g1 = N.addPart(c, 'nand', 0, 0);
  const g2 = N.addPart(c, 'nand', 0, 0);
  const y1 = N.addPart(c, 'out', 0, 0);      /* 1段目からすぐ出る出力 */
  const y2 = N.addPart(c, 'out', 0, 0);      /* 2段目から出る出力 */
  N.connect(c, a.id, 0, g1.id, 0); N.connect(c, a.id, 0, g1.id, 1);
  N.connect(c, g1.id, 0, g2.id, 0); N.connect(c, g1.id, 0, g2.id, 1);
  N.connect(c, g1.id, 0, y1.id, 0);
  N.connect(c, g2.id, 0, y2.id, 0);
  tidy(c);
  eq(y1.x, y2.x, '深さが違っても出力は同じ列');
  ok(y1.x > g2.x, '出力は一番奥の NAND より右');
});

group('交差を減らす', () => {
  const c = N.create();
  const a = N.addPart(c, 'in', 0, 0, { name: 'A' });
  const b = N.addPart(c, 'in', 0, 200, { name: 'B' });
  const n1 = N.addPart(c, 'nand', 200, 300);   /* A から来るのに下に置いてある */
  const n2 = N.addPart(c, 'nand', 200, 0);     /* B から来るのに上に置いてある */
  const n3 = N.addPart(c, 'nand', 400, 100);
  const y = N.addPart(c, 'out', 600, 100);
  N.connect(c, a.id, 0, n1.id, 0); N.connect(c, a.id, 0, n1.id, 1);
  N.connect(c, b.id, 0, n2.id, 0); N.connect(c, b.id, 0, n2.id, 1);
  N.connect(c, n1.id, 0, n3.id, 0); N.connect(c, n2.id, 0, n3.id, 1);
  N.connect(c, n3.id, 0, y.id, 0);
  const before = crossings(c);
  ok(before > 0, '整える前は絡まっている');
  tidy(c);
  eq(crossings(c), 0, '整えたら解ける');
  ok((a.y < b.y) === (n1.y < n2.y), '上下の関係が上流から引き継がれる');
});

group('輪があっても整う（SR ラッチ）', () => {
  const c = N.create();
  const s = N.addPart(c, 'in', 0, 0, { name: 'S' });
  const r = N.addPart(c, 'in', 0, 100, { name: 'R' });
  const n1 = N.addPart(c, 'nand', 200, 0);
  const n2 = N.addPart(c, 'nand', 200, 100);
  const q = N.addPart(c, 'out', 400, 0, { name: 'Q' });
  N.connect(c, s.id, 0, n1.id, 0);
  N.connect(c, r.id, 0, n2.id, 1);
  N.connect(c, n1.id, 0, n2.id, 0);      /* ここで輪になる */
  N.connect(c, n2.id, 0, n1.id, 1);
  N.connect(c, n1.id, 0, q.id, 0);
  const pos = tidy(c);
  eq(Object.keys(pos).length, 5, '全部に座標が付く');
  eq(overlaps(c), [], '重なっていない');
  ok(s.x < n1.x && n1.x < q.x, '輪の外側は左から右のまま');
});

group('繋がっていない塊は上下に分ける', () => {
  const c = N.create();
  const a1 = N.addPart(c, 'in', 0, 0); const g1 = N.addPart(c, 'nand', 50, 50);
  const a2 = N.addPart(c, 'in', 20, 30); const g2 = N.addPart(c, 'nand', 70, 10);
  N.connect(c, a1.id, 0, g1.id, 0); N.connect(c, a1.id, 0, g1.id, 1);
  N.connect(c, a2.id, 0, g2.id, 0); N.connect(c, a2.id, 0, g2.id, 1);
  tidy(c);
  const top = [a1, g1], bot = [a2, g2];
  const lo = Math.max(...top.map(p => p.y + G.sizeOf(p, LIB).h));
  const hi = Math.min(...bot.map(p => p.y));
  ok(lo <= hi || Math.min(...top.map(p => p.y)) >= Math.max(...bot.map(p => p.y + G.sizeOf(p, LIB).h)),
    '2つの塊が縦に分かれている');
  eq([a1.x, a2.x], [a1.x, a1.x], '列は塊をまたいで揃う');
});

group('元あった場所から動かない', () => {
  const c = N.create();
  const a = N.addPart(c, 'in', 300, 200);
  const g = N.addPart(c, 'nand', 900, 640);
  N.connect(c, a.id, 0, g.id, 0); N.connect(c, a.id, 0, g.id, 1);
  tidy(c);
  eq([Math.min(a.x, g.x), Math.min(a.y, g.y)], [300, 200], '左上の角はそのまま');
});

group('選んだものだけ整える', () => {
  const c = N.create();
  const a = N.addPart(c, 'in', 0, 0);
  const g = N.addPart(c, 'nand', 400, 400);
  const far = N.addPart(c, 'out', 1000, 1000);      /* 選ばない。繋いでもいない */
  N.connect(c, a.id, 0, g.id, 0); N.connect(c, a.id, 0, g.id, 1);
  const pos = tidy(c, { ids: [a.id, g.id] });
  eq(Object.keys(pos).length, 2, '選んだ2つだけ返る');
  eq([far.x, far.y], [1000, 1000], '選ばなかったものは動かない');
  ok(a.x < g.x, '選んだ中では並び替わる');

  eq(LAY.arrange(c, LIB, G, { ids: [a.id] }), null, '1つだけでは整えようがない');
});

group('配線が部品を突き抜けない', () => {
  /* 列を2つ以上またぐ線が、途中の列に並んだ部品の上を横切るのが一番の見づらさ */
  const c = N.create();
  const A = N.addPart(c, 'in', 0, 0, { name: 'A' }), B = N.addPart(c, 'in', 0, 80, { name: 'B' });
  const g = [0, 1, 2].map(i => N.addPart(c, 'nand', 200 + i * 200, 0));
  const Y = N.addPart(c, 'out', 800, 0, { name: 'Y' });
  N.connect(c, A.id, 0, g[0].id, 0); N.connect(c, B.id, 0, g[0].id, 1);
  N.connect(c, g[0].id, 0, g[1].id, 0); N.connect(c, B.id, 0, g[1].id, 1);
  N.connect(c, g[1].id, 0, g[2].id, 0); N.connect(c, A.id, 0, g[2].id, 1);   /* 3列先へ */
  N.connect(c, g[2].id, 0, Y.id, 0);
  ok(stabbed(c) > 0, '整える前は突き抜けている');
  tidy(c);
  eq(stabbed(c), 0, '整えたら1本も突き抜けない');

  /* 遠くへ行く線には通り道を覚えさせてある */
  const far = Object.keys(c.wires).map(k => c.wires[k])
    .filter(w => w.from.part === A.id && w.to.part === g[2].id)[0];
  ok(far.pts && far.pts.length >= 2, '列をまたぐ線は通り道を覚えている');
  eq([far.pts[0].x, far.pts[0].y],
     [G.portXY(c.parts[far.from.part], LIB, 'out', far.from.port).x,
      G.portXY(c.parts[far.from.part], LIB, 'out', far.from.port).y], '道の始まりは出力の端子ぴったり');

  /* 部品を動かしたら、覚えた道は使われなくなる（部品と繋がっていない線が残らない）*/
  const before = drawn(c, far).length;
  c.parts[g[2].id].y += 40;
  const after = drawn(c, far);
  ok(after !== far.pts, '動かしたら覚えた道は捨てられる');
  eq(after[after.length - 1].y, G.portXY(c.parts[g[2].id], LIB, 'in', far.to.port).y,
    '素直な折れ線に戻り、端子まで届いている');
  ok(before >= 2, '道はもともと折れ線だった');
});

group('大きくても破綻しない', () => {
  const c = N.create();
  const a = N.addPart(c, 'in', 0, 0), b = N.addPart(c, 'in', 0, 40);
  let prev = null;
  for (let i = 0; i < 60; i++) {                    /* 60 段の一本道 */
    const g = N.addPart(c, 'nand', (i % 7) * 130, (i % 5) * 90);
    if (prev) { N.connect(c, prev.id, 0, g.id, 0); N.connect(c, prev.id, 0, g.id, 1); }
    else { N.connect(c, a.id, 0, g.id, 0); N.connect(c, b.id, 0, g.id, 1); }
    prev = g;
  }
  const t0 = Date.now();
  tidy(c);
  const ms = Date.now() - t0;
  eq(overlaps(c), [], '重なっていない');
  ok(ms < 2000, `速さは実用の範囲（${ms}ms）`);
  const xs = Object.keys(c.parts).map(i => c.parts[i].x);
  eq(new Set(xs).size, 61, '入力の列 + 60 段ぶんの列ができる');
});

console.log(`\n合格 ${pass} / 不合格 ${fail}`);
process.exit(fail ? 1 : 0);
