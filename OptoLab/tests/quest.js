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
  ok('cos4: 35mm（53%）は落ちる', !Q.grade('cos4', { design: q1 }).ok);
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
});

report();
