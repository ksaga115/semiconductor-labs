/* 受光チェーンの設計 ― 光のパワーから SNR・NEP・D* まで
 *
 * 第5部「光検出デバイス」の物差しを、そのまま計算で踏むためのモデル。
 * 設計で決めるもの（画面の左）:
 *
 *   nm     波長 [nm]                感度 R = η·λ/1240 の λ
 *   pw     光のパワー [10^x W]       fW〜mW を指数で入れる
 *   eta    量子効率 / PDE（0〜1）     光子1個が電子1個になる確率
 *   M      増倍率                    1 = PIN。APD は 10〜100、なだれの過剰雑音 F(M) が付く
 *   k      イオン化率比              F(M) = kM + (1−k)(2−1/M)。Si は 0.1 以下、InGaAs/InP は 0.4 級
 *   delta  ダイノードの二次電子数      2 以上にすると PMT 換算（δⁿ と F=δ/(δ−1)）を別枠で出す
 *   nstg   ダイノードの段数
 *   idpa   暗電流 [pA]               ショットノイズ √(2qId) の源
 *   ifa    アンプ雑音 [fA/√Hz]       TIA など後段の床（入力換算）
 *   bmhz   帯域 [MHz]
 *   amm2   受光面積 [mm²]            D* = √A/NEP の A
 *   cpf    容量 [pF]                 50Ω 受けの RC 帯域 1/(2πRC)
 *   ncell  MPPC のセル数（0=なし）    パルス計測の飽和 fired = N(1−e^(−μ/N))
 *   nph    パルスあたりの光子数        μ = nph·η
 *   bgnw   背景光 [nW]               信号と同じ R で電流になり、ショット床 2q·Ibg·F を作る（0 = 暗室）
 *   dkcps  ダークカウント [counts/s]   計数モードの床。光ゼロでも数えてしまう分
 *   tsec   積分時間 [s]              計数の SNR = s·√t / √(s+b)（ポアソン。背景の平均は既知として引く）
 *   wum    空乏層の厚さ [µm]          走行 f_tr = 0.44·v_sat/w、容量 C = ε·A/w ― 綱引きの両端
 *   diamum 受光部の直径 [µm]          C = εA/w の A（円）
 *   freps  TCSPC のレーザー繰り返し [MHz]  パイルアップ確率 p = 計数率/繰り返し（p≲2% が定石）
 *   taufl  測りたい蛍光寿命 [ns]        繰り返し周期は寿命の5倍以上あける
 *
 * ---- 第4章（増倍の雑音と数え方）----
 *   pct    MPPC のクロストーク確率      なだれ1回が隣のセルを発火させる確率（暗計数の 1.5 p.e. 以上 ÷ 0.5 p.e. 以上で測る定義）
 *   pap    MPPC のアフターパルス確率    見かけの計数の倍率 ≈ 1 + pct + pap（小さい確率での一次近似）
 *   thr    計数のしきい値 [p.e.]         n p.e. 以上のパルスだけ数える。暗計数が n 個以上に化ける率 ≈ DCR·pct^(n−1)
 *                                        （連鎖を独立とみなす近似。n = 2 は pct の定義そのもの）
 *   mupe   信号パルスの平均 [p.e.]       ポアソンで n 以上になる確率 = 信号の検出率（クロストークによる上乗せは入れない＝控えめ側）
 *   ekev   放射線のエネルギー [keV]・ly シンチレータの光量 [光子/keV]・lce 集光効率
 *                                        光電子 N = E·LY·集光·PDE（PDE は eta）
 *   rint   結晶の固有分解能 [% FWHM]     分解能 = √((2.355·√(ENF/N))² + 固有²)、ENF = 1 + pct（MPPC のクロストーク、一次近似）
 *                                        ncell > 0 なら飽和の線形誤差 1 − N_cell(1−e^(−N/N_cell))/N も出す
 *
 * ---- 第5章（エネルギー・速さ・直線性）----
 *   wev    w 値（電子正孔対 1 組のエネルギー）[eV]・fano ファノ因子・enc 回路の雑音 [e⁻ rms]
 *                                        放射線を半導体で直接数える: N = E/w、FWHM = 2.355·w·√(F·N + ENC²)（第5部 09）
 *   ntrue  真の計数率 [/s]・dtau 不感時間 [ns]・dtype 型（0 = 非拡張 m = n/(1+nτ)、1 = 拡張 m = n·e^(−nτ)）（第5部 12）
 *   pdua   PD の光電流 [µA]・rlk 負荷 [kΩ]（0 = TIA）・vr 逆バイアス [V]
 *                                        第5部 14 の仮定の PD（I_s = V_t/1 GΩ = 25.9 pA・R_s 10 Ω・C_j0 15 pF・V_bi 0.6 V）で
 *                                        I_ph = I_s(e^(V_j/V_t) − 1) + I_L、V_j = I_L(R_s + R_L) − V_R を解き、届く割合と C_j・帯域 1/(2πR_L C_j) を出す
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない（採点が毎回同じになるように）。
 * 【モデルの外】1/f 雑音・APD の暗電流の非増倍成分・計数のパイルアップ（不感時間）は入れていない。
 * クロストークとアフターパルスは一次近似（確率が小さいとき）だけで、V_ov と温度への依存は入れていない
 * （両方とも V_ov で上がる ― 第5部 03）。飽和はクロストークが余分に使うセルを数えない。
 * 第5部の caveat と同じで、実素子の設計はデータシートから。
 */
(function (global) {
  'use strict';
  var PH = global.PH || (global.PH = {});

  var Q = 1.602176634e-19;
  var RLOAD = 50;                  /* RC 帯域の受け側 [Ω]（光通信の定番の値） */
  var EPS_SI = 11.7 * 8.854e-12;   /* Si の誘電率 [F/m] */
  var VSAT = 1e5;                  /* Si の飽和速度 [m/s]（= 10⁷ cm/s） */

  function defaults() {
    return {
      nm: 550, pw: -12, eta: 0.8,
      M: 1, k: 0.02, delta: 0, nstg: 10,
      idpa: 10, ifa: 5, bmhz: 1, amm2: 1, cpf: 1,
      ncell: 0, nph: 1000,
      bgnw: 0, dkcps: 0, tsec: 0.001,
      wum: 3, diamum: 30,
      freps: 10, taufl: 2,
      pct: 0, pap: 0, thr: 1, mupe: 10,
      ekev: 662, ly: 38, lce: 0.5, rint: 5,
      wev: 3.62, fano: 0.115, enc: 20,
      ntrue: 1e5, dtau: 20, dtype: 0,
      pdua: 10, rlk: 10, vr: 0
    };
  }

  /** ポアソン分布（平均 mu）で n 以上になる確率 */
  function poissonTail(mu, n) {
    if (n <= 0) return 1;
    var s = 0, t = Math.exp(-mu);
    for (var i = 0; i < n; i++) { s += t; t *= mu / (i + 1); }
    return Math.max(0, 1 - s);
  }

  /* 第5部 14 の仮定のフォトダイオード（300 K） */
  var PD = { IS: 1.380649e-23 * 300 / Q / 1e9, RS: 10, C0: 15e-12, VBI: 0.6 };

  /** 負荷に流れる電流 I_L を二分法で解く（I_ph = I_s(e^(V_j/V_t) − 1) + I_L、V_j = I_L(R_s + R_L) − V_R） */
  function pdLoad(Iph, RL, VR) {
    var VT = 1.380649e-23 * 300 / Q, lo = -1, hi = Iph + 1e-9, i, m;
    for (i = 0; i < 200; i++) {
      m = (lo + hi) / 2;
      var Vj = m * (PD.RS + RL) - VR;
      var f = Iph - PD.IS * Math.expm1(Math.min(Vj / VT, 700)) - m;
      if (f > 0) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  }

  /** 光電流のうち負荷に届く割合（暗いときの分を引く）と、接合容量・負荷での帯域 */
  function pdLinear(Iph, RL, VR) {
    var IL = pdLoad(Iph, RL, VR), I0 = pdLoad(0, RL, VR);
    var cj = PD.C0 / Math.sqrt(1 + Math.max(0, VR) / PD.VBI);
    return { ratio: Iph > 0 ? (IL - I0) / Iph : 1, cj: cj,
             bw: RL > 0 ? 1 / (2 * Math.PI * RL * cj) : Infinity, vj: IL * (PD.RS + RL) - VR };
  }

  /** マッキンタイアの過剰雑音指数。M=1 なら F=1 */
  function excess(M, k) {
    if (M <= 1) return 1;
    return k * M + (1 - k) * (2 - 1 / M);
  }

  /**
   * 設計 → 数字。
   * 戻り値 {
   *   P [W], Eph [eV], phi [光子/s], R [A/W], Iph [A],
   *   F, ishot, iamp, itot [A/√Hz], SNR,
   *   NEP [W/√Hz], Dstar [cm√Hz/W], Pmin [W],
   *   fRC [Hz], cps [counts/s],
   *   pmtM, pmtF（delta>=2 のときだけ）,
   *   mu, fired, linerr（ncell>0 のときだけ）
   * }
   */
  function evaluate(d) {
    var P = Math.pow(10, d.pw);
    var Eph = 1240 / d.nm;                          /* eV */
    var phi = P / (Eph * Q);                        /* 光子/s */
    var R = d.eta * d.nm / 1240;                    /* A/W */
    var Iph = R * P;
    var Id = d.idpa * 1e-12;
    var iamp = d.ifa * 1e-15;
    var B = d.bmhz * 1e6;

    var Pbg = (d.bgnw || 0) * 1e-9;                 /* 背景光は信号と同じ R で電流になる */
    var Ibg = R * Pbg;

    var M = Math.max(1, d.M);
    var F = excess(M, d.k);
    var ishot = Math.sqrt(2 * Q * (Iph + Id + Ibg) * F) * M; /* A/√Hz（出力換算） */
    var itot = Math.sqrt(ishot * ishot + iamp * iamp);
    var SNR = M * Iph / (itot * Math.sqrt(B));

    /* NEP は入力換算: 出力のノイズを利得 M·R で光に戻す。背景光があればその場の NEP（BLIP側） */
    var NEP = Math.sqrt(2 * Q * (Id + Ibg) * F + (iamp / M) * (iamp / M)) / R;
    var Dstar = Math.sqrt(d.amm2 * 0.01) / NEP;             /* A[cm²] = mm² × 0.01 */
    var Pmin = NEP * Math.sqrt(B);

    var fRC = 1 / (2 * Math.PI * RLOAD * d.cpf * 1e-12);
    var cps = phi * d.eta;                                  /* 単一光子検出として数えたとき */

    /* 計数モード: 信号 s [c/s]、床 b = 背景光の分 + ダークカウント。
       時間 t で S=s·t 個。総カウントのポアソン揺らぎ √((s+b)t) が雑音（b の平均は既知として引く） */
    var bcps = (Pbg / (Eph * Q)) * d.eta + (d.dkcps || 0);
    var t = Math.max(0, d.tsec || 0);
    var snrCount = (cps + bcps) > 0 ? cps * Math.sqrt(t) / Math.sqrt(cps + bcps) : 0;

    /* 厚さの綱引き: 薄いと C=εA/w が太って RC が遅く、厚いと走行 w/v_sat が遅い */
    var w = (d.wum || 0) * 1e-6;
    var Apd = Math.PI * Math.pow(((d.diamum || 0) * 1e-6) / 2, 2);
    var cw = (w > 0 && Apd > 0) ? EPS_SI * Apd / w : 0;
    var fRCw = cw > 0 ? 1 / (2 * Math.PI * RLOAD * cw) : Infinity;
    var ftr = w > 0 ? 0.44 * VSAT / w : Infinity;
    var ftot = (isFinite(fRCw) && isFinite(ftr))
      ? 1 / Math.sqrt(1 / (fRCw * fRCw) + 1 / (ftr * ftr)) : 0;

    /* TCSPC のパイルアップ: 1周期に光子が2個来ると早い方しか測れず、減衰カーブが速い側に歪む。
       検出確率 p = 計数率/繰り返し。周期は寿命の5倍あけないと前のパルスの尻尾を踏む */
    var frep = (d.freps || 0) * 1e6;
    var pileP = frep > 0 ? cps / frep : Infinity;
    var perNs = frep > 0 ? 1e9 / frep : Infinity;
    var tauMaxNs = perNs / 5;

    var out = {
      P: P, Eph: Eph, phi: phi, R: R, Iph: Iph, Ibg: Ibg,
      F: F, ishot: ishot, iamp: iamp, itot: itot, SNR: SNR,
      NEP: NEP, Dstar: Dstar, Pmin: Pmin, fRC: fRC,
      cps: cps, bcps: bcps, snrCount: snrCount,
      cw: cw, fRCw: fRCw, ftr: ftr, ftot: ftot,
      pileP: pileP, perNs: perNs, tauMaxNs: tauMaxNs
    };

    if (d.delta >= 2) {
      out.pmtM = Math.pow(d.delta, d.nstg);
      out.pmtF = d.delta / (d.delta - 1);
    }
    if (d.ncell > 0) {
      var mu = d.nph * d.eta;
      var fired = d.ncell * (1 - Math.exp(-mu / d.ncell));
      out.mu = mu;
      out.fired = fired;
      out.linerr = mu > 0 ? 1 - fired / mu : 0;
    }

    /* ---- 第4章 ---- */
    var pct = d.pct || 0, pap = d.pap || 0;
    out.appar = 1 + pct + pap;                     /* 見かけの計数 ÷ 本当の光電子（一次近似） */
    out.enfXt = 1 + pct;                           /* クロストークの過剰雑音（一次近似） */

    /* しきい値で数える: 暗計数のうち n p.e. 以上に化けるもの・信号のうち n p.e. 以上に届くもの */
    var thr = Math.max(1, Math.round(d.thr || 1));
    out.thr = thr;
    out.falseCps = (d.dkcps || 0) * Math.pow(pct, thr - 1);
    out.sigEff = poissonTail(d.mupe || 0, thr);

    /* シンチレータ＋光検出器のエネルギー分解能 */
    var scNph = (d.ekev || 0) * (d.ly || 0);
    var scNpe = scNph * (d.lce || 0) * d.eta;
    var scStat = scNpe > 0 ? 2.355 * Math.sqrt(out.enfXt / scNpe) : Infinity;
    var scInt = (d.rint || 0) / 100;
    out.scNph = scNph;
    out.scNpe = scNpe;
    out.scStat = scStat;
    out.scRes = Math.sqrt(scStat * scStat + scInt * scInt);
    if (d.ncell > 0 && scNpe > 0) {
      out.scLin = 1 - d.ncell * (1 - Math.exp(-scNpe / d.ncell)) / scNpe;
    }

    /* ---- 第5章 ---- */
    /* 放射線を半導体で直接数える: 対の数と分解能 */
    var wev = d.wev || 3.62, xN = (d.ekev || 0) * 1000 / wev;
    out.xN = xN;
    out.xFano = 2.355 * wev * Math.sqrt((d.fano || 0) * xN);
    out.xFwhm = 2.355 * wev * Math.sqrt((d.fano || 0) * xN + (d.enc || 0) * (d.enc || 0));
    out.xRel = xN > 0 ? out.xFwhm / ((d.ekev || 0) * 1000) : Infinity;
    /* 不感時間 */
    var nt = d.ntrue || 0, tau = (d.dtau || 0) * 1e-9;
    out.mCount = d.dtype ? nt * Math.exp(-nt * tau) : nt / (1 + nt * tau);
    out.deadLoss = nt > 0 ? 1 - out.mCount / nt : 0;
    out.deadPeak = tau > 0 ? 1 / (Math.E * tau) : Infinity;
    /* フォトダイオードの直線性 */
    var pd = pdLinear((d.pdua || 0) * 1e-6, (d.rlk || 0) * 1e3, d.vr || 0);
    out.pdRatio = pd.ratio; out.pdCj = pd.cj; out.pdBw = pd.bw; out.pdVj = pd.vj;
    return out;
  }

  /** M を掃いて SNR を返す（図と「最適な M がある」ことの確認用） */
  function snrSweep(d, mMin, mMax, n) {
    mMin = mMin || 1; mMax = mMax || 300; n = n || 80;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var m = mMin * Math.pow(mMax / mMin, i / n);
      var dd = {}; for (var kk in d) dd[kk] = d[kk];
      dd.M = m;
      out.push({ M: m, snr: evaluate(dd).SNR });
    }
    return out;
  }

  PH.photon = {
    Q: Q, RLOAD: RLOAD,
    defaults: defaults, excess: excess, evaluate: evaluate, snrSweep: snrSweep, poissonTail: poissonTail,
    pdLinear: pdLinear, PD: PD
  };
})(typeof window !== 'undefined' ? window : globalThis);
