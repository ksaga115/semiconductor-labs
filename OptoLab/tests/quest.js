/* 課題の検査 ― お手本で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, report } = require('./harness.js');
const { OP } = load();
const Q = OP.quest, A = OP.answer, O = OP.opto;

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 9);
  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: 重複しない`, !seen.has(q.id)); seen.add(q.id);
    ok(`${q.id}: 説明・理由・ヒント`, q.desc.length > 10 && q.why.length > 20 && q.hint.length > 5);
    ok(`${q.id}: 章がある`, !!Q.chapterOf(q));
    ok(`${q.id}: お手本がある`, !!A.get(q.id));
    ok(`${q.id}: design 型`, q.kind === 'design');
  });
  A.ids().forEach((id) => ok(`お手本 ${id} に課題がある`, !!Q.byId(id)));
});

T('お手本で通る', () => {
  Q.LIST.forEach((q) => {
    const g = Q.grade(q.id, { design: A.get(q.id).design() });
    const why = (g.rows || []).filter((x) => !x.ok).map((x) => `${x.label}=${x.value}`).join(' / ');
    ok(`${q.id} のお手本が通る` + (g.ok ? '' : '　― ' + why), g.ok);
  });
});

T('落ちるべきもの', () => {
  const base = { design: O.defaults() };
  Q.LIST.forEach((q) => ok(`${q.id}: 既定の設計では通らない`, !Q.grade(q.id, base).ok));
  Q.LIST.forEach((q) => {
    const others = Q.LIST.filter((o) => o.id !== q.id)
      .filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の設計のお手本の全部では通らない`, others < Q.LIST.length - 1);
  });

  /* 条件固定を破ったら、数字が届いていても落ちる */
  const c1 = Object.assign({}, A.get('lux').design(), { lx: 10000 });
  ok('lux: 被写体を勝手に明るくするのは反則', !Q.grade('lux', { design: c1 }).ok);
  const c2 = Object.assign({}, A.get('inv').design(), { rm: 0.5 });
  ok('inv: 距離を勝手に詰めるのは反則', !Q.grade('inv', { design: c2 }).ok);
  const c3 = Object.assign({}, A.get('lockin').design(), { bin: 100000 });
  ok('lockin: 元の帯域を勝手に広げるのは反則', !Q.grade('lockin', { design: c3 }).ok);
  const c4 = Object.assign({}, A.get('gauss').design(), { fmm: 10 });
  ok('gauss: 焦点距離を勝手に短くするのは反則', !Q.grade('gauss', { design: c4 }).ok);

  /* トレードオフの両側で落ちる */
  const f1 = Object.assign({}, A.get('fiber').design(), { winmm: 1 });
  ok('fiber: ビームが細いとスポットで落ちる', !Q.grade('fiber', { design: f1 }).ok);
  const f2 = Object.assign({}, A.get('fiber').design(), { winmm: 8 });
  ok('fiber: ビームが太いと角度で落ちる', !Q.grade('fiber', { design: f2 }).ok);
  const a1 = Object.assign({}, A.get('ar').design(), { ncoat: 1.38 });
  ok('ar: MgF₂ ではシリコンには足りない', !Q.grade('ar', { design: a1 }).ok);
  const a2 = Object.assign({}, A.get('ar').design(), { ncoat: 2.4 });
  ok('ar: 高すぎる屈折率も落ちる', !Q.grade('ar', { design: a2 }).ok);
  const l1 = Object.assign({}, A.get('lens').design(), { amm: 130 });
  ok('lens: 2f から外れると等倍でない', !Q.grade('lens', { design: l1 }).ok);

  /* エテンデュ: 実用の上限を破るのは反則、積が足りないと落ちる、光源を小さくするのは反則 */
  const e1 = Object.assign({}, A.get('etd').design(), { coreu: 300 });
  ok('etd: コア 300µm は上限破りで落ちる', !Q.grade('etd', { design: e1 }).ok);
  const e2 = Object.assign({}, A.get('etd').design(), { naf: 0.3 });
  ok('etd: NA 0.3（上限 25%）では落ちる', !Q.grade('etd', { design: e2 }).ok);
  const e3 = Object.assign({}, A.get('etd').design(), { srcum: 50 });
  ok('etd: 光源を勝手に小さくするのは反則', !Q.grade('etd', { design: e3 }).ok);

  /* cos⁴: 広角では暗く、望遠に逃げるのは上限破り、像高をずらすのは反則 */
  const q1 = Object.assign({}, A.get('cos4').design(), { fmm: 35 });
  ok('cos4: 35mm（52%）は落ちる', !Q.grade('cos4', { design: q1 }).ok);
  const q2 = Object.assign({}, A.get('cos4').design(), { fmm: 85 });
  ok('cos4: 85mm は望遠逃げで落ちる', !Q.grade('cos4', { design: q2 }).ok);
  const q3 = Object.assign({}, A.get('cos4').design(), { hmm: 10 });
  ok('cos4: 像高を内側にずらすのは反則', !Q.grade('cos4', { design: q3 }).ok);

  /* モード結合: 太すぎ・細すぎの両側と、MFD を都合よく変える反則 */
  const md1 = Object.assign({}, A.get('mode').design(), { winmm: 4 });
  ok('mode: w=4mm（91%）は落ちる ― fiber には入るのに', !Q.grade('mode', { design: md1 }).ok);
  const md2 = Object.assign({}, A.get('mode').design(), { winmm: 8 });
  ok('mode: w=8mm（87%）は落ちる', !Q.grade('mode', { design: md2 }).ok);
  const md3 = Object.assign({}, A.get('mode').design(), { mfdum: 8 });
  ok('mode: MFD を都合よく変えるのは反則', !Q.grade('mode', { design: md3 }).ok);

  /* ブルースター角: 窓（約 53〜59°）の両側で落ちる、基板を変えたままでは落ちる */
  const b1 = Object.assign({}, A.get('brew').design(), { incdeg: 45 });
  ok('brew: 45°（p 0.85%）は落ちる', !Q.grade('brew', { design: b1 }).ok);
  const b2 = Object.assign({}, A.get('brew').design(), { incdeg: 65 });
  ok('brew: 65° は反対側で落ちる', !Q.grade('brew', { design: b2 }).ok);
  const b3 = Object.assign({}, A.get('brew').design(), { nsub: 3.9, incdeg: 75.6 });
  ok('brew: シリコンのままでは反則', !Q.grade('brew', { design: b3 }).ok);
  ok('brew: 窓の端 53.5° は通る', Q.grade('brew', { design: Object.assign({}, A.get('brew').design(), { incdeg: 53.5 }) }).ok);

  /* 格子: 細かすぎると範囲で、粗すぎると分解能で、スリットが広いと分解能で落ちる */
  const g1 = Object.assign({}, A.get('grat').design(), { glmm: 600 });
  ok('grat: 600 本/mm は範囲がはみ出して落ちる', !Q.grade('grat', { design: g1 }).ok);
  const g2 = Object.assign({}, A.get('grat').design(), { glmm: 300 });
  ok('grat: 300 本/mm は分解能で落ちる', !Q.grade('grat', { design: g2 }).ok);
  const g3 = Object.assign({}, A.get('grat').design(), { slitum: 100 });
  ok('grat: スリット 100 µm は分解能で落ちる', !Q.grade('grat', { design: g3 }).ok);
  const g4 = Object.assign({}, A.get('grat').design(), { fsp: 100, glmm: 600 });
  ok('grat: 焦点距離を変えるのは反則', !Q.grade('grat', { design: g4 }).ok);

  /* 回線: 電力の両側（足りない・上限破り）と、波長の幅と、長さを変える反則 */
  const k1 = Object.assign({}, A.get('link').design(), { pdbm: -5 });
  ok('link: 送信 −5 dBm は受信 −22 で落ちる', !Q.grade('link', { design: k1 }).ok);
  const k2 = Object.assign({}, A.get('link').design(), { pdbm: 10 });
  ok('link: 送信 +10 dBm は上限破りで落ちる', !Q.grade('link', { design: k2 }).ok);
  const k3 = Object.assign({}, A.get('link').design(), { dlnm: 0.1 });
  ok('link: 波長の幅 0.1 nm は分散 136 ps で落ちる', !Q.grade('link', { design: k3 }).ok);
  const k4 = Object.assign({}, A.get('link').design(), { linkkm: 40 });
  ok('link: 長さを縮めるのは反則', !Q.grade('link', { design: k4 }).ok);

  /* 第5章: MTF と焦点深度・多層膜・被写界深度の窓の両側と反則 */
  const W = (id, p) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), p) }).ok;
  ok('mtf: F4.2 は焦点深度 58 µm で落ちる', !W('mtf', { N: 4.2 }));
  ok('mtf: F5.6 は MTF 0.29 で落ちる', !W('mtf', { N: 5.6 }));
  ok('mtf: 窓の端 F4.4 は通る', W('mtf', { N: 4.4 }));
  ok('mtf: 画素を大きくするのは反則', !W('mtf', { ppum: 5 }));
  ok('hr: 対 5 つ（99.06%）は落ちる', !W('hr', { npair: 5 }));
  ok('hr: 対 8 つ（17 層）は予算破り', !W('hr', { npair: 8 }));
  ok('hr: 中心 520 nm は 620 nm まで届かない', !W('hr', { lam0: 520 }));
  ok('hr: 中心 580 nm は 500 nm まで届かない', !W('hr', { lam0: 580 }));
  ok('hr: 屈折率の高い材料に替えるのは反則', !W('hr', { nH: 2.6 }));
  ok('dof: F3.8 は深さ 4.7 mm で落ちる', !W('dof', { N: 3.8 }));
  ok('dof: F5 は回折 7.5 µm で落ちる', !W('dof', { N: 5 }));
  ok('dof: 物体を遠ざけるのは反則', !W('dof', { amm: 1000 }));
});

report();
