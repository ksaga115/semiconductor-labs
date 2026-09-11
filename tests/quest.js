/* 課題の検査
 *
 * 一番大事なのは **お手本が全部通ること**。
 * 画面の「お手本を見る」と、この検査は同じ answer.js を使う ―
 * だから判定を変えたときにお手本が置き去りにならない。
 *
 * それだけでは足りない。**通ってはいけないものが通らない**ことも見る。
 * 空の作業台、まったく違う構造、隣の課題のお手本 ―
 * これを見ていないと「何を出しても ✓」の採点になっていても気付けない。
 *
 *   node tests/quest.js
 */
'use strict';
const { load, T, eq, ok, near, report } = require('./harness.js');
const SL = load();
const Q = SL.quest, ANS = SL.answer, ST = SL.stack;

/* ================= 1. 骨組み ================= */

T('課題の形', () => {
  ok('課題がある', Q.LIST.length >= 20);
  ok('章がある', Q.CH.length === 5);

  const seen = new Set();
  Q.LIST.forEach((q) => {
    ok(`${q.id}: id が重複していない`, !seen.has(q.id));
    seen.add(q.id);
    ok(`${q.id}: 名前がある`, typeof q.name === 'string' && q.name.length > 0);
    ok(`${q.id}: 説明がある`, typeof q.desc === 'string' && q.desc.length > 10);
    ok(`${q.id}: なぜやるかが書いてある`, typeof q.why === 'string' && q.why.length > 20);
    ok(`${q.id}: ヒントがある`, typeof q.hint === 'string' && q.hint.length > 5);
    ok(`${q.id}: 章がある`, Q.chapterOf(q) !== null);
    ok(`${q.id}: 採点できる`, typeof q.check === 'function');
    ok(`${q.id}: お手本がある`, ANS.get(q.id) !== null);
    ok(`${q.id}: お手本に一言ついている`, (ANS.get(q.id) || {}).note);
  });

  /* お手本だけあって課題が無いもの（消し忘れ）も落とす */
  ANS.ids().forEach((id) => ok(`お手本 ${id} に対応する課題がある`, Q.byId(id) !== null));

  /* 章は順に並んでいて、どの章にも課題がある */
  Q.CH.forEach((ch) => {
    ok(`第${ch.id}章に課題がある`, Q.LIST.some((q) => q.ch === ch.id));
  });
});

/* ================= 2. お手本で通ること ================= */

T('お手本', () => {
  Q.LIST.forEach((q) => {
    const a = ANS.get(q.id);
    const r = Q.grade(q.id, a.make(), { ar: a.ar });
    if (!r.ok) {
      const why = (r.rows || []).filter((x) => !x.ok)
        .map((x) => `${x.label}=${x.value}（欲しい: ${x.want}）`).join(' / ');
      ok(`${q.id} のお手本が通る　― ${why}`, false);
    } else {
      ok(`${q.id} のお手本が通る`, true);
    }
    ok(`${q.id} の採点は理由を返す`, Array.isArray(r.rows) && r.rows.length > 0);
  });
});

/* ================= 3. 通ってはいけないもの ================= */

T('落ちるべきもの', () => {
  /* 空の作業台はどの課題も通らない */
  Q.LIST.forEach((q) => {
    const r = Q.grade(q.id, ST.create(), {});
    ok(`${q.id}: 空の作業台では通らない`, !r.ok);
    ok(`${q.id}: 空でも例外を投げない`, !r.error);
  });

  /* ただの一片（n 型 1e16）で通ってよいのは第1章の ntype だけ */
  const one = ST.create();
  ST.addLayer(one, 'si', 1000, { nd: 1e16 });
  Q.LIST.forEach((q) => {
    const r = Q.grade(q.id, one, {});
    if (q.id === 'ntype') ok('ntype は一片で通る', r.ok);
    else ok(`${q.id}: ただの一片では通らない`, !r.ok);
  });

  /* --- ここから「課題ごとに違うことを見ているか」の検査 ---
   *
   * 【二度、間違った不変条件を書いた。両方とも「物理のほうが正しい」で外した】
   *
   * 1度目「どの課題も、他のお手本の半分以上では落ちること」
   *   → 「はじめての接合」「整流する」が落ちた。後の章のお手本はどれも
   *      pn 接合なのだから、接合はできているし整流もする。当たり前だった。
   *
   * 2度目「前の章のお手本では通らないこと」
   *   → 「整流する」「短基底」「青を拾う」などが落ちた。
   *      第2章で作った逆バイアスのダイオードは、そのまま整流するし、
   *      p⁺ が薄ければ 400nm も拾う。**章が上がっても、必要な構造が
   *      増えるとは限らない** ― 増えるのは「何を見るか」のほう。
   *      これを通すために閾値をいじるのは、物理ではなく採点を歪める。
   *
   * 課すべきは、本当に成り立つことだけ:
   *   ・全体として、他のお手本で通る割合が低い（緩すぎる課題が無い）
   *   ・どの課題も、少なくとも1つのお手本では落ちる（何かは見分けている）
   *   ・**構造の前提は必ず要る** ― MOS の課題は酸化膜が無ければ落ちる、
   *     pin の課題は真性層が無ければ落ちる、接合が要る課題は接合が無ければ落ちる。
   */
  const answers = Q.LIST.map((q) => {
    const a = ANS.get(q.id);
    const st = a.make();
    return {
      id: q.id, ch: q.ch, st: st, ar: a.ar,
      hasOx: st.layers.some((L) => L.mat === 'ox'),
      hasI: st.layers.some((L) => L.mat === 'si' && L.na === 0 && L.nd === 0),
      hasJn: SL.dev.sides(st) !== null
    };
  });
  /* 総当たりは重いので1回だけ作って使い回す */
  const M = {};
  Q.LIST.forEach((q) => {
    M[q.id] = {};
    answers.forEach((a) => { M[q.id][a.id] = Q.grade(q.id, a.st, { ar: a.ar }).ok; });
  });
  const self = (id) => answers.filter((a) => a.id === id)[0];

  let crossPass = 0, crossTotal = 0;
  Q.LIST.forEach((q) => {
    answers.forEach((a) => {
      if (a.id === q.id) return;
      crossTotal++;
      if (M[q.id][a.id]) crossPass++;
    });
  });
  ok(`他の課題のお手本で通る割合が低い（${crossPass}/${crossTotal}）`, crossPass / crossTotal < 0.25);

  Q.LIST.forEach((q) => {
    const me = self(q.id);

    /* 何かは見分けている */
    ok(`${q.id}: 少なくとも1つのお手本では落ちる`,
       answers.some((a) => a.id !== q.id && !M[q.id][a.id]));

    /* 構造の前提 ― お手本が要るものは、無い構造では必ず落ちる */
    if (me.hasOx) {
      const leak = answers.filter((a) => !a.hasOx && M[q.id][a.id]).map((a) => a.id);
      ok(`${q.id}: 酸化膜が無ければ落ちる` + (leak.length ? `（通った: ${leak.join(',')}）` : ''),
         leak.length === 0);
    }
    if (me.hasI) {
      const leak = answers.filter((a) => !a.hasI && M[q.id][a.id]).map((a) => a.id);
      ok(`${q.id}: 真性層が無ければ落ちる` + (leak.length ? `（通った: ${leak.join(',')}）` : ''),
         leak.length === 0);
    }
    if (me.hasJn && !me.hasOx) {
      const leak = answers.filter((a) => !a.hasJn && M[q.id][a.id]).map((a) => a.id);
      ok(`${q.id}: 接合が無ければ落ちる` + (leak.length ? `（通った: ${leak.join(',')}）` : ''),
         leak.length === 0);
    }
  });

  /* 第5章（MOS）は、第1〜4章のどのお手本でも通らない ―
   * こちらは「酸化膜が要る」から成り立つ、確かめる価値のある向き */
  Q.LIST.filter((q) => q.ch === 5).forEach((q) => {
    const leak = answers.filter((a) => a.ch < 5 && M[q.id][a.id]).map((a) => a.id);
    ok(`${q.id}: 第4章までのお手本では通らない` + (leak.length ? `（通った: ${leak.join(',')}）` : ''),
       leak.length === 0);
  });
});

/* ================= 4. 判定の中身 ================= */

T('判定の理由', () => {
  /* 通ったときは全部の行が ok、落ちたときはどれかが ok でない */
  Q.LIST.forEach((q) => {
    const a = ANS.get(q.id);
    const r = Q.grade(q.id, a.make(), { ar: a.ar });
    if (r.ok) {
      const bad = (r.rows || []).filter((x) => !x.ok && x.want && x.want !== '');
      /* 「（勝手に決まる）」のような説明行は want に判定の言葉が無い */
      ok(`${q.id}: 通ったのに ✗ の行が残っていない`, bad.length === 0);
    }
  });

  /* 温度を上げても採点が例外を投げない（ni が跳ねる） */
  Q.LIST.forEach((q) => {
    const a = ANS.get(q.id);
    const r = Q.grade(q.id, a.make(), { T: 400, ar: a.ar });
    ok(`${q.id}: 400K でも例外を投げない`, !r.error);
  });
});

/* ================= 5. 積み上がり ================= */

T('積み上がり', () => {
  /* 章が進むほど層が増える傾向にある（そうでなければ「積み上げ」になっていない） */
  const avg = Q.CH.map((ch) => {
    const qs = Q.LIST.filter((q) => q.ch === ch.id);
    const n = qs.map((q) => ANS.make(q.id).layers.length);
    return n.reduce((a, b) => a + b, 0) / n.length;
  });
  ok('第1章より第2章のほうが層が多い', avg[1] > avg[0]);
  ok('第4章は3層以上を使う', avg[3] >= 2.8);

  /* 最後の課題は NandLab に着地する ― MOS であること */
  const last = Q.LIST[Q.LIST.length - 1];
  eq('最後の課題は nand', last.id, 'nand');
  const mm = SL.dev.mos(ANS.make('nand'), 300);
  ok('nand のお手本は MOS になっている', mm !== null);
  ok('nand のお手本は nMOS', mm.pType);
  ok('nand の Vth は使える範囲', mm.vth > 0.3 && mm.vth < 0.7);
});

report();
