/* 格子とウェーハ ― 断面を「列の束」として持つ
 *
 * ウェーハの断面を、横に並んだ 200 本の「列」として持つ。1本の列は
 *
 *     下から上へ積んだ膜の列（酸化膜・窒化膜・ポリ・金属・レジスト）
 *     ＋ その下のシリコン（深さ方向の格子に、B / P / As の濃度を持つ）
 *
 * 【2次元にしなかったところ、したところ ― ここがこのアプリの境目】
 *
 *   膜の積み方（成膜・エッチ・酸化）は**列ごとの1次元**。側壁に膜が付く、
 *   エッチが横に回り込む、LOCOS の端に鳥のくちばし（bird's beak）ができる、は出ない。
 *   ―― これを本気でやると形状の追跡（レベルセット）になり、それだけで一本のアプリになる。
 *
 *   不純物の拡散は**本当に2次元**で解く。マスクの端で接合が横にも回り込むのは出る。
 *   注入の横方向の広がり（横の飛程のばらつき）も入れてある。
 *
 * 【座標】z は「最初のシリコン表面」から下向きに正、単位は cm（SemiLab と同じ）。
 *   酸化やエッチでシリコン表面は下へ動く。その位置を列ごとに siTop に持つ。
 *   膜は siTop から上（z が負の側）へ積む。
 *
 * 【深さの格子】表面近くは 4nm、深くなるほど粗く（最大 40nm）。4µm まで。
 *   浅い接合（数十 nm）とウェル（数 µm）を同じ格子で扱うための折り合い。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});

  var NM = 1e-7, UM = 1e-4;
  var WIDTH = 10 * UM;              /* 断面の幅 10µm */
  var NX = 200;                     /* 列の数 ― 1列 50nm */
  /* 計算するシリコンの深さ。
   * 【4µm では足りなかった】ウェル（1150℃ で数時間）を打ち込むと、リンが 4µm の底まで届き、
   * 底は「流れない」境界なのでそこに溜まって、いつまでも基板の濃度まで下がらず
   * **接合が見つからなかった**（実際に踏んだ）。実物のウェルは 2〜4µm あるので 8µm にした */
  var DEPTH = 8 * UM;

  /* ---- 深さ方向の格子（全ウェーハ共通。表面が動いても格子は動かさない） ----
   * 0.4µm までは 4nm、そこから 40nm まで広げ、2µm から先は 100nm まで広げる */
  function zEdges() {
    var e = [0], z = 0, dz = 4 * NM;
    while (z < 0.4 * UM - 1e-12) { z += dz; e.push(z); }
    while (z < DEPTH - 1e-12) {
      dz = Math.min(dz * 1.05, z < 2 * UM ? 40 * NM : 100 * NM);
      z = Math.min(z + dz, DEPTH);
      e.push(z);
    }
    return e;
  }

  var ZE = zEdges();
  var NZ = ZE.length - 1;
  var ZC = new Float64Array(NZ), DZ = new Float64Array(NZ);
  (function () {
    for (var i = 0; i < NZ; i++) { ZC[i] = (ZE[i] + ZE[i + 1]) / 2; DZ[i] = ZE[i + 1] - ZE[i]; }
  })();
  var DX = WIDTH / NX;
  var XC = new Float64Array(NX);
  (function () { for (var i = 0; i < NX; i++) XC[i] = (i + 0.5) * DX; })();

  var SPECIES = ['B', 'P', 'As'];
  var DONOR = { B: false, P: true, As: true };

  /* 膜の材料。色は ui.js が決める（ここは名前だけ） */
  var MAT = {
    ox:     { name: '酸化膜 SiO₂' },
    nit:    { name: '窒化膜 Si₃N₄' },
    poly:   { name: 'ポリシリコン' },
    metal:  { name: '金属 Al' },
    resist: { name: 'レジスト' }
  };

  /** 新しいウェーハ。sub = { type: 'p'|'n', N: cm^-3 } */
  function create(sub) {
    var films = [], i;
    for (i = 0; i < NX; i++) films.push([]);
    return {
      siTop: new Float64Array(NX),
      films: films,
      C: { B: new Float64Array(NX * NZ), P: new Float64Array(NX * NZ), As: new Float64Array(NX * NZ) },
      sub: { type: sub && sub.type === 'n' ? 'n' : 'p', N: sub && sub.N > 0 ? sub.N : 1e15 },
      notes: []
    };
  }

  function clone(w) {
    return {
      siTop: new Float64Array(w.siTop),
      films: w.films.map(function (col) { return col.map(function (f) { return { mat: f.mat, t: f.t }; }); }),
      C: { B: new Float64Array(w.C.B), P: new Float64Array(w.C.P), As: new Float64Array(w.C.As) },
      sub: { type: w.sub.type, N: w.sub.N },
      notes: w.notes.slice()
    };
  }

  function idx(ix, iz) { return ix * NZ + iz; }

  /** その格子点がシリコンか（中心が表面より下にあればシリコン） */
  function isSi(w, ix, iz) { return ZC[iz] >= w.siTop[ix]; }

  /** その列で最初のシリコンの格子点 */
  function firstSi(w, ix) {
    var s = w.siTop[ix], lo = 0, hi = NZ;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (ZC[mid] >= s) hi = mid; else lo = mid + 1; }
    return lo;
  }

  function filmSum(w, ix, mat) {
    var t = 0, col = w.films[ix];
    for (var k = 0; k < col.length; k++) if (!mat || col[k].mat === mat) t += col[k].t;
    return t;
  }

  /** 一番上の面の z（膜の上端。z は下向き正なので、膜が厚いほど小さい） */
  function surfaceZ(w, ix) { return w.siTop[ix] - filmSum(w, ix); }

  function topFilm(w, ix) { var c = w.films[ix]; return c.length ? c[c.length - 1] : null; }

  /** 同じ材料が上下に続いたら1枚にまとめる（酸化膜の上に酸化膜を積んだときなど） */
  function mergeFilms(w, ix) {
    var c = w.films[ix], out = [];
    for (var k = 0; k < c.length; k++) {
      if (c[k].t <= 1e-12) continue;
      if (out.length && out[out.length - 1].mat === c[k].mat) out[out.length - 1].t += c[k].t;
      else out.push({ mat: c[k].mat, t: c[k].t });
    }
    w.films[ix] = out;
  }

  /** その点のドナー・アクセプタ（基板の不純物を含む） */
  function donors(w, ix, iz) {
    var i = idx(ix, iz);
    return w.C.P[i] + w.C.As[i] + (w.sub.type === 'n' ? w.sub.N : 0);
  }
  function acceptors(w, ix, iz) {
    var i = idx(ix, iz);
    return w.C.B[i] + (w.sub.type === 'p' ? w.sub.N : 0);
  }
  function net(w, ix, iz) { return donors(w, ix, iz) - acceptors(w, ix, iz); }

  /** x [cm] → 列の番号 */
  function colAt(xcm) { return Math.max(0, Math.min(NX - 1, Math.floor(xcm / DX))); }

  /** 全体に入っている不純物の量 [個/cm]（奥行き 1cm あたり）。熱処理で保存されるかの検査に使う */
  function inventory(w, sp) {
    var s = 0, a = w.C[sp];
    for (var ix = 0; ix < NX; ix++) {
      for (var iz = firstSi(w, ix); iz < NZ; iz++) s += a[idx(ix, iz)] * DZ[iz] * DX;
    }
    return s;
  }

  PL.grid = {
    NM: NM, UM: UM, WIDTH: WIDTH, NX: NX, DEPTH: DEPTH, NZ: NZ, ZE: ZE, ZC: ZC, DZ: DZ, DX: DX, XC: XC,
    SPECIES: SPECIES, DONOR: DONOR, MAT: MAT,
    create: create, clone: clone, idx: idx, isSi: isSi, firstSi: firstSi, filmSum: filmSum,
    surfaceZ: surfaceZ, topFilm: topFilm, mergeFilms: mergeFilms,
    donors: donors, acceptors: acceptors, net: net, colAt: colAt, inventory: inventory
  };
})(typeof window !== 'undefined' ? window : globalThis);
