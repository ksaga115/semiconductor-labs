/* カメラ ― 平らな光を撮って、1枚の画像（DN の並び）を返す
 *
 * 1画素に起きることを、順番どおりに振る:
 *
 *   1. 光子が来て電子になる    ポアソン（平均 = QE × 光子束 × 面積 × 露光 × その画素の感度）
 *   2. 暗電流の電子も溜まる    ポアソン（平均 = その画素の暗電流 × 露光）
 *   3. 井戸があふれたら頭打ち   満杯（FW）より多くは溜まらない
 *   4. 読み出しで電圧になる     電子 ÷ K ＋ 読み出し雑音（正規）＋ オフセット
 *   5. AD で整数にする         四捨五入して 0〜2^bits−1 に収める（量子化と、上の飽和）
 *
 * 【固定パターン】画素ごとの感度のばらつき（PRNU）と暗電流のばらつき（DSNU）は、
 * カメラごとに1回だけ振って覚えておく（撮るたびに変わらない ― だから「固定」）。
 * 2枚撮って引き算すると、固定パターンは消えて時間でゆらぐ雑音だけが残る。
 * これが PTC の「差分法」の要で、ptc.js がやっている。
 *
 * 【謎のカメラ】課題の測る側で使うカメラは、中身の数字を画面に出さない。
 * 撮って、測って、当てる。答え合わせはここに書いた真の値と比べる。
 */
(function (global) {
  'use strict';
  var PX = global.PX || (global.PX = {});
  var RNG = PX.rng;

  var W = 64, H = 64;              /* 1枚の大きさ（4096 画素。分散の推定が ±2% になる数） */

  /*
   * 謎のカメラ。flux は課題で当てる光（光子/µm²/s）で、値は伏せてある。
   * どれも「あり得る」数字にしてある（CMOS イメージセンサの仕様書で見る範囲）。
   */
  /*
   * 【井戸が先か、AD が先か】FW/K（井戸を満たしたときの DN）が AD の上限を超えると、
   * **井戸があふれる前に AD が振り切れる**。PTC に見える「飽和」はそのどちらか早いほう。
   * 最初 A を 12bit にしていて、井戸を測ったつもりが AD の上限を測っていた（57% 小さく出た）。
   * A と B は井戸が先（FW/K + オフセット < 上限）。C はわざと AD が先にしてあり、それを当てる課題がある。
   */
  var MYSTERY = {
    A: {
      name: '謎のカメラ A', K: 2.37, read: 4.1, fw: 18500, dark: 3.2, prnu: 0.013, dsnu: 0.25,
      offset: 128, bits: 14, qe: 0.52, area: 30.25, flux: 1200, seed: 20260911
    },
    B: {
      name: '謎のカメラ B', K: 0.83, read: 1.9, fw: 6100, dark: 0.55, prnu: 0.008, dsnu: 0.30,
      offset: 64, bits: 14, qe: 0.61, area: 6.25, flux: 3000, seed: 424242
    },
    C: {
      name: '謎のカメラ C', K: 5.6, read: 11.5, fw: 42000, dark: 18.0, prnu: 0.021, dsnu: 0.40,
      offset: 200, bits: 12, qe: 0.44, area: 72.25, flux: 900, seed: 7777
    }
  };

  /** 固定パターン（感度と暗電流の画素ごとの倍率）。カメラごとに1回だけ作る */
  var MAPS = {};
  function maps(cam) {
    var key = [cam.seed, cam.prnu, cam.dsnu].join('|');
    if (MAPS[key]) return MAPS[key];
    var r = RNG.make(cam.seed ^ 0x5bd1e995), n = W * H, g = new Float64Array(n), dk = new Float64Array(n), i;
    for (i = 0; i < n; i++) g[i] = Math.max(0, 1 + cam.prnu * r.normal());
    for (i = 0; i < n; i++) dk[i] = Math.max(0, 1 + cam.dsnu * r.normal());
    return (MAPS[key] = { gain: g, dark: dk });
  }

  /**
   * 1枚撮る。
   *   cam   … カメラ（MYSTERY の1つか、pixel.toCamera で作ったもの）
   *   t     … 露光 [s]
   *   light … 光を当てるか（false なら暗い画像 ― ふたを閉めて撮る）
   *   seed  … この1枚の種（同じ種なら同じ画像）
   *   flux  … 光子束 [光子/µm²/s]（省けばカメラの flux）
   * 戻り値 Uint16Array（DN）
   */
  function frame(cam, t, light, seed, flux) {
    var mp = maps(cam), r = RNG.make(seed >>> 0), n = W * H;
    var out = new Uint16Array(n), top = Math.pow(2, cam.bits) - 1;
    var f = light ? (flux !== undefined ? flux : cam.flux || 0) : 0;
    var sigMean = cam.qe * f * cam.area * t;
    var darkMean = cam.dark * t;
    var readDN = cam.read / cam.K;
    for (var i = 0; i < n; i++) {
      var e = r.poisson(sigMean * mp.gain[i]) + r.poisson(darkMean * mp.dark[i]);
      if (e > cam.fw) e = cam.fw;
      var v = e / cam.K + readDN * r.normal() + cam.offset;
      v = Math.round(v);
      out[i] = v < 0 ? 0 : v > top ? top : v;
    }
    return out;
  }

  /** 平均と分散（母分散ではなく標本分散） */
  function stats(a) {
    var n = a.length, s = 0, i;
    for (i = 0; i < n; i++) s += a[i];
    var m = s / n, v = 0;
    for (i = 0; i < n; i++) { var d = a[i] - m; v += d * d; }
    return { mean: m, var: v / (n - 1) };
  }

  PX.camera = { W: W, H: H, MYSTERY: MYSTERY, frame: frame, stats: stats, maps: maps };
})(typeof window !== 'undefined' ? window : globalThis);
