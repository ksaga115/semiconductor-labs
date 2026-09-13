/* 課題の検査 ― お手本で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, report } = require('./harness.js');
const { LS } = load();
const Q = LS.quest, A = LS.answer, M = LS.laser;

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

const with_ = (id, patch) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), patch) }).ok;

T('落ちるべきもの', () => {
  const base = { design: M.defaults() };
  Q.LIST.forEach((q) => ok(`${q.id}: 既定の設計では通らない`, !Q.grade(q.id, base).ok));
  Q.LIST.forEach((q) => {
    const others = Q.LIST.filter((o) => o.id !== q.id)
      .filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の設計のお手本の全部では通らない`, others < Q.LIST.length - 1);
  });

  /* 窓の両側 */
  ok('wien: 3,000 K は可視が足りない', !with_('wien', { tk: 3000 }));
  ok('wien: 3,600 K は寿命の上限破り', !with_('wien', { tk: 3600 }));
  ok('slope: 400 µm はスロープ効率で落ちる', !with_('slope', { lum: 400 }));
  ok('slope: 200 µm はしきい値で落ちる', !with_('slope', { lum: 200 }));
  ok('fsr: 250 µm は間隔で落ちる', !with_('fsr', { lum: 250 }));
  ok('fsr: 180 µm はしきい値で落ちる', !with_('fsr', { lum: 180 }));
  ok('t0: 45 mA は出力が足りない', !with_('t0', { iop: 45 }));
  ok('t0: 55 mA は電流の上限破り', !with_('t0', { iop: 55 }));
  ok('dfb: 38.5 ℃ は波長が行き過ぎる', !with_('dfb', { tempc: 38.5 }));
  ok('dfb: 37.9 ℃ は届かない', !with_('dfb', { tempc: 37.9 }));
  ok('mlock: 1.5 m は 100 MHz で落ちる', !with_('mlock', { lcavm: 1.5 }));
  ok('mlock: 幅 5 nm は 188 fs で落ちる', !with_('mlock', { dlnm: 5 }));
  ok('peak: 0.7 W は尖頭値が足りない', !with_('peak', { pavg: 0.7 }));
  ok('peak: 2 W は 25 nJ で損傷の上限破り', !with_('peak', { pavg: 2 }));
  ok('thresh: R₂ 0.8 はしきい値は足りるが前が 90% に届かない', !with_('thresh', { r2: 0.8 }));
  ok('thresh: R₂ 0.999 は膜の上限破り', !with_('thresh', { r2: 0.999 }));

  /* 条件固定を破ったら、数字が届いていても落ちる */
  ok('led: 波長を変えて hν を稼ぐのは反則', !with_('led', { lednm: 400 }));
  ok('led: 取り出し 0.95 は上限破り', !with_('led', { extr: 0.95 }));
  ok('thresh: 長さを変えるのは反則', !with_('thresh', { lum: 600 }));
  ok('slope: 注入効率を盛るのは反則', !with_('slope', { etai: 1.0 }));
  ok('t0: T₀ を盛るのは反則', !with_('t0', { t0: 150 }));
  ok('fsr: 群屈折率を変えるのは反則', !with_('fsr', { ng: 3.0 }));
  ok('dfb: 格子の周期を変えるのは反則', !with_('dfb', { pitchnm: 242.2, tempc: 25 }));
  ok('peak: スペクトルを変えるのは反則', !with_('peak', { dlnm: 20 }));

  /* 第4章: 窓の両側と反則 */
  ok('relax: 36.0 mA は帯域が足りない', !with_('relax', { iop: 36.0 }));
  ok('relax: 36.5 mA なら通る', with_('relax', { iop: 36.5 }));
  ok('relax: 50 mA は通る（上限ちょうど）', with_('relax', { iop: 50 }));
  ok('relax: 55 mA は電流の上限破り', !with_('relax', { iop: 55 }));
  ok('relax: 70 ℃ に下げるのは反則', !with_('relax', { tempc: 70 }));
  ok('relax: D を盛るのは反則', !with_('relax', { dfac: 3, iop: 30 }));
  ok('relax: ビットレートを下げるのは反則', !with_('relax', { gbps: 5, iop: 30 }));
  ok('shg: 2.2 cm・1 W は 20 mW に届かない', !with_('shg', { shgL: 2.2 }));
  ok('shg: 2.35 cm・1 W なら通る', with_('shg', { shgL: 2.35 }));
  ok('shg: 2.85 cm・1 W なら通る', with_('shg', { shgL: 2.85 }));
  ok('shg: 3.0 cm は揺れで 20% より多く落ちる', !with_('shg', { shgL: 3.0 }));
  ok('shg: 励起 1.2 W は損傷の上限破り', !with_('shg', { shgP: 1.2 }));
  ok('shg: 2.6 cm でも 0.9 W では足りない', !with_('shg', { shgP: 0.9 }));
  ok('shg: 許容幅を広く見積もるのは反則', !with_('shg', { shgA: 2, shgL: 4 }));
  ok('shg: 温度の揺れを小さく見積もるのは反則', !with_('shg', { shgdT: 0.01, shgL: 4 }));
  ok('fiber: 倍率 2.7 は小さすぎる', !with_('fiber', { mag: 2.7 }));
  ok('fiber: 倍率 3.0 なら通る', with_('fiber', { mag: 3.0 }));
  ok('fiber: 倍率 3.8 なら通る', with_('fiber', { mag: 3.8 }));
  ok('fiber: 倍率 4.0 は大きすぎる', !with_('fiber', { mag: 4.0 }));
  ok('fiber: 横ずれを小さく見積もるのは反則', !with_('fiber', { offum: 0.5, mag: 2.7 }));
  ok('fiber: LD のモードを変えるのは反則', !with_('fiber', { ldw: 5.2, mag: 1 }));
});

T('第5章 ― 窓の両側と反則', () => {
  ok('calib: 365.02・576.96 nm でも通る', with_('calib', { calA: 365.015, calB: 576.960 }));
  ok('calib: 404.66・579.07 nm は 0.037 nm で届かない', !with_('calib', { calA: 404.656, calB: 579.066 }));
  ok('calib: 範囲の外の 253.65 nm を使うのは反則', !with_('calib', { calA: 253.652, calB: 579.066 }));
  ok('calib: 輝線でない波長（360 nm）は使えない', !with_('calib', { calA: 360, calB: 579.066 }));
  ok('calib: 同じ線を 2 回は使えない', !with_('calib', { calA: 579.066, calB: 579.066 }));
  ok('calib: 読みのばらつきを小さく見積もるのは反則', !with_('calib', { calA: 404.656, calB: 579.066, calsig: 0.01 }));
  ok('calib: 見る波長を範囲の中に変えるのは反則', !with_('calib', { calA: 435.833, calB: 546.074, caltgt: 500 }));
  ok('defect: 976 nm・1,064 nm は通る（9.02 W）', with_('defect', { signm: 1064 }));
  ok('defect: 976 nm・1,075 nm は熱 10.1 W で落ちる', !with_('defect', { signm: 1075 }));
  ok('defect: 1,062 nm は用途の範囲の外', !with_('defect', { signm: 1062 }));
  ok('defect: 915 nm 励起は熱 16.9 W で落ちる', !with_('defect', { pumpnm: 915 }));
  ok('defect: 吸収帯でない 950 nm は落ちる', !with_('defect', { pumpnm: 950, signm: 1064 }));
  ok('defect: 出力を下げて熱を減らすのは反則', !with_('defect', { pumpnm: 915, pout: 50 }));
  ok('bright: コア 180 µm・NA 0.22 でも通る（1.23 mW）', with_('bright', { fcore: 180 }));
  ok('bright: コア 160 µm は 0.97 mW で落ちる', !with_('bright', { fcore: 160 }));
  ok('bright: NA 0.17 は 0.91 mW で落ちる', !with_('bright', { fna: 0.17 }));
  ok('bright: NA 0.18 なら通る（1.02 mW）', with_('bright', { fna: 0.18 }));
  ok('bright: コア 250 µm は標準品の上限破り', !with_('bright', { fcore: 250 }));
  ok('bright: NA 0.3 は上限破り', !with_('bright', { fna: 0.3 }));
  ok('bright: LED を 10 W にするのは反則', !with_('bright', { ledP: 10, fcore: 100 }));
  ok('bright: 発光面積を変えるのは反則', !with_('bright', { ledA: 0.5 }));
});

report();
