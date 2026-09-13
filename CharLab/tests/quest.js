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

  /* 第4章 ― 定番の読み違いが落ちる */
  const g = (id, patch) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), patch) }).ok;
  ok('teg: 300 K の Eg 1.1245 と答えると落ちる', !g('teg', { egfit: 1.1245 }));
  ok('teg: T³ で割り忘れた 1.284 は落ちる', !g('teg', { egfit: 1.284 }));
  ok('teg: Varshni の 0 K の値 1.17 も落ちる（接線の切片とは違う）', !g('teg', { egfit: 1.17 }));
  ok('teg: 1.22 は通る（許容の中）', g('teg', { egfit: 1.22 }));
  ok('cvn: N1 を 1.5 倍外すと落ちる', !g('cvn', { n1fit: 1.5e16 }));
  ok('cvn: 深い点で引いた 3×10¹⁶ は落ちる', !g('cvn', { n1fit: 3e16 }));
  ok('cvn: Vbi 0.6 V は落ちる', !g('cvn', { vbifit: 0.6 }));
  ok('cvx: 0 V の W（0.34 µm）を段と読むと落ちる', !g('cvx', { x1fit: 0.34 }));
  ok('cvx: 段をまたぐ組の 1.17×10¹⁶ を N2 と読むと落ちる', !g('cvx', { n2fit: 1.166e16 }));
  ok('cvx: 0.58 µm は通る（許容の中）', g('cvx', { x1fit: 0.58 }));
  ok('rec: Is2 を 2 倍外すと落ちる', !g('rec', { is2fit: 4e-9 }));
  ok('rec: Is2 を引き忘れた Is1（1.26 倍）は落ちる', !g('rec', { is1fit: 1.264e-14 }));
  ok('rec: 引き忘れから出した Vx 0.619 は落ちる', !g('rec', { vxfit: 0.619 }));
});

report();
