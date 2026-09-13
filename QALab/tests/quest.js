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

  /* Peck: 槽の上限破りは落ちる、湿度が足りないと落ちる、Ea を盛るのは反則 */
  const p1 = Object.assign({}, A.get('peck').design(), { ths: 110 });
  ok('peck: 110℃ は槽の上限破りで落ちる', !Q.grade('peck', { design: p1 }).ok);
  const p2 = Object.assign({}, A.get('peck').design(), { rhs: 70 });
  ok('peck: 70%RH（1,393h）では落ちる', !Q.grade('peck', { design: p2 }).ok);
  const p3 = Object.assign({}, A.get('peck').design(), { eah: 1.1 });
  ok('peck: Ea を盛るのは反則', !Q.grade('peck', { design: p3 }).ok);

  /* C-M: ΔT 不足と上限破りとべき盛り */
  const m1 = Object.assign({}, A.get('cm').design(), { dts: 100 });
  ok('cm: ΔT 100 K（329回）では落ちる', !Q.grade('cm', { design: m1 }).ok);
  const m2 = Object.assign({}, A.get('cm').design(), { dts: 200 });
  ok('cm: ΔT 200 K は槽の上限破りで落ちる', !Q.grade('cm', { design: m2 }).ok);
  const m3 = Object.assign({}, A.get('cm').design(), { ncm: 4 });
  ok('cm: べきを盛るのは反則', !Q.grade('cm', { design: m3 }).ok);

  /* HAST: 加圧槽でも足りない温度は落ち、上限破りも落ちる */
  const h1 = Object.assign({}, A.get('hast').design(), { ths: 110 });
  ok('hast: 110℃（146h）では落ちる', !Q.grade('hast', { design: h1 }).ok);
  const h2 = Object.assign({}, A.get('hast').design(), { ths: 150 });
  ok('hast: 150℃ は槽の上限破りで落ちる', !Q.grade('hast', { design: h2 }).ok);
  ok('hast: peck のお手本（85/85）では落ちる', !Q.grade('hast', { design: A.get('peck').design() }).ok);
  ok('peck: hast のお手本（130℃）は 85℃ の槽に入らない', !Q.grade('peck', { design: A.get('hast').design() }).ok);

  /* GR&R: 繰り返しが太いと落ち、再現性を都合よく消すのは反則 */
  const g1 = Object.assign({}, A.get('grr').design(), { srpt: 0.01 });
  ok('grr: σrpt 0.01（11.7%）は落ちる', !Q.grade('grr', { design: g1 }).ok);
  const g2 = Object.assign({}, A.get('grr').design(), { srpd: 0.001 });
  ok('grr: 再現性を都合よく消すのは反則', !Q.grade('grr', { design: g2 }).ok);
  const g3 = Object.assign({}, A.get('grr').design(), { tol: 1 });
  ok('grr: 公差を広げてごまかすのは反則', !Q.grade('grr', { design: g3 }).ok);

  /* 管理図: 限界の両側（狭いと空振り・広いと見逃し）と、群を大きくする反則 */
  const s1 = Object.assign({}, A.get('spc').design(), { klim: 2.5 });
  ok('spc: k = 2.5 は空振り（ARL₀ 81）で落ちる', !Q.grade('spc', { design: s1 }).ok);
  const s2 = Object.assign({}, A.get('spc').design(), { klim: 3.5 });
  ok('spc: k = 3.5 は見逃し（ARL₁ 約 10）で落ちる', !Q.grade('spc', { design: s2 }).ok);
  const s3 = Object.assign({}, A.get('spc').design(), { ngrp: 20, klim: 3.5 });
  ok('spc: 群を大きくして逃げるのは反則', !Q.grade('spc', { design: s3 }).ok);
  ok('spc: 窓の端 k = 3.15 は通る', Q.grade('spc', { design: Object.assign({}, A.get('spc').design(), { klim: 3.15 }) }).ok);

  /* 不確かさ: 支配項を放っておくと落ち、平均が足りないと落ち、校正の上限破りと固定破りは反則 */
  const u1 = Object.assign({}, A.get('gum').design(), { ucal: 2, nrep: 100 });
  ok('gum: 校正 2% のまま 100 回平均しても落ちる（支配項）', !Q.grade('gum', { design: u1 }).ok);
  const u2 = Object.assign({}, A.get('gum').design(), { nrep: 1 });
  ok('gum: 最良の校正でも 1 回では落ちる', !Q.grade('gum', { design: u2 }).ok);
  const u3 = Object.assign({}, A.get('gum').design(), { nrep: 3 });
  ok('gum: 3 回（U 1.31%）は落ちる', !Q.grade('gum', { design: u3 }).ok);
  ok('gum: 4 回（U 1.28%）は通る', Q.grade('gum', { design: Object.assign({}, A.get('gum').design(), { nrep: 4 }) }).ok);
  const u4 = Object.assign({}, A.get('gum').design(), { ucal: 0.5 });
  ok('gum: 買えない校正は上限破りで落ちる', !Q.grade('gum', { design: u4 }).ok);
  const u5 = Object.assign({}, A.get('gum').design(), { resd: 0.05 });
  ok('gum: 分解能を都合よく変えるのは反則', !Q.grade('gum', { design: u5 }).ok);
});

report();
