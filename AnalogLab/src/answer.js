/* お手本 ― 設計の一例（正解ではない。採点は振る舞いだけを見る） */
(function (global) {
  'use strict';
  var AN = global.AN || (global.AN = {});
  var A = AN.analog;

  var ANS = {
    bias: {
      note: 'W/L = 2Id/(µCox·Vov²) = 2×100µ/(200µ×0.04) = 25。Vov はちょうど 0.200V。',
      design: function () { var d = A.defaults(); d.wl = 25; d.idua = 100; return d; }
    },
    eff: {
      note: 'W/L=30・Id=100µA。Vov=0.183V で gm=1.10mS、電力 0.18mW。太らせるほど安く買える。',
      design: function () { var d = A.defaults(); d.wl = 30; d.idua = 100; return d; }
    },
    gain: {
      note: 'Vov=0.2（W/L25・100µA）に RD=12kΩ。gm·RD=12、ro=100kΩ の分流で 10.7。動作点 0.6V で上下に余裕。',
      design: function () { var d = A.defaults(); d.wl = 25; d.idua = 100; d.rdk = 12; return d; }
    },
    gbw: {
      note: 'gm ≥ 3.14mS が要る。W/L=105・Id=236µA で Vov=0.150V、gm=3.15mS → 501MHz・0.425mW。',
      design: function () { var d = A.defaults(); d.wl = 105; d.idua = 236; return d; }
    },
    gain2: {
      note: 'W/L=31・Id=100µA で Vov=0.180V。gm·ro = 2/(0.1×0.180) = 111。',
      design: function () { var d = A.defaults(); d.wl = 31; d.idua = 100; return d; }
    },
    tia: {
      note: 'Rf=9kΩ。帯域 8.8MHz、雑音 1.36pA/√Hz ― 窓（7.4〜10kΩ）のまんなか。',
      design: function () { var d = A.defaults(); d.rfk = 9; return d; }
    },
    charge: {
      note: 'Cf=3fF。1000e− が 53mV になり、kTC は 22e−。小さい Cf は両得。',
      design: function () { var d = A.defaults(); d.cffF = 3; return d; }
    },
    diff: {
      note: '片側 150µA・W/L=100（Vov=0.122V）・RD=9kΩ。gm·RD=22、動作点 0.45V で下に 0.33V。',
      design: function () { var d = A.defaults(); d.wl = 100; d.idua = 150; d.rdk = 9; return d; }
    },
    lownoise: {
      note: 'W/L=200・Id=400µA。Vov=0.141V で gm=5.7mS → 1.4nV/√Hz、0.72mW。',
      design: function () { var d = A.defaults(); d.wl = 200; d.idua = 400; return d; }
    },
    sc: {
      note: 'クロック 0.1 MHz・C=0.6 pF。Req = 16.7 MΩ、√(kT/C) = 83 µV ― 窓の真ん中。',
      design: function () { var d = A.defaults(); d.fsmhz = 0.1; d.cscpf = 0.6; return d; }
    },
    ota2: {
      note: '第2段 500µA・W/L36（gm2 2.7mS = gm1 の3倍）・Cc 3pF。GBW 47MHz・PM 65°・1.08mW。',
      design: function () { var d = A.defaults(); d.idua2 = 500; d.wl2 = 36; d.ccpf = 3; return d; }
    },
    adc: {
      note: 'C = 1 pF。√(kT/C) = 64 µV ≤ 70.5 µV。合わせた雑音 95 µV で SN 比 71.4 dB・ENOB 11.6。',
      design: function () { var d = A.defaults(); d.cadcpf = 1; return d; }
    },
    buck: {
      note: 'L = 10 µH。ΔI = 8.7 × 0.275 / (10 µH × 1 MHz) = 0.239 A（第6部 10 の例題と同じ）。',
      design: function () { var d = A.defaults(); d.luh = 10; return d; }
    }
  };

  function get(id) { return ANS[id] || null; }
  function ids() { return Object.keys(ANS); }

  AN.answer = { get: get, ids: ids, all: ANS };
})(typeof window !== 'undefined' ? window : globalThis);
