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
 *   rhu,rhs  使用/試験の相対湿度 [%]    Peck: AF = (RHs/RHu)^n · exp(Ea_h/k(1/Tu−1/Ts))
 *   thu,ths  湿度試験の使用/試験温度 [℃]
 *   npeck    湿度のべき n（Peck 1986 の原典値 2.7。慣例で 3 に丸めることが多い）
 *   eah      湿度側の Ea [eV]（Peck 1986 の原典値 0.79）
 *   dtu,dts  使用/試験の温度サイクル振幅 ΔT [K]
 *   ncm      Coffin-Manson のべき（はんだ ≈ 2）
 *   cyd      使用でのサイクル数 [回/日]
 *   srpt     測定系の繰り返し σ（同じ人が同じ物を測り直したときのばらつき）
 *   srpd     測定系の再現性 σ（人・日・器差のばらつき）
 *            %GR&R = 6·√(srpt²+srpd²) / (2·tol) ― 公差に対する測定系の取り分
 *   klim     管理限界の幅 kσ（ふつう 3）   空振り p0 = 2(1−Φ(k))、ARL0 = 1/p0
 *   ngrp     群の大きさ n                 見逃し: ずれ δσ は群の平均では δ√n に見える
 *   shsig    見つけたい平均のずれ δ [σ]    p1 = Φ(−k+δ√n) + Φ(−k−δ√n)、ARL1 = 1/p1
 *   ucal     校正証明書の拡張不確かさ [%]（k = 2）  GUM: u_c = √((U/2)² + (a/√3)² + (s/√n)² + (b/√3)²)
 *   resd     表示の分解能の半幅 [%]・srep 繰り返しの標準偏差 [%]・nrep 平均の回数・tco 温度の影響の半幅 [%]
 *   tmu,tms  温度サイクルの使用/試験の最高温度 [℃]・cfs 試験の周波数 [回/日]（使用の周波数は cyd）
 *   nnl,mnl,eknl  Norris-Landzberg の定数（SnPb の原典値 1.9・1/3・1414 K ― Norris & Landzberg 1969）
 *            AF = (ΔTs/ΔTu)^n · (fu/fs)^m · exp(Ea/k·(1/Tmax,u − 1/Tmax,s))
 *   spv      部品のばらつき σ（GR&R に使う部品が工程を代表しているとして）
 *            ndc = 1.41·σ部品/σ測定（小数は切り捨て）― AIAG MSA の有効区分数
 *   aql,ltpd 合格品質水準・ロット許容不良率 [%]・alp,bet 生産者危険・消費者危険 [%]
 *   nsmp,cacc 1 回抜き取りのサンプル数 n と合格判定数 c
 *            合格の確率 Pa(p) = Σ_{k≤c} C(n,k) p^k (1−p)^(n−k)（二項分布の OC 曲線）
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない。
 * 【モデルの外】ワイブルの当てはめ（プロット）・TECの電流最適化・
 * 非正規分布・系統誤差・電圧/電流密度の加速は入れていない。
 * GR&R の分散分析の表そのもの（部品×測定者の交互作用の分離）と、JIS Z 9015 の切り替えの規則は入れていない。
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
      s1: 0.3, s2: 0.6,
      rhu: 60, rhs: 60, thu: 40, ths: 60, npeck: 3, eah: 0.79,
      dtu: 30, dts: 60, ncm: 2, cyd: 1,
      srpt: 0.02, srpd: 0.006,
      klim: 3, ngrp: 1, shsig: 1,
      ucal: 2, resd: 0.5, srep: 0.5, nrep: 1, tco: 0.2,
      tmu: 55, tms: 125, cfs: 24, nnl: 1.9, mnl: 1 / 3, eknl: 1414,
      spv: 0.03,
      aql: 1, ltpd: 5, alp: 5, bet: 10, nsmp: 50, cacc: 1
    };
  }

  /** 二項分布の累積 P(X ≤ c)、X ~ Bin(n, p)。対数で足して桁あふれを避ける */
  function binCdf(c, n, p) {
    if (c >= n) return 1;
    if (c < 0) return 0;
    if (p <= 0) return 1;
    if (p >= 1) return 0;
    var s = 0, lnc = 0, k;
    for (k = 0; k <= c; k++) {
      if (k > 0) lnc += Math.log((n - k + 1) / k);
      s += Math.exp(lnc + k * Math.log(p) + (n - k) * Math.log(1 - p));
    }
    return Math.min(1, s);
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

    /* Peck（湿度加速）: 温度の分は同じアレニウス、湿度の分は RH のべき乗 */
    var Thu = (d.thu || 0) + 273.15, Ths = (d.ths || 0) + 273.15;
    var afh = Math.pow((d.rhs || 1) / (d.rhu || 1), d.npeck || 0)
            * Math.exp((d.eah || 0) / KB_EV * (1 / Thu - 1 / Ths));
    var testHh = d.lifey * HOURS_Y / afh;

    /* Coffin-Manson（温度サイクル）: 寿命サイクル数 ∝ ΔT^(−n) → AF = (ΔTs/ΔTu)^n */
    var afcm = Math.pow((d.dts || 1) / (d.dtu || 1), d.ncm || 0);
    var cycUse = d.lifey * 365 * (d.cyd || 0);
    var testCyc = afcm > 0 ? cycUse / afcm : Infinity;

    /* GR&R の入口: 測定系のばらつきは繰り返しと再現性の二乗和。公差に対する取り分で判定 */
    var sgrr = Math.sqrt((d.srpt || 0) * (d.srpt || 0) + (d.srpd || 0) * (d.srpd || 0));
    var pgrr = d.tol > 0 ? 6 * sgrr / (2 * d.tol) : Infinity;

    /* 管理図（X̄ 図・正規・独立）: 空振りの確率 p0 と、平均が δσ ずれたときに 1 群で見つかる確率 p1。
       ARL（平均の連の長さ）はその逆数。群の平均の σ は σ/√n なので、ずれは δ√n に見える */
    var k = d.klim || 3, dn = (d.shsig || 0) * Math.sqrt(d.ngrp || 1);
    var p0 = 2 * (1 - phi(k));
    var p1 = phi(-k + dn) + phi(-k - dn);
    var arl0 = 1 / p0, arl1 = 1 / p1;

    /* 測定の不確かさ（GUM）: 校正（U を k=2 で割る）・分解能（半幅の矩形 a/√3）・
       繰り返し（平均の s/√n、タイプ A）・温度（半幅の矩形）を二乗和で合成。拡張は k = 2 */
    var ucg = Math.sqrt(Math.pow((d.ucal || 0) / 2, 2) + Math.pow((d.resd || 0) / Math.sqrt(3), 2)
      + Math.pow((d.srep || 0) / Math.sqrt(d.nrep || 1), 2) + Math.pow((d.tco || 0) / Math.sqrt(3), 2));

    /* Norris-Landzberg: Coffin-Manson に周波数（クリープの時間）と最高温度の補正を掛ける。
       試験を速く回すほど fu/fs が小さくなり AF は下がる */
    var Tmu = (d.tmu || 0) + 273.15, Tms = (d.tms || 0) + 273.15;
    var afnl = Math.pow((d.dts || 1) / (d.dtu || 1), d.nnl || 0)
             * Math.pow((d.cyd || 1) / (d.cfs || 1), d.mnl || 0)
             * Math.exp((d.eknl || 0) * (1 / Tmu - 1 / Tms));
    var cycNl = afnl > 0 ? cycUse / afnl : Infinity;
    var daysNl = cycNl / (d.cfs || 1);

    /* ndc（有効区分数）: 部品の違いを測定系が何段に見分けられるか。1.41 ≈ √2（AIAG MSA） */
    var spv = d.spv || 0;
    var ndcRaw = sgrr > 0 ? 1.41 * spv / sgrr : Infinity;
    var ndc = Math.floor(ndcRaw + 1e-9);
    var tv = Math.sqrt(sgrr * sgrr + spv * spv);
    var pgrrTv = tv > 0 ? sgrr / tv : 0;

    /* 1 回抜き取り (n, c) の OC: AQL での合格の確率と、LTPD での合格の確率 */
    var nS = Math.round(d.nsmp || 0), cS = Math.round(d.cacc || 0);
    var paAql = binCdf(cS, nS, (d.aql || 0) / 100);
    var paLtpd = binCdf(cS, nS, (d.ltpd || 0) / 100);

    return {
      afnl: afnl, cycNl: cycNl, daysNl: daysNl,
      ndcRaw: ndcRaw, ndc: ndc, pgrrTv: pgrrTv, tv: tv,
      paAql: paAql, paLtpd: paLtpd, alphaAct: 1 - paAql, betaAct: paLtpd,
      lamFit: lamFit, mttfH: mttfH, mttfY: mttfY,
      af: af, testH: testH, b10H: b10H,
      tj: tj, thTot: thTot,
      qc: qc, tecOk: tecOk,
      cpk: cpk, ppm: ppm, stot: stot,
      afh: afh, testHh: testHh,
      afcm: afcm, cycUse: cycUse, testCyc: testCyc,
      sgrr: sgrr, pgrr: pgrr,
      p0: p0, p1: p1, arl0: arl0, arl1: arl1,
      ucg: ucg, Ug: 2 * ucg
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

  /** 不良率 p を掃いて合格の確率を返す（OC 曲線） */
  function ocSweep(d, pMax, n) {
    pMax = pMax || 0.1; n = n || 100;
    var out = [], nS = Math.round(d.nsmp || 0), cS = Math.round(d.cacc || 0);
    for (var i = 0; i <= n; i++) {
      var p = pMax * i / n;
      out.push({ p: p, pa: binCdf(cS, nS, p) });
    }
    return out;
  }

  QA.qa = {
    KB_EV: KB_EV, HOURS_Y: HOURS_Y,
    defaults: defaults, evaluate: evaluate, erf: erf, phi: phi, binCdf: binCdf,
    afSweep: afSweep, tecSweep: tecSweep, ocSweep: ocSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
