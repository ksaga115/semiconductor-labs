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
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  LS.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
