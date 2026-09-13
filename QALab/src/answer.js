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
    hast: {
      note: '130 ℃・85 %RH（加圧槽）。温度で 690 倍 × 湿度で 2.8 倍 = AF ≒ 1,960 → 45 時間。',
      design: function () { var d = M.defaults(); d.ths = 130; d.rhs = 85; return d; }
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
    },
    grr: {
      note: '繰り返し σ = 0.007。σ合成 = √(0.007²+0.006²) = 0.0092 → %GR&R = 9.2 %。',
      design: function () { var d = M.defaults(); d.srpt = 0.007; return d; }
    },
    spc: {
      note: 'n = 5・k = 3。空振り 0.27%（370 群に 1 回）、1σ のずれは平均 4.5 群で見つかる。',
      design: function () { var d = M.defaults(); d.ngrp = 5; d.klim = 3; return d; }
    },
    gum: {
      note: '校正を U 1.0% に・10 回平均。u_c = √(0.5² + 0.289² + 0.158² + 0.115²) = 0.61% → U = 1.22%。',
      design: function () { var d = M.defaults(); d.ucal = 1; d.nrep = 10; return d; }
    },
    nl: {
      note: '36 回/日（40 分サイクル）。AF = (165/30)^1.9 × (1/36)^(1/3) × exp(1414·(1/328−1/398)) = 25.5 × 0.303 × 2.13 ≒ 16.5 → 222 回・6.2 日。',
      design: function () { var d = M.defaults(); d.dts = 165; d.cfs = 36; return d; }
    },
    ndc: {
      note: '繰り返し σ 0.005。σ測定 0.0078 → ndc = 1.41 × 0.03/0.0078 = 5.4 → 5、公差比 7.8 %（全変動比では 25 %）。',
      design: function () { var d = M.defaults(); d.srpt = 0.005; return d; }
    },
    oc: {
      note: 'n = 132・c = 3。AQL 1% で合格 95.6 %（α 4.4 %）、LTPD 5% で合格 9.9 %（β 9.9 %）― 教科書の定番の計画。',
      design: function () { var d = M.defaults(); d.nsmp = 132; d.cacc = 3; return d; }
    },
    tm21: {
      note: '試験 9,000 h・試料 20 個。式の上の L70 は 85,900 h、上限は 6 × 9,000 = 54,000 h なので「L70 は 54,000 h を超える」と書ける。',
      design: function () { var d = M.defaults(); d.lmT = 9000; d.lmN = 20; return d; }
    },
    repair: {
      note: 'MTTR 24 h（翌日交換）。(3λ + 1/24)/(2λ²) = 5.2×10⁷ h ― 修理なしの並列 7.5 万 h の約 700 倍。',
      design: function () { var d = M.defaults(); d.mttr = 24; return d; }
    },
    vote: {
      note: '9 か月（0.75 年）ごとに 3 台とも交換。R = 0.877 → 3R² − 2R³ = 0.958。単体なら 0.877 で届かない。',
      design: function () { var d = M.defaults(); d.trep = 0.75; return d; }
    },
    doe: {
      note: '各 4 回（N = 16）。標準誤差 2 × 2/√16 = 1.0 nm、Δ/SE = 3.0 で検出力 85%。',
      design: function () { var d = M.defaults(); d.drep = 4; return d; }
    },
    fitci: {
      note: '600 個・故障 1 個・60%。m = 2.022、使用換算 4.66×10⁷ 台·時間で 43.4 FIT。',
      design: function () { var d = M.defaults(); d.nfa = 600; d.rfa = 1; return d; }
    },
    odsel: {
      note: 'OD 2.5。100 × 10^(−2.5) = 0.32 mW ― 上限 1 mW の下で、ビームはまだ見える。',
      design: function () { var d = M.defaults(); d.od = 2.5; return d; }
    },
    allan: {
      note: '100 s（最適）。σ = √(1/100 + 0.1²/2) = 0.122。',
      design: function () { var d = M.defaults(); d.tavg = 100; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  QA.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
