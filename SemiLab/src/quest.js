/* 課題と採点
 *
 * 【採点の原則 ― NandLab / CoinLab と同じ】
 *
 *   正解の形は決めない。**振る舞いが合っているかだけ**を機械が確かめる。
 *   お手本と層の並びを見比べる採点は絶対にしない。
 *   「濃度をいくつにしろ」ではなく「電子濃度をこの範囲にしろ」と言う。
 *   だから、そこへ辿り着く道は何本あってもよい。
 *
 * 【判定に使う値は全部ポアソンを解いて出す】
 *   ただし電流と光電流だけは dev.js / light.js のモデル（README の「境目」を参照）。
 *
 * 【許容】桁で変わる量は「何倍以内」、電圧は「何 V 以内」で見る。
 *   1e-9 のような厳密一致は使わない ― 数値解なので必ず数 % ずれる。
 *
 * ctx は重い計算を覚えておく入れ物。同じ課題の中で mesh や解を何度も作らない。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var P = SL.phys, ST = SL.stack, PS = SL.poisson, DEV = SL.dev, LIGHT = SL.light;

  /* ---- 計算を覚えておく入れ物 ---- */

  function context(st, T) {
    T = T || P.T300;
    var cache = {};
    var ctx = {
      st: st, T: T,
      mesh: function () { return cache.m || (cache.m = ST.mesh(st, T)); },
      sol: function (vl, vr) {
        var k = 'sol' + vl + '_' + vr;
        return cache[k] || (cache[k] = PS.solve(ctx.mesh(), { left: vl || 0, right: vr || 0 }));
      },
      eq: function () { return ctx.sol(0, 0); },
      diode: function () { return cache.d !== undefined ? cache.d : (cache.d = DEV.diode(st, T)); },
      mos: function () { return cache.mo !== undefined ? cache.mo : (cache.mo = DEV.mos(st, T)); },
      id: function () { return cache.id || (cache.id = DEV.identify(st)); },
      photo: function (opt, vl, vr) {
        return LIGHT.photo(st, ctx.sol(vl === undefined ? 0 : vl, vr === undefined ? 0 : vr), opt);
      },
      /* シリコンの層だけ */
      si: function () { return st.layers.filter(function (L) { return L.mat === 'si'; }); },
      /* 一番左のシリコン層の平衡でのキャリア */
      bulk: function (which) {
        var m = ctx.mesh(), s = ctx.eq();
        var i = which === 'last' ? m.n - 1 : PS.surfaceNode(m);
        return { n: s.n[i], p: s.p[i], net: m.net[i] };
      }
    };
    return ctx;
  }

  /* ---- 判定の道具 ---- */

  function within(v, want, factor) {          /* 何倍以内か */
    if (!isFinite(v) || v <= 0) return false;
    return v / want <= factor && want / v <= factor;
  }
  function near(v, want, tol) { return isFinite(v) && Math.abs(v - want) <= tol; }

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }

  function fmtE(v, d) { return (v === 0 ? '0' : v.toExponential(d === undefined ? 2 : d)); }
  function fmtUm(cm) { return (cm * 1e4).toFixed(cm * 1e4 < 1 ? 3 : 2) + ' µm'; }
  function fmtV(v) { return v.toFixed(3) + ' V'; }

  /* ---- 課題 ---- */

  var CH = [
    { id: 1, name: '第1章　一片のシリコン', lead: '不純物を入れるとキャリアが決まる。ここが全部の出発点。' },
    { id: 2, name: '第2章　接合が立つ',     lead: '濃度の違う一片を隣に置くだけで、空乏層と電界が勝手に立つ。' },
    { id: 3, name: '第3章　ダイオード',     lead: '片方向にだけ流れる。整流という働きが接合から出てくる。' },
    { id: 4, name: '第4章　光を電気にする', lead: '光子が対を作り、電界が拾う。拾えなかったぶんが感度の落ちどころ。' },
    { id: 5, name: '第5章　MOS、そして NAND の中身へ', lead: '酸化膜を挟むとスイッチになる。NandLab の原始部品はここで出来る。' }
  ];

  var LIST = [

    /* ===== 第1章 ===== */
    {
      id: 'ntype', ch: 1, name: 'n 型をつくる',
      desc: 'シリコンの一片に**ドナー**を入れて、電子が 1×10¹⁶ cm⁻³ になるようにする。',
      why: 'ドナーは電子を1個ずつ置いていく。完全に電離するので、電子濃度はほぼドナー濃度そのものになる。',
      hint: '一片を1枚置いて Nd を動かす。厚みは何でもよい。',
      check: function (ctx) {
        var b = ctx.bulk();
        var ok = within(b.n, 1e16, 1.2);
        return {
          ok: ok && b.n > b.p,
          rows: [
            row('電子 n', fmtE(b.n) + ' cm⁻³', '1.00e+16 の 1.2 倍以内', ok),
            row('正孔 p', fmtE(b.p) + ' cm⁻³', '電子より少ない', b.p < b.n),
            row('n·p', fmtE(b.n * b.p) + ' cm⁻⁶', 'ni² = ' + fmtE(P.ni(ctx.T) * P.ni(ctx.T)) + ' のはず', within(b.n * b.p, P.ni(ctx.T) * P.ni(ctx.T), 1.05))
          ]
        };
      }
    },
    {
      id: 'ptype', ch: 1, name: 'p 型をつくる',
      desc: '今度は**アクセプタ**を入れて、正孔が 1×10¹⁷ cm⁻³ の一片にする。',
      why: 'アクセプタは電子を1個ずつ受け取る。空いた席が正孔として動く。n 型と鏡写しになる。',
      hint: 'Na を 1e17 に。電子は ni²/p まで減る（1e10²/1e17 = 1e3）。',
      check: function (ctx) {
        var b = ctx.bulk();
        var ok = within(b.p, 1e17, 1.2);
        return {
          ok: ok && b.p > b.n,
          rows: [
            row('正孔 p', fmtE(b.p) + ' cm⁻³', '1.00e+17 の 1.2 倍以内', ok),
            row('電子 n', fmtE(b.n) + ' cm⁻³', 'ni²/p ≒ 1.0e+03', within(b.n, 1e3, 2)),
            row('型', b.net < 0 ? 'p 型' : 'n 型', 'p 型', b.net < 0)
          ]
        };
      }
    },
    {
      id: 'compensate', ch: 1, name: '打ち消す',
      desc: 'ドナーとアクセプタを**両方**入れて、正味 1×10¹⁵ cm⁻³ の n 型にする。ただしドナーは 1×10¹⁷ 以上入れること。',
      why: '効くのは差だけ。1e17 のドナーと 0.99e17 のアクセプタを入れても、残るのは 1e15。'
         + 'ところが**移動度は差ではなく総量で落ちる** ― 打ち消した不純物も散乱はする。ここが罠。',
      hint: 'Nd = 1.01e17、Na = 1.00e17 のように。移動度が n 型 1e15 の一片より落ちているのを確かめる。',
      check: function (ctx) {
        var b = ctx.bulk(), si = ctx.si();
        var L = si[0] || {};
        var tot = (L.na || 0) + (L.nd || 0);
        var muHere = P.muN(tot, ctx.T), muPure = P.muN(1e15, ctx.T);
        return {
          ok: within(b.n, 1e15, 1.3) && (L.nd || 0) >= 1e17 && (L.na || 0) > 0,
          rows: [
            row('電子 n', fmtE(b.n) + ' cm⁻³', '1.0e+15 の 1.3 倍以内', within(b.n, 1e15, 1.3)),
            row('ドナー Nd', fmtE(L.nd || 0), '1e17 以上', (L.nd || 0) >= 1e17),
            row('アクセプタ Na', fmtE(L.na || 0), '0 より大きい', (L.na || 0) > 0),
            row('移動度 µn', muHere.toFixed(0) + ' cm²/Vs',
                '打ち消さない 1e15 なら ' + muPure.toFixed(0) + ' ― 落ちているのが正しい', muHere < muPure * 0.9)
          ]
        };
      }
    },
    {
      id: 'resistivity', ch: 1, name: '抵抗率をあわせる',
      desc: '**1 Ω·cm** の n 型の一片を作る（誤差 10% 以内）。',
      why: 'ρ = 1/(q n µ)。µ が濃度で変わるので、濃度を10倍にしても抵抗率は 1/10 にならない。'
         + 'ウェーハを「何 Ω·cm」で買うのは、濃度そのものより測りやすいから。',
      hint: '1 Ω·cm の n 型は 5e15 あたり。行き過ぎたら µ が落ちて効きが鈍る。',
      check: function (ctx) {
        var b = ctx.bulk(), si = ctx.si(), L = si[0] || {};
        var tot = (L.na || 0) + (L.nd || 0);
        var rho = 1 / (P.Q * (b.n * P.muN(tot, ctx.T) + b.p * P.muP(tot, ctx.T)));
        return {
          ok: near(rho, 1, 0.1) && b.net > 0,
          rows: [
            row('抵抗率 ρ', rho.toFixed(4) + ' Ω·cm', '1.000 ± 0.100', near(rho, 1, 0.1)),
            row('型', b.net > 0 ? 'n 型' : 'p 型', 'n 型', b.net > 0),
            row('移動度 µn', P.muN(tot, ctx.T).toFixed(0) + ' cm²/Vs', '（濃度で決まる）', true)
          ]
        };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'junction', ch: 2, name: 'はじめての接合',
      desc: 'p 型と n 型の一片を**隣り合わせに置く**だけ。ビルトイン電位が 0.70 V 以上になるようにする。',
      why: '接合を「作る」操作は無い。濃度の違う一片が隣り合った瞬間、'
         + 'キャリアが拡散して電荷が残り、電界が立ち、それ以上流れなくなるところで止まる。それが空乏層。',
      hint: 'Vbi = Vt·ln(Na·Nd/ni²)。両方 1e16 で 0.70V あたり。',
      check: function (ctx) {
        var s = ctx.eq(), m = ctx.mesh();
        var js = ST.junctionNodes(m);
        var vbi = s.psi[m.n - 1] - s.psi[0];
        var dep = js.length ? PS.depletionByCharge(s) : null;
        return {
          ok: js.length === 1 && Math.abs(vbi) >= 0.70,
          rows: [
            row('接合の数', String(js.length), '1 個', js.length === 1),
            row('ビルトイン電位', fmtV(Math.abs(vbi)), '0.700 V 以上', Math.abs(vbi) >= 0.70),
            row('空乏層の幅', dep ? fmtUm(dep.w) : '―', '（勝手に決まる）', !!dep)
          ]
        };
      }
    },
    {
      id: 'vbi', ch: 2, name: 'ビルトイン電位を合わせる',
      desc: 'ビルトイン電位を **0.90 V**（±0.02 V）にする。',
      why: 'Vbi は濃度の積の対数。片方を10倍にしても 60mV しか上がらない。'
         + '「濃くすれば電圧が上がる」が対数でしか効かないことを、手で動かして確かめる。',
      hint: '両方 1e18 で 0.95V。少し下げる。片側だけ濃くしても同じところに行ける。',
      check: function (ctx) {
        var s = ctx.eq(), m = ctx.mesh();
        var vbi = Math.abs(s.psi[m.n - 1] - s.psi[0]);
        return {
          ok: near(vbi, 0.90, 0.02) && ST.junctionNodes(m).length === 1,
          rows: [
            row('ビルトイン電位', fmtV(vbi), '0.900 ± 0.020 V', near(vbi, 0.90, 0.02)),
            row('接合の数', String(ST.junctionNodes(m).length), '1 個', ST.junctionNodes(m).length === 1)
          ]
        };
      }
    },
    {
      id: 'onesided', ch: 2, name: '片側だけ空乏させる',
      desc: '空乏層の **95% 以上が片側**に寄った接合を作る。全体の幅は 0.3 µm 以上にすること。',
      why: '空乏層は電荷が釣り合うところまで広がる。濃いほうは少し広がるだけで済み、'
         + '薄いほうが大きく広がる。「実質どちらか片側だけが空乏する」＝片側接合で、'
         + 'フォトダイオードもMOSのソース/ドレインもこの形。',
      hint: '濃度を100倍以上つける。1e19 と 1e16 など。',
      check: function (ctx) {
        var s = ctx.eq(), m = ctx.mesh();
        if (!ST.junctionNodes(m).length) return { ok: false, rows: [row('接合', 'ない', '1 個要る', false)] };
        var d = PS.depletionByCharge(s);
        var frac = Math.max(d.wp, d.wn) / d.w;
        return {
          ok: frac >= 0.95 && d.w >= 0.3e-4,
          rows: [
            row('広いほうの割合', (frac * 100).toFixed(1) + ' %', '95 % 以上', frac >= 0.95),
            row('全体の幅', fmtUm(d.w), '0.30 µm 以上', d.w >= 0.3e-4),
            row('p 側 / n 側', fmtUm(d.wp) + ' / ' + fmtUm(d.wn), '（片方に寄る）', true)
          ]
        };
      }
    },
    {
      id: 'reverse', ch: 2, name: '逆バイアスで伸ばす',
      desc: '−5 V の逆バイアスで、空乏層を **2.0 µm 以上**に広げる。層はその厚みを持っていること。',
      why: '逆バイアスは接合にかかる電圧を増やす。W は電圧の平方根で伸びる ―'
         + '4倍の電圧で2倍の幅。フォトダイオードに逆バイアスをかけるのは、これで拾える範囲を広げるため。',
      hint: '薄いほうの濃度を下げる（1e15 以下）。層の厚みも 3µm 以上要る。',
      check: function (ctx) {
        var m = ctx.mesh();
        if (!ST.junctionNodes(m).length) return { ok: false, rows: [row('接合', 'ない', '1 個要る', false)] };
        var d = ctx.diode();
        var leftIsP = d && d.leftIsP;
        var s = leftIsP ? ctx.sol(-5, 0) : ctx.sol(0, -5);
        var dep = PS.depletionByCharge(s);
        var s0 = ctx.eq(), dep0 = PS.depletionByCharge(s0);
        return {
          ok: dep.w >= 2.0e-4,
          rows: [
            row('−5 V での W', fmtUm(dep.w), '2.00 µm 以上', dep.w >= 2.0e-4),
            row('0 V での W', fmtUm(dep0.w), '（比べてみる）', true),
            row('伸びた倍率', (dep.w / dep0.w).toFixed(2) + ' 倍',
                '√((Vbi+5)/Vbi) ≒ ' + Math.sqrt((Math.abs(d.Vbi) + 5) / Math.abs(d.Vbi)).toFixed(2) + ' のはず',
                near(dep.w / dep0.w, Math.sqrt((Math.abs(d.Vbi) + 5) / Math.abs(d.Vbi)), 0.35))
          ]
        };
      }
    },
    {
      id: 'pin', ch: 2, name: '真性層を挟む（pin）',
      desc: 'p⁺ と n⁺ のあいだに**不純物を入れていない層**（Na = Nd = 0）を 3 µm 挟む。'
          + '0 V で空乏層が 3.0 µm 以上あること。',
      why: '真性層には打ち消す電荷が無いので、電界がそのまま通り抜ける。'
         + 'バイアス無しでも厚い空乏層ができる ― これが pin フォトダイオードが速くて感度が高い理由。',
      hint: '3層構成。真ん中の層は Na も Nd も 0 のまま。',
      check: function (ctx) {
        var s = ctx.eq(), si = ctx.si();
        /* 真性層は残る電荷が無いので、電荷ではなく電界で測る（poisson.js の注記） */
        var d = PS.fieldSpan(s, 0.05);
        var hasI = si.some(function (L) { return L.na === 0 && L.nd === 0 && L.tnm >= 2000; });
        return {
          ok: hasI && d && d.w >= 3.0e-4,
          rows: [
            row('真性層', hasI ? 'ある（2 µm 以上）' : 'ない', '不純物ゼロの層を挟む', hasI),
            row('電界が立っている幅', d ? fmtUm(d.w) : '―', '3.00 µm 以上', !!d && d.w >= 3.0e-4),
            row('最大電界', d ? fmtE(d.emax) + ' V/cm' : '―', '（i 層ではほぼ一定になる）', true)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'rectify', ch: 3, name: '整流する',
      desc: '順方向 +0.6 V と逆方向 −0.6 V で、電流の大きさの比を **1×10⁶ 倍以上**にする。',
      why: '同じ電圧を逆向きにかけただけで、電流が百万倍変わる。'
         + 'これが「ダイオード」という部品の中身で、指数関数がそのまま出ている。',
      hint: '普通の pn 接合ならまず通る。J0 が大きすぎると逆方向が増えて比が落ちる。',
      check: function (ctx) {
        var d = ctx.diode();
        if (!d) return { ok: false, rows: [row('接合', 'ない', 'pn 接合を作る', false)] };
        var f = Math.abs(d.iv(0.6).j), r = Math.abs(d.iv(-0.6).j);
        var ratio = r > 0 ? f / r : Infinity;
        return {
          ok: ratio >= 1e6,
          rows: [
            row('順方向 +0.6V', fmtE(f) + ' A/cm²', '', true),
            row('逆方向 −0.6V', fmtE(r) + ' A/cm²', '', true),
            row('比', fmtE(ratio, 1) + ' 倍', '1.0e+06 倍以上', ratio >= 1e6)
          ]
        };
      }
    },
    {
      id: 'j0', ch: 3, name: '飽和電流を小さくする',
      desc: '飽和電流密度 J₀ を **1×10⁻¹² A/cm² 以下**にする。',
      why: 'J₀ ∝ ni²/(N·L)。**濃くすれば下がる** ― 少数キャリアが減るから。'
         + '暗いところで使うセンサはこれを削る勝負になる。',
      hint: '両側を濃くする（1e18 以上）。ni² が効くので温度も効く。',
      check: function (ctx) {
        var d = ctx.diode();
        if (!d) return { ok: false, rows: [row('接合', 'ない', 'pn 接合を作る', false)] };
        return {
          ok: d.j0 <= 1e-12,
          rows: [
            row('飽和電流 J₀', fmtE(d.j0) + ' A/cm²', '1.0e−12 以下', d.j0 <= 1e-12),
            row('Na / Nd', fmtE(d.Na, 1) + ' / ' + fmtE(d.Nd, 1), '（濃いほど J₀ は下がる）', true),
            row('再結合電流 Jrec', fmtE(d.jrec0) + ' A/cm²', '（こちらは別の由来）', true)
          ]
        };
      }
    },
    {
      id: 'shortbase', ch: 3, name: '薄くすると電流が増える',
      desc: '中性領域の厚みを**拡散長より薄く**して、J₀ を「厚い場合」の 5 倍以上にする。'
          + '（判定は n 側の中性領域について見る）',
      why: '拡散電流は濃度勾配で決まる。同じ注入量でも、行き止まりが近いほど勾配が急になる。'
         + '「薄いほど電流が流れる」― 直感に反するが、これが高速ダイオードの作り方。',
      hint: 'n 側を数 µm まで薄くする。拡散長 Lp は 1e16 で 100µm 近くある。',
      check: function (ctx) {
        var d = ctx.diode();
        if (!d) return { ok: false, rows: [row('接合', 'ない', 'pn 接合を作る', false)] };
        var q = d.neutral(0);
        /* 厚かった場合（長基底）の J0 */
        var thick = P.Q * P.ni(ctx.T) * P.ni(ctx.T) * (d.Dp / (d.Lp * d.Nd) + d.Dn / (d.Ln * d.Na));
        var gain = d.j0 / thick;
        return {
          ok: gain >= 5 && q.n < d.Lp,
          rows: [
            row('n 側の中性領域', fmtUm(q.n), '拡散長 ' + fmtUm(d.Lp) + ' より薄い', q.n < d.Lp),
            row('J₀（今）', fmtE(d.j0) + ' A/cm²', '', true),
            row('J₀（厚かったら）', fmtE(thick) + ' A/cm²', '', true),
            row('増えた倍率', gain.toFixed(1) + ' 倍', '5.0 倍以上', gain >= 5)
          ]
        };
      }
    },
    {
      id: 'dark', ch: 3, name: '暗電流を減らす',
      desc: '−5 V での逆方向電流を **1×10⁻⁸ A/cm² 以下**にする。',
      why: '逆方向に流れているのは、空乏層の中で勝手に生まれた対（生成電流）と、'
         + '中性領域から拡散してくるぶん。生成電流は空乏層が広いほど増えるので、'
         + '「空乏層を広げて感度を上げる」と暗電流も増える ― センサ設計の綱引きがここにある。',
      hint: '空乏層を広げすぎない。濃度を上げると W が縮んで生成電流が減る。',
      check: function (ctx) {
        var d = ctx.diode();
        if (!d) return { ok: false, rows: [row('接合', 'ない', 'pn 接合を作る', false)] };
        var j = Math.abs(d.iv(-5).j);
        return {
          ok: j <= 1e-8,
          rows: [
            row('−5 V の暗電流', fmtE(j) + ' A/cm²', '1.0e−08 以下', j <= 1e-8),
            row('そのときの W', fmtUm(d.width(-5)), '（狭いほど生成が減る）', true),
            row('内訳 生成 / 拡散', fmtE(d.jrecat(-5), 1) + ' / ' + fmtE(d.j0at(-5), 1), '', true)
          ]
        };
      }
    },

    /* ===== 第4章 ===== */
    {
      id: 'photo', ch: 4, name: '光が見える',
      desc: '600 nm の光に対して量子効率 **40% 以上**にする。逆バイアスは −5 V。',
      why: '光子が1個入って電子正孔対が1組でき、それを電界が拾えば電流1個ぶん。'
         + '拾えるかどうかは「どこで生まれたか」で決まる。空乏層の中なら確実に拾える。',
      hint: '薄い p⁺（0.3µm）＋ 厚い n（10µm）＋ n⁺ の3層。600nm の吸収長は 2.4µm。',
      check: function (ctx) { return photoCheck(ctx, [{ nm: 600, min: 0.40 }]); }
    },
    {
      id: 'blue', ch: 4, name: '青を拾う',
      desc: '400 nm の量子効率を **35% 以上**にする（表面再結合速度は 1×10⁴ cm/s 固定）。',
      why: '青は表面から 0.1 µm で全部吸われる。そこが中性領域だと、生まれた対は'
         + '空乏層まで辿り着く前に表面で消える。**手前の層を薄くする**しかない。',
      hint: '入射側の層（p⁺）を 0.2 µm 以下に。濃度も下げると拡散しやすい。',
      check: function (ctx) { return photoCheck(ctx, [{ nm: 400, min: 0.35 }]); }
    },
    {
      id: 'red', ch: 4, name: '赤を拾う',
      desc: '1000 nm の量子効率を **8% 以上**にする。',
      why: '1000nm の吸収長は 156 µm。薄いシリコンは素通りする。'
         + '青とは落ちる理由がまったく違うので、対策も違う ―「厚くする」しかない。',
      hint: '全体を 100 µm 以上にする。空乏層でなくても、拡散長の中なら拾える。',
      check: function (ctx) { return photoCheck(ctx, [{ nm: 1000, min: 0.08 }]); }
    },
    {
      id: 'ar', ch: 4, name: '反射を殺す',
      desc: '**反射防止**（画面のスライダ）を 5% 以下にしたうえで、'
          + '700 nm の感度を **0.45 A/W 以上**にする。',
      why: '裸のシリコンは 35% 跳ね返す。何をどう作り込んでも、そのぶんは最初から失われている。'
         + '反射防止膜は「作った素子の性能を活かすため」の部品。',
      hint: '反射を 1% にしてから、赤側で拾えるだけの厚みを持たせる。',
      check: function (ctx) {
        var r = ctx.photo({ nm: 700, ar: ctx.ar, sFront: 1e4 }, ctx.vl, ctx.vr);
        return {
          ok: (ctx.ar !== undefined && ctx.ar !== null && ctx.ar <= 0.05) && r.resp >= 0.45,
          rows: [
            row('反射', ((ctx.ar === undefined || ctx.ar === null ? r.reflect : ctx.ar) * 100).toFixed(1) + ' %', '5.0 % 以下',
                ctx.ar !== undefined && ctx.ar !== null && ctx.ar <= 0.05),
            row('700nm の感度', r.resp.toFixed(3) + ' A/W', '0.450 A/W 以上', r.resp >= 0.45),
            row('量子効率', (r.qe * 100).toFixed(1) + ' %', '', true)
          ]
        };
      }
    },
    {
      id: 'broad', ch: 4, name: '広く拾う',
      desc: '400 / 600 / 900 nm の**すべて**で量子効率 30% 以上にする。',
      why: '青のための「薄い手前」と、赤のための「厚い全体」は両立する ―'
         + '手前だけ薄くして、奥を厚くすればよい。これが実際のフォトダイオードの形。',
      hint: '入射側 0.2µm 以下、全体 50µm 以上、反射防止も使う。',
      check: function (ctx) {
        return photoCheck(ctx, [{ nm: 400, min: 0.30 }, { nm: 600, min: 0.30 }, { nm: 900, min: 0.30 }]);
      }
    },

    /* ===== 第5章 ===== */
    {
      id: 'moscap', ch: 5, name: 'MOS キャパシタ',
      desc: '**酸化膜**を端に置いて、その下の p 型シリコンに反転層を作る。'
          + 'ゲート +3 V で電子の面密度 1×10¹² cm⁻² 以上。',
      why: '電極が酸化膜に触れた瞬間、それはゲートになる。'
         + '電流は流れないのに、電界だけが染み込んで表面の型をひっくり返す ―'
         + '「触れずにスイッチする」という、MOS の全部がここにある。',
      hint: '酸化膜 5nm ＋ p 型 1e17 を 500nm。左端に酸化膜を置くと左が自動でゲートになる。',
      check: function (ctx) {
        var mm = ctx.mos();
        if (!mm) return { ok: false, rows: [row('構造', 'MOS になっていない', '端に酸化膜を置く', false)] };
        var q = mm.qinv(3);
        return {
          ok: q >= 1e12 && mm.pType,
          rows: [
            row('ゲート +3V の反転電荷', fmtE(q) + ' cm⁻²', '1.0e+12 以上', q >= 1e12),
            row('ボディ', mm.pType ? 'p 型' : 'n 型', 'p 型', mm.pType),
            row('酸化膜の厚み', (mm.tox * 1e7).toFixed(1) + ' nm', '', true),
            row('Cox', fmtE(mm.Cox) + ' F/cm²', '', true)
          ]
        };
      }
    },
    {
      id: 'vth', ch: 5, name: 'しきい値電圧を合わせる',
      desc: 'しきい値電圧 Vth を **+0.50 V**（±0.03 V）にする。',
      why: 'Vth = VFB + 2φF + Qdep/Cox。動かせる摘みは3つ ―'
         + '基板濃度（φF と Qdep）、酸化膜の厚み（Cox）、ゲートの材質（VFB）。'
         + '判定は式ではなく「表面ポテンシャルが 2φF になるゲート電圧」をポアソンで探して出している。',
      hint: '基板を濃くすると上がる。酸化膜を厚くすると Qdep/Cox が効いて上がる。',
      check: function (ctx) {
        var mm = ctx.mos();
        if (!mm) return { ok: false, rows: [row('構造', 'MOS になっていない', '端に酸化膜を置く', false)] };
        return {
          ok: near(mm.vth, 0.50, 0.03),
          rows: [
            row('Vth（ポアソンで探した値）', fmtV(mm.vth), '0.500 ± 0.030 V', near(mm.vth, 0.50, 0.03)),
            row('Vth（教科書の式）', fmtV(mm.vthAnalytic), '（近いはず）', near(mm.vth, mm.vthAnalytic, 0.05)),
            row('内訳 VFB / 2φF / Qdep/Cox',
                mm.vfb.toFixed(3) + ' / ' + (2 * mm.phiF).toFixed(3) + ' / ' + (mm.qdep / mm.Cox).toFixed(3), '', true)
          ]
        };
      }
    },
    {
      id: 'swing', ch: 5, name: '切れ味を上げる',
      desc: 'S 値（弱反転で電流を1桁動かすのに要るゲート電圧）を **75 mV/dec 以下**にする。'
          + 'ただし Vth は 0.2 V 以上に保つこと。',
      why: 'S = ln10·(kT/q)·(1 + Cdep/Cox)。**室温では 60mV/dec より下げられない** ― '
         + 'kT が下限を決めている。これが「電源電圧をこれ以上下げられない」理由そのもので、'
         + '今の半導体が抱えている壁。',
      hint: '酸化膜を薄くして Cox を上げる。基板を薄めると Cdep が下がる。60 には届かない。',
      check: function (ctx) {
        var mm = ctx.mos();
        if (!mm) return { ok: false, rows: [row('構造', 'MOS になっていない', '端に酸化膜を置く', false)] };
        var floor = Math.LN10 * P.vt(ctx.T) * 1000;
        return {
          ok: mm.swing * 1000 <= 75 && mm.vth >= 0.2,
          rows: [
            row('S 値', (mm.swing * 1000).toFixed(1) + ' mV/dec', '75.0 以下', mm.swing * 1000 <= 75),
            row('室温の下限', floor.toFixed(1) + ' mV/dec', '（これは超えられない）', true),
            row('Vth', fmtV(mm.vth), '0.200 V 以上', mm.vth >= 0.2),
            row('Cdep/Cox', (mm.cdep / mm.Cox).toFixed(3), '（0 に近いほど良い）', true)
          ]
        };
      }
    },
    {
      id: 'nand', ch: 5, name: 'NAND の中身へ',
      desc: 'nMOS（p 基板）を作り、Vth を **+0.4 V 〜 +0.6 V** に収める。'
          + 'さらに S 値 80 mV/dec 以下、酸化膜 3 nm 以上。',
      why: 'ここで出来たものが、そのまま **NandLab の原始部品 NAND の中身**になる。'
         + 'p 基板の nMOS と、n 基板の pMOS を対称に作って上下に積むと CMOS インバータ、'
         + 'nMOS を直列2個・pMOS を並列2個にすると NAND ― 論理はここから上の階の話。'
         + '採点を通すと、この nMOS の **Vth が NandLab の「電圧で見る」に渡り**、'
         + '向こうの伝達特性の坂が自分の作った素子で描かれる。',
      hint: '酸化膜 3〜5nm、基板 1e17〜3e17 あたりで探る。',
      check: function (ctx) {
        var mm = ctx.mos();
        if (!mm) return { ok: false, rows: [row('構造', 'MOS になっていない', '端に酸化膜を置く', false)] };
        var toxNm = mm.tox * 1e7;
        return {
          ok: mm.pType && mm.vth >= 0.4 && mm.vth <= 0.6 && mm.swing * 1000 <= 80 && toxNm >= 3,
          rows: [
            row('種類', mm.pType ? 'nMOS（p 基板）' : 'pMOS（n 基板）', 'nMOS', mm.pType),
            row('Vth', fmtV(mm.vth), '0.400 〜 0.600 V', mm.vth >= 0.4 && mm.vth <= 0.6),
            row('S 値', (mm.swing * 1000).toFixed(1) + ' mV/dec', '80.0 以下', mm.swing * 1000 <= 80),
            row('酸化膜', toxNm.toFixed(1) + ' nm', '3.0 nm 以上', toxNm >= 3)
          ]
        };
      }
    }
  ];

  /** 光の課題の共通判定。逆バイアス −5V で見る */
  function photoCheck(ctx, wants) {
    var m = ctx.mesh();
    if (!ST.junctionNodes(m).length) {
      return { ok: false, rows: [row('接合', 'ない', 'pn 接合を作る', false)] };
    }
    var d = ctx.diode();
    var vl = d && d.leftIsP ? -5 : 0, vr = d && d.leftIsP ? 0 : -5;
    var rows = [], all = true, i;
    for (i = 0; i < wants.length; i++) {
      var w = wants[i];
      var r = ctx.photo({ nm: w.nm, sFront: 1e4, ar: ctx.ar }, vl, vr);
      var ok = r.qe >= w.min;
      all = all && ok;
      rows.push(row(w.nm + ' nm の量子効率', (r.qe * 100).toFixed(1) + ' %',
                    (w.min * 100).toFixed(0) + ' % 以上', ok));
      rows.push(row('　　内訳 空乏層/手前/奥',
        (100 * r.parts.dep / r.flux).toFixed(0) + '% / ' +
        (100 * r.parts.front / r.flux).toFixed(0) + '% / ' +
        (100 * r.parts.back / r.flux).toFixed(0) + '%',
        '反射 ' + (100 * r.reflect).toFixed(0) + '% ・透過 ' + (100 * r.transmit / r.flux).toFixed(0) + '%', true));
    }
    return { ok: all, rows: rows };
  }

  /* ---- 外から使う ---- */

  function byId(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }

  /**
   * 採点する。
   * opt に { T, ar } を渡せる（反射防止スライダなど、構造の外にある摘み）。
   */
  function grade(id, st, opt) {
    opt = opt || {};
    var q = byId(id);
    if (!q) return { ok: false, rows: [], error: '課題が見つかりません' };
    var ctx = context(st, opt.T);
    ctx.ar = opt.ar;
    try {
      var r = q.check(ctx);
      r.quest = q;
      return r;
    } catch (e) {
      return { ok: false, rows: [row('採点できませんでした', String(e && e.message || e), '', false)], quest: q };
    }
  }

  function chapterOf(q) {
    for (var i = 0; i < CH.length; i++) if (CH[i].id === q.ch) return CH[i];
    return null;
  }

  SL.quest = {
    LIST: LIST, CH: CH, byId: byId, grade: grade, context: context, chapterOf: chapterOf,
    within: within, near: near
  };
})(typeof window !== 'undefined' ? window : globalThis);
