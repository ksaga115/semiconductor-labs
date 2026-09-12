/* 課題の検査 ― お手本で通る／外れた読みが通らない
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, ok, report } = require('./harness.js');
const { CL } = load();
const Q = CL.quest, A = CL.answer, M = CL.char;

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 9);
  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: 重複しない`, !seen.has(q.id)); seen.add(q.id);
    ok(`${q.id}: 説明・理由・ヒント`, q.desc.length > 10 && q.why.length > 20 && q.hint.length > 5);
    ok(`${q.id}: 章がある`, !!Q.chapterOf(q));
    ok(`${q.id}: お手本がある`, !!A.get(q.id));
    ok(`${q.id}: measure 型`, q.kind === 'measure');
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
  Q.LIST.forEach((q) => ok(`${q.id}: 白紙の答案では通らない`, !Q.grade(q.id, base).ok));
  Q.LIST.forEach((q) => {
    const others = Q.LIST.filter((o) => o.id !== q.id)
      .filter((o) => Q.grade(q.id, { design: A.get(o.id).design() }).ok).length;
    ok(`${q.id}: 他の課題のお手本の全部では通らない`, others < Q.LIST.length - 1);
  });

  /* 許容の外はきちんと落ちる（採点が緩すぎない） */
  const t1 = Object.assign({}, A.get('dn').design(), { nfit: 1.5 });
  ok('dn: n=1.5（+0.14）は落ちる', !Q.grade('dn', { design: t1 }).ok);
  const t2 = Object.assign({}, A.get('dis').design(), { isfit: 1e-12 });
  ok('dis: Is を 5 倍外すと落ちる', !Q.grade('dis', { design: t2 }).ok);
  const t3 = Object.assign({}, A.get('drs').design(), { rsfit: 7 });
  ok('drs: Rs=7Ω（+49%）は落ちる', !Q.grade('drs', { design: t3 }).ok);
  const t4 = Object.assign({}, A.get('mvth').design(), { vthfit: 0.57 });
  ok('mvth: 裾を混ぜて低く出した 0.57 は落ちる', !Q.grade('mvth', { design: t4 }).ok);
  const t5 = Object.assign({}, A.get('mk').design(), { kwlfit: 4e-4 });
  ok('mk: 25% 外れは落ちる', !Q.grade('mk', { design: t5 }).ok);
  const t6 = Object.assign({}, A.get('mss').design(), { ssfit: 60 });
  ok('mss: 理想値 60 と答えると落ちる（実測は 92）', !Q.grade('mss', { design: t6 }).ok);
  const t7 = Object.assign({}, A.get('ctox').design(), { toxfit: 5.0 });
  ok('ctox: 5.0nm（+0.8）は落ちる', !Q.grade('ctox', { design: t7 }).ok);
  const t8 = Object.assign({}, A.get('cna').design(), { nafit: 1e18 });
  ok('cna: 3.3 倍外れは落ちる', !Q.grade('cna', { design: t8 }).ok);
  const t9 = Object.assign({}, A.get('cvfb').design(), { vfbfit: -0.6 });
  ok('cvfb: −0.6V（+0.3）は落ちる', !Q.grade('cvfb', { design: t9 }).ok);

  /* 単位の取り違えの定番も落ちる */
  const u1 = Object.assign({}, A.get('ctox').design(), { toxfit: 42 });
  ok('ctox: Å と nm の取り違え（42）は落ちる', !Q.grade('ctox', { design: u1 }).ok);
  const u2 = Object.assign({}, A.get('mk').design(), { kwlfit: 1.6e-5 });
  ok('mk: Vd で割り忘れた傾きそのままは落ちる', !Q.grade('mk', { design: u2 }).ok);
});

report();
