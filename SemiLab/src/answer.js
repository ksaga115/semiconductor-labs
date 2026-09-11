/* お手本
 *
 * 課題ごとに「これで通る」構造をひとつ持っている。
 * **画面の「お手本を見る」と tests/quest.js は同じものを使う。**
 * だから、ここが通らなくなればテストが落ちる ― 課題の判定を変えたときに
 * お手本が置き去りになることがない。
 *
 * お手本は**正解ではなく一例**。採点は振る舞いだけを見るので、
 * まったく違う層の並びでも通る。
 *
 * ar は反射防止スライダの値（構造の外にある摘み）。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var ST = SL.stack;

  /** 層の並びを短く書くための道具。['si', 厚みnm, {na,nd}] の配列から作る */
  function build(rows) {
    var st = ST.create(), i;
    for (i = 0; i < rows.length; i++) {
      ST.addLayer(st, rows[i][0], rows[i][1], rows[i][2] || {});
    }
    return st;
  }

  var A = {

    /* ---- 第1章 ---- */
    ntype: {
      note: 'ドナーを 1e16 入れるだけ。完全電離なので電子はほぼその数になる。',
      make: function () { return build([['si', 1000, { nd: 1e16 }]]); }
    },
    ptype: {
      note: 'アクセプタを 1e17。電子は ni²/p まで落ちる。',
      make: function () { return build([['si', 1000, { na: 1e17 }]]); }
    },
    compensate: {
      note: 'Nd 1.01e17 と Na 1.00e17。差は 1e15 だが、散乱する不純物は 2.01e17 ある。',
      make: function () { return build([['si', 1000, { nd: 1.01e17, na: 1.00e17 }]]); }
    },
    resistivity: {
      note: 'n 型 5.2e15 で 1 Ω·cm あたり。µ が濃度で下がるので比例では合わない。',
      make: function () { return build([['si', 1000, { nd: 5.2e15 }]]); }
    },

    /* ---- 第2章 ---- */
    junction: {
      note: '1e16 どうし。隣り合わせに置いただけで Vbi 0.71V が立つ。',
      make: function () { return build([['si', 1000, { na: 1e16 }], ['si', 1000, { nd: 1e16 }]]); }
    },
    vbi: {
      note: '3.6e17 どうしで 0.90V。濃度は対数でしか効かないので、桁を動かすと行き過ぎる。',
      make: function () { return build([['si', 800, { na: 3.6e17 }], ['si', 800, { nd: 3.6e17 }]]); }
    },
    onesided: {
      note: 'p+ 1e19 と n 1e16。1000 倍の差があるので、空乏層はほぼ全部 n 側。',
      make: function () { return build([['si', 300, { na: 1e19 }], ['si', 2000, { nd: 1e16 }]]); }
    },
    reverse: {
      note: 'n 側を 1e15 まで薄くして、−5V で 2.7µm。層の厚みも要る。',
      make: function () { return build([['si', 500, { na: 1e18 }], ['si', 6000, { nd: 1e15 }]]); }
    },
    pin: {
      note: '真ん中に不純物ゼロの層。打ち消す電荷が無いので電界がそのまま通り抜ける。',
      make: function () {
        return build([['si', 500, { na: 1e19 }], ['si', 3500, {}], ['si', 500, { nd: 1e19 }]]);
      }
    },

    /* ---- 第3章 ---- */
    rectify: {
      note: 'ごく普通の pn 接合。指数関数がそのまま百万倍の差になる。',
      make: function () { return build([['si', 1000, { na: 1e17 }], ['si', 1000, { nd: 1e17 }]]); }
    },
    j0: {
      note: '両側 1e19。少数キャリアが減って J₀ が桁で下がる。拡散長より厚くしておく。',
      make: function () { return build([['si', 10000, { na: 1e19 }], ['si', 10000, { nd: 1e19 }]]); }
    },
    shortbase: {
      note: 'n 側を 2µm に。拡散長 91µm よりずっと薄いので、勾配が急になって電流が増える。',
      make: function () { return build([['si', 10000, { na: 1e19 }], ['si', 2000, { nd: 1e16 }]]); }
    },
    dark: {
      note: 'p+ 1e19 / n 5e16。濃くしすぎると寿命が縮んで逆に増えるので、真ん中あたりを狙う。',
      make: function () { return build([['si', 1000, { na: 1e19 }], ['si', 5000, { nd: 5e16 }]]); }
    },

    /* ---- 第4章 ---- */
    photo: {
      note: '薄い p+ / 厚い n / n+ の3層。フォトダイオードの基本の形。',
      make: function () {
        return build([['si', 300, { na: 1e19 }], ['si', 10000, { nd: 1e15 }], ['si', 2000, { nd: 1e19 }]]);
      }
    },
    blue: {
      note: '入射側を 150nm まで薄く。青は 0.1µm で吸われるので、そこが中性領域だと拾えない。',
      make: function () {
        return build([['si', 150, { na: 5e18 }], ['si', 10000, { nd: 1e15 }], ['si', 2000, { nd: 1e19 }]]);
      }
    },
    red: {
      note: '全体を 200µm に。1000nm の吸収長 156µm に見合う厚みが要る。',
      make: function () {
        return build([['si', 300, { na: 1e19 }], ['si', 200000, { nd: 1e14 }], ['si', 2000, { nd: 1e19 }]]);
      }
    },
    ar: {
      ar: 0.01,
      note: '反射を 1% にして、厚い空乏層で 700nm を拾う。反射は素子の外の話。',
      make: function () {
        return build([['si', 200, { na: 5e18 }], ['si', 200000, { nd: 1e14 }], ['si', 2000, { nd: 1e19 }]]);
      }
    },
    broad: {
      note: '手前は薄く（青のため）、全体は厚く（赤のため）。両立する。',
      make: function () {
        return build([['si', 150, { na: 5e18 }], ['si', 200000, { nd: 1e14 }], ['si', 2000, { nd: 1e19 }]]);
      }
    },

    /* ---- 第5章 ---- */
    moscap: {
      note: '酸化膜 5nm を左端に置くと、そこが自動でゲートになる。',
      make: function () { return build([['ox', 5], ['si', 500, { na: 1e17 }]]); }
    },
    vth: {
      note: '1e17 の基板に酸化膜 13.4nm。Qdep/Cox を厚みで稼いで 0.50V に合わせる。',
      make: function () { return build([['ox', 13.4], ['si', 500, { na: 1e17 }]]); }
    },
    swing: {
      note: '酸化膜 4nm で Cox を上げ、基板 3e17 で Vth を確保。60mV/dec には届かない。',
      make: function () { return build([['ox', 4], ['si', 500, { na: 3e17 }]]); }
    },
    nand: {
      note: 'nMOS の完成形。ここから上は NandLab の話 ― これを4個組むと NAND になる。',
      make: function () { return build([['ox', 7], ['si', 500, { na: 2.5e17 }]]); }
    }
  };

  function get(id) { return A[id] || null; }
  function make(id) { var a = A[id]; return a ? a.make() : null; }
  function ids() { return Object.keys(A); }

  SL.answer = { get: get, make: make, ids: ids, build: build, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
