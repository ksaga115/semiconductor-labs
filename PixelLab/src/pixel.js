/* 画素の設計 ― 寸法と回路から、カメラとしての数字を出す
 *
 * 設計で決めるもの（画面の左）:
 *
 *   pitch   画素ピッチ [µm]              面積が光の量も、井戸の大きさも、暗電流も決める
 *   pdFrac  フォトダイオードの面積の割合    残りはトランジスタと配線
 *   ml      マイクロレンズ                有れば画素に落ちた光の 9 割が PD に届く。無ければ pdFrac ぶんだけ
 *   epi     光を集める層の厚み [µm]        SemiLab で量子効率を計算する（赤は厚くないと拾えない）
 *   fwd     井戸の深さ [e-/µm²]           PD の面積 1µm² あたりに溜められる電子
 *   cfd     浮遊拡散の容量 [fF]            小さいほど 1 電子あたりの電圧（変換ゲイン）が大きい
 *   sf      読み出し回路の雑音 [µV rms]     ソースフォロワと列回路の熱雑音・1/f 雑音をまとめたもの
 *   cds     相関二重サンプリング           リセット直後と転送後の差を取る。kTC 雑音が消える
 *   jd      暗電流密度 [pA/cm²]（60℃）     業界の仕様書は 60℃ で書く
 *   T       温度 [℃]
 *   bits    AD の桁数
 *
 * 【ここで効いてくる綱引き】
 *
 *   ・cfd を小さくすると 1 電子が大きな電圧になり、読み出し雑音（電子換算）が減る。
 *     でも浮遊拡散に溜められる電荷 C·V/q も減るので、**井戸が浮遊拡散で頭打ちになる**。
 *     暗い所に強い画素と、明るい所に強い画素は両立しない ― ダイナミックレンジの壁。
 *   ・画素を小さくすると解像は上がるが、光も井戸も減る。暗電流は面積に比例して減るが、
 *     信号も同じだけ減るので S/N は良くならない。
 *   ・暗電流は ni に比例する（空乏層の生成電流）。**ni の温度依存から「約 9℃ で倍」が出てくる** ―
 *     決め打ちの「8℃で倍」ではなく SemiLab の phys.js の ni(T) をそのまま使っている。
 *
 * 【量子効率は SemiLab で解く】p+ 0.15µm / n 1e15（厚み epi）/ n+ のフォトダイオードに
 * 逆バイアス 2V をかけ、SemiLab の light.js で量子効率を出す（反射防止あり・表面は良くパシベーション）。
 * エピを薄くすると赤外が素通りする ― ここは SemiLab 第4章と同じ物理。
 */
(function (global) {
  'use strict';
  var PX = global.PX || (global.PX = {});

  var Q = 1.602176634e-19, KB = 1.380649e-23;
  var VSWING = 1.0;                /* 浮遊拡散で使える電圧の振れ幅 [V] */
  var ML_FILL = 0.9;               /* マイクロレンズがあるときに PD に届く光の割合 */
  var T_REF = 60;                  /* 暗電流の仕様の温度 [℃] */

  function defaults() {
    return {
      pitch: 3.0, pdFrac: 0.5, ml: true, epi: 3.0, nm: 550,
      fwd: 1500, cfd: 2.0, sf: 120, cds: true,
      jd: 50, T: 25, bits: 12, prnu: 1.0, offset: 64,
      hdrR: 1                      /* 長短合成の露光比（1 = 合成なし）。第4部「ダイナミックレンジを広げる」 */
    };
  }

  /* ---- 量子効率（SemiLab） ---- */
  var QCACHE = {};
  function qeSilicon(nm, epiUm) {
    var key = nm + '|' + epiUm;
    if (QCACHE.hasOwnProperty(key)) return QCACHE[key];
    var SL = global.SL;
    if (!SL || !SL.light) throw new Error('SemiLab の物理（../SemiLab/src）が読み込まれていません');
    var st = SL.stack.create();
    SL.stack.addLayer(st, 'si', 150, { na: 5e18 });          /* 表面の p+（ピン止めの層に相当） */
    SL.stack.addLayer(st, 'si', epiUm * 1000, { nd: 1e15 }); /* 光を集める層 */
    SL.stack.addLayer(st, 'si', 1000, { nd: 1e19 });         /* 下の n+ */
    var m = SL.stack.mesh(st, 300);
    var sol = SL.poisson.solveRobust(m, { left: -2, right: 0 });
    var r = SL.light.photo(st, sol, { nm: nm, power: 1e-3, sFront: 1e3, ar: 0.05 });
    return (QCACHE[key] = r.qe);
  }

  /* ---- 暗電流の温度 ―― ni(T) に比例（空乏層の中の生成電流） ---- */
  function darkScale(Tc) {
    var SL = global.SL;
    return SL.phys.ni(Tc + 273.15) / SL.phys.ni(T_REF + 273.15);
  }

  /** 暗電流が2倍になる温度の幅 [K]（その温度のまわりで） */
  function doublingK(Tc) {
    var a = darkScale(Tc), b = darkScale(Tc + 1);
    return Math.LN2 / Math.log(b / a);
  }

  /**
   * 設計 → カメラの数字。
   * 戻り値 {
   *   area, pdArea [µm²], fill, qeSi, qe（画素として） ,
   *   fwPd, fwFd, fw [e-], limit（井戸を決めたのはどちらか）,
   *   cg [µV/e-], readSf, kTC, read [e-], K [e-/DN], quant [e-],
   *   dark [e-/s], dr [dB], snrMax
   * }
   */
  function evaluate(d) {
    var area = d.pitch * d.pitch;
    var pdArea = area * d.pdFrac;
    var fill = d.ml ? ML_FILL : d.pdFrac;
    var qeSi = qeSilicon(d.nm, d.epi);
    var qe = qeSi * fill;

    var fwPd = d.fwd * pdArea;
    var fwFd = d.cfd * 1e-15 * VSWING / Q;
    var fw = Math.min(fwPd, fwFd);

    var cg = Q / (d.cfd * 1e-15) * 1e6;                       /* µV/e- */
    var readSf = d.sf / cg;
    var Tk = d.T + 273.15;
    var kTC = Math.sqrt(KB * Tk * d.cfd * 1e-15) / Q;          /* リセット雑音 [e-] */
    var read = Math.sqrt(readSf * readSf + (d.cds ? 0 : kTC * kTC));

    /* AD: 井戸がちょうど満杯になるところを、上から少し余して割り当てる */
    var full = Math.pow(2, d.bits) - 1 - d.offset;
    var K = fw / (full * 0.95);
    var quant = K / Math.sqrt(12);

    var dark = d.jd * 1e-12 * darkScale(d.T) * pdArea * 1e-8 / Q;   /* e-/s */
    var noiseFloor = Math.sqrt(read * read + quant * quant);
    var dr = 20 * Math.log10(fw / noiseFloor);

    /* 長短2枚の合成（第4部「ダイナミックレンジを広げる」①）。
     * 短い露光は比 R のぶん同じ照度で電子が少ない ＝ 実効の天井が R 倍。
     * 床（読み出し雑音）は動かないので、合成の DR は単発 + 20log10(R)。
     * つなぎ目の SNR 段差・動体は入れていない（参考書の caveat と同じ）。 */
    var hdrR = Math.max(1, Math.min(32, d.hdrR || 1));
    var drH = dr + 20 * Math.log10(hdrR);

    return {
      area: area, pdArea: pdArea, fill: fill, qeSi: qeSi, qe: qe,
      fwPd: fwPd, fwFd: fwFd, fw: fw, limit: fwPd <= fwFd ? 'PD' : '浮遊拡散',
      cg: cg, readSf: readSf, kTC: kTC, read: read, K: K, quant: quant,
      dark: dark, floor: noiseFloor, dr: dr, snrMax: Math.sqrt(fw),
      hdrR: hdrR, drH: drH,
      prnu: d.prnu / 100, offset: d.offset, bits: d.bits, T: d.T
    };
  }

  /**
   * 信号 S [e-]、露光 t [s] のときの S/N。
   * 雑音は独立なので2乗で足す: ショット（S）・暗電流のショット（D t）・読み出し・量子化・PRNU（S の何 %）
   */
  function snr(ev, S, t) {
    var n2 = S + ev.dark * t + ev.read * ev.read + ev.quant * ev.quant + Math.pow(ev.prnu * S, 2);
    return S / Math.sqrt(n2);
  }

  /** 光子束 [光子/µm²/s] と露光 t [s] から、1画素に溜まる信号 [e-]（井戸で頭打ち） */
  function signal(ev, flux, t) {
    return Math.min(ev.qe * flux * ev.area * t, ev.fw);
  }

  /** 設計からカメラ（camera.js が撮れる形）を作る */
  function toCamera(d, seed) {
    var ev = evaluate(d);
    return {
      name: '設計したカメラ',
      K: ev.K, read: ev.read, fw: ev.fw, dark: ev.dark, prnu: ev.prnu, dsnu: 0.1,
      offset: d.offset, bits: d.bits, qe: ev.qe, area: ev.area, seed: seed || 1234
    };
  }

  PX.pixel = {
    Q: Q, KB: KB, VSWING: VSWING, ML_FILL: ML_FILL, T_REF: T_REF,
    defaults: defaults, evaluate: evaluate, snr: snr, signal: signal, toCamera: toCamera,
    qeSilicon: qeSilicon, darkScale: darkScale, doublingK: doublingK
  };
})(typeof window !== 'undefined' ? window : globalThis);
