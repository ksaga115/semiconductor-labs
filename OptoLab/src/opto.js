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
 *   incdeg 入射角 [°]                 斜め入射のフレネル反射 R_s・R_p（空気 → nsub）。p は tanθ_B = n でゼロ
 *   glmm   格子の本数 [本/mm]          分光器（1 次・cosβ ≈ 1）: 逆線分散 dλ/dx = d/f、範囲の長さ = Δλ/(dλ/dx)
 *   fsp    分光器の焦点距離 [mm]
 *   slitum スリットの幅 [µm]           分解能の目安 = dλ/dx × max(スリット, 2 画素)
 *   pxum   画素の幅 [µm]
 *   lamlo, lamhi  測る範囲 [nm]
 *   linkkm ファイバの長さ [km]         受信 = 送信 − 損失 × 長さ − 接続
 *   dbkm   損失 [dB/km]・extdb 接続などの損失 [dB]・pdbm 送信 [dBm]
 *   dlnm   光源の波長の幅 [nm]・dps 波長分散 D [ps/(nm·km)]・gbps 速さ [Gb/s]  広がり = D·L·Δλ
 *   ppum   撮像センサの画素ピッチ [µm]   系の MTF（ナイキスト 1/(2p)）= 回折の MTF（無収差の円形開口、遮断 1/(λN)）× |sinc(πpν)|
 *                                     許すボケ c = 2 画素。像の側の焦点深度（無限遠）2Nc、物体の側の被写界深度 2Nc(1+m)/m²、
 *                                     回折の点像の径 2.44λN(1+m)（実効 F 値 N(1+m)）
 *   nH, nL, nsg  多層膜の高・低屈折率と基板  λ/4 の積み重ね（H で始めて H で終わる、2N+1 層）: Y = (nH/nL)^2N·nH²/nsg、R = ((1−Y)/(1+Y))²
 *   npair  対の数 N・lam0 中心の波長 [nm]   高反射帯の幅 Δg = (4/π)asin((nH−nL)/(nH+nL))、帯の端 λ0/(1 ± Δg/2)
 *
 * 【約束】数値はすべてこの式から導出できる。乱数は使わない。
 * 【モデルの外】収差・ケラレ・偏光素子・軸ずれ／角度ずれのある結合は入れていない。
 * 多層膜は理想の λ/4 の積み重ね（吸収なし・垂直入射）の中心の反射と帯の幅だけ、MTF は無収差の円形開口と画素の開口だけ
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
      hmm: 5, mfdum: 6.2,
      incdeg: 0,
      glmm: 1200, fsp: 50, slitum: 50, pxum: 25, lamlo: 400, lamhi: 1000,
      linkkm: 10, dbkm: 0.2, extdb: 1, pdbm: 0, dlnm: 1, dps: 17, gbps: 10,
      ppum: 3.45, nH: 2.35, nL: 1.46, nsg: 1.52, npair: 4, lam0: 550
    };
  }

  /** 無収差の円形開口の MTF（ν ≥ νc で 0） */
  function mtfDiff(nu, nuc) {
    if (!(nuc > 0) || nu >= nuc) return 0;
    var p = Math.acos(nu / nuc);
    return 2 / Math.PI * (p - Math.cos(p) * Math.sin(p));
  }
  function sincAbs(x) { return x === 0 ? 1 : Math.abs(Math.sin(x) / x); }

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

    /* 斜め入射のフレネル反射（空気 → 基板 nsub）。s と p を別々に。p は tanθ_B = n でゼロ */
    var ti = (d.incdeg || 0) * Math.PI / 180;
    var st = Math.sin(ti) / d.nsub, ct = Math.sqrt(Math.max(0, 1 - st * st)), ci = Math.cos(ti);
    var rs = (ci - d.nsub * ct) / (ci + d.nsub * ct), rp = (d.nsub * ci - ct) / (d.nsub * ci + ct);
    var Rs = rs * rs, Rp = rp * rp;
    var brewDeg = Math.atan(d.nsub) * 180 / Math.PI;

    /* 格子の分光器（1 次・cosβ ≈ 1 の近似）: 逆線分散 dλ/dx = d/(m·f)、範囲の長さ、分解能の目安 */
    var gdnm = 1e6 / (d.glmm || 1);                        /* 溝の周期 [nm] */
    var rld = gdnm / (d.fsp || 1);                         /* nm/mm */
    var spanMm = ((d.lamhi || 0) - (d.lamlo || 0)) / rld;   /* センサの上の長さ */
    var bpNm = rld * Math.max(d.slitum || 0, 2 * (d.pxum || 0)) / 1000; /* スリットの像か 2 画素の大きい方 */

    /* ファイバの回線: 受信の電力 = 送信 − 損失 × 長さ − 接続の損失、波長分散の広がり = D·L·Δλ */
    var rxdbm = d.pdbm - d.dbkm * d.linkkm - d.extdb;
    var spreadPs = d.dps * d.linkkm * d.dlnm;
    var bitPs = 1000 / d.gbps;

    /* 撮像系の MTF（無収差の円形開口 × 画素の開口）・焦点深度・被写界深度（第7部 15・18） */
    var pp = d.ppum || 3.45;
    var nuNyq = 1000 / (2 * pp);                           /* lp/mm */
    var nuc = 1000 / (lamUm * d.N);                        /* 回折の遮断周波数 lp/mm */
    var mtfLens = mtfDiff(nuNyq, nuc), mtfPix = sincAbs(Math.PI * pp / 1000 * nuNyq);
    var mtfSys = mtfLens * mtfPix;
    var cUm = 2 * pp;                                      /* 許すボケ = 2 画素 */
    var focusUm = 2 * d.N * cUm;                           /* 像の側の焦点深度（無限遠） */
    var mt = isFinite(mag) ? mag : 0;
    var dofMm = mt > 0 ? 2 * d.N * cUm * (1 + mt) / (mt * mt) / 1000 : Infinity;
    var diffUm = 2.44 * lamUm * d.N * (1 + mt);            /* 実効 F 値での点像の径 */
    /* λ/4 の多層膜（H で始めて H で終わる、2N+1 層）: 中心の波長の反射と高反射帯 */
    var Yml = Math.pow(d.nH / d.nL, 2 * d.npair) * d.nH * d.nH / d.nsg;
    var Rml = Math.pow((1 - Yml) / (1 + Yml), 2);
    var dgml = 4 / Math.PI * Math.asin((d.nH - d.nL) / (d.nH + d.nL));
    var bandLo = d.lam0 / (1 + dgml / 2), bandHi = d.lam0 / (1 - dgml / 2);

    return {
      Ew: Ew, L: L, Eimg: Eimg, EimgW: EimgW, phiUm: phiUm, Einv: Einv,
      bmm: bmm, mag: mag, airyUm: airyUm, resUm: resUm,
      w0um: w0um, spotUm: spotUm, naBeam: naBeam,
      Rfres: Rfres, Rar: Rar, nIdeal: nIdeal,
      fibOk: fibOk, snrGain: snrGain,
      gsrc: gsrc, gfib: gfib, etaMax: etaMax,
      thetaDeg: theta * 180 / Math.PI, cos4: cos4,
      etaMode: etaMode,
      Rs: Rs, Rp: Rp, brewDeg: brewDeg,
      rld: rld, spanMm: spanMm, bpNm: bpNm,
      rxdbm: rxdbm, spreadPs: spreadPs, bitPs: bitPs,
      nuNyq: nuNyq, nuc: nuc, mtfLens: mtfLens, mtfPix: mtfPix, mtfSys: mtfSys,
      cUm: cUm, focusUm: focusUm, dofMm: dofMm, diffUm: diffUm,
      Rml: Rml, dgml: dgml, bandLo: bandLo, bandHi: bandHi, layers: 2 * d.npair + 1
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
    defaults: defaults, evaluate: evaluate, nSweep: nSweep, wSweep: wSweep, mtfDiff: mtfDiff
  };
})(typeof window !== 'undefined' ? window : globalThis);
