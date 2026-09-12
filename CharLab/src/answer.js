/* お手本 ― 抽出の手順つき。答案の欄に正しい読みを書き込む
 *
 * measure 型なので「お手本」は真の値そのもの。価値は数字ではなく note の手順にある。
 */
(function (global) {
  'use strict';
  var CL = global.CL || (global.CL = {});
  var M = CL.char;

  var A = {
    dn: {
      note: 'I(0.55)/I(0.45) = 17.2。n = 0.10/(0.025852×ln17.2) = 1.36。',
      design: function () { var d = M.defaults(); d.nfit = 1.36; return d; }
    },
    dis: {
      note: 'I(0.5)=3.00×10⁻⁷。Is = 3.00×10⁻⁷/e^(0.5/0.03516) = 2.0×10⁻¹³ A。',
      design: function () { var d = M.defaults(); d.isfit = 2e-13; return d; }
    },
    drs: {
      note: 'V=0.9 で I=8.5mA。理想なら 0.860V で足りるはず ― 差 0.040V ÷ 8.5mA ≒ 4.7 Ω。',
      design: function () { var d = M.defaults(); d.rsfit = 4.7; return d; }
    },
    mvth: {
      note: '傾き = (12.48−6.08)µA/0.4V = 16µA/V。Vth = 1.4 − 12.48µA/16µA/V = 0.62 V。',
      design: function () { var d = M.defaults(); d.vthfit = 0.62; return d; }
    },
    mk: {
      note: '傾き 16µA/V ÷ Vd 0.05V = 3.2×10⁻⁴ A/V²。',
      design: function () { var d = M.defaults(); d.kwlfit = 3.2e-4; return d; }
    },
    mss: {
      note: 'I(0.4)/I(0.3) = 12.2 ― 100mV で 1.087 桁。S = 100/1.087 = 92 mV/dec。',
      design: function () { var d = M.defaults(); d.ssfit = 92; return d; }
    },
    ctox: {
      note: '蓄積の棚 821 nF/cm²。tox = 3.45×10⁻¹³/8.21×10⁻⁷ = 4.2×10⁻⁷ cm = 4.2 nm。',
      design: function () { var d = M.defaults(); d.toxfit = 4.2; return d; }
    },
    cna: {
      note: 'Wdmax = εs(1/139n − 1/821n) = 62 nm。Na = 4εs·0.44/(q·Wdmax²) ≒ 3×10¹⁷。φF を1回まわしても動かない。',
      design: function () { var d = M.defaults(); d.nafit = 3e17; return d; }
    },
    cvfb: {
      note: 'C-V が 821 nF/cm² の棚を離れるのは −0.9 V。',
      design: function () { var d = M.defaults(); d.vfbfit = -0.9; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  CL.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
