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
});

report();
