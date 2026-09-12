/* お手本 ― 設計の一例（正解ではない。採点は振る舞いだけを見る）
 *
 * 画面の「お手本を見る」と tests/quest.js は同じこれを使う。
 * どの design() も defaults() から出発して、課題が固定する欄と
 * 動かすべき欄だけを触る ― 人がやるのと同じ手順。
 */
(function (global) {
  'use strict';
  var PH = global.PH || (global.PH = {});
  var PHO = PH.photon;

  var A = {
    resp: {
      note: '波長を 850 に、η を 0.85 に。R = 0.85×850/1240 = 0.583 A/W。',
      design: function () { var d = PHO.defaults(); d.nm = 850; d.eta = 0.85; return d; }
    },
    rate: {
      note: '1pW のまま波長を 660nm に。1光子 1.88eV なので 10⁻¹² ÷ (1.88×1.6×10⁻¹⁹) ≒ 3.3×10⁶ 個/s。',
      design: function () { var d = PHO.defaults(); d.pw = -12; d.nm = 660; return d; }
    },
    nep: {
      note: '900nm・η0.9 で R=0.65。暗電流 3pA（ショット ≒1fA/√Hz）とアンプ 2fA/√Hz で、NEP ≒ 3.4×10⁻¹⁵。',
      design: function () { var d = PHO.defaults(); d.nm = 900; d.eta = 0.9; d.M = 1; d.idpa = 3; d.ifa = 2; return d; }
    },
    apdopt: {
      note: '課題の条件を全部入れて、M=80。F=3.5 で SNR≒2.2。M=1 では 0.07、M=300 では 1.6 で届かない。',
      design: function () {
        var d = PHO.defaults();
        d.nm = 900; d.eta = 0.9; d.pw = -9; d.ifa = 1000; d.bmhz = 100; d.k = 0.02; d.idpa = 10;
        d.M = 80;
        return d;
      }
    },
    pmt: {
      note: 'δ=4・10段。利得 4¹⁰ ≒ 1.05×10⁶、過剰雑音 4/3 ≒ 1.33。',
      design: function () { var d = PHO.defaults(); d.delta = 4; d.nstg = 10; return d; }
    },
    mppc: {
      note: 'μ = 2000×0.4 = 800。セル 8000 個で μ/N=0.1、発火 761 セル、目減り 4.8%。',
      design: function () { var d = PHO.defaults(); d.nph = 2000; d.eta = 0.4; d.ncell = 8000; return d; }
    },
    fast: {
      note: 'C を 0.4 pF に。1/(2π×50×0.4pF) = 7.96 GHz。',
      design: function () { var d = PHO.defaults(); d.cpf = 0.4; return d; }
    },
    nepm: {
      note: '課題の条件を入れて M=50。アンプの床 100fA が 2fA 相当に沈み、F=2.9 で NEP ≒ 1.5×10⁻¹⁴。',
      design: function () {
        var d = PHO.defaults();
        d.nm = 900; d.eta = 0.9; d.idpa = 100; d.ifa = 100; d.k = 0.02;
        d.M = 50;
        return d;
      }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  PH.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
