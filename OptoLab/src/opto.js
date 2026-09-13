/* 光学の設計 ― 照度の会計から、結像・ビーム・ファイバ・反射まで
 *
 * 第7部『光学』の式を、そのまま計算で踏むモデル。
 *
 * 設計で決めるもの（画面の左）:
 *   lx     被写体の照度 [lx]           555nm 単色として 1lx = 1/683 W/m²
 *   rho    被写体の反射率（0〜1）       ランベルト面: 輝度 L = ρE/π
 *   T      レンズの透過率（0〜1）
 *   N      F値                        カメラ方程式 E_img = πLT/N'…= ρ·E·T/(4N²)
 *   nm     波長 [nm]
 *   cd     点光源の光度 [cd]           逆二乗 E = I/r²
 *   rm     距離 [m]
 *   fmm    レンズの焦点距離 [mm]
 *   amm    物体距離 [mm]              1/a + 1/b = 1/f、倍率 m = b/a
 *   naobj  対物の開口数 NA            分解能 0.61λ/NA（レイリー）
 *   winmm  入射ビーム半径 w [mm]       集光ウェスト w0' = M²·λf/(πw)
 *   m2     ビーム品質 M²
 *   ncoat  λ/4 コートの屈折率
 *   nsub   基板の屈折率               フレネル R = ((n2−n1)/(n2+n1))²
 *   coreu  ファイバのコア径 [µm]
 *   naf    ファイバの NA
 *   bin    信号の元の帯域 [Hz]         ロックイン: SNR 改善 = √(B_in/B_lock)
 *   blk    ロックインの帯域 [Hz]
 *   srcum  面光源（LED など）の径 [µm]  エテンデュ G = (πD²/4)·(π·NA²)
 *   srcna  面光源の放射 NA             ランベルト光源の投影立体角 π·sin²θ = π·NA²
 *   hmm    像高（光軸からの距離）[mm]    cos⁴則: 周辺照度 = 中心 × cos⁴θ、tanθ = h/f
 *   mfdum  SM ファイバのモードフィールド径 [µm]  結合効率 η = (2w₁w₂/(w₁²+w₂²))²（軸ずれ・角度ずれなし）
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない。
 * 【モデルの外】収差・ケラレ・偏光・多層膜・軸ずれ／角度ずれのある結合は入れていない
 * （cos⁴則は自然な周辺減光だけ、モード結合は同軸・垂直のガウス重なりだけを持つ）。
 * エテンデュの結合上限は「面も角度も一様に埋まる」理想の光学系での値 ― 実物はここからさらに下がる。
 */
(function (global) {
  'use strict';
  var OP = global.OP || (global.OP = {});

  var LMW = 683;               /* 555nm の視感効果度 [lm/W] */
  var QEL = 1.602176634e-19;

  function defaults() {
    return {
      lx: 1000, rho: 0.18, T: 0.9, N: 4, nm: 555,
      cd: 25, rm: 2,
      fmm: 50, amm: 5000, naobj: 0.4,
      winmm: 1, m2: 1,
      ncoat: 1.38, nsub: 3.9,
      coreu: 10, naf: 0.14,
      bin: 1000, blk: 10,
      srcum: 100, srcna: 0.9,
      hmm: 5, mfdum: 6.2
    };
  }

  /**
   * 設計 → 数字。
   * 戻り値 {
   *   Ew（被写体 W/m²）, L（輝度 cd/m²）, Eimg（センサ照度 lx）, EimgW,
   *   phiUm（光子束 /µm²/s）, Einv（逆二乗の照度 lx）,
   *   bmm（像距離）, mag（倍率）, airyUm（エアリー径 2.44λN）, resUm（0.61λ/NA）,
   *   w0um（集光ウェスト半径 µm）, spotUm（集光径 2w0）, naBeam（win/f）,
   *   Rfres（素の反射）, Rar（λ/4 単層の残留反射）, nIdeal（√(n1n2)）,
   *   fibOk（スポットとNAが入るか）, snrGain（√(Bin/Blk)）
   * }
   */
  function evaluate(d) {
    var Ew = d.lx / LMW;                                /* W/m²（555nm 単色として） */
    var L = d.rho * d.lx / Math.PI;                     /* cd/m²（ランベルト） */
    var Eimg = d.rho * d.lx * d.T / (4 * d.N * d.N);    /* カメラ方程式 */
    var EimgW = Eimg / LMW;
    var Eph = 1240 / d.nm * QEL;                        /* J */
    var phiUm = (EimgW / Eph) * 1e-12;                  /* 光子/µm²/s */

    var Einv = d.cd / (d.rm * d.rm);                    /* 逆二乗 */

    var f = d.fmm, a = d.amm;
    var bmm = (a > f) ? 1 / (1 / f - 1 / a) : Infinity;
    var mag = (a > f) ? bmm / a : Infinity;

    var lamUm = d.nm / 1000;
    var airyUm = 2.44 * lamUm * d.N;
    var resUm = 0.61 * lamUm / d.naobj;

    var w0um = d.m2 * lamUm * d.fmm * 1000 / (Math.PI * d.winmm * 1000); /* µm */
    var spotUm = 2 * w0um;
    var naBeam = d.winmm / d.fmm;

    var n1 = 1;
    var Rfres = Math.pow((d.nsub - n1) / (d.nsub + n1), 2);
    var Rar = Math.pow((n1 * d.nsub - d.ncoat * d.ncoat) / (n1 * d.nsub + d.ncoat * d.ncoat), 2);
    var nIdeal = Math.sqrt(n1 * d.nsub);

    var fibOk = spotUm <= d.coreu && naBeam <= d.naf;
    var snrGain = Math.sqrt(d.bin / d.blk);

    /* エテンデュ（面積 × 投影立体角）。受け側/光源の比が結合効率の上限 ― 光学系では増やせない */
    var gsrc = Math.PI * Math.PI * (d.srcum || 0) * (d.srcum || 0) * (d.srcna || 0) * (d.srcna || 0) / 4;
    var gfib = Math.PI * Math.PI * d.coreu * d.coreu * d.naf * d.naf / 4;
    var etaMax = gsrc > 0 ? Math.min(1, gfib / gsrc) : 1;

    /* cos⁴則: 像高 h の主光線角 θ = atan(h/f)。薄肉・自然な周辺減光のみ（ケラレは別勘定） */
    var theta = Math.atan((d.hmm || 0) / d.fmm);
    var cos4 = Math.pow(Math.cos(theta), 4);

    /* SM ファイバのモード結合: 集光ウェスト w₁ とモード半径 w₂ のガウス重なり積分（同軸・垂直） */
    var w2m = (d.mfdum || 0) / 2;
    var etaMode = (w0um > 0 && w2m > 0)
      ? Math.pow(2 * w0um * w2m / (w0um * w0um + w2m * w2m), 2) : 0;

    return {
      Ew: Ew, L: L, Eimg: Eimg, EimgW: EimgW, phiUm: phiUm, Einv: Einv,
      bmm: bmm, mag: mag, airyUm: airyUm, resUm: resUm,
      w0um: w0um, spotUm: spotUm, naBeam: naBeam,
      Rfres: Rfres, Rar: Rar, nIdeal: nIdeal,
      fibOk: fibOk, snrGain: snrGain,
      gsrc: gsrc, gfib: gfib, etaMax: etaMax,
      thetaDeg: theta * 180 / Math.PI, cos4: cos4,
      etaMode: etaMode
    };
  }

  /** F値を掃いてセンサ照度とエアリー径を返す（明るさと解像の綱引きの図） */
  function nSweep(d, nMin, nMax, n) {
    nMin = nMin || 1; nMax = nMax || 22; n = n || 80;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var Nv = nMin * Math.pow(nMax / nMin, i / n);
      var dd = {}; for (var k in d) dd[k] = d[k];
      dd.N = Nv;
      var ev = evaluate(dd);
      out.push({ N: Nv, eimg: ev.Eimg, airy: ev.airyUm });
    }
    return out;
  }

  /** 入射ビーム半径を掃いて集光径とビームNAを返す（ファイバ結合の窓の図） */
  function wSweep(d, wMin, wMax, n) {
    wMin = wMin || 0.1; wMax = wMax || 10; n = n || 80;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var w = wMin * Math.pow(wMax / wMin, i / n);
      var dd = {}; for (var k in d) dd[k] = d[k];
      dd.winmm = w;
      var ev = evaluate(dd);
      out.push({ w: w, spot: ev.spotUm, na: ev.naBeam });
    }
    return out;
  }

  OP.opto = {
    LMW: LMW, QEL: QEL,
    defaults: defaults, evaluate: evaluate, nSweep: nSweep, wSweep: wSweep
  };
})(typeof window !== 'undefined' ? window : globalThis);
