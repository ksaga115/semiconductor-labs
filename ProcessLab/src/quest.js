/* 課題と採点
 *
 * 【採点の原則 ― ほかのラボと同じ】
 *   工程の並びは見比べない。**できたウェーハが条件を満たすかだけ**を見る。
 *   ウェット酸化でもドライ酸化でも、厚みが合っていれば通る。
 *
 * 第4章は **SemiLab の物理で採点する**。工程で作った縦の1本を SemiLab の層に直し、
 * そのままポアソン方程式と光の計算に掛ける ― 「この工程で作った素子の Vth は？」を
 * 式ではなく、作ったものから出す。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});
  var G = PL.grid, R = PL.recipe, M = PL.measure;

  /* 見る位置 [µm] */
  var LEFT = 2.5, MID = 5.0, RIGHT = 7.5;

  /* 同じレシピを何度も焼き直さない。採点の直前に画面で見ていたレシピや、
   * 検査の総当たり（13 課題 × 13 お手本）で同じものが何度も来る。
   * キーはレシピそのものの文字列なので、1文字でも変われば別物として焼き直す */
  var RUNS = {}, ORDER = [];
  function runOf(rc) {
    var key = JSON.stringify(rc);
    if (RUNS[key]) return RUNS[key];
    var r = R.run(rc);
    RUNS[key] = r; ORDER.push(key);
    if (ORDER.length > 30) delete RUNS[ORDER.shift()];
    return r;
  }

  function context(rc) {
    var run = null, semi = {};
    var ctx = {
      rc: rc,
      wafer: function () { return (run || (run = runOf(rc))).wafer; },
      col: function (xUm) { return G.colAt(xUm * G.UM); },
      oxNm: function (xUm) { return M.oxideOn(ctx.wafer(), ctx.col(xUm)) / G.NM; },
      xjUm: function (xUm) { var v = M.xj(ctx.wafer(), ctx.col(xUm)); return v === null ? null : v / G.UM; },
      rs: function (xUm) { return M.sheet(ctx.wafer(), ctx.col(xUm)); },
      surf: function (xUm) { return M.surface(ctx.wafer(), ctx.col(xUm)); },
      /** 打ち込んだ不純物（基板の分を除く）の面密度 [cm^-2] */
      dose: function (xUm, sp) {
        var w = ctx.wafer(), ix = ctx.col(xUm), s = 0;
        var sps = sp ? [sp] : G.SPECIES;
        for (var iz = G.firstSi(w, ix); iz < G.NZ; iz++) {
          for (var k = 0; k < sps.length; k++) s += w.C[sps[k]][G.idx(ix, iz)] * G.DZ[iz];
        }
        return s;
      },
      /** 打ち込んだ不純物の一番濃い深さ [nm] と濃さ */
      peak: function (xUm) {
        var w = ctx.wafer(), ix = ctx.col(xUm), best = 0, at = 0;
        for (var iz = G.firstSi(w, ix); iz < G.NZ; iz++) {
          var i = G.idx(ix, iz), c = w.C.B[i] + w.C.P[i] + w.C.As[i];
          if (c > best) { best = c; at = G.ZC[iz] - w.siTop[ix]; }
        }
        return { nm: at / G.NM, c: best };
      },
      /** SemiLab の層にした構造（mode: 'diode' | 'mos'） */
      semi: function (xUm, mode) {
        var k = xUm + mode;
        if (semi[k]) return semi[k];
        var SL = global.SL;
        if (!SL || !SL.stack) throw new Error('SemiLab の物理が読み込まれていません（../SemiLab/src）');
        var t = M.toSemi(ctx.wafer(), ctx.col(xUm), mode), st = SL.stack.create();
        t.layers.forEach(function (L) { SL.stack.addLayer(st, L.mat, L.tnm, { na: L.na, nd: L.nd }); });
        return (semi[k] = st);
      },
      /** 酸化する熱処理の合計時間 [分] */
      /** 第5章の計算の欄（無ければ既定値） */
      calc: function () { return CALC.of(rc); },
      oxMinutes: function () {
        return rc.steps.reduce(function (a, s) {
          return a + (s.t === 'heat' && (s.amb === 'dry' || s.amb === 'wet') ? (+s.min || 0) : 0);
        }, 0);
      }
    };
    return ctx;
  }

  /* ---- 第5章 ― 数で決まる（計算の欄 rc.calc で採点。ウェーハは使わない） ----
   * 第1部 14（EUV の光子の数）と 16（歩留まりの4つの式）をそのまま計算する。 */
  var Q_E = 1.602176634e-19, HC_EVNM = 1239.84;
  var CALC_DEF = { dose: 30, side: 10, lam: 13.5, d0: 0.1, alpha: 2, area: 7.5, nsplit: 1, over: 0.1 };
  var CALC = {
    DEF: CALC_DEF,
    of: function (rc) {
      var c = {}, k, src = (rc && rc.calc) || {};
      for (k in CALC_DEF) c[k] = typeof src[k] === 'number' && isFinite(src[k]) ? src[k] : CALC_DEF[k];
      return c;
    },
    /** 光子 1 個のエネルギー [J] */
    ephJ: function (lamNm) { return HC_EVNM / lamNm * Q_E; },
    /** 露光量 dose [mJ/cm²] で、一辺 side [nm] の正方形に入る光子の数 */
    photons: function (dose, sideNm, lamNm) { return dose * 1e-3 * Math.pow(sideNm * 1e-7, 2) / CALC.ephJ(lamNm); },
    poisson: function (AD) { return Math.exp(-AD); },
    murphy: function (AD) { return AD > 0 ? Math.pow((1 - Math.exp(-AD)) / AD, 2) : 1; },
    seeds: function (AD) { return 1 / (1 + AD); },
    negbin: function (AD, a) { return Math.pow(1 + AD / a, -a); },
    evaluate: function (c) {
      var n = CALC.photons(c.dose, c.side, c.lam);
      var k = Math.max(1, Math.round(c.nsplit));
      var a = c.area / k + c.over;
      return {
        eph: HC_EVNM / c.lam, n: n, rel: 1 / Math.sqrt(n),
        chipA: a, chipY: CALC.negbin(a * c.d0, c.alpha), chipYP: CALC.poisson(a * c.d0), totalA: k * a,
        bigY: CALC.negbin(c.area * c.d0, c.alpha), bigYP: CALC.poisson(c.area * c.d0), bigYM: CALC.murphy(c.area * c.d0)
      };
    }
  };

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function e2(v) { return v === null || v === undefined ? '―' : (+v).toExponential(2); }
  function um(v) { return v === null ? 'なし' : v.toFixed(3) + ' µm'; }
  function nm(v) { return v.toFixed(1) + ' nm'; }

  var CH = [
    { id: 1, name: '第1章　膜を育てる', lead: '酸化剤は膜を通り抜けて界面で反応する。だから厚くなるほど遅くなる。' },
    { id: 2, name: '第2章　決まった深さに打つ', lead: 'エネルギーが深さを、ドーズが量を決める。マスクは「止める」ためにある。' },
    { id: 3, name: '第3章　熱が広げる', lead: '拡散は温度に指数で効く。熱予算（温度×時間）が接合の深さを決める。' },
    { id: 4, name: '第4章　素子にする（SemiLab で採点）', lead: '工程で作った縦の1本を、そのまま SemiLab の物理に掛けて測る。' },
    { id: 5, name: '第5章　数で決まる（計算の欄で採点）', lead: '光子の数と欠陥の数 ― どちらもポアソンで、面積が指数の肩に乗る。第1部 14・16。' }
  ];

  function near5(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }
  function locks(c, spec) { for (var k in spec) if (!near5(c[k], spec[k])) return false; return true; }
  function lockRow(ok, text) { return row('条件固定', ok ? '守っている（' + text + '）' : '課題の条件に戻す', '', ok); }
  function pc(v, d) { return (v * 100).toFixed(d === undefined ? 1 : d) + ' %'; }

  var LIST = [
    /* ===== 第1章 ===== */
    {
      id: 'dryox', ch: 1, name: 'ゲート酸化膜を育てる',
      desc: '**ドライ酸化**（酸素）で、ウェーハ全面に **40〜60 nm** の酸化膜を育てる。',
      why: 'ドライ酸化は遅いが緻密な膜ができる ― ゲート酸化膜はこちら。'
         + 'Deal-Grove の式で、薄いうちは反応の速さ（直線）、厚くなると膜の中の拡散（放物線）で決まる。',
      hint: '熱処理を1つ足して、雰囲気を「ドライ酸化」に。1000℃ で1時間あたり。',
      check: function (c) {
        var xs = [1, MID, 9], rows = [], ok = true;
        xs.forEach(function (x) {
          var t = c.oxNm(x), good = t >= 40 && t <= 60;
          ok = ok && good;
          rows.push(row(x + ' µm の酸化膜', nm(t), '40〜60 nm', good));
        });
        return { ok: ok, rows: rows };
      }
    },
    {
      id: 'wetox', ch: 1, name: '厚い酸化膜を急いで',
      desc: '**450〜550 nm** の酸化膜を全面に。ただし酸化する熱処理は**合計 2 時間以内**。',
      why: 'ウェット（水蒸気）はドライより10倍ほど速い。水の分子は酸化膜の中を速く抜けるから。'
         + '素子を分ける厚いフィールド酸化膜はこちらで作る。',
      hint: 'ドライのままでは時間が足りない。雰囲気を変える。',
      check: function (c) {
        var t = c.oxNm(MID), min = c.oxMinutes();
        return {
          ok: t >= 450 && t <= 550 && min <= 120 && Math.abs(c.oxNm(1) - t) < 20,
          rows: [
            row('中央の酸化膜', nm(t), '450〜550 nm', t >= 450 && t <= 550),
            row('酸化の時間の合計', min.toFixed(0) + ' 分', '120 分以内', min <= 120),
            row('全面に同じ厚み', nm(c.oxNm(1)) + '（1µm）', '中央と 20nm 以内', Math.abs(c.oxNm(1) - t) < 20)
          ]
        };
      }
    },
    {
      id: 'locos', ch: 1, name: '選んだ所だけ酸化する（LOCOS）',
      desc: '左半分だけに **300 nm 以上**の厚い酸化膜。右半分のシリコンの上の酸化膜は **30 nm 以下**のまま。',
      why: '窒化膜は酸素も水も通さない。窒化膜で覆った所は酸化されない ― それだけで'
         + '「選んだ所だけ厚い酸化膜」ができる。LOCOS という名前の工程は、このアプリには無い。',
      hint: '窒化膜を成膜 → 左だけ開けるマスク → 窒化膜をエッチ → レジスト除去 → ウェット酸化。',
      check: function (c) {
        var l = c.oxNm(LEFT), r = c.oxNm(RIGHT);
        return {
          ok: l >= 300 && r <= 30,
          rows: [
            row('左（2.5µm）の酸化膜', nm(l), '300 nm 以上', l >= 300),
            row('右（7.5µm）の酸化膜', nm(r), '30 nm 以下', r <= 30)
          ]
        };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'open', ch: 2, name: '開けた所にだけ打つ',
      desc: '左半分にだけ不純物を入れる。左（2.5µm）のどこかで **1×10¹⁸ cm⁻³ 以上**、'
          + '右（7.5µm）のシリコンに入った量は **1×10¹⁰ cm⁻² 以下**。',
      why: 'レジストは光で形を写し取れる、厚い「盾」。注入の前にレジストで覆えば、'
         + '開けた所にだけイオンが入る。これが「どこに作るか」を決める仕組みの全部。',
      hint: '露光・現像で左半分を開ける → 注入 → レジスト除去。',
      check: function (c) {
        var pk = c.peak(LEFT).c, dr = c.dose(RIGHT);
        return {
          ok: pk >= 1e18 && dr <= 1e10,
          rows: [
            row('左の一番濃いところ', e2(pk) + ' cm⁻³', '1e18 以上', pk >= 1e18),
            row('右に入った量', e2(dr) + ' cm⁻²', '1e10 以下', dr <= 1e10)
          ]
        };
      }
    },
    {
      id: 'peak', ch: 2, name: '深さを狙う',
      desc: '打ち込んだ不純物の**一番濃いところ**を、表面から **100 ± 15 nm** に。濃さは 1×10¹⁷ cm⁻³ 以上。',
      why: '止まる深さはエネルギーとイオンの重さで決まる。同じ 100keV でも B は 300nm、As は 60nm ―'
         + '重いほど浅い。だから浅い n⁺ には As を使う。',
      hint: 'どのイオンでもよい。P なら 80keV あたり、B なら 30keV あたり。',
      check: function (c) {
        var p = c.peak(MID);
        return {
          ok: Math.abs(p.nm - 100) <= 15 && p.c >= 1e17,
          rows: [
            row('一番濃い深さ', nm(p.nm), '85〜115 nm', Math.abs(p.nm - 100) <= 15),
            row('その濃さ', e2(p.c) + ' cm⁻³', '1e17 以上', p.c >= 1e17)
          ]
        };
      }
    },
    {
      id: 'guard', ch: 2, name: '盾を厚くする',
      desc: '**ホウ素を 150 keV 以上**で打つ。左（2.5µm）には **1×10¹⁴ cm⁻² 以上**入れ、'
          + '右（7.5µm）のシリコンに届く量は **1×10¹⁰ cm⁻² 以下**。',
      why: 'レジストは軽いので、高いエネルギーの軽いイオンは突き抜ける。'
         + '既定の厚み（1µm）では足りない ― マスクの工程でレジストの厚みを変える。',
      hint: 'レジストの中での飛程はシリコンのおよそ 1.8 倍。平均の深さ＋ばらつきの 4 倍ぶん以上の厚みが要る。',
      check: function (c) {
        var hi = c.rc.steps.some(function (s) { return s.t === 'imp' && s.ion === 'B' && +s.keV >= 150; });
        var dl = c.dose(LEFT, 'B'), dr = c.dose(RIGHT, 'B');
        return {
          ok: hi && dl >= 1e14 && dr <= 1e10,
          rows: [
            row('B を 150keV 以上で打った', hi ? 'はい' : 'いいえ', 'はい', hi),
            row('左に入った B', e2(dl) + ' cm⁻²', '1e14 以上', dl >= 1e14),
            row('右に届いた B', e2(dr) + ' cm⁻²', '1e10 以下', dr <= 1e10)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'xj', ch: 3, name: '接合の深さを合わせる',
      desc: 'p 型基板に n 型を作り、中央の**接合深さを 0.30 ± 0.03 µm** にする。',
      why: '打った直後の分布は薄い。熱で広げて、基板の濃度と釣り合った深さが接合になる。'
         + '温度を 50℃ 上げると拡散は 3〜4 倍速くなる ― 時間より温度が効く。',
      hint: 'リンを打って窒素で熱処理。950〜1000℃ で数十分。',
      check: function (c) {
        var x = c.xjUm(MID), s = c.surf(MID);
        return {
          ok: x !== null && Math.abs(x - 0.30) <= 0.03 && s && s.type === 'n',
          rows: [
            row('接合深さ', um(x), '0.27〜0.33 µm', x !== null && Math.abs(x - 0.30) <= 0.03),
            row('表面の型', s ? s.type + ' 型' : '―', 'n 型', s && s.type === 'n')
          ]
        };
      }
    },
    {
      id: 'sheet', ch: 3, name: '抵抗を下げる',
      desc: '中央のシート抵抗を **30 Ω/□ 以下**に。ただし接合深さは **0.5 µm 以下**。',
      why: 'シート抵抗は「表面から接合までの層」をまとめた抵抗。量を増やせば下がるが、'
         + '入れすぎても全部は効かない（固溶度）。深さを使わずに下げるには、ドーズを上げるしかない。',
      hint: 'ドーズを 1 桁上げる。熱は深くしすぎない程度に。',
      check: function (c) {
        var r = c.rs(MID), x = c.xjUm(MID);
        return {
          ok: r <= 30 && x !== null && x <= 0.5,
          rows: [
            row('シート抵抗', r === null ? '―' : r.toFixed(1) + ' Ω/□', '30 以下', r <= 30),
            row('接合深さ', um(x), '0.5 µm 以下', x !== null && x <= 0.5)
          ]
        };
      }
    },
    {
      id: 'shallow', ch: 3, name: '浅く、でも低抵抗に',
      desc: '接合深さ **60 nm 以下**で、シート抵抗 **200 Ω/□ 以下**。',
      why: '微細なトランジスタのソース・ドレインは浅くないといけない。でも浅いと抵抗が上がる。'
         + '重くて拡散の遅い As を、低いエネルギーで打ち、熱は短く ― これが答えの形。',
      hint: 'As を 10keV 前後で。熱処理は 900℃ で 1 分くらい（分に小数も書ける）。',
      check: function (c) {
        var r = c.rs(MID), x = c.xjUm(MID);
        return {
          ok: x !== null && x <= 0.06 && r <= 200,
          rows: [
            row('接合深さ', um(x), '0.060 µm 以下', x !== null && x <= 0.06),
            row('シート抵抗', r === null ? '―' : r.toFixed(1) + ' Ω/□', '200 以下', r <= 200)
          ]
        };
      }
    },
    {
      id: 'well', ch: 3, name: 'ウェルを掘る',
      desc: 'p 型基板の**左半分だけ**に、深さ **2 µm 以上**の n 型の領域（n ウェル）を作る。右半分は p 型のまま。',
      why: 'CMOS は同じウェーハに n 型と p 型の両方の土台が要る。ウェルはその土台 ―'
         + '深くするには 1100℃ 以上で長く焼く。熱予算がいちばん大きい工程。'
         + 'ただし**拡散は横にも同じだけ進む**。焼きすぎると隣の領域まで n 型に染まる。',
      hint: 'マスクで左を開け、リンを高いエネルギーで。レジストを外して 1150℃ で1〜2時間。5時間だと右まで染まる。',
      check: function (c) {
        var x = c.xjUm(LEFT), sl = c.surf(LEFT), sr = c.surf(RIGHT);
        return {
          ok: x !== null && x >= 2 && sl && sl.type === 'n' && sr && sr.type === 'p',
          rows: [
            row('左の表面', sl ? sl.type + ' 型' : '―', 'n 型', sl && sl.type === 'n'),
            row('左の接合深さ', um(x), '2 µm 以上', x !== null && x >= 2),
            row('右の表面', sr ? sr.type + ' 型' : '―', 'p 型のまま', sr && sr.type === 'p')
          ]
        };
      }
    },

    /* ===== 第4章 ===== */
    {
      id: 'pd', ch: 4, name: 'フォトダイオードを作る',
      desc: '中央の縦の1本を SemiLab に渡したとき（膜は外し、表面に電極、逆バイアス −5V）、'
          + '**450 nm の量子効率 50% 以上**。',
      why: '青は表面 0.2µm で吸われる。表面の p⁺ が深いと、生まれた対が空乏層に届く前に消える。'
         + '浅い接合を作る工程の腕が、そのまま青の感度になる。',
      hint: '薄い n 型基板（1e14）に、B を低エネルギーで浅く。熱は短く。',
      check: function (c) {
        var SL = global.SL, st = c.semi(MID, 'diode'), d = SL.dev.diode(st, 300);
        if (!d) return { ok: false, rows: [row('接合', 'ない', 'pn 接合が要る', false)] };
        var m = SL.stack.mesh(st, 300);
        var sol = SL.poisson.solveRobust(m, d.leftIsP ? { left: -5, right: 0 } : { left: 0, right: -5 });
        var r = SL.light.photo(st, sol, { nm: 450, power: 1e-3, sFront: 1e4 });
        return {
          ok: r.qe >= 0.5,
          rows: [
            row('450 nm の量子効率', (r.qe * 100).toFixed(1) + ' %', '50 % 以上', r.qe >= 0.5),
            row('接合深さ', um(c.xjUm(MID)), '（浅いほど青に効く）', true),
            row('SemiLab に渡した層', st.layers.length + ' 層', '', true)
          ]
        };
      }
    },
    {
      id: 'mos', ch: 4, name: 'MOS のしきい値を合わせる',
      desc: '中央を SemiLab に渡したとき（シリコンの上の酸化膜をゲートに）、'
          + '**Vth 0.30〜0.70 V**。酸化膜は **3〜20 nm**。',
      why: 'しきい値は、酸化膜の厚みと、表面の濃度で決まる。表面の濃度はチャネル注入で合わせる ―'
         + '「しきい値調整注入」。SemiLab で「基板濃度」と呼んでいたものは、実物ではこうして作る。',
      hint: 'B を 1e12 前後、20keV で打ってから、ドライ酸化で 10nm 前後。',
      check: function (c) {
        var SL = global.SL, tox = c.oxNm(MID);
        if (!(tox > 0)) return { ok: false, rows: [row('ゲート酸化膜', 'ない', '3〜20 nm', false)] };
        var mm = SL.dev.mos(c.semi(MID, 'mos'), 300);
        if (!mm) return { ok: false, rows: [row('MOS', 'できていない', '', false)] };
        return {
          ok: tox >= 3 && tox <= 20 && mm.vth >= 0.3 && mm.vth <= 0.7 && mm.pType,
          rows: [
            row('Vth（SemiLab で解いた値）', mm.vth.toFixed(3) + ' V', '0.30〜0.70 V', mm.vth >= 0.3 && mm.vth <= 0.7),
            row('ゲート酸化膜', nm(tox), '3〜20 nm', tox >= 3 && tox <= 20),
            row('チャネルの型', mm.pType ? 'p 型（nMOS）' : 'n 型', 'p 型', mm.pType),
            row('S 値', (mm.swing * 1000).toFixed(1) + ' mV/dec', '（参考）', true)
          ]
        };
      }
    },
    {
      id: 'cmos', ch: 4, name: 'CMOS の土台',
      desc: '左（2.5µm）は **p 型**（nMOS 用）、右（7.5µm）は深さ **1 µm 以上の n ウェル**（pMOS 用）。'
          + '**両方の上に 3〜20 nm のゲート酸化膜**。',
      why: 'nMOS と pMOS を同じウェーハに並べる ― これで CMOS インバータが作れる土台になる。'
         + 'ここまで来ると、NandLab の NAND の中身（nMOS 2個＋pMOS 2個）の土台を工程から作ったことになる。',
      hint: '右だけ開けてリンのウェル → 長い熱処理 → 全面をドライ酸化。',
      check: function (c) {
        var sl = c.surf(LEFT), sr = c.surf(RIGHT), xr = c.xjUm(RIGHT);
        var ol = c.oxNm(LEFT), or = c.oxNm(RIGHT);
        var okOx = function (t) { return t >= 3 && t <= 20; };
        return {
          ok: sl && sl.type === 'p' && sr && sr.type === 'n' && xr !== null && xr >= 1 && okOx(ol) && okOx(or),
          rows: [
            row('左の表面', sl ? sl.type + ' 型' : '―', 'p 型', sl && sl.type === 'p'),
            row('右の表面', sr ? sr.type + ' 型' : '―', 'n 型', sr && sr.type === 'n'),
            row('右のウェルの深さ', um(xr), '1 µm 以上', xr !== null && xr >= 1),
            row('左のゲート酸化膜', nm(ol), '3〜20 nm', okOx(ol)),
            row('右のゲート酸化膜', nm(or), '3〜20 nm', okOx(or))
          ]
        };
      }
    },

    /* ===== 第5章 ===== */
    {
      id: 'shot', ch: 5, name: 'EUV の光子の揺らぎを 2% に',
      desc: '**EUV（13.5 nm）**で**一辺 10 nm** の正方形に入る光子の数の相対的な揺らぎ 1/√N を **2.0% 以下**にする。'
          + 'ただし処理枚数のため、露光量は **40 mJ/cm² 以下**。',
      why: 'EUV の光子 1 個は 91.8 eV で ArF の 14 倍重く、同じ露光量でも数が 1/14 になる。数はポアソン分布で揺らぐので、'
         + '細い線の縁の乱れやブリッジ・抜け（確率的欠陥）の元になる（第1部 14）。露光量を上げれば揺らぎは 1/√N で減るが、'
         + '<b>そのぶん 1 時間に処理できるウェーハの枚数が落ちる</b> ― 窓は両側から閉じる。',
      hint: '30 mJ/cm² で約 2,040 個、揺らぎ 2.2%。2% には N ≥ 2,500 個 ― 露光量は 36.8 mJ/cm² 以上。',
      check: function (ctx) {
        var c = ctx.calc(), e = CALC.evaluate(c);
        var lock = locks(c, { side: 10, lam: 13.5 });
        var okR = e.rel <= 0.02, okD = c.dose <= 40;
        return {
          ok: lock && okR && okD,
          rows: [
            row('光子の揺らぎ 1/√N', pc(e.rel, 2) + '（N = ' + e.n.toFixed(0) + ' 個）', '2.00 % 以下', okR),
            row('露光量', c.dose.toFixed(1) + ' mJ/cm²', '40.0 以下', okD),
            row('光子 1 個', e.eph.toFixed(1) + ' eV', '', true),
            lockRow(lock, '13.5 nm・一辺 10 nm')
          ]
        };
      }
    },
    {
      id: 'chiplet', ch: 5, name: 'チップレットに何個で分けるか',
      desc: '面積 **7.5 cm²** の回路を、**D₀ 0.1 /cm²・負の二項 α 2** のラインで作る。何個のチップレットに分けるかを決めて、'
          + '**1 個あたりの歩留まりを 90% 以上**にする。分けるたびに接続の面積が **1 個 0.1 cm²**（仮定）増えるので、'
          + 'シリコンの総面積は **8.5 cm² 以下**に抑える。',
      why: '大きなチップは欠陥を踏む確率が面積の指数で効くので、分けるほど 1 個の歩留まりは上がる（第1部 16 の例題: 4 分割で 47% → 83%）。'
         + 'だが分けるたびに、チップ間をつなぐ回路と余白の面積が増える。<b>分けすぎても、分けなさすぎても損</b> ― '
         + '先端パッケージでチップレットの数が「数個」に落ち着く理由の、数の上の中身。',
      hint: '1 個の面積 a = 7.5/n + 0.1。(1 + 0.05a)⁻² ≥ 0.9 から a ≤ 1.08 cm² → n ≥ 8。総面積 7.5 + 0.1n ≤ 8.5 → n ≤ 10。',
      check: function (ctx) {
        var c = ctx.calc(), e = CALC.evaluate(c);
        var lock = locks(c, { area: 7.5, d0: 0.1, alpha: 2, over: 0.1 });
        var okY = e.chipY >= 0.9, okA = e.totalA <= 8.5 + 1e-9;
        return {
          ok: lock && okY && okA,
          rows: [
            row('1 個の歩留まり（負の二項）', pc(e.chipY, 2) + '（1 個 ' + e.chipA.toFixed(3) + ' cm²）', '90.00 % 以上', okY),
            row('シリコンの総面積', e.totalA.toFixed(2) + ' cm²（' + Math.max(1, Math.round(c.nsplit)) + ' 個）', '8.50 以下', okA),
            row('参考: ポアソンなら', pc(e.chipYP, 2), '', true),
            lockRow(lock, '7.5 cm²・D₀ 0.1・α 2・接続 0.1 cm²/個')
          ]
        };
      }
    },
    {
      id: 'd0', ch: 5, name: '大きなチップに要る欠陥密度',
      desc: '面積 **7.5 cm²** のチップを分けずに作り、**負の二項 α 2** で歩留まり **60% 以上**を見込めるように、ラインの欠陥密度 D₀ を決める。'
          + 'ただし D₀ は **0.02 /cm² より下げられない**（成熟したラインの限界と仮定）。',
      why: '歩留まりの式は「欠陥がどう散らばるか」の仮定の違いで、大きなチップほど式によって見積もりが割れる（第1部 16 の表）。'
         + '同じ 60% でも、ポアソンで考えると D₀ ≤ 0.068、負の二項（α 2）なら 0.078 ― <b>式の選び方で、ラインに求める清浄さが 14% 変わる</b>。'
         + 'だから大きなチップの採算は、欠陥の散らばり方を実測で確かめてから見積もる。',
      hint: '(1 + 7.5·D₀/2)⁻² ≥ 0.6 → D₀ ≤ 0.0776。窓は 0.02〜0.0776 /cm²。',
      check: function (ctx) {
        var c = ctx.calc(), e = CALC.evaluate(c);
        var lock = locks(c, { area: 7.5, alpha: 2 }) && Math.max(1, Math.round(c.nsplit)) === 1;
        var okY = e.bigY >= 0.6, okD = c.d0 >= 0.02;
        return {
          ok: lock && okY && okD,
          rows: [
            row('歩留まり（負の二項 α 2）', pc(e.bigY, 2), '60.00 % 以上', okY),
            row('欠陥密度 D₀', c.d0.toFixed(4) + ' /cm²', '0.0200 以上', okD),
            row('参考: ポアソン / マーフィー', pc(e.bigYP, 1) + ' / ' + pc(e.bigYM, 1), '', true),
            lockRow(lock, '7.5 cm²・分けない・α 2')
          ]
        };
      }
    }
  ];

  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function chapterOf(q) { for (var i = 0; i < CH.length; i++) if (CH[i].id === q.ch) return CH[i]; return null; }

  function grade(id, rc) {
    var q = byId(id);
    if (!q) return { ok: false, rows: [], error: '課題が見つかりません' };
    try {
      var r = q.check(context(rc));
      r.quest = q;
      return r;
    } catch (e) {
      return { ok: false, rows: [row('採点できませんでした', String(e && e.message || e), '', false)], quest: q };
    }
  }

  PL.quest = { LIST: LIST, CH: CH, byId: byId, grade: grade, context: context, chapterOf: chapterOf, LEFT: LEFT, MID: MID, RIGHT: RIGHT, calc: CALC };
})(typeof window !== 'undefined' ? window : globalThis);
