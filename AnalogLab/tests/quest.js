/* 課題の検査 ― お手本で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, report } = require('./harness.js');
const { AN } = load();
const Q = AN.quest, A = AN.answer, M = AN.analog;

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
  const base = { design: M.defaults() };
  Q.LIST.forEach((q) => ok(`${q.id}: 既定の設計では通らない`, !Q.grade(q.id, base).ok));
  Q.LIST.forEach((q) => {
    const others = Q.LIST.filter((o) => o.id !== q.id)
      .filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の設計のお手本の全部では通らない`, others < Q.LIST.length - 1);
  });

  /* 条件固定を破ったら、数字が届いていても落ちる */
  const c1 = Object.assign({}, A.get('bias').design(), { idua: 50, wl: 12.5 });
  ok('bias: 電流を勝手に下げるのは反則', !Q.grade('bias', { design: c1 }).ok);
  const c2 = Object.assign({}, A.get('gbw').design(), { clpf: 0.1 });
  ok('gbw: CL を勝手に下げるのは反則', !Q.grade('gbw', { design: c2 }).ok);
  const c3 = Object.assign({}, A.get('gain2').design(), { lam: 0.02 });
  ok('gain2: λ を勝手に下げるのは反則', !Q.grade('gain2', { design: c3 }).ok);
  const c4 = Object.assign({}, A.get('charge').design(), { qe: 100000 });
  ok('charge: 電荷を勝手に増やすのは反則', !Q.grade('charge', { design: c4 }).ok);

  /* トレードオフの反対側で落ちる */
  const g1 = Object.assign({}, A.get('gain').design(), { rdk: 100 });
  ok('gain: RD を上げすぎると動作点が沈んで落ちる', !Q.grade('gain', { design: g1 }).ok);
  const t1 = Object.assign({}, A.get('tia').design(), { rfk: 20 });
  ok('tia: Rf を上げると静かだが帯域で落ちる', !Q.grade('tia', { design: t1 }).ok);
  const t2 = Object.assign({}, A.get('tia').design(), { rfk: 4 });
  ok('tia: Rf を下げると速いが雑音で落ちる', !Q.grade('tia', { design: t2 }).ok);
  const n1 = Object.assign({}, A.get('lownoise').design(), { idua: 1000 });
  ok('lownoise: 電流で殴ると電力で落ちる', !Q.grade('lownoise', { design: n1 }).ok);
  const d1 = Object.assign({}, A.get('diff').design(), { rdk: 30 });
  ok('diff: RD を上げすぎると動作点が沈んで落ちる', !Q.grade('diff', { design: d1 }).ok);
});

report();
