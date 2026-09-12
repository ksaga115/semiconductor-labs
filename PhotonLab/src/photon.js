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
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない（採点が毎回同じになるように）。
 * 【モデルの外】1/f 雑音・APD の暗電流の非増倍成分・MPPC のクロストーク／アフターパルス・
 * 計数のパイルアップ（不感時間）は入れていない。第5部の caveat と同じで、実素子の設計はデータシートから。
 */
(function (global) {
  'use strict';
  var PH = global.PH || (global.PH = {});

  var Q = 1.602176634e-19;
  var RLOAD = 50;                  /* RC 帯域の受け側 [Ω]（光通信の定番の値） */

  function defaults() {
    return {
      nm: 550, pw: -12, eta: 0.8,
      M: 1, k: 0.02, delta: 0, nstg: 10,
      idpa: 10, ifa: 5, bmhz: 1, amm2: 1, cpf: 1,
      ncell: 0, nph: 1000,
      bgnw: 0, dkcps: 0, tsec: 0.001
    };
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

    var out = {
      P: P, Eph: Eph, phi: phi, R: R, Iph: Iph, Ibg: Ibg,
      F: F, ishot: ishot, iamp: iamp, itot: itot, SNR: SNR,
      NEP: NEP, Dstar: Dstar, Pmin: Pmin, fRC: fRC,
      cps: cps, bcps: bcps, snrCount: snrCount
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
    defaults: defaults, excess: excess, evaluate: evaluate, snrSweep: snrSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
