/* 光 ― 吸収して、拾えたぶんだけが電流になる
 *
 * ここは pn 接合が**フォトダイオード**になる層。
 * 光電流は式で書かず、**少数キャリアの拡散方程式を数値で解いて**出す。
 * そうしないと「青が落ちる理由」と「赤が落ちる理由」が別のものだと分からない。
 *
 * 【流れ】
 *
 *   1. 表面で跳ね返る            R = ((n-1)/(n+1))^2。裸のシリコンは 35% 跳ね返す
 *   2. 深さとともに吸われる      G(x) = (1-R) Φ α exp(-α x)     ビア・ランベルト
 *   3. 拾えるかどうかは場所で違う
 *
 *        空乏層の中     … 電界が引きずり出す。100% 拾える
 *        中性領域の中   … 拡散で空乏層まで辿り着けたぶんだけ拾える
 *        表面のすぐ下   … 表面に食われる（表面再結合速度 S）
 *
 * 【中性領域で解く式】少数キャリア（p 型なら電子）について
 *
 *     D d²Δn/dx² - Δn/τ + G(x) = 0
 *
 *   境界は  空乏層の端で Δn = 0（吸い出されるので溜まらない）
 *           表面で       D dΔn/dx = S·Δn（S が大きいほど食われる）
 *           裏の電極で   Δn = 0（オーミック接点は無限の再結合）
 *
 *   これも三重対角なので Thomas 法で一発。poisson.js と同じ解き方。
 *
 * 【この形にすると何が見えるか】
 *
 *   青（400nm, α=1e5/cm）… 表面から 0.1µm で全部吸われる。
 *                           表面が荒れている（S が大きい）と、そこで食われて拾えない。
 *   赤（1000nm, α=64/cm） … 平均 156µm 進む。薄いシリコンは素通りする。
 *   1100nm 以上           … 光子のエネルギーがバンドギャップに足りない。吸収そのものが無い。
 *
 * 「青が落ちるのは表面のせい、赤が落ちるのは厚みのせい」― 原因が別なので、
 * 対策も別（表面パッシベーション vs 厚い空乏層）。ここがこの層の要。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var P = SL.phys, ST = SL.stack, PS = SL.poisson;

  var HC_EV_NM = 1239.841984;       /* hc [eV·nm]。E[eV] = 1239.8 / λ[nm] */

  /** 光子1個あたりのエネルギー [J] */
  function photonJ(nm) { return P.Q * HC_EV_NM / nm; }

  /** 電力密度 [W/cm^2] → 光子束 [cm^-2 s^-1] */
  function fluxFromPower(pw, nm) { return pw / photonJ(nm); }

  /* ---- 反射防止膜 ― 単層・正規入射（特性行列） ----
   *
   *   空気 n0 / 膜 n1（厚み d、吸収なし）/ シリコン Ns = n − ik
   *
   *   δ = 2π n1 d / λ
   *   [B]   [ cos δ        i sin δ / n1 ] [ 1  ]
   *   [C] = [ i n1 sin δ   cos δ        ] [ Ns ]
   *   r = (n0 B − C)/(n0 B + C)、R = |r|²
   *
   * 膜が吸収しないので、シリコンへ入る割合は 1 − R。
   * 確かめられる形（tests/run.js が突き合わせる）:
   *   d = 0 と λ/2 膜（n1 d = λ/2）… 裸と同じ ((n−1)² + k²)/((n+1)² + k²)
   *   λ/4 膜（n1 d = λ/4）          … ((n0 Ns − n1²)/(n0 Ns + n1²))²（Ns が実数のとき）
   *   n1 = √(n0 Ns) の λ/4 膜        … 0
   *
   * シリコンの n は phys.nIndex、k は吸収係数から k = αλ/4π（phys.alpha と同じ表から出すので、
   * 反射と吸収が同じ材料の値でそろう）。膜なし（opt.coat も opt.ar も無い）ときは、
   * これまでどおり実部だけの phys.reflect を使う（k の効きは 400 nm でも 0.1% 程度）。
   */
  var COAT_MAT = {
    /* 石英ガラスの Sellmeier 式（I. H. Malitson, J. Opt. Soc. Am. 55, 1205 (1965)）。
     * 熱酸化膜もほぼ同じ値（600 nm で 1.458）。λ は µm */
    sio2: {
      name: 'SiO₂', note: 'Malitson (1965) の Sellmeier 式（600 nm で 1.458）',
      n: function (nm) {
        var l2 = Math.pow(nm / 1000, 2);
        return Math.sqrt(1 + 0.6961663 * l2 / (l2 - 0.0684043 * 0.0684043)
                           + 0.4079426 * l2 / (l2 - 0.1162414 * 0.1162414)
                           + 0.8974794 * l2 / (l2 - 9.896161 * 9.896161));
      }
    },
    /* 窒化膜は成膜法（LPCVD / プラズマ CVD）と組成で 1.9〜2.05 と幅がある。
     * ここでは目安の 2.00 で一定（波長による変化は入れていない） */
    sin: { name: 'Si₃N₄', note: '目安 2.00（成膜法と組成で 1.9〜2.05。分散は入れていない）', n: function () { return 2.0; } }
  };

  /** 膜の屈折率。coat = { mat: 'sio2' | 'sin' | 'custom', n, dnm } */
  function coatIndex(coat, nm) {
    var m = COAT_MAT[coat.mat];
    return m ? m.n(nm) : coat.n;
  }

  /** シリコンの消衰係数 k = αλ/4π（α は cm⁻¹、λ は cm） */
  function siK(nm) { return P.alpha(nm) * nm * 1e-7 / (4 * Math.PI); }

  /**
   * 単層膜の反射率。ns を渡すと基板をその {n, k} にする（検査で実数の基板と突き合わせるため）
   */
  function filmReflect(nm, n1, dnm, n0, ns) {
    n0 = n0 || 1;
    var a = ns ? ns.n : P.nIndex(nm), b = ns ? (ns.k || 0) : siK(nm);
    var dl = 2 * Math.PI * n1 * dnm / nm, c = Math.cos(dl), s = Math.sin(dl);
    var Br = c + b * s / n1, Bi = a * s / n1;          /* B = cos δ + i sin δ · Ns / n1 */
    var Cr = a * c, Ci = n1 * s - b * c;               /* C = i n1 sin δ + cos δ · Ns */
    var nr = n0 * Br - Cr, ni_ = n0 * Bi - Ci, dr = n0 * Br + Cr, di = n0 * Bi + Ci;
    return (nr * nr + ni_ * ni_) / (dr * dr + di * di);
  }

  /**
   * その波長で表面が跳ね返す割合。
   *   opt.ar（数）   … 反射率を直接（画面の「直接」）
   *   opt.coat       … 膜から計算
   *   どちらも無し   … 裸のシリコン
   */
  function reflectOf(nm, opt) {
    opt = opt || {};
    if (opt.ar !== undefined && opt.ar !== null) return opt.ar;
    if (opt.coat) return filmReflect(nm, coatIndex(opt.coat, nm), opt.coat.dnm);
    return P.reflect(nm);
  }

  /** λ/4 の厚み [nm]（その波長で反射が最小になる最も薄い膜） */
  function quarterNm(coat, nm) { return nm / (4 * coatIndex(coat, nm)); }

  /**
   * 生成率の分布 G(x) [cm^-3 s^-1]。
   * 光は左（x=0）から入る。構造の中の酸化膜は透明として素通りさせる。
   * 表面の反射は ar で渡す（膜から計算した値も reflectOf が数にしてから渡す）。
   */
  function generation(m, nm, flux, ar) {
    var a = P.alpha(nm);
    var R = (ar === undefined || ar === null) ? P.reflect(nm) : ar;
    var g = new Float64Array(m.n), i;
    var enter = flux * (1 - R);
    /* 酸化膜のぶんは深さに数えない（吸収しないので） */
    var depth = 0;
    for (i = 0; i < m.n; i++) {
      if (i > 0 && m.matL[i] === 'si') depth += m.x[i] - m.x[i - 1];
      g[i] = m.siDx[i] > 0 ? enter * a * Math.exp(-a * depth) : 0;
    }
    return { g: g, alpha: a, reflect: R, enter: enter, transmit: enter * Math.exp(-a * depth) };
  }

  /**
   * 中性領域 [i0, i1] で拡散方程式を解く。
   *
   * D と τ は**点ごと**に持つ。区間ひとつの平均で済ませてはいけない ―
   * フォトダイオードの裏側は n / n+ のように濃度が桁で変わっていて、
   * 平均すると n+ の短い寿命が薄い n 領域まで効いてしまう
   * （拾えるはずのキャリアが消える）。
   * 界面をまたぐ D は調和平均（＝直列につないだ抵抗と同じ扱い）。
   *
   * bc0 / bc1 は 'zero'（Δ=0）か { s: 表面再結合速度 }。
   * 戻り値の f0 / f1 は境界から出ていく粒子束 [cm^-2 s^-1]。
   */
  function diffuse(m, g, i0, i1, D, tau, bc0, bc1) {
    var N = i1 - i0 + 1;
    if (N < 3) return { dn: new Float64Array(Math.max(N, 1)), i0: i0, i1: i1, f0: 0, f1: 0 };
    var a = new Float64Array(N), b = new Float64Array(N), c = new Float64Array(N), d = new Float64Array(N);
    var k, i;

    /** 点 i と i+1 のあいだの実効的な D/h（調和平均） */
    function cond(i) {
      var h = m.x[i + 1] - m.x[i];
      if (h <= 0) return 0;
      var dh = 2 * D[i] * D[i + 1] / (D[i] + D[i + 1] || 1);
      return dh / h;
    }

    for (k = 0; k < N; k++) {
      i = i0 + k;
      var hl = i > i0 ? m.x[i] - m.x[i - 1] : 0;
      var hr = i < i1 ? m.x[i + 1] - m.x[i] : 0;
      var dx = (hl + hr) / 2;

      if (k === 0 && bc0 === 'zero') { a[k] = 0; b[k] = 1; c[k] = 0; d[k] = 0; continue; }
      if (k === N - 1 && bc1 === 'zero') { a[k] = 0; b[k] = 1; c[k] = 0; d[k] = 0; continue; }

      var el = hl > 0 ? cond(i - 1) : 0;
      var er = hr > 0 ? cond(i) : 0;
      a[k] = el; c[k] = er;
      b[k] = -(el + er) - dx / tau[i];
      d[k] = -g[i] * dx;

      if (k === 0 && bc0 && bc0.s !== undefined) b[k] -= bc0.s;
      if (k === N - 1 && bc1 && bc1.s !== undefined) b[k] -= bc1.s;
    }

    var dn = PS.thomas(a, b, c, d, N);
    /* Δ=0 に固定した側から出ていく束＝空乏層が拾ったぶん */
    var f0 = (bc0 === 'zero') ? cond(i0) * (dn[1] - dn[0]) : 0;
    var f1 = (bc1 === 'zero') ? cond(i1 - 1) * (dn[N - 2] - dn[N - 1]) : 0;
    return { dn: dn, i0: i0, i1: i1, f0: f0, f1: f1 };
  }

  /** 少数キャリアの D[] と τ[] を点ごとに作る。pType はその領域の型 */
  function minorityProps(m, i0, i1, T, pType) {
    var D = new Float64Array(m.n), tau = new Float64Array(m.n), i;
    for (i = i0; i <= i1; i++) {
      var dope = Math.max(m.na[i] + m.nd[i], 1e12);
      var mu = pType ? P.muN(dope, T) : P.muP(dope, T);
      D[i] = P.diff(mu, T);
      tau[i] = P.tau(dope);
    }
    return { D: D, tau: tau };
  }

  /**
   * フォトダイオードとして解く。
   *
   *   st   … 構造
   *   sol  … その構造の（バイアス下の）ポアソン解。空乏層の位置に使う
   *   opt  … { nm, power, flux, sFront, sBack, ar }
   *
   * 戻り値 { jph, qe, resp, gen, parts:{dep,front,back}, loss:{reflect,transmit,front,back,bulk} }
   *   jph  … 光電流密度 [A/cm^2]（正が光電流の向き）
   *   qe   … 外部量子効率（反射も込み）
   *   resp … 感度 [A/W]
   */
  function photo(st, sol, opt) {
    opt = opt || {};
    var m = sol.mesh, T = m.T;
    var nm = opt.nm || 600;
    var flux = opt.flux !== undefined ? opt.flux
             : fluxFromPower(opt.power !== undefined ? opt.power : 1e-3, nm);
    var sFront = opt.sFront !== undefined ? opt.sFront : 1e4;   /* cm/s */
    var sBack = opt.sBack !== undefined ? opt.sBack : 1e6;

    /* バンドギャップより光子が弱ければ、そもそも吸われない */
    var ev = HC_EV_NM / nm;
    var below = ev < P.eg(T);

    var G = generation(m, nm, flux, reflectOf(nm, opt));
    var g = G.g, i;

    /* 空乏層の範囲。接合が無ければ全域を中性として扱う */
    var js = ST.junctionNodes(m);
    var dep = js.length ? PS.depletionByCharge(sol) : null;
    var i0 = -1, i1 = -1;
    if (dep) {
      /* 位置は左右の幅（wL / wR）で出す。型ごとの wp / wn を使うと、n を左に置いたときに逆になる */
      i0 = ST.nodeAt(m, Math.max(dep.xj - dep.wL, 0));
      i1 = ST.nodeAt(m, Math.min(dep.xj + dep.wR, m.x[m.n - 1]));
      if (i1 <= i0) { i0 = Math.max(0, js[0] - 1); i1 = Math.min(m.n - 1, js[0] + 1); }
    }

    /* 1) 空乏層の中は全部拾える */
    var qDep = 0;
    if (dep) for (i = i0; i <= i1; i++) qDep += g[i] * m.siDx[i];

    /* 2) 手前の中性領域（表面から空乏層の端まで） */
    var front = null, qFront = 0, lossFront = 0;
    var siStart = PS.surfaceNode(m);
    if (dep && i0 > siStart + 1) {
      var tF = regionType(m, siStart, i0);
      var pF = minorityProps(m, siStart, i0, T, tF);
      front = diffuse(m, g, siStart, i0, pF.D, pF.tau, { s: sFront }, 'zero');
      qFront = Math.max(front.f1, 0);
      lossFront = Math.max(sFront * front.dn[0], 0);
    }

    /* 3) 奥の中性領域（空乏層の端から裏の電極まで） */
    var back = null, qBack = 0;
    if (dep && i1 < m.n - 2) {
      var tB = regionType(m, i1, m.n - 1);
      var pB = minorityProps(m, i1, m.n - 1, T, tB);
      back = diffuse(m, g, i1, m.n - 1, pB.D, pB.tau, 'zero', { s: sBack });
      qBack = Math.max(back.f0, 0);
    }

    var collected = qDep + qFront + qBack;
    var jph = P.Q * collected;
    var qe = flux > 0 ? collected / flux : 0;
    var resp = qe * nm / HC_EV_NM;

    /* 総生成（拾えたかどうかに関わらず作られた対の数） */
    var gTotal = 0;
    for (i = 0; i < m.n; i++) gTotal += g[i] * m.siDx[i];

    return {
      nm: nm, flux: flux, below: below,
      alpha: G.alpha, reflect: G.reflect, transmit: G.transmit,
      absLength: G.alpha > 0 ? 1 / G.alpha : Infinity,
      gen: g, gTotal: gTotal,
      jph: jph, qe: qe, resp: resp,
      parts: { dep: qDep, front: qFront, back: qBack },
      loss: {
        reflect: flux * G.reflect,
        transmit: G.transmit,
        surface: lossFront,
        bulk: Math.max(gTotal - collected - lossFront, 0)
      },
      depNodes: dep ? [i0, i1] : null,
      frontSol: front, backSol: back
    };
  }

  /** その範囲が p 型か（厚みで重みづけした正味の符号で決める） */
  function regionType(m, i0, i1) {
    var s = 0, i;
    for (i = i0; i <= i1; i++) s += m.net[i] * m.siDx[i];
    return s < 0;
  }

  /** 波長を掃いて量子効率の曲線を作る */
  function qeCurve(st, sol, opt, from, to, step) {
    from = from || 300; to = to || 1150; step = step || 25;
    var out = [], nm;
    for (nm = from; nm <= to; nm += step) {
      var o = {};
      for (var k in opt) o[k] = opt[k];
      o.nm = nm;
      var r = photo(st, sol, o);
      out.push({ nm: nm, qe: r.qe, resp: r.resp, jph: r.jph });
    }
    return out;
  }

  var FACTS = [
    '裸のシリコンは当たった光の 35% を跳ね返す。反射防止膜はそれを数 % まで落とすためにある。',
    '青は表面 0.1µm で全部吸われる。だから表面の作り方（S）で青の感度が決まる。',
    '1100nm より長い光は、光子のエネルギーがバンドギャップに届かないので吸われない。'
  ];

  SL.light = {
    HC_EV_NM: HC_EV_NM, photonJ: photonJ, fluxFromPower: fluxFromPower,
    generation: generation, diffuse: diffuse, photo: photo, qeCurve: qeCurve,
    minorityProps: minorityProps, regionType: regionType, FACTS: FACTS,
    COAT_MAT: COAT_MAT, coatIndex: coatIndex, siK: siK, filmReflect: filmReflect,
    reflectOf: reflectOf, quarterNm: quarterNm
  };
})(typeof window !== 'undefined' ? window : globalThis);
