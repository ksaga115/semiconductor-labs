/* 特性ラボ ― 謎の素子を測って、パラメータを当てる
 *
 * 第2部『デバイスの基礎』の逆問題。SemiLab が「作る」なら、ここは「測る」。
 * 3つの謎の素子（ダイオード D・MOSFET M・MOS 容量 C）の測定表と特性曲線から、
 * 中のパラメータを自分の手で抽出して、答案の欄に書く。採点は真の値との差だけを見る
 * （PixelLab の「謎のカメラ」と同じ流儀。真値はこのファイルにある ― 見たければ見ればいい。
 * 　課題の価値は答えではなく、曲線から数字を取り出す手つきにある）。
 *
 * measurement の物理（すべて教科書の式。乱数なし ― 測定は毎回同じ）:
 *   ダイオード   I = Is·(exp((V − I·Rs)/(n·Vt)) − 1)   … Rs 込みの陰関数を二分法で解く
 *   MOSFET      Id = µCox(W/L)·Vd·ζ、ζ = m·Vt·ln(1+exp((Vg−Vth)/(m·Vt)))、m = S/(Vt·ln10)
 *               （Vd=50mV の深い線形領域。ζ は強反転で Vg−Vth、弱反転で指数につながる補間）
 *   MOS 容量     蓄積で Cox = εox/tox、空乏で Cox/√(1+2Cox²(Vg−Vfb)/(q·Na·εs))、
 *               強反転（高周波）で Cmin に張り付く。Wdmax = √(4εs·φF/(q·Na))、φF = Vt·ln(Na/ni)
 *
 * 定数は 300K・Si の教科書値: Vt=25.852mV、ni=1×10¹⁰ cm⁻³、εs=11.7ε₀、εox=3.9ε₀。
 * 【モデルの外】ダイオードの並列抵抗と高注入、MOSFET の移動度劣化と −Vd²/2、
 * C-V の界面準位・少数キャリア応答（低周波C-V）・多結晶Si空乏は入れていない。
 */
(function (global) {
  'use strict';
  var CL = global.CL || (global.CL = {});

  var QEL = 1.602176634e-19;
  var VT = 0.025852;              /* kT/q at 300K [V] */
  var NI = 1e10;                  /* Si の真性キャリア密度 [cm⁻³] */
  var EPS_S = 1.035e-12;          /* Si の誘電率 [F/cm] */
  var EPS_OX = 3.45e-13;          /* SiO₂ の誘電率 [F/cm] */

  /* 謎の素子（真の値）。採点はこれと比べる */
  var DEV = {
    dio: { is: 2e-13, n: 1.36, rs: 4.7 },              /* [A], [-], [Ω] */
    mos: { vth: 0.62, kwl: 3.2e-4, ss: 92, vd: 0.05 }, /* [V], [A/V²], [mV/dec], [V] */
    cap: { tox: 4.2, na: 3e17, vfb: -0.9 }             /* [nm], [cm⁻³], [V] */
  };

  /* 答案の欄（あなたの読み）。既定はどれも外れている */
  function defaults() {
    return {
      nfit: 1.0, isfit: 1e-15, rsfit: 0.1,
      vthfit: 0.3, kwlfit: 1e-4, ssfit: 60,
      toxfit: 1.0, nafit: 1e16, vfbfit: 0
    };
  }

  /* ---- ダイオード: I を二分法で解く（Rs で電流が減る側にしか動かないので上限は理想電流） ---- */
  function diodeI(v, dev) {
    dev = dev || DEV.dio;
    var nvt = dev.n * VT;
    var ideal = dev.is * (Math.exp(v / nvt) - 1);
    if (ideal <= 0) return ideal;
    var lo = 0, hi = ideal, i, f, k;
    for (k = 0; k < 200; k++) {
      i = (lo + hi) / 2;
      f = dev.is * (Math.exp((v - i * dev.rs) / nvt) - 1) - i;
      if (f > 0) lo = i; else hi = i;
    }
    return (lo + hi) / 2;
  }

  /* ---- MOSFET: 弱反転↔強反転をつなぐ ζ 補間 ---- */
  function mosId(vg, dev) {
    dev = dev || DEV.mos;
    var m = dev.ss / (1000 * VT * Math.LN10);
    var x = (vg - dev.vth) / (m * VT);
    var zeta = m * VT * (x > 40 ? x : Math.log(1 + Math.exp(x)));
    return dev.kwl * dev.vd * zeta;
  }

  /* ---- MOS 容量（高周波・理想） ---- */
  function coxOf(dev) { dev = dev || DEV.cap; return EPS_OX / (dev.tox * 1e-7); }        /* F/cm² */
  function phifOf(na) { return VT * Math.log(na / NI); }
  function wdmaxOf(dev) {
    dev = dev || DEV.cap;
    return Math.sqrt(4 * EPS_S * phifOf(dev.na) / (QEL * dev.na));                        /* cm */
  }
  function cminOf(dev) {
    dev = dev || DEV.cap;
    var cox = coxOf(dev), cd = EPS_S / wdmaxOf(dev);
    return cox * cd / (cox + cd);
  }
  function mosC(vg, dev) {
    dev = dev || DEV.cap;
    var cox = coxOf(dev);
    if (vg <= dev.vfb) return cox;
    var cdep = cox / Math.sqrt(1 + 2 * cox * cox * (vg - dev.vfb) / (QEL * dev.na * EPS_S));
    return Math.max(cdep, cminOf(dev));
  }

  /* ---- 測定表（画面とテストが同じものを見る） ---- */
  function tables() {
    var dio = [], mos = [], cv = [], v;
    for (v = 0.30; v <= 0.901; v += 0.05) dio.push({ v: +v.toFixed(2), i: diodeI(+v.toFixed(2)) });
    for (v = 0.2; v <= 1.401; v += 0.1) mos.push({ vg: +v.toFixed(1), id: mosId(+v.toFixed(1)) });
    for (v = -2; v <= 2.001; v += 0.25) cv.push({ vg: +v.toFixed(2), c: mosC(+v.toFixed(2)) });
    return { dio: dio, mos: mos, cv: cv };
  }

  CL.char = {
    QEL: QEL, VT: VT, NI: NI, EPS_S: EPS_S, EPS_OX: EPS_OX,
    DEV: DEV, defaults: defaults,
    diodeI: diodeI, mosId: mosId, mosC: mosC,
    coxOf: coxOf, cminOf: cminOf, wdmaxOf: wdmaxOf, phifOf: phifOf,
    tables: tables
  };
})(typeof window !== 'undefined' ? window : globalThis);
