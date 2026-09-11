/* 測る ― 断面から、工程屋が見る数字を出す
 *
 *     接合深さ xj     … 正味の濃度の符号が変わる深さ
 *     表面濃度        … シリコン表面の正味の濃度
 *     シート抵抗 Rs   … 表面から接合までの層の抵抗 [Ω/□]（四探針で測る量）
 *     酸化膜厚        … シリコンの上にじかに乗っている酸化膜
 *
 * そして、縦の1本を **SemiLab の層の並び** に直す（toSemi）。
 * SemiLab の一片は濃度が一定なので、なだらかな分布を「濃度がほぼ同じところ」で
 * 区切って薄い層を積む。**接合は必ず層の境目に来る**（符号が変わったら区切る）ので、
 * SemiLab 側で接合を見落とすことはない。
 *
 * 【移動度】SemiLab の phys.js（Caughey-Thomas）をそのまま使う。
 * 同じ数式を2か所に書かない ― 片方だけ直して食い違うのが一番まずい。
 *
 * 【電気的に効く上限】注入しすぎた不純物は全部は効かない（固溶度・クラスタ化）。
 * シート抵抗の計算だけ、B 3e20・P 5e20・As 3e20 で頭打ちにする（ざっくりの値）。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});
  var G = PL.grid;
  var SL = global.SL;

  var ACTIVE = { B: 3e20, P: 5e20, As: 3e20 };
  var Q = 1.602176634e-19;

  /** 縦の1本の分布。シリコンの部分だけ、表面から下へ */
  function profile(w, ix) {
    var i0 = G.firstSi(w, ix), n = G.NZ - i0, k;
    var p = {
      ix: ix, i0: i0, n: n, top: w.siTop[ix],
      z: new Float64Array(n), dz: new Float64Array(n),
      B: new Float64Array(n), P: new Float64Array(n), As: new Float64Array(n),
      nd: new Float64Array(n), na: new Float64Array(n), net: new Float64Array(n)
    };
    for (k = 0; k < n; k++) {
      var iz = i0 + k, i = G.idx(ix, iz);
      p.z[k] = G.ZC[iz] - w.siTop[ix];
      p.dz[k] = G.DZ[iz];
      p.B[k] = w.C.B[i]; p.P[k] = w.C.P[i]; p.As[k] = w.C.As[i];
      p.nd[k] = G.donors(w, ix, iz);
      p.na[k] = G.acceptors(w, ix, iz);
      p.net[k] = p.nd[k] - p.na[k];
    }
    return p;
  }

  /** 接合の深さ [cm] を全部（浅い順）。点の間は直線で内挿 */
  function junctions(p) {
    var out = [];
    for (var k = 1; k < p.n; k++) {
      var a = p.net[k - 1], b = p.net[k];
      if (a === 0 || b === 0 || (a > 0) === (b > 0)) continue;
      var t = Math.abs(a) / (Math.abs(a) + Math.abs(b));
      out.push(p.z[k - 1] + t * (p.z[k] - p.z[k - 1]));
    }
    return out;
  }

  function xj(w, ix) { var j = junctions(profile(w, ix)); return j.length ? j[0] : null; }

  function surface(w, ix) {
    var p = profile(w, ix);
    return p.n ? { net: p.net[0], type: p.net[0] > 0 ? 'n' : p.net[0] < 0 ? 'p' : 'i' } : null;
  }

  /** 効いている濃度（頭打ちつき） */
  function active(p, k) {
    var nd = Math.min(p.P[k], ACTIVE.P) + Math.min(p.As[k], ACTIVE.As);
    var na = Math.min(p.B[k], ACTIVE.B);
    return { nd: nd + (p.nd[k] - p.P[k] - p.As[k]), na: na + (p.na[k] - p.B[k]) };
  }

  /* 移動度は SemiLab のものだけを使う。以前はここに「SemiLab が無いとき用」の同じ式を
   * 控えていたが、それ自体が「同じ数式を2か所に書く」になっていた（精査で見つけた）。
   * ProcessLab は SemiLab を必ず読み込むので、控えは要らない */
  function mu(isN, ntot) {
    if (!SL || !SL.phys) throw new Error('SemiLab の物理（../SemiLab/src/phys.js）が読み込まれていません');
    return isN ? SL.phys.muN(ntot, 300) : SL.phys.muP(ntot, 300);
  }

  /** シート抵抗 [Ω/□]。表面から最初の接合まで（接合が無ければ計算した深さ全部） */
  function sheet(w, ix) {
    var p = profile(w, ix);
    if (!p.n) return null;
    var j = junctions(p), zj = j.length ? j[0] : Infinity;
    var g = 0;
    for (var k = 0; k < p.n && p.z[k] < zj; k++) {
      var a = active(p, k), n = a.nd - a.na, tot = a.nd + a.na;
      g += Q * mu(n > 0, tot) * Math.abs(n) * p.dz[k];
    }
    return g > 0 ? 1 / g : Infinity;
  }

  /** シリコンにじかに乗っている酸化膜の厚み [cm] */
  function oxideOn(w, ix) {
    var c = w.films[ix];
    return c.length && c[0].mat === 'ox' ? c[0].t : 0;
  }

  /**
   * 縦の1本を SemiLab の層に直す。
   *   mode 'mos'   … シリコンの上の酸化膜をゲート酸化膜として先頭に置く
   *   mode 'diode' … 膜は全部外し、シリコン表面に電極を付ける
   * 戻り値 { layers: [{mat,tnm,na,nd}], note }
   */
  function toSemi(w, ix, mode) {
    var p = profile(w, ix), layers = [], note = '';
    if (mode === 'mos') {
      var tox = oxideOn(w, ix);
      if (tox > 0) layers.push({ mat: 'ox', tnm: round(tox / G.NM, 2), na: 0, nd: 0 });
      else note = 'この位置のシリコンの上に酸化膜が無いので、MOS ではなくダイオードとして渡した。';
    }

    /* なだらかな分布を、濃度が同じくらいのところで区切る。
     * 区切りが多すぎたら許容を広げてやり直す（SemiLab の格子が膨らみすぎないように） */
    var tol = 0.12, out;
    for (var tries = 0; tries < 6; tries++) {
      out = slice(p, tol);
      if (out.length <= 60) break;
      tol *= 1.6;
    }
    layers = layers.concat(out);

    /* 計算した深さの下は基板が続いている。ダイオードの裏の電極を遠ざけるために足す */
    layers.push({
      mat: 'si', tnm: 6000,
      na: w.sub.type === 'p' ? w.sub.N : 0, nd: w.sub.type === 'n' ? w.sub.N : 0
    });
    return { layers: mergeSame(layers), note: note };
  }

  function slice(p, tol) {
    var out = [], k = 0;
    while (k < p.n) {
      var s = k, sgn = Math.sign(p.net[k]), ref = Math.log10(Math.abs(p.net[k]) || 1);
      var t = 0, nd = 0, na = 0;
      while (k < p.n) {
        var lg = Math.log10(Math.abs(p.net[k]) || 1);
        if (k > s && (Math.sign(p.net[k]) !== sgn || Math.abs(lg - ref) > tol || t > 400 * G.NM)) break;
        t += p.dz[k]; nd += p.nd[k] * p.dz[k]; na += p.na[k] * p.dz[k];
        k++;
      }
      out.push({ mat: 'si', tnm: round(t / G.NM, 3), nd: sig(nd / t), na: sig(na / t) });
    }
    return out;
  }

  function mergeSame(ls) {
    var out = [];
    ls.forEach(function (L) {
      var q = out[out.length - 1];
      if (q && q.mat === L.mat && q.na === L.na && q.nd === L.nd) q.tnm = round(q.tnm + L.tnm, 3);
      else out.push(L);
    });
    return out;
  }

  function round(v, d) { var f = Math.pow(10, d); return Math.round(v * f) / f; }
  function sig(v) { return v > 0 ? Number(v.toPrecision(4)) : 0; }

  PL.measure = {
    ACTIVE: ACTIVE, profile: profile, junctions: junctions, xj: xj, surface: surface,
    sheet: sheet, oxideOn: oxideOn, toSemi: toSemi, mu: mu
  };
})(typeof window !== 'undefined' ? window : globalThis);
