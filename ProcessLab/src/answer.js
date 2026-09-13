/* お手本のレシピ
 *
 * 画面の「お手本を見る」と tests/quest.js が同じものを使う（SemiLab と同じ作法）。
 * お手本は**正解ではなく一例**。採点はできたウェーハしか見ない。
 * 数字は tests/quest.js が通ることを確かめて決めた（見当で置かない）。
 */
(function (global) {
  'use strict';
  var PL = global.PL || (global.PL = {});
  var R = PL.recipe;

  function rc(sub, steps) { var r = R.create(sub); r.steps = steps; return r; }
  /* 第5章: 工程は無く、計算の欄だけを持つ */
  function calc(patch) {
    var r = R.create({ type: 'p', N: 1e15 }), d = PL.quest.calc.DEF, k;
    r.calc = {};
    for (k in d) r.calc[k] = d[k];
    for (k in patch) r.calc[k] = patch[k];
    return r;
  }
  var P15 = { type: 'p', N: 1e15 }, N14 = { type: 'n', N: 1e14 };
  var LEFT = function () { return R.maskRanges([[0, 5]]); };
  var RIGHT = function () { return R.maskRanges([[5, 10]]); };

  var A = {
    dryox: {
      note: '1000℃ で1時間のドライ酸化。薄いうちは速く、厚くなると遅くなる。',
      make: function () { return rc(P15, [{ t: 'heat', C: 1000, min: 60, amb: 'dry' }]); }
    },
    wetox: {
      note: 'ウェットなら 1000℃ 90 分で 500nm に届く。ドライだと同じ厚みに一日かかる。',
      make: function () { return rc(P15, [{ t: 'heat', C: 1000, min: 90, amb: 'wet' }]); }
    },
    locos: {
      note: '薄い下敷きの酸化膜の上に窒化膜。左だけ窒化膜を取ってから焼くと、左だけ厚く育つ。',
      make: function () {
        return rc(P15, [
          { t: 'depo', mat: 'ox', nm: 20 },
          { t: 'depo', mat: 'nit', nm: 100 },
          { t: 'mask', open: LEFT(), nm: 1000 },
          { t: 'etch', mat: 'nit', nm: 0 },
          { t: 'strip' },
          { t: 'heat', C: 1000, min: 90, amb: 'wet' }
        ]);
      }
    },
    open: {
      note: 'レジストで右を覆ってから打つ。30keV の B はレジスト 1µm で止まる。',
      make: function () {
        return rc(P15, [
          { t: 'mask', open: LEFT(), nm: 1000 },
          { t: 'imp', ion: 'B', keV: 30, dose: 1e15 },
          { t: 'strip' }
        ]);
      }
    },
    peak: {
      note: 'P を 80keV。飛程の表で Rp ≒ 98nm。',
      make: function () { return rc(P15, [{ t: 'imp', ion: 'P', keV: 80, dose: 1e14 }]); }
    },
    guard: {
      note: 'レジストを 2µm に厚くする。1µm だと 150keV の B は 1 割近く突き抜ける。',
      make: function () {
        return rc(P15, [
          { t: 'mask', open: LEFT(), nm: 2000 },
          { t: 'imp', ion: 'B', keV: 150, dose: 2e14 },
          { t: 'strip' }
        ]);
      }
    },
    xj: {
      note: 'P 1e15・50keV を 1000℃ で10分（0.28µm）。20 分だと 0.35µm まで行きすぎる ― 時間を倍にしても深さは √2 倍にしかならない。',
      make: function () {
        return rc(P15, [
          { t: 'imp', ion: 'P', keV: 50, dose: 1e15 },
          { t: 'heat', C: 1000, min: 10, amb: 'N2' }
        ]);
      }
    },
    sheet: {
      note: 'ドーズを 5e15 に上げる。深さはほとんど変わらず、抵抗だけ下がる。',
      make: function () {
        return rc(P15, [
          { t: 'imp', ion: 'P', keV: 50, dose: 5e15 },
          { t: 'heat', C: 1000, min: 20, amb: 'N2' }
        ]);
      }
    },
    shallow: {
      note: 'As を 10keV で打ち、900℃ で1分だけ。As は重くて遅いので浅いまま。',
      make: function () {
        return rc(P15, [
          { t: 'imp', ion: 'As', keV: 10, dose: 1e15 },
          { t: 'heat', C: 900, min: 1, amb: 'N2' }
        ]);
      }
    },
    well: {
      note: '左だけ開けてリンを 150keV。レジストを外して 1150℃ で 90 分。'
          + '深さ 2.5µm、横にはマスクの端から 2µm。5 時間焼くと深さ 4.2µm になるが、'
          + '横にも 3.4µm 広がって右半分（端から 2.5µm）まで n 型になる。',
      make: function () {
        return rc(P15, [
          { t: 'mask', open: LEFT(), nm: 1500 },
          { t: 'imp', ion: 'P', keV: 150, dose: 5e13 },
          { t: 'strip' },
          { t: 'heat', C: 1150, min: 90, amb: 'N2' }
        ]);
      }
    },
    pd: {
      note: '薄い n 型基板に B を 10keV で浅く。950℃ 10分で活性化だけする。',
      make: function () {
        return rc(N14, [
          { t: 'imp', ion: 'B', keV: 10, dose: 5e14 },
          { t: 'heat', C: 950, min: 10, amb: 'N2' }
        ]);
      }
    },
    mos: {
      note: 'しきい値調整に B 1e12・20keV、ドライ酸化 900℃ 10分で 12.5nm。Vth は SemiLab で 0.52V。',
      make: function () {
        return rc(P15, [
          { t: 'imp', ion: 'B', keV: 20, dose: 1e12 },
          { t: 'heat', C: 900, min: 10, amb: 'dry' }
        ]);
      }
    },
    cmos: {
      note: '右だけ n ウェルを掘ってから、全面をドライ酸化。これで nMOS と pMOS の土台が並ぶ。',
      make: function () {
        return rc(P15, [
          { t: 'mask', open: RIGHT(), nm: 1500 },
          { t: 'imp', ion: 'P', keV: 150, dose: 5e13 },
          { t: 'strip' },
          { t: 'heat', C: 1150, min: 90, amb: 'N2' },
          { t: 'heat', C: 900, min: 10, amb: 'dry' }
        ]);
      }
    },
    shot: {
      note: '露光量 38 mJ/cm²。一辺 10 nm に 2,583 個、揺らぎ 1.97%。ArF 並み（0.59%）にするには 14.3 倍の約 429 mJ/cm² が要る。',
      make: function () { return calc({ dose: 38 }); }
    },
    chiplet: {
      note: '9 個に分ける。1 個 0.933 cm² で歩留まり 91.3%、総面積 8.4 cm²。8 個（90.4%・8.3 cm²）、10 個（92.0%・8.5 cm²）でも通る。',
      make: function () { return calc({ nsplit: 9 }); }
    },
    d0: {
      note: 'D₀ 0.05 /cm²。負の二項で 70.9%（ポアソンなら 68.7%）。',
      make: function () { return calc({ d0: 0.05 }); }
    }
  };

  function get(id) { return A[id] || null; }
  function make(id) { var a = A[id]; return a ? a.make() : null; }
  function ids() { return Object.keys(A); }

  PL.answer = { get: get, make: make, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
