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
    },
    teg: {
      note: 'y = ln(Is/T³): 250 K で ln(5.50×10⁻¹⁷/1.5625×10⁷) = −54.00、400 K で ln(2.79×10⁻⁷/6.4×10⁷) = −33.07。'
          + 'Δ(1/T) = −1.5×10⁻³ /K。Eg = 8.617×10⁻⁵ × 20.93/1.5×10⁻³ = 1.20 eV（300 K の 1.12 eV ではなく、0 K へ延ばした値）。',
      design: function () { var d = M.defaults(); d.egfit = 1.203; return d; }
    },
    cvn: {
      note: '1/C²: 0 V で 1.077×10¹⁵、−1 V で 2.283×10¹⁵（cm⁴/F²）。傾き 1.206×10¹⁵ /V → N = 2/(1.602×10⁻¹⁹ × 1.036×10⁻¹² × 1.206×10¹⁵) = 1.0×10¹⁶。'
          + '横軸との交点 0 + 1.077/1.206 = 0.89 V が Vbi。',
      design: function () { var d = M.defaults(); d.n1fit = 1e16; d.vbifit = 0.893; return d; }
    },
    cvx: {
      note: '−1〜−1.5 V の組で N = 1.0×10¹⁶（W ≈ 0.52 µm）、−2〜−2.5 V の組で 3.0×10¹⁶（W ≈ 0.61 µm）。段は W = 0.556〜0.604 µm のあいだ ≈ 0.6 µm。',
      design: function () { var d = M.defaults(); d.x1fit = 0.6; d.n2fit = 3e16; return d; }
    },
    rec: {
      note: '0.30 V: Is2 = 6.61×10⁻⁷/(e^5.80 − 1) = 2.0×10⁻⁹ A。0.70 V: (7.26×10⁻³ − 2.0×10⁻⁹·e^13.54)/e^27.08 = 1.0×10⁻¹⁴ A。'
          + 'Vx = 2 × 0.025852 × ln(2×10⁵) = 0.631 V。',
      design: function () { var d = M.defaults(); d.is2fit = 2e-9; d.is1fit = 1e-14; d.vxfit = 0.631; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  CL.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
