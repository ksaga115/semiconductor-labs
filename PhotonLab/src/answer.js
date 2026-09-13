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
    },
    bg: {
      note: '課題の条件を入れて M=1・帯域 0.015 MHz。背景ショット床 4.6×10⁻¹³ A/√Hz に対し SNR = 11.3。',
      design: function () {
        var d = PHO.defaults();
        d.nm = 900; d.eta = 0.9; d.pw = -9; d.bgnw = 1000; d.idpa = 10; d.ifa = 100; d.k = 0.02;
        d.M = 1; d.bmhz = 0.015;
        return d;
      }
    },
    count: {
      note: '課題の条件を入れて t=5 秒。s=138・b=500 c/s で SNR = 138×√5/√638 ≒ 12.3。',
      design: function () {
        var d = PHO.defaults();
        d.nm = 550; d.eta = 0.5; d.pw = -16; d.dkcps = 500; d.bgnw = 0;
        d.tsec = 5;
        return d;
      }
    },
    transit: {
      note: 'w = 1.0 µm ― 走行 44 GHz と RC 44 GHz がほぼ釣り合い、合成 31 GHz。',
      design: function () { var d = PHO.defaults(); d.diamum = 30; d.wum = 1.0; return d; }
    },
    pile: {
      note: '80 MHz（定番）。p = 1.38×10⁶/8×10⁷ = 1.7%、周期 12.5 ns で寿命 2.5 ns まで測れる。',
      design: function () {
        var d = PHO.defaults();
        d.nm = 550; d.eta = 0.5; d.pw = -12; d.taufl = 2;
        d.freps = 80;
        return d;
      }
    },
    ingaas: {
      note: '課題の条件を入れて M=15。F(15)=7.3 で SNR ≒ 5.25（山の頂上）。M=10 は 4.8、M=30 は 4.5。',
      design: function () {
        var d = PHO.defaults();
        d.nm = 1550; d.eta = 0.8; d.pw = -7; d.idpa = 10000; d.ifa = 5000; d.bmhz = 1000; d.k = 0.4;
        d.M = 15;
        return d;
      }
    },
    thresh: {
      note: '課題の条件を入れて、しきい値 5 p.e.。偽 5×10⁵ × 0.1⁴ = 50 cps、信号（平均 10 p.e.）の 97.1% が 5 個以上。',
      design: function () {
        var d = PHO.defaults();
        d.dkcps = 5e5; d.pct = 0.1; d.mupe = 10;
        d.thr = 5;
        return d;
      }
    },
    scint: {
      note: '集光 0.3・PDE 0.3 で 1,380 光電子。統計 6.5%（ENF 1.05）と固有 8% で 10.3%、飽和 4.7%。',
      design: function () {
        var d = PHO.defaults();
        d.ekev = 511; d.ly = 30; d.rint = 8; d.pct = 0.05; d.ncell = 14400;
        d.lce = 0.3; d.eta = 0.3;
        return d;
      }
    },
    xres: {
      note: 'ENC 5 e⁻。N = 1,630、ファノの限界 116.7 eV と二乗和で 124.3 eV（2.1%）。',
      design: function () { var d = PHO.defaults(); d.ekev = 5.9; d.wev = 3.62; d.fano = 0.115; d.enc = 5; return d; }
    },
    dead: {
      note: 'τ = 20 ns。nτ = 0.04 で数え落とし 3.85%、数えた率 1.92×10⁶ /s。',
      design: function () { var d = PHO.defaults(); d.ntrue = 2e6; d.dtype = 0; d.dtau = 20; return d; }
    },
    pdlin: {
      note: '逆バイアス 1.0 V。C_j 9.19 pF で帯域 1.73 MHz、目減りは 1% 未満。',
      design: function () { var d = PHO.defaults(); d.pdua = 100; d.rlk = 10; d.vr = 1; return d; }
    }
  };

  function get(id) { return A[id] || null; }
  function ids() { return Object.keys(A); }

  PH.answer = { get: get, ids: ids, all: A };
})(typeof window !== 'undefined' ? window : globalThis);
