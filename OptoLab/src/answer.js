/* お手本 ― 設計の一例（正解ではない。採点は振る舞いだけを見る） */
(function (global) {
  'use strict';
  var OP = global.OP || (global.OP = {});
  var O = OP.opto;

  var A = {
    lux: {
      note: 'F2.8 に開く。162/(4×7.84) = 5.17 lx ― 第4部の仮想カメラと同じ条件。',
      design: function () { var d = O.defaults(); d.N = 2.8; return d; }
    },
    inv: {
      note: 'I = 50 cd。E = 50/2² = 12.5 lx。',
      design: function () { var d = O.defaults(); d.cd = 50; return d; }
    },
    lockin: {
      note: '帯域を 0.1 Hz に絞る。√(1000/0.1) = 100 倍。時定数は約 1.6 秒。',
      design: function () { var d = O.defaults(); d.blk = 0.1; return d; }
    },
    lens: {
      note: 'a = 2f = 100 mm。b も 100 mm になり、倍率ちょうど 1。',
      design: function () { var d = O.defaults(); d.amm = 100; return d; }
    },
    airy: {
      note: 'F2.2。2.44×0.555×2.2 = 2.98 µm。',
      design: function () { var d = O.defaults(); d.N = 2.2; return d; }
    },
    res: {
      note: 'NA 0.70。0.61×0.555/0.7 = 0.484 µm。',
      design: function () { var d = O.defaults(); d.naobj = 0.7; return d; }
    },
    gauss: {
      note: 'ビームを半径 2 mm に太らせる。w₀ = 1.064×50/(π×2) mm = 8.5 µm → 集光径 16.9 µm。',
      design: function () { var d = O.defaults(); d.nm = 1064; d.winmm = 2; return d; }
    },
    fiber: {
      note: 'w = 4 mm。スポット 8.5 µm ≤ コア10、ビームNA 0.08 ≤ 0.14 ― 窓（3.4〜7mm）のまんなか。',
      design: function () { var d = O.defaults(); d.nm = 1064; d.winmm = 4; return d; }
    },
    ar: {
      note: 'n = 1.97（= √3.9）。残留反射はほぼゼロ。31% がひと塗りで消える。',
      design: function () { var d = O.defaults(); d.ncoat = 1.97; return d; }
    },
    etd: {
      note: 'コア 150 µm・NA 0.45。コア×NA = 67.5 ≥ 63.6 で上限 (67.5/90)² = 56%。',
      design: function () { var d = O.defaults(); d.coreu = 150; d.naf = 0.45; return d; }
    },
    cos4: {
      note: 'f = 50 mm。θ = atan(21.6/50) = 23.4°、cos⁴ = 71%。',
      design: function () { var d = O.defaults(); d.hmm = 21.6; d.fmm = 50; return d; }
    },
    mode: {
      note: 'w = 5.5 mm。w₀ = 3.08 µm ≈ MFD/2 = 3.1 µm で η ≈ 100%。',
      design: function () { var d = O.defaults(); d.nm = 1064; d.winmm = 5.5; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  OP.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
