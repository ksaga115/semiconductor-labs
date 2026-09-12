/* お手本 ― 設計の一例（正解ではない。採点は振る舞いだけを見る） */
(function (global) {
  'use strict';
  var QA = global.QA || (global.QA = {});
  var M = QA.qa;

  var A = {
    mttf: {
      note: '部品を 50 FIT に。系は 5,000 FIT → MTTF 2×10⁵ h ≒ 22.8 年。',
      design: function () { var d = M.defaults(); d.fitr = 50; return d; }
    },
    series: {
      note: '直列を 50 個に減らす。系は 2,500 FIT → 45.7 年。集積化は信頼性でもある。',
      design: function () { var d = M.defaults(); d.fitr = 50; d.nser = 50; return d; }
    },
    accel: {
      note: '試験温度 150 ℃。AF = exp(0.7/k·(1/328−1/423)) ≒ 260 → 87,600h/260 ≒ 337 h。',
      design: function () { var d = M.defaults(); d.tstr = 150; return d; }
    },
    weib: {
      note: 'm=2・η=16,000 h。B10 = 16,000×0.325 ≒ 5,190 h。',
      design: function () { var d = M.defaults(); d.mweib = 2; d.etah = 16000; return d; }
    },
    peck: {
      note: '85 ℃・85 %RH。AF = (85/60)³ × exp(0.79/k·(1/313−1/358)) ≒ 2.8×40 ≒ 113 → 778 h。',
      design: function () { var d = M.defaults(); d.ths = 85; d.rhs = 85; return d; }
    },
    cm: {
      note: 'ΔT = 165 K（−40〜125 ℃）。AF = (165/30)² ≒ 30 → 3,650 回 ÷ 30 ≒ 121 回。',
      design: function () { var d = M.defaults(); d.dts = 165; return d; }
    },
    theta: {
      note: 'θsa = 15 K/W の放熱器。Tj = 40 + 2×(1.5+0.5+15) = 74 ℃。',
      design: function () { var d = M.defaults(); d.thsa = 15; return d; }
    },
    tec: {
      note: 'ΔT = 50 K に置く。Qc = 5×(1−50/70) = 1.43 W ≥ 負荷 1.2 W。55 K では 1.07 W で負ける。',
      design: function () { var d = M.defaults(); d.dtc = 50; return d; }
    },
    cpk: {
      note: 'σ = 0.06。Cpk = (0.3−0.05)/(3×0.06) = 1.39、不良は数十 ppm。',
      design: function () { var d = M.defaults(); d.sigma = 0.06; return d; }
    },
    prop: {
      note: 'B = 0.4%。√(0.3²+0.4²) = 0.5% ― 足し算の 0.7% ではない。',
      design: function () { var d = M.defaults(); d.s2 = 0.4; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  QA.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
