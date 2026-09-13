/* お手本 ― 設計の一例（正解ではない。採点は振る舞いだけを見る） */
(function (global) {
  'use strict';
  var LS = global.LS || (global.LS = {});
  var M = LS.laser;

  var A = {
    wien: {
      note: '3,300 K。山は 0.88 µm、可視は約 11.8%。3,400 K を超えるとフィラメントの寿命で落ちる。',
      design: function () { var d = M.defaults(); d.tk = 3300; return d; }
    },
    led: {
      note: 'IQE 0.85・取り出し 0.65（表面の凹凸とチップの形）。EQE 0.525 × hν/qV 0.918 = 48%。',
      design: function () { var d = M.defaults(); d.iqe = 0.85; d.extr = 0.65; return d; }
    },
    thresh: {
      note: '長さ 300 µm・後ろ 0.95。鏡の損失 20.4 cm⁻¹ でしきい値 30.4 cm⁻¹、前から 96%。',
      design: function () { var d = M.defaults(); d.lum = 300; d.r2 = 0.95; return d; }
    },
    slope: {
      note: '300 µm。鏡の損失 39 cm⁻¹、η_d 0.72、スロープ 1.045 W/A、しきい値 49 cm⁻¹（第9部 05 の例題）。',
      design: function () { var d = M.defaults(); d.lum = 300; return d; }
    },
    t0: {
      note: '85 ℃ のしきい値 10 × e = 27.2 mA。48 mA で 1.045 × (48 − 27.2) = 21.8 mW。',
      design: function () { var d = M.defaults(); d.lum = 300; d.tempc = 85; d.iop = 48; return d; }
    },
    fsr: {
      note: '210 µm。間隔 1.59 nm、しきい値 65.8 cm⁻¹。',
      design: function () { var d = M.defaults(); d.lasnm = 1550; d.lum = 210; return d; }
    },
    dfb: {
      note: '38.2 ℃。1548.8 + 0.1 × 13.2 = 1550.12 nm。',
      design: function () { var d = M.defaults(); d.tempc = 38.2; return d; }
    },
    mlock: {
      note: '1.874 m で 80.0 MHz、スペクトル 10 nm で 94 fs。',
      design: function () { var d = M.defaults(); d.lcavm = 1.874; d.dlnm = 10; return d; }
    },
    peak: {
      note: '1.0 W。E = 12.5 nJ、尖頭値 0.94 × 12.5 nJ / 94 fs = 125 kW。',
      design: function () { var d = M.defaults(); d.lcavm = 1.874; d.dlnm = 10; d.pavg = 1.0; return d; }
    },
    relax: {
      note: '85 ℃ で 42 mA。しきい値 27.2 mA なので I − I_th = 14.8 mA、f_R = 5.77 GHz、帯域 8.97 GHz（要る 7.0）。',
      design: function () { var d = M.defaults(); d.tempc = 85; d.iop = 42; return d; }
    },
    shg: {
      note: '長さ 2.6 cm・励起 1.0 W。±0.1 ℃ の最悪で 21.8 mW、低下 16%（許容幅 FWHM 0.38 ℃）。',
      design: function () { var d = M.defaults(); d.shgL = 2.6; d.shgP = 1.0; return d; }
    },
    fiber: {
      note: '倍率 3.4（スポット半径 5.44 µm）。大きさの合い具合 99.8% × 横ずれ 92.4% = 92.2%。',
      design: function () { var d = M.defaults(); d.mag = 3.4; return d; }
    },
    calib: {
      note: '365.02 と 579.07 nm（範囲の両端に近い 2 本）。700 nm で 0.0333 nm。2 本の間の 450 nm なら 0.014 nm。',
      design: function () { var d = M.defaults(); d.calA = 365.015; d.calB = 579.066; return d; }
    },
    defect: {
      note: '976 nm 励起・1,070 nm 発振。欠損 8.79%、熱 9.63 W、励起 109.6 W（第9部 08 の例題）。',
      design: function () { var d = M.defaults(); d.pumpnm = 976; d.signm = 1070; return d; }
    },
    bright: {
      note: 'コア 200 µm・NA 0.22。輝度 3.18×10⁵ W/(m²·sr) × エテンデュ 4.78×10⁻⁹ m²·sr = 1.52 mW。',
      design: function () { var d = M.defaults(); d.fcore = 200; d.fna = 0.22; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  LS.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
