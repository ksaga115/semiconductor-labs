/* 課題の検査 ― お手本で通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, report } = require('./harness.js');
const { QA } = load();
const Q = QA.quest, A = QA.answer, M = QA.qa;

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 8);
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
  const c1 = Object.assign({}, A.get('mttf').design(), { nser: 10 });
  ok('mttf: 直列数を勝手に減らすのは反則', !Q.grade('mttf', { design: c1 }).ok);
  const c2 = Object.assign({}, A.get('accel').design(), { ea: 1.2 });
  ok('accel: Ea を勝手に盛るのは反則', !Q.grade('accel', { design: c2 }).ok);
  const c3 = Object.assign({}, A.get('tec').design(), { qload: 0.1 });
  ok('tec: 負荷を勝手に減らすのは反則', !Q.grade('tec', { design: c3 }).ok);
  const c4 = Object.assign({}, A.get('cpk').design(), { tol: 1 });
  ok('cpk: 規格を勝手に広げるのは反則', !Q.grade('cpk', { design: c4 }).ok);

  /* トレードオフの反対側で落ちる */
  const t1 = Object.assign({}, A.get('tec').design(), { dtc: 60 });
  ok('tec: ΔT を欲張ると吸熱で落ちる', !Q.grade('tec', { design: t1 }).ok);
  const t2 = Object.assign({}, A.get('tec').design(), { dtc: 40 });
  ok('tec: ΔT が浅いと温度差で落ちる', !Q.grade('tec', { design: t2 }).ok);
  const a1 = Object.assign({}, A.get('accel').design(), { tstr: 125 });
  ok('accel: 125℃（AF78・1123h）では届かない', !Q.grade('accel', { design: a1 }).ok);
  const th1 = Object.assign({}, A.get('theta').design(), { thsa: 25 });
  ok('theta: 放熱器が小さいと Tj で落ちる', !Q.grade('theta', { design: th1 }).ok);
});

report();
