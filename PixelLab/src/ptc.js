/* PTC（フォトン・トランスファー・カーブ）― ばらつきを測ると電子が数えられる
 *
 * カメラの中身（1 DN が何電子か）は、外からは見えない。でも光子はポアソン分布なので
 *
 *     電子で数えた分散 ＝ 電子で数えた平均        （ショットノイズ）
 *
 * が必ず成り立つ。DN で測ると、平均は 1/K 倍、分散は 1/K² 倍になるので
 *
 *     分散[DN²] ＝ 平均[DN] / K ＋ 読み出し雑音²[DN²]
 *
 * **分散を平均に対して描いた直線の傾きが 1/K**。これだけで電子の目盛りが決まる ―
 * 画面の数字と電子の数を結ぶ、ほとんど唯一の方法。
 *
 * 【差分法】1枚の分散には固定パターン（画素ごとの感度差）が混ざる。これは信号に比例して
 * 大きくなるので、そのままでは傾きが歪む。**同じ条件で2枚撮って引き算**すると固定パターンが消え、
 * 残るのは時間でゆらぐ雑音だけ。差の分散は2枚ぶんなので 2 で割る。
 *
 * 【オフセット】DN の平均にはオフセット（黒の底上げ）が乗っている。
 * 同じ露光で暗い画像を撮り、その平均を引いたものを「信号」とする（暗電流のぶんも一緒に消える）。
 */
(function (global) {
  'use strict';
  var PX = global.PX || (global.PX = {});
  var CAM = PX.camera;

  /**
   * 1点ぶん測る: 明るい2枚・暗い2枚を撮る。
   * 戻り値 {
   *   t, mean（オフセットと暗さを引いた信号 [DN]）, tvar（時間でゆらぐ分散 [DN²]）,
   *   fpn（固定パターンの分散 [DN²]）, dark: { mean, tvar }（暗い2枚の）, raw（明るい1枚目の生の平均）
   * }
   */
  function point(cam, t, seed, flux) {
    seed = seed >>> 0;
    var a = CAM.frame(cam, t, true, seed + 1, flux), b = CAM.frame(cam, t, true, seed + 2, flux);
    var da = CAM.frame(cam, t, false, seed + 3), db = CAM.frame(cam, t, false, seed + 4);
    var n = a.length, i;
    var sumAB = new Float64Array(n), dif = new Float64Array(n), dsum = new Float64Array(n), ddif = new Float64Array(n);
    for (i = 0; i < n; i++) {
      sumAB[i] = (a[i] + b[i]) / 2; dif[i] = a[i] - b[i];
      dsum[i] = (da[i] + db[i]) / 2; ddif[i] = da[i] - db[i];
    }
    var sAB = CAM.stats(sumAB), sD = CAM.stats(dif), sDark = CAM.stats(dsum), sDD = CAM.stats(ddif);
    var tvar = sD.var / 2, dtvar = sDD.var / 2;
    return {
      t: t,
      mean: sAB.mean - sDark.mean,
      tvar: tvar,
      /* 2枚の平均の分散 ＝ 固定パターン ＋ 時間の雑音/2 */
      fpn: Math.max(0, sAB.var - tvar / 2),
      dark: { mean: sDark.mean, tvar: dtvar, fpn: Math.max(0, sDark.var - dtvar / 2) },
      raw: CAM.stats(a).mean
    };
  }

  /** 露光を対数に並べて掃く。飽和を越えるところまで行く */
  function sweep(cam, tMin, tMax, n, seed, flux) {
    var out = [], k;
    for (k = 0; k < n; k++) {
      var t = tMin * Math.pow(tMax / tMin, k / (n - 1));
      out.push(point(cam, t, (seed || 1) * 1000 + k * 10, flux));
    }
    return out;
  }

  /* ---- 当てはめ（お手本の手順。課題の答え合わせは真の値でするので、これは「測り方の例」） ---- */

  /** 直線 y = a + b x の最小二乗 */
  function line(xs, ys) {
    var n = xs.length, sx = 0, sy = 0, sxx = 0, sxy = 0, i;
    for (i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    var b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { a: (sy - b * sx) / n, b: b, n: n };
  }

  /** 分散が一番大きい点 ＝ 飽和の手前。そこから先は井戸が満杯で分散が潰れる */
  function peakIndex(pts) {
    var best = 0, i;
    for (i = 1; i < pts.length; i++) if (pts[i].tvar > pts[best].tvar) best = i;
    return best;
  }

  /**
   * 変換係数 K [e-/DN]。
   * 読み出し雑音が効かず（平均が読み出し分散の 20 倍以上）、飽和の手前（ピークの 0.7 倍まで）の
   * 点で、時間の分散 − 暗い分散 を平均に対して直線に当て、傾きの逆数をとる。
   */
  function fitK(pts) {
    var ip = peakIndex(pts), top = pts[ip].mean * 0.7, xs = [], ys = [];
    pts.forEach(function (p) {
      if (p.mean > 20 * p.dark.tvar && p.mean < top) { xs.push(p.mean); ys.push(p.tvar - p.dark.tvar); }
    });
    if (xs.length < 3) return null;
    var f = line(xs, ys);
    return { K: 1 / f.b, used: xs.length, fit: f };
  }

  /** 読み出し雑音 [e-]: 一番短い露光の暗い画像の、時間の雑音 × K */
  function readNoise(pts, K) {
    var p = pts.reduce(function (a, b) { return b.t < a.t ? b : a; });
    return Math.sqrt(p.dark.tvar) * K;
  }

  /**
   * 飽和電荷 [e-]: 明るくしても平均が増えなくなったところ（頭打ち）の平均 × K。
   *
   * 【PTC の頂点で測ってはいけなかった】分散が最大の点の平均は、露光をどれだけ細かく刻んだかで変わる。
   * 露光を 25% 刻みで掃くと、頂点の点は飽和の 25% 手前にもなりうる（カメラ B で 24% 小さく出た）。
   * 頭打ちの平均なら、どの画素も FW/K に張り付いているので刻み方に依らない。
   */
  function fullWell(pts, K) {
    var top = pts.reduce(function (a, p) { return p.mean > a ? p.mean : a; }, 0);
    return top * K;
  }

  /** 暗電流 [e-/s]: 暗い画像の平均を露光に対して直線に当てた傾き × K */
  function darkCurrent(pts, K) {
    var f = line(pts.map(function (p) { return p.t; }), pts.map(function (p) { return p.dark.mean; }));
    return f.b * K;
  }

  /** PRNU: 固定パターンの標準偏差 ÷ 信号（飽和の手前・信号が十分大きい点の中央値） */
  function prnu(pts) {
    var ip = peakIndex(pts), vals = [];
    pts.forEach(function (p, i) {
      if (i < ip && p.mean > 0.2 * pts[ip].mean) vals.push(Math.sqrt(Math.max(0, p.fpn - p.dark.fpn)) / p.mean);
    });
    if (!vals.length) return null;
    vals.sort(function (a, b) { return a - b; });
    return vals[Math.floor(vals.length / 2)];
  }

  PX.ptc = { point: point, sweep: sweep, line: line, peakIndex: peakIndex, fitK: fitK, readNoise: readNoise, fullWell: fullWell, darkCurrent: darkCurrent, prnu: prnu };
})(typeof window !== 'undefined' ? window : globalThis);
