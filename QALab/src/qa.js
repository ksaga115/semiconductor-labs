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
 *   lmp1,lmt1,lmp2,lmt2  LM-80 の 2 点の光束維持率 [%] と時間 [h]   Φ(t) = B·exp(−αt) を 2 点から決める（IES TM-21）
 *   lmT      LM-80 の試験時間 [h]・lmN 試料の数・lmP 寿命の基準 [%]（L70 なら 70）
 *            Lp = ln(B/p)/α。報告できるのは試験時間の 6 倍（試料 20 個以上）・5.5 倍（10〜19 個）まで
 *   lamr     冗長にする部品の故障率 λ [/h]・mttr 交換までの時間 [h]・trep 全部を新品にする周期 [年]
 *            2 台並列: 修理なし 1.5/λ、修理 1 か所 (3λ+μ)/(2λ²)。多数決（3 台中 2 台）: 3R²−2R³
 *   deff,dsig,drep  2² 要因計画で見つけたい効果 Δ・試行のばらつき σ・条件ごとの繰り返しの回数
 *            N = 4·回数、効果の標準誤差 2σ/√N、両側 5% の検出力 Φ(Δ/SE − 1.96) + Φ(−Δ/SE − 1.96)
 *   nfa,hfa,rfa,cla  再試験の個数・時間 [h]・見込む故障の数・信頼水準 [%]（AF は ea・tuse・tstr から）
 *            故障率の上限 λ = m/(n·t·AF)。m は P(N ≤ r; m) = 1 − 信頼水準 の解（r = 0 で −ln(1 − 信頼水準)、χ²(2r+2)/2 と同じ値）
 *   lpw,plim,od  レーザーの出力 [mW]・弱めたい上限 [mW]・保護めがねの光学濃度 OD   透過 = P·10^(−OD)
 *            pvis 調整でビームが見える下限 [mW]（仮定）。上限そのもの（AEL・MPE）は規格の手順で決める値で、ここでは与える
 *   sgw,drf,tavg  白色雑音の大きさ σw・ドリフト D [/s]・平均の時間 τ [s]   σ(τ) = √(σw²/τ + (Dτ)²/2)、最適 τ = (σw/D)^(2/3)
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない。
 * 【モデルの外】ワイブルの当てはめ（プロット）・TECの電流最適化・
 * 非正規分布・系統誤差・電圧/電流密度の加速は入れていない。
 * GR&R の分散分析の表そのもの（部品×測定者の交互作用の分離）と、JIS Z 9015 の切り替えの規則は入れていない。
 * TM-21 の当てはめの区間の規則（最後の 5,000 h）・冗長の共通原因と修理の失敗・一部実施の交絡は入れていない。
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
      aql: 1, ltpd: 5, alp: 5, bet: 10, nsmp: 50, cacc: 1,
      lmp1: 99.0, lmt1: 1000, lmp2: 97.0, lmt2: 6000, lmT: 6000, lmN: 20, lmP: 70,
      lamr: 2e-5, mttr: 168, trep: 1,
      deff: 3, dsig: 2, drep: 2,
      nfa: 231, rfa: 0, cla: 60, hfa: 1000,
      lpw: 100, plim: 1, pvis: 0.1, od: 1,
      sgw: 1, drf: 0.001, tavg: 1000
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

  /** 0〜r 個の故障を見たとき、信頼水準 cl での期待故障数の上限 m（P(N ≤ r; m) = 1 − cl を二分法で解く）。
   *  r = 0 なら m = −ln(1 − cl)（60% で 0.916、90% で 2.303）。χ²(cl; 2r+2)/2 と同じ値 */
  function poisUpper(r, cl) {
    r = Math.max(0, Math.round(r));
    var lo = 0, hi = 50 + 10 * r, i, k;
    for (i = 0; i < 200; i++) {
      var m = (lo + hi) / 2, t = Math.exp(-m), s = t;
      for (k = 1; k <= r; k++) { t *= m / k; s += t; }
      if (s > 1 - cl) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

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

    /* TM-21: 2 点から Φ(t) = B·exp(−αt) を決めて Lp を外挿。報告できるのは試験時間の k 倍まで
       （試料 20 個以上で 6 倍、10〜19 個で 5.5 倍、10 個未満は TM-21 の外） */
    var lmA = Math.log((d.lmp1 || 1) / (d.lmp2 || 1)) / ((d.lmt2 || 1) - (d.lmt1 || 0));
    var lmB = (d.lmp1 || 0) / 100 * Math.exp(lmA * (d.lmt1 || 0));
    var lpCalc = lmA > 0 ? Math.log(lmB / ((d.lmP || 70) / 100)) / lmA : Infinity;
    var nN = Math.round(d.lmN || 0), kTm = nN >= 20 ? 6 : (nN >= 10 ? 5.5 : 0);
    var lpCap = kTm * (d.lmT || 0);
    var lpRep = Math.min(lpCalc, lpCap);

    /* 冗長（同じ部品・独立に壊れる）: 2 台並列の MTTF（修理なし・修理 1 か所）と、
       全部を周期 T で新品にするときの、周期の終わりの生存率 */
    var lamr = d.lamr || 0, mu = d.mttr > 0 ? 1 / d.mttr : 0;
    var mttfPar = lamr > 0 ? 1.5 / lamr : Infinity;
    var mttfRep = lamr > 0 ? (3 * lamr + mu) / (2 * lamr * lamr) : Infinity;
    var r1 = Math.exp(-lamr * HOURS_Y * (d.trep || 0));
    var rPar = 1 - (1 - r1) * (1 - r1), rSer = r1 * r1, rVote = 3 * r1 * r1 - 2 * r1 * r1 * r1;
    var tCross = lamr > 0 ? Math.LN2 / (lamr * HOURS_Y) : Infinity;   /* 多数決が単体と入れ替わる年（R = 0.5） */

    /* 2² 要因計画: 効果 = 高の平均 − 低の平均 → 標準誤差 2σ/√N。両側 5% の判定の検出力 */
    var doeN = 4 * Math.round(d.drep || 0);
    var doeSE = doeN > 0 ? 2 * (d.dsig || 0) / Math.sqrt(doeN) : Infinity;
    var dz = doeSE > 0 && isFinite(doeSE) ? (d.deff || 0) / doeSE : 0;
    var doePow = phi(dz - 1.959964) + phi(-dz - 1.959964);

    /* 故障率の信頼の上限（第8部 01・11）: 期待故障数の上限 m を、使用条件に換算した総台時間で割る */
    var mFa = poisUpper(d.rfa || 0, (d.cla || 60) / 100);
    var devHfa = Math.round(d.nfa || 0) * (d.hfa || 0) * af;
    var fitUp = devHfa > 0 ? mFa / devHfa * 1e9 : Infinity;

    /* 保護めがねの光学濃度（第8部 12）: 透過 = P·10^(−OD) */
    var odT = (d.lpw || 0) * Math.pow(10, -(d.od || 0));
    var odNeed = d.plim > 0 ? Math.log10((d.lpw || 0) / d.plim) : Infinity;

    /* アラン偏差（第8部 13）: 白色雑音＋直線のドリフト */
    var sgw = d.sgw || 0, drf = d.drf || 0, tav = d.tavg > 0 ? d.tavg : 1;
    var sigA = Math.sqrt(sgw * sgw / tav + Math.pow(drf * tav, 2) / 2);
    var tOpt = drf > 0 ? Math.pow(sgw / drf, 2 / 3) : Infinity;
    var sigMin = isFinite(tOpt) ? Math.sqrt(sgw * sgw / tOpt + Math.pow(drf * tOpt, 2) / 2) : 0;

    return {
      afnl: afnl, cycNl: cycNl, daysNl: daysNl,
      lmA: lmA, lmB: lmB, lpCalc: lpCalc, lpK: kTm, lpCap: lpCap, lpRep: lpRep,
      mttfPar: mttfPar, mttfRep: mttfRep, r1: r1, rPar: rPar, rSer: rSer, rVote: rVote, tCross: tCross,
      doeN: doeN, doeSE: doeSE, doePow: doePow,
      mFa: mFa, devHfa: devHfa, fitUp: fitUp, odT: odT, odNeed: odNeed, sigA: sigA, tOpt: tOpt, sigMin: sigMin,
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
    defaults: defaults, evaluate: evaluate, erf: erf, phi: phi, binCdf: binCdf, poisUpper: poisUpper,
    afSweep: afSweep, tecSweep: tecSweep, ocSweep: ocSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
