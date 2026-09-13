/* 光源とレーザーの設計 ― 黒体・LED・レーザーのしきい値と傾き・温度・縦モード・DFB・モード同期
 *
 * 第9部『光源とレーザー』の式を、そのまま計算で踏むモデル。
 *
 * 設計で決めるもの（画面の左）:
 *   tk      黒体の温度 [K]                 λmax = 2898 µm·K / T、可視（400〜700 nm）の割合はプランクの式を積分
 *   etainj  LED の注入効率・iqe 内部量子効率・extr 取り出し効率
 *   vf      LED の順電圧 [V]・lednm 発光の波長 [nm]   EQE = 注入 × IQE × 取り出し、電力効率 = EQE × hν/(qV)
 *   r1, r2  レーザーの前と後ろの端面の反射率          鏡の損失 α_m = ln(1/R₁R₂)/(2L)
 *   lum     共振器の長さ [µm]・ai 内部の損失 [cm⁻¹]・etai 注入効率
 *   lasnm   発振の波長 [nm]                 微分量子効率 η_d = η_i α_m/(α_i+α_m)、スロープ効率 η_d·hν/q（両端面の合計）
 *   ith25   25 ℃ のしきい値 [mA]・t0 特性温度 [K]・tempc 動作温度 [℃]・iop 駆動の電流 [mA]
 *                                          I_th(T) = I_th25·exp((T−25)/T₀)、P = スロープ効率 × (I − I_th)
 *   ng      群屈折率                         縦モードの間隔 Δλ = λ²/(2·n_g·L)
 *   neff, pitchnm  DFB の実効屈折率と格子の周期 [nm]   ブラッグ波長 λ_B = 2·n_eff·Λ
 *   dldt    DFB の波長の温度係数 [nm/K]              λ(T) = λ_B + dλ/dT·(T − 25)
 *   lcavm   モード同期の共振器の長さ [m]              繰り返し f = c/(2L)
 *   mlnm    モード同期の中心の波長 [nm]・dlnm スペクトルの幅 [nm]  ガウス形の最短のパルス Δt = 0.441·λ²/(c·Δλ)
 *   pavg    平均の出力 [W]                          パルス 1 個 E = P/f、尖頭値 ≈ 0.94·E/Δt
 *
 * 第4章（速さ・波長変換・結合）:
 *   dfac    緩和振動の係数 D [GHz/√mA]（仮定）  f_R = D·√(I − I_th)、変調の帯域 f_3dB = √(1+√2)·f_R（減衰を無視）
 *   gbps    ビットレート [Gb/s]                      NRZ で要る帯域の目安 0.7 × ビットレート（仮定の目安）
 *   shgL    SHG の結晶の長さ [cm]・shgP 励起 [W]・shgK 効率の係数 [%/(W·cm)]（仮定）
 *   shgA    温度の許容幅（FWHM）× 長さ [℃·cm]（仮定）・shgdT 温度の揺れ [±℃]
 *                                          P_2ω = shgK·L·P²·sinc²(u)、u = 2·1.39156·δT·L/A（sinc² の半値が u = 1.39156）
 *   fibw    ファイバのモード半径 [µm]・ldw LD のモード半径 [µm]（円に近似）・mag レンズの倍率・offum 横ずれ [µm]
 *                                          η = (2w₁w₂/(w₁²+w₂²))² · exp(−2d²/(w₁²+w₂²))（ガウスのモードの重なり）
 *
 * 第5章（光源を道具として使う）:
 *   calA, calB  校正に使う水銀の輝線 [nm]・caltgt 目盛りを見る波長 [nm]・calsig 1 本の線の読みのばらつき σ [nm]
 *                                          2 点で決めた直線の誤差 σ·√((λ−λb)² + (λ−λa)²)/|λb − λa|（2 本の読みが独立）
 *   pumpnm  励起の波長 [nm]・signm 発振の波長 [nm]・pout 取り出す出力 [W]
 *                                          量子欠損 1 − λp/λs、熱 P(λs/λp − 1)（量子欠損のぶんだけ。ほかの損失は無視）
 *   ledP, ledA  LED の出力 [W] と発光面積 [mm²]（ランバート面）・fcore ファイバのコア径 [µm]・fna ファイバの NA
 *                                          輝度 P/(πA)、入る光の上限 ＝ 輝度 × コアの面積 × πNA²（光源がコアより大きいとき）
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない。
 * 【モデルの外】利得のスペクトルの形・キャリアの寿命・高温でのスロープ効率の低下・線幅・チャープ・
 * 空間的なホールバーニングは入れていない。スロープ効率は温度によらず一定としている。
 */
(function (global) {
  'use strict';
  var LS = global.LS || (global.LS = {});

  var H = 6.62607015e-34, C = 2.99792458e8, KB = 1.380649e-23, HC_EVNM = 1239.84;

  function defaults() {
    return {
      tk: 2856,
      etainj: 0.95, iqe: 0.8, extr: 0.3, vf: 3.0, lednm: 450,
      r1: 0.31, r2: 0.31, lum: 500, ai: 10, etai: 0.9, lasnm: 850,
      ith25: 10, t0: 60, tempc: 25, iop: 30,
      ng: 3.6,
      neff: 3.2, pitchnm: 242, dldt: 0.1,
      lcavm: 1.5, mlnm: 800, dlnm: 5, pavg: 0.5,
      dfac: 1.5, gbps: 10,
      shgL: 1, shgP: 0.5, shgK: 1.0, shgA: 1.0, shgdT: 0.1,
      fibw: 5.2, ldw: 1.6, mag: 1, offum: 1.5,
      calA: 435.833, calB: 546.074, caltgt: 700, calsig: 0.02,
      pumpnm: 915, signm: 1070, pout: 100,
      ledP: 1, ledA: 1, fcore: 100, fna: 0.22
    };
  }

  /* 水銀の輝線（空気中の波長 [nm]、NIST Atomic Spectra Database の Hg I の値） */
  var HG_LINES = [253.652, 365.015, 404.656, 435.833, 546.074, 576.960, 579.066];
  function hgLine(x) { for (var i = 0; i < HG_LINES.length; i++) if (Math.abs(x - HG_LINES[i]) <= 0.05) return HG_LINES[i]; return null; }

  /* sinc²(u) = 0.5 になる u（半値）。位相整合の許容幅（FWHM）は Δk·L = 4u = 5.566 */
  var SINC_HALF = 1.39156;
  function sinc2(u) { return u === 0 ? 1 : Math.pow(Math.sin(u) / u, 2); }

  /* 黒体の分光放射（形だけ。定数倍は割合で消える） */
  function planck(lamM, T) { return 1 / Math.pow(lamM, 5) / (Math.exp(H * C / (lamM * KB * T)) - 1); }

  /* 可視（400〜700 nm）の割合: 0.1〜100 µm を対数の格子で積分（決まった格子なので毎回同じ値） */
  function visFrac(T) {
    var N = 4000, a = Math.log(0.1e-6), b = Math.log(100e-6), s = 0, t = 0;
    for (var i = 0; i < N; i++) {
      var x = a + (i + 0.5) * (b - a) / N, l = Math.exp(x), w = planck(l, T) * l * (b - a) / N;
      t += w; if (l >= 400e-9 && l <= 700e-9) s += w;
    }
    return s / t;
  }

  function evaluate(d) {
    /* 熱放射 */
    var lamMaxUm = 2897.77 / d.tk;
    var vis = visFrac(d.tk);
    var Mwcm2 = 5.670374e-8 * Math.pow(d.tk, 4) / 1e4;

    /* LED */
    var hvLed = HC_EVNM / d.lednm;
    var eqe = d.etainj * d.iqe * d.extr;
    var wpe = eqe * hvLed / d.vf;

    /* レーザーの共振器と傾き */
    var Lcm = d.lum * 1e-4;
    var am = Math.log(1 / (d.r1 * d.r2)) / (2 * Lcm);
    var gth = d.ai + am;
    var etad = d.etai * am / (d.ai + am);
    var slope = etad * HC_EVNM / d.lasnm;                  /* W/A（両端面の合計） */
    var s1 = (1 - d.r1) * Math.sqrt(d.r2), s2 = (1 - d.r2) * Math.sqrt(d.r1);
    var front = s1 / (s1 + s2);                             /* 前の端面から出る割合 */
    var ith = d.ith25 * Math.exp((d.tempc - 25) / d.t0);
    var pmw = Math.max(0, slope * (d.iop - ith));           /* W/A × mA = mW */

    /* 縦モードと DFB */
    var fsrNm = d.lasnm * d.lasnm / (2 * d.ng * d.lum * 1000);
    var lamB = 2 * d.neff * d.pitchnm;
    var lamT = lamB + d.dldt * (d.tempc - 25);

    /* モード同期のパルス */
    var frep = C / (2 * d.lcavm);
    var lamM = d.mlnm * 1e-9, dlM = d.dlnm * 1e-9;
    var tauS = 0.441 * lamM * lamM / (C * dlM);
    var epJ = d.pavg / frep;
    var ppeak = 0.94 * epJ / tauS;

    /* 緩和振動と直接変調（しきい値は動作温度の値） */
    var fR = d.dfac * Math.sqrt(Math.max(0, d.iop - ith));
    var f3 = Math.sqrt(1 + Math.SQRT2) * fR;
    var fNeed = 0.7 * d.gbps;

    /* SHG: 弱い変換（励起が減らない）・最適集光で長さに比例、と仮定 */
    var shgU = 2 * SINC_HALF * d.shgdT * d.shgL / d.shgA;
    var shgS2 = sinc2(shgU);
    var p2wMw = d.shgK / 100 * d.shgL * d.shgP * d.shgP * shgS2 * 1000;

    /* ファイバへの結合（ガウスのモードの重なり） */
    var w1 = d.ldw * d.mag, w2 = d.fibw, ss = w1 * w1 + w2 * w2;
    var etaMM = Math.pow(2 * w1 * w2 / ss, 2);
    var etaOff = Math.exp(-2 * d.offum * d.offum / ss);

    /* 二点の校正: 2 本の線の読みに独立なばらつき σ が乗ったときの、直線の目盛りの誤差（間なら小さく、外で膨らむ） */
    var calSpan = Math.abs(d.calB - d.calA);
    var calErr = calSpan > 0 ? d.calsig * Math.sqrt(Math.pow(d.caltgt - d.calB, 2) + Math.pow(d.caltgt - d.calA, 2)) / calSpan : Infinity;
    /* 量子欠損（励起の光子 1 個のうち熱になる割合）と、出力 P を取り出すときの熱と励起 */
    var qd = 1 - d.pumpnm / d.signm, heatW = d.pout * (d.signm / d.pumpnm - 1), pumpW = d.pout * d.signm / d.pumpnm;
    /* ランバート面の光源の輝度と、ファイバのエテンデュ（コアの面積 × πNA²）。光源がコアより小さいときは光源の面積で頭打ち */
    var radiance = d.ledP / (Math.PI * d.ledA * 1e-6);
    var aCore = Math.PI * Math.pow(d.fcore / 2 * 1e-6, 2), aEff = Math.min(aCore, d.ledA * 1e-6);
    var etFib = aEff * Math.PI * d.fna * d.fna;
    var pFibMw = radiance * etFib * 1000;

    return {
      calErr: calErr, calLineA: hgLine(d.calA), calLineB: hgLine(d.calB),
      qd: qd, heatW: heatW, pumpW: pumpW, radiance: radiance, etFib: etFib, pFibMw: pFibMw,
      fR: fR, f3: f3, fNeed: fNeed,
      shgU: shgU, shgS2: shgS2, p2wMw: p2wMw, shgTol: d.shgA / d.shgL, shgDrop: 1 - shgS2,
      fibW1: w1, etaMM: etaMM, etaOff: etaOff, eta: etaMM * etaOff,
      lamMaxUm: lamMaxUm, vis: vis, Mwcm2: Mwcm2,
      hvLed: hvLed, eqe: eqe, wpe: wpe,
      am: am, gth: gth, etad: etad, slope: slope, front: front, ith: ith, pmw: pmw,
      fsrNm: fsrNm, lamB: lamB, lamT: lamT,
      frep: frep, tauFs: tauS * 1e15, epNj: epJ * 1e9, ppeakKw: ppeak / 1e3
    };
  }

  /** L-I を 25 ℃ と動作温度で掃く */
  function liSweep(d, n) {
    n = n || 80;
    var iMax = Math.max(60, 1.5 * d.iop), out = [];
    for (var i = 0; i <= n; i++) {
      var I = iMax * i / n;
      var d25 = {}, k; for (k in d) d25[k] = d[k];
      d25.tempc = 25; d25.iop = I;
      var dT = {}; for (k in d) dT[k] = d[k];
      dT.iop = I;
      out.push({ i: I, p25: evaluate(d25).pmw, pT: evaluate(dT).pmw });
    }
    return out;
  }

  /** 黒体のスペクトル（山を 1 とした形）を 0.2〜3 µm で */
  function planckSweep(d, n) {
    n = n || 140;
    var lm = 2.897771955e-3 / d.tk, bm = planck(lm, d.tk), out = [];
    for (var i = 0; i <= n; i++) {
      var um = 0.2 + 2.8 * i / n;
      out.push({ um: um, b: planck(um * 1e-6, d.tk) / bm });
    }
    return out;
  }

  LS.laser = {
    H: H, C: C, KB: KB, HC_EVNM: HC_EVNM, SINC_HALF: SINC_HALF, sinc2: sinc2, HG_LINES: HG_LINES, hgLine: hgLine,
    defaults: defaults, evaluate: evaluate, visFrac: visFrac, liSweep: liSweep, planckSweep: planckSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
