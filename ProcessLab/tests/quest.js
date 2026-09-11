/* 課題の検査 ― お手本が通る／通ってはいけないものが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, eq, report } = require('./harness.js');
const { PL } = load();
const Q = PL.quest, ANS = PL.answer, R = PL.recipe;

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 12);
  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: 重複しない`, !seen.has(q.id)); seen.add(q.id);
    ok(`${q.id}: 説明・理由・ヒントがある`, q.desc.length > 10 && q.why.length > 20 && q.hint.length > 5);
    ok(`${q.id}: 章がある`, Q.chapterOf(q) !== null);
    ok(`${q.id}: お手本がある`, !!ANS.get(q.id));
    ok(`${q.id}: お手本に一言`, !!(ANS.get(q.id) || {}).note);
  });
  ANS.ids().forEach((id) => ok(`お手本 ${id} に課題がある`, !!Q.byId(id)));
});

T('お手本', () => {
  Q.LIST.forEach((q) => {
    const r = Q.grade(q.id, ANS.make(q.id));
    const why = (r.rows || []).filter((x) => !x.ok).map((x) => `${x.label}=${x.value}（${x.want}）`).join(' / ');
    ok(`${q.id} のお手本が通る` + (r.ok ? '' : '　― ' + why), r.ok);
  });
});

T('落ちるべきもの', () => {
  const empty = R.create({ type: 'p', N: 1e15 });
  Q.LIST.forEach((q) => {
    const r = Q.grade(q.id, empty);
    ok(`${q.id}: 何もしないウェーハでは通らない`, !r.ok);
    ok(`${q.id}: 何もしなくても例外を投げない`, !r.error && !(r.rows || []).some((x) => /採点できません/.test(x.label)));
  });

  /* 他の課題のお手本で通る割合（緩すぎる課題が無いか） */
  let n = 0, pass = 0;
  const M = {};
  Q.LIST.forEach((q) => {
    M[q.id] = {};
    Q.LIST.forEach((o) => {
      const g = Q.grade(q.id, ANS.make(o.id)).ok;
      M[q.id][o.id] = g;
      if (o.id !== q.id) { n++; if (g) pass++; }
    });
  });
  ok(`他のお手本で通る割合が低い（${pass}/${n}）`, pass / n < 0.25);
  Q.LIST.forEach((q) => ok(`${q.id}: 少なくとも1つのお手本では落ちる`, Q.LIST.some((o) => o.id !== q.id && !M[q.id][o.id])));

  /* 構造の前提 ― 成り立つことだけ課す（SemiLab で2度間違えたので） */
  const hasWetOrDry = (rc) => rc.steps.some((s) => s.t === 'heat' && s.amb !== 'N2');
  Q.LIST.filter((q) => ['dryox', 'wetox', 'locos', 'mos', 'cmos'].indexOf(q.id) >= 0).forEach((q) => {
    const leak = Q.LIST.filter((o) => !hasWetOrDry(ANS.make(o.id)) && M[q.id][o.id]).map((o) => o.id);
    ok(`${q.id}: 酸化しないレシピでは通らない` + (leak.length ? `（${leak}）` : ''), leak.length === 0);
  });
  const hasMask = (rc) => rc.steps.some((s) => s.t === 'mask');
  Q.LIST.filter((q) => ['locos', 'open', 'guard', 'well', 'cmos'].indexOf(q.id) >= 0).forEach((q) => {
    const leak = Q.LIST.filter((o) => !hasMask(ANS.make(o.id)) && M[q.id][o.id]).map((o) => o.id);
    ok(`${q.id}: マスクを使わないレシピでは通らない` + (leak.length ? `（${leak}）` : ''), leak.length === 0);
  });

  /* 盾の課題: 既定の厚み（1µm）のレジストでは通らない */
  const thin = ANS.make('guard');
  thin.steps[0].nm = 1000;
  ok('guard: レジスト 1µm では通らない', !Q.grade('guard', thin).ok);
  /* 時間制限: ドライで同じ厚みを作っても wetox は通らない */
  const slow = R.create({ type: 'p', N: 1e15 });
  slow.steps = [{ t: 'heat', C: 1200, min: 600, amb: 'dry' }];
  ok('wetox: 時間をかけたドライ酸化では通らない', !Q.grade('wetox', slow).ok);
});

report();
