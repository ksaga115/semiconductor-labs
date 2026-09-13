/* お手本 ― 設計の一例（正解ではない。採点は振る舞いだけを見る） */
(function (global) {
  'use strict';
  var DG = global.DG || (global.DG = {});
  var M = DG.sys;

  function base(patch) { var d = M.defaults(), k; for (k in patch) d[k] = patch[k]; return d; }

  var A = {
    fast: {
      note: '露光 5 ms・透過 0.6（反射防止膜の良いフィルタ）・量子効率 0.95（裏面照射）。信号 175 e⁻ で SN 比 11.8。',
      design: function () { return base({ texp: 5, topt: 0.6, qe: 0.95 }); }
    },
    dark: {
      note: 'EM-CCD（1）で 14 ms。信号 8.6 e⁻、SN 比 2.07。同じ 14 ms の sCMOS は 1.53。',
      design: function () { return base({ phot: 5e3, bgr: 0, emccd: 1, texp: 14 }); }
    },
    data: {
      note: '16 ビット（1 LSB 0.46 e⁻）で 180 枚/秒、12.08 Gb/s。',
      design: function () { return base({ nbit: 16, fps: 180 }); }
    },
    tec: {
      note: '52 K 冷やす。暗電流 0.18 e⁻/s で 10 秒 1.8 e⁻、TEC は 2.6 W 吸える。',
      design: function () { return base({ texp: 10000, dtc: 52 }); }
    },
    range: {
      note: '受光口 40 mm。300 m で 33.7 個。',
      design: function () { return base({ rng: 300, dap: 40 }); }
    },
    sun: {
      note: 'フィルタ 10 nm・視野 0.05°。背景 2.7×10⁷ /s、r·τd 0.27（第10部 06 の改善後の設計）。',
      design: function () { return base({ dlf: 10, ifov: 0.05 }); }
    },
    dead: {
      note: '不感時間 8 ns。r·τd 0.22。',
      design: function () { return base({ dlf: 10, ifov: 0.05, taud: 8 }); }
    },
    prec: {
      note: '9 パルスを 100 kHz で。266 光子で 1.95 cm、0.09 ms、あいまいさのない距離 1.5 km。',
      design: function () { return base({ npulse: 9 }); }
    },
    grat: {
      note: '415 本/mm。全長 12.55 mm（±6.4 の中）、分解能の目安 2.41 nm。',
      design: function () { return base({ lpmm: 415 }); }
    },
    slit: {
      note: 'スリット 50 µm（2 画素）。入る光 10.3%、分解能の目安 2.50 nm のまま。',
      design: function () { return base({ slitum: 50 }); }
    },
    absorb: {
      note: '196 回平均で 9.8×10⁻⁵、0.98 秒。',
      design: function () { return base({ navg: 196 }); }
    },
    calib: {
      note: '200 回・傾き 0.002 AU/nm の場所（吸収の山の頂上寄り）。9.7×10⁻⁵ と 1.0×10⁻⁴ を合わせて 1.39×10⁻⁴。',
      design: function () { return base({ navg: 200, dlcal: 0.05, slope: 0.002 }); }
    },
    petwin: {
      note: '窓の下限 455 keV。28.7° より大きく曲がった散乱を落とし、本物は 99.4% 残る。',
      design: function () { return base({ lwin: 455 }); }
    },
    tof: {
      note: '窓 2.8 ns（視野を横切る 2.33 ns 以上）で偶発 28 /s。時刻の分解能 150 ps で 2.25 cm。',
      design: function () { return base({ wcoin: 2.8, ctr: 150 }); }
    },
    flrep: {
      note: '13 MHz。周期 76.9 ns ＝ 7.7τ で持ち越し 0.046%、画像 1 枚 84 分。',
      design: function () { return base({ tauf: 10, fflim: 13 }); }
    },
    flmu: {
      note: 'µ 0.03。パイルアップ 1.5%、計数 1.18×10⁶ /s で画像 1 枚 9.2 分。',
      design: function () { return base({ mu: 0.03 }); }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  DG.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
