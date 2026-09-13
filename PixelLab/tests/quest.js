/* 課題の検査 ― お手本（の手順）で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, eq, report } = require('./harness.js');
const { PX } = load();
const Q = PX.quest, A = PX.answer, PIX = PX.pixel, CAM = PX.camera;

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 10);
  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: 重複しない`, !seen.has(q.id)); seen.add(q.id);
    ok(`${q.id}: 説明・理由・ヒント`, q.desc.length > 10 && q.why.length > 20 && q.hint.length > 5);
    ok(`${q.id}: 章がある`, !!Q.chapterOf(q));
    ok(`${q.id}: お手本がある`, !!A.get(q.id));
    if (q.kind !== 'design') ok(`${q.id}: カメラが決まっている`, !!CAM.MYSTERY[q.cam]);
    if (q.kind === 'measure') ok(`${q.id}: 単位と許容がある`, !!q.unit && q.tol > 0 && q.tol < 0.3);
  });
  A.ids().forEach((id) => ok(`お手本 ${id} に課題がある`, !!Q.byId(id)));
});

T('お手本で通る', () => {
  Q.LIST.forEach((q) => {
    const a = A.get(q.id);
    let st;
    if (q.kind === 'design') st = { answers: {}, design: a.design() };
    else { const r = a.solve(); st = { answers: { [q.id]: r.value }, design: PIX.defaults() }; }
    const g = Q.grade(q.id, st);
    const why = (g.rows || []).filter((x) => !x.ok).map((x) => `${x.label}=${x.value}`).join(' / ');
    ok(`${q.id} のお手本が通る` + (g.ok ? '' : '　― ' + why), g.ok);
  });
});

T('落ちるべきもの', () => {
  const base = { answers: {}, design: PIX.defaults() };
  /* 既定の設計のままでは、設計の課題はどれも通らない（何もしなくて通る課題は無い） */
  Q.LIST.filter((q) => q.kind === 'design').forEach((q) => ok(`${q.id}: 既定の設計では通らない`, !Q.grade(q.id, base).ok));
  /* 答えを入れていなければ通らない */
  Q.LIST.filter((q) => q.kind !== 'design').forEach((q) => ok(`${q.id}: 答えが無ければ通らない`, !Q.grade(q.id, base).ok));
  /* 真の値から許容の外にずらすと落ちる（許容が緩すぎない） */
  Q.LIST.filter((q) => q.kind === 'measure').forEach((q) => {
    const t = q.truth(CAM.MYSTERY[q.cam]);
    ok(`${q.id}: 許容の外（+${Math.round(q.tol * 150)}%）は落ちる`, !Q.grade(q.id, { answers: { [q.id]: t * (1 + q.tol * 1.5) } }).ok);
    ok(`${q.id}: 許容の内は通る`, Q.grade(q.id, { answers: { [q.id]: t * (1 + q.tol * 0.5) } }).ok);
  });
  /* 飽和の課題: 井戸と答えたら落ちる */
  ok('limit: 「井戸」は落ちる', !Q.grade('limit', { answers: { limit: 'well' } }).ok);
  /* 外れたときは真の値を見せない */
  const miss = Q.grade('k', { answers: { k: 99 } });
  ok('外れたとき真の値を見せない', !miss.rows.some((r) => /真の値/.test(r.label)));
  /* 設計の課題どうしで、他のお手本では通らないものがある（課題ごとに違うことを見ている） */
  const ds = Q.LIST.filter((q) => q.kind === 'design');
  ds.forEach((q) => {
    const others = ds.filter((o) => o.id !== q.id).filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の設計のお手本の全部では通らない`, others < ds.length - 1);
  });
});

T('第4章 ― 窓の両側と反則', () => {
  const g = (id, patch) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), patch) }).ok;
  ok('第4章の課題が 4 問ある', Q.LIST.filter((q) => q.ch === 4).length === 4);
  /* roll */
  ok('roll: 同時に読む行 3 でも 2.46 画素で通る', g('roll', { colpar: 3 }));
  ok('roll: 2 では 3.69 画素で落ちる', !g('roll', { colpar: 2 }));
  ok('roll: 桁を 11 に落として速くするのは反則', !g('roll', { colpar: 1, bits: 11 }));
  ok('roll: 列回路 5 組は上限破り', !g('roll', { colpar: 5 }));
  ok('roll: 13 bit にすると 4 組でも 3.69 画素で落ちる', !g('roll', { bits: 13 }));
  ok('roll: クロックを上げるのは反則', !g('roll', { colpar: 1, fclk: 4000 }));
  ok('roll: 物体を遅くするのは反則', !g('roll', { colpar: 1, vpx: 100 }));
  /* gs */
  ok('gs: 4 組なら 84 dB で通る', g('gs', { pls: 84 }));
  ok('gs: 4 組でも 82 dB では落ちる', !g('gs', { pls: 82 }));
  ok('gs: 1 組なら 96 dB で通る', g('gs', { colpar: 1, pls: 96 }));
  ok('gs: 1 組の 94 dB は落ちる', !g('gs', { colpar: 1, pls: 94 }));
  ok('gs: 分離比 110 dB は上限破り', !g('gs', { colpar: 1, pls: 110 }));
  ok('gs: 画素を小さくして光を減らすのは反則', !g('gs', { pls: 80, pitch: 1.0 }));
  ok('gs: 桁を落として速くするのは反則', !g('gs', { pls: 80, bits: 8 }));
  /* pitch */
  ok('pitch: 2.2 µm は通る', g('pitch', { pitch: 2.2 }));
  ok('pitch: 2.5 µm は通る', g('pitch', { pitch: 2.5 }));
  ok('pitch: 2.6 µm は画素数が足りない', !g('pitch', { pitch: 2.6 }));
  ok('pitch: 2.1 µm は回折の限界より細かい', !g('pitch', { pitch: 2.1 }));
  ok('pitch: F 値を開けて回折の限界を下げるのは反則', !g('pitch', { pitch: 2.1, fnum: 4 }));
  ok('pitch: 読み出し回路を変えるのは反則', !g('pitch', { cfd: 1.2 }));
  /* tdi */
  ok('tdi: 電荷で 81 段は通る', g('tdi', { tdiN: 81 }));
  ok('tdi: 電荷で 80 段は S/N が足りない', !g('tdi', { tdiN: 80 }));
  ok('tdi: 電荷で 100 段は通る', g('tdi', { tdiN: 100 }));
  ok('tdi: 電荷で 101 段は にじむ', !g('tdi', { tdiN: 101 }));
  ok('tdi: デジタルで 100 段は届かない', !g('tdi', { tdiMode: 0, tdiN: 100 }));
  ok('tdi: 速さのずれを小さくするのは反則', !g('tdi', { tdiN: 150, tdiSync: 0.5 }));
  ok('tdi: 1 段の信号を増やすのは反則', !g('tdi', { tdiN: 10, tdiS1: 50 }));
  ok('tdi: 読み出し雑音を削るのは反則（ここでは足し方を選ぶ課題）', !g('tdi', { tdiMode: 0, tdiN: 100, cfd: 1.0 }));
});

T('第5章 ― 窓の両側と反則', () => {
  const g = (id, patch) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), patch) }).ok;
  ok('第5章の課題が 3 問ある', Q.LIST.filter((q) => q.ch === 5).length === 3);
  /* seam: 88 dB には R ≥ 5.89、つなぎ目 30 には R ≤ 7.48 */
  ok('seam: 5.9 は通る', g('seam', { hdrR: 5.9 }));
  ok('seam: 5.8 は合成が 88 dB に届かない', !g('seam', { hdrR: 5.8 }));
  ok('seam: 7.4 は通る', g('seam', { hdrR: 7.4 }));
  ok('seam: 7.5 はつなぎ目が 30 を切る', !g('seam', { hdrR: 7.5 }));
  ok('seam: 16 は天井は届くがつなぎ目が 20.5', !g('seam', { hdrR: 16 }));
  ok('seam: 浮遊拡散を下げて単発の DR を稼ぐのは反則', !g('seam', { hdrR: 4, cfd: 1.2 }));
  ok('seam: 桁を増やすのは反則', !g('seam', { bits: 14 }));
  /* defect: 欠陥の成分が無ければ −10℃ で足りるが、10 pA/cm² で −29℃ まで要る */
  ok('defect: −29℃ は通る', g('defect', { T: -29 }));
  ok('defect: −28.9℃ は届かない', !g('defect', { T: -28.9 }));
  ok('defect: −20℃（欠陥なしなら足りる温度）は届かない', !g('defect', { T: -20 }));
  ok('defect: −40℃ は通る', g('defect', { T: -40 }));
  ok('defect: −41℃ は冷却の上限破り', !g('defect', { T: -41 }));
  ok('defect: 欠陥を減らしたことにするのは反則', !g('defect', { T: -20, jdDef: 1 }));
  ok('defect: 読み出し雑音を増やして基準を緩めるのは反則', !g('defect', { T: -20, sf: 400 }));
  /* spad: τ ≤ 11.1 ns・N ≥ 57 */
  ok('spad: 11.1 ns は通る', g('spad', { spadTd: 11.1 }));
  ok('spad: 11.2 ns は数え落としが 10% を超える', !g('spad', { spadTd: 11.2 }));
  ok('spad: 4.9 ns はアフターパルスの下限破り', !g('spad', { spadTd: 4.9 }));
  ok('spad: 57 光子は通る', g('spad', { spadN: 57 }));
  ok('spad: 56 光子は 2.003 mm で届かない', !g('spad', { spadN: 56 }));
  ok('spad: 101 光子は時間の上限破り', !g('spad', { spadN: 101 }));
  ok('spad: 揺らぎを小さくするのは反則', !g('spad', { spadN: 20, spadJit: 50 }));
  ok('spad: 光を弱めて数え落としを減らすのは反則', !g('spad', { spadTd: 20, spadRate: 3e6 }));
});

report();
