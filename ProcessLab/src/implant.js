/* イオン注入 ― 決まった深さに、決まった数だけ打ち込む
 *
 * 加速したイオンはシリコンの中で原子にぶつかりながら止まる。止まる深さは
 * ばらつくので、分布は**ガウス分布**になる:
 *
 *     C(z) = Q / (√(2π) ΔRp) · exp( -(z - Rp)² / (2 ΔRp²) )
 *
 *     Q   … ドーズ [cm^-2]（1cm² あたり何個打ったか）
 *     Rp  … 投影飛程（平均の深さ）。エネルギーとイオンの重さで決まる
 *     ΔRp … その標準偏差
 *
 * Rp と ΔRp は Gibbons の表（シリコン中）を丸めた値。間はエネルギーの対数で内挿する。
 * 重い As は浅く、軽い B は深く入る ― 同じエネルギーで3倍以上ちがう。
 *
 * 【膜の上から打つ】膜があると、イオンはまず膜の中で減速する。膜の厚みを
 * 「シリコンで言えば何 nm ぶんか」に直して、その分だけ分布を浅くずらす。
 * 係数はざっくり密度と阻止能の比（レジストは軽いので 0.55、窒化膜は重いので 1.3）。
 * 膜の中で止まったぶんは膜に残る（シリコンには入らない）。
 * **マスクで「止める」のはこの仕組み** ― レジストが薄いと、高いエネルギーでは突き抜ける。
 *
 * 【入れていないもの】チャネリング（結晶の隙間を抜けて深い裾ができる）、
 * 注入による結晶の損傷と、それが拡散を速める効果（TED）。README に書いてある。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});
  var G = PL.grid;

  var KEV = [10, 20, 30, 50, 80, 100, 150, 200, 300];
  var TABLE = {
    B:  { rp: [33, 66, 98, 161, 250, 307, 440, 560, 760], dr: [17, 28, 37, 51, 65, 71, 81, 88, 98] },
    P:  { rp: [14, 25, 37, 61, 98, 123, 186, 249, 370],   dr: [7, 12, 16, 24, 34, 40, 53, 64, 82] },
    As: { rp: [10, 16, 22, 33, 50, 62, 92, 123, 185],     dr: [4, 6, 8, 12, 17, 21, 29, 37, 52] }
  };

  /* 膜の厚みをシリコン換算にする係数 */
  var STOP = { ox: 0.9, nit: 1.3, poly: 1.0, metal: 1.2, resist: 0.55 };

  /** 対数どうしで直線に内挿（表の外は端の傾きで伸ばす） */
  function loglog(xs, ys, x) {
    var i = 1;
    while (i < xs.length - 1 && x > xs[i]) i++;
    var x0 = Math.log(xs[i - 1]), x1 = Math.log(xs[i]);
    var y0 = Math.log(ys[i - 1]), y1 = Math.log(ys[i]);
    var t = (Math.log(x) - x0) / (x1 - x0);
    return Math.exp(y0 + t * (y1 - y0));
  }

  /** 飛程 { rp, dr } [cm] */
  function range(ion, keV) {
    var tb = TABLE[ion];
    if (!tb) throw new Error('知らないイオン: ' + ion);
    keV = Math.max(1, Math.min(keV, 1000));
    return { rp: loglog(KEV, tb.rp, keV) * G.NM, dr: loglog(KEV, tb.dr, keV) * G.NM };
  }

  /* 誤差関数（Abramowitz & Stegun 7.1.26、誤差 1.5e-7） */
  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function Phi(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

  /** 膜の厚みのシリコン換算 [cm] */
  function equivalent(films) {
    var t = 0;
    for (var k = 0; k < films.length; k++) t += films[k].t * (STOP[films[k].mat] || 1);
    return t;
  }

  /**
   * 打ち込む。戻り値 { rp, dr, reached: [列ごとのシリコンに届いた割合] }
   *
   * 格子の点ごとに、その点の上端から下端までのガウス分布の面積（erf の差）を配る。
   * 点の値で配ると、4nm の格子に ΔRp=4nm の As を打ったときに量が合わない。
   */
  function implant(w, ion, keV, dose) {
    var r = range(ion, keV), a = w.C[ion];
    var NX = G.NX, NZ = G.NZ, ix, iz;
    var add = new Float64Array(NX * NZ);
    var reached = new Float64Array(NX);

    for (ix = 0; ix < NX; ix++) {
      var teq = equivalent(w.films[ix]);
      var s0 = w.siTop[ix];
      reached[ix] = 1 - Phi((teq - r.rp) / r.dr);
      for (iz = G.firstSi(w, ix); iz < NZ; iz++) {
        var lo = Math.max(G.ZE[iz], s0) - s0 + teq;
        var hi = G.ZE[iz + 1] - s0 + teq;
        if (hi <= lo) continue;
        var frac = Phi((hi - r.rp) / r.dr) - Phi((lo - r.rp) / r.dr);
        if (frac > 0) add[G.idx(ix, iz)] = dose * frac / G.DZ[iz];
      }
    }

    /* 横方向の広がり。横の標準偏差はおおむね ΔRp の 0.75 倍。
     * 50nm の列より十分小さければ何もしない（重さの無駄） */
    var sx = 0.75 * r.dr;
    if (sx > 0.2 * G.DX) {
      var half = Math.ceil(3 * sx / G.DX), ker = [], sum = 0, k;
      for (k = -half; k <= half; k++) { var v = Math.exp(-0.5 * Math.pow(k * G.DX / sx, 2)); ker.push(v); sum += v; }
      for (k = 0; k < ker.length; k++) ker[k] /= sum;
      var out = new Float64Array(NX * NZ);
      for (iz = 0; iz < NZ; iz++) {
        for (ix = 0; ix < NX; ix++) {
          var v0 = add[G.idx(ix, iz)];
          if (!v0) continue;
          for (k = -half; k <= half; k++) {
            var jx = ix + k;
            if (jx < 0) jx = -jx - 1;               /* 端は鏡で折り返す（量を落とさない） */
            if (jx >= NX) jx = 2 * NX - jx - 1;
            out[G.idx(jx, iz)] += v0 * ker[k + half];
          }
        }
      }
      /* 広がった先がシリコンでなければ（溝の側壁の外など）、そこには入らない */
      for (ix = 0; ix < NX; ix++) for (iz = 0; iz < NZ; iz++) if (!G.isSi(w, ix, iz)) out[G.idx(ix, iz)] = 0;
      add = out;
    }

    for (var i = 0; i < a.length; i++) a[i] += add[i];
    return { rp: r.rp, dr: r.dr, reached: reached };
  }

  PL.implant = { KEV: KEV, TABLE: TABLE, STOP: STOP, range: range, implant: implant, erf: erf, Phi: Phi, equivalent: equivalent };
})(typeof window !== 'undefined' ? window : globalThis);
