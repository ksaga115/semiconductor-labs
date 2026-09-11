/* 乱数 ― 種を決めれば毎回同じ列が出る
 *
 * 画素ラボの画像は全部「振って」作る（光子が何個来たか、読み出しで何 e- ゆれたか）。
 * 種を固定するのは、検査と採点のため ― 同じカメラ・同じ露光なら同じ画像が出ないと、
 * 「測った値が合っているか」を機械が確かめられない。
 *
 * Math.random は使わない（種を決められない）。mulberry32 は 32bit で速く、偏りも小さい。
 */
(function (global) {
  'use strict';
  var PX = global.PX || (global.PX = {});

  function make(seed) {
    var a = (seed >>> 0) || 1;
    var spare = null;

    /** 一様 [0, 1) */
    function next() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** 標準正規（Box-Muller。2つ作って1つ取っておく） */
    function normal() {
      if (spare !== null) { var s = spare; spare = null; return s; }
      var u = 0, v = 0;
      while (u <= 1e-300) u = next();
      v = next();
      var r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    }

    /**
     * ポアソン分布。光子も暗電流の電子も「平均 λ で、ばらつきも λ」― ショットノイズの正体。
     * λ が小さいうちは定義どおり（Knuth）。大きいと重いので正規で近似する
     * （λ ≥ 30 なら分散はちょうど λ、形の差は画素ラボで見る量に効かない）。
     */
    function poisson(lam) {
      if (!(lam > 0)) return 0;
      if (lam < 30) {
        var L = Math.exp(-lam), k = 0, p = 1;
        do { k++; p *= next(); } while (p > L);
        return k - 1;
      }
      var x = Math.round(lam + Math.sqrt(lam) * normal());
      return x < 0 ? 0 : x;
    }

    return { next: next, normal: normal, poisson: poisson };
  }

  PX.rng = { make: make };
})(typeof window !== 'undefined' ? window : globalThis);
