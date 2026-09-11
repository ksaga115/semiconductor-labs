/* 物理定数と材料 ― このアプリが信じている数値
 *
 * 単位系は半導体の現場に合わせる。長さは cm、濃度は cm^-3、誘電率は F/cm。
 * （画面に出すときだけ µm や nm に直す。内部では絶対に混ぜない ―
 *   ここを混ぜると、空乏層幅が 1e4 倍ずれても気付けない）
 *
 * 【ni をどう決めたか ― ここは誠実に書いておく】
 *
 * 教科書はたいてい 300K のシリコンについて次の3つを並べる:
 *
 *     Eg = 1.12 eV      Nc = 2.8e19 cm^-3      Nv = 1.04e19 cm^-3
 *
 * ところが ni = sqrt(Nc*Nv) * exp(-Eg/2kT) にこの3つを入れると 6.9e9 が出る。
 * 一方、同じ教科書が ni = 1.0e10（古い本では 1.45e10）と書いている。
 * **この3つは互いに整合していない。** 有名な話で、どちらかが間違いというより、
 * Nc・Nv は有効質量から出した理論値、ni は実測値、という出どころの違い。
 *
 * このアプリは **ni = 1.0e10（実測側）を採る**。理由は、下流の式
 * （ビルトイン電位、少数キャリア濃度、ダイオードの飽和電流）がどれも ni に
 * 強く依存していて、手計算で確かめるときに誰もが 1e10 を使うから。
 * Nc・Nv はバンド図で Ef が Ec からどれだけ下かを描くのにしか使っていない。
 * そこでの 40meV ほどのずれは絵では見えない。
 *
 * 温度を変えたときは、実測値 1.0e10 を起点にして、
 * T^1.5 と Varshni の Eg(T) で動かす（形は物理、目盛りは実測）。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});

  /* ---- 普遍定数 ---- */
  var Q = 1.602176634e-19;          /* 電気素量 [C] */
  var KB_EV = 8.617333262e-5;       /* ボルツマン定数 [eV/K] */
  var EPS0 = 8.8541878128e-14;      /* 真空の誘電率 [F/cm] */
  var H_EVS = 4.135667696e-15;      /* プランク定数 [eV*s] */
  var C_CMS = 2.99792458e10;        /* 光速 [cm/s] */

  var T300 = 300;
  var NI300 = 1.0e10;               /* 300K の真性キャリア濃度 [cm^-3]（実測側を採用） */

  /* ---- シリコン（300K 基準） ---- */
  var SI = {
    key: 'si',
    name: 'シリコン',
    epsR: 11.7,
    chi: 4.05,                      /* 電子親和力 [eV]（真空準位から Ec まで） */
    nc300: 2.8e19,
    nv300: 1.04e19,
    /* Varshni: Eg(T) = Eg0 - a T^2 / (T + b)。300K で 1.124 eV になる */
    eg0: 1.1700, egA: 4.73e-4, egB: 636
  };

  var OX = { key: 'ox', name: '酸化膜', epsR: 3.9, eg: 9.0, chi: 0.95 };
  var METAL = { key: 'metal', name: '金属' };

  /* ---- 温度で動く量 ---- */

  /** 熱電圧 kT/q [V] */
  function vt(T) { return KB_EV * T; }

  /** バンドギャップ [eV]（Varshni） */
  function eg(T) { return SI.eg0 - SI.egA * T * T / (T + SI.egB); }

  /**
   * 真性キャリア濃度 [cm^-3]。
   * 300K の実測値を起点に、状態密度の T^1.5 と Eg(T) で動かす。
   */
  function ni(T) {
    var r = T / T300;
    var e = Math.exp(eg(T300) / (2 * vt(T300)) - eg(T) / (2 * vt(T)));
    return NI300 * Math.pow(r, 1.5) * e;
  }

  function nc(T) { return SI.nc300 * Math.pow(T / T300, 1.5); }
  function nv(T) { return SI.nv300 * Math.pow(T / T300, 1.5); }

  /* ---- 移動度 ― Caughey-Thomas（不純物が増えると散乱で遅くなる） ----
   *
   *   µ = µmin + (µmax - µmin) / (1 + (N/Nref)^a)
   *
   * N は不純物の総量（Na + Nd）。打ち消し合っていても散乱はする ―
   * ここを |Nd - Na| にすると、補償した層が不自然に速くなる。
   */
  var MU_N = { min: 92, max: 1268, nref: 1.3e17, a: 0.91 };
  var MU_P = { min: 54.3, max: 406.9, nref: 2.35e17, a: 0.88 };

  function mu(par, ntot, T) {
    var m = par.min + (par.max - par.min) / (1 + Math.pow(ntot / par.nref, par.a));
    /* 格子散乱の温度依存（近似）。300K を基準に T^-2.3。
     * 【ざっくりであることを明記】これは不純物散乱の分にまで同じ倍率を掛けている。
     * 実物では不純物散乱は温度が上がるとむしろ弱まるので、濃い層の高温の移動度は
     * 低めに出る。温度を振る課題は無いので、これで済ませている */
    return m * Math.pow(T / T300, -2.3);
  }

  function muN(ntot, T) { return mu(MU_N, Math.max(ntot, 1), T || T300); }
  function muP(ntot, T) { return mu(MU_P, Math.max(ntot, 1), T || T300); }

  /** アインシュタインの関係 D = (kT/q) µ [cm^2/s] */
  function diff(m, T) { return m * vt(T || T300); }

  /* ---- 少数キャリア寿命 ― SRH（不純物が増えると短くなる） ---- */
  var TAU0 = 1e-5;                  /* 低濃度での寿命 [s]（10 µs） */
  var TAU_NREF = 5e16;

  function tau(ntot) { return TAU0 / (1 + ntot / TAU_NREF); }

  /** 拡散長 L = sqrt(D τ) [cm] */
  function diffLen(d, t) { return Math.sqrt(d * t); }

  /* ---- 光の吸収 ― Green & Keevers (1995) の実測を対数で内挿 ----
   *
   * シリコンは間接遷移なので、バンド端の近くで吸収が桁で落ちる。
   * 1100nm で 3.5 cm^-1 ＝ 平均して 2.9mm 進まないと吸われない。
   * だから近赤外のフォトダイオードは厚みが要る ― この表がその理由そのもの。
   */
  var ALPHA = [
    [250, 1.84e6], [300, 1.73e6], [350, 1.05e6], [400, 9.52e4], [450, 2.65e4],
    [500, 1.11e4], [550, 6.55e3], [600, 4.14e3], [650, 2.80e3], [700, 1.90e3],
    [750, 1.33e3], [800, 8.50e2], [850, 5.35e2], [900, 3.06e2], [950, 1.53e2],
    [1000, 6.40e1], [1050, 1.60e1], [1100, 3.50e0], [1150, 3.0e-1], [1200, 2.0e-2]
  ];

  /** 吸収係数 [cm^-1]。表の外は端の値で止める（外挿はしない） */
  function alpha(nm) {
    var a = ALPHA, i;
    if (nm <= a[0][0]) return a[0][1];
    if (nm >= a[a.length - 1][0]) return a[a.length - 1][1];
    for (i = 1; i < a.length; i++) {
      if (nm <= a[i][0]) {
        var t = (nm - a[i - 1][0]) / (a[i][0] - a[i - 1][0]);
        /* α は桁で変わるので、対数の上で直線に結ぶ */
        return Math.exp(Math.log(a[i - 1][1]) * (1 - t) + Math.log(a[i][1]) * t);
      }
    }
    return 0;
  }

  /** 屈折率（反射の計算用。実部だけ） */
  var NREF = [[400, 5.57], [500, 4.30], [600, 3.95], [700, 3.79], [800, 3.68], [900, 3.60], [1000, 3.57], [1100, 3.55]];

  function nIndex(nm) {
    var a = NREF, i;
    if (nm <= a[0][0]) return a[0][1];
    if (nm >= a[a.length - 1][0]) return a[a.length - 1][1];
    for (i = 1; i < a.length; i++) {
      if (nm <= a[i][0]) {
        var t = (nm - a[i - 1][0]) / (a[i][0] - a[i - 1][0]);
        return a[i - 1][1] * (1 - t) + a[i][1] * t;
      }
    }
    return 3.6;
  }

  /** 空気からシリコンへ入るときに跳ね返される割合。反射防止膜なしの裸のシリコン */
  function reflect(nm) {
    var n = nIndex(nm);
    var r = (n - 1) / (n + 1);
    return r * r;
  }

  /** 光子1個のエネルギー [eV] */
  function photonEV(nm) { return H_EVS * C_CMS / (nm * 1e-7); }

  /* ---- 便利 ---- */

  /** 中性を保つ電位 [V]。Nd-Na = N のシリコンが落ち着く電位 */
  function neutralPsi(net, T) {
    return vt(T) * Math.asinh(net / (2 * ni(T)));
  }

  /** 金属の仕事関数 [eV]。n+ ポリシリコンは Ec の位置＝電子親和力そのもの */
  var WORKFN = {
    'n+poly': SI.chi,
    'p+poly': SI.chi + 1.12,
    'al': 4.10,
    'w': 4.55
  };

  var FACTS = [
    '真性シリコンは 300K で 1cm^3 に 1e10 個しかキャリアがいない。原子は 5e22 個 ― 5兆個に1個。',
    '不純物を 1e15 入れるだけでキャリアが10万倍になる。半導体が「半」導体でいられるのはこの効き方のせい。',
    'µ は不純物が増えると落ちる。濃く入れれば入れるほど速くなるわけではない。'
  ];

  SL.phys = {
    Q: Q, KB_EV: KB_EV, EPS0: EPS0, T300: T300, NI300: NI300,
    SI: SI, OX: OX, METAL: METAL, WORKFN: WORKFN, FACTS: FACTS,
    vt: vt, eg: eg, ni: ni, nc: nc, nv: nv,
    muN: muN, muP: muP, diff: diff, tau: tau, diffLen: diffLen,
    alpha: alpha, nIndex: nIndex, reflect: reflect, photonEV: photonEV,
    neutralPsi: neutralPsi
  };
})(typeof window !== 'undefined' ? window : globalThis);
