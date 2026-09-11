/* バンド図 ― 電位を「電子から見た高さ」に裏返す
 *
 * poisson.js は電位 ψ [V] を返す。バンド図はそれを電子のエネルギー [eV] で見る。
 * 電子は負電荷なので **符号が逆になる**。裏返すのはここ一箇所だけ。
 *
 *     Ei(x) = -ψ(x)                      真性準位。これが全部の基準
 *     Ec    = Ei + Eg/2 + (Vt/2)ln(Nc/Nv)
 *     Ev    = Ei - Eg/2 + (Vt/2)ln(Nc/Nv)
 *     EFn   = -φn                        電子の準フェルミ準位
 *     EFp   = -φp                        正孔の準フェルミ準位
 *
 * 【Ei は真ん中ではない】Nc と Nv が違うので、真性準位は禁制帯のど真ん中から
 * (Vt/2)ln(Nc/Nv) ＝ 300K で 12.8meV だけ下にずれる。図では見えない量だが、
 * 「真性＝真ん中」と書くと嘘になるので式には入れてある。
 *
 * 【酸化膜】伝導帯の段差は電子親和力の差 χ(Si) - χ(SiO2) = 3.10eV。
 * これが「なぜ酸化膜が絶縁するか」の答えそのもの ―
 * 電子はこの 3.1eV の壁を越えられない。図でも壁として立てて見せる。
 *
 * 【平衡ならフェルミ準位は水平】EFn と EFp が重なって一直線になっているかどうかが、
 * 平衡かどうかの見分け方。バイアスをかけると2本が離れ、その隔たりがそのまま印加電圧。
 */
(function (global) {
  'use strict';
  var SL = global.SL || (global.SL = {});
  var P = SL.phys;

  var DEC_OX = null;   /* 遅延計算 */

  /** 酸化膜の伝導帯オフセット [eV] */
  function oxOffset() {
    if (DEC_OX === null) DEC_OX = P.SI.chi - P.OX.chi;
    return DEC_OX;
  }

  /**
   * バンド図を作る。
   * 戻り値 { ec, ev, ei, efn, efp, isOx[], eg, offset }
   * すべて [eV]、真性シリコンの ψ=0 を 0 とする。
   */
  function bands(sol) {
    var m = sol.mesh, T = m.T, N = m.n, i;
    var eg = P.eg(T), vt = P.vt(T);
    var shift = vt / 2 * Math.log(P.nc(T) / P.nv(T));   /* Ei が真ん中からずれる量 */

    var ec = new Float64Array(N), ev = new Float64Array(N), ei = new Float64Array(N);
    var efn = new Float64Array(N), efp = new Float64Array(N);
    var isOx = new Array(N);

    for (i = 0; i < N; i++) {
      ei[i] = -sol.psi[i];
      efn[i] = -sol.phin[i];
      efp[i] = -sol.phip[i];
      isOx[i] = m.siDx[i] <= 0;
      if (isOx[i]) {
        /* 酸化膜の中。伝導帯はシリコンの Ec からオフセットぶん持ち上がる */
        ec[i] = ei[i] + eg / 2 + shift + oxOffset();
        ev[i] = ec[i] - P.OX.eg;
      } else {
        ec[i] = ei[i] + eg / 2 + shift;
        ev[i] = ei[i] - eg / 2 + shift;
      }
    }
    return { ec: ec, ev: ev, ei: ei, efn: efn, efp: efp, isOx: isOx, eg: eg, offset: oxOffset(), shift: shift };
  }

  /** 平衡か（EFn と EFp が重なっているか）。ずれの最大値 [eV] を返す */
  function splitEF(sol) {
    var mx = 0, i;
    for (i = 0; i < sol.mesh.n; i++) {
      var d = Math.abs(sol.phin[i] - sol.phip[i]);
      if (d > mx) mx = d;
    }
    return mx;
  }

  /**
   * 曲がりの総量 ― バンドが左端から右端までに何 eV 下がったか。
   * pn 接合ならこれがビルトイン電位そのもの。
   */
  function bending(sol) {
    return sol.psi[sol.mesh.n - 1] - sol.psi[0];
  }

  var FACTS = [
    'バンド図は電位を裏返したもの。電子は負電荷なので、電位が高いところがエネルギーでは低い。',
    'フェルミ準位が水平＝平衡。傾いていたら、そこには電流が流れているか、バイアスがかかっている。',
    '酸化膜が絶縁するのは 3.1eV の段差があるから。厚さではなく、この壁の高さで決まる。'
  ];

  SL.band = { bands: bands, splitEF: splitEF, bending: bending, oxOffset: oxOffset, FACTS: FACTS };
})(typeof window !== 'undefined' ? window : globalThis);
