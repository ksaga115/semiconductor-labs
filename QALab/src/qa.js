/* 信頼性と品質の設計 ― FIT・加速試験・ワイブル・熱・TEC・Cpk・誤差伝播
 *
 * 第8部『信頼性と品質』の式を、そのまま計算で踏むモデル。
 *
 * 設計で決めるもの（画面の左）:
 *   fitr   部品1個の故障率 [FIT]      1 FIT = 10⁻⁹ 故障/時間
 *   nser   直列の部品数               どれが壊れても系が止まる構成
 *   ea     活性化エネルギー [eV]       アレニウス加速の肩
 *   tuse   使用温度 [℃]
 *   tstr   試験温度 [℃]
 *   lifey  実証したい寿命 [年]
 *   mweib  ワイブルの形状 m           <1 初期故障 / ≈1 偶発 / >1 摩耗
 *   etah   ワイブルの尺度 η [h]       63.2% が壊れる時間
 *   pwr    発熱 [W]
 *   thjc, thcs, thsa  熱抵抗 [K/W]    ジャンクション→ケース→シート→大気
 *   tamb   周囲温度 [℃]
 *   qmax   TEC の最大吸熱 [W]（ΔT=0）
 *   dtmax  TEC の最大温度差 [K]（Q=0）
 *   dtc    使う温度差 [K]
 *   qload  冷やしたい熱負荷 [W]
 *   sigma  工程のばらつき σ
 *   muoff  平均の規格中心からのずれ
 *   tol    規格の片幅（±tol）
 *   s1,s2  独立な誤差 [%]             合成は2乗和の平方根
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない。
 * 【モデルの外】ワイブルの当てはめ（プロット）・TECの電流最適化・
 * 非正規分布・系統誤差は入れていない。
 */
(function (global) {
  'use strict';
  var QA = global.QA || (global.QA = {});

  var KB_EV = 8.617333e-5;     /* ボルツマン定数 [eV/K] */
  var HOURS_Y = 8760;

  function defaults() {
    return {
      fitr: 100, nser: 100, ea: 0.7, tuse: 55, tstr: 125, lifey: 10,
      mweib: 1, etah: 20000,
      pwr: 2, thjc: 1.5, thcs: 0.5, thsa: 30, tamb: 40,
      qmax: 5, dtmax: 70, dtc: 60, qload: 1.2,
      sigma: 0.1, muoff: 0.05, tol: 0.3,
      s1: 0.3, s2: 0.6
    };
  }

  /** 誤差関数（Abramowitz & Stegun 7.1.26、|誤差| < 1.5×10⁻⁷） */
  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }
  /** 標準正規の累積分布 */
  function phi(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

  /**
   * 設計 → 数字。
   * 戻り値 {
   *   lamFit（系のFIT）, mttfH, mttfY,
   *   af（加速係数）, testH（実証に要る試験時間）,
   *   b10H（10%が壊れる時間）,
   *   tj（ジャンクション温度）, thTot,
   *   qc（そのΔTでのTEC吸熱）, tecOk,
   *   cpk, ppm, stot
   * }
   */
  function evaluate(d) {
    var lamFit = d.fitr * d.nser;
    var mttfH = 1e9 / lamFit;
    var mttfY = mttfH / HOURS_Y;

    var Tu = d.tuse + 273.15, Ts = d.tstr + 273.15;
    var af = Math.exp(d.ea / KB_EV * (1 / Tu - 1 / Ts));
    var testH = d.lifey * HOURS_Y / af;

    var b10H = d.etah * Math.pow(-Math.log(0.9), 1 / d.mweib);

    var thTot = d.thjc + d.thcs + d.thsa;
    var tj = d.tamb + d.pwr * thTot;

    var qc = Math.max(0, d.qmax * (1 - d.dtc / d.dtmax));
    var tecOk = qc >= d.qload;

    var cpk = d.sigma > 0 ? (d.tol - Math.abs(d.muoff)) / (3 * d.sigma) : 0;
    var zHi = (d.tol - d.muoff) / d.sigma;
    var zLo = (d.tol + d.muoff) / d.sigma;
    var ppm = ((1 - phi(zHi)) + (1 - phi(zLo))) * 1e6;

    var stot = Math.sqrt(d.s1 * d.s1 + d.s2 * d.s2);

    return {
      lamFit: lamFit, mttfH: mttfH, mttfY: mttfY,
      af: af, testH: testH, b10H: b10H,
      tj: tj, thTot: thTot,
      qc: qc, tecOk: tecOk,
      cpk: cpk, ppm: ppm, stot: stot
    };
  }

  /** 試験温度を掃いて AF と試験時間を返す（加速の相場観の図） */
  function afSweep(d, tMin, tMax, n) {
    tMin = tMin || 60; tMax = tMax || 200; n = n || 80;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = tMin + (tMax - tMin) * i / n;
      var dd = {}; for (var k in d) dd[k] = d[k];
      dd.tstr = t;
      var ev = evaluate(dd);
      out.push({ t: t, af: ev.af, testH: ev.testH });
    }
    return out;
  }

  /** ΔT を掃いて TEC の吸熱を返す（冷却の請求書の図） */
  function tecSweep(d, n) {
    n = n || 80;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var dt = d.dtmax * i / n;
      var dd = {}; for (var k in d) dd[k] = d[k];
      dd.dtc = dt;
      out.push({ dt: dt, qc: evaluate(dd).qc });
    }
    return out;
  }

  QA.qa = {
    KB_EV: KB_EV, HOURS_Y: HOURS_Y,
    defaults: defaults, evaluate: evaluate, erf: erf, phi: phi,
    afSweep: afSweep, tecSweep: tecSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
