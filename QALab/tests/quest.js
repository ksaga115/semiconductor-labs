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

  const w = (id, patch) => Q.grade(id, { design: Object.assign({}, A.get(id).design(), patch) }).ok;

  /* Norris-Landzberg: 回数と日数の窓の両側、槽の限界、定数を盛る反則 */
  ok('nl: 24 回/日は 8.1 日で落ちる', !w('nl', { cfs: 24 }));
  ok('nl: 60 回/日は 263 回で落ちる', !w('nl', { cfs: 60 }));
  ok('nl: 窓の端 30 回/日は通る', w('nl', { cfs: 30 }));
  ok('nl: 窓の端 51 回/日は通る', w('nl', { cfs: 51 }));
  ok('nl: 80 回/日は槽の限界破り', !w('nl', { cfs: 80, nnl: 1.9 }));
  ok('nl: ΔT のべきを盛るのは反則', !w('nl', { nnl: 2.5 }));
  ok('nl: 試験の最高温度を変えるのは反則', !w('nl', { tms: 150 }));
  ok('nl: cm のお手本（24 回/日）では日数で落ちる', !Q.grade('nl', { design: A.get('cm').design() }).ok);

  /* ndc: 公差比で合格の物差しでも落ちる・分解能の限界・部品のばらつきを盛る反則 */
  ok('ndc: 繰り返し 0.007（公差比 9.2%）でも ndc 4 で落ちる', !w('ndc', { srpt: 0.007 }));
  ok('ndc: grr のお手本では落ちる', !Q.grade('ndc', { design: A.get('grr').design() }).ok);
  ok('ndc: 窓の端 0.0055 は通る', w('ndc', { srpt: 0.0055 }));
  ok('ndc: 0.002 は器具の分解能の限界破り', !w('ndc', { srpt: 0.002 }));
  ok('ndc: 部品のばらつきを盛るのは反則', !w('ndc', { spv: 0.1 }));
  ok('ndc: 再現性を消すのは反則', !w('ndc', { srpd: 0.001 }));

  /* OC: n の窓の両側・c を変えると予算破り・危険を緩める反則 */
  ok('oc: n = 131 は β で落ちる', !w('oc', { nsmp: 131 }));
  ok('oc: n = 138 は α で落ちる', !w('oc', { nsmp: 138 }));
  ok('oc: 窓の端 n = 137 は通る', w('oc', { nsmp: 137 }));
  ok('oc: c = 2 はどの n でも落ちる（n = 100）', !w('oc', { cacc: 2, nsmp: 100 }));
  ok('oc: c = 4・n = 158 は両立するが予算破り', !w('oc', { cacc: 4, nsmp: 158 }));
  ok('oc: β を 20% に緩めるのは反則', !w('oc', { bet: 20, nsmp: 100 }));
  ok('oc: LTPD を 10% に緩めるのは反則', !w('oc', { ltpd: 10, nsmp: 80, cacc: 2 }));

  /* TM-21: 試験時間の窓の両側・試料の数で上限の倍率が変わる・劣化の点を盛る反則 */
  ok('tm21: 8,300 h・20 個は 49,800 h で落ちる', !w('tm21', { lmT: 8300 }));
  ok('tm21: 8,400 h・20 個は通る', w('tm21', { lmT: 8400 }));
  ok('tm21: 9,000 h でも 15 個なら 5.5 倍の 49,500 h で落ちる', !w('tm21', { lmN: 15 }));
  ok('tm21: 15 個なら 9,100 h で通る', w('tm21', { lmN: 15, lmT: 9100 }));
  ok('tm21: 12,000 h は予算破り', !w('tm21', { lmT: 12000 }));
  ok('tm21: 9 個は TM-21 の外', !w('tm21', { lmN: 9, lmT: 10000 }));
  ok('tm21: 劣化の点を盛るのは反則', !w('tm21', { lmp2: 98.5, lmT: 6000 }));
  /* 修理のある並列: MTTR の窓の両側と λ の反則 */
  ok('repair: MTTR 62 h は通る', w('repair', { mttr: 62 }));
  ok('repair: MTTR 64 h は落ちる', !w('repair', { mttr: 64 }));
  ok('repair: MTTR 5 h は手配の限界破り', !w('repair', { mttr: 5 }));
  ok('repair: λ を盛るのは反則', !w('repair', { lamr: 1e-5, mttr: 168 }));
  /* 多数決: 周期の窓の両側 */
  ok('vote: 0.80 年は通る', w('vote', { trep: 0.8 }));
  ok('vote: 0.85 年は 0.95 を割る', !w('vote', { trep: 0.85 }));
  ok('vote: 0.4 年は交換の手間の限界破り', !w('vote', { trep: 0.4 }));
  ok('vote: λ を盛るのは反則', !w('vote', { lamr: 1e-5, trep: 1.5 }));
  /* 要因計画: 回数の窓の両側と σ の反則 */
  ok('doe: 3 回ずつは 74% で落ちる', !w('doe', { drep: 3 }));
  ok('doe: 5 回ずつ（N = 20）は通る', w('doe', { drep: 5 }));
  ok('doe: 6 回ずつ（N = 24）は予算破り', !w('doe', { drep: 6 }));
  ok('doe: σ を小さく仮定するのは反則', !w('doe', { dsig: 1, drep: 1 }));
  /* 第7章: 再試験の個数・めがねの OD・平均の時間の窓の両側と反則 */
  ok('fitci: 520 個は 50 FIT に届かない', !w('fitci', { nfa: 520 }));
  ok('fitci: 521 個は通る', w('fitci', { nfa: 521 }));
  ok('fitci: 1,000 個は通る', w('fitci', { nfa: 1000 }));
  ok('fitci: 1,001 個は予算破り', !w('fitci', { nfa: 1001 }));
  ok('fitci: 故障 0 個で数えるのは反則', !w('fitci', { rfa: 0, nfa: 300 }));
  ok('fitci: 信頼水準を 50% に下げるのは反則', !w('fitci', { cla: 50, nfa: 450 }));
  ok('fitci: 試験温度を上げて AF を稼ぐのは反則', !w('fitci', { tstr: 150, nfa: 300 }));
  ok('odsel: OD 1.99 は 1 mW を超える', !w('odsel', { od: 1.99 }));
  ok('odsel: OD 2 は通る', w('odsel', { od: 2 }));
  ok('odsel: OD 3 は通る', w('odsel', { od: 3 }));
  ok('odsel: OD 3.01 は暗すぎる', !w('odsel', { od: 3.01 }));
  ok('odsel: 上限を 10 mW に緩めるのは反則', !w('odsel', { plim: 10, od: 1.5 }));
  ok('allan: 68 s は白色雑音が残る', !w('allan', { tavg: 68 }));
  ok('allan: 70 s は通る', w('allan', { tavg: 70 }));
  ok('allan: 139 s は通る', w('allan', { tavg: 139 }));
  ok('allan: 141 s はドリフトが積もる', !w('allan', { tavg: 141 }));
  ok('allan: ドリフトを小さく仮定するのは反則', !w('allan', { drf: 0.0005, tavg: 150 }));
});

report();
